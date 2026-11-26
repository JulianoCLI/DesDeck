#!/usr/bin/env node
/**
 * Quanto custa o caminho 'resumo do headless -> desenhaPainel -> invalidaLive
 * -> updateLive' com 20 contas, no DOM real do Painel.
 *
 * A pista do relato: fluido com 20 contas em headless, perde fluidez quando UMA
 * sai para webview, e piora com o tempo. A sonda estatica
 * (test-laga-webview.js) mostrou que os laços de webview somam ~1 s/min - pouco
 * para explicar sozinho. Sobra o caminho que roda COM AS 20 CONTAS e que a
 * conta em webview passa a disputar.
 *
 * O que se suspeita, lendo o fonte: desenhaPainel() chama invalidaLive(), que
 * joga fora o cache de nos do updateLive; e o MESMO listener chama updateLive()
 * logo depois, que entao precisa varrer o documento inteiro com
 * querySelectorAll duas vezes. O manager manda 1 resumo a cada 2 s por conta
 * (PAINEL_MIN_MS), ou seja ~10 resumos/s com 20 contas - 10 varreduras
 * completas por segundo. O cache foi criado justamente para isso nao acontecer
 * ("roda 1x por segundo e varria o documento inteiro", diz o comentario), mas
 * quem o invalida e o proprio evento que o consome.
 *
 * Mede, no index.html real com 20 cards:
 *   1. o tamanho do DOM com 20 contas;
 *   2. uma varredura vs. o cache quente;
 *   3. o custo por segundo no ritmo real do manager;
 *   4. o mesmo com a lista de ovos/digimons cheia (o "depois de um tempo").
 *
 * Nao toca em conta nenhuma: preload falso, sem rede e sem webview navegando.
 *
 * Uso: .\node_modules\electron\dist\electron.exe test-live-custo.js
 */
'use strict';
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const SAIDA = path.join(__dirname, 'live-custo.txt');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1600,
    height: 1000,
    webPreferences: {
      preload: path.join(__dirname, 'test-painel2-preload.js'),
      contextIsolation: true, nodeIntegration: false, webviewTag: true,
    },
  });
  await win.loadFile(path.join(__dirname, 'src/renderer/index.html'));
  await new Promise((r) => setTimeout(r, 1500)); // boot() do app.js e assincrono

  const PAINEL = JSON.stringify({
    nick: 'conta', nivel: 42, bits: 123456, ddol: 789,
    onde: 'Caçando em File Island · nv 30', online: 2921,
    hunt: { slug: 'bloomlordmon', nome: 'Bloomlordmon', nivel: 30 }, labs: 2,
    digimon: { nome: 'Agumon', especie: 'agumon', nivel: 50, hp: 80, hpMax: 100, hpPct: 80, shiny: false, poder: 9, img: null },
    alvo: { nome: 'Bloomlordmon', especie: 'bloomlordmon', certo: true, img: null },
    farm: { abates: 900, capturas: 12, xpTamer: 450000, bits: 90000, shinyVistos: 1, desde: Date.now() - 3600000, caca: 3600000 },
    taxas: { xpTamerH: 450000, bitsH: 90000, killsH: 900, capturasH: 12 },
    evp: 0, evpMax: 0, evento: null,
  });

  const r = await win.webContents.executeJavaScript(`(async () => {
    const out = [];
    const log = (...a) => out.push(a.join(' '));
    const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
    try {
      const ids = window.tst.contas();
      // Cada conta manda o seu resumo, como o manager faz no login.
      for (const id of ids) window.tst.emitir('hl:painel', { index: id, painel: ${PAINEL} });
      await esperar(800);

      const conta = (s) => document.querySelectorAll(s).length;
      log('================================================================');
      log('1. O TAMANHO DO DOM (' + ids.length + ' contas no Painel)');
      log('================================================================');
      const nLive = conta('[data-live]');
      log('  nos [data-live]: ' + nLive);
      log('  nos [data-dot] : ' + conta('[data-dot]'));
      log('  nos no total   : ' + conta('*'));
      if (!nLive) { log('  (o Painel nao montou: medicao abortada)'); return out.join('\\n'); }

      log('');
      log('================================================================');
      log('2. UMA VARREDURA DO DOCUMENTO vs. O CACHE QUENTE');
      log('================================================================');
      const N = 300;
      let t0 = performance.now();
      for (let i = 0; i < N; i++) { document.querySelectorAll('[data-live]'); document.querySelectorAll('[data-dot]'); }
      const varre = (performance.now() - t0) / N;
      log('  as 2 querySelectorAll que updateLive refaz: ' + varre.toFixed(3) + ' ms');

      const live = [...document.querySelectorAll('[data-live]')];
      const dots = [...document.querySelectorAll('[data-dot]')];
      t0 = performance.now();
      for (let i = 0; i < N; i++) { for (const el of live) el.dataset.live; for (const el of dots) el.dataset.dot; }
      const cache = (performance.now() - t0) / N;
      log('  percorrer o cache ja montado             : ' + cache.toFixed(3) + ' ms');
      log('  a varredura custa ' + (varre / Math.max(cache, 0.0001)).toFixed(1) + 'x mais do que reaproveitar');

      log('');
      log('================================================================');
      log('3. O RITMO REAL: 1 resumo a cada 2 s por conta');
      log('================================================================');
      const porSeg = ids.length / 2;
      log('  resumos/s com ' + ids.length + ' contas (PAINEL_MIN_MS=2000): ' + porSeg);
      log('  cada resumo faz: desenhaPainel (reconstroi o card inteiro)');
      log('                 + invalidaLive (joga o cache fora)');
      log('                 + updateLive  (tem de varrer o DOM de novo)');
      log('  -> so as varreduras: ' + (varre * porSeg).toFixed(1) + ' ms/s');

      // O caminho de verdade, do jeito que o app o executa.
      // O custo da rodada INTEIRA: o app agrupa os cards num setTimeout curto,
      // então medir só a emissão esconderia o trabalho adiado. Espera-se o
      // agrupamento acontecer antes de parar o cronômetro.
      t0 = performance.now();
      for (const id of ids) window.tst.emitir('hl:painel', { index: id, painel: ${PAINEL} });
      await esperar(120);
      const umaRodada = performance.now() - t0 - 120;
      log('');
      log('  uma rodada de ' + ids.length + ' resumos, medida de ponta a ponta: ' + umaRodada.toFixed(1) + ' ms');
      log('  (o manager espalha isso em 2 s, entao e ' + (umaRodada / 2).toFixed(1) + ' ms/s de thread');
      log('   principal do renderer - a mesma que desenha a janela)');

      log('');
      log('================================================================');
      log('4. O "DEPOIS DE UM TEMPO": a lista enche');
      log('================================================================');
      const ovos = [];
      for (let i = 0; i < 200; i++) ovos.push({ id: i, tipo: 'ovo', especie: 'agumon', nome: 'Agumon', letra: 'B', nota: 3, potencia: 1, em: Date.now() - i });
      window.tst.emitir('hl:bolsa', { index: ids[0], ovos });
      await esperar(400);
      log('  linhas na lista: ' + (document.querySelector('#ovoList') || { children: [] }).children.length);
      log('  nos no total   : ' + conta('*'));
      t0 = performance.now();
      for (let i = 0; i < N; i++) { document.querySelectorAll('[data-live]'); document.querySelectorAll('[data-dot]'); }
      const varre2 = (performance.now() - t0) / N;
      log('  a mesma varredura agora: ' + varre2.toFixed(3) + ' ms  (' + (varre2 / Math.max(varre, 0.0001)).toFixed(1) + 'x)');
      log('  -> so as varreduras: ' + (varre2 * porSeg).toFixed(1) + ' ms/s');

      t0 = performance.now();
      for (const id of ids) window.tst.emitir('hl:painel', { index: id, painel: ${PAINEL} });
      await esperar(120);
      const rodada2 = performance.now() - t0 - 120;
      log('  uma rodada de ' + ids.length + ' resumos com a lista cheia: ' + rodada2.toFixed(1) + ' ms (' + (rodada2 / Math.max(umaRodada, 0.001)).toFixed(1) + 'x)');

      log('');
      log('  Leitura: o custo cresce com o DOM, e o DOM cresce conforme as contas');
      log('  mandam as bolsas. A conta em webview nao e a causa - ela e o que');
      log('  sobrecarrega a mesma thread que ja estava fazendo este trabalho.');
    } catch (e) {
      out.push('FALHA: ' + ((e && e.stack) || e));
    }
    return out.join('\\n');
  })()`);

  fs.writeFileSync(SAIDA, r + '\n');
  console.log(r);
  app.exit(0);
}).catch((e) => { console.log('FATAL ' + ((e && e.stack) || e)); app.exit(1); });
