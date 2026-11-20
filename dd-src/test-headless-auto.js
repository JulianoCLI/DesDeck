#!/usr/bin/env node
/**
 * Teste automatizado Fase 1: Conexão Headless
 *
 * Este script:
 * 1. Lê o estado salvo (digideck.json) do app
 * 2. Encontra a primeira conta
 * 3. Extrai cookies da partição dessa conta
 * 4. Conecta ao WebSocket do DigiIdle
 * 5. Aguarda estado chegar
 * 6. Reporta sucesso/falha
 *
 * RUN: node test-headless-auto.js
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { app, session } = require('electron');
const { DigiiIdleHeadlessClient } = require('./src/headless/client');
const { getCookieHeader } = require('./src/headless/cookies');

const TEST_TIMEOUT_MS = 20000;
const RESULTS = {
  passed: [],
  failed: [],
};

async function main() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   TESTE AUTOMATIZADO FASE 1 HEADLESS   ║');
  console.log('╚════════════════════════════════════════╝\n');

  // Aguarda Electron estar pronto
  await app.whenReady();
  console.log('✓ Electron pronto\n');

  // Encontra o arquivo de estado
  const userDataPath = app.getPath('userData');
  const stateFile = path.join(userDataPath, 'digideck.json');

  console.log(`📁 Procurando estado em: ${stateFile}`);

  if (!fs.existsSync(stateFile)) {
    console.error('✗ ERRO: arquivo digideck.json não encontrado!');
    console.error('  (Execute o DesDeck e faça login primeiro)\n');
    app.quit();
    process.exit(1);
  }

  let state;
  try {
    const data = fs.readFileSync(stateFile, 'utf8');
    state = JSON.parse(data);
  } catch (err) {
    console.error('✗ ERRO ao ler digideck.json:', err.message);
    app.quit();
    process.exit(1);
  }

  const accounts = state.accounts || [];
  if (!accounts.length) {
    console.error('✗ ERRO: Nenhuma conta encontrada!');
    console.error('  (Faça login no DesDeck primeiro)\n');
    app.quit();
    process.exit(1);
  }

  console.log(`✓ Encontrado ${accounts.length} conta(s)\n`);

  // Testa cada conta
  for (const acc of accounts) {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🧪 Testando: ${acc.name} (${acc.id})`);
    console.log(`   URL: ${acc.url}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    const result = await testAccount(acc);
    if (result.ok) {
      RESULTS.passed.push({ ...acc, ...result });
    } else {
      RESULTS.failed.push({ ...acc, error: result.error });
    }
    console.log('');
  }

  // Resumo final
  console.log('╔════════════════════════════════════════╗');
  console.log('║          RESULTADO FINAL               ║');
  console.log('╚════════════════════════════════════════╝\n');

  console.log(`✓ PASSOU:  ${RESULTS.passed.length} conta(s)`);
  for (const acc of RESULTS.passed) {
    console.log(`  • ${acc.name} — nível ${acc.nivel}, ${acc.bits} bits, hunt: ${acc.hunt || '—'}`);
  }

  console.log(`\n✗ FALHOU:  ${RESULTS.failed.length} conta(s)`);
  for (const acc of RESULTS.failed) {
    console.log(`  • ${acc.name} — ${acc.error}`);
  }

  const allPassed = RESULTS.failed.length === 0;
  console.log('\n' + (allPassed ? '✓✓✓ FASE 1 PASSOU!' : '✗✗✗ ALGUNS TESTES FALHARAM'));
  console.log('\n');

  app.quit();
  process.exit(allPassed ? 0 : 1);
}

async function testAccount(acc) {
  const partition = `persist:acc-${acc.id}`;

  // 1. Extrai cookies
  console.log(`  1️⃣  Extraindo cookies da partição...`);
  const cookieHeader = await getCookieHeader(partition);
  if (!cookieHeader) {
    console.log(`     ✗ Sem cookies (conta não autenticada?)`);
    return { ok: false, error: 'Sem cookies' };
  }
  console.log(`     ✓ Cookies extraídos (${cookieHeader.length} bytes)`);

  // 2. Cria cliente
  console.log(`  2️⃣  Criando cliente headless...`);
  const client = new DigiiIdleHeadlessClient(0, partition, { name: acc.name });
  console.log(`     ✓ Cliente criado`);

  // 3. Conecta
  console.log(`  3️⃣  Conectando ao WebSocket...`);
  let connected = false;
  let gotState = false;
  let errorMsg = null;

  const connectTimeout = setTimeout(() => {
    if (!connected) {
      errorMsg = 'Timeout na conexão (> 15s)';
      client.disconnect();
    }
  }, TEST_TIMEOUT_MS);

  return new Promise((resolve) => {
    client.on('connected', () => {
      connected = true;
      console.log(`     ✓ Conectado ao WebSocket`);
    });

    client.on('update', () => {
      gotState = true;
      console.log(`     ✓ Estado recebido (nível: ${client.state.nivel}, bits: ${client.state.bits})`);

      clearTimeout(connectTimeout);
      client.disconnect();

      resolve({
        ok: true,
        nivel: client.state.nivel,
        bits: client.state.bits,
        hunt: client.state.hunt,
        ativoId: client.state.ativoId,
      });
    });

    client.on('error', (msg) => {
      console.log(`     ✗ Erro: ${msg}`);
      errorMsg = msg;
      clearTimeout(connectTimeout);
      client.disconnect();
    });

    client.on('status', (status) => {
      if (status === 'failed') {
        clearTimeout(connectTimeout);
        resolve({
          ok: false,
          error: errorMsg || 'Cliente reportou falha',
        });
      }
    });

    client.connect();

    // Fallback: se nada acontecer em TEST_TIMEOUT_MS
    setTimeout(() => {
      if (!gotState && !errorMsg) {
        clearTimeout(connectTimeout);
        client.disconnect();
        resolve({
          ok: false,
          error: `Nenhum estado recebido em ${TEST_TIMEOUT_MS}ms`,
        });
      }
    }, TEST_TIMEOUT_MS);
  });
}

main().catch((err) => {
  console.error('❌ Erro fatal:', err.message);
  console.error(err.stack);
  app.quit();
  process.exit(1);
});
