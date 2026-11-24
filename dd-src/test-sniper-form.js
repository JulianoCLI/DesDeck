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

      // Ajudantes: achar o cartao do rascunho e os botoes por rotulo.
      const cardDe = (texto) => [...f.el.querySelectorAll('.card')].find(c => c.textContent.includes(texto));
      const botao = (raiz, rotulo) => [...raiz.querySelectorAll('button')].find(b => b.textContent.trim() === rotulo);

      // 2. O botao "Adicionar alvo" vem ANTES da lista de alvos.
      const txt = f.el.textContent;
      ok(txt.includes('Adicionar alvo'), 'tem o botao de adicionar');
      ok(txt.indexOf('Adicionar alvo') < txt.indexOf('Alvos configurados'), 'o botao aparece ANTES da lista de alvos');
      ok(txt.includes('Alvos configurados (1)'), 'a lista diz quantos alvos existem');
      ok(txt.includes('nenhum armado'), 'com os dois tetos em 0, avisa que nada sera comprado');

      // 3. O RASCUNHO abre logo abaixo do botao, nao no fim da pilha.
      const addBt = botao(f.el, 'Adicionar alvo');
      addBt.click();
      const draft = cardDe('Novo alvo');
      ok(!!draft, 'clicar em "Adicionar alvo" abre o cartao do rascunho');
      const t2 = f.el.textContent;
      ok(t2.indexOf('Adicionar alvo') < t2.indexOf('Novo alvo'), 'o rascunho vem depois do botao');
      ok(t2.indexOf('Novo alvo') < t2.indexOf('Alvos configurados'), 'e ANTES da lista de alvos ja salvos');

      // 4. "Adicionar" so libera quando ha teto. Antes disso, nada entra na lista.
      const okBt = botao(draft, 'Adicionar');
      ok(!!okBt && okBt.disabled, 'o botao "Adicionar" nasce travado (nenhum teto)');
      ok(f.read().alvos.length === 1, 'o rascunho NAO entra no read() antes de ser adicionado');

      const nums = (raiz) => [...raiz.querySelectorAll('input[type=number]')];
      const dBits = nums(draft)[0], dGemas = nums(draft)[1];
      dBits.value = '5000';
      dBits.dispatchEvent(new Event('input'));
      ok(!okBt.disabled, 'com teto em bits, o "Adicionar" libera');
      ok(f.read().alvos.length === 1, 'mesmo armado, o rascunho so entra no clique');

      // 5. O FILTRO de item, dentro do rascunho.
      const tipo = draft.querySelector('select');
      tipo.value = 'item';
      tipo.dispatchEvent(new Event('change'));
      const busca = [...draft.querySelectorAll('input')].find(i => (i.placeholder || '').includes('filtrar'));
      ok(!!busca, 'tipo item mostra o campo de filtro');
      const lista = [...draft.querySelectorAll('select')].find(s => s.size > 1);
      ok(!!lista, 'tipo item mostra a lista de itens');
      ok(lista.options.length === 45, 'a lista comeca com os 45 itens (' + (lista ? lista.options.length : 0) + ')');
      // Alvo de item SEM item escolhido nao pode ser adicionado: o pedido iria
      // sem 'especie' e o sniper compraria qualquer item abaixo do teto.
      ok(okBt.disabled, 'item sem item escolhido volta a travar o "Adicionar"');
      ok(draft.textContent.includes('Escolha o item'), 'e diz por que travou');

      busca.value = 'fogo';
      busca.dispatchEvent(new Event('input'));
      ok(lista.options.length === 1, 'digitar "fogo" deixa 1 item (' + lista.options.length + ')');
      ok(lista.options[0].textContent === 'Chip de Fogo', 'e o item certo: ' + lista.options[0].textContent);
      ok(!okBt.disabled, 'sobrou um item, ele foi escolhido e o "Adicionar" liberou');

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
      ok(draft.textContent.includes('Nenhum item do Mercado bate'), 'e avisa que nada bate');

      busca.value = '';
      busca.dispatchEvent(new Event('input'));
      lista.value = 'token-boss';
      lista.dispatchEvent(new Event('change'));
      ok(draft.textContent.includes('Boss Token'), 'a tela confirma o nome do item escolhido');

      // 6. Os DOIS tetos, um por moeda.
      dGemas.value = '40';
      dGemas.dispatchEvent(new Event('input'));

      // 7. "Adicionar" leva o rascunho para a lista.
      okBt.click();
      ok(!cardDe('Novo alvo'), 'depois de adicionar, o rascunho fecha');
      ok(f.el.textContent.includes('Alvos configurados (2)'), 'a lista passou a ter 2 alvos');
      const r1 = f.read();
      ok(r1.alvos.length === 2, 'o read() devolve os 2 alvos');
      const novo = r1.alvos[1];
      ok(novo.tetoBits === 5000 && novo.tetoGemas === 40, 'os dois tetos foram lidos: ' + novo.tetoBits + ' bits / ' + novo.tetoGemas + ' D-Dol');
      ok(novo.especie === 'token-boss' && novo.tipo === 'item', 'o item escolhido foi para especie: ' + novo.especie);
      ok(!('tetoPreco' in novo), 'o formato antigo (tetoPreco) nao volta no read()');

      // 8. Um alvo com dois tetos vira DUAS buscas, uma por moeda.
      const bs = window.DDTools.buscasDoAlvo(novo);
      ok(bs.length === 2, 'dois tetos = duas buscas (' + bs.length + ')');
      ok(bs[0].moeda === 'bits' && bs[0].tetoPreco === 5000, 'a busca em bits leva o teto de bits');
      ok(bs[1].moeda === 'gemas' && bs[1].tetoPreco === 40, 'a busca em D-Dol leva o teto de D-Dol');
      ok(window.DDTools.buscasDoAlvo({ ...novo, tetoGemas: 0 }).length === 1, 'teto 0 numa moeda = nenhuma busca nela');
      ok(window.DDTools.alvoValido(novo), 'o alvo de item com item e teto e valido');
      ok(!window.DDTools.alvoValido({ ...novo, especie: '' }), 'sem item escolhido, o alvo NAO e valido');
      ok(!window.DDTools.alvoValido({ ...novo, tetoBits: 0, tetoGemas: 0 }), 'sem teto nenhum, o alvo NAO e valido');

      // 9. "Cancelar" descarta: o rascunho nao deixa rastro.
      addBt.click();
      const d2 = cardDe('Novo alvo');
      ok(!!d2, 'o rascunho abre de novo');
      nums(d2)[0].value = '777';
      nums(d2)[0].dispatchEvent(new Event('input'));
      botao(d2, 'Cancelar').click();
      ok(!cardDe('Novo alvo'), 'cancelar fecha o rascunho');
      const r2 = f.read();
      ok(r2.alvos.length === 2, 'cancelar nao adicionou nada (' + r2.alvos.length + ')');
      ok(!r2.alvos.some(a => a.tetoBits === 777), 'o teto digitado no rascunho cancelado nao foi salvo');

      // 10. Remover tira o alvo da lista.
      const cardAlvo = [...f.el.querySelectorAll('.card')].find(c => botao(c, 'Remover'));
      botao(cardAlvo, 'Remover').click();
      ok(f.read().alvos.length === 1, 'remover tirou um alvo');
    } catch (e) {
      out.push('FALHA excecao: ' + (e && e.stack || e));
    }
    return out.join('\\n');
  })()`);

  fs.writeFileSync(SAIDA, r + '\n');
  console.log(r);
  app.exit(/FALHA/.test(r) ? 1 : 0);
}).catch((e) => { console.log('FATAL ' + e); app.exit(1); });
