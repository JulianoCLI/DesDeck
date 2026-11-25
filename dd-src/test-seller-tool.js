#!/usr/bin/env node
/**
 * Testa a ferramenta Auto Seller sem tocar em conta nenhuma.
 *
 * `node --check tools.js` nao basta: o codigo da ferramenta vive DENTRO de uma
 * template string, entao um erro de sintaxe ali passa pelo --check e so aparece
 * quando a ferramenta e injetada numa conta real — tarde demais.
 *
 * Aqui o codigo gerado e compilado de verdade (new Function) e depois RODADO
 * contra um mercado de mentira. Nada sai para a rede: o 'enviar' e interceptado
 * e cada comando fica registrado, o que deixa provar as coisas que de outro
 * jeito custariam itens de verdade:
 *
 *   - lista vazia nao anuncia nada;
 *   - item que nao esta na mochila nao e anunciado;
 *   - o preco enviado e EXATAMENTE a media de 7 dias, sem acrescimo nem desconto;
 *   - sem media no servidor nao anuncia (nao chuta preco);
 *   - o preco fixo da pessoa tem prioridade sobre a media;
 *   - o piso segura o anuncio quando a media cai abaixo dele;
 *   - a quantidade anunciada e TUDO o que esta na mochila;
 *   - o limite por hora segura o anuncio;
 *   - item que o Mercado nao negocia e descartado na geracao do codigo;
 *   - nao anuncia o mesmo item duas vezes enquanto a mochila nao confirma.
 *
 * Uso: node test-seller-tool.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SAIDA = path.join(__dirname, 'seller-tool.txt');
const out = [];
const log = (...a) => { const t = a.join(' '); out.push(t); console.log(t); try { fs.writeFileSync(SAIDA, out.join('\n') + '\n'); } catch {} };

let falhas = 0;
const ok = (cond, txt) => { log(`  ${cond ? 'OK  ' : 'FALHA'} ${txt}`); if (!cond) falhas++; };

// Carrega o catalogo como o renderer faria (sem Node, publicando em window).
const codigo = fs.readFileSync(path.join(__dirname, 'src/renderer/tools.js'), 'utf8');
const win = {};
new Function('window', codigo)(win);
const DDTools = win.DDTools;
const tool = DDTools.TOOLS.find((t) => t.id === 'seller');

log('=== 1. A FERRAMENTA EXISTE E COMPILA ===');
ok(!!tool, 'o catalogo tem a ferramenta "seller"');
const cfgPadrao = tool.defaults();
const src = tool.code(cfgPadrao);
ok(typeof src === 'string' && src.length > 500, `code() gerou ${src.length} caracteres`);
try { new Function(src); ok(true, 'o codigo gerado COMPILA (new Function)'); }
catch (e) { ok(false, 'o codigo gerado NAO compila: ' + e.message); }

log('\n=== 2. PADRAO DE FABRICA E SEGURO ===');
ok((cfgPadrao.itens || []).length === 0, 'nasce com a lista de itens VAZIA (nao anuncia nada)');
ok(cfgPadrao.maxPorHora > 0, `vem com limite de ${cfgPadrao.maxPorHora} anuncios/hora`);
ok(tool.padraoLigado !== true, 'NAO vem ligada de fabrica');
ok(/sem item na lista/.test(tool.summary(cfgPadrao)), 'o resumo avisa que nao anuncia nada');

log('\n=== 3. O FILTRO DE ITEM NEGOCIAVEL ===');
ok(DDTools.vendavel('chip-fire'), 'chip-fire e negociavel (prefixo chip-)');
ok(DDTools.vendavel('evoluter'), 'evoluter e negociavel (item avulso da lista)');
ok(!DDTools.vendavel('scanner-ultra'), 'scanner-ultra NAO e negociavel');
ok(!DDTools.vendavel(''), 'id vazio nao e negociavel');
{
  // O id que o Mercado nao aceita tem de morrer na geracao do codigo: se
  // passasse, seria um comando recusado a cada volta, para sempre.
  const s = tool.code({ itens: [{ item: 'scanner-ultra', moeda: 'bits' }], intervaloSec: 60, maxPorHora: 0 });
  ok(!s.includes('scanner-ultra'), 'item nao negociavel e descartado por code() (nem entra no script)');
}

// ---------------------------------------------------------------- o laboratorio
// Um mercado de mentira. 'mercado.listar' responde com a media e os anuncios que
// o teste montou; 'mercado.anunciar' so e anotado.
//
// O laco da ferramenta estreia com 20 s + jitter de atraso (o disfarce: varias
// contas sobem juntas e nao devem anunciar no mesmo segundo). Esperar isso em
// teste seria absurdo, e esperar MENOS daria um falso "nao anunciou" — a
// ferramenta nem teria comecado. O Auto Seller nao tem um gatilho de push como o
// 'mercado.mudou' do Sniper (ele olha a MOCHILA, nao o mercado), entao o atraso
// de estreia e zerado no script, que e a unica peca de tempo irrelevante aqui.
function laboratorio(mercadoPorItem, estado, cfg) {
  const enviados = [];
  const ouvintes = [];
  const sock = {
    readyState: 1,
    url: 'wss://x/ws',
    addEventListener: (ev, fn) => { if (ev === 'message') ouvintes.push(fn); },
    send: () => {},
  };
  const responder = (m) => { for (const fn of ouvintes) fn({ data: JSON.stringify(m) }); };

  const G = {
    sock, estado, ovos: null, campo: null, pronto: true,
    espera: [], aoMorrer: [], aoEstado: [], aoLabMudou: [], cfg: {},
    aplicar(id, novo) { this.cfg[id] = novo; return false; },
    desligar(id) { if (this.cfg[id]) this.cfg[id].__off = true; },
    quando(fn) { fn(); },
    log: () => {},
    jitter: () => 0,
    semente: () => 0.5,
    // O respirar da ponte resolve VAZIO, igual ao de verdade. Se o mock
    // devolvesse true, o teste esconderia justamente o defeito que o
    // `if (CFG.__off)` do script existe para cobrir.
    respirar: () => Promise.resolve(),
    enviar(t, dados) {
      enviados.push({ t, ...dados });
      if (t === 'mercado.listar') {
        const m = mercadoPorItem[dados.especie] || { media: 0, qtd: 0, lista: [] };
        setTimeout(() => responder({
          t: 'mercado',
          tipo: 'item',
          // A media de item vem AQUI, em media[moeda] — e nao em
          // 'mercado.precos', que o jogo descarta quando tipo === 'item'.
          media: m.media > 0 ? { [dados.moeda]: { media: m.media, qtd: m.qtd || 0 } } : {},
          lista: m.lista || [],
          total: (m.lista || []).length,
          agora: Date.now(),
          pagina: 0,
        }), 5);
      }
      return true;
    },
  };
  const corpo = tool.code(cfg)
    .replace(/^\(\(\) => \{\n/, '').replace(/\n\}\)\(\);$/, '')
    .replace("20000 + G.jitter('seller-inicio', 45000)", '0');
  new Function('G', 'window', corpo)(G, { __ddGame: G });
  return { enviados, responder, G };
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const anunciados = (lab) => lab.enviados.filter((e) => e.t === 'mercado.anunciar');
// Uma volta completa: o pedido de listagem responde em 5 ms e o respirar da
// ponte resolve na hora, entao 200 ms sobram com folga para cada item.
const VOLTA_MS = 300;
const rodar = async (lab) => { await espera(VOLTA_MS); };

const ESTADO = (itens) => ({ t: 'estado', bits: 1000, gemas: 10, nick: 'teste', contaId: 'c1', itens });
const ITEM = (over = {}) => ({ item: 'chip-fire', moeda: 'bits', precoManual: 0, precoMinimo: 0, ...over });
const CFG = (over = {}) => ({ itens: [ITEM()], intervaloSec: 60, maxPorHora: 0, ...over });

(async () => {
  log('\n=== 4. ANUNCIA PELA MEDIA, NO MESMO VALOR ===');
  {
    const lab = laboratorio(
      { 'chip-fire': { media: 4300, qtd: 17, lista: [] } },
      ESTADO({ 'chip-fire': 12 }),
      CFG());
    await rodar(lab);
    const a = anunciados(lab);
    ok(a.length === 1, `anunciou uma vez (anunciou ${a.length})`);
    ok(a[0] && a[0].preco === 4300, `o preco e a media EXATA, sem acrescimo nem desconto: ${a[0] && a[0].preco}`);
    ok(a[0] && a[0].qtd === 12, `anunciou TUDO o que a mochila tinha (12): ${a[0] && a[0].qtd}`);
    ok(a[0] && a[0].tipo === 'item' && a[0].item === 'chip-fire' && a[0].moeda === 'bits',
      'o comando levou { tipo, item, qtd, moeda, preco } como o jogo manda: ' + JSON.stringify(a[0]));
  }
  {
    // A media vem quebrada do servidor; o jogo arredonda no botao "usar", e a
    // ferramenta tem de arredondar igual — preco fracionado o servidor recusa.
    const lab = laboratorio(
      { 'chip-fire': { media: 4300.6, qtd: 3, lista: [] } },
      ESTADO({ 'chip-fire': 1 }),
      CFG());
    await rodar(lab);
    const a = anunciados(lab);
    ok(a[0] && a[0].preco === 4301, `media quebrada e arredondada como o jogo arredonda: ${a[0] && a[0].preco}`);
  }

  log('\n=== 5. NAO ANUNCIA O QUE NAO DEVE ===');
  const naoDeve = [
    ['lista de itens vazia', { 'chip-fire': { media: 4300, qtd: 9 } }, ESTADO({ 'chip-fire': 12 }), CFG({ itens: [] })],
    ['item que nao esta na mochila', { 'chip-fire': { media: 4300, qtd: 9 } }, ESTADO({}), CFG()],
    ['mochila com zero unidades', { 'chip-fire': { media: 4300, qtd: 9 } }, ESTADO({ 'chip-fire': 0 }), CFG()],
    ['o servidor nao tem media (nenhuma venda em 7 dias)', { 'chip-fire': { media: 0, qtd: 0 } }, ESTADO({ 'chip-fire': 5 }), CFG()],
    ['a media esta abaixo do piso', { 'chip-fire': { media: 1000, qtd: 9 } }, ESTADO({ 'chip-fire': 5 }), CFG({ itens: [ITEM({ precoMinimo: 4000 })] })],
  ];
  for (const [nome, mercado, estado, cfg] of naoDeve) {
    const lab = laboratorio(mercado, estado, cfg);
    await rodar(lab);
    ok(anunciados(lab).length === 0, `nao anunciou: ${nome}`);
  }
  {
    // O servidor nao respondeu a listagem: sem referencia nao se inventa preco.
    const lab = laboratorio({}, ESTADO({ 'chip-fire': 5 }), CFG());
    lab.G.enviar = (t, d) => { lab.enviados.push({ t, ...d }); return true; };
    await rodar(lab);
    ok(anunciados(lab).length === 0, 'nao anunciou: o servidor nao respondeu a listagem');
  }

  log('\n=== 6. O PRECO FIXO DA PESSOA MANDA ===');
  {
    const lab = laboratorio(
      { 'chip-fire': { media: 4300, qtd: 9, lista: [] } },
      ESTADO({ 'chip-fire': 2 }),
      CFG({ itens: [ITEM({ precoManual: 9999 })] }));
    await rodar(lab);
    const a = anunciados(lab);
    ok(a[0] && a[0].preco === 9999, `o preco fixo tem prioridade sobre a media: ${a[0] && a[0].preco}`);
  }
  {
    // Preco fixo e a UNICA forma de anunciar um item sem media no servidor.
    const lab = laboratorio(
      { 'chip-fire': { media: 0, qtd: 0, lista: [] } },
      ESTADO({ 'chip-fire': 2 }),
      CFG({ itens: [ITEM({ precoManual: 5000 })] }));
    await rodar(lab);
    ok(anunciados(lab).length === 1, 'com preco fixo, anuncia mesmo sem media no servidor');
  }

  log('\n=== 7. O LIMITE POR HORA SEGURA ===');
  {
    // Tres itens na lista, limite de 1: so o primeiro pode sair.
    const mercado = {
      'chip-fire': { media: 100, qtd: 9, lista: [] },
      'chip-water': { media: 100, qtd: 9, lista: [] },
      'chip-wood': { media: 100, qtd: 9, lista: [] },
    };
    const lab = laboratorio(mercado,
      ESTADO({ 'chip-fire': 1, 'chip-water': 1, 'chip-wood': 1 }),
      CFG({ maxPorHora: 1, itens: [ITEM(), ITEM({ item: 'chip-water' }), ITEM({ item: 'chip-wood' })] }));
    await rodar(lab);
    ok(anunciados(lab).length === 1, `com limite de 1/h saiu 1 anuncio (saiu ${anunciados(lab).length})`);
  }

  log('\n=== 8. NAO ANUNCIA O MESMO ITEM DUAS VEZES SEM CONFIRMACAO ===');
  {
    // O jogo nao responde a 'mercado.anunciar'. Enquanto a mochila nao
    // diminuir, anunciar de novo somaria unidades que talvez ja estejam a
    // venda — e nao ha como desfazer.
    const lab = laboratorio(
      { 'chip-fire': { media: 100, qtd: 9, lista: [] } },
      ESTADO({ 'chip-fire': 3 }),
      CFG({ intervaloSec: 60, itens: [ITEM()] }));
    await rodar(lab);
    ok(anunciados(lab).length === 1, 'primeira volta: um anuncio');
    // Segunda volta sem a mochila ter mudado: o estado chega igual.
    lab.responder({ ...ESTADO({ 'chip-fire': 3 }) });
    await rodar(lab);
    ok(anunciados(lab).length === 1, 'mochila nao diminuiu: NAO anunciou de novo');
  }

  log('\n=== 9. DESLIGAR PARA NO MEIO DA VOLTA ===');
  {
    const lab = laboratorio(
      { 'chip-fire': { media: 100, qtd: 9, lista: [] }, 'chip-water': { media: 100, qtd: 9, lista: [] } },
      ESTADO({ 'chip-fire': 1, 'chip-water': 1 }),
      CFG({ itens: [ITEM(), ITEM({ item: 'chip-water' })] }));
    lab.G.desligar('seller');
    await rodar(lab);
    ok(anunciados(lab).length === 0, 'desligada antes da volta, nao anunciou nada');
  }

  log(`\n=== RESULTADO: ${falhas ? falhas + ' FALHA(S)' : 'TUDO OK'} ===`);
  process.exit(falhas ? 1 : 0);
})();
