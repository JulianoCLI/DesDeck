#!/usr/bin/env node
/**
 * Confere o porte de src/headless/ovo-tier.js contra o modulo REAL do jogo.
 *
 * Carrega /js/ovo-tier.js dentro de uma janela no origin do jogo (onde os
 * imports resolvem) e compara a letra de milhares de ovos sorteados contra a
 * do porte. Qualquer divergencia e um ovo que seria vendido errado.
 *
 * Uso: .\node_modules\electron\dist\electron.exe verify-tier.js
 */
const { app, BrowserWindow, net } = require('electron');
const path = require('path');
const fs = require('fs');

// O perfil REAL do app, nao um nome chutado (ver perfil-real.js).
require('./perfil-real').usar();

const SAIDA = path.join(__dirname, 'tier-report.txt');
const linhas = [];
const log = (...a) => { linhas.push(a.join(' ')); try { fs.writeFileSync(SAIDA, linhas.join('\n') + '\n'); } catch {} };

function baixar(url) {
  return new Promise((resolve, reject) => {
    const req = net.request(url);
    let body = '';
    req.on('response', (res) => {
      res.on('data', (c) => { body += c.toString('utf8'); });
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  await app.whenReady();
  log('=== CONFERENCIA DO PORTE DE TIER DE OVO ===\n');

  const especies = JSON.parse(await baixar('https://digiidle.com/shared/especies.json?v=1'));
  const itens = JSON.parse(await baixar('https://digiidle.com/shared/itens.json?v=1'));
  log(`catalogos: ${especies.length} especies, ovoConfig.max=${itens.ovoConfig.max}`);

  // Sorteia ovos variados e deterministicos (mulberry32), cobrindo ivs, u,
  // potencia, data e shiny.
  let seed = 12345;
  const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  const N = 4000;
  const ovos = [];
  for (let i = 0; i < N; i++) {
    const esp = especies[Math.floor(rnd() * especies.length)];
    ovos.push({
      id: i,
      especie: esp.id,
      ivs: Array.from({ length: 6 }, () => 1 + Math.floor(rnd() * 32)),
      u: [rnd(), rnd()],
      potencia: 1 + Math.floor(rnd() * 5),
      data: Math.floor(rnd() * 6),
      shiny: rnd() < 0.15,
    });
  }
  // Casos de borda explicitos.
  const esp0 = especies[0].id;
  ovos.push({ id: -1, especie: esp0, ivs: [1, 1, 1, 1, 1, 1], u: [0, 0], potencia: 1, data: 0, shiny: false });
  ovos.push({ id: -2, especie: esp0, ivs: [32, 32, 32, 32, 32, 32], u: [1, 1], potencia: 5, data: 5, shiny: true });
  ovos.push({ id: -3, especie: esp0, ivs: [32, 32, 32, 32, 32, 32], u: [0.999, 0.999], potencia: 1, data: 0, shiny: false });
  ovos.push({ id: -4, especie: 'especie-que-nao-existe', ivs: [10, 10, 10, 10, 10, 10], u: [0.5, 0.5], potencia: 1, data: 0 });
  ovos.push({ id: -5, especie: esp0, potencia: 1, data: 0 }); // sem ivs/u: deve dar '?'

  log(`ovos de teste: ${ovos.length}\n`);

  // --- Lado 1: o porte local
  const { criarTierOvo } = require('./src/headless/ovo-tier');
  const local = criarTierOvo(especies, itens);
  const letrasLocais = ovos.map((o) => local.letraOvo(o));

  // --- Lado 2: o modulo real do jogo, no origin do jogo
  const win = new BrowserWindow({ show: false, webPreferences: { partition: 'persist:tier-check', sandbox: true } });
  const ses = win.webContents.session;
  ses.protocol.handle('https', async (req) => {
    const u = new URL(req.url);
    if (u.host !== 'digiidle.com') return new Response('', { status: 404 });
    if (u.pathname === '/__probe') {
      return new Response('<!doctype html><title>t</title>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
    // Repassa o resto (os modulos js e os json) para a rede de verdade.
    const corpo = await baixar(req.url);
    const tipo = u.pathname.endsWith('.json') ? 'application/json' : 'text/javascript';
    return new Response(corpo, { status: 200, headers: { 'content-type': tipo + '; charset=utf-8' } });
  });

  await win.loadURL('https://digiidle.com/__probe');

  const letrasReais = await win.webContents.executeJavaScript(`(async () => {
    const ovos = ${JSON.stringify(ovos)};
    const especies = await (await fetch('/shared/especies.json?v=1')).json();
    const itens = await (await fetch('/shared/itens.json?v=1')).json();
    const porId = new Map(especies.map((e) => [e.id, e]));
    const cat = { especie: (id) => porId.get(id), itens };
    let mod = null, erro = '';
    for (const u of ['/js/ovo-tier.js?v=4', '/js/ovo-tier.js']) {
      try { mod = await import(u); break; } catch (e) { erro = String(e); }
    }
    if (!mod) return { erro: 'ovo-tier.js nao carregou: ' + erro };
    const { letraOvo } = mod.criarTierOvo(cat);
    return { letras: ovos.map((o) => letraOvo(o)) };
  })()`);

  if (letrasReais.erro) { log('ERRO ao carregar o modulo do jogo: ' + letrasReais.erro); win.destroy(); return finish(1); }

  // --- Compara
  let iguais = 0;
  const diffs = [];
  for (let i = 0; i < ovos.length; i++) {
    if (letrasLocais[i] === letrasReais.letras[i]) iguais++;
    else if (diffs.length < 15) diffs.push({ ovo: ovos[i], local: letrasLocais[i], jogo: letrasReais.letras[i] });
  }

  const dist = {};
  for (const l of letrasReais.letras) dist[l] = (dist[l] || 0) + 1;

  log('--- DISTRIBUICAO (pelo modulo do jogo)');
  for (const [l, n] of Object.entries(dist).sort()) log(`  ${l}: ${n}`);

  log(`\n--- COMPARACAO`);
  log(`  iguais: ${iguais}/${ovos.length}`);
  log(`  divergentes: ${ovos.length - iguais}`);
  if (diffs.length) {
    log('\n  exemplos de divergencia:');
    for (const d of diffs) log(`    ovo ${d.ovo.id} (${d.ovo.especie}): porte=${d.local} jogo=${d.jogo}`);
  }

  log(`\n=== ${iguais === ovos.length ? 'PASS: o porte bate 100% com o jogo' : 'FAIL: o porte divergiu'} ===`);

  win.destroy();
  finish(iguais === ovos.length ? 0 : 1);
}

function finish(c) { setTimeout(() => app.exit(c), 400); }
main().catch((e) => { log('FATAL: ' + (e && e.stack || e)); finish(1); });
