#!/usr/bin/env node
/**
 * Observa uma conta real para confirmar os fatos que nao dao para verificar
 * offline:
 *   - 'estado' traz mesmo 'local' e 'huntSlug', e o que acontece com huntSlug
 *     quando a conta esta na praca/Hospital;
 *   - o formato real da resposta de 'lab.info' (campos do lobby);
 *   - se a ferramenta de hunt decidiria o retorno correto no estado de agora.
 *
 * NAO MUTA A CONTA. sendCommand e substituido por um espiao: os comandos de
 * leitura ('offline.cfg', 'lab.info', 'pong') passam de verdade, porque e o
 * mesmo que a tela do jogo pede ao abrir. Qualquer comando que MUDE algo
 * (hunt.select, lab.entrar, ball.throw, market.comprar, ovo.vender) e so
 * registrado, nunca enviado.
 *
 * Uso: .\node_modules\electron\dist\electron.exe test-lab-real.js <login> <senha> [segundos]
 */
'use strict';

const { app, session, net } = require('electron');
const path = require('path');
const fs = require('fs');

// O perfil REAL do app, nao um nome chutado (ver perfil-real.js).
require('./perfil-real').usar();

const SAIDA = path.join(__dirname, 'lab-report.txt');
const linhas = [];
const log = (...a) => {
  const t = a.join(' ');
  linhas.push(t);
  console.log(t);
  try { fs.writeFileSync(SAIDA, linhas.join('\n') + '\n'); } catch { /* ignora */ }
};

const [login, senha, segArg] = process.argv.slice(2);
const DURACAO_MS = (Number(segArg) || 90) * 1000;
const partition = 'persist:lab-test';

// Comandos que mudam estado: barrados sempre.
const MUTAM = new Set(['hunt.select', 'lab.entrar', 'lab.sair', 'lab.iniciar', 'lab.chamar', 'lab.voltar', 'lab.dificuldade', 'ball.throw', 'market.comprar', 'ovo.vender']);
// Leituras: o que a propria tela do jogo pede ao abrir.
const LEITURAS = new Set(['offline.cfg', 'lab.info', 'pong', 'ping']);

function postLogin(ses) {
  return new Promise((resolve, reject) => {
    const req = net.request({ method: 'POST', url: 'https://digiidle.com/auth/entrar', session: ses, useSessionCookies: true });
    req.setHeader('Content-Type', 'application/json');
    req.setHeader('Origin', 'https://digiidle.com');
    let body = '';
    req.on('response', (res) => {
      res.on('data', (c) => { body += c.toString('utf8'); });
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.end(JSON.stringify({ login, senha, lembrar: true, lang: 'pt' }));
  });
}

async function main() {
  await app.whenReady();
  log('=== OBSERVACAO EM CONTA REAL (modo seguro) ===');
  log('comandos que mudam algo sao REGISTRADOS, nunca enviados\n');

  const ses = session.fromPartition(partition);
  const json = JSON.parse(await postLogin(ses));
  if (!json.ok) { log('login falhou: ' + (json.mensagem || JSON.stringify(json))); return finish(1); }
  log(`login ok: ${json.conta.nick}\n`);

  const { DigiiIdleHeadlessClient } = require('./src/headless/client');
  const client = new DigiiIdleHeadlessClient('ms1', partition, { name: login });

  const barrados = [];
  const real = client.sendCommand.bind(client);
  client.sendCommand = (type, data) => {
    if (LEITURAS.has(type)) return real(type, data);
    barrados.push({ type, data, em: Date.now() });
    log(`  [BARRADO] ${type} ${JSON.stringify(data || {})}`);
    return true; // a ferramenta segue como se tivesse enviado
  };

  // Escuta crua: queremos o JSON real de lab.info, que nenhum teste offline tem.
  const vistos = {};
  let labInfo = null;
  const wsOrig = client.onMessage.bind(client);
  client.onMessage = (ev) => {
    try {
      const m = JSON.parse(ev.data);
      if (m && m.t) {
        vistos[m.t] = (vistos[m.t] || 0) + 1;
        if (m.t === 'lab.info' || m.t === 'lab') labInfo = m;
        if (m.t === 'lab.mudou' || m.t === 'lab.chamado' || m.t === 'lab.fim') log(`  <<< evento ${m.t}: ${JSON.stringify(m).slice(0, 400)}`);
      }
    } catch { /* ignora */ }
    return wsOrig(ev);
  };

  await new Promise((res) => {
    let feito = false;
    const pronto = () => { if (!feito) { feito = true; res(); } };
    client.on('update', pronto);
    client.on('error', (m) => { log('erro: ' + m); pronto(); });
    setTimeout(pronto, 30000);
    client.connect();
  });

  const st = client.state;
  log('--- ESTADO INICIAL ---');
  log(`nick/nivel : ${st.name} / ${st.nivel}`);
  log(`local      : ${JSON.stringify(st.local)}   <- 'hunt' | 'lab' | 'praca'`);
  log(`huntSlug   : ${JSON.stringify(st.huntSlug)}`);
  log(`ativoId    : ${JSON.stringify(st.ativoId)}`);
  log(`travaSaida : ${st.travaSaidaAte ? new Date(st.travaSaidaAte).toISOString() : 'null'}`);
  log('');

  // O formato real do lobby do Labirinto.
  log('--- lab.info (formato real do servidor) ---');
  real('lab.info', {});
  await new Promise((r) => setTimeout(r, 6000));
  if (!labInfo) {
    log('o servidor nao respondeu lab.info em 6s.');
    log(`(pode ser conta sem guild, ou o nome do pacote de resposta difere)`);
  } else {
    log(JSON.stringify(labInfo, null, 2).slice(0, 2500));
    const L = labInfo;
    log('');
    log(`campos do topo: ${Object.keys(L).join(', ')}`);
    if (L.cfg) log(`cfg: min=${L.cfg.min} max=${L.cfg.max} salas=${L.cfg.salas} duracaoMin=${L.cfg.duracaoMin}`);
    log(`fila: ${Array.isArray(L.fila) ? L.fila.length + ' no lobby' : 'ausente'}`);
    log(`noLobby=${L.noLobby} pronto=${L.pronto} gerente=${L.gerente} corrida=${L.run ? 'SIM' : 'nao'}`);
  }
  log('');

  // A decisao da ferramenta no estado de AGORA, sem deixar que ela aja.
  log('--- DECISAO DA FERRAMENTA DE HUNT (sem agir) ---');
  const { ToolHunt } = require('./src/headless/tools');
  const t = new ToolHunt(client, { intervaloMin: 5, soTranquilas: true, ganhoMin: 0, voltarUltima: true });
  t.start();
  await new Promise((r) => setTimeout(r, 2000));
  log(`memoria ultimaHunt : ${JSON.stringify(t.ultimaHunt)}`);
  log(`alvoDeVolta()      : ${JSON.stringify(t.alvoDeVolta(client.state))}`);
  log(`local agora        : ${client.state.local}`);
  if (client.state.local === 'praca') log('-> a conta esta no Hospital: o passo deve mandar hunt.select para o alvo acima');
  else log('-> a conta nao esta no Hospital: o passo nao deve mandar nada de retorno (correto)');
  log('');
  log(`jitter da conta    : ${t.jitterMs(300000)}ms sobre base de 300000ms`);
  log('');

  log(`--- OBSERVANDO ${DURACAO_MS / 1000}s ---`);
  log('(se quiser provar o retorno de verdade: entre no Labirinto e saia pelo Hospital agora)');
  let ultimoLocal = client.state.local;
  const trocas = [];
  client.on('update', () => {
    const l = client.state.local;
    if (l !== ultimoLocal) {
      const linha = `  local: ${ultimoLocal} -> ${l}   (huntSlug=${JSON.stringify(client.state.huntSlug)}, memoria=${JSON.stringify(t.ultimaHunt)})`;
      log(linha);
      trocas.push({ de: ultimoLocal, para: l, huntSlug: client.state.huntSlug, memoria: t.ultimaHunt });
      ultimoLocal = l;
    }
  });
  await new Promise((r) => setTimeout(r, DURACAO_MS));

  log('');
  log('=== RESUMO ===');
  log(`pacotes recebidos por tipo: ${JSON.stringify(vistos)}`);
  log(`mudancas de local observadas: ${trocas.length}`);
  for (const x of trocas) log(`  ${x.de} -> ${x.para} | huntSlug=${JSON.stringify(x.huntSlug)} memoria=${JSON.stringify(x.memoria)}`);
  log('');
  log(`comandos que a ferramenta TENTOU (e foram barrados): ${barrados.length}`);
  for (const b of barrados) log(`  ${b.type} ${JSON.stringify(b.data)}`);
  const selects = barrados.filter((b) => b.type === 'hunt.select');
  if (selects.length) {
    log('');
    log(`-> a ferramenta tentou voltar para: ${selects.map((s) => s.data.slug).join(', ')}`);
    const esperado = t.alvoDeVolta(client.state);
    log(`-> alvo esperado: ${JSON.stringify(esperado)}`);
  }
  log('');
  log(`memoria final ultimaHunt: ${JSON.stringify(t.ultimaHunt)}`);
  log(`relatorio: ${SAIDA}`);

  try { t.stop(); client.disconnect(); } catch { /* ignora */ }
  finish(0);
}

function finish(c) { setTimeout(() => app.exit(c), 500); }
main().catch((e) => { log('FATAL: ' + ((e && e.stack) || e)); finish(1); });
