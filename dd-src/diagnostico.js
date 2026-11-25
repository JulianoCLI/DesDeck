#!/usr/bin/env node
'use strict';

/**
 * Diagnóstico: Verificar se todos os módulos carregam sem erro
 */

console.log('\n🔍 Verificando todos os módulos de cadastro...\n');

const testes = [
  { nome: 'Gerador', arquivo: './src/cadastro/gerador.js' },
  { nome: 'Agente', arquivo: './src/cadastro/agente.js' },
  { nome: 'Fila', arquivo: './src/cadastro/fila.js' },
  { nome: 'IPC Handlers', arquivo: './src/cadastro/ipc-handlers.js' },
  { nome: 'Rede', arquivo: './src/headless/rede.js' },
];

let ok = 0;
let falhou = 0;

for (const test of testes) {
  try {
    require(test.arquivo);
    console.log(`✅ ${test.nome}`);
    ok++;
  } catch (err) {
    console.error(`❌ ${test.nome}: ${err.message}`);
    falhou++;
  }
}

console.log(`\n📊 Resultado: ${ok} OK, ${falhou} falhou\n`);

if (falhou === 0) {
  console.log('✅ Todos os módulos carregaram com sucesso!');
  process.exit(0);
} else {
  console.log('❌ Alguns módulos falharam. Veja acima.');
  process.exit(1);
}
