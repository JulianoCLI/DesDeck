#!/usr/bin/env node
/**
 * Prova que o Auto Passe vem LIGADO de fabrica - inclusive em conta nova, que
 * nunca passou pela tela de Ferramentas - e que desligar na UI e respeitado.
 *
 * O risco que este teste cobre: a decisao "esta ligada?" e lida em 4 lugares
 * (webview, headless, religar e a UI). Se um deles continuasse testando
 * conf.enabled direto, o padrao valeria num modo e nao no outro.
 *
 * Uso: node test-passe-padrao.js
 */
'use strict';
const fs = require('fs');
const vm = require('vm');

const src = fs.readFileSync('src/renderer/tools.js', 'utf8');
const sandbox = { window: {}, console, location: { host: 'x' }, document: {}, fetch: () => {} };
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: 'tools.js' });
const T = sandbox.window.DDTools;

let falhas = 0;
const ok = (c, t) => { console.log(`  ${c ? 'ok  ' : 'FALHA'} ${t}`); if (!c) falhas++; };

const passe = T.toolById('passe');
const lab = T.toolById('lab');

console.log('=== AUTO PASSE LIGADO DE FABRICA ===\n');

console.log('1. o catalogo marca so o passe como padrao ligado');
{
  ok(passe.padraoLigado === true, 'passe tem padraoLigado');
  const outras = T.TOOLS.filter((t) => t.id !== 'passe' && t.padraoLigado);
  ok(outras.length === 0, `nenhuma outra vem ligada (${outras.map((t) => t.id).join(', ') || 'nenhuma'})`);
}

console.log('\n2. conta nova (sem registro) -> passe ligado, resto desligado');
{
  ok(T.toolLigada(undefined, passe) === true, 'sem registro: passe LIGADO');
  ok(T.toolLigada(undefined, lab) === false, 'sem registro: labirinto desligado');
  ok(T.toolLigada(null, passe) === true, 'registro null: passe LIGADO');
  // O state.tools inteiro vazio é o caso do primeiro boot.
  const semNada = (({ tools = {} }, id, acc, tool) => T.toolLigada(tools[id] && tools[id][acc], tool))({}, 'passe', 'acc-nova', passe);
  ok(semNada === true, 'state.tools vazio: passe LIGADO');
}

console.log('\n3. a escolha da pessoa sempre ganha');
{
  ok(T.toolLigada({ enabled: false }, passe) === false, 'desligou o passe na UI: fica desligado');
  ok(T.toolLigada({ enabled: true }, passe) === true, 'ligado explicito: ligado');
  ok(T.toolLigada({ enabled: true }, lab) === true, 'ligou o labirinto: ligado');
  ok(T.toolLigada({ enabled: false }, lab) === false, 'labirinto desligado: desligado');
  // Um registro só com cfg (sem enabled) nao e uma escolha: cai no padrao.
  ok(T.toolLigada({ cfg: { intervaloMin: 5 } }, passe) === true, 'registro so com cfg: segue o padrao (ligado)');
}

console.log('\n4. desligar grava enabled:false (nao apaga o registro)');
{
  // Simula o onchange da UI: o registro passa a existir com false, e e isso
  // que impede o padrao de religar a ferramenta no proximo boot.
  const porConta = { 'acc-1': { enabled: !!passe.padraoLigado, cfg: passe.defaults() } };
  ok(T.toolLigada(porConta['acc-1'], passe) === true, 'ao abrir a tela, nasce ligado');
  porConta['acc-1'].enabled = false; // a pessoa desligou
  ok(T.toolLigada(porConta['acc-1'], passe) === false, 'depois de desligar, continua desligado');
}

console.log('\n5. o codigo injetado nasce com a config de fabrica');
{
  // Conta nova nao tem cfg; o padrao precisa gerar codigo valido sozinho.
  const code = passe.code({ ...passe.defaults() });
  ok(code.includes("G.enviar('passe.resgatar'"), 'resgata');
  ok(/intervaloMs"?:\s*600000/.test(code), 'intervalo de fabrica = 10 min');
  ok(code.includes('premiumAtrasado'), 'traz a opcao de Premium atrasado');
  const vazio = passe.code({});
  ok(vazio.includes("G.enviar('passe.resgatar'"), 'cfg vazio tambem compila e resgata');
}

console.log('\n6. os 4 pontos de leitura usam o helper (nao conf.enabled cru)');
{
  const app = fs.readFileSync('src/renderer/app.js', 'utf8');
  // Os trechos que decidem ligar/injetar/religar.
  const usos = (app.match(/toolLigada\(/g) || []).length;
  ok(usos >= 5, `toolLigada usado ${usos} vez(es) (applyToolHeadless, applyToolsHeadless, toolScriptsFor, applyToolLive, openTools)`);
  // Nenhum dos laços de ferramenta pode ter voltado a testar enabled direto.
  const cru = /if \(!conf \|\| !conf\.enabled\) continue;/.test(app);
  ok(!cru, 'nenhum laco de ferramenta testa conf.enabled cru');
  ok(app.includes('enabled: !!tool.padraoLigado'), 'a tela cria o registro com o padrao da ferramenta');
}

console.log(falhas ? `\n=== FALHOU: ${falhas} caso(s) ===` : '\n=== PASS: o Auto Passe vem ligado e desligar e respeitado ===');
process.exit(falhas ? 1 : 0);
