#!/usr/bin/env node
/**
 * Quais particoes tem sessao salva e quais delas NAO pertencem a uma conta
 * ativa do app. Read-only.
 *
 * Existe porque conectar um segundo socket numa conta que ja esta no jogo faz o
 * servidor derrubar uma das duas (code 4000). Com o app rodando 8 contas em
 * headless, probar "a primeira particao que tem cookie" desconectaria uma conta
 * de verdade - o teste quebraria justamente o que deveria observar.
 *
 * Uso: .\node_modules\electron\dist\electron.exe diag-partition-livre.js
 */
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { app, session, safeStorage } = require('electron');

const DATA_DIR = require('./perfil-real').usar();
const AAD_STATE = 'digideck/state/v2';
const SAIDA = path.join(__dirname, 'partition-livre.txt');
const out = [];
const log = (...a) => { const t = a.join(' '); out.push(t); console.log(t); try { fs.writeFileSync(SAIDA, out.join('\n') + '\n'); } catch {} };

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
  const { SESSION_COOKIE } = require('./src/headless/cookies');
  const st = readState(path.join(DATA_DIR, 'digideck.json'));
  const contas = st.accounts || [];
  // A particao de uma conta e 'persist:acc-<id>' (partitionOf no app.js).
  const ativas = new Map(contas.map((a) => [`persist:acc-${a.id}`, a]));

  const dir = path.join(DATA_DIR, 'Partitions');
  const nomes = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  log(`particoes no disco: ${nomes.length} | contas no app: ${contas.length}\n`);

  const livres = [];
  for (const nome of nomes) {
    const part = `persist:${nome}`;
    let temSessao = false;
    try {
      const cks = await session.fromPartition(part).cookies.get({ url: 'https://digiidle.com/' });
      temSessao = cks.some((c) => c.name === SESSION_COOKIE);
    } catch {}
    const acc = ativas.get(part);
    const estado = acc
      ? `CONTA ATIVA "${acc.name}" (enabled=${acc.enabled} headless=${JSON.stringify(acc.headless)})`
      : 'sem conta no app';
    log(`${temSessao ? '[sessao]' : '[      ]'} ${part}\n           ${estado}`);
    if (temSessao && !acc) livres.push(part);
  }

  log(`\n${'='.repeat(64)}`);
  log('PARTICOES COM SESSAO E SEM CONTA ATIVA (seguras para probar):');
  if (!livres.length) log('  NENHUMA. Probar exigiria desligar uma conta antes.');
  for (const p of livres) log(`  ${p}`);
  log(`\nrelatorio: ${SAIDA}`);
  setTimeout(() => app.exit(0), 300);
}
main().catch((e) => { log('FATAL: ' + (e.stack || e)); setTimeout(() => app.exit(1), 300); });
