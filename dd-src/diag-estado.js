#!/usr/bin/env node
/**
 * Mostra as chaves do estado que decidem se uma conta sobe e em que modo.
 * Read-only.
 *
 * Uso: .\node_modules\electron\dist\electron.exe diag-estado.js
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { app, safeStorage } = require('electron');

// O perfil REAL do app, nao um nome chutado (ver perfil-real.js).
const DATA_DIR = require('./perfil-real').usar();
const AAD_STATE = 'digideck/state/v2';
app.setPath('userData', DATA_DIR);

const SAIDA = path.join(__dirname, 'estado-report.txt');
const linhas = [];
const log = (...a) => { linhas.push(a.join(' ')); try { fs.writeFileSync(SAIDA, linhas.join('\n') + '\n'); } catch { /* ignora */ } };

const unb64 = (s) => Buffer.from(String(s), 'base64');
function openBox(key, box, aad) {
  const d = crypto.createDecipheriv('aes-256-gcm', key, unb64(box.iv));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(unb64(box.tag));
  return Buffer.concat([d.update(unb64(box.ct)), d.final()]);
}
function readState(file) {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  if (parsed && parsed.format === 'digideck-vault') {
    const key = Buffer.from(safeStorage.decryptString(unb64(parsed.key)), 'base64');
    return JSON.parse(openBox(key, parsed.data, AAD_STATE).toString('utf8'));
  }
  return parsed;
}

app.whenReady().then(() => {
  const s = readState(path.join(DATA_DIR, 'digideck.json'));
  log('=== ESTADO ===\n');
  log('settings relevantes:');
  for (const k of ['bootHeadless', 'economy', 'closeToTray']) log(`  ${k}: ${s.settings?.[k]}`);
  log(`\nui: ${JSON.stringify(s.ui)}`);
  log(`\ngrupos: ${(s.groups || []).map((g) => `${g.name}(${g.id}) limit=${g.limit}`).join(', ')}`);
  log('\ncontas:');
  for (const a of (s.accounts || [])) {
    log(`  ${a.name}: enabled=${a.enabled} headless=${JSON.stringify(a.headless)} groupId=${a.groupId} alwaysRender=${a.alwaysRender} url=${a.url}`);
  }
  log('\nultimas linhas do log do app:');
  for (const e of (s.log || []).slice(-15)) log(`  [${e.type}] ${e.acc || ''} ${e.msg}`);
  setTimeout(() => app.exit(0), 200);
}).catch((e) => { log('FATAL: ' + e.message); setTimeout(() => app.exit(1), 200); });
