'use strict';
// Testa a trava de proxy de verdade, no Electron, contra um proxy HTTP local.
//
//   npx electron test-proxy-guard.js
//
// O que e verificado:
//   1. proxy so com host:port (sem user/pass) REALMENTE sai pelo proxy
//      (era o bug: caia para direto devolvendo true);
//   2. particao armada e sem proxy aplicado nao deixa nada passar;
//   3. clear() volta para direto;
//   4. proxy com usuario e senha responde ao 407;
//   5. proxy que nao existe falha fechado (nao cai para direto);
//   6. catalogo.js/sprites.js recusam pedido sem particao;
//   7. o agent do headless sai pelo proxy.

const { app, session, net } = require('electron');
const http = require('http');

let falhas = 0;
const ok = (b, t) => { console.log(`${b ? '  ok  ' : ' FALHA'} ${t}`); if (!b) falhas++; };

// ----------------------------------------------------- proxy HTTP de mentira
// Conta os pedidos que passam por ele e responde no lugar do destino, para
// distinguir "saiu pelo proxy" de "saiu direto".
let vistos = [];
let exigirAuth = false;
let proxyPort = 0;

function subirProxy() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      if (exigirAuth && !req.headers['proxy-authorization']) {
        res.writeHead(407, { 'Proxy-Authenticate': 'Basic realm="x"' });
        res.end();
        return;
      }
      vistos.push({ url: req.url, auth: req.headers['proxy-authorization'] || null });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ip: '9.9.9.9', via: 'proxy' }));
    });
    // CONNECT (https pelo proxy): responde 200 e liga os dois lados. Aqui nao
    // precisamos tunelar de verdade, so registrar que passou.
    srv.on('connect', (req, socket) => {
      vistos.push({ connect: req.url, auth: req.headers['proxy-authorization'] || null });
      socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
    });
    srv.listen(0, '127.0.0.1', () => { proxyPort = srv.address().port; resolve(srv); });
  });
}

// Servidor "real", para provar quando algo saiu DIRETO (sem proxy).
let diretos = 0;
function subirDestino() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      diretos++;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ip: '1.1.1.1', via: 'direto' }));
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

function pegar(ses, url) {
  return new Promise((resolve) => {
    const req = net.request({ url, session: ses });
    let body = '';
    const t = setTimeout(() => { req.abort(); resolve({ erro: 'timeout' }); }, 5000);
    req.on('login', (_a, cb) => cb('u', 'p'));
    req.on('response', (res) => {
      res.on('data', (c) => { body += c; });
      res.on('end', () => { clearTimeout(t); resolve({ status: res.statusCode, body }); });
    });
    req.on('error', (err) => { clearTimeout(t); resolve({ erro: err.message }); });
    req.end();
  });
}

app.whenReady().then(async () => {
  const guard = require('./src/proxy-guard');
  const proxySrv = await subirProxy();
  const destinoSrv = await subirDestino();
  const destinoPort = destinoSrv.address().port;
  const alvo = `http://127.0.0.1:${destinoPort}/alvo`;

  console.log(`\nproxy falso em 127.0.0.1:${proxyPort}, destino em 127.0.0.1:${destinoPort}\n`);

  // -------------------------------------------------- 1. proxy sem auth
  console.log('1) proxy so com host:port (sem usuario e senha)');
  {
    vistos = []; diretos = 0;
    const ses = session.fromPartition('persist:acc-teste1');
    const aplicou = await guard.apply(ses, { host: '127.0.0.1', port: proxyPort, user: '', pass: '' });
    ok(aplicou === true, 'apply() devolveu true');
    const r = await pegar(ses, alvo);
    ok(vistos.length === 1, `o pedido passou pelo proxy (passaram ${vistos.length})`);
    ok(diretos === 0, `nada saiu direto (sairam ${diretos})`);
    ok(/proxy/.test(r.body || ''), 'a resposta veio do proxy');
  }

  // -------------------------------------------------- 2. armada e nao liberada
  console.log('\n2) particao armada, proxy ainda nao aplicado');
  {
    vistos = []; diretos = 0;
    const ses = session.fromPartition('persist:acc-teste2');
    guard.arm(ses);
    const r = await pegar(ses, alvo);
    ok(!!r.erro, `o pedido foi cancelado (${r.erro || 'passou!'})`);
    ok(diretos === 0, `nada chegou ao destino (chegaram ${diretos})`);
  }

  // -------------------------------------------------- 3. clear volta ao direto
  console.log('\n3) clear() libera e volta para conexao direta');
  {
    vistos = []; diretos = 0;
    const ses = session.fromPartition('persist:acc-teste3');
    guard.arm(ses);
    await guard.clear(ses);
    const r = await pegar(ses, alvo);
    ok(diretos === 1, `saiu direto, como pedido (${diretos})`);
    ok(vistos.length === 0, 'nao passou pelo proxy');
    ok(/direto/.test(r.body || ''), 'a resposta veio do destino');
  }

  // -------------------------------------------------- 4. proxy com auth (407)
  console.log('\n4) proxy com usuario e senha');
  {
    vistos = []; diretos = 0; exigirAuth = true;
    const ses = session.fromPartition('persist:acc-teste4');
    await guard.apply(ses, { host: '127.0.0.1', port: proxyPort, user: 'u', pass: 'p' });
    const c = guard.creds(ses);
    ok(!!c && c.user === 'u', 'as credenciais ficaram guardadas para o 407');
    const r = await pegar(ses, alvo);
    ok(vistos.some((v) => v.auth), 'o proxy recebeu Proxy-Authorization');
    ok(diretos === 0, `nada saiu direto (${diretos})`);
    exigirAuth = false;
  }

  // -------------------------------------------------- 5. proxy morto
  console.log('\n5) proxy que nao responde: falha fechado');
  {
    vistos = []; diretos = 0;
    const ses = session.fromPartition('persist:acc-teste5');
    // Porta fechada de proposito.
    await guard.apply(ses, { host: '127.0.0.1', port: 1, user: '', pass: '' });
    const r = await pegar(ses, alvo);
    ok(!!r.erro, `o pedido falhou em vez de cair para direto (${r.erro || 'passou!'})`);
    ok(diretos === 0, `o destino nao foi alcancado pelo IP real (${diretos})`);
  }

  // -------------------------------------------------- 6. rede.js
  // Catalogos sao publicos: sem conta em headless eles saem por uma sessao
  // propria (nunca a do app). Com uma conta proxiada, passam a sair pelo proxy
  // dela - e esse era o vazamento: net.request(string) usava a sessao PADRAO,
  // que nunca tem proxy.
  console.log('\n6) catalogo/sprites seguem a conta');
  {
    const rede = require('./src/headless/rede');
    vistos = []; diretos = 0;
    rede.esquecerParticao();
    await rede.buscar(alvo).catch(() => {});
    ok(diretos === 1 && vistos.length === 0, `sem conta em headless: sai direto (direto=${diretos})`);

    vistos = []; diretos = 0;
    const ses = session.fromPartition('persist:acc-teste6');
    await guard.apply(ses, { host: '127.0.0.1', port: proxyPort, user: '', pass: '' });
    rede.usarParticao('persist:acc-teste6');
    await rede.buscar(alvo).catch(() => {});
    ok(vistos.length === 1 && diretos === 0, `com conta proxiada: sai pelo proxy (proxy=${vistos.length} direto=${diretos})`);

    let recusou = false;
    try { await rede.buscar(alvo, 'persist:coisa-errada'); } catch (err) { recusou = /partição inválida/.test(err.message); }
    ok(recusou, 'partição fora do padrao e recusada');
    rede.esquecerParticao();
  }

  // -------------------------------------------------- 7. agent do headless
  console.log('\n7) o WebSocket do headless pelo proxy');
  {
    vistos = [];
    let agentOk = false;
    try {
      const { HttpsProxyAgent } = require('https-proxy-agent');
      const ag = new HttpsProxyAgent(`http://u:p@127.0.0.1:${proxyPort}`);
      agentOk = !!ag;
    } catch (err) {
      console.log('   erro ao criar o agent:', err.message);
    }
    ok(agentOk, 'https-proxy-agent esta instalado e cria o agent');

    // Prova que o agent realmente manda o trafego para o proxy: um https pelo
    // agent tem que virar um CONNECT no proxy falso.
    if (agentOk) {
      const { HttpsProxyAgent } = require('https-proxy-agent');
      const https = require('https');
      await new Promise((resolve) => {
        const req = https.get({
          host: 'digiidle.com', path: '/', agent: new HttpsProxyAgent(`http://127.0.0.1:${proxyPort}`), timeout: 5000,
        }, (res) => { res.resume(); resolve(); });
        req.on('error', () => resolve());
        req.on('timeout', () => { req.destroy(); resolve(); });
      });
      ok(vistos.some((v) => v.connect), `o agent abriu CONNECT no proxy (${JSON.stringify(vistos[0] || null)})`);
    }
  }

  proxySrv.close();
  destinoSrv.close();
  console.log(falhas ? `\n${falhas} falha(s)\n` : '\ntudo ok\n');
  app.exit(falhas ? 1 : 0);
});
