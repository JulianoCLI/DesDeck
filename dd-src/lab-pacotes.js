#!/usr/bin/env node
/**
 * Exploratorio: o que o socket manda, de verdade, que sirva para mostrar na
 * tela "quem esta lutando contra quem".
 *
 * Escuta os pacotes crus de UMA conta e resume: tipos recebidos, campos de cada
 * um, e especificamente o que identifica o Digimon ativo e o inimigo.
 *
 * ATENCAO: conecta na conta de verdade. O servidor aceita uma conexao por
 * conta, entao a conta escolhida precisa estar FORA do headless no DesDeck
 * (ou o app fechado), senao uma das duas cai.
 *
 * Nao envia comando nenhum: so escuta.
 *
 * Uso: .\node_modules\electron\dist\electron.exe lab-pacotes.js "DigiIdle 8"
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { app, safeStorage } = require('electron');

const DATA_DIR = require('./perfil-real').usar();
const AAD_STATE = 'digideck/state/v2';

const SAIDA = path.join(__dirname, 'pacotes-report.txt');
const linhas = [];
const log = (...a) => { const s = a.join(' '); linhas.push(s); try { fs.writeFileSync(SAIDA, linhas.join('\n') + '\n'); } catch { /* ignora */ } };

const unb64 = (s) => Buffer.from(String(s), 'base64');
function openBox(key, box, aad) {
  const d = crypto.createDecipheriv('aes-256-gcm', key, unb64(box.iv));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(unb64(box.tag));
  return Buffer.concat([d.update(unb64(box.ct)), d.final()]);
}
function readState(file) {
  const p = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  if (p && p.format === 'digideck-vault') {
    const key = Buffer.from(safeStorage.decryptString(unb64(p.key)), 'base64');
    return JSON.parse(openBox(key, p.data, AAD_STATE).toString('utf8'));
  }
  return p;
}

const resumo = (v, prof = 0) => {
  if (v === null) return 'null';
  if (Array.isArray(v)) return `array[${v.length}]${v.length && prof < 1 ? ' de ' + resumo(v[0], prof + 1) : ''}`;
  if (typeof v === 'object') return prof < 1 ? `{${Object.keys(v).slice(0, 14).join(',')}}` : 'object';
  const s = String(v);
  return s.length > 30 ? s.slice(0, 30) + '…' : s;
};

app.whenReady().then(async () => {
  const alvo = process.argv[2];
  const st = readState(path.join(DATA_DIR, 'digideck.json'));
  const contas = (st.accounts || []).filter((a) => a && a.id);
  const acc = alvo ? contas.find((a) => a.name === alvo) : contas[contas.length - 1];
  if (!acc) { log('conta nao encontrada: ' + contas.map((a) => a.name).join(', ')); return fim(1); }

  log('=== PACOTES CRUS DO SOCKET ===');
  log(`conta: ${acc.name}\n`);

  const WebSocket = require('ws');
  const { getCookieHeader } = require('./src/headless/cookies');
  const cookie = await getCookieHeader(`persist:acc-${acc.id}`);
  if (!cookie) { log('sem sessao nesta conta'); return fim(1); }

  const ws = new WebSocket('wss://digiidle.com/ws?off=1&dl=1', {
    headers: { Cookie: cookie, Origin: 'https://digiidle.com', 'User-Agent': 'Mozilla/5.0' },
  });

  const tipos = new Map();   // t -> { n, campos:Map }
  const exemplos = new Map(); // t -> primeiro pacote inteiro

  ws.on('open', () => log('conectado, escutando 40s…\n'));
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object') return;
    const t = m.t || '(sem t)';
    if (!tipos.has(t)) { tipos.set(t, { n: 0, campos: new Map() }); exemplos.set(t, m); }
    const info = tipos.get(t);
    info.n++;
    for (const [k, v] of Object.entries(m)) if (!info.campos.has(k)) info.campos.set(k, resumo(v));
    if (m.t === 'ping') { try { ws.send(JSON.stringify({ t: 'pong' })); } catch { /* ignora */ } }
  });
  ws.on('error', (e) => log('ERRO: ' + e.message));
  ws.on('close', (c) => log(`socket fechou (code ${c})`));

  await new Promise((r) => setTimeout(r, 40000));

  log('--- TIPOS RECEBIDOS');
  for (const [t, info] of [...tipos].sort((a, b) => b[1].n - a[1].n)) {
    log(`\n  ${t}  (${info.n}x)`);
    for (const [k, ex] of info.campos) log(`      ${k.padEnd(16)} ${ex}`);
  }

  // O que interessa para a tela: quem sou eu, contra quem luto.
  log('\n\n--- PACOTES INTEIROS QUE IMPORTAM');
  for (const t of ['estado', 'campo', 'batalha', 'eu', 'digimons', 'time']) {
    if (!exemplos.has(t)) continue;
    const j = JSON.stringify(exemplos.get(t), null, 1);
    log(`\n=== ${t} ===`);
    log(j.length > 6000 ? j.slice(0, 6000) + '\n…(cortado)' : j);
  }

  try { ws.close(); } catch { /* ignora */ }
  fim(0);
}).catch((e) => { log('FATAL: ' + ((e && e.stack) || e)); fim(1); });

function fim(c) { setTimeout(() => app.exit(c), 400); }
