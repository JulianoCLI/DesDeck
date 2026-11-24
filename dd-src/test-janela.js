#!/usr/bin/env node
/**
 * Minimizar manda para a bandeja; fechar encerra o app.
 *
 * Isto nunca foi testado, e e o tipo de coisa que so se descobre quebrada no
 * uso: se o 'close' nao encerrar, o app fica rodando invisivel; se o 'minimize'
 * nao esconder, as contas param de ser praticas de deixar farmando.
 *
 * Monta uma janela com os MESMOS ouvintes do main.js (copiados abaixo, com a
 * origem citada) e exercita os dois gestos de verdade.
 *
 * Nao carrega o app nem fala com o jogo: so o comportamento da janela.
 *
 * Uso: .\node_modules\electron\dist\electron.exe test-janela.js
 */
'use strict';
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'dd-janela-')));

const out = [];
const ok = (c, t) => out.push((c ? 'OK    ' : 'FALHA ') + t);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// O estado como o main.js o ve. closeToTray !== false = ligado (o padrao).
let state = { settings: { closeToTray: true } };
let quitting = false;

function monta() {
  const win = new BrowserWindow({ show: false, width: 800, height: 600 });
  // --- copia literal de main.js (createWindow), para o teste medir o que roda.
  win.on('minimize', () => {
    const toTray = !state || !state.settings || state.settings.closeToTray !== false;
    if (!quitting && toTray) win.hide();
  });
  win.on('close', () => { quitting = true; });
  // ---
  return win;
}

// showWindow() do main.js: restaura antes de mostrar.
function showWindow(win) {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

app.whenReady().then(async () => {
  // ---- 1. minimizar vai para a bandeja (esconde, mas NAO fecha)
  let win = monta();
  win.show();
  await espera(300);
  ok(win.isVisible(), 'a janela abriu visivel');

  win.minimize();
  await espera(500);
  ok(!win.isVisible(), 'minimizar escondeu a janela (foi para a bandeja)');
  ok(!win.isDestroyed(), 'e a janela continua VIVA: as contas seguem farmando');

  // ---- 2. o icone da bandeja traz de volta, e nao volta minimizada
  showWindow(win);
  await espera(500);
  ok(win.isVisible(), 'o clique na bandeja trouxe a janela de volta');
  ok(!win.isMinimized(), 'e ela voltou aberta, nao minimizada');

  // ---- 3. fechar encerra de verdade
  const fechada = new Promise((r) => win.once('closed', r));
  win.close();
  await fechada;
  ok(win.isDestroyed(), 'fechar DESTRUIU a janela (nao escondeu)');
  ok(quitting === true, 'e marcou quitting: o app encerra em vez de ficar oculto');

  // ---- 4. com a opcao desligada, minimizar so minimiza
  quitting = false;
  state = { settings: { closeToTray: false } };
  win = monta();
  win.show();
  await espera(300);
  win.minimize();
  await espera(500);
  ok(win.isMinimized(), 'com a opcao DESLIGADA, minimizar apenas minimiza');
  ok(win.isVisible() === false || win.isMinimized(), 'nao sumiu para a bandeja');
  ok(!win.isDestroyed(), 'e nao fechou');

  // Fechar continua encerrando, independente da opcao: o X sempre fecha.
  const f2 = new Promise((r) => win.once('closed', r));
  win.close();
  await f2;
  ok(win.isDestroyed(), 'fechar encerra mesmo com a opcao desligada');

  // ---- 5. estado ausente (conta nova, antes de carregar) nao estoura
  quitting = false;
  state = null;
  win = monta();
  win.show();
  await espera(300);
  win.minimize();
  await espera(500);
  ok(!win.isVisible(), 'sem estado carregado, o padrao e ir para a bandeja');
  win.destroy();

  fs.writeFileSync(path.join(__dirname, 'janela-report.txt'), out.join('\n') + '\n');
  console.log(out.join('\n'));
  const falhas = out.filter((l) => l.startsWith('FALHA')).length;
  console.log(falhas ? `\n=== FALHOU: ${falhas} caso(s) ===` : '\n=== PASS: minimizar esconde, fechar fecha ===');
  app.exit(falhas ? 1 : 0);
}).catch((e) => { console.log('FATAL ' + ((e && e.stack) || e)); app.exit(1); });
