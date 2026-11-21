#!/usr/bin/env node
/**
 * Captura so os campos de decisao do pacote 'lab', sem o cfg/fila gigantes.
 * Precisamos deles para escrever as guardas da ferramenta de labirinto.
 *
 * NAO MUTA A CONTA: so 'lab.info' (leitura) e enviado.
 *
 * Uso: .\node_modules\electron\dist\electron.exe test-lab-campos.js <login> <senha>
 */
'use strict';
const { app, session, net } = require('electron');
const path = require('path');
const fs = require('fs');

// O perfil REAL do app, nao um nome chutado (ver perfil-real.js).
require('./perfil-real').usar();
const SAIDA = path.join(__dirname, 'lab-campos.txt');
const out = [];
const log = (...a) => { const t = a.join(' '); out.push(t); console.log(t); try { fs.writeFileSync(SAIDA, out.join('\n') + '\n'); } catch {} };

const [login, senha] = process.argv.slice(2);
const partition = 'persist:lab-campos';

function postLogin(ses) {
  return new Promise((resolve, reject) => {
    const req = net.request({ method: 'POST', url: 'https://digiidle.com/auth/entrar', session: ses, useSessionCookies: true });
    req.setHeader('Content-Type', 'application/json');
    req.setHeader('Origin', 'https://digiidle.com');
    let b = '';
    req.on('response', (r) => { r.on('data', (c) => { b += c; }); r.on('end', () => resolve(b)); });
    req.on('error', reject);
    req.end(JSON.stringify({ login, senha, lembrar: true, lang: 'pt' }));
  });
}

async function main() {
  await app.whenReady();
  const ses = session.fromPartition(partition);
  const j = JSON.parse(await postLogin(ses));
  if (!j.ok) { log('login falhou'); return fim(1); }
  log(`login ok: ${j.conta.nick}\n`);

  const { DigiiIdleHeadlessClient } = require('./src/headless/client');
  const c = new DigiiIdleHeadlessClient('ms1', partition, { name: login });

  // Barra tudo que muda; so lab.info passa.
  const real = c.sendCommand.bind(c);
  c.sendCommand = (t, d) => (t === 'lab.info' || t === 'pong' ? real(t, d) : (log(`[BARRADO] ${t}`), true));

  let lab = null;
  const orig = c.onMessage.bind(c);
  c.onMessage = (ev) => { try { const m = JSON.parse(ev.data); if (m && (m.t === 'lab' || m.t === 'lab.info')) lab = m; } catch {} return orig(ev); };

  await new Promise((r) => { let f = 0; const go = () => { if (!f++) r(); }; c.on('update', go); c.on('error', (m) => { log('erro: ' + m); go(); }); setTimeout(go, 30000); c.connect(); });

  real('lab.info', {});
  await new Promise((r) => setTimeout(r, 7000));

  if (!lab) { log('sem resposta de lab'); return fim(1); }

  log('--- CAMPOS DE DECISAO do pacote "lab" ---');
  const tipos = (v) => (v === null ? 'null' : Array.isArray(v) ? `array[${v.length}]` : typeof v);
  for (const k of ['t', 'noLobby', 'pronto', 'gerente', 'dif', 'bauHoje', 'guild', 'run', 'ultimo']) {
    const v = lab[k];
    const mostra = (v && typeof v === 'object') ? tipos(v) : JSON.stringify(v);
    log(`  ${k.padEnd(10)} = ${mostra}   (${tipos(v)})`);
  }
  log('');
  log(`  eu         = ${lab.eu ? JSON.stringify(lab.eu) : 'AUSENTE  <- sem Digimon que possa lutar'}`);
  log(`  fila       = ${Array.isArray(lab.fila) ? lab.fila.length + ' no lobby' : 'ausente'}`);
  log(`  cfg.min/max= ${lab.cfg ? lab.cfg.min + '/' + lab.cfg.max : 'ausente'}`);
  log('');
  log('--- a decisao "devo entrar no lobby?" ---');
  const correndo = !!(lab.run && !lab.run.acabou);
  const cheio = Array.isArray(lab.fila) && lab.cfg && lab.fila.length >= lab.cfg.max;
  log(`  corrida rodando : ${correndo}`);
  log(`  lobby cheio     : ${cheio}`);
  log(`  ja estou nele   : ${!!lab.noLobby}`);
  log(`  tenho Digimon   : ${!!lab.eu}`);
  log(`  mapa instalado  : ${!!lab.pronto}`);
  const devo = !correndo && !cheio && !lab.noLobby && !!lab.eu && !!lab.pronto;
  log(`  => ENTRARIA     : ${devo}`);
  log('');
  log(`chaves completas: ${Object.keys(lab).join(', ')}`);
  log(`relatorio: ${SAIDA}`);
  try { c.disconnect(); } catch {}
  fim(0);
}
function fim(c) { setTimeout(() => app.exit(c), 400); }
main().catch((e) => { log('FATAL: ' + (e.stack || e)); fim(1); });
