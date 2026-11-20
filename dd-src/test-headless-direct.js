#!/usr/bin/env node
/**
 * Teste Headless Direto (Sem UI)
 * 
 * Lê estado salvo (decrypt automaticamente) e testa conexão
 * Não precisa de UI ou login manual
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { app, safeStorage, session } = require('electron');
const { Vault } = require('./src/vault');
const { DigiiIdleHeadlessClient } = require('./src/headless/client');
const { getCookieHeader } = require('./src/headless/cookies');

const TEST_TIMEOUT_MS = 20000;

// Define userData igual ao main.js
app.setAppUserModelId('com.desdeck.app');

async function main() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   TESTE HEADLESS — LEITURA DIRETA      ║');
  console.log('╚════════════════════════════════════════╝\n');

  // 1. Aguarda Electron estar pronto (precisa de safeStorage)
  await app.whenReady();
  console.log('✓ Electron pronto (DPAPI disponível)\n');

  // 2. Lê e descriptografa o estado
  // Usa caminho direto do DigiDeck (definido no main.js)
  const userDataPath = path.join(os.homedir(), 'AppData', 'Roaming', 'DigiDeck');
  const stateFile = path.join(userDataPath, 'digideck.json');

  console.log(`📁 Lendo estado: ${stateFile}`);

  if (!fs.existsSync(stateFile)) {
    console.error('✗ Arquivo não encontrado!');
    console.error('  (Abra o DesDeck, faça login, e tente novamente)');
    app.quit();
    process.exit(1);
  }

  let state;
  try {
    const vault = new Vault(stateFile, safeStorage);
    const loadInfo = vault.load();
    state = loadInfo.state;
    if (!state) {
      console.error('✗ Estado vazio ou cofre trancado');
      app.quit();
      process.exit(1);
    }
    console.log('✓ Estado lido e descriptografado\n');
  } catch (err) {
    console.error('✗ Erro ao ler/descriptografar:', err.message);
    app.quit();
    process.exit(1);
  }

  // 3. Lista contas
  const accounts = state.accounts || [];
  console.log(`📊 Contas encontradas: ${accounts.length}\n`);

  if (!accounts.length) {
    console.error('✗ Nenhuma conta no estado!');
    app.quit();
    process.exit(1);
  }

  // 4. Testa cada conta
  let passCount = 0;
  let failCount = 0;

  for (const acc of accounts) {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🧪 ${acc.name} (${acc.id})`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    const passed = await testAccount(acc);
    if (passed) {
      passCount++;
    } else {
      failCount++;
    }

    console.log('');
  }

  // 5. Resumo
  console.log('╔════════════════════════════════════════╗');
  console.log('║          RESULTADO FINAL               ║');
  console.log('╚════════════════════════════════════════╝\n');

  console.log(`✓ PASSOU:  ${passCount} conta(s)`);
  console.log(`✗ FALHOU:  ${failCount} conta(s)\n`);

  if (failCount === 0) {
    console.log('✓✓✓ FASE 1 APROVADA — HEADLESS FUNCIONA!');
  } else {
    console.log('✗✗✗ Alguns testes falharam');
  }

  console.log('\n');

  app.quit();
  process.exit(failCount === 0 ? 0 : 1);
}

async function testAccount(acc) {
  const partition = `persist:acc-${acc.id}`;

  // 1. Cookies
  console.log('  1️⃣  Cookies...');
  const cookieHeader = await getCookieHeader(partition);
  if (!cookieHeader) {
    console.log('     ✗ Sem cookies (não autenticada)');
    return false;
  }
  console.log('     ✓ OK');

  // 2. Cliente
  console.log('  2️⃣  Conectando...');
  const client = new DigiiIdleHeadlessClient(0, partition, { name: acc.name });

  return new Promise((resolve) => {
    let gotData = false;

    const timeout = setTimeout(() => {
      client.disconnect();
      if (!gotData) {
        console.log('     ✗ Timeout');
        resolve(false);
      }
    }, TEST_TIMEOUT_MS);

    client.on('update', () => {
      gotData = true;
      console.log(`     ✓ Conectado`);
      console.log(`\n     📊 Estado:`);
      console.log(`        Nível: ${client.state.nivel}`);
      console.log(`        Bits: ${client.state.bits}`);
      console.log(`        Hunt: ${client.state.hunt || '—'}`);
      console.log(`        Ativo: ${client.state.ativoId || '—'}\n`);

      clearTimeout(timeout);
      client.disconnect();
      resolve(true);
    });

    client.on('error', (msg) => {
      console.log(`     ✗ ${msg}`);
      clearTimeout(timeout);
      client.disconnect();
      resolve(false);
    });

    client.on('status', (status) => {
      if (status === 'failed') {
        clearTimeout(timeout);
        client.disconnect();
        resolve(false);
      }
    });

    client.connect();
  });
}

main().catch((err) => {
  console.error('❌ Erro:', err.message);
  app.quit();
  process.exit(1);
});
