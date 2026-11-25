#!/usr/bin/env node
'use strict';

/**
 * Teste do gerador de identidades.
 * - Validação de nicks (comprimento, caracteres).
 * - Validação de e-mails (formato, derivação do nick, unicidade).
 * - Validação de senha (mínimo 12, maiúscula, número, símbolo).
 * - Presets e customizações.
 */

const { Gerador, PRESETS_NICK } = require('./src/cadastro/gerador');

function assert(cond, msg) {
  if (!cond) {
    console.error(`❌ FALHA: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ ${msg}`);
}

function test(titulo, fn) {
  console.log(`\n📋 ${titulo}`);
  try {
    fn();
  } catch (err) {
    console.error(`❌ ERRO: ${err.message}`);
    process.exit(1);
  }
}

test('Validação de senha', () => {
  const gen = new Gerador({ base: 'tamer', senha: 'x' });

  // Senha muito curta
  try {
    gen.gerar(0);
    assert(false, 'deveria rejeitar senha < 12 chars');
  } catch (err) {
    assert(true, `rejeita senha curta: ${err.message}`);
  }

  // Senha sem maiúscula
  gen.senha = 'abcdefgh1234!';
  try {
    gen.gerar(0);
    assert(false, 'deveria rejeitar senha sem maiúscula');
  } catch (err) {
    assert(true, `rejeita sem maiúscula: ${err.message}`);
  }

  // Senha sem número
  gen.senha = 'Abcdefgh!!!!';
  try {
    gen.gerar(0);
    assert(false, 'deveria rejeitar senha sem número');
  } catch (err) {
    assert(true, `rejeita sem número: ${err.message}`);
  }

  // Senha sem símbolo
  gen.senha = 'Abcdefgh1234';
  try {
    gen.gerar(0);
    assert(false, 'deveria rejeitar senha sem símbolo');
  } catch (err) {
    assert(true, `rejeita sem símbolo: ${err.message}`);
  }

  // Senha válida
  gen.senha = 'Abcdefgh1234!';
  const id = gen.gerar(0);
  assert(id.senha === 'Abcdefgh1234!', 'aceita senha válida');
});

test('Regra de nick por bloco de 4', () => {
  const gen = new Gerador({
    base: 'tamer',
    preset: 'numeros',
    senha: 'Abcdefgh1234!',
  });

  // Bloco 0 (contas 0-3): tamer + 1,2,3,4
  const id0 = gen.gerar(0);
  assert(id0.nick === 'tamer1', `conta 0 → nick "tamer1" (esperado)`);

  const id1 = gen.gerar(1);
  assert(id1.nick === 'tamer2', `conta 1 → nick "tamer2"`);

  const id3 = gen.gerar(3);
  assert(id3.nick === 'tamer4', `conta 3 → nick "tamer4"`);

  // Bloco 1 (contas 4-7): tamer2 + 1,2,3,4
  gen.gerador = new Gerador({ base: 'tamer', preset: 'numeros', senha: 'Abcdefgh1234!' });
  for (let i = 0; i < 4; i++) gen.gerar(i); // preenche bloco 0
  const id4 = gen.gerar(4);
  assert(id4.nick === 'tamer21', `conta 4 → nick "tamer21" (bloco 1, base "tamer2")`);

  const id5 = gen.gerar(5);
  assert(id5.nick === 'tamer22', `conta 5 → nick "tamer22"`);
});

test('E-mail derivado do nick', () => {
  const gen = new Gerador({
    base: 'tamer',
    preset: 'numeros',
    senha: 'Abcdefgh1234!',
  });

  const id = gen.gerar(0);
  assert(id.email === 'tamer1@gmail.com', `e-mail correto: ${id.email}`);
  assert(id.email.endsWith('@gmail.com'), 'sempre termina em @gmail.com');
});

test('Presets disponíveis', () => {
  const presets = Gerador.presets();
  assert(presets.length === 10, `10 presets disponíveis`);
  assert(presets.includes('numeros'), 'preset "numeros" existe');
  assert(presets.includes('animais'), 'preset "animais" existe');
  assert(presets.includes('elementos'), 'preset "elementos" existe');
});

test('Preset customizado', () => {
  const custom = ['a1', 'a2', 'a3', 'a4'];
  const valida = Gerador.validarCustom(custom);
  assert(valida.ok, 'customizado válido');

  const gen = new Gerador({
    base: 'custom',
    customNicks: custom,
    senha: 'Abcdefgh1234!',
  });

  const id = gen.gerar(0);
  assert(id.nick === 'customa1', `nick customizado: ${id.nick}`);
});

test('Rejeição de sufixos inválidos', () => {
  // Com ponto
  let valida = Gerador.validarCustom(['a.1']);
  assert(!valida.ok, `rejeita sufixo com ponto`);

  // Com underscore
  valida = Gerador.validarCustom(['a_1']);
  assert(!valida.ok, `rejeita sufixo com underscore`);

  // Com caractere especial
  valida = Gerador.validarCustom(['a-1']);
  assert(!valida.ok, `rejeita sufixo com hífen`);

  // Vazio
  valida = Gerador.validarCustom([]);
  assert(!valida.ok, `rejeita lista vazia`);

  // Mais de 10
  valida = Gerador.validarCustom(Array.from({ length: 11 }, (_, i) => i.toString()));
  assert(!valida.ok, `rejeita > 10 sufixos`);
});

test('Lote de 10', () => {
  const gen = new Gerador({
    base: 'lote',
    preset: 'numeros',
    senha: 'Abcdefgh1234!',
  });

  const lote = gen.gerarLote(10);
  assert(lote.length === 10, '10 identidades geradas');

  // Todos únicos
  const nicks = new Set(lote.map((l) => l.nick));
  const emails = new Set(lote.map((l) => l.email));
  assert(nicks.size === 10, 'todos os nicks são únicos');
  assert(emails.size === 10, 'todos os e-mails são únicos');

  // Senha igual
  assert(lote.every((l) => l.senha === 'Abcdefgh1234!'), 'senha igual para todos');

  // Nicks esperados
  assert(lote[0].nick === 'lote1', `nick[0] = "lote1"`);
  assert(lote[3].nick === 'lote4', `nick[3] = "lote4"`);
  assert(lote[4].nick === 'lote21', `nick[4] = "lote21" (bloco 1)`);
  assert(lote[9].nick === 'lote32', `nick[9] = "lote32" (bloco 2)`);
});

test('Info de presets', () => {
  const info = Gerador.infoPreset('numeros');
  assert(info.sufixos.length === 10, 'preset numeros tem 10 sufixos');
  assert(info.sufixos[0] === '1', 'primeiro sufixo é "1"');

  const infoAnimais = Gerador.infoPreset('animais');
  assert(infoAnimais.sufixos.includes('tigre'), 'preset animais inclui "tigre"');
});

console.log('\n' + '='.repeat(50));
console.log('✅ Todos os testes do gerador passaram!');
console.log('='.repeat(50));
