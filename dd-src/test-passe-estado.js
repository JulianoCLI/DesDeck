#!/usr/bin/env node
/**
 * Confere, numa conta real, o sub-objeto 'passe' do pacote 'estado'.
 *
 * O cliente do jogo (js/menus.js) le E().passe para decidir o resgate. Este
 * script confirma que o campo existe no socket e mostra os valores, para as
 * guardas do Auto Passe nascerem de dado real e nao de leitura de codigo.
 *
 * NAO MUTA A CONTA: sendCommand e barrado (menos ping/pong). 'passe.resgatar'
 * NAO e enviado aqui - este script so olha.
 *
 * Uso: .\node_modules\electron\dist\electron.exe test-passe-estado.js [particao]
 */
'use strict';
const { app, session } = require('electron');
const path = require('path');
const fs = require('fs');

const DATA_DIR = require('./perfil-real').usar();
const SAIDA = path.join(__dirname, 'passe-estado.txt');
const out = [];
const log = (...a) => { const t = a.join(' '); out.push(t); console.log(t); try { fs.writeFileSync(SAIDA, out.join('\n') + '\n'); } catch {} };

const { SESSION_COOKIE } = require('./src/headless/cookies');

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

// Meia-noite de Brasilia (UTC-3 o ano todo), igual ao novoDiaPasse() do jogo.
function faltaParaVirar() {
  const falta = 864e5 - ((Date.now() - 3 * 36e5) % 864e5);
  const h = Math.floor(falta / 36e5), m = Math.floor((falta % 36e5) / 6e4);
  return `${h}h ${m}min`;
}

async function main() {
  await app.whenReady();
  const todas = await particoesComSessao();
  if (!todas.length) { log('nenhuma conta com sessao salva'); return fim(1); }
  const alvo = process.argv[2] ? [process.argv[2]] : todas;
  log(`contas com sessao: ${todas.length}`);
  log(`vira o dia em: ${faltaParaVirar()} (meia-noite de Brasilia)\n`);

  const { DigiiIdleHeadlessClient } = require('./src/headless/client');

  for (const partition of alvo.slice(0, 4)) {
    const c = new DigiiIdleHeadlessClient('passe', partition, { name: 'passe-estado' });
    const real = c.sendCommand.bind(c);
    c.sendCommand = (t, d) => (t === 'pong' || t === 'ping' ? real(t, d) : (log(`[BARRADO] ${t}`), true));

    // Pega o 'estado' cru: o client headless descarta o que nao usa.
    let cru = null;
    const orig = c.onMessage.bind(c);
    c.onMessage = (ev) => {
      try { const m = JSON.parse(ev.data); if (m && m.t === 'estado' && !cru) cru = m; } catch {}
      return orig(ev);
    };

    await new Promise((r) => {
      let f = 0; const go = () => { if (!f++) r(); };
      c.on('update', go); c.on('error', (m) => { log(`  erro: ${m}`); go(); });
      setTimeout(go, 25000); c.connect();
    });
    await new Promise((r) => setTimeout(r, 2500));

    log(`--- ${partition} ---`);
    if (!cru) { log('  nao chegou o estado\n'); try { c.disconnect(); } catch {} continue; }
    log(`  nick ${cru.nick} | nivel ${cru.nivel}`);
    const p = cru.passe;
    if (!p) {
      log('  SEM campo "passe" no estado!');
      log(`  chaves do estado: ${Object.keys(cru).join(', ')}\n`);
    } else {
      log(`  passe = ${JSON.stringify(p)}`);
      log(`    dia          = ${p.dia}        (proximo dia a resgatar)`);
      log(`    pode         = ${p.pode}       <== o botao de resgatar liga com isto`);
      log(`    nivel        = ${p.nivel}      (nivel minimo do Tamer)`);
      log(`    nivelOk      = ${cru.nivel >= p.nivel}`);
      log(`    premium      = ${p.premium}`);
      log(`    premiumPend  = ${JSON.stringify(p.premiumPend || [])}  <== dias de Premium atrasado`);
      log(`    feitos       = ${p.feitos}`);
      log(`    ultimo       = ${p.ultimo}${p.ultimo ? ' -> ' + new Date(p.ultimo).toString() : ''}`);
      const podeAgora = !!p.pode && cru.nivel >= p.nivel;
      log(`  => RESGATARIA AGORA: ${podeAgora}${podeAgora ? '' : ' (' + (!p.pode ? 'ja pegou hoje' : 'nivel baixo') + ')'}`);
      log('');
    }
    try { c.disconnect(); } catch {}
    await new Promise((r) => setTimeout(r, 800));
  }

  log(`relatorio: ${SAIDA}`);
  fim(0);
}
function fim(c) { setTimeout(() => app.exit(c), 400); }
main().catch((e) => { log('FATAL: ' + (e.stack || e)); fim(1); });
