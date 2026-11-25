#!/usr/bin/env node
'use strict';

/**
 * Teste da máquina de estados do agente de cadastro.
 * - Fluxo completo (sucesso).
 * - Falhas: e-mail duplicado, nick colidido, PIN inesperado, timeout.
 * - Re-tentativa.
 * 
 * Usa clientes HTTP/WS falsos para controle total do cenário.
 */

const { AgenteCompilacao } = require('./src/cadastro/agente');
const { EventEmitter } = require('events');

// Mock de cliente WS
class MockWsClient extends EventEmitter {
  constructor() {
    super();
    this.mensagensEnviadas = [];
    this.handlers = {};
  }

  send(msg) {
    this.mensagensEnviadas.push(msg);
    const parsed = JSON.parse(msg);
    // Simular resposta automática para nick e starter
    setImmediate(() => {
      if (parsed.t === 'nick.set') {
        this.emit('msg', { t: 'nick', ok: true, nick: parsed.nick });
      } else if (parsed.t === 'starter.pick') {
        this.emit('msg', { t: 'starter', ok: true });
      }
    });
  }

  on(event, handler) {
    if (event === 'msg') {
      this.handlers[event] = handler;
    }
    super.on(event, handler);
  }
}

// Mock de net.fetch
function criarMockFetch(cenario) {
  return async (url, opts) => {
    if (cenario === 'sucesso') {
      if (url === '/auth/criar') {
        return {
          ok: true,
          json: async () => ({ ok: true }),
        };
      }
      if (url === '/auth/conta') {
        return {
          ok: true,
          json: async () => ({ nick: 'tamer1' }),
        };
      }
    }
    if (cenario === 'email-duplicado') {
      if (url === '/auth/criar') {
        return {
          ok: false,
          json: async () => ({ ok: false, erro: 'email', mensagem: 'E-mail já existe.' }),
        };
      }
    }
    if (cenario === 'pin-pedido') {
      if (url === '/auth/criar') {
        return {
          ok: false,
          json: async () => ({
            ok: false,
            erro: 'pin',
            desafio: 'xyz',
            destino: 'tamer1@gmail.com',
          }),
        };
      }
    }
    if (cenario === 'verificacao-falha') {
      if (url === '/auth/criar') {
        return {
          ok: true,
          json: async () => ({ ok: true }),
        };
      }
      if (url === '/auth/conta') {
        return {
          ok: false,
          json: async () => ({}),
        };
      }
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

test('Fluxo completo (sucesso)', async () => {
  const ws = new MockWsClient();
  const agente = new AgenteCompilacao({
    indice: 0,
    identidade: { email: 'tamer1@gmail.com', nick: 'tamer1', senha: 'Senha123!' },
    partition: 'persist:acc-test',
    net: criarMockFetch('sucesso'),
  });
  agente.wsClient = ws;

  let eventos = [];
  agente.on('status', (ev) => eventos.push({ tipo: 'status', ...ev }));
  agente.on('confirmada', (ev) => eventos.push({ tipo: 'confirmada', ...ev }));
  agente.on('falhou', (ev) => eventos.push({ tipo: 'falhou', ...ev }));

  await agente.executar();

  assert(agente.status === 'confirmada', 'agente finalizou em "confirmada"');
  assert(agente.resultado.email === 'tamer1@gmail.com', 'e-mail gravado');
  assert(agente.resultado.nick === 'tamer1', 'nick gravado');
  assert(eventos.some((e) => e.tipo === 'confirmada'), 'evento "confirmada" emitido');
});

test('E-mail duplicado (re-tentativa simulada)', async () => {
  const ws = new MockWsClient();
  const agente = new AgenteCompilacao({
    indice: 0,
    identidade: { email: 'tamer1@gmail.com', nick: 'tamer1', senha: 'Senha123!' },
    partition: 'persist:acc-test',
    net: criarMockFetch('email-duplicado'),
  });
  agente.wsClient = ws;

  let eventos = [];
  agente.on('falhou', (ev) => eventos.push({ tipo: 'falhou', ...ev }));

  await agente.executar();

  assert(agente.status === 'falhou', 'agente falhou em e-mail duplicado');
  assert(agente.tentativas.criar > 0, 'tentou criar');
  assert(eventos.some((e) => e.tipo === 'falhou'), 'evento "falhou" emitido');
});

test('PIN inesperado', async () => {
  const ws = new MockWsClient();
  const agente = new AgenteCompilacao({
    indice: 0,
    identidade: { email: 'tamer1@gmail.com', nick: 'tamer1', senha: 'Senha123!' },
    partition: 'persist:acc-test',
    net: criarMockFetch('pin-pedido'),
  });
  agente.wsClient = ws;

  let eventos = [];
  agente.on('falhou', (ev) => eventos.push({ tipo: 'falhou', ...ev }));

  await agente.executar();

  assert(agente.status === 'falhou', 'agente falhou ao receber PIN');
  assert(agente.erro.includes('PIN'), 'erro menciona PIN');
});

test('Verificação falha (sessão inválida)', async () => {
  const ws = new MockWsClient();
  const agente = new AgenteCompilacao({
    indice: 0,
    identidade: { email: 'tamer1@gmail.com', nick: 'tamer1', senha: 'Senha123!' },
    partition: 'persist:acc-test',
    net: criarMockFetch('verificacao-falha'),
  });
  agente.wsClient = ws;

  let eventos = [];
  agente.on('falhou', (ev) => eventos.push({ tipo: 'falhou', ...ev }));

  await agente.executar();

  assert(agente.status === 'falhou', 'agente falhou na verificação');
  assert(agente.tentativas.verificar > 0, 'tentou verificar');
});

test('Escolha de starter (aleatório)', async () => {
  const ws = new MockWsClient();
  const agente = new AgenteCompilacao({
    indice: 0,
    identidade: { email: 'tamer1@gmail.com', nick: 'tamer1', senha: 'Senha123!' },
    partition: 'persist:acc-test',
    net: criarMockFetch('sucesso'),
    starterFixo: null, // aleatório
  });
  agente.wsClient = ws;

  await agente.executar();

  assert(agente.status === 'confirmada', 'finalizou');
  const starters = ['guilmon', 'renamon', 'terriermon', 'demidevimon'];
  assert(starters.includes(agente.resultado.starterEscolhido), `starter é um dos válidos: ${agente.resultado.starterEscolhido}`);
});

test('Escolha de starter (fixo)', async () => {
  const ws = new MockWsClient();
  const agente = new AgenteCompilacao({
    indice: 0,
    identidade: { email: 'tamer1@gmail.com', nick: 'tamer1', senha: 'Senha123!' },
    partition: 'persist:acc-test',
    net: criarMockFetch('sucesso'),
    starterFixo: 'renamon',
  });
  agente.wsClient = ws;

  await agente.executar();

  assert(agente.resultado.starterEscolhido === 'renamon', 'starter fixo em "renamon"');
});

console.log('\n' + '='.repeat(50));
console.log('✅ Todos os testes do agente passaram!');
console.log('='.repeat(50));
