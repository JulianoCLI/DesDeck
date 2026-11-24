#!/usr/bin/env node
/**
 * Em CONTA REAL, os campos que o painel novo quer mostrar. Confere o que o grep
 * no cliente sugeriu, porque "o cliente le este campo" nao e o mesmo que "o
 * servidor manda este campo para esta conta".
 *
 * NAO MUTA A CONTA: sendCommand e barrado por completo, menos ping/pong. Nada
 * de 'mercado.listar', nada de resgate - so escuta o que chega sozinho.
 *
 * O que precisa ficar provado aqui:
 *   1. estado.sessao tem 'caca', 'xpTamer', 'bits', 'abates', 'capturas',
 *      'gasto', 'achados', 'usados', 'shinyPegos'? (as taxas /h saem daqui:
 *      o servidor NAO manda xph/bitsph prontos - o cliente divide por msCaca)
 *   2. D-Dol e estado.gemas (o grep diz que 'diamantes' e DCoin, outra moeda)
 *   3. welcome.historico existe e com que campos (o Historico de Ovos)
 *   4. quais 'log'.tipo chegam de verdade, e com que texto
 *   5. 'toast' e o canal do ovo chocado (o cliente casa /^O ovo chocou/)
 *   6. 'captura' traz m.historico e m.ovo.potencia/shiny
 *   7. lab.bauHoje / lab.cfg.bauPorDia (os labs que faltam no dia)
 *   8. estado.huntSlug + o tempo de caca
 *
 * Uso: .\node_modules\electron\dist\electron.exe test-painel2-campos.js [particao]
 */
'use strict';
const { app, session } = require('electron');
const path = require('path');
const fs = require('fs');

const DATA_DIR = require('./perfil-real').usar();
const SAIDA = path.join(__dirname, 'painel2-campos.txt');
const out = [];
const log = (...a) => { const t = a.join(' '); out.push(t); console.log(t); try { fs.writeFileSync(SAIDA, out.join('\n') + '\n'); } catch {} };

const { SESSION_COOKIE } = require('./src/headless/cookies');

// Quanto tempo escutar. Captura de ovo e venda sao raras: 90 s nao garante ver
// uma. O que importa e nao AFIRMAR que nao existe por nao ter visto.
const ESCUTA_MS = 90000;

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

const tipos = (o) => Object.entries(o || {})
  .map(([k, v]) => `${k}:${Array.isArray(v) ? `array(${v.length})` : v === null ? 'null' : typeof v}`)
  .join(', ');

async function main() {
  await app.whenReady();
  const todas = await particoesComSessao();
  if (!todas.length) { log('nenhuma conta com sessao salva'); return fim(1); }
  const partition = process.argv[2] || todas[0];
  log(`contas com sessao: ${todas.length} | usando: ${partition}\n`);

  const { DigiiIdleHeadlessClient } = require('./src/headless/client');
  const c = new DigiiIdleHeadlessClient('painel2', partition, { name: 'painel2' });

  // Nada sai daqui a nao ser o ping/pong.
  const real = c.sendCommand.bind(c);
  c.sendCommand = (t, d) => (t === 'pong' || t === 'ping' ? real(t, d) : (log(`[BARRADO] ${t}`), true));
  const realSend = c.send.bind(c);
  c.send = (o) => (o && (o.t === 'ping' || o.t === 'pong') ? realSend(o) : (log(`[BARRADO send] ${o && o.t}`), true));

  // Tudo que chega, cru. O roteador do client.js descarta a maior parte: e
  // justamente o descartado que este probe precisa ver.
  const cru = new Map();     // tipo -> 1o pacote inteiro
  const contagem = new Map();
  const logsVistos = [];
  const toasts = [];
  const capturas = [];
  const orig = c.onMessage.bind(c);
  c.onMessage = (ev) => {
    try {
      const m = JSON.parse(ev.data);
      if (m && m.t) {
        contagem.set(m.t, (contagem.get(m.t) || 0) + 1);
        if (!cru.has(m.t)) cru.set(m.t, m);
        if (m.t === 'log') logsVistos.push({ tipo: m.tipo || '(sem tipo)', txt: m.txt });
        if (m.t === 'toast') toasts.push(m.txt);
        if (m.t === 'captura') capturas.push(m);
      }
    } catch {}
    return orig(ev);
  };

  await new Promise((r) => {
    let f = 0; const go = () => { if (!f++) r(); };
    c.on('update', go); c.on('error', (m) => { log('erro: ' + m); go(); });
    setTimeout(go, 30000); c.connect();
  });
  if (!c.connected) { log('nao conectou'); return fim(1); }
  log(`conectado: ${c.state.nick} | nivel ${c.state.nivel}\n`);
  log(`escutando ${ESCUTA_MS / 1000}s...\n`);
  await new Promise((r) => setTimeout(r, ESCUTA_MS));

  const E = cru.get('estado');
  const sep = (t) => log(`\n${'='.repeat(64)}\n${t}\n${'='.repeat(64)}`);

  sep('1. estado.sessao (de onde saem XP/h, Bits/h, Kills/h, tempo de caca)');
  if (!E) log('  !! nenhum pacote estado chegou');
  else {
    const s = E.sessao || {};
    log(`  campos: ${tipos(s)}`);
    log(`\n  ${JSON.stringify(s, null, 2)}`);
    log(`\n  caca presente? ${s.caca != null ? `SIM (${s.caca} ms = ${(s.caca / 3600000).toFixed(2)} h)` : 'NAO -> cair para Date.now()-inicio'}`);
    if (s.caca != null && s.caca >= 60000) {
      const h = s.caca / 3600000;
      log(`  => XP Tamer/h  = ${Math.round((s.xpTamer || 0) / h)}`);
      log(`  => Bits/h      = ${Math.round((s.bits || 0) / h)}`);
      log(`  => Kills/h     = ${Math.round((s.abates || 0) / h)}`);
      log(`  => Chocados/h  = ${((s.capturas || 0) / h).toFixed(2)}`);
    } else log('  (menos de 1 min de caca: o proprio jogo mostra "-" nesse caso)');
  }

  sep('2. MOEDAS (qual campo e o D-Dol)');
  if (E) for (const k of ['bits', 'gemas', 'diamantes']) log(`  estado.${k} = ${E[k]}`);
  log('  (o cliente rotula: bits=Bits, gemas=D-Dol, diamantes=DCoin)');

  sep('3. HISTORICO DE OVOS (welcome.historico)');
  const w = cru.get('welcome');
  if (!w) log('  !! welcome nao chegou');
  else {
    const hs = w.historico;
    log(`  welcome.historico: ${Array.isArray(hs) ? `array(${hs.length})` : typeof hs}`);
    if (Array.isArray(hs) && hs.length) {
      log(`  campos de uma entrada: ${tipos(hs[0])}`);
      log(`\n  primeiras 3:\n${JSON.stringify(hs.slice(0, 3), null, 2)}`);
      const comOvo = hs.filter((x) => x && x.ovo);
      log(`\n  entradas com .ovo (tier pronto): ${comOvo.length}/${hs.length}`);
      log(`  valores de .ovo vistos: ${[...new Set(hs.map((x) => x && x.ovo).filter(Boolean))].join(', ') || '(nenhum)'}`);
      log(`  valores de .potencia vistos: ${[...new Set(hs.map((x) => x && x.potencia).filter(Boolean))].sort().join(', ') || '(nenhum)'}`);
      log(`  com .shiny (UX): ${hs.filter((x) => x && x.shiny).length}`);
    }
  }

  sep('4. LOGS (o campo .tipo e o texto reais)');
  log(`  pacotes 'log' recebidos: ${logsVistos.length}`);
  const porTipo = new Map();
  for (const l of logsVistos) {
    if (!porTipo.has(l.tipo)) porTipo.set(l.tipo, []);
    porTipo.get(l.tipo).push(l.txt);
  }
  for (const [tipo, txts] of porTipo) {
    log(`\n  tipo "${tipo}" (${txts.length}):`);
    for (const x of txts.slice(0, 8)) log(`    ${x}`);
  }

  sep('5. TOASTS (o canal do ovo chocado e de avisos)');
  log(`  toasts recebidos: ${toasts.length}`);
  for (const x of toasts.slice(0, 15)) log(`    ${x}`);
  log(`\n  casam /^O ovo chocou/: ${toasts.filter((x) => /^O ovo chocou/.test(x || '')).length}`);

  sep('6. CAPTURA DE OVO (pacote "captura")');
  log(`  capturas recebidas: ${capturas.length}`);
  if (capturas.length) log(JSON.stringify(capturas[0], null, 2).slice(0, 3000));
  else log('  nenhuma nesta janela (sao raras). Campos esperados pelo cliente:');
  log('    m.ok, m.ovo.{potencia,shiny,especie,data}, m.historico, m.esp');

  sep('7. LABIRINTO (baus do dia)');
  const lab = cru.get('lab');
  if (!lab) log('  pacote "lab" nao chega sozinho: o cliente pede "lab.info" (barrado aqui)');
  else log(`  bauHoje=${lab.bauHoje} cfg.bauPorDia=${lab.cfg && lab.cfg.bauPorDia} -> faltam ${(lab.cfg?.bauPorDia || 0) - (lab.bauHoje || 0)}`);

  sep('8. HUNT ATUAL');
  if (E) log(`  huntSlug=${E.huntSlug} local=${E.local} online=${E.online}s`);

  sep('9. TODOS OS PACOTES VISTOS');
  for (const [t, n] of [...contagem].sort((a, b) => b[1] - a[1])) log(`  ${String(t).padEnd(22)} ${n}`);

  sep('10. CAMPOS DE TOPO DO "estado"');
  if (E) log('  ' + Object.keys(E).sort().join(', '));

  log(`\nrelatorio: ${SAIDA}`);
  try { c.disconnect(); } catch {}
  fim(0);
}
function fim(c) { setTimeout(() => app.exit(c), 400); }
main().catch((e) => { log('FATAL: ' + (e.stack || e)); fim(1); });
