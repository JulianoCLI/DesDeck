#!/usr/bin/env node
/**
 * Mede a RAM de uma conta em webview contra a mesma conta em headless.
 *
 * Esta e a razao de o modo headless existir, e o numero nunca tinha sido
 * medido - os "76-86%" dos docs antigos eram chute.
 *
 * Metodo: a MESMA conta, nos dois modos, em sequencia (o servidor aceita so uma
 * conexao por conta, entao nao da para medir em paralelo). A medida e a soma do
 * workingSetSize de TODOS os processos do app, via app.getAppMetrics(), antes e
 * depois de levantar a conta. O que conta e o DELTA: a linha de base (processo
 * principal + GPU + utilitarios) e paga uma vez e nao muda com o modo.
 *
 * Uso: .\node_modules\electron\dist\electron.exe measure-ram.js <login> <senha>
 */
const { app, BrowserWindow, session, net } = require('electron');
const path = require('path');
const fs = require('fs');

app.setPath('userData', path.join(process.env.APPDATA || '', 'DigiDeck'));

const SAIDA = path.join(__dirname, 'ram-report.txt');
const linhas = [];
const log = (...a) => { linhas.push(a.join(' ')); try { fs.writeFileSync(SAIDA, linhas.join('\n') + '\n'); } catch { /* ignora */ } };

const [login, senha] = process.argv.slice(2);
const partition = 'persist:ram-test';
const ESPERA_ESTABILIZAR_MS = 45000; // o Chromium cresce por um tempo depois de carregar

const mb = (kb) => Math.round(kb / 1024);
const totalKB = () => app.getAppMetrics().reduce((t, p) => t + p.memory.workingSetSize, 0);
const nProcs = () => app.getAppMetrics().length;

// Quebra por processo. Um total inesperado quase sempre e um processo so, e sem
// isto nao da para saber qual - nem se o numero e real.
function detalhe(rotulo) {
  log(`  ${rotulo}:`);
  for (const p of app.getAppMetrics().sort((a, b) => b.memory.workingSetSize - a.memory.workingSetSize)) {
    log(`    ${String(mb(p.memory.workingSetSize)).padStart(5)} MB  ${p.type}${p.serviceName ? '/' + p.serviceName : ''}  pid ${p.pid}`);
  }
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function postLogin(ses) {
  return new Promise((resolve, reject) => {
    const req = net.request({ method: 'POST', url: 'https://digiidle.com/auth/entrar', session: ses, useSessionCookies: true });
    req.setHeader('Content-Type', 'application/json');
    req.setHeader('Origin', 'https://digiidle.com');
    let body = '';
    req.on('response', (res) => {
      res.on('data', (c) => { body += c.toString('utf8'); });
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.end(JSON.stringify({ login, senha, lembrar: true, lang: 'pt' }));
  });
}

async function main() {
  await app.whenReady();
  log('=== RAM: WEBVIEW vs HEADLESS ===');
  log('(mesma conta, em sequencia; medida = soma do workingSetSize de todos os processos)\n');

  const ses = session.fromPartition(partition);
  const json = JSON.parse(await postLogin(ses));
  if (!json.ok) { log('login falhou'); return finish(1); }
  log(`conta: ${json.conta.nick}\n`);

  // --- Linha de base: o app sem conta nenhuma levantada.
  await espera(5000);
  const base = totalKB();
  log(`linha de base (app vazio): ${mb(base)} MB em ${nProcs()} processos`);
  detalhe('por processo');
  log('');

  // --- 1. HEADLESS (primeiro, por ser o mais leve de derrubar limpo)
  log('--- HEADLESS');
  const { DigiiIdleHeadlessClient } = require('./src/headless/client');
  const client = new DigiiIdleHeadlessClient(0, partition, { name: login });
  await new Promise((res) => {
    client.on('update', () => res());
    client.on('error', (m) => { log('erro: ' + m); res(); });
    client.connect();
  });
  log(`conectado: nivel ${client.state.nivel}, local ${client.state.local}`);
  // As 4 ferramentas ligadas: e assim que a conta roda de verdade.
  client.startTool('scan', { scanners: ['scanner-basico'], soSemVip: true });
  client.startTool('refill', { regras: [], intervaloSec: 15 });
  client.startTool('hunt', { intervaloMin: 5, soTranquilas: true });
  client.startTool('eggs', { tiers: ['D'], intervaloMin: 10 });
  log('4 ferramentas ligadas. estabilizando...');
  await espera(ESPERA_ESTABILIZAR_MS);
  const comHeadless = totalKB();
  const procsHeadless = nProcs();
  log(`total: ${mb(comHeadless)} MB em ${procsHeadless} processos`);
  detalhe('por processo');
  log(`custo da conta: ${mb(comHeadless - base)} MB\n`);
  client.disconnect();
  await espera(5000);

  // --- 2. WEBVIEW: uma janela com a pagina do jogo, como o card da conta faz.
  log('--- WEBVIEW');
  const win = new BrowserWindow({
    show: false, width: 1280, height: 800,
    webPreferences: { partition, backgroundThrottling: false },
  });
  await win.loadURL('https://digiidle.com/');
  log('pagina carregada. estabilizando...');
  await espera(ESPERA_ESTABILIZAR_MS);
  const comWebview = totalKB();
  const procsWebview = nProcs();
  log(`total: ${mb(comWebview)} MB em ${procsWebview} processos`);
  detalhe('por processo');
  log(`custo da 1a conta: ${mb(comWebview - base)} MB\n`);

  // --- 3. A SEGUNDA webview. Isto nao e redundante: a primeira paga servicos
  // que sao COMPARTILHADOS (GPU, audio, video capture) e nao se repetem por
  // conta. Sem medir a segunda, multiplicar a primeira por N superestima muito.
  log('--- WEBVIEW #2 (para separar o custo marginal do compartilhado)');
  const win2 = new BrowserWindow({
    show: false, width: 1280, height: 800,
    webPreferences: { partition: 'persist:ram-test-2', backgroundThrottling: false },
  });
  await win2.loadURL('https://digiidle.com/');
  log('pagina carregada. estabilizando...');
  await espera(ESPERA_ESTABILIZAR_MS);
  const com2Webviews = totalKB();
  log(`total: ${mb(com2Webviews)} MB em ${nProcs()} processos`);
  detalhe('por processo');
  const marginal = com2Webviews - comWebview;
  log(`custo da 2a conta (marginal): ${mb(marginal)} MB\n`);
  win2.destroy();

  // --- Resultado
  const custoPrimeira = comWebview - base;
  const custoHl = comHeadless - base;
  // O custo da 1a webview inclui os servicos compartilhados (GPU, audio,
  // video). O que escala com o numero de contas e o MARGINAL.
  const compartilhado = custoPrimeira - marginal;

  log('=== RESULTADO ===');
  log(`  headless, por conta        : ${mb(custoHl)} MB`);
  log(`  webview, 1a conta          : ${mb(custoPrimeira)} MB  (+${procsWebview - procsHeadless} processos)`);
  log(`  webview, cada conta a mais : ${mb(marginal)} MB  <- este e o que escala`);
  log(`  servicos compartilhados    : ${mb(compartilhado)} MB (GPU, audio, video: pagos uma vez)`);
  log('');
  log('  Projecao (base do app + compartilhado + N x marginal):');
  for (const n of [1, 4, 5, 10]) {
    const wv = base + compartilhado + marginal * n;
    const hl = base + custoHl * n;
    log(`    ${String(n).padStart(2)} conta(s): webview ${String(mb(wv)).padStart(5)} MB | headless ${String(mb(hl)).padStart(4)} MB | economiza ${mb(wv - hl)} MB (${Math.round((1 - hl / wv) * 100)}%)`);
  }
  log('');
  log('Ressalvas, para o numero nao ser lido como mais preciso do que e:');
  log('  - uma medida, uma conta, uma maquina; o Chromium varia muito com o uso;');
  log('  - as webviews aqui estao ocultas (show:false), como cards fora da tela;');
  log('  - a projecao assume que o marginal se repete igual, o que e otimista:');
  log('    na pratica a 3a e a 4a conta disputam cache e podem custar mais;');
  log('  - a base do app (~200 MB) e paga em qualquer modo, inclusive headless.');

  win.destroy();
  finish(0);
}

function finish(c) { setTimeout(() => app.exit(c), 500); }
main().catch((e) => { log('FATAL: ' + ((e && e.stack) || e)); finish(1); });
