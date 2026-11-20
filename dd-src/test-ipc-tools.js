#!/usr/bin/env node
/**
 * Testa a LIGACAO entre a UI e as ferramentas headless, que e um caminho
 * diferente do que test-tools-headless.js cobre: lá as ferramentas sao ligadas
 * chamando client.startTool direto. Aqui o teste passa pelo manager, como o
 * handler IPC do main faz, para pegar elos faltando na corrente
 * renderer -> preload -> main -> manager -> client -> tool.
 *
 * Nao conecta em conta nenhuma: um client falso basta para provar a ligacao.
 *
 * Uso: node test-ipc-tools.js
 */
const path = require('path');
const Module = require('module');

// tools.js e catalogo.js pedem 'electron' (net.request). Aqui ninguem vai a
// rede: as ferramentas sao ligadas e paradas antes de qualquer passo.
const origLoad = Module._load;
Module._load = function (req, parent, isMain) {
  if (req === 'electron') return { net: { request: () => { throw new Error('sem rede no teste'); } } };
  return origLoad.call(this, req, parent, isMain);
};

const { HeadlessManager } = require('./src/headless/manager');
const { DigiiIdleHeadlessClient } = require('./src/headless/client');

const falhas = [];
const checa = (nome, ok, extra = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FALHA'} ${nome}${extra ? ' - ' + extra : ''}`);
  if (!ok) falhas.push(nome);
};

console.log('=== LIGACAO UI -> FERRAMENTAS HEADLESS ===\n');

// 1. O preload promete APIs; o main precisa ter o handler de cada uma.
const preload = require('fs').readFileSync(path.join(__dirname, 'src/preload.js'), 'utf8');
const main = require('fs').readFileSync(path.join(__dirname, 'src/main.js'), 'utf8');
console.log('handlers IPC prometidos pelo preload:');
for (const m of preload.matchAll(/ipcRenderer\.invoke\('(headless:[^']+)'/g)) {
  const canal = m[1];
  checa(canal, main.includes(`handle('${canal}'`), main.includes(`handle('${canal}'`) ? '' : 'preload promete, main nao implementa');
}

// 2. O manager precisa expor o que o handler chama.
console.log('\nmetodos que o manager precisa ter:');
for (const nome of ['start', 'stop', 'startTool', 'stopTool', 'getStatus']) {
  checa(`manager.${nome}()`, typeof HeadlessManager.prototype[nome] === 'function');
}

// 3. A corrente inteira, de verdade: manager.startTool chega na ferramenta?
console.log('\ncorrente manager -> client -> ferramenta:');
const mgr = new HeadlessManager();
const client = new DigiiIdleHeadlessClient('acc-teste', 'persist:nao-usada', { name: 'teste' });
mgr.clients.set('acc-teste', client); // no lugar de conectar de verdade

checa('startTool em conta inexistente devolve false', mgr.startTool('nao-existe', 'scan', {}) === false);

const TODAS = ['scan', 'refill', 'hunt', 'eggs'];
for (const id of TODAS) {
  const ok = mgr.startTool('acc-teste', id, {});
  checa(`startTool('${id}')`, ok === true && client.tools.has(id));
}
checa('as 4 ficaram ativas', client.tools.size === 4, [...client.tools.keys()].join(','));

// Religar nao pode duplicar: seria compra em dobro.
mgr.startTool('acc-teste', 'refill', { reservaBits: 777 });
checa('religar nao duplica a ferramenta', client.tools.size === 4);
checa('religar troca a config', client.tools.get('refill').config.reservaBits === 777);

for (const id of TODAS) {
  mgr.stopTool('acc-teste', id);
}
checa('stopTool parou todas', client.tools.size === 0);

// 4. Nenhuma ferramenta pode agir sem socket: sendCommand devolve false.
console.log('\nseguranca: sem socket, nada e enviado:');
checa('client.connected e false', client.connected === false);
checa('sendCommand devolve false', client.sendCommand('ball.throw', { corpo: 1 }) === false);

console.log(`\n=== ${falhas.length ? 'FAIL: ' + falhas.length + ' problema(s): ' + falhas.join(', ') : 'PASS: a corrente esta completa'} ===`);
process.exit(falhas.length ? 1 : 0);
