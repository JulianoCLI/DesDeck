#!/usr/bin/env node
/**
 * Quais ferramentas estao LIGADAS em cada conta, lendo o estado real do app.
 * Read-only: nao muda nada e nao conecta em lugar nenhum.
 *
 * Uso: .\node_modules\electron\dist\electron.exe diag-tools-cfg.js
 */
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { app, safeStorage } = require('electron');

const DATA_DIR = require('./perfil-real').usar();
const AAD_STATE = 'digideck/state/v2';

const SAIDA = path.join(__dirname, 'tools-cfg-report.txt');
const linhas = [];
const log = (...a) => {
  const t = a.join(' ');
  linhas.push(t);
  console.log(t);
  try { fs.writeFileSync(SAIDA, linhas.join('\n') + '\n'); } catch { /* ignora */ }
};

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

// Quais ferramentas sao ligadas de fabrica (padraoLigado) no renderer.
function padroesLigados() {
  const src = fs.readFileSync(path.join(__dirname, 'src/renderer/tools.js'), 'utf8');
  const out = {};
  for (const m of src.matchAll(/id:\s*'([\w-]+)'[\s\S]{0,900}?padraoLigado:\s*(true|false)/g)) {
    out[m[1]] = m[2] === 'true';
  }
  return out;
}

async function main() {
  await app.whenReady();
  log('=== FERRAMENTAS LIGADAS POR CONTA (estado real) ===\n');
  log('perfil: ' + DATA_DIR + '\n');

  const state = readState(path.join(DATA_DIR, 'digideck.json'));
  const padrao = padroesLigados();
  log('padraoLigado (de fabrica): ' + JSON.stringify(padrao) + '\n');

  const tools = state.tools || {};
  const ids = new Set([...Object.keys(tools), ...Object.keys(padrao)]);

  // A mesma regra do renderer: toolLigada()
  const ligada = (conf, id) =>
    (conf && typeof conf.enabled === 'boolean') ? conf.enabled : !!padrao[id];

  // As tres que dependem de PEDIR e ESPERAR resposta do servidor.
  const PEDEM_RESPOSTA = new Set(['hunt', 'lab', 'sniper']);

  const contagem = {};
  for (const acc of state.accounts || []) {
    const on = [];
    for (const id of ids) {
      const conf = (tools[id] || {})[acc.id];
      if (ligada(conf, id)) {
        on.push(PEDEM_RESPOSTA.has(id) ? id.toUpperCase() + '*' : id);
        contagem[id] = (contagem[id] || 0) + 1;
      }
    }
    const modo = typeof acc.headless === 'boolean'
      ? (acc.headless ? 'headless' : 'webview')
      : (state.settings?.bootHeadless ? 'headless(pref)' : 'webview');
    log(`${String(acc.name).padEnd(14)} [${modo.padEnd(14)}] ${on.join(', ') || '(nenhuma)'}`);
  }

  log('\n* = ferramenta que PEDE e ESPERA resposta do servidor (offline.cfg / lab.info)');
  log('\ntotal de contas com cada ferramenta ligada:');
  for (const [id, n] of Object.entries(contagem).sort((a, b) => b[1] - a[1])) {
    log(`  ${id.padEnd(10)} ${n}`);
  }

  log('\n--- config crua de hunt e lab ---');
  for (const id of ['hunt', 'lab']) {
    const porConta = tools[id];
    if (!porConta) { log(`  ${id}: NENHUM registro salvo (usa o padrao: ${!!padrao[id]})`); continue; }
    const amostra = Object.entries(porConta).slice(0, 3);
    log(`  ${id}: ${Object.keys(porConta).length} registro(s). amostra:`);
    for (const [accId, conf] of amostra) log(`    ${accId}: ${JSON.stringify(conf)}`);
  }

  setTimeout(() => app.exit(0), 300);
}

main().catch((err) => { log('FALHOU: ' + (err && err.stack || err)); setTimeout(() => app.exit(1), 300); });
