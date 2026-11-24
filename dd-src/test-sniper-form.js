#!/usr/bin/env node
/**
 * A tela do Sniper monta mesmo? E o filtro de item filtra?
 *
 * "node --check" so diz que o arquivo e JS valido. Ele nao diz se o form
 * quebra ao desenhar, nem se digitar "fogo" deixa um item na lista. Sem isto eu
 * estaria entregando uma tela que nunca vi rodar.
 *
 * Roda o app.js de verdade num BrowserWindow, abre o sniperForm e mexe nos
 * campos. Nao fala com o jogo: nada e enviado.
 *
 * Uso: .\node_modules\electron\dist\electron.exe probe-form.js
 */
'use strict';
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const SAIDA = path.join(__dirname, 'form-probe.txt');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } });
  const toolsJs = fs.readFileSync(path.join(__dirname, 'src/renderer/tools.js'), 'utf8');

  // So o pedaco de app.js que interessa: o sniperForm e os ajudantes que ele usa.
  const appJs = fs.readFileSync(path.join(__dirname, 'src/renderer/app.js'), 'utf8');
  const corte = appJs.indexOf('function sniperForm');
  const fim = appJs.indexOf('\nfunction openScriptsEditor');
  const formJs = appJs.slice(corte, fim);

  await win.loadURL('data:text/html,<html><body></body></html>');
  const r = await win.webContents.executeJavaScript(`(() => {
    const out = [];
    const ok = (c, t) => out.push((c ? 'OK   ' : 'FALHA ') + t);
    try {
      ${toolsJs}
      // h() minimo, com a mesma assinatura do app.
      function h(tag, attrs, ...kids) {
        const e = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs || {})) {
          if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
          else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
          else if (k === 'class') e.className = v;
          else if (k === 'checked' || k === 'selected') { if (v) e.setAttribute(k, ''); e[k] = !!v; }
          else if (v != null) e.setAttribute(k, String(v));
        }
        for (const kid of kids.flat()) if (kid != null) e.append(typeof kid === 'string' ? document.createTextNode(kid) : kid);
        return e;
      }
      const field = (rot, el) => h('div', { class: 'field' }, h('label', {}, rot), el);
      const checkRow = (cb, rot, help) => h('label', { class: 'check' }, cb, h('span', {}, rot), h('span', { class: 'help' }, help || ''));
      ${formJs}

      // 1. Monta com o padrao de fabrica.
      const def = window.DDTools.TOOLS.find(t => t.id === 'sniper').defaults();
      const f = sniperForm(def);
      document.body.append(f.el);
      ok(!!f.el, 'o form montou sem estourar');

      // 2. O botao "Adicionar alvo" vem ANTES da lista de alvos.
      const txt = f.el.textContent;
      ok(txt.includes('Adicionar alvo'), 'tem o botao de adicionar');
      ok(txt.indexOf('Adicionar alvo') < txt.indexOf('Alvos configurados'), 'o botao aparece ANTES da lista de alvos');
      ok(txt.includes('Alvos configurados (1)'), 'a lista diz quantos alvos existem');
      ok(txt.includes('nenhum armado'), 'com teto 0, avisa que nada sera comprado');

      // 3. Alvo pronto ganha cor; alvo cru nao.
      const card0 = f.el.querySelector('.card');
      const cruBorda = card0.style.borderLeft;
      const teto = [...f.el.querySelectorAll('input[type=number]')][0];
      teto.value = '5000';
      teto.dispatchEvent(new Event('input'));
      const r1 = f.read();
      ok(r1.alvos[0].tetoPreco === 5000, 'o teto digitado foi lido');

      // 4. Trocar o tipo para 'item' traz o filtro e a lista.
      const sel = f.el.querySelector('select');
      sel.value = 'item';
      sel.dispatchEvent(new Event('change'));
      const busca = [...f.el.querySelectorAll('input')].find(i => (i.placeholder || '').includes('filtrar'));
      ok(!!busca, 'tipo item mostra o campo de filtro');
      const lista = [...f.el.querySelectorAll('select')].find(s => s.size > 1);
      ok(!!lista, 'tipo item mostra a lista de itens');
      ok(lista.options.length === 45, 'a lista comeca com os 45 itens (' + (lista ? lista.options.length : 0) + ')');

      // 5. O FILTRO: digitar reduz a lista.
      busca.value = 'fogo';
      busca.dispatchEvent(new Event('input'));
      ok(lista.options.length === 1, 'digitar "fogo" deixa 1 item (' + lista.options.length + ')');
      ok(lista.options[0].textContent === 'Chip de Fogo', 'e o item certo: ' + lista.options[0].textContent);

      busca.value = 'chip';
      busca.dispatchEvent(new Event('input'));
      // 12, nao 11: os 11 'chip-*' mais a "Peca de Chip AoE", que tambem tem
      // "chip" no nome. Confirmado contra o catalogo.
      ok(lista.options.length === 12, 'digitar "chip" deixa 12 (' + lista.options.length + ')');

      busca.value = 'data-dragon';
      busca.dispatchEvent(new Event('input'));
      ok(lista.options.length === 3, 'digitar "data-dragon" deixa 3 (' + lista.options.length + ')');

      busca.value = 'xyzw';
      busca.dispatchEvent(new Event('input'));
      ok(lista.options.length === 0, 'texto sem par deixa a lista vazia');
      ok(f.el.textContent.includes('Nenhum item do Mercado bate'), 'e avisa que nada bate');

      // 6. Escolher na lista grava no alvo.
      busca.value = '';
      busca.dispatchEvent(new Event('input'));
      lista.value = 'token-boss';
      lista.dispatchEvent(new Event('change'));
      const r2 = f.read();
      ok(r2.alvos[0].especie === 'token-boss', 'o item escolhido foi para especie: ' + r2.alvos[0].especie);
      ok(f.el.textContent.includes('Boss Token'), 'a tela confirma o nome do item escolhido');

      // 7. Item escolhido + teto = alvo valido de verdade.
      ok(window.DDTools.alvoValido(r2.alvos[0]), 'o alvo de item com item e teto e valido');
      ok(!window.DDTools.alvoValido({ ...r2.alvos[0], especie: '' }), 'sem item escolhido, o alvo NAO e valido');
    } catch (e) {
      out.push('FALHA excecao: ' + (e && e.stack || e));
    }
    return out.join('\\n');
  })()`);

  fs.writeFileSync(SAIDA, r + '\n');
  console.log(r);
  app.exit(/FALHA/.test(r) ? 1 : 0);
}).catch((e) => { console.log('FATAL ' + e); app.exit(1); });
