#!/usr/bin/env node
/**
 * A tela do Auto Seller monta mesmo? E mostra a mochila e a media?
 *
 * "node --check" so diz que o arquivo e JS valido. Ele nao diz se o form quebra
 * ao desenhar, nem se digitar "fogo" deixa um item na lista, nem — o que mais
 * importa aqui — se os dois numeros que a pessoa usa para decidir o preco
 * chegam na tela. Sem isto eu estaria entregando uma tela que nunca vi rodar.
 *
 * Roda o app.js de verdade num BrowserWindow, abre o sellerForm e mexe nos
 * campos. O `deck` e falso: nada fala com o jogo e nada e enviado.
 *
 * Uso: .\node_modules\electron\dist\electron.exe test-seller-form.js
 */
'use strict';
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const SAIDA = path.join(__dirname, 'seller-form.txt');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } });
  const toolsJs = fs.readFileSync(path.join(__dirname, 'src/renderer/tools.js'), 'utf8');

  // So o pedaco de app.js que interessa: o sellerForm vive entre o sniperForm e
  // o editor de scripts.
  const appJs = fs.readFileSync(path.join(__dirname, 'src/renderer/app.js'), 'utf8');
  const corte = appJs.indexOf('function sellerForm');
  const fim = appJs.indexOf('\nfunction openScriptsEditor');
  const formJs = appJs.slice(corte, fim);

  await win.loadURL('data:text/html,<html><body></body></html>');
  const r = await win.webContents.executeJavaScript(`(async () => {
    const out = [];
    const ok = (c, t) => out.push((c ? 'OK   ' : 'FALHA ') + t);
    const espera = (ms) => new Promise(r => setTimeout(r, ms));
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
      const fmtNum = (n) => Number(n || 0).toLocaleString('pt-BR');
      const field = (rot, el) => h('div', { class: 'field' }, h('label', {}, rot), el);
      const checkRow = (cb, rot, help) => h('label', { class: 'check' }, cb, h('span', {}, rot), h('span', { class: 'help' }, help || ''));

      // O 'deck' de mentira: a mochila e a media que o processo principal
      // devolveria. Cada chamada fica anotada, para provar que a tela PEDE.
      const pedidos = [];
      let MOCHILA = { ok: true, itens: { 'chip-fire': 12, 'evoluter': 3 } };
      let MEDIA = { ok: true, media: 4300, mediaQtd: 17, menor: 4000, jaAberto: null };
      window.deck = {
        headlessMochila: async (id) => { pedidos.push(['mochila', id]); return MOCHILA; },
        headlessMercadoMedia: async (id, item, moeda) => { pedidos.push(['media', id, item, moeda]); return MEDIA; },
      };
      ${formJs}

      const ACC = { id: 'c1', name: 'Conta 1' };
      const cardDe = (raiz, texto) => [...raiz.querySelectorAll('.card')].find(c => c.textContent.includes(texto));
      const botao = (raiz, rotulo) => [...raiz.querySelectorAll('button')].find(b => b.textContent.trim() === rotulo);
      const nums = (raiz) => [...raiz.querySelectorAll('input[type=number]')];

      // 1. Monta com o padrao de fabrica.
      const def = window.DDTools.TOOLS.find(t => t.id === 'seller').defaults();
      const f = sellerForm(def, ACC);
      document.body.append(f.el);
      ok(!!f.el, 'o form montou sem estourar');
      ok(f.el.textContent.includes('Adicionar item'), 'tem o botao de adicionar');
      ok(f.el.textContent.includes('Nenhum item ainda'), 'de fabrica a lista esta vazia');
      ok(f.read().itens.length === 0, 'o read() de fabrica devolve lista vazia (nao anuncia nada)');

      // 2. O rascunho abre abaixo do botao e nasce travado.
      const addBt = botao(f.el, 'Adicionar item');
      addBt.click();
      const draft = cardDe(f.el, 'Novo item');
      ok(!!draft, 'clicar em "Adicionar item" abre o cartao do rascunho');
      const t2 = f.el.textContent;
      ok(t2.indexOf('Adicionar item') < t2.indexOf('Novo item'), 'o rascunho vem depois do botao');
      const okBt = botao(draft, 'Adicionar');
      ok(!!okBt && okBt.disabled, 'o "Adicionar" nasce travado (nenhum item escolhido)');
      ok(draft.textContent.includes('Escolha o item'), 'e diz por que travou');

      // 3. So itens NEGOCIAVEIS aparecem. O Mercado recusaria os outros, e a
      // ferramenta tentaria para sempre.
      const lista = [...draft.querySelectorAll('select')].find(s => s.size > 1);
      ok(!!lista, 'a lista de itens apareceu');
      const todos = window.DDTools.MERCADO_ITENS.length;
      const vend = window.DDTools.MERCADO_ITENS.filter(i => window.DDTools.vendavel(i.id)).length;
      ok(lista.options.length === vend, 'a lista traz os ' + vend + ' itens negociaveis (de ' + todos + ' no catalogo): ' + lista.options.length);
      ok([...lista.options].every(o => window.DDTools.vendavel(o.value)), 'todo item oferecido e negociavel no Mercado');

      // 4. O filtro.
      const busca = [...draft.querySelectorAll('input')].find(i => (i.placeholder || '').includes('filtrar'));
      ok(!!busca, 'tem o campo de filtro');
      busca.value = 'fogo';
      busca.dispatchEvent(new Event('input'));
      ok(lista.options.length === 1, 'digitar "fogo" deixa 1 item (' + lista.options.length + ')');
      ok(lista.options[0].textContent === 'Chip de Fogo', 'e o item certo: ' + lista.options[0].textContent);
      ok(!okBt.disabled, 'sobrou um item, ele foi escolhido e o "Adicionar" liberou');
      busca.value = 'xyzw';
      busca.dispatchEvent(new Event('input'));
      ok(lista.options.length === 0, 'texto sem par deixa a lista vazia');
      ok(draft.textContent.includes('Nenhum item negociavel bate') || draft.textContent.includes('Nenhum item negociável bate'), 'e avisa que nada bate');
      busca.value = '';
      busca.dispatchEvent(new Event('input'));

      // 5. A MOCHILA e a MEDIA: os dois numeros que a tela existe para mostrar.
      await espera(60);
      ok(pedidos.some(p => p[0] === 'mochila'), 'a tela PEDIU a mochila');
      ok(pedidos.some(p => p[0] === 'media' && p[2] === 'chip-fire' && p[3] === 'bits'), 'a tela PEDIU a media do item escolhido, na moeda escolhida');
      ok(draft.textContent.includes('Na mochila agora: 12'), 'mostra as 12 unidades da mochila');
      ok(draft.textContent.includes('anuncia TODAS'), 'diz que vai anunciar TUDO o que esta na mochila');
      ok(draft.textContent.includes('4.300'), 'mostra a media de 4.300');
      ok(draft.textContent.includes('3.655'), 'mostra o liquido de 3.655 (media menos a comissao de 15%)');
      ok(draft.textContent.includes('17 venda'), 'diz sobre quantas vendas a media foi calculada');
      ok(draft.textContent.includes('4.000'), 'mostra o anuncio mais barato aberto');

      // 6. O botao "usar" copia a media para o preco fixo, sem mudar o valor.
      const usar = botao(draft, 'usar como preco fixo') || botao(draft, 'usar como preço fixo');
      ok(!!usar, 'o botao "usar como preco fixo" apareceu');
      usar.click();
      const fixo = nums(draft)[0];
      ok(fixo.value === '4300', 'clicar em "usar" poe a media EXATA no preco fixo: ' + fixo.value);

      // 7. Trocar a moeda refaz a consulta — a media e por moeda.
      const moedaSel = [...draft.querySelectorAll('select')].find(s => s.size <= 1 && [...s.options].some(o => o.value === 'gemas'));
      ok(!!moedaSel, 'tem o seletor de moeda');
      const antes = pedidos.filter(p => p[0] === 'media').length;
      MEDIA = { ok: true, media: 25, mediaQtd: 4, menor: 0, jaAberto: null };
      moedaSel.value = 'gemas';
      moedaSel.dispatchEvent(new Event('change'));
      await espera(60);
      const depois = pedidos.filter(p => p[0] === 'media');
      ok(depois.length === antes + 1, 'trocar a moeda refez a consulta da media');
      ok(depois[depois.length - 1][3] === 'gemas', 'e consultou em D-Dol');
      ok(draft.textContent.includes('D-Dol'), 'a tela passou a falar em D-Dol');
      moedaSel.value = 'bits';
      moedaSel.dispatchEvent(new Event('change'));
      MEDIA = { ok: true, media: 4300, mediaQtd: 17, menor: 4000, jaAberto: null };
      await espera(60);

      // 8. "Adicionar" leva o rascunho para a lista; o read() nao pega rascunho.
      ok(f.read().itens.length === 0, 'o rascunho NAO entra no read() antes de ser adicionado');
      okBt.click();
      ok(!cardDe(f.el, 'Novo item'), 'depois de adicionar, o rascunho fecha');
      ok(f.el.textContent.includes('Itens a venda (1)') || f.el.textContent.includes('Itens à venda (1)'), 'a lista passou a ter 1 item');
      const r1 = f.read();
      ok(r1.itens.length === 1, 'o read() devolve 1 item');
      ok(r1.itens[0].item === 'chip-fire', 'o item escolhido foi lido: ' + r1.itens[0].item);
      ok(r1.itens[0].moeda === 'bits', 'a moeda foi lida: ' + r1.itens[0].moeda);
      ok(r1.itens[0].precoManual === 4300, 'o preco fixo foi lido: ' + r1.itens[0].precoManual);

      // 9. O intervalo e em MINUTOS na tela e em SEGUNDOS no read().
      const topo = [...f.el.children].filter(e => e.classList.contains('field'));
      const intv = nums(f.el).find(i => i.closest('.field') && /minutos/.test(i.closest('.field').textContent));
      ok(!!intv, 'tem o campo de intervalo em minutos');
      ok(intv.value === '5', 'de fabrica sao 5 minutos (300 s): ' + intv.value);
      intv.value = '10';
      ok(f.read().intervaloSec === 600, 'o read() converte 10 min para 600 s: ' + f.read().intervaloSec);
      intv.value = '0';
      ok(f.read().intervaloSec >= 60, 'intervalo 0 nao passa: o minimo e 60 s (' + f.read().intervaloSec + ')');
      intv.value = '10';

      // 10. Conta desconectada: a tela DIZ, em vez de mostrar numero inventado.
      MOCHILA = { ok: false, itens: {} };
      MEDIA = { ok: false, media: 0, mediaQtd: 0, menor: 0, jaAberto: null };
      const f2 = sellerForm({ itens: [{ item: 'chip-fire', moeda: 'bits' }], intervaloSec: 300, maxPorHora: 10 }, ACC);
      document.body.append(f2.el);
      await espera(60);
      ok(f2.el.textContent.includes('nao esta conectada') || f2.el.textContent.includes('não está conectada'), 'mochila indisponivel: a tela avisa, nao inventa');
      ok(f2.el.textContent.includes('Nao deu para consultar') || f2.el.textContent.includes('Não deu para consultar'), 'media indisponivel: a tela avisa, nao inventa');

      // 11. Item sem nenhuma venda em 7 dias: a tela explica o que isso implica.
      MOCHILA = { ok: true, itens: { 'chip-fire': 2 } };
      MEDIA = { ok: true, media: 0, mediaQtd: 0, menor: 0, jaAberto: null };
      const f3 = sellerForm({ itens: [{ item: 'chip-fire', moeda: 'bits' }], intervaloSec: 300, maxPorHora: 10 }, ACC);
      document.body.append(f3.el);
      await espera(60);
      ok(f3.el.textContent.includes('Sem media em') || f3.el.textContent.includes('Sem média em'), 'sem media: a tela diz que ninguem vendeu em 7 dias');
      ok(f3.el.textContent.includes('preco fixo seu') || f3.el.textContent.includes('preço fixo seu'), 'e explica que so um preco fixo faria anunciar');

      // 12. Anuncio nosso ja aberto: o jogo SOMA e mantem o preco antigo. Se a
      // tela nao disser isso, a pessoa acha que o preco vai mudar.
      MEDIA = { ok: true, media: 4300, mediaQtd: 17, menor: 4000, jaAberto: { qtd: 7, preco: 9000 } };
      const f4 = sellerForm({ itens: [{ item: 'chip-fire', moeda: 'bits' }], intervaloSec: 300, maxPorHora: 10 }, ACC);
      document.body.append(f4.el);
      await espera(60);
      ok(f4.el.textContent.includes('SOMA'), 'com anuncio nosso aberto, a tela avisa que o jogo SOMA as unidades');
      ok(f4.el.textContent.includes('9.000'), 'e mostra o preco antigo que sera mantido');

      // 13. Mochila vazia: a tela nao esconde que nada sera anunciado.
      MOCHILA = { ok: true, itens: {} };
      MEDIA = { ok: true, media: 4300, mediaQtd: 17, menor: 0, jaAberto: null };
      const f5 = sellerForm({ itens: [{ item: 'chip-fire', moeda: 'bits' }], intervaloSec: 300, maxPorHora: 10 }, ACC);
      document.body.append(f5.el);
      await espera(60);
      ok(f5.el.textContent.includes('nenhuma'), 'mochila vazia: a tela diz que nada sera anunciado');

      // 14. Remover tira o item da lista.
      MOCHILA = { ok: true, itens: { 'chip-fire': 2 } };
      const cardItem = [...f.el.querySelectorAll('.card')].find(c => botao(c, 'Remover'));
      botao(cardItem, 'Remover').click();
      ok(f.read().itens.length === 0, 'remover tirou o item da lista');

      // 15. O aviso sobre dinheiro de verdade esta na tela.
      ok(f.el.textContent.includes('15%'), 'a tela avisa da comissao de 15%');
      ok(f.el.textContent.includes('2 min'), 'a tela avisa da retencao de 2 min');
    } catch (e) {
      out.push('FALHA excecao: ' + (e && e.stack || e));
    }
    return out.join('\\n');
  })()`);

  fs.writeFileSync(SAIDA, r + '\n');
  console.log(r);
  app.exit(/FALHA/.test(r) ? 1 : 0);
}).catch((e) => { console.log('FATAL ' + e); app.exit(1); });
