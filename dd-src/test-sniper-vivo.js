#!/usr/bin/env node
/**
 * Roda O CODIGO DA FERRAMENTA (o mesmo que vai para a conta) contra o mercado
 * REAL, sem comprar.
 *
 * Por que este teste existe, tendo os outros dois:
 *   - test-sniper-tool.js provou a LOGICA, mas contra um mercado de mentira que
 *     eu mesmo escrevi. Se a minha ideia do pacote estiver errada, o mock esta
 *     errado do mesmo jeito e o teste passa feliz.
 *   - test-sniper-real.js provou o PROTOCOLO (comprou um ovo de verdade), mas
 *     com codigo de teste, nao com a ferramenta.
 *
 * Este fecha o buraco: ferramenta de verdade, mercado de verdade, dinheiro
 * nenhum. 'mercado.comprar' e INTERCEPTADO e so anotado — a ferramenta pensa que
 * comprou, o servidor nunca ouve.
 *
 * E o unico teste que pode provar que os filtros que a ferramenta monta sao
 * aceitos pelo servidor de verdade.
 *
 * Uso: .\node_modules\electron\dist\electron.exe test-sniper-vivo.js [particao]
 */
'use strict';
const { app, session } = require('electron');
const path = require('path');
const fs = require('fs');

const DATA_DIR = require('./perfil-real').usar();
const SAIDA = path.join(__dirname, 'sniper-vivo.txt');
const out = [];
const log = (...a) => { const t = a.join(' '); out.push(t); console.log(t); try { fs.writeFileSync(SAIDA, out.join('\n') + '\n'); } catch {} };

const { SESSION_COOKIE } = require('./src/headless/cookies');
const particaoPedida = process.argv.find((a) => a.startsWith('persist:')) || null;
const MINUTOS = 6;

async function particoesComSessao() {
  const dir = path.join(DATA_DIR, 'Partitions');
  if (!fs.existsSync(dir)) return [];
  const achadas = [];
  for (const nome of fs.readdirSync(dir)) {
    const part = `persist:${nome}`;
    try {
      const cks = await session.fromPartition(part).cookies.get({ url: 'https://digiidle.com/' });
      if (cks.some((c) => c.name === SESSION_COOKIE)) achadas.push(part);
    } catch {}
  }
  return achadas;
}

async function main() {
  await app.whenReady();
  log('--- A FERRAMENTA REAL no MERCADO REAL, sem comprar ---');
  log('(mercado.comprar e interceptado: nada e enviado ao servidor)\n');

  const todas = await particoesComSessao();
  if (!todas.length) { log('nenhuma conta com sessao.'); return fim(1); }
  const partition = particaoPedida || todas[0];

  // O catalogo, como o renderer carrega.
  const win = {};
  new Function('window', fs.readFileSync(path.join(__dirname, 'src/renderer/tools.js'), 'utf8'))(win);
  const tool = win.DDTools.TOOLS.find((t) => t.id === 'sniper');

  // Uma config que casa com o que existe de verdade no mercado, para a varredura
  // ter o que achar. Teto alto de proposito: aqui ninguem compra.
  const cfg = {
    alvos: [
      { nome: 'ovo S+ P4/P5', tipo: 'ovo', moeda: 'bits', tetoPreco: 5000000, tiers: ['S', 'SS', 'SSS'], potencias: [4, 5], energiaMin: 0, especie: '', soShiny: false },
      { nome: 'ovo barato D-Dol', tipo: 'ovo', moeda: 'gemas', tetoPreco: 50, tiers: [], potencias: [], energiaMin: 0, especie: '', soShiny: false },
    ],
    intervaloSec: 30, reservaBits: 0, reservaGemas: 0, maxPorHora: 0, soLiberados: false,
  };

  const { DigiiIdleHeadlessClient } = require('./src/headless/client');
  const c = new DigiiIdleHeadlessClient('mercado', partition, { name: 'sniper-vivo' });

  const pedidos = [];
  const compras = [];
  const real = c.sendCommand.bind(c);

  await new Promise((r) => {
    let f = 0; const go = () => { if (!f++) r(); };
    c.on('update', go); c.on('error', (m) => { log('erro: ' + m); go(); });
    setTimeout(go, 30000); c.connect();
  });
  if (!c.connected) { log('nao conectou. Feche a conta no app, se estiver aberta.'); return fim(1); }
  log(`conta: ${c.state.nick} | bits ${c.state.bits}\n`);

  // A ponte que a ferramenta espera (window.__ddGame), ligada ao socket real.
  const ouvintes = [];
  const G = {
    sock: { readyState: 1, url: 'wss://digiidle.com/ws', addEventListener: (ev, fn) => { if (ev === 'message') ouvintes.push(fn); } },
    estado: c.state, ovos: null, campo: null, pronto: true,
    espera: [], aoMorrer: [], aoEstado: [], aoLabMudou: [], cfg: {},
    aplicar(id, novo) { this.cfg[id] = novo; return false; },
    desligar(id) { if (this.cfg[id]) this.cfg[id].__off = true; },
    quando(fn) { fn(); },
    log: (...a) => log('  [ferramenta] ' + a.join(' ')),
    jitter: () => 0,
    semente: () => 0.5,
    respirar: () => Promise.resolve(),
    enviar(t, dados) {
      if (t === 'mercado.comprar') {
        // A trava: a ferramenta acha que comprou, o servidor nunca soube.
        compras.push(dados);
        log(`  >>> A FERRAMENTA COMPRARIA: #${dados.id} por ${dados.preco} ${dados.moeda} (NAO ENVIADO)`);
        return true;
      }
      if (t === 'mercado.listar') { pedidos.push(dados); log(`  [pedido] ${JSON.stringify(dados)}`); }
      return real(t, dados);
    },
  };

  // Repassa os pacotes reais do jogo para a ferramenta.
  const orig = c.onMessage.bind(c);
  let respostas = 0, pushes = 0;
  c.onMessage = (ev) => {
    try {
      const m = JSON.parse(ev.data);
      if (m && m.t === 'mercado') respostas++;
      if (m && m.t === 'mercado.mudou') pushes++;
      if (m && m.t === 'estado') G.estado = m;
    } catch {}
    for (const fn of ouvintes) { try { fn(ev); } catch (e) { log('  ouvinte: ' + e.message); } }
    return orig(ev);
  };

  // Sobe a ferramenta de verdade.
  const corpo = tool.code(cfg).replace(/^\(\(\) => \{\n/, '').replace(/\n\}\)\(\);$/, '');
  new Function('G', 'window', corpo)(G, { __ddGame: G });
  log(`ferramenta no ar. Observando ${MINUTOS} min...\n`);

  await new Promise((r) => setTimeout(r, MINUTOS * 60000));

  log('\n=== O QUE ACONTECEU ===');
  log(`  pedidos 'mercado.listar' que a ferramenta montou: ${pedidos.length}`);
  log(`  respostas 'mercado' do servidor:                  ${respostas}`);
  log(`  pushes 'mercado.mudou' recebidos:                 ${pushes}`);
  log(`  compras que ela QUIS fazer (nenhuma enviada):     ${compras.length}`);
  for (const x of compras) log(`    #${x.id} ${x.preco} ${x.moeda}`);

  log('\n=== VEREDITO ===');
  const servidorAceitou = respostas > 0;
  ok(pedidos.length > 0, 'a ferramenta varreu o mercado sozinha');
  ok(servidorAceitou, 'o SERVIDOR REAL aceitou os filtros que ela monta e respondeu');
  const filtrosOk = pedidos.every((p) => p.tipo && p.moeda && p.precoMax > 0);
  ok(filtrosOk, 'todo pedido saiu com tipo, moeda e precoMax (nunca um filtro vazio)');
  ok(c.state.bits >= 0 && !compras.some((x) => x.preco > 5000000), 'nenhuma compra acima do teto configurado');
  log(`\n  Nenhuma compra foi enviada ao servidor. Saldo intacto: ${c.state.bits} bits.`);
  log(`\nrelatorio: ${SAIDA}`);
  try { c.disconnect(); } catch {}
  fim(0);
}
let falhas = 0;
const ok = (cond, txt) => { log(`  ${cond ? 'OK  ' : 'FALHA'} ${txt}`); if (!cond) falhas++; };
function fim(c) { setTimeout(() => app.exit(c || falhas ? 1 : 0), 400); }
main().catch((e) => { log('FATAL: ' + (e.stack || e)); fim(1); });
