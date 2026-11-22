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
// So o que o ToolSniper usa: on(), state, connected, sendCommand().
function fakeClient(estado) {
  const ouvintes = {};
  return {
    index: 0,
    connected: true,
    state: Object.assign({ nick: 'teste', local: 'hunt', nivel: 50, bits: 1000000, gemas: 100 }, estado),
    enviados: [],
    on(ev, fn) { (ouvintes[ev] = ouvintes[ev] || []).push(fn); },
    emit(ev, m) { for (const fn of ouvintes[ev] || []) fn(m); },
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

  log('\n' + '='.repeat(60));
  log(falhas ? `${falhas} FALHA(S)` : 'TODOS OS TESTES PASSARAM');
  fs.writeFileSync(SAIDA, out.join('\n') + '\n');
  log(`relatorio: ${SAIDA}`);
  process.exit(falhas ? 1 : 0);
}
main().catch((e) => { log('FATAL: ' + (e.stack || e)); process.exit(1); });
