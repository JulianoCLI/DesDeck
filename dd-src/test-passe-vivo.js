#!/usr/bin/env node
/**
 * Roda a ToolPasse REAL contra uma conta REAL.
 *
 * Dois modos, e o padrao e o seguro:
 *
 *   (padrao) ENSAIO  - a ferramenta roda de verdade, le o estado real e DECIDE,
 *                      mas sendCommand e interceptado: o comando e mostrado em
 *                      vez de enviado. Nada muda na conta.
 *
 *   --valendo        - deixa o 'passe.resgatar' SAIR. Muta a conta (resgata o
 *                      dia do passe). Confere o estado antes e depois para
 *                      provar o efeito.
 *
 * Em ambos os modos, qualquer comando que nao seja passe.resgatar/passe.premium
 * e barrado - inclusive shop.comprar, que custaria DCoin.
 *
 * Uso: .\node_modules\electron\dist\electron.exe test-passe-vivo.js [particao] [--valendo]
 */
'use strict';
const { app, session } = require('electron');
const path = require('path');
const fs = require('fs');

const DATA_DIR = require('./perfil-real').usar();
const SAIDA = path.join(__dirname, 'passe-vivo.txt');
const out = [];
const log = (...a) => { const t = a.join(' '); out.push(t); console.log(t); try { fs.writeFileSync(SAIDA, out.join('\n') + '\n'); } catch {} };

const { SESSION_COOKIE } = require('./src/headless/cookies');
const argv = process.argv.slice(2);
const VALENDO = argv.includes('--valendo');
const particaoPedida = argv.find((a) => a.startsWith('persist:')) || null;

// Só estes dois podem sair, e só no modo --valendo.
const PERMITIDOS = ['passe.resgatar', 'passe.premium'];

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

const vePasse = (p) => (p ? `dia ${p.dia} | feitos ${p.feitos} | pode ${p.pode} | premium ${p.premium} | ultimo ${p.ultimo}` : '(sem passe)');

async function main() {
  await app.whenReady();
  const todas = await particoesComSessao();
  if (!todas.length) { log('nenhuma conta com sessao salva'); return fim(1); }
  const partition = particaoPedida || todas[0];

  log(`=== ToolPasse em conta REAL ===`);
  log(`modo     : ${VALENDO ? '*** VALENDO (vai resgatar de verdade) ***' : 'ENSAIO (nada e enviado)'}`);
  log(`particao : ${partition}\n`);

  const { DigiiIdleHeadlessClient } = require('./src/headless/client');
  const { ToolPasse } = require('./src/headless/tools');
  const c = new DigiiIdleHeadlessClient('passe-vivo', partition, { name: 'passe-vivo' });

  // O guarda: nada fora da lista sai, nunca. No ensaio, nem a lista sai.
  const real = c.sendCommand.bind(c);
  const tentados = [];
  c.sendCommand = (t, d) => {
    if (t === 'ping' || t === 'pong') return real(t, d);
    tentados.push(t);
    if (!PERMITIDOS.includes(t)) { log(`  [BARRADO] ${t} (fora da lista permitida)`); return true; }
    if (!VALENDO) { log(`  [ENSAIO] a ferramenta QUIS enviar: ${t} ${JSON.stringify(d || {})}`); return true; }
    log(`  [ENVIADO] ${t} ${JSON.stringify(d || {})}`);
    return real(t, d);
  };

  await new Promise((r) => {
    let f = 0; const go = () => { if (!f++) r(); };
    c.on('update', go); c.on('error', (m) => { log(`erro: ${m}`); go(); });
    setTimeout(go, 25000); c.connect();
  });
  if (!c.connected) { log('nao conectou'); return fim(1); }
  await new Promise((r) => setTimeout(r, 2500));

  log(`conta    : ${c.state.nick} | nivel ${c.state.nivel}`);
  const antes = c.state.passe ? { ...c.state.passe } : null;
  log(`ANTES    : ${vePasse(antes)}\n`);

  // A ferramenta de verdade, com a config de fabrica.
  const t = new ToolPasse(c, { intervaloMin: 10, premiumAtrasado: true });
  t.running = true;

  const motivo = t.motivoParaNaoResgatar(antes, c.state);
  log(`decisao  : ${motivo ? 'NAO resgatar -> ' + motivo : 'RESGATAR'}`);
  log(`premium  : ${JSON.stringify(t.premiumPendente(antes))} pendente(s)\n`);

  log('rodando step()...');
  await t.step();

  if (!tentados.length) log('  (a ferramenta nao tentou enviar nada)');

  // Deixa o servidor devolver o estado novo.
  await new Promise((r) => setTimeout(r, 6000));
  const depois = c.state.passe ? { ...c.state.passe } : null;
  log(`\nDEPOIS   : ${vePasse(depois)}`);

  if (VALENDO && antes && depois) {
    const mudou = antes.pode !== depois.pode || antes.feitos !== depois.feitos || antes.dia !== depois.dia;
    log(`\nefeito   : ${mudou ? 'CONFIRMADO' : 'nenhuma mudanca visivel ainda'}`);
    if (mudou) {
      log(`  pode  : ${antes.pode} -> ${depois.pode}`);
      log(`  feitos: ${antes.feitos} -> ${depois.feitos}`);
      log(`  dia   : ${antes.dia} -> ${depois.dia}`);
    }
    // A prova de que nao duplica: um segundo passo nao pode reenviar.
    const n = tentados.filter((x) => x === 'passe.resgatar').length;
    log('\nsegundo step() (nao pode duplicar)...');
    await t.step();
    const n2 = tentados.filter((x) => x === 'passe.resgatar').length;
    log(`  passe.resgatar enviado ${n} -> ${n2} vez(es): ${n2 === n ? 'OK, nao duplicou' : 'FALHA, duplicou!'}`);
  }

  log(`\ncomandos tentados: ${tentados.length ? tentados.join(', ') : '(nenhum)'}`);
  const proibido = tentados.filter((x) => !PERMITIDOS.includes(x));
  log(`fora da lista    : ${proibido.length ? proibido.join(', ') + '  <== PROBLEMA' : 'nenhum (nada de compra)'}`);
  log(`\nrelatorio: ${SAIDA}`);
  try { c.disconnect(); } catch {}
  fim(0);
}
function fim(c) { setTimeout(() => app.exit(c), 400); }
main().catch((e) => { log('FATAL: ' + (e.stack || e)); fim(1); });
