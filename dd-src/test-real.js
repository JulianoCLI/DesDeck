#!/usr/bin/env node
/**
 * Teste Real das Contas — Headless Mode
 *
 * Le o estado real do DesDeck (read-only, sem quarantine), extrai cookies
 * das particoes e testa conexao WebSocket headless para cada conta.
 *
 * Uso: .\node_modules\electron\dist\electron.exe test-real.js
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { app, safeStorage } = require('electron');

const TIMEOUT_MS = 25000;
// O perfil REAL do app, nao um nome chutado (ver perfil-real.js).
const DATA_DIR = require('./perfil-real').usar();
const AAD_STATE = 'digideck/state/v2';

// Usa a MESMA pasta de dados do app: as particoes (cookies) vivem aqui.
app.setPath('userData', DATA_DIR);

const unb64 = (s) => Buffer.from(String(s), 'base64');

function openBox(key, box, aad) {
  const d = crypto.createDecipheriv('aes-256-gcm', key, unb64(box.iv));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(unb64(box.tag));
  return Buffer.concat([d.update(unb64(box.ct)), d.final()]);
}

// Leitura read-only: nunca escreve, nunca faz quarantine.
function readState(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const parsed = JSON.parse(raw);

  if (parsed && parsed.format === 'digideck-vault') {
    if (parsed.mode === 'password') throw new Error('cofre protegido por senha mestra');
    let key;
    if (parsed.mode === 'dpapi') key = Buffer.from(safeStorage.decryptString(unb64(parsed.key)), 'base64');
    else if (parsed.mode === 'raw') key = unb64(parsed.key);
    else throw new Error('modo desconhecido: ' + parsed.mode);
    return JSON.parse(openBox(key, parsed.data, AAD_STATE).toString('utf8'));
  }

  return parsed; // formato antigo (JSON aberto)
}

async function main() {
  await app.whenReady();

  console.log('\n=== TESTE REAL - HEADLESS MODE ===\n');
  console.log('Data dir:', DATA_DIR);
  console.log('DPAPI disponivel:', safeStorage.isEncryptionAvailable());

  const stateFile = path.join(DATA_DIR, 'digideck.json');
  if (!fs.existsSync(stateFile)) {
    console.error('\nERRO: digideck.json nao encontrado');
    return finish(1);
  }

  let state;
  try {
    state = readState(stateFile);
  } catch (err) {
    console.error('\nERRO ao ler estado:', err.message);
    return finish(1);
  }

  const accounts = (state.accounts || []).filter((a) => a && a.id);
  console.log(`Contas no estado: ${accounts.length}\n`);

  if (!accounts.length) {
    console.error('ERRO: nenhuma conta no estado');
    return finish(1);
  }

  const results = [];
  for (const acc of accounts) {
    results.push(await testAccount(acc));
  }

  console.log('\n=== RESULTADO ===\n');
  for (const r of results) {
    console.log(`[${r.ok ? 'PASS' : 'FAIL'}] ${r.name}`);
    console.log(`       cookies: ${r.cookies ? 'sim (' + r.cookieCount + ')' : 'nao'}`);
    console.log(`       socket:  ${r.socket || '-'}`);
    if (r.data) {
      console.log(`       nivel ${r.data.nivel} | ${r.data.bits} bits | local ${r.data.local || '-'} | ativo ${r.data.ativoId || '-'}`);
    }
    if (r.error) console.log(`       erro: ${r.error}`);
    console.log('');
  }

  const pass = results.filter((r) => r.ok).length;
  console.log(`Total: ${pass}/${results.length} contas conectaram em headless\n`);
  finish(pass > 0 ? 0 : 1);
}

async function testAccount(acc) {
  const result = { name: acc.name || acc.id, ok: false, cookies: false, cookieCount: 0, socket: null, data: null, error: null };
  const partition = `persist:acc-${acc.id}`;

  console.log(`--- ${result.name} (${acc.id})`);
  console.log(`    url: ${acc.url || '-'}`);

  let cookieHeader = null;
  try {
    const { getCookieHeader } = require('./src/headless/cookies');
    cookieHeader = await getCookieHeader(partition);
  } catch (err) {
    result.error = `cookies: ${err.message}`;
    console.log(`    cookies: ERRO (${err.message})`);
    return result;
  }

  if (!cookieHeader) {
    result.error = 'sem sessao na particao (faca login na conta uma vez na UI)';
    console.log('    cookies: NAO (sem digiclone_sessao)');
    return result;
  }

  result.cookies = true;
  result.cookieCount = cookieHeader.split(';').length;
  console.log(`    cookies: OK (${result.cookieCount})`);

  const { DigiiIdleHeadlessClient } = require('./src/headless/client');
  const client = new DigiiIdleHeadlessClient(0, partition, { name: result.name });

  return new Promise((resolve) => {
    let done = false;
    const end = (ok, socket, error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      result.ok = ok;
      result.socket = socket;
      if (error) result.error = error;
      try { client.disconnect(); } catch { /* ignora */ }
      resolve(result);
    };

    const timer = setTimeout(() => {
      console.log('    socket:  TIMEOUT (sem estado em 25s)');
      end(false, 'timeout', 'nao recebeu estado em 25s');
    }, TIMEOUT_MS);

    client.on('connected', () => console.log('    socket:  conectado, aguardando estado...'));

    client.on('update', () => {
      const st = client.state;
      result.data = { nivel: st.nivel, bits: st.bits, local: st.local, ativoId: st.ativoId };
      console.log(`    socket:  OK - nivel ${st.nivel}, ${st.bits} bits, local ${st.local || '-'}`);
      end(true, 'connected');
    });

    client.on('error', (msg) => {
      console.log(`    socket:  ERRO (${msg})`);
      end(false, 'error', msg);
    });

    client.on('status', (s) => {
      if (s === 'failed') end(false, 'failed', client.lastError || 'falha permanente');
    });

    client.connect();
  });
}

function finish(code) {
  setTimeout(() => app.exit(code), 200);
}

main().catch((err) => {
  console.error('ERRO FATAL:', err);
  finish(1);
});
