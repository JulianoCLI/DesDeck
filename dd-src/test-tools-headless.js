#!/usr/bin/env node
/**
 * Verifica se as 4 ferramentas headless realmente AGEM numa conta real, e com
 * valores sãos.
 *
 * NAO MUTA A CONTA: sendCommand e substituido por um espiao que registra as
 * tentativas em vez de enviar. Nenhum scanner, bit ou ovo e gasto.
 *
 * Uso: .\node_modules\electron\dist\electron.exe test-tools-headless.js <login> <senha> [segundos]
 */
const { app, session, net } = require('electron');
const path = require('path');
const fs = require('fs');

// O perfil REAL do app, nao um nome chutado (ver perfil-real.js).
require('./perfil-real').usar();

const SAIDA = path.join(__dirname, 'tools-report.txt');
const linhas = [];
const log = (...a) => { linhas.push(a.join(' ')); try { fs.writeFileSync(SAIDA, linhas.join('\n') + '\n'); } catch { /* ignora */ } };

const [login, senha, segArg] = process.argv.slice(2);
const DURACAO_MS = (Number(segArg) || 120) * 1000;
const partition = 'persist:headless-test';

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
  log('=== VERIFICACAO DAS FERRAMENTAS HEADLESS (pos-conserto) ===');
  log('(modo seguro: comandos sao registrados, nao enviados)\n');

  const ses = session.fromPartition(partition);
  const json = JSON.parse(await postLogin(ses));
  if (!json.ok) { log('login falhou'); return finish(1); }
  log(`login ok: ${json.conta.nick}\n`);

  const { DigiiIdleHeadlessClient } = require('./src/headless/client');
  const client = new DigiiIdleHeadlessClient(0, partition, { name: login });

  // O espiao. 'offline.cfg' e leitura (o Mapa do jogo pede a mesma coisa), entao
  // esse passa de verdade: sem ele a ferramenta de hunt nao teria a lista.
  const enviados = [];
  const real = client.sendCommand.bind(client);
  client.sendCommand = (type, data) => {
    if (type === 'offline.cfg') return real(type, data);
    enviados.push({ type, data, em: Date.now() });
    log(`  >>> ${type} ${JSON.stringify(data)}`);
    return true;
  };

  let mortes = 0;
  client.on('corpo', () => { mortes++; });

  await new Promise((res) => {
    client.on('update', () => res());
    client.on('error', (m) => { log('erro: ' + m); res(); });
    client.connect();
  });

  const st = client.state;
  log(`estado: nivel ${st.nivel}, ${st.bits} bits, local ${st.local}`);
  log(`huntSlug=${JSON.stringify(st.huntSlug)}  vip=${st.vip} (vipAte=${st.vipAte})  travaSaidaAte=${st.travaSaidaAte}`);
  log(`ovos no estado: ${(st.ovos || []).length}\n`);

  // Config realista. O refill pede um maximo alto de proposito: a pergunta e se
  // ele respeita o saldo, nao se ele compra.
  log('ligando as 4 ferramentas...');
  client.startTool('scan', { scanners: ['scanner-ultra', 'scanner-basico'], soSemVip: true, maxPorMin: 0 });
  // Regra realista: repor um punhado quando faltar. Com o espiao a compra nunca
  // se confirma, entao o que medimos e se ele espera a confirmacao antes de
  // insistir (o controle 'pendente'), nao se ele compra para sempre.
  const temUltra = (st.itens || {})['scanner-ultra'] || 0;
  client.startTool('refill', { regras: [{ item: 'scanner-ultra', min: temUltra + 10, max: temUltra + 60 }], reservaBits: 0, intervaloSec: 10, parcial: true });
  client.startTool('hunt', { intervaloMin: 1, soTranquilas: true, ganhoMin: 0 });
  // Tiers padrao de proposito: um ovo fora de D/C/B/A NAO pode ser vendido.
  client.startTool('eggs', { tiers: ['D', 'C', 'B', 'A'], potencias: [1, 2, 3], intervaloMin: 1 });
  log(`ativas: ${[...client.tools.keys()].join(', ')}\n`);

  log(`observando ${DURACAO_MS / 1000}s...\n`);
  await new Promise((res) => setTimeout(res, DURACAO_MS));

  const porTipo = {};
  for (const e of enviados) porTipo[e.type] = (porTipo[e.type] || 0) + 1;

  log('\n=== RESULTADO ===');
  log(`mortes de inimigo (oportunidades de scan): ${mortes}`);
  log(`comandos tentados: ${enviados.length}`);
  for (const [t, n] of Object.entries(porTipo)) log(`  ${t}: ${n}`);
  log('');

  const E = client.state;
  const scans = enviados.filter((e) => e.type === 'ball.throw');
  log(`scan   : ${scans.length ? 'AGIU' : 'NAO AGIU'} - ${scans.length} scans em ${mortes} mortes`);
  const semCorpo = scans.filter((e) => !e.data.corpo || !e.data.scanner).length;
  const repetidos = new Set(scans.map((e) => e.data.corpo)).size !== scans.length;
  log(`         comandos malformados: ${semCorpo} | corpo repetido: ${repetidos ? 'SIM (BUG)' : 'nao'}`);

  const compras = enviados.filter((e) => e.type === 'market.comprar');
  log(`refill : ${compras.length ? 'AGIU' : 'NAO AGIU'} - ${compras.length} compras`);
  if (compras.length) {
    const { precos } = require('./src/headless/catalogo');
    const p = await precos();
    for (const c of compras.slice(0, 3)) {
      const custo = c.data.qtd * (p[c.data.item] || 0);
      log(`         ${c.data.qtd}x ${c.data.item} = ${custo} bits (saldo era ~${E.bits}) ${custo <= E.bits ? 'OK' : '<-- ACIMA DO SALDO'}`);
    }
    // Com o espiao a compra nunca se confirma; o 'pendente' espera 15s e desiste.
    // Entao o esperado e ~1 tentativa a cada 15s, nao uma a cada volta do laco.
    const esperadoMax = Math.ceil(DURACAO_MS / 15000) + 1;
    log(`         ritmo: ${compras.length} em ${DURACAO_MS / 1000}s (teto com 'pendente': ${esperadoMax}) ${compras.length <= esperadoMax ? 'OK' : '<-- re-disparando sem esperar confirmacao'}`);
  }

  const hunts = enviados.filter((e) => e.type === 'hunt.select');
  log(`hunt   : ${hunts.length ? 'AGIU ' + JSON.stringify(hunts[0].data) : 'nao trocou'}`);
  log(`         offCfg recebido: ${E.offCfg ? (E.offCfg.hunts || []).length + ' hunts' : 'NAO'}`);
  // Qual guarda barrou? Sem isto, "nao trocou" e ambiguo entre bug e acerto.
  const trava = E.travaSaidaAte && E.travaSaidaAte > Date.now();
  log(`         guardas: local=${E.local} ativoId=${E.ativoId || 'NENHUM'} travaSaida=${trava ? 'ATIVA (faltam ' + Math.round((E.travaSaidaAte - Date.now()) / 60000) + ' min) -> nao pode trocar, correto' : 'livre'}`);
  if (E.offCfg && !trava) {
    const { ilhaPorSlug } = require('./src/headless/catalogo');
    const ilhas = await ilhaPorSlug();
    const { ToolHunt } = require('./src/headless/tools');
    const th = new ToolHunt(client, {});
    const sug = th.sugerida((E.offCfg.hunts || []).filter((h) => ilhas[h.slug] !== 'halloween'));
    log(`         recomendada: ${sug ? sug.slug + ' (perigo ' + sug.perigo + ')' : 'nenhuma'} | atual: ${E.huntSlug} -> ${sug && sug.slug === E.huntSlug ? 'ja na melhor, correto' : 'deveria ter trocado'}`);
  }

  const vendas = enviados.filter((e) => e.type === 'ovo.vender');
  log(`eggs   : ${vendas.length ? 'AGIU' : 'nao vendeu'}`);
  // A checagem que importa: todo ovo vendido tem que estar nos tiers pedidos.
  if (vendas.length) {
    const { tierOvo } = require('./src/headless/catalogo');
    const { letraOvo } = await tierOvo();
    const porId = new Map((E.ovos || []).map((o) => [o.id, o]));
    const ids = vendas.flatMap((v) => v.data.ids);
    const fora = [];
    for (const id of ids) {
      const o = porId.get(id);
      if (!o) continue;
      const t = letraOvo(o);
      if (!['D', 'C', 'B', 'A'].includes(t)) fora.push(`${id}=${t}`);
      else log(`         ovo ${id}: tier ${t} (permitido)`);
    }
    log(fora.length ? `         <-- BUG: vendeu fora do filtro: ${fora.join(', ')}` : '         nenhum ovo fora do filtro');
  } else {
    const { tierOvo } = require('./src/headless/catalogo');
    const { letraOvo } = await tierOvo();
    for (const o of (E.ovos || [])) log(`         ovo ${o.id}: tier ${letraOvo(o)}, data=${o.data}, pot=${o.potencia} (nao vendido)`);
  }

  try { client.disconnect(); } catch { /* ignora */ }
  finish(0);
}

function finish(c) { setTimeout(() => app.exit(c), 400); }
main().catch((e) => { log('FATAL: ' + ((e && e.stack) || e)); finish(1); });
