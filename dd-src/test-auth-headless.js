#!/usr/bin/env node
/**
 * Teste real end-to-end do headless com uma conta de verdade.
 *
 * 1. Faz login em /auth/entrar dentro da particao (net.request da propria sessao,
 *    para o Set-Cookie cair no cookie store da particao).
 * 2. Confere que o cookie digiclone_sessao ficou na particao.
 * 3. Conecta o cliente headless e espera o estado chegar.
 *
 * Uso: .\node_modules\electron\dist\electron.exe test-auth-headless.js <login> <senha> [partition]
 */
const { app, session, net } = require('electron');
const path = require('path');

// O perfil REAL do app, nao um nome chutado (ver perfil-real.js).
const DATA_DIR = require('./perfil-real').usar();
app.setPath('userData', DATA_DIR);

const TIMEOUT_MS = 30000;
const [login, senha, partArg] = process.argv.slice(2);
const partition = partArg || 'persist:headless-test';

function postLogin(ses) {
  return new Promise((resolve, reject) => {
    const req = net.request({
      method: 'POST',
      url: 'https://digiidle.com/auth/entrar',
      session: ses,
      useSessionCookies: true,
    });
    req.setHeader('Content-Type', 'application/json');
    req.setHeader('Origin', 'https://digiidle.com');
    let body = '';
    req.on('response', (res) => {
      res.on('data', (c) => { body += c.toString('utf8'); });
      res.on('end', () => resolve({ status: res.statusCode, body }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end(JSON.stringify({ login, senha, lembrar: true, lang: 'pt' }));
  });
}

async function main() {
  await app.whenReady();
  console.log('\n=== TESTE AUTH + HEADLESS ===\n');

  if (!login || !senha) {
    console.error('uso: electron test-auth-headless.js <login> <senha> [partition]');
    return finish(2);
  }
  console.log(`login: ${login}`);
  console.log(`particao: ${partition}\n`);

  const ses = session.fromPartition(partition);

  // 1. Login
  let r;
  try {
    r = await postLogin(ses);
  } catch (err) {
    console.error('ERRO no login:', err.message);
    return finish(1);
  }
  console.log(`1) POST /auth/entrar -> ${r.status}`);
  let json = {};
  try { json = JSON.parse(r.body); } catch { /* ignora */ }
  if (!json.ok) {
    console.error('   login FALHOU:', json.mensagem || json.erro || r.body.slice(0, 200));
    return finish(1);
  }
  console.log(`   ok - conta ${json.conta?.nick} (${json.conta?.id})\n`);

  // 2. Cookies na particao
  const cookies = await ses.cookies.get({ url: 'https://digiidle.com/' });
  console.log(`2) cookies na particao: ${cookies.length}`);
  for (const c of cookies) {
    console.log(`   - ${c.name} (len ${String(c.value).length}) secure=${c.secure} httpOnly=${c.httpOnly} session=${c.session}`);
  }
  if (!cookies.some((c) => c.name === 'digiclone_sessao')) {
    console.error('\n   digiclone_sessao AUSENTE: o header Cookie nao vai autenticar');
    return finish(1);
  }
  console.log('');

  // 3. Headless
  const { getCookieHeader } = require('./src/headless/cookies');
  const header = await getCookieHeader(partition);
  console.log(`3) getCookieHeader(): ${header ? header.split(';').length + ' cookies' : 'NULL'}`);
  if (!header) return finish(1);

  const { DigiiIdleHeadlessClient } = require('./src/headless/client');
  const client = new DigiiIdleHeadlessClient(0, partition, { name: login });

  const code = await new Promise((resolve) => {
    let done = false;
    const end = (c) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { client.disconnect(); } catch { /* ignora */ }
      resolve(c);
    };
    const timer = setTimeout(() => {
      console.log('   socket: TIMEOUT (sem estado em 30s)');
      end(1);
    }, TIMEOUT_MS);

    client.on('connected', () => console.log('   socket: conectado, aguardando estado...'));
    client.on('update', () => {
      const st = client.state;
      console.log(`   socket: OK - nivel ${st.nivel}, ${st.bits} bits, local ${st.local || '-'}, ativo ${st.ativoId || '-'}`);
      end(0);
    });
    client.on('error', (m) => { console.log(`   socket: ERRO (${m})`); end(1); });
    client.on('status', (s) => { if (s === 'failed') end(1); });

    client.connect();
  });

  console.log(`\n=== ${code === 0 ? 'PASS' : 'FAIL'} ===\n`);
  finish(code);
}

function finish(code) {
  setTimeout(() => app.exit(code), 200);
}

main().catch((e) => { console.error('FATAL:', e); finish(1); });
