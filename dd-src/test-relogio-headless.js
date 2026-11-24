#!/usr/bin/env node
/**
 * O "Tempo online hoje" anda com as contas em headless?
 *
 * Segundo bug do mesmo tronco: tick() somava o tempo so quando
 * r.status === 'online', e esse campo nunca e escrito em headless (markOnline
 * depende do webview). Resultado: o KPI "Tempo online hoje" ficava parado no
 * valor da ultima vez que a conta rodou COM janela — na tela, um numero
 * congelado (48m 42s) enquanto as contas cacavam a noite inteira.
 *
 * A vigilancia de pagina (travou / nao responde / recarga automatica) tem de
 * continuar valendo so para o webview: nao ha pagina para vigiar em headless.
 * Este teste cobre as duas coisas.
 *
 * Roda a funcao REAL tick() extraida de app.js. Nao conecta em nada.
 *
 * Uso: node test-relogio-headless.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const falhas = [];
const ok = (nome, cond, extra) => {
  if (cond) console.log(`  ok   ${nome}${extra ? ' — ' + extra : ''}`);
  else { console.log(`  FALHA ${nome}${extra ? ' — ' + extra : ''}`); falhas.push(nome); }
};

const src = fs.readFileSync(path.join(__dirname, 'src/renderer/app.js'), 'utf8');
function extrair(nome) {
  const i = src.indexOf(`function ${nome}(`);
  if (i < 0) throw new Error(`nao achei ${nome}`);
  let j = src.indexOf('{', i), nivel = 0, fim = -1;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') nivel++;
    else if (src[k] === '}') { nivel--; if (!nivel) { fim = k + 1; break; } }
  }
  return src.slice(i, fim);
}

function montar() {
  const env = {
    state: { accounts: [], settings: {}, ui: {} },
    rt: new Map(),
    hoje: { onlineMs: 0 },
    probes: [],
    reloads: [],
    quedas: [],
    lastTickAt: Date.now() - 1000,
    started: true,
  };
  const corpo = [
    extrair('contaOnline'),
    extrair('onlineDesde'),
    extrair('isHeadless'),
    extrair('tick'),
    'return { tick, contaOnline };',
  ].join('\n');
  const api = new Function(
    'state', 'rt', 'today', 'accById', 'markDirty', 'probe', 'drop', 'log',
    'updateLive', 'updateTitle', 'document', 'lastTickAt',
    corpo,
  )(
    env.state, env.rt,
    () => env.hoje,
    (id) => env.state.accounts.find((a) => a.id === id),
    () => {},
    (id) => env.probes.push(id),
    (id, motivo) => env.quedas.push({ id, motivo }),
    () => {},
    () => {}, () => {},
    { hidden: false },
    env.lastTickAt,
  );
  return { env, api };
}

console.log('=== O RELOGIO "TEMPO ONLINE HOJE" ===\n');

// --- 1. conta em headless acumula tempo
{
  const { env, api } = montar();
  env.state.accounts.push({ id: 'h1', enabled: true, headless: true, stats: { onlineMs: 0, drops: 0, recoveries: 0 }, autoReloadMin: 0 });
  env.rt.set('h1', { id: 'h1', status: 'disconnected', headlessStatus: 'connected', onlineSince: Date.now() - 60000, wv: null, wcId: null });
  const antes = env.state.accounts[0].stats.onlineMs;
  api.tick();
  const depois = env.state.accounts[0].stats.onlineMs;
  console.log('1. conta headless conectada');
  ok('o tempo da conta ANDOU', depois > antes, `${antes}ms -> ${depois}ms`);
  ok('o "hoje" tambem andou', env.hoje.onlineMs > 0, `${env.hoje.onlineMs}ms`);
}

// --- 2. headless NAO sofre vigilancia de pagina
{
  const { env, api } = montar();
  env.state.accounts.push({ id: 'h2', enabled: true, headless: true, stats: { onlineMs: 0, drops: 0, recoveries: 0 }, autoReloadMin: 1 });
  env.rt.set('h2', {
    id: 'h2', status: 'disconnected', headlessStatus: 'connected',
    onlineSince: Date.now() - 60000, wv: null, wcId: null,
    unresponsiveSince: Date.now() - 120000,  // "sem resposta" ha 2 min
    loadedAt: Date.now() - 600000,            // "carregada" ha 10 min
    lastProbe: 0,
  });
  api.tick();
  console.log('\n2. headless nao e vigiada como pagina');
  ok('nao foi derrubada por "pagina travou"', env.quedas.length === 0, JSON.stringify(env.quedas));
  ok('nao foi sondada (probe)', env.probes.length === 0);
  ok('mesmo assim o tempo andou', env.state.accounts[0].stats.onlineMs > 0);
}

// --- 3. o webview segue funcionando igual
{
  const { env, api } = montar();
  env.state.accounts.push({ id: 'w1', enabled: true, headless: false, stats: { onlineMs: 0, drops: 0, recoveries: 0 }, autoReloadMin: 0 });
  env.rt.set('w1', {
    id: 'w1', status: 'online', headlessStatus: 'disconnected',
    onlineSince: Date.now() - 60000, wv: {}, wcId: 7,
    unresponsiveSince: null, loadedAt: Date.now(), lastProbe: 0,
  });
  api.tick();
  console.log('\n3. conta em webview (nada mudou para ela)');
  ok('o tempo andou', env.state.accounts[0].stats.onlineMs > 0);
  ok('continua sendo sondada', env.probes.length === 1, JSON.stringify(env.probes));
}

// --- 4. webview travada ainda cai
{
  const { env, api } = montar();
  env.state.accounts.push({ id: 'w2', enabled: true, headless: false, stats: { onlineMs: 0, drops: 0, recoveries: 0 }, autoReloadMin: 0 });
  env.rt.set('w2', {
    id: 'w2', status: 'online', headlessStatus: 'disconnected',
    onlineSince: Date.now() - 60000, wv: {}, wcId: 8,
    unresponsiveSince: Date.now() - 60000, loadedAt: Date.now(), lastProbe: Date.now(),
  });
  api.tick();
  console.log('\n4. webview sem resposta ha 1 min');
  ok('foi derrubada, como antes', env.quedas.length === 1, JSON.stringify(env.quedas.map((q) => q.motivo)));
}

// --- 5. conta fora do ar nao acumula
{
  const { env, api } = montar();
  env.state.accounts.push({ id: 'h3', enabled: true, headless: true, stats: { onlineMs: 0, drops: 0, recoveries: 0 }, autoReloadMin: 0 });
  env.rt.set('h3', { id: 'h3', status: 'disconnected', headlessStatus: 'reconnecting', onlineSince: null, wv: null, wcId: null });
  api.tick();
  console.log('\n5. headless reconectando (fora do ar)');
  ok('NAO acumula tempo', env.state.accounts[0].stats.onlineMs === 0, `${env.state.accounts[0].stats.onlineMs}ms`);
  ok('o "hoje" tambem nao', env.hoje.onlineMs === 0);
}

console.log(falhas.length ? `\n=== FAIL: ${falhas.length} ===` : '\n=== PASS: o relogio anda em headless, e a pagina segue vigiada ===');
process.exit(falhas.length ? 1 : 0);
