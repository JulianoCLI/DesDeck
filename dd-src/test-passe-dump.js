#!/usr/bin/env node
/**
 * Despeja INTEIROS os pacotes que o servidor manda sozinho e que podem ser o
 * "passe": metas, selos, depot (descobertos por test-passe-campos.js, que
 * provou que 'passe.info' e companhia nao existem).
 *
 * NAO MUTA A CONTA: sendCommand e barrado por completo, menos o pong. Nem
 * pedidos de leitura sao mandados aqui - estes pacotes chegam sozinhos no
 * welcome, entao basta conectar e ouvir.
 *
 * Uso: .\node_modules\electron\dist\electron.exe test-passe-dump.js [particao]
 */
'use strict';
const { app, session } = require('electron');
const path = require('path');
const fs = require('fs');

const DATA_DIR = require('./perfil-real').usar();
const SAIDA = path.join(__dirname, 'passe-dump.txt');
const out = [];
const log = (...a) => { const t = a.join(' '); out.push(t); console.log(t); try { fs.writeFileSync(SAIDA, out.join('\n') + '\n'); } catch {} };

const { SESSION_COOKIE } = require('./src/headless/cookies');
const ALVO = ['metas', 'selos', 'depot', 'welcome'];

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
  if (!todas.length) { log('nenhuma conta com sessao salva'); return fim(1); }
  const partition = process.argv[2] || todas[0];
  log(`usando: ${partition}\n`);

  const { DigiiIdleHeadlessClient } = require('./src/headless/client');
  const c = new DigiiIdleHeadlessClient('passe', partition, { name: 'passe-dump' });

  // Nada sai daqui a nao ser o pong.
  const real = c.sendCommand.bind(c);
  c.sendCommand = (t, d) => (t === 'pong' || t === 'ping' ? real(t, d) : (log(`[BARRADO] ${t}`), true));

  const pegos = new Map();
  const orig = c.onMessage.bind(c);
  c.onMessage = (ev) => {
    try { const m = JSON.parse(ev.data); if (m && ALVO.includes(m.t)) pegos.set(m.t, m); } catch {}
    return orig(ev);
  };

  await new Promise((r) => {
    let f = 0; const go = () => { if (!f++) r(); };
    c.on('update', go); c.on('error', (m) => { log('erro: ' + m); go(); });
    setTimeout(go, 30000); c.connect();
  });
  if (!c.connected) { log('nao conectou'); return fim(1); }
  log(`conectado: ${c.state.nick} | nivel ${c.state.nivel}\n`);
  await new Promise((r) => setTimeout(r, 12000));

  for (const t of ALVO) {
    const m = pegos.get(t);
    log(`\n${'='.repeat(60)}\n=== PACOTE "${t}" ===\n${'='.repeat(60)}`);
    if (!m) { log('  nao chegou'); continue; }
    const txt = JSON.stringify(m, null, 2);
    log(txt.length > 24000 ? txt.slice(0, 24000) + '\n...(cortado)' : txt);
  }

  log(`\nrelatorio: ${SAIDA}`);
  try { c.disconnect(); } catch {}
  fim(0);
}
function fim(c) { setTimeout(() => app.exit(c), 400); }
main().catch((e) => { log('FATAL: ' + (e.stack || e)); fim(1); });
