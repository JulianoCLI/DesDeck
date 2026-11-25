#!/usr/bin/env node
/**
 * Mostra, por conta, se a particao tem o cookie de sessao que o headless
 * precisa - a causa mais comum de "disconnected" ao ligar o modo.
 *
 * Read-only: nao muda nada. O DesDeck pode estar aberto, mas feche-o antes se
 * quiser o estado ja gravado em disco (os cookies sao escritos preguicosamente).
 *
 * Uso: .\node_modules\electron\dist\electron.exe diag-sessoes.js
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { app, safeStorage, session } = require('electron');

// O perfil REAL do app, nao um nome chutado (ver perfil-real.js).
const DATA_DIR = require('./perfil-real').usar();
const AAD_STATE = 'digideck/state/v2';
app.setPath('userData', DATA_DIR);

const SAIDA = path.join(__dirname, 'sessoes-report.txt');
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

async function main() {
  await app.whenReady();
  log('=== SESSAO DE CADA CONTA ===');
  log('(o headless reusa o cookie do login feito na webview)\n');

  const state = readState(path.join(DATA_DIR, 'digideck.json'));
  const bootHeadless = !!state.settings?.bootHeadless;
  log(`"iniciar todas em headless": ${bootHeadless ? 'LIGADO' : 'desligado'}\n`);

  let semSessao = 0;
  for (const acc of (state.accounts || []).filter((a) => a && a.id)) {
    const ses = session.fromPartition(`persist:acc-${acc.id}`);
    const cs = await ses.cookies.get({ url: 'https://digiidle.com/' });
    const sessao = cs.find((c) => c.name === 'digiclone_sessao');
    // O modo efetivo, pela mesma regra do app (headless tri-estado).
    const modo = typeof acc.headless === 'boolean' ? (acc.headless ? 'headless' : 'webview') : (bootHeadless ? 'headless (pela preferencia)' : 'webview');
    const quando = sessao && sessao.expirationDate ? new Date(sessao.expirationDate * 1000).toISOString().slice(0, 10) : '-';
    if (!sessao) semSessao++;
    log(`${acc.name}`);
    log(`  modo: ${modo}`);
    log(`  cookies: ${cs.length} | digiclone_sessao: ${sessao ? 'SIM (expira ' + quando + ')' : 'NAO <-- headless nao vai conectar'}`);
  }

  log('');
  if (semSessao) {
    log(`${semSessao} conta(s) sem sessao. Para cada uma: deixe-a em modo webview,`);
    log('faca login no jogo, e so entao ligue o headless. O cookie e HttpOnly e');
    log('so e criado pelo login na pagina - o headless nao tem como fazer login.');
  } else {
    log('todas as contas tem sessao: o headless pode conectar.');
  }

  setTimeout(() => app.exit(0), 200);
}
main().catch((e) => { log('FATAL: ' + e.message); setTimeout(() => app.exit(1), 200); });
