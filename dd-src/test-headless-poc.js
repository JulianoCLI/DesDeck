#!/usr/bin/env node
/**
 * PoC de teste da Fase 1: conexão headless básica.
 * 
 * USO:
 *   node test-headless-poc.js /caminho/para/perfil-chrome
 * 
 * Este script:
 * 1. Inicia o Electron de forma headless
 * 2. Extrai cookies de uma partição existente
 * 3. Conecta ao WebSocket do DigiIdle
 * 4. Aguarda 30 segundos de eventos
 * 5. Verifica se recebeu estado/ovos/etc
 */

const { app, session } = require('electron');
const { DigiiIdleHeadlessClient } = require('./src/headless/client');
const { getCookieHeader } = require('./src/headless/cookies');

const TEST_PARTITION = 'persist:acc-demo';
const TEST_TIMEOUT_MS = 30000;

async function main() {
  console.log('[test] Iniciando PoC headless...');

  // Espera o Electron estar pronto
  await app.whenReady();

  console.log('[test] Electron pronto. Testando extração de cookies...');
  const cookies = await getCookieHeader(TEST_PARTITION);

  if (!cookies) {
    console.error('[test] ERRO: Nenhum cookie encontrado na partição', TEST_PARTITION);
    console.error('[test]       Você precisa fazer login dentro dessa conta antes!');
    app.quit();
    process.exit(1);
  }

  console.log('[test] ✓ Cookies extraídos:', cookies.length, 'bytes');

  // Cria cliente
  const client = new DigiiIdleHeadlessClient(0, TEST_PARTITION, { name: 'Teste PoC' });

  let gotEstado = false;
  let gotOvos = false;
  let gotBattle = false;

  client.on('update', () => {
    console.log('[test] ✓ recebido estado:', {
      nivel: client.state.nivel,
      bits: client.state.bits,
      hunt: client.state.hunt,
      ativoId: client.state.ativoId,
    });
    gotEstado = true;
  });

  client.on('status', (status) => {
    console.log('[test] status muda para:', status);
  });

  client.on('error', (msg) => {
    console.error('[test] ERRO do cliente:', msg);
  });

  client.on('connected', () => {
    console.log('[test] ✓ Conectado ao WebSocket');
  });

  client.on('disconnected', () => {
    console.log('[test] ✗ Desconectado');
  });

  client.on('battle', (ev) => {
    console.log('[test] ✓ Evento de batalha:', ev.ev?.length, 'events');
    gotBattle = true;
  });

  // Inicia conexão
  console.log('[test] Conectando...');
  client.connect();

  // Aguarda timeout
  await new Promise((resolve) => setTimeout(resolve, TEST_TIMEOUT_MS));

  console.log('\n[test] ===== RESULTADO FINAL =====');
  console.log('[test] Status:', client.status);
  console.log('[test] Recebido estado?', gotEstado ? '✓ SIM' : '✗ NÃO');
  console.log('[test] Recebido ovos?', gotOvos ? '✓ SIM' : '✗ NÃO');
  console.log('[test] Recebido batalha?', gotBattle ? '✓ SIM' : '✗ NÃO');

  if (gotEstado && client.status === 'connected') {
    console.log('[test] ✓✓✓ PoC PASSOU — headless está funcionando!');
  } else {
    console.error('[test] ✗✗✗ PoC FALHOU');
  }

  client.disconnect();
  app.quit();
  process.exit(gotEstado && client.status === 'connected' ? 0 : 1);
}

main().catch((err) => {
  console.error('[test] Erro fatal:', err);
  app.quit();
  process.exit(1);
});
