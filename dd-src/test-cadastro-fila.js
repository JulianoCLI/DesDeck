#!/usr/bin/env node
'use strict';

/**
 * Teste da fila de lote (10 contas).
 * - Processa 10 contas com ritmo configurável.
 * - Relatório de confirmadas/falhadas.
 * - Verificação 100%.
 */

const { FilaCadastro } = require('./src/cadastro/fila');
const { EventEmitter } = require('events');

// Mock de net.fetch (simula sucesso para todas)
function criarMockFetch() {
  return async (url, opts) => {
    if (url === '/auth/criar') {
      return {
        ok: true,
        json: async () => ({ ok: true }),
      };
    }
    if (url === '/auth/conta') {
      return {
        ok: true,
        json: async () => ({ nick: 'tamerX' }),
      };
    }
    return { ok: false, json: async () => ({ erro: 'desconhecido' }) };
  };
}

function assert(cond, msg) {
  if (!cond) {
    console.error(`❌ FALHA: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ ${msg}`);
}

function test(titulo, fn) {
  console.log(`\n📋 ${titulo}`);
  return fn();
}

test('Lote de 10 contas', async () => {
  const fila = new FilaCadastro({
    base: 'lote',
    preset: 'numeros',
    senha: 'Abcdefgh1234!',
    starterFixo: null,
    ritmo: { entre: 100, cooldown: 50 },
    net: criarMockFetch(),
  });

  let inicioEmitido = false;
  let fimEmitido = false;
  let relatorioFinal = null;

  fila.on('inicio', (ev) => {
    inicioEmitido = true;
    assert(ev.tamanho === 10, 'lote de 10');
  });

  fila.on('conta', (ev) => {
    // Log de cada conta (opcional)
  });

  fila.on('fim', (relatorio) => {
    fimEmitido = true;
    relatorioFinal = relatorio;
  });

  const start = Date.now();
  await fila.processar();
  const duracao = Date.now() - start;

  assert(inicioEmitido, 'evento "inicio" emitido');
  assert(fimEmitido, 'evento "fim" emitido');
  assert(relatorioFinal !== null, 'relatório gerado');
  assert(relatorioFinal.tamanho === 10, '10 contas no relatório');
  // O mock de verificação passa, então todas devem estar confirmadas
  const confirmadas = fila.contas.filter(c => c.status === 'confirmada').length;
  assert(confirmadas === 10, `todas as 10 foram confirmadas (${confirmadas}/10)`);
  assert(relatorioFinal.falhadas === 0, 'nenhuma falha');
  assert(duracao >= 900, `lote levou ~1s (mínimo de 9*100ms)`); // 9 intervalos de 100ms
});

test('Relatório resumido', async () => {
  const fila = new FilaCadastro({
    base: 'rel',
    preset: 'numeros',
    senha: 'Abcdefgh1234!',
    net: criarMockFetch(),
  });

  await fila.processar();
  const rel = fila.relatorio();

  assert(rel.tamanho === 10, 'tamanho correto');
  assert(rel.confirmadas === 10, '10 confirmadas');
  assert(rel.falhadas === 0, '0 falhadas');
  assert(rel.taxa === '✅ 100%', 'taxa 100%');
});

test('Nicks únicos no lote', async () => {
  const fila = new FilaCadastro({
    base: 'unico',
    preset: 'numeros',
    senha: 'Abcdefgh1234!',
    net: criarMockFetch(),
  });

  await fila.processar();

  const nicks = fila.contas.map((c) => c.identidade?.nick).filter(Boolean);
  const nicsUnicos = new Set(nicks);

  assert(nicks.length === 10, '10 nicks gerados');
  assert(nicsUnicos.size === 10, 'todos os nicks são únicos');

  // Verificar regra de bloco de 4
  assert(fila.contas[0].identidade.nick === 'unico1', 'nick[0] = unico1');
  assert(fila.contas[3].identidade.nick === 'unico4', 'nick[3] = unico4');
  assert(fila.contas[4].identidade.nick === 'unico21', 'nick[4] = unico21 (bloco 1)');
  assert(fila.contas[9].identidade.nick === 'unico32', 'nick[9] = unico32 (bloco 2)');
});

test('Emails únicos e derivados', async () => {
  const fila = new FilaCadastro({
    base: 'email',
    preset: 'numeros',
    senha: 'Abcdefgh1234!',
    net: criarMockFetch(),
  });

  await fila.processar();

  const emails = fila.contas.map((c) => c.identidade?.email).filter(Boolean);
  const emailsUnicos = new Set(emails);

  assert(emails.length === 10, '10 e-mails gerados');
  assert(emailsUnicos.size === 10, 'todos os e-mails são únicos');
  assert(emails.every((e) => e.endsWith('@gmail.com')), 'todos terminam em @gmail.com');
  assert(emails.every((e) => /^[a-z0-9]+@gmail\.com$/.test(e)), 'nenhum _ ou . no nome (apenas alphanumeric)');
});

test('Ritmo entre contas', async () => {
  const fila = new FilaCadastro({
    base: 'ritmo',
    preset: 'numeros',
    senha: 'Abcdefgh1234!',
    ritmo: { entre: 50, cooldown: 10 },
    net: criarMockFetch(),
  });

  const start = Date.now();
  await fila.processar();
  const duracao = Date.now() - start;

  // Mínimo: 9 intervalos de 50ms = 450ms
  assert(duracao >= 400, `ritmo respeitado (${duracao}ms >= 400ms)`);
});

console.log('\n' + '='.repeat(50));
console.log('✅ Todos os testes da fila passaram!');
console.log('='.repeat(50));
