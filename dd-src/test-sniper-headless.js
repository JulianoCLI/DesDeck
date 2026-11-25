#!/usr/bin/env node
/**
 * O ToolSniper do modo headless, contra um mercado de mentira.
 *
 * O test-sniper-tool.js prova a versao do webview. Esta e outra implementacao,
 * sobre o socket do DigiiIdleHeadlessClient, e "foi portado letra a letra" e
 * exatamente o tipo de afirmacao que merece teste: um porte com um > trocado por
 * >= gasta dinheiro de verdade na conta de alguem.
 *
 * Aqui o cliente e falso: nada vai para a rede. O relogio do "servidor" e
 * controlado, entao a fila da retencao da para exercitar de verdade — e esse e o
 * caminho que as rodadas reais nao conseguiram exercitar, porque todo anuncio
 * barato ja estava liberado.
 *
 * Uso: node test-sniper-headless.js
 */
'use strict';
const path = require('path');
const fs = require('fs');

const SAIDA = path.join(__dirname, 'sniper-headless.txt');
const out = [];
const log = (...a) => { const t = a.join(' '); out.push(t); console.log(t); };
let falhas = 0;
const ok = (cond, txt) => { log(`  ${cond ? 'OK  ' : 'FALHA'} ${txt}`); if (!cond) falhas++; };

const { ToolSniper } = require('./src/headless/tools');

// ------------------------------------------------------------ o cliente falso
// So o que o ToolSniper usa: on(), removeListener(), state, connected,
// sendCommand(). O removeListener faz parte do contrato: o client real e um
// EventEmitter, e o stop() da ferramenta desliga os ouvintes do mercado por
// ele. Sem o metodo no dublê, o teste nao enxergaria um vazamento de ouvintes.
function fakeClient(estado) {
  const ouvintes = {};
  return {
    index: 0,
    connected: true,
    state: Object.assign({ nick: 'teste', local: 'hunt', nivel: 50, bits: 1000000, gemas: 100 }, estado),
    enviados: [],
    on(ev, fn) { (ouvintes[ev] = ouvintes[ev] || []).push(fn); },
    removeListener(ev, fn) {
      const L = ouvintes[ev];
      if (!L) return;
      const i = L.indexOf(fn);
      if (i >= 0) L.splice(i, 1);
    },
    off(ev, fn) { this.removeListener(ev, fn); },
    listenerCount(ev) { return (ouvintes[ev] || []).length; },
    // Uma copia: um ouvinte que se remove durante o emit (o stop() da propria
    // ferramenta) nao deve embaralhar a iteracao em curso.
    emit(ev, m) { for (const fn of [...(ouvintes[ev] || [])]) fn(m); },
    sendCommand(t, d) { this.enviados.push({ t, d }); return true; },
  };
}

// Um sniper ligado a um mercado de mentira. 'lista' e o que o servidor
// responderia; 'agora' e o relogio dele.
function montar(cfg, lista, opts = {}) {
  const c = fakeClient(opts.estado);
  const tool = new ToolSniper(c, cfg);
  // O "servidor" responde no socket, nao na funcao: o pedido sai pelo
  // sendCommand e a resposta volta como o pacote 'mercado'. Assim o teste
  // exercita o listar() e o ouvinte de verdade — inclusive a medicao do desvio
  // de relogio, que um stub em cima do listar() passaria por cima.
  const realSend = c.sendCommand.bind(c);
  c.sendCommand = (t, d) => {
    const r = realSend(t, d);
    if (t === 'mercado.listar') {
      const L = typeof lista === 'function' ? lista(d) : lista;
      // O relogio do servidor ANDA. Um 'agora' congelado deixaria todo libera
      // eternamente no futuro, e a fila nunca compraria — artefato do teste, nao
      // da ferramenta. 'desvio' e o quanto o servidor esta atras do nosso.
      const agora = Date.now() - (opts.desvio || 0);
      setTimeout(() => c.emit('mercado', { t: 'mercado', lista: L, total: L.length, agora }), 0);
    }
    return r;
  };
  tool.running = true;
  tool.pronto = true;
  return { c, tool };
}

const compras = (c) => c.enviados.filter((e) => e.t === 'mercado.comprar');
const pedidos = (c) => c.enviados.filter((e) => e.t === 'mercado.listar');
const anuncio = (o = {}) => Object.assign({
  id: 1, preco: 1000, moeda: 'bits', tipo: 'ovo', estado: 'aberto', meu: false,
  libera: 0, resumo: { especie: 'lopmon', potencia: 4, data: 0 },
}, o);

const CFG = (o = {}) => Object.assign({
  alvos: [{ nome: 'alvo', tipo: 'ovo', moeda: 'bits', tetoPreco: 5000, tiers: [], potencias: [], energiaMin: 0, especie: '' }],
  intervaloSec: 60, reservaBits: 0, reservaGemas: 0, maxPorHora: 5, soLiberados: false,
}, o);

async function main() {
  log('=== O ToolSniper do headless, contra um mercado de mentira ===\n');

  log('=== 1. O PADRAO DE FABRICA NAO GASTA NADA ===');
  {
    // O mesmo default do webview, que vem com tetoPreco 0.
    const w = {};
    new Function('window', fs.readFileSync(path.join(__dirname, 'src/renderer/tools.js'), 'utf8'))(w);
    const def = w.DDTools.TOOLS.find((t) => t.id === 'sniper').defaults();
    const { c, tool } = montar(def, [anuncio({ preco: 1 })]);
    await tool.step();
    ok(compras(c).length === 0, 'alvo com teto 0: nao comprou nada');
    ok(pedidos(c).length === 0, 'alvo com teto 0: nem pediu a lista');
  }

  log('\n=== 2. COMPRA O QUE DEVE ===');
  {
    const { c, tool } = montar(CFG(), [anuncio({ id: 7, preco: 1000 })]);
    await tool.step();
    const k = compras(c);
    ok(k.length === 1, `comprou uma vez (${k.length})`);
    ok(k[0] && k[0].d.id === 7, 'comprou o anuncio certo');
    ok(k[0] && k[0].d.preco === 1000, 'mandou o preco junto (o servidor recusa se mudou)');
    ok(k[0] && k[0].d.qtd === 1, 'comprou 1');
  }

  log('\n=== 3. O QUE ELE NAO PODE COMPRAR ===');
  {
    const casos = [
      ['acima do teto', anuncio({ preco: 5001 })],
      ['o meu proprio anuncio', anuncio({ meu: true })],
      ['anuncio ja vendido', anuncio({ estado: 'vendido' })],
      ['moeda diferente da do alvo', anuncio({ moeda: 'gemas' })],
      ['preco zero/ausente', anuncio({ preco: 0 })],
    ];
    for (const [nome, a] of casos) {
      const { c, tool } = montar(CFG(), [a]);
      await tool.step();
      ok(compras(c).length === 0, `nao comprou: ${nome}`);
    }
    // A reserva.
    const { c, tool } = montar(CFG({ reservaBits: 999999 }), [anuncio({ preco: 5000 })], { estado: { bits: 1000000 } });
    await tool.step();
    ok(compras(c).length === 0, 'nao comprou: a reserva nao deixa');
  }

  log('\n=== 4. OS FILTROS VAO PARA O SERVIDOR ===');
  {
    const { c, tool } = montar(CFG({
      alvos: [{ tipo: 'ovo', moeda: 'bits', tetoPreco: 5000, tiers: ['S', 'SS'], potencias: [4, 5], energiaMin: 3, especie: 'lopmon' }],
    }), []);
    await tool.step();
    const f = pedidos(c)[0] && pedidos(c)[0].d;
    ok(f && f.tiers === 'S,SS', `tiers viraram string: ${f && f.tiers}`);
    ok(f && f.potencias === '4,5', `potencias viraram string: ${f && f.potencias}`);
    ok(f && f.maisMin === 3, `energiaMin virou maisMin (o +N, nao a potencia): ${f && f.maisMin}`);
    ok(f && f.precoMax === 5000, 'o teto foi como precoMax');
    ok(f && f.especie === 'lopmon', 'a especie foi');
    // Campo vazio nao deve ir.
    const { c: c2, tool: t2 } = montar(CFG(), []);
    await t2.step();
    const f2 = pedidos(c2)[0].d;
    ok(!('tiers' in f2) && !('maisMin' in f2), 'filtro vazio e omitido, nao mandado em branco');
  }

  log('\n=== 5. A FILA DA RETENCAO (o coracao da ferramenta) ===');
  {
    // Anuncio retido: libera 300 ms no futuro, pelo relogio do servidor.
    const agora = Date.now();
    const retido = anuncio({ id: 50, libera: agora + 300 });
    const { c, tool } = montar(CFG(), [retido], { });
    await tool.step();
    ok(compras(c).length === 0, 'anuncio retido NAO foi comprado na hora');
    ok(tool.fila.has(50), 'o anuncio entrou na fila');
    // O timer espera o libera + a folga de 250 ms.
    await new Promise((r) => setTimeout(r, 900));
    ok(compras(c).length === 1, `comprou quando o libera chegou (${compras(c).length})`);
    tool.stop();
  }
  {
    // Com "so liberados", o retido e ignorado de vez.
    const agora = Date.now();
    const { c, tool } = montar(CFG({ soLiberados: true }), [anuncio({ id: 51, libera: agora + 300 })], { });
    await tool.step();
    ok(!tool.fila.has(51) && compras(c).length === 0, 'com "so liberados", o retido nem entra na fila');
    tool.stop();
  }
  {
    // Sumiu durante a espera: nao compra.
    const agora = Date.now();
    let fase = 0;
    const { c, tool } = montar(CFG(), () => (fase++ === 0 ? [anuncio({ id: 52, libera: agora + 200 })] : []), { });
    await tool.step();
    await new Promise((r) => setTimeout(r, 900));
    ok(compras(c).length === 0, 'anuncio que sumiu na espera nao gera compra');
    tool.stop();
  }
  {
    // Subiu de preco na espera: nao compra.
    const agora = Date.now();
    let fase = 0;
    const { c, tool } = montar(CFG(), () => (fase++ === 0
      ? [anuncio({ id: 53, preco: 1000, libera: agora + 200 })]
      : [anuncio({ id: 53, preco: 99999, libera: 0 })]), { });
    await tool.step();
    await new Promise((r) => setTimeout(r, 900));
    ok(compras(c).length === 0, 'anuncio que subiu acima do teto na espera nao e comprado');
    tool.stop();
  }

  log('\n=== 6. LIMITE POR HORA ===');
  {
    const lista = [anuncio({ id: 61 }), anuncio({ id: 62 }), anuncio({ id: 63 }), anuncio({ id: 64 })];
    const { c, tool } = montar(CFG({ maxPorHora: 2 }), lista);
    await tool.step();
    ok(compras(c).length === 2, `respeitou o limite de 2/hora e comprou de fato (${compras(c).length})`);
  }

  log('\n=== 7. NAO COMPRA O MESMO ANUNCIO DUAS VEZES ===');
  {
    const { c, tool } = montar(CFG(), [anuncio({ id: 70 })]);
    await tool.step();
    await tool.step();
    ok(compras(c).length === 1, `comprou o #70 uma vez so (${compras(c).length})`);
  }

  log('\n=== 8. DESLIGAR PARA NA HORA ===');
  {
    const agora = Date.now();
    const { c, tool } = montar(CFG(), [anuncio({ id: 80, libera: agora + 300 })], { });
    await tool.step();
    tool.config.__off = true;             // o toggle da UI, sem recarregar
    await new Promise((r) => setTimeout(r, 900));
    ok(compras(c).length === 0, 'desligada na espera, nao compra quando o libera chega');
    tool.stop();
  }
  {
    const { c, tool } = montar(CFG({ __off: true }), [anuncio({ id: 81 })]);
    await tool.step();
    ok(compras(c).length === 0 && pedidos(c).length === 0, 'desligada nem pede a lista');
  }

  log('\n=== 9. O RELOGIO E O DO SERVIDOR, NAO O NOSSO ===');
  {
    // Se o relogio local estiver 1 h adiantado, um anuncio retido tem de
    // continuar retido. Confiar no Date.now() local compraria adiantado, e o
    // servidor recusaria.
    const agoraServidor = Date.now() - 3600000;
    const { c, tool } = montar(CFG(), [anuncio({ id: 90, libera: agoraServidor + 60000 })], { desvio: 3600000 });
    await tool.step();
    ok(compras(c).length === 0, 'com o relogio local fora de hora, o retido segue retido');
    ok(Math.abs(tool.desvio - 3600000) < 5000, `mediu o desvio do relogio (~${Math.round(tool.desvio / 1000)}s)`);
    tool.stop();
  }

  log('\n=== 10. SALDO CURTO E DITO, NAO CALADO ===');
  {
    const { c, tool } = montar(CFG(), [anuncio({ id: 100, preco: 5000 })], { estado: { bits: 10 } });
    const ditos = [];
    tool.log = (...a) => ditos.push(a.join(' '));
    await tool.step();
    await tool.step();
    ok(compras(c).length === 0, 'com saldo curto, nao comprou');
    ok(ditos.some((t) => /saldo/i.test(t)), 'avisou no log que o saldo nao da');
    ok(ditos.filter((t) => /saldo/i.test(t)).length === 1, 'avisou uma vez so (nao enche o log)');
  }

  log('\n=== 11. A CONFIG NOVA VALE NA HORA ===');
  {
    // startTool() troca this.config na ferramenta que ja roda. Se os alvos
    // tivessem sido copiados no constructor, ela seguiria no alvo velho.
    const { c, tool } = montar(CFG({ alvos: [] }), [anuncio({ id: 110, preco: 1000 })]);
    await tool.step();
    ok(compras(c).length === 0, 'sem alvo, nao comprou');
    tool.config = CFG();                  // como o startTool() faz
    await tool.step();
    ok(compras(c).length === 1, 'alvo novo passou a valer sem recriar a ferramenta');
  }

  log('\n=== 12. O PUSH DO MERCADO DISPARA UMA VARREDURA ===');
  {
    const { c, tool } = montar(CFG(), [anuncio({ id: 120 })]);
    c.emit('mercado-mudou', { t: 'mercado.mudou' });
    await new Promise((r) => setTimeout(r, 1600));
    ok(compras(c).length === 1, `'mercado.mudou' provocou a varredura (${compras(c).length})`);
    tool.stop();
  }

  log('\n=== 13. ALVO DE ITEM PELA METADE NAO VIRA ALVO LARGO ===');
  {
    // Alvo 'item' com teto mas SEM item escolhido: se passar, o pedido vai sem
    // 'especie', o servidor lista TODO item do Mercado e o sniper compra
    // qualquer coisa abaixo do teto. Parece configurado, e e o pior caso.
    const { c, tool } = montar(CFG({
      alvos: [{ nome: 'item sem item', tipo: 'item', moeda: 'bits', tetoPreco: 999999, especie: '' }],
    }), [anuncio({ id: 130, preco: 1000, tipo: 'item', item: 'token-boss' })]);
    await tool.step();
    ok(pedidos(c).length === 0, 'alvo de item sem item escolhido: nem pede a lista');
    ok(compras(c).length === 0, 'alvo de item sem item escolhido: nao compra nada');
  }
  {
    // Com o item escolhido, ele vira um alvo normal — e o id vai em 'especie',
    // que e o campo que o cliente do jogo usa para item (menus2.js L408).
    const { c, tool } = montar(CFG({
      alvos: [{ nome: 'chip de fogo', tipo: 'item', moeda: 'bits', tetoPreco: 999999, especie: 'chip-fire' }],
    }), [anuncio({ id: 131, preco: 200000, tipo: 'item', item: 'chip-fire' })]);
    await tool.step();
    const f = pedidos(c)[0] && pedidos(c)[0].d;
    ok(f && f.tipo === 'item' && f.especie === 'chip-fire', `o id do item foi em 'especie': ${f && f.especie}`);
    ok(compras(c).length === 1, `comprou o item (${compras(c).length})`);
  }

  log('\n=== 14. A BUSCA DE ITEM POR NOME ===');
  {
    // A lista de itens e os nomes vem do jogo; a busca e o que a tela usa.
    const w = {};
    new Function('window', fs.readFileSync(path.join(__dirname, 'src/renderer/tools.js'), 'utf8'))(w);
    const { acharItem, MERCADO_ITENS } = w.DDTools;
    ok(MERCADO_ITENS.length === 45, `45 itens negociados pelo Mercado (${MERCADO_ITENS.length})`);
    ok(acharItem('fogo') && acharItem('fogo').id === 'chip-fire', 'acha "fogo" -> chip-fire');
    ok(acharItem('fisico') && acharItem('fisico').id === 'chip-physical', 'acha "fisico" sem acento -> chip-physical');
    ok(acharItem('dragon pura') && acharItem('dragon pura').id === 'data-dragon-pura', 'acha "dragon pura" -> data-dragon-pura');
    ok(acharItem('Evoluter') && acharItem('Evoluter').id === 'evoluter', 'acha pelo nome exato, sem ligar para maiuscula');
    ok(acharItem('token-boss') && acharItem('token-boss').id === 'token-boss', 'acha pelo id cru');
    // O caso que importa: ambiguo NAO escolhe sozinho.
    ok(acharItem('chip') === null, '"chip" casa com 11 e devolve null (nao crava o primeiro)');
    ok(acharItem('nao existe') === null, 'texto sem par nenhum devolve null');
    ok(acharItem('') === null, 'texto vazio devolve null');
    // Todo id do catalogo tem de ser encontravel pelo proprio nome, senao o
    // seletor oferece um rotulo que a busca nao acha.
    const ruins = MERCADO_ITENS.filter((it) => {
      const r = acharItem(it.nome);
      return !r || r.id !== it.id;
    });
    ok(ruins.length === 0, `todo item e achavel pelo seu nome exato (falhas: ${ruins.map((x) => x.id).join(', ') || 'nenhuma'})`);
  }

  log('\n=== 15. UM ALVO, DOIS TETOS (um por moeda) ===');
  {
    // Um alvo guarda tetoBits e tetoGemas. Ele tem de virar DUAS buscas, cada
    // uma com o seu teto -- senao o teto de bits acabaria valendo para D-Dol,
    // onde 5.000 e uma fortuna.
    const { c, tool } = montar(CFG({
      alvos: [{ nome: 'dois tetos', tipo: 'ovo', tetoBits: 5000, tetoGemas: 40 }],
    }), []);
    await tool.step();
    const fs2 = pedidos(c).map((p) => p.d);
    ok(fs2.length === 2, `dois tetos = dois pedidos (${fs2.length})`);
    const emBits = fs2.find((f) => f.moeda === 'bits');
    const emGemas = fs2.find((f) => f.moeda === 'gemas');
    ok(emBits && emBits.precoMax === 5000, `o pedido em bits leva 5000 (${emBits && emBits.precoMax})`);
    ok(emGemas && emGemas.precoMax === 40, `o pedido em D-Dol leva 40 (${emGemas && emGemas.precoMax})`);
  }
  {
    // Teto 0 numa moeda quer dizer "nao compre nesta moeda". Nao e so nao
    // comprar: nem pedir a lista, senao um anuncio barato em D-Dol apareceria e
    // o resto da logica teria de se lembrar de recusar.
    const { c, tool } = montar(CFG({
      alvos: [{ nome: 'so bits', tipo: 'ovo', tetoBits: 5000, tetoGemas: 0 }],
    }), [anuncio({ id: 150, preco: 10, moeda: 'gemas' })], { estado: { bits: 9e9, gemas: 9e9 } });
    await tool.step();
    ok(pedidos(c).length === 1 && pedidos(c)[0].d.moeda === 'bits', 'teto 0 em D-Dol: so pede a lista de bits');
    ok(compras(c).length === 0, 'teto 0 em D-Dol: nao compra o anuncio barato em D-Dol');
  }
  {
    // Compra de verdade pelo teto de D-Dol, para nao passar os dois casos
    // acima so porque nada comprou nunca.
    const { c, tool } = montar(CFG({
      alvos: [{ nome: 'so ddol', tipo: 'ovo', tetoBits: 0, tetoGemas: 40 }],
    }), [anuncio({ id: 151, preco: 30, moeda: 'gemas' })], { estado: { bits: 9e9, gemas: 9e9 } });
    await tool.step();
    ok(pedidos(c).length === 1 && pedidos(c)[0].d.moeda === 'gemas', 'teto 0 em bits: so pede a lista de D-Dol');
    const cp = compras(c)[0];
    ok(cp && cp.d.moeda === 'gemas' && cp.d.preco === 30, `comprou em D-Dol por 30 (${cp && cp.d.preco})`);
  }
  {
    // Alvo salvo no formato antigo (moeda + tetoPreco) continua funcionando: a
    // config fica em disco por conta, e uma migracao mal feita apagaria o teto
    // que a pessoa escolheu.
    const { c, tool } = montar(CFG({
      alvos: [{ nome: 'velho', tipo: 'ovo', moeda: 'gemas', tetoPreco: 25 }],
    }), [anuncio({ id: 152, preco: 20, moeda: 'gemas' })], { estado: { bits: 9e9, gemas: 9e9 } });
    await tool.step();
    const f = pedidos(c)[0] && pedidos(c)[0].d;
    ok(pedidos(c).length === 1 && f.moeda === 'gemas' && f.precoMax === 25, 'formato antigo virou uma busca na moeda dele');
    ok(compras(c).length === 1, 'e comprou');
  }
  {
    // Sem teto nenhum nos dois campos: o padrao de fabrica do formato novo.
    const { c, tool } = montar(CFG({
      alvos: [{ nome: 'cru', tipo: 'ovo', tetoBits: 0, tetoGemas: 0 }],
    }), [anuncio({ preco: 1 })]);
    await tool.step();
    ok(pedidos(c).length === 0 && compras(c).length === 0, 'os dois tetos em 0: nem pede nem compra');
  }

  log('\n' + '='.repeat(60));
  log(falhas ? `${falhas} FALHA(S)` : 'TODOS OS TESTES PASSARAM');
  fs.writeFileSync(SAIDA, out.join('\n') + '\n');
  log(`relatorio: ${SAIDA}`);
  process.exit(falhas ? 1 : 0);
}
main().catch((e) => { log('FATAL: ' + (e.stack || e)); process.exit(1); });
