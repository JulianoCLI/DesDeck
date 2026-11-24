#!/usr/bin/env node
/**
 * O PAINEL conta as contas headless como online?
 *
 * O bug relatado: ao reabrir o app, o rodape mostrava "0/16 online", os
 * pontinhos dos cards ficavam cinzas e o relogio de "Farmando" ficava parado,
 * mesmo com as contas caçando e os abates subindo. Tirar a conta do headless e
 * repor fazia tudo voltar ao normal.
 *
 * A causa: markOnline() e o UNICO lugar que escreve r.status = 'online', e ele
 * le r.wv.getURL() — depende do webview. Em headless nao ha webview, entao
 * r.status ficava para sempre em 'disconnected' e todo contador que filtrava
 * por status === 'online' dava zero. O ritual "resolvia" porque a passagem pelo
 * webview finalmente escrevia r.status.
 *
 * Este teste roda as funcoes REAIS do renderer (extraidas de app.js, sem copia)
 * contra runtimes simulados, e cobre os tres sintomas da tela.
 *
 * Nao conecta em nada e nao le o perfil: e tudo em memoria.
 *
 * Uso: node test-painel-headless.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const falhas = [];
const ok = (nome, cond, extra) => {
  if (cond) console.log(`  ok   ${nome}${extra ? ' — ' + extra : ''}`);
  else { console.log(`  FALHA ${nome}${extra ? ' — ' + extra : ''}`); falhas.push(nome); }
};

// ---- As funcoes REAIS do app.js, nao reimplementacoes.
const src = fs.readFileSync(path.join(__dirname, 'src/renderer/app.js'), 'utf8');

function extrair(nome) {
  const i = src.indexOf(`function ${nome}(`);
  if (i < 0) throw new Error(`nao achei a funcao ${nome} em app.js`);
  // Varre as chaves ate fechar a funcao.
  let j = src.indexOf('{', i), nivel = 0, fim = -1;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') nivel++;
    else if (src[k] === '}') { nivel--; if (!nivel) { fim = k + 1; break; } }
  }
  return src.slice(i, fim);
}

// O ambiente minimo que essas funcoes tocam.
const ctx = {
  state: { accounts: [], settings: { bootHeadless: true }, ui: {} },
  rt: new Map(),
  fmtDur: (ms) => `${Math.round(ms / 1000)}s`,
  fmtClock: (ms) => `${Math.round(ms / 1000)}s`,
  accById: (id) => ctx.state.accounts.find((a) => a.id === id),
};

const corpo = [
  extrair('contaOnline'),
  extrair('onlineDesde'),
  extrair('isHeadless'),
  extrair('dotClass'),
  `return { contaOnline, onlineDesde, isHeadless, dotClass };`,
].join('\n');

const api = new Function('state', 'rt', 'fmtDur', 'fmtClock', 'accById', corpo)(
  ctx.state, ctx.rt, ctx.fmtDur, ctx.fmtClock, ctx.accById,
);

// ---- Cenario: 16 contas em headless, conectadas pelo socket, SEM webview.
// E exatamente o estado depois de reabrir o app com "iniciar todas em headless".
const AGORA = Date.now();
const DESDE = AGORA - 48 * 60000;
ctx.state.accounts = [];
ctx.rt.clear();
for (let i = 0; i < 16; i++) {
  const id = `acc-${i}`;
  ctx.state.accounts.push({ id, name: `DigiIdle ${i + 1}`, enabled: true, headless: true });
  ctx.rt.set(id, {
    id,
    status: 'disconnected',       // markOnline() nunca rodou: nao ha webview
    headlessStatus: 'connected',  // o socket esta de pe
    onlineSince: DESDE,
    wv: null,
  });
}

console.log('=== O PAINEL NO MODO HEADLESS ===\n');
console.log('cenario: 16 contas headless, socket conectado, nenhum webview\n');

console.log('1. o rodape "Online x/16"');
const online = [...ctx.rt.values()].filter(api.contaOnline);
ok('as 16 contam como online', online.length === 16, `${online.length}/16`);

console.log('\n2. o pontinho de cada card');
const cores = new Set([...ctx.rt.keys()].map((id) => api.dotClass(id)));
ok('todos verdes (ok), nenhum cinza', cores.size === 1 && cores.has('ok'), [...cores].join(','));

console.log('\n3. o relogio "Farmando"');
const desde = online.map(api.onlineDesde).filter(Boolean);
ok('tem marca de inicio em todas', desde.length === 16, `${desde.length}/16`);
ok('o relogio anda (nao e 1970)', Math.min(...desde) === DESDE, new Date(Math.min(...desde)).toISOString().slice(11, 19));

console.log('\n4. os estados que NAO sao "no ar"');
for (const [st, esperado] of [['connecting', 'load'], ['reconnecting', 'warn'], ['failed', 'alert'], ['disconnected', 'off']]) {
  const r = ctx.rt.get('acc-0');
  r.headlessStatus = st;
  r.onlineSince = st === 'connected' ? DESDE : null;
  ok(`'${st}' nao conta como online`, api.contaOnline(r) === false);
  ok(`'${st}' pinta o ponto de '${esperado}'`, api.dotClass('acc-0') === esperado, api.dotClass('acc-0'));
}

console.log('\n5. o webview nao foi quebrado (a conta normal segue valendo)');
ctx.state.accounts.push({ id: 'wv1', name: 'Normal', enabled: true, headless: false });
ctx.rt.set('wv1', { id: 'wv1', status: 'online', headlessStatus: 'disconnected', onlineSince: DESDE, wv: {} });
ok('conta em webview conta como online', api.contaOnline(ctx.rt.get('wv1')) === true);
ok('e o ponto dela fica verde', api.dotClass('wv1') === 'ok', api.dotClass('wv1'));
ctx.rt.set('wv2', { id: 'wv2', status: 'reconnecting', headlessStatus: 'disconnected', onlineSince: null, wv: {} });
ctx.state.accounts.push({ id: 'wv2', name: 'Caiu', enabled: true, headless: false });
ok('webview caida NAO conta como online', api.contaOnline(ctx.rt.get('wv2')) === false);

console.log('\n6. conta desligada nunca acende');
ctx.state.accounts.push({ id: 'off1', name: 'Desligada', enabled: false, headless: true });
ctx.rt.set('off1', { id: 'off1', status: 'disconnected', headlessStatus: 'connected', onlineSince: DESDE, wv: null });
ok("o ponto fica 'off'", api.dotClass('off1') === 'off', api.dotClass('off1'));

console.log('\n7. a regressao original: sem a correcao, isto daria 0');
const comoEraAntes = [...ctx.rt.values()].filter((x) => x.status === 'online').length;
const comoEAgora = [...ctx.rt.values()].filter(api.contaOnline).length;
ok('a correcao muda o resultado', comoEAgora > comoEraAntes, `antes contaria ${comoEraAntes}, agora ${comoEAgora}`);

console.log(falhas.length ? `\n=== FAIL: ${falhas.length} ===` : '\n=== PASS: o painel enxerga o headless ===');
process.exit(falhas.length ? 1 : 0);
