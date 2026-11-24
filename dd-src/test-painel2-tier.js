#!/usr/bin/env node
/**
 * Prova as duas coisas que o probe anterior deixou em aberto, em conta real:
 *
 *  A. O TIER do historico de ovos. O probe 1 mostrou que a entrada traz
 *     ovo:"Rookie" - que e o ESTAGIO, nao a letra. A letra (D..SSS) que o
 *     usuario quer filtrar (S, SS, SSS) NAO vem do servidor: o cliente a
 *     calcula com letraOvo(). O repo ja tem esse calculo portado em
 *     src/headless/ovo-tier.js, mas ele nunca foi exercitado contra entradas de
 *     HISTORICO (so contra ovos da bolsa). Aqui ele roda nos 60 ovos reais.
 *     Se isto falhar, os filtros S/SS/SSS do painel novo mostrariam '?'.
 *
 *  B. A chocadeira e os labs. 'chocadeira' e 'capOvos' aparecem no estado
 *     (campo de topo), e o pedido fala de "Ovo Chocado" e "Labs disponiveis".
 *     'lab.info' e um pedido de LEITURA - e o mesmo que a ferramenta de
 *     labirinto usa para ler o lobby; nao inscreve nem comeca nada.
 *
 * Unico comando liberado: lab.info (leitura). Todo o resto e barrado.
 *
 * Uso: .\node_modules\electron\dist\electron.exe test-painel2-tier.js <particao>
 */
'use strict';
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

require('./perfil-real').usar();
const SAIDA = path.join(__dirname, 'painel2-tier.txt');
const out = [];
const log = (...a) => { const t = a.join(' '); out.push(t); console.log(t); try { fs.writeFileSync(SAIDA, out.join('\n') + '\n'); } catch {} };

const BASE = 'https://digiidle.com';
const PERMITIDO = new Set(['ping', 'pong', 'lab.info']);

async function baixaJson(u) {
  const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error(`${r.status} ${u}`);
  return r.json();
}

async function main() {
  await app.whenReady();
  const partition = process.argv[2];
  if (!partition) { log('uso: test-painel2-tier.js <particao>'); return fim(1); }

  const { DigiiIdleHeadlessClient } = require('./src/headless/client');
  const c = new DigiiIdleHeadlessClient('painel2t', partition, { name: 'painel2t' });

  const realSend = c.send.bind(c);
  c.send = (o) => (o && PERMITIDO.has(o.t) ? realSend(o) : (log(`[BARRADO] ${o && o.t}`), true));
  c.sendCommand = (t, d) => (PERMITIDO.has(t) ? realSend({ t, ...d }) : (log(`[BARRADO] ${t}`), true));

  let welcome = null;
  let lab = null;
  const orig = c.onMessage.bind(c);
  c.onMessage = (ev) => {
    try {
      const m = JSON.parse(ev.data);
      if (m && m.t === 'welcome' && !welcome) welcome = m;
      if (m && m.t === 'lab' && !lab) lab = m;
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

  // lab.info: leitura do lobby, o mesmo pedido da ferramenta de labirinto.
  realSend({ t: 'lab.info' });
  await new Promise((r) => setTimeout(r, 8000));

  const sep = (t) => log(`\n${'='.repeat(64)}\n${t}\n${'='.repeat(64)}`);

  // ---- A. o tier dos 60 ovos reais
  sep('A. TIER DO HISTORICO (letraOvo nas 60 entradas reais)');
  const hist = (welcome && welcome.historico) || [];
  log(`  entradas: ${hist.length}`);
  if (hist.length) {
    const [especies, itens] = await Promise.all([
      baixaJson(`${BASE}/shared/especies.json`),
      baixaJson(`${BASE}/shared/itens.json`),
    ]);
    const { criarTierOvo } = require('./src/headless/ovo-tier');
    const { letraOvo, notaOvo } = criarTierOvo(especies, itens);

    const conta = new Map();
    const falhas = [];
    for (const c2 of hist) {
      let letra;
      try { letra = c2.ovo ? letraOvo(c2) : '(nao-ovo)'; } catch (e) { letra = 'ERRO:' + e.message; }
      conta.set(letra, (conta.get(letra) || 0) + 1);
      if (letra === '?' || String(letra).startsWith('ERRO')) falhas.push(c2);
    }
    log('\n  distribuicao por letra:');
    for (const [l, n] of [...conta].sort()) log(`    ${String(l).padEnd(10)} ${n}`);
    log(`\n  sem letra ('?' ou erro): ${falhas.length}`);
    if (falhas.length) log(`    exemplo: ${JSON.stringify(falhas[0])}`);

    log('\n  amostra (5), com nota e potencia:');
    for (const c2 of hist.slice(0, 5)) {
      log(`    ${String(c2.especie).padEnd(16)} ovo=${String(c2.ovo).padEnd(8)} P${c2.potencia} shiny=${c2.shiny} -> tier ${letraOvo(c2)} (nota ${notaOvo(c2)})`);
    }
    log('\n  => se "sem letra" for 0, os filtros S/SS/SSS do painel sao viaveis');
  }

  // ---- B. chocadeira, capOvos e labs
  sep('B. CHOCADEIRA / capOvos (o "Ovo Chocado")');
  const E = c.state;
  // O client.js nao guarda estes campos: vamos ao pacote cru guardado no welcome?
  // Nao - 'chocadeira' vem no 'estado'. Reintercepta um 'estado' inteiro:
  const estado = await new Promise((r) => {
    const o2 = c.onMessage.bind(c);
    let done = false;
    c.onMessage = (ev) => {
      try { const m = JSON.parse(ev.data); if (m && m.t === 'estado' && !done) { done = true; r(m); } } catch {}
      return o2(ev);
    };
    setTimeout(() => { if (!done) { done = true; r(null); } }, 20000);
  });
  if (!estado) log('  nenhum estado novo chegou');
  else {
    log(`  capOvos    = ${JSON.stringify(estado.capOvos)}`);
    log(`  chocadeira = ${JSON.stringify(estado.chocadeira, null, 2)}`);
  }

  sep('C. LABIRINTO (lab.info)');
  if (!lab) log('  pacote "lab" nao chegou (conta sem guild, ou lobby fechado)');
  else {
    log(`  campos: ${Object.keys(lab).sort().join(', ')}`);
    log(`  bauHoje = ${lab.bauHoje}`);
    log(`  cfg.bauPorDia = ${lab.cfg && lab.cfg.bauPorDia}`);
    const faltam = (lab.cfg?.bauPorDia || 0) - (lab.bauHoje || 0);
    log(`  => LABS DISPONIVEIS HOJE = ${faltam}`);
    log(`\n  lab inteiro:\n${JSON.stringify(lab, null, 2).slice(0, 2500)}`);
  }

  log(`\nrelatorio: ${SAIDA}`);
  try { c.disconnect(); } catch {}
  fim(0);
}
function fim(c) { setTimeout(() => app.exit(c), 400); }
main().catch((e) => { log('FATAL: ' + (e.stack || e)); fim(1); });
