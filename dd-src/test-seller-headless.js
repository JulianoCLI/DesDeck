#!/usr/bin/env node
/**
 * O ToolSeller do modo headless, contra um mercado de mentira.
 *
 * O test-seller-tool.js prova a versao do webview. Esta e outra implementacao,
 * sobre o socket do DigiiIdleHeadlessClient, e um porte com um > trocado por >=
 * poe item de verdade a venda na conta de alguem, por um preco errado, sem
 * desfazer.
 *
 * O ponto mais delicado desta ferramenta nao e o preco: e a CONFIRMACAO. O jogo
 * nao responde a 'mercado.anunciar'. A unica prova de que o anuncio saiu e o
 * item DIMINUIR na mochila, o que chega depois, num pacote 'estado'. Isso cria
 * uma janela onde "anunciou" e "o jogo recusou" parecem iguais de fora — e e
 * nessa janela que anunciar de novo somaria unidades que ja estao a venda.
 * Metade deste teste existe para isso.
 *
 * Uso: node test-seller-headless.js
 */
'use strict';
const path = require('path');
const fs = require('fs');

const out = [];
const log = (...a) => { const t = a.join(' '); out.push(t); console.log(t); };
let falhas = 0;
const ok = (cond, txt) => { log(`  ${cond ? 'OK  ' : 'FALHA'} ${txt}`); if (!cond) falhas++; };

const { ToolSeller } = require('./src/headless/tools');

// ------------------------------------------------------------ o cliente falso
// So o que o ToolSeller usa. O removeListener faz parte do contrato: o client
// real e um EventEmitter e o stop() da ferramenta desliga o ouvinte do mercado
// por ele. Sem o metodo no dublê, um vazamento de ouvintes passaria calado.
function fakeClient(itens) {
  const ouvintes = {};
  return {
    index: 0,
    connected: true,
    state: { nick: 'teste', local: 'hunt', nivel: 50, bits: 1000, gemas: 10, itens: { ...itens } },
    enviados: [],
    eventos: [],
    on(ev, fn) { (ouvintes[ev] = ouvintes[ev] || []).push(fn); },
    removeListener(ev, fn) {
      const L = ouvintes[ev];
      if (!L) return;
      const i = L.indexOf(fn);
      if (i >= 0) L.splice(i, 1);
    },
    off(ev, fn) { this.removeListener(ev, fn); },
    listenerCount(ev) { return (ouvintes[ev] || []).length; },
    emit(ev, m) {
      if (ev === 'atividade') this.eventos.push(m);
      for (const fn of [...(ouvintes[ev] || [])]) fn(m);
    },
    sendCommand(t, d) { this.enviados.push({ t, d }); return true; },
  };
}

/**
 * Um seller ligado a um mercado de mentira.
 *
 * `mercado` e { [item]: { media, qtd, lista } }. A resposta sai pelo pacote
 * 'mercado', nao por um stub em cima do listar(): assim o teste exercita a fila
 * de pedidos e o ouvinte de verdade.
 */
function montar(cfg, mercado, itens) {
  const c = fakeClient(itens);
  const tool = new ToolSeller(c, cfg);
  const realSend = c.sendCommand.bind(c);
  c.sendCommand = (t, d) => {
    const r = realSend(t, d);
    if (t === 'mercado.listar') {
      const m = (typeof mercado === 'function' ? mercado(d) : mercado[d.especie]) || null;
      setTimeout(() => c.emit('mercado', {
        t: 'mercado',
        tipo: 'item',
        // A media de item vem AQUI, em media[moeda] — e nao em
        // 'mercado.precos', que o jogo descarta quando tipo === 'item'.
        media: m && m.media > 0 ? { [d.moeda]: { media: m.media, qtd: m.qtd || 0 } } : {},
        lista: (m && m.lista) || [],
        total: ((m && m.lista) || []).length,
        agora: Date.now(),
      }), 0);
    }
    return r;
  };
  tool.running = true;
  tool.pronto = true;
  return { c, tool };
}

const anuncs = (c) => c.enviados.filter((e) => e.t === 'mercado.anunciar');
const pedidos = (c) => c.enviados.filter((e) => e.t === 'mercado.listar');
const fases = (c) => c.eventos.filter((e) => e.tipo === 'seller').map((e) => e.fase);
const ITEM = (o = {}) => Object.assign({ item: 'chip-fire', moeda: 'bits', precoManual: 0, precoMinimo: 0 }, o);
const CFG = (o = {}) => Object.assign({ itens: [ITEM()], intervaloSec: 300, maxPorHora: 0 }, o);

async function main() {
  log('=== O ToolSeller do headless, contra um mercado de mentira ===\n');

  log('=== 1. O PADRAO DE FABRICA NAO VENDE NADA ===');
  {
    const w = {};
    new Function('window', fs.readFileSync(path.join(__dirname, 'src/renderer/tools.js'), 'utf8'))(w);
    const def = w.DDTools.TOOLS.find((t) => t.id === 'seller').defaults();
    const { c, tool } = montar(def, { 'chip-fire': { media: 4300, qtd: 9 } }, { 'chip-fire': 50 });
    await tool.step();
    ok(anuncs(c).length === 0, 'lista vazia: nao anunciou nada');
    ok(pedidos(c).length === 0, 'lista vazia: nem pediu a media');
  }

  log('\n=== 2. ANUNCIA PELA MEDIA, NO MESMO VALOR ===');
  {
    const { c, tool } = montar(CFG(), { 'chip-fire': { media: 4300, qtd: 17 } }, { 'chip-fire': 12 });
    await tool.step();
    const a = anuncs(c);
    ok(a.length === 1, `anunciou uma vez (${a.length})`);
    ok(a[0] && a[0].d.preco === 4300, `o preco e a media EXATA, sem acrescimo nem desconto: ${a[0] && a[0].d.preco}`);
    ok(a[0] && a[0].d.qtd === 12, `anunciou TUDO o que a mochila tinha (12): ${a[0] && a[0].d.qtd}`);
    ok(a[0] && a[0].d.tipo === 'item' && a[0].d.item === 'chip-fire' && a[0].d.moeda === 'bits',
      'o comando levou { tipo, item, qtd, moeda, preco }: ' + JSON.stringify(a[0].d));
    const p = pedidos(c)[0];
    ok(p && p.d.tipo === 'item' && p.d.especie === 'chip-fire' && p.d.moeda === 'bits' && p.d.ordem === undefined,
      'o pedido da media e { tipo:"item", especie, moeda }, sem "ordem": ' + JSON.stringify(p && p.d));
    tool.stop();
  }
  {
    // A media vem quebrada do servidor; o jogo arredonda no botao "usar", e a
    // ferramenta tem de arredondar igual — preco fracionado o servidor recusa.
    const { c, tool } = montar(CFG(), { 'chip-fire': { media: 4300.6, qtd: 3 } }, { 'chip-fire': 1 });
    await tool.step();
    ok(anuncs(c)[0].d.preco === 4301, `media quebrada arredondada como o jogo arredonda: ${anuncs(c)[0].d.preco}`);
    tool.stop();
  }

  log('\n=== 3. NAO ANUNCIA O QUE NAO DEVE ===');
  const naoDeve = [
    ['item que nao esta na mochila', CFG(), { 'chip-fire': { media: 4300, qtd: 9 } }, {}],
    ['mochila com zero unidades', CFG(), { 'chip-fire': { media: 4300, qtd: 9 } }, { 'chip-fire': 0 }],
    ['o servidor nao tem media (nenhuma venda em 7 dias)', CFG(), { 'chip-fire': { media: 0, qtd: 0 } }, { 'chip-fire': 5 }],
    ['a media esta abaixo do piso', CFG({ itens: [ITEM({ precoMinimo: 5000 })] }), { 'chip-fire': { media: 4300, qtd: 9 } }, { 'chip-fire': 5 }],
    ['item que o Mercado nao negocia', CFG({ itens: [ITEM({ item: 'scanner-ultra' })] }), { 'scanner-ultra': { media: 100, qtd: 9 } }, { 'scanner-ultra': 99 }],
    ['item sem id na linha', CFG({ itens: [ITEM({ item: '' })] }), {}, { 'chip-fire': 5 }],
    // O item existe no catalogo mas o Mercado nao conhece nenhuma venda dele:
    // a listagem volta vazia, sem media. Nao e o mesmo que a listagem FALHAR
    // (esse caminho precisa do timeout de 8 s e fica fora deste teste).
    ['o servidor nao conhece o item (listagem vazia)', CFG(), () => null, { 'chip-fire': 5 }],
  ];
  for (const [nome, cfg, mercado, itens] of naoDeve) {
    const { c, tool } = montar(cfg, mercado, itens);
    await tool.step();
    ok(anuncs(c).length === 0, `nao anunciou: ${nome}`);
    tool.stop();
  }

  log('\n=== 4. O MOTIVO VAI PARA O PAINEL ===');
  {
    const { c, tool } = montar(CFG(), { 'chip-fire': { media: 0, qtd: 0 } }, { 'chip-fire': 5 });
    await tool.step();
    const e = c.eventos.find((x) => x.tipo === 'seller' && x.fase === 'barrado');
    ok(e && e.motivo === 'sem-media', 'sem media no servidor: fase "barrado", motivo "sem-media"');
    tool.stop();
  }
  {
    const { c, tool } = montar(CFG({ itens: [ITEM({ precoMinimo: 5000 })] }), { 'chip-fire': { media: 4300, qtd: 9 } }, { 'chip-fire': 5 });
    await tool.step();
    const e = c.eventos.find((x) => x.tipo === 'seller' && x.fase === 'barrado');
    ok(e && e.motivo === 'piso' && e.piso === 5000, 'media abaixo do piso: motivo "piso", com o piso no evento');
    tool.stop();
  }
  {
    const { c, tool } = montar(CFG(), { 'chip-fire': { media: 4300, qtd: 9 } }, { 'chip-fire': 5 });
    await tool.step();
    ok(fases(c).includes('varreu'), 'toda volta emite "varreu", mesmo sem anunciar nada (o pulso do Painel)');
    tool.stop();
  }

  log('\n=== 5. O PRECO FIXO DA PESSOA MANDA ===');
  {
    const { c, tool } = montar(CFG({ itens: [ITEM({ precoManual: 9999 })] }), { 'chip-fire': { media: 4300, qtd: 9 } }, { 'chip-fire': 2 });
    await tool.step();
    ok(anuncs(c)[0].d.preco === 9999, `o preco fixo tem prioridade sobre a media: ${anuncs(c)[0].d.preco}`);
    const e = c.eventos.find((x) => x.tipo === 'seller' && x.fase === 'anunciando');
    ok(e && e.manual === true, 'o evento diz que o preco foi fixo, nao a media (o Painel precisa distinguir)');
    tool.stop();
  }
  {
    // Preco fixo e a UNICA forma de anunciar um item sem media no servidor.
    const { c, tool } = montar(CFG({ itens: [ITEM({ precoManual: 5000 })] }), { 'chip-fire': { media: 0, qtd: 0 } }, { 'chip-fire': 2 });
    await tool.step();
    ok(anuncs(c).length === 1, 'com preco fixo, anuncia mesmo sem media no servidor');
    tool.stop();
  }

  log('\n=== 6. A COMISSAO DE 15% VAI NO EVENTO ===');
  {
    // O bruto engana: a comissao sai do VENDEDOR. O Painel mostra o liquido, e
    // esse numero tem de ser o mesmo da tela do jogo.
    const { c, tool } = montar(CFG(), { 'chip-fire': { media: 1000, qtd: 9 } }, { 'chip-fire': 10 });
    await tool.step();
    const e = c.eventos.find((x) => x.tipo === 'seller' && x.fase === 'anunciando');
    ok(e && e.total === 10000, `total bruto = preco × qtd = 10000: ${e && e.total}`);
    ok(e && e.taxa === 1500, `comissao de 15% sobre o bruto = 1500: ${e && e.taxa}`);
    tool.stop();
  }

  log('\n=== 7. A CONFIRMACAO VEM DA MOCHILA, NAO DO JOGO ===');
  {
    const { c, tool } = montar(CFG(), { 'chip-fire': { media: 100, qtd: 9 } }, { 'chip-fire': 3 });
    await tool.step();
    ok(anuncs(c).length === 1, 'anunciou');
    ok(!fases(c).includes('anunciou'), 'ainda NAO diz "anunciou": o jogo nao respondeu e a mochila nao mudou');

    // A mochila diminui: a prova chegou.
    c.state.itens['chip-fire'] = 0;
    tool.confirmarPorInventario();
    const e = c.eventos.find((x) => x.tipo === 'seller' && x.fase === 'anunciou');
    ok(!!e, 'a mochila diminuiu: agora diz "anunciou"');
    ok(e && e.saiu === 3, `o evento diz quantas unidades sairam de fato (3): ${e && e.saiu}`);
    tool.stop();
  }
  {
    // O caso que custa dinheiro: sem confirmacao, anunciar de novo somaria
    // unidades que talvez ja estejam a venda, e nao ha como desfazer.
    const { c, tool } = montar(CFG(), { 'chip-fire': { media: 100, qtd: 9 } }, { 'chip-fire': 3 });
    await tool.step();
    ok(anuncs(c).length === 1, 'primeira volta: um anuncio');
    await tool.step();
    ok(anuncs(c).length === 1, 'mochila nao diminuiu: NAO anunciou de novo na volta seguinte');

    // Confirmada, a trava solta — e com a mochila vazia nada mais sai.
    c.state.itens['chip-fire'] = 0;
    tool.confirmarPorInventario();
    await tool.step();
    ok(anuncs(c).length === 1, 'confirmado e mochila vazia: segue sem anunciar');
    tool.stop();
  }
  {
    // A mochila voltou a encher (dropou mais): depois da confirmacao, anuncia.
    const { c, tool } = montar(CFG(), { 'chip-fire': { media: 100, qtd: 9 } }, { 'chip-fire': 3 });
    await tool.step();
    c.state.itens['chip-fire'] = 0;
    tool.confirmarPorInventario();
    c.state.itens['chip-fire'] = 5;
    await tool.step();
    ok(anuncs(c).length === 2, 'item novo na mochila depois da confirmacao: anuncia de novo');
    ok(anuncs(c)[1].d.qtd === 5, `e anuncia a quantidade nova (5): ${anuncs(c)[1].d.qtd}`);
    tool.stop();
  }

  log('\n=== 8. O ANUNCIO QUE JA ESTAVA ABERTO E SOMA, NAO PRECO NOVO ===');
  {
    // O jogo SOMA as unidades no lote existente e mantem o preco antigo
    // (menus2.js L1169). A ferramenta nao represa nada: so precisa DIZER que
    // foi soma, senao o Painel afirmaria um preco que nao vale.
    const { c, tool } = montar(CFG(),
      { 'chip-fire': { media: 4300, qtd: 9, lista: [{ id: 5, item: 'chip-fire', moeda: 'bits', qtd: 7, preco: 9000, meu: true }] } },
      { 'chip-fire': 2 });
    await tool.step();
    const e = c.eventos.find((x) => x.tipo === 'seller' && x.fase === 'anunciando');
    ok(e && e.somou === true, 'com anuncio nosso aberto, o evento marca "somou"');
    ok(anuncs(c)[0].d.preco === 4300, 'o comando ainda leva a media (o jogo e que ignora e mantem o preco antigo)');
    tool.stop();
  }
  {
    // O anuncio de OUTRA pessoa nao e "meu": marcar somou aqui mentiria.
    const { c, tool } = montar(CFG(),
      { 'chip-fire': { media: 4300, qtd: 9, lista: [{ id: 6, item: 'chip-fire', moeda: 'bits', qtd: 7, preco: 100, meu: false }] } },
      { 'chip-fire': 2 });
    await tool.step();
    const e = c.eventos.find((x) => x.tipo === 'seller' && x.fase === 'anunciando');
    ok(e && !e.somou, 'anuncio de outra pessoa nao conta como soma');
    ok(e && e.menor === 100, `o menor anuncio aberto dos outros vai no evento (100): ${e && e.menor}`);
    tool.stop();
  }

  log('\n=== 9. O LIMITE POR HORA SEGURA ===');
  {
    const mercado = {
      'chip-fire': { media: 100, qtd: 9 },
      'chip-water': { media: 100, qtd: 9 },
      'chip-wood': { media: 100, qtd: 9 },
    };
    const { c, tool } = montar(
      CFG({ maxPorHora: 1, itens: [ITEM(), ITEM({ item: 'chip-water' }), ITEM({ item: 'chip-wood' })] }),
      mercado,
      { 'chip-fire': 1, 'chip-water': 1, 'chip-wood': 1 });
    await tool.step();
    ok(anuncs(c).length === 1, `com limite de 1/h saiu 1 anuncio (${anuncs(c).length})`);
    tool.stop();
  }

  log('\n=== 10. A CONFIG TROCADA EM VOO VALE NA VOLTA SEGUINTE ===');
  {
    // startTool() troca this.config na ferramenta que ja roda. Se os itens
    // fossem copiados no constructor, o seller seguiria vendendo o que foi
    // REMOVIDO da lista — por isso 'itens' e um getter.
    const { c, tool } = montar(CFG({ itens: [] }), { 'chip-fire': { media: 100, qtd: 9 } }, { 'chip-fire': 4 });
    await tool.step();
    ok(anuncs(c).length === 0, 'lista vazia: nada');
    tool.config = CFG({ itens: [ITEM()] });
    await tool.step();
    ok(anuncs(c).length === 1, 'item adicionado em voo: anuncia na volta seguinte');
    tool.config = CFG({ itens: [] });
    c.state.itens['chip-fire'] = 0;
    tool.confirmarPorInventario();
    c.state.itens['chip-fire'] = 4;
    await tool.step();
    ok(anuncs(c).length === 1, 'item removido em voo: para de anunciar');
    tool.stop();
  }

  log('\n=== 11. O stop() NAO DEIXA LIXO ===');
  {
    const { c, tool } = montar(CFG(), { 'chip-fire': { media: 100, qtd: 9 } }, { 'chip-fire': 3 });
    await tool.step();
    ok(c.listenerCount('mercado') === 1, 'um ouvinte de mercado enquanto roda');
    tool.stop();
    ok(c.listenerCount('mercado') === 0, 'stop() removeu o ouvinte do mercado');
    ok(tool.esperando.size === 0, 'stop() limpou as esperas de confirmacao');
    ok(tool.timers.size === 0, 'stop() limpou os timers de confirmacao');
  }
  {
    // start() chamado duas vezes nao pode dobrar o ouvinte: cada pacote
    // 'mercado' consumiria DOIS slots da fila, e um await ficaria preso.
    const { c, tool } = montar(CFG(), { 'chip-fire': { media: 100, qtd: 9 } }, { 'chip-fire': 3 });
    tool.ouvirMercado();
    tool.ouvirMercado();
    ok(c.listenerCount('mercado') === 1, 'ouvirMercado() repetido nao duplica o ouvinte');
    tool.stop();
  }

  log(`\n=== RESULTADO: ${falhas ? falhas + ' FALHA(S)' : 'TUDO OK'} ===`);
  try { fs.writeFileSync(path.join(__dirname, 'seller-headless.txt'), out.join('\n') + '\n'); } catch {}
  process.exit(falhas ? 1 : 0);
}

main();
