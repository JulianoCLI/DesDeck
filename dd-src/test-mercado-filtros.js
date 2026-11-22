#!/usr/bin/env node
/**
 * Separa POTENCIA de ENERGIA, e confere se o tier do ovo da para calcular.
 *
 * O test-mercado-campos.js levantou tres duvidas que mudam o desenho do sniper:
 *
 *  1. 'maisMin: 4' devolveu um ovo com `potencia: 1` e `data: 5`. Ou seja: maisMin
 *     filtra a ENERGIA do ovo (o +N, campo `data`), nao a potencia P1..P5. O "p4+"
 *     do pedido e `potencia`, que no cliente e filtrada por `potencias`. Se eu
 *     trocasse os dois, o sniper compraria a coisa errada.
 *
 *  2. O anuncio NAO traz o tier em letra: `resumo` tem especie, ivs, u, potencia e
 *     data, mas nenhum campo 'tier'/'nota'. O cliente calcula a letra com
 *     ovo-tier.js (criarTierOvo), que depende do catalogo de especies. Entao, para
 *     o filtro "s+", ou o servidor filtra por 'tiers' (e eu confio nele), ou eu
 *     preciso do catalogo. Aqui eu meco as duas coisas.
 *
 *  3. 'tiers' reduziu o total de 1728 para 601, o que indica filtro no servidor.
 *     Confirmo cruzando: pedir 'SSS' e ver se o conjunto e subconjunto de 'S,SS,SSS'.
 *
 * NAO COMPRA NADA: so 'mercado.listar' e liberado.
 *
 * Uso: .\node_modules\electron\dist\electron.exe test-mercado-filtros.js [particao]
 */
'use strict';
const { app, session } = require('electron');
const path = require('path');
const fs = require('fs');

const DATA_DIR = require('./perfil-real').usar();
const SAIDA = path.join(__dirname, 'mercado-filtros.txt');
const out = [];
const log = (...a) => { const t = a.join(' '); out.push(t); console.log(t); try { fs.writeFileSync(SAIDA, out.join('\n') + '\n'); } catch {} };

const { SESSION_COOKIE } = require('./src/headless/cookies');
const particaoPedida = process.argv[2] || null;

async function particoesComSessao() {
  const dir = path.join(DATA_DIR, 'Partitions');
  if (!fs.existsSync(dir)) return [];
  const achadas = [];
  for (const nome of fs.readdirSync(dir)) {
    const part = `persist:${nome}`;
    try {
      const cks = await session.fromPartition(part).cookies.get({ url: 'https://digiidle.com/' });
      if (cks.some((c) => c.name === SESSION_COOKIE)) achadas.push(part);
    } catch {}
  }
  return achadas;
}

async function main() {
  await app.whenReady();
  const todas = await particoesComSessao();
  if (!todas.length) { log('nenhuma conta com sessao.'); return fim(1); }
  const partition = particaoPedida || todas[0];
  log(`usando: ${partition}\n`);

  const { DigiiIdleHeadlessClient } = require('./src/headless/client');
  const c = new DigiiIdleHeadlessClient('mercado', partition, { name: 'mercado-filtros' });
  const real = c.sendCommand.bind(c);
  c.sendCommand = (t, d) => (t === 'mercado.listar' || t === 'ping' || t === 'pong' ? real(t, d) : (log(`[BARRADO] ${t}`), true));

  let ultima = null;
  const orig = c.onMessage.bind(c);
  c.onMessage = (ev) => {
    try { const m = JSON.parse(ev.data); if (m && m.t === 'mercado') ultima = m; } catch {}
    return orig(ev);
  };

  await new Promise((r) => {
    let f = 0; const go = () => { if (!f++) r(); };
    c.on('update', go); c.on('error', (m) => { log('erro: ' + m); go(); });
    setTimeout(go, 30000); c.connect();
  });
  if (!c.connected) { log('nao conectou.'); return fim(1); }
  log(`conectado: ${c.state.nick}\n`);

  const pedir = async (payload) => {
    ultima = null;
    real('mercado.listar', payload);
    for (let i = 0; i < 24 && !ultima; i++) await new Promise((r) => setTimeout(r, 250));
    return ultima;
  };

  // --- 1. potencias x maisMin ---
  log('=== 1. POTENCIA (p4/p5) vs ENERGIA (+N) ===');
  const base = await pedir({ tipo: 'ovo', moeda: '', ordem: 'barato', pagina: 0 });
  log(`  sem filtro:           total=${base?.total}`);
  const dist = (m, campo) => {
    const c2 = {};
    for (const a of m?.lista || []) { const v = a.resumo?.[campo]; c2[v] = (c2[v] || 0) + 1; }
    return Object.entries(c2).sort().map(([k, v]) => `${k}:${v}`).join(' ');
  };
  log(`    potencia na pagina: ${dist(base, 'potencia')}`);
  log(`    data(+N) na pagina: ${dist(base, 'data')}`);

  for (const p of ['4', '5', '4,5']) {
    const m = await pedir({ tipo: 'ovo', moeda: '', potencias: p, ordem: 'barato', pagina: 0 });
    log(`  potencias='${p}':  total=${m?.total}`);
    log(`    potencia na pagina: ${dist(m, 'potencia')}   <== so deve ter ${p}`);
  }
  for (const n of [4, 5]) {
    const m = await pedir({ tipo: 'ovo', moeda: '', maisMin: n, ordem: 'barato', pagina: 0 });
    log(`  maisMin=${n}:        total=${m?.total}`);
    log(`    data(+N) na pagina: ${dist(m, 'data')}   <== so deve ter >=${n}`);
  }

  // --- 2. tiers no servidor ---
  log('\n=== 2. O FILTRO tiers E DO SERVIDOR? ===');
  const ids = async (tiers) => {
    const m = await pedir({ tipo: 'ovo', moeda: '', tiers, ordem: 'barato', pagina: 0 });
    return { total: m?.total, set: new Set((m?.lista || []).map((a) => a.id)) };
  };
  const sss = await ids('SSS');
  const s3 = await ids('S,SS,SSS');
  const todosT = await ids('');
  log(`  tiers=''        total=${todosT.total}`);
  log(`  tiers='S,SS,SSS' total=${s3.total}`);
  log(`  tiers='SSS'      total=${sss.total}`);
  const monot = sss.total <= s3.total && s3.total <= todosT.total;
  log(`  >> monotonico (SSS <= S+ <= todos)? ${monot ? 'SIM' : 'NAO'}`);
  log(`  >> o servidor filtra por tier? ${s3.total < todosT.total ? 'SIM' : 'NAO'}`);

  // --- 3. dá para calcular a letra do tier aqui? ---
  log('\n=== 3. O TIER DA PARA CALCULAR NO CLIENTE? ===');
  log('  (o anuncio traz especie, ivs, u, potencia, data — o que ovo-tier.js pede)');
  const a0 = (s3.set.size ? (await pedir({ tipo: 'ovo', moeda: '', tiers: 'S,SS,SSS', ordem: 'barato', pagina: 0 }))?.lista?.[0] : null);
  if (a0) {
    const r = a0.resumo || {};
    const temTudo = !!(r.especie && r.ivs && r.u);
    log(`  anuncio #${a0.id}: especie=${r.especie} ivs=${JSON.stringify(r.ivs)} u=${JSON.stringify(r.u)} potencia=${r.potencia} data=${r.data}`);
    log(`  >> tem os campos que ovo-tier.js precisa? ${temTudo ? 'SIM' : 'NAO'}`);
    log('  >> mas falta o catalogo de especies (bases) e o ovoConfig, que vem do jogo.');
    log('     Conclusao de desenho: CONFIAR no filtro do servidor (tiers=) em vez de');
    log('     reimplementar a regra — e a mesma decisao do resto do projeto.');
  }

  log(`\nrelatorio: ${SAIDA}`);
  try { c.disconnect(); } catch {}
  fim(0);
}
function fim(c) { setTimeout(() => app.exit(c), 400); }
main().catch((e) => { log('FATAL: ' + (e.stack || e)); fim(1); });
