#!/usr/bin/env node
/**
 * Testa o BOOT com "iniciar todas em headless" ligado - o bug relatado: o
 * programa subia o socket E carregava a pagina na mesma conta, as duas
 * conexoes disputavam a conta e o jogo derrubava uma (code 4000, "jogo aberto
 * em outro lugar").
 *
 * Roda o DesDeck DE VERDADE (src/main.js, com todo o IPC), num perfil separado
 * via --user-data-dir, e pergunta ao renderer: alguma webview navegou? A
 * resposta tem que ser zero.
 *
 * Nao encosta no perfil real nem nas contas reais: o perfil de teste tem contas
 * de mentira. O que se mede e se a PAGINA carrega, nao se o socket conecta
 * (sem login, ele falha - e isso e esperado aqui).
 *
 * Uso: node test-boot-headless.js
 */
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const PERFIL = path.join(process.env.TEMP || '.', 'desdeck-boot-test');
const ELECTRON = path.join(__dirname, 'node_modules/electron/dist/electron.exe');
const SAIDA = path.join(__dirname, 'boot-report.txt');

const linhas = [];
const log = (...a) => { const s = a.join(' '); console.log(s); linhas.push(s); fs.writeFileSync(SAIDA, linhas.join('\n') + '\n'); };

log('=== BOOT COM "INICIAR TODAS EM HEADLESS" ===\n');

// Perfil limpo, com a preferencia ligada e 2 contas de mentira.
fs.rmSync(PERFIL, { recursive: true, force: true });
fs.mkdirSync(PERFIL, { recursive: true });
fs.writeFileSync(path.join(PERFIL, 'digideck.json'), JSON.stringify({
  version: 2,
  settings: { bootHeadless: true, economy: true },
  groups: [{ id: 'g1', name: 'DigiIdle', color: '#4ade80', limit: 0 }],
  accounts: [
    { id: 'c1', name: 'Conta 1', url: 'https://digiidle.com/', groupId: 'g1', enabled: true, stats: {} },
    { id: 'c2', name: 'Conta 2', url: 'https://digiidle.com/', groupId: 'g1', enabled: true, stats: {} },
  ],
  tools: {}, log: [], ui: {},
}));
log('perfil de teste: ' + PERFIL);
log('estado: 2 contas, bootHeadless LIGADO\n');

// O renderer roda este trecho e devolve o veredito. Vai num arquivo que o app
// le e avalia no console - mais simples: usamos o --inspect? Nao. Em vez disso,
// o app grava o diagnostico ele mesmo, via um script de usuario? Tambem nao.
//
// A via limpa: o proprio renderer escreve o resultado no log do app (digideck.json),
// que lemos depois de fechar. Para isso injetamos um arquivo que o app carrega
// na abertura? Nao existe esse gancho.
//
// Entao medimos de fora, pelo que e observavel sem instrumentar o app:
// quantos processos de renderer de webview existem. Cada webview que NAVEGA cria
// um processo; webview sem src nao cria nenhum.
const proc = spawn(ELECTRON, ['.', `--user-data-dir=${PERFIL}`], {
  cwd: __dirname, stdio: ['ignore', 'pipe', 'pipe'], detached: false,
});
let saida = '';
proc.stdout.on('data', (d) => { saida += d.toString(); });
proc.stderr.on('data', (d) => { saida += d.toString(); });

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  log('app subindo. esperando 30s...\n');
  await espera(30000);

  // Conta os processos filhos do Electron deste perfil. O renderer da janela
  // principal sempre existe; webviews que navegaram apareceriam a mais.
  const { execSync } = require('child_process');
  const ps = execSync(
    'powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name=\'electron.exe\'\\" | ' +
    `Where-Object { $_.CommandLine -like '*desdeck-boot-test*' } | ` +
    'Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress"',
    { encoding: 'utf8', timeout: 30000 },
  );
  let lista = [];
  try { const j = JSON.parse(ps || '[]'); lista = Array.isArray(j) ? j : [j]; } catch { /* nenhum */ }

  const tipo = (cl) => {
    const m = /--type=([a-zA-Z-]+)/.exec(cl || '');
    return m ? m[1] : 'browser';
  };
  const porTipo = {};
  for (const p of lista) { const t = tipo(p.CommandLine); porTipo[t] = (porTipo[t] || 0) + 1; }

  log('--- PROCESSOS DO APP DE TESTE');
  for (const [t, n] of Object.entries(porTipo).sort()) log(`  ${t}: ${n}`);

  // A janela principal e 1 renderer. Em headless, nao deve haver mais nenhum:
  // cada webview que navega cria o seu.
  const renderers = porTipo.renderer || 0;
  log(`\n  renderers: ${renderers}`);
  log('    1 = so a janela do DesDeck (esperado em headless)');
  log('    3 = a janela + 2 webviews das contas (o bug)');

  // O log do app registra o que aconteceu com cada conta.
  let logApp = [];
  try {
    const st = JSON.parse(fs.readFileSync(path.join(PERFIL, 'digideck.json'), 'utf8'));
    logApp = st.log || [];
  } catch { /* o app ainda nao salvou */ }
  if (logApp.length) {
    log('\n--- LOG DO APP');
    for (const e of logApp.slice(-12)) log(`  [${e.type}] ${e.acc || ''} ${e.msg}`);
  }

  const falhas = [];
  if (renderers > 1) falhas.push(`${renderers - 1} webview(s) carregaram a pagina apesar do modo headless`);
  // Sinais de que a pagina do jogo subiu.
  if (/did-start-loading|dom-ready/.test(saida) && renderers > 1) falhas.push('houve navegacao de webview');

  log('');
  log(`=== ${falhas.length ? 'FAIL:\n  - ' + falhas.join('\n  - ') : 'PASS: so a janela do DesDeck subiu; nenhuma pagina de conta carregou'} ===`);

  try { proc.kill(); } catch { /* ja morreu */ }
  // Garante que nao sobrou processo do teste.
  await espera(1500);
  try {
    execSync('powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name=\'electron.exe\'\\" | ' +
      `Where-Object { $_.CommandLine -like '*desdeck-boot-test*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"`,
      { timeout: 20000 });
  } catch { /* nenhum sobrou */ }
  fs.rmSync(PERFIL, { recursive: true, force: true });

  process.exit(falhas.length ? 1 : 0);
})();
