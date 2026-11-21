#!/usr/bin/env node
/**
 * Reproduz o que acontece ao ligar o headless na mao, pelo caminho REAL
 * (manager -> client -> eventos), e mostra o que a UI receberia.
 *
 * Responde ao sintoma "aparece disconnected e nao sei por que": qual status
 * chega, em que ordem, e se vem alguma mensagem de erro junto.
 *
 * Nao muta conta nenhuma: so conecta e desconecta.
 *
 * Uso: .\node_modules\electron\dist\electron.exe test-toggle-headless.js [nome-da-conta]
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { app, safeStorage, session } = require('electron');

// O perfil REAL do app, nao um nome chutado (ver perfil-real.js).
const DATA_DIR = require('./perfil-real').usar();
const AAD_STATE = 'digideck/state/v2';
app.setPath('userData', DATA_DIR);

const SAIDA = path.join(__dirname, 'toggle-report.txt');
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
  const alvo = process.argv[2];
  log('=== LIGAR O HEADLESS NA MAO: O QUE A UI RECEBE ===\n');

  const state = readState(path.join(DATA_DIR, 'digideck.json'));
  const contas = (state.accounts || []).filter((a) => a && a.id);
  const acc = alvo ? contas.find((a) => a.name === alvo) : contas[0];
  if (!acc) { log('conta nao encontrada. existentes: ' + contas.map((a) => a.name).join(', ')); return finish(1); }
  log(`conta: ${acc.name}\n`);

  // O cookie, antes de tudo: e a causa mais comum da falha.
  const ses = session.fromPartition(`persist:acc-${acc.id}`);
  const cs = await ses.cookies.get({ url: 'https://digiidle.com/' });
  log(`cookies na particao: ${cs.length} | digiclone_sessao: ${cs.some((c) => c.name === 'digiclone_sessao') ? 'SIM' : 'NAO'}\n`);

  const { HeadlessManager } = require('./src/headless/manager');
  const mgr = new HeadlessManager();

  // Exatamente o que o main.js reenvia para o renderer.
  log('eventos que a UI receberia:');
  const t0 = Date.now();
  const ms = () => String(Date.now() - t0).padStart(5) + 'ms';
  mgr.on('account:status', ({ status }) => log(`  ${ms()}  status -> ${status}`));
  mgr.on('account:error', ({ message }) => log(`  ${ms()}  ERRO   -> ${message}`));
  mgr.on('account:update', () => log(`  ${ms()}  update (estado do jogo chegou)`));

  mgr.start(acc.id, `persist:acc-${acc.id}`, { name: acc.name });
  await new Promise((r) => setTimeout(r, 25000));

  const st = mgr.getStatus(acc.id);
  log('');
  log(`status final: ${st.status}`);
  log(`erro guardado: ${st.error || '(nenhum)'}`);
  log('');
  if (st.status === 'connected') {
    log('CONECTOU: o modo headless funciona nesta conta.');
  } else if (!cs.some((c) => c.name === 'digiclone_sessao')) {
    log('NAO CONECTOU, e a causa e clara: a particao nao tem o cookie de sessao.');
    log('O headless nao faz login - ele reusa a sessao do login feito na pagina.');
    log('Deixe a conta em webview, entre no jogo, e so depois ligue o headless.');
  } else {
    log('NAO CONECTOU mesmo com cookie: ver a mensagem de erro acima.');
  }

  mgr.stopAll();
  finish(0);
}

function finish(c) { setTimeout(() => app.exit(c), 400); }
main().catch((e) => { log('FATAL: ' + ((e && e.stack) || e)); finish(1); });
