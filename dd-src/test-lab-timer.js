#!/usr/bin/env node
/**
 * O timer do Labirinto nao pode derrubar o processo principal.
 *
 * Existe porque isso JA ACONTECEU: startLabTimer() chamava this.isConnected(),
 * um metodo que eu inventei e que nao existe na classe (o certo e o getter
 * 'connected'). O app morria 8 segundos depois do login, com
 * "TypeError: this.isConnected is not a function" numa caixa de erro.
 *
 * O teste que existia nao pegou porque ele mesmo definia
 * c.isConnected = () => true no objeto, criando o metodo que faltava. Testar a
 * propria invencao nao prova nada. Aqui NADA e substituido alem do ws: o client
 * e o de verdade, e o timer dispara de verdade.
 *
 * Uso: .\node_modules\electron\dist\electron.exe test-lab-timer.js
 */
'use strict';
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'dd-labt-')));

const out = [];
const ok = (c, t) => out.push((c ? 'OK    ' : 'FALHA ') + t);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const { DigiiIdleHeadlessClient } = require('./src/headless/client');

  // Qualquer excecao solta e o que o usuario viu na caixa de erro. Fatal aqui.
  const estouros = [];
  process.on('uncaughtException', (e) => estouros.push(String((e && e.message) || e)));

  const novo = () => new DigiiIdleHeadlessClient('a1', 'persist:nao-existe', { name: 'teste' });

  // ---- 1. conectado: pede lab.info sem estourar
  const c = novo();
  const enviados = [];
  // So o socket e falso: e o unico pedaco que exigiria rede. O resto do
  // caminho (o getter 'connected', o send(), o timer) e o codigo real.
  c.status = 'connected';
  c.ws = { readyState: 1, send: (s) => enviados.push(JSON.parse(s)) };

  c.startLabTimer();
  await espera(9000);
  c.stopLabTimer();

  ok(estouros.length === 0, 'o timer rodou sem derrubar o processo (erros: ' + JSON.stringify(estouros) + ')');
  ok(enviados.some((m) => m.t === 'lab.info'), 'e pediu lab.info de verdade pelo socket');

  // ---- 2. desconectado: nao pede, e tambem nao estoura
  const d = novo();
  const env2 = [];
  d.status = 'disconnected';
  d.ws = { readyState: 3, send: (s) => env2.push(JSON.parse(s)) };
  d.startLabTimer();
  await espera(9000);
  d.stopLabTimer();
  ok(estouros.length === 0, 'desconectado tambem nao derruba nada');
  ok(env2.length === 0, 'e nao tenta falar num socket fechado');

  // ---- 3. sem ws nenhum (entre a queda e a reconexao)
  const s = novo();
  s.status = 'connected';
  s.ws = null;
  s.startLabTimer();
  await espera(9000);
  s.stopLabTimer();
  ok(estouros.length === 0, 'sem socket algum, o timer so nao faz nada');

  // ---- 4. stopLabTimer realmente cala o timer
  const p = novo();
  const env4 = [];
  p.status = 'connected';
  p.ws = { readyState: 1, send: (x) => env4.push(JSON.parse(x)) };
  p.startLabTimer();
  p.stopLabTimer();
  await espera(9000);
  ok(env4.length === 0, 'depois de stopLabTimer, nada mais e enviado (veio: ' + env4.length + ')');

  fs.writeFileSync(path.join(__dirname, 'lab-timer-report.txt'), out.join('\n') + '\n');
  console.log(out.join('\n'));
  const falhas = out.filter((l) => l.startsWith('FALHA')).length;
  console.log(falhas ? `\n=== FALHOU: ${falhas} caso(s) ===` : '\n=== PASS: o timer do lab nao derruba o app ===');
  app.exit(falhas ? 1 : 0);
}).catch((e) => { console.log('FATAL ' + ((e && e.stack) || e)); app.exit(1); });
