#!/usr/bin/env node
/**
 * O teste que fecha tudo: A FERRAMENTA, no MERCADO REAL, comprando UM ovo de
 * verdade — e, se der sorte, pela FILA DA RETENCAO.
 *
 * Os testes anteriores, cada um com o seu buraco:
 *   - test-sniper-tool.js:  logica certa, mercado de mentira.
 *   - test-sniper-real.js:  mercado real, mas codigo de teste.
 *   - test-sniper-vivo.js:  ferramenta real no mercado real, mas nada casou com
 *                           o filtro, entao a compra nunca foi exercitada.
 *
 * Aqui e a ferramenta de verdade, com um filtro que SABEMOS ter resultado
 * (medido: ovo em bits a 10.000), e a compra chega ao servidor.
 *
 * As travas (as mesmas do test-sniper-real, agora por fora da ferramenta):
 *   - teto de 10.000 bits, so moeda 'bits', so tipo 'ovo';
 *   - maxPorHora = 1, entao a propria ferramenta para depois de uma;
 *   - uma segunda trava minha, no envio: depois da primeira compra, bloqueia;
 *   - sem --comprar, nada e enviado.
 *
 * Uso: .\node_modules\electron\dist\electron.exe test-sniper-fila.js
 *      .\node_modules\electron\dist\electron.exe test-sniper-fila.js --comprar
 */
'use strict';
const { app, session } = require('electron');
const path = require('path');
const fs = require('fs');

const DATA_DIR = require('./perfil-real').usar();
const SAIDA = path.join(__dirname, 'sniper-fila.txt');
const out = [];
const log = (...a) => { const t = a.join(' '); out.push(t); console.log(t); try { fs.writeFileSync(SAIDA, out.join('\n') + '\n'); } catch {} };

const { SESSION_COOKIE } = require('./src/headless/cookies');
const COMPRAR = process.argv.includes('--comprar');
const TETO = 10000;
const MINUTOS = 8;

async function particoes() {
  const dir = path.join(DATA_DIR, 'Partitions');
  const r = [];
  for (const n of fs.readdirSync(dir)) {
    const p = `persist:${n}`;
    try { const c = await session.fromPartition(p).cookies.get({ url: 'https://digiidle.com/' }); if (c.some((x) => x.name === SESSION_COOKIE)) r.push(p); } catch {}
  }
  return r;
}

async function main() {
  await app.whenReady();
  log(COMPRAR ? '*** A FERRAMENTA VAI COMPRAR DE VERDADE (1 ovo, teto 10.000 bits) ***'
    : '--- ENSAIO: a ferramenta roda, mas a compra nao sai ---');
  log('');

  const todas = await particoes();
  const partition = todas[0];

  const win = {};
  new Function('window', fs.readFileSync(path.join(__dirname, 'src/renderer/tools.js'), 'utf8'))(win);
  const tool = win.DDTools.TOOLS.find((t) => t.id === 'sniper');

  // Um alvo largo de proposito (sem tier/potencia): o que importa aqui e exercitar
  // a compra e, de preferencia, a fila — nao caçar pechincha.
  const cfg = {
    alvos: [{ nome: 'teste: ovo barato em bits', tipo: 'ovo', moeda: 'bits', tetoPreco: TETO, tiers: [], potencias: [], energiaMin: 0, especie: '', soShiny: false }],
    intervaloSec: 30, reservaBits: 0, reservaGemas: 0, maxPorHora: 1, soLiberados: false,
  };

  const { DigiiIdleHeadlessClient } = require('./src/headless/client');
  const c = new DigiiIdleHeadlessClient('mercado', partition, { name: 'sniper-fila' });
  const real = c.sendCommand.bind(c);

  await new Promise((r) => { let f = 0; const go = () => { if (!f++) r(); }; c.on('update', go); c.on('error', (m) => { log('erro: ' + m); go(); }); setTimeout(go, 30000); c.connect(); });
  if (!c.connected) { log('nao conectou. Feche a conta no app.'); return fim(1); }

  // Espera a lista de ovos (ela nao vem no primeiro 'estado').
  for (let i = 0; i < 20 && !Array.isArray(c.state.ovos); i++) await new Promise((r) => setTimeout(r, 250));
  const bits0 = c.state.bits;
  const ovos0 = new Set((c.state.ovos || []).map((o) => o.id));
  log(`conta: ${c.state.nick} | bits ${bits0} | ovos ${ovos0.size}\n`);

  let enviou = null;
  const tentativas = [];
  const ouvintes = [];
  const G = {
    sock: { readyState: 1, url: 'wss://digiidle.com/ws', addEventListener: (ev, fn) => { if (ev === 'message') ouvintes.push(fn); } },
    estado: c.state, ovos: null, campo: null, pronto: true,
    espera: [], aoMorrer: [], aoEstado: [], aoLabMudou: [], cfg: {},
    aplicar(id, novo) { this.cfg[id] = novo; return false; },
    desligar(id) { if (this.cfg[id]) this.cfg[id].__off = true; },
    quando(fn) { fn(); },
    log: (...a) => log('  [ferramenta] ' + a.join(' ')),
    jitter: () => 0, semente: () => 0.5, respirar: () => Promise.resolve(),
    enviar(t, dados) {
      if (t !== 'mercado.comprar') return real(t, dados);
      tentativas.push(dados);
      // A minha trava, por cima da da ferramenta.
      if (enviou) { log(`  [BARRADO] segunda compra (#${dados.id})`); return true; }
      if (dados.moeda !== 'bits' || !(dados.preco > 0) || dados.preco > TETO || dados.qtd !== 1) {
        log(`  [BARRADO] fora das travas: ${JSON.stringify(dados)}`); return true;
      }
      if (!COMPRAR) { log(`  [ENSAIO] a ferramenta compraria #${dados.id} por ${dados.preco} bits`); return true; }
      enviou = { ...dados, em: Date.now() };
      log(`  >>> COMPRA ENVIADA: #${dados.id} por ${dados.preco} bits`);
      return real(t, dados);
    },
  };

  let pushes = 0;
  const orig = c.onMessage.bind(c);
  c.onMessage = (ev) => {
    try {
      const m = JSON.parse(ev.data);
      if (m && m.t === 'estado') G.estado = m;
      if (m && m.t === 'mercado.mudou') pushes++;
      if (m && m.t === 'erro') log(`  [servidor] erro: ${m.mensagem}`);
    } catch {}
    for (const fn of ouvintes) { try { fn(ev); } catch {} }
    return orig(ev);
  };

  const corpo = tool.code(cfg).replace(/^\(\(\) => \{\n/, '').replace(/\n\}\)\(\);$/, '');
  new Function('G', 'window', corpo)(G, { __ddGame: G });
  log(`ferramenta no ar (teto ${TETO} bits, 1 compra/hora). Observando ate ${MINUTOS} min...\n`);

  // Para assim que a compra se confirmar, para nao ficar 8 min a toa.
  const ate = Date.now() + MINUTOS * 60000;
  while (Date.now() < ate) {
    await new Promise((r) => setTimeout(r, 2000));
    if (enviou && Date.now() - enviou.em > 6000) break;
    if (!COMPRAR && tentativas.length) break;
  }

  log('\n=== O QUE ACONTECEU ===');
  log(`  compras que a ferramenta quis fazer: ${tentativas.length}`);
  for (const t of tentativas) log(`    #${t.id} por ${t.preco} ${t.moeda}`);
  log(`  pushes 'mercado.mudou': ${pushes}`);

  if (!COMPRAR) {
    log('\n=== VEREDITO (ensaio) ===');
    ok(tentativas.length > 0, 'a ferramenta encontrou alvo e CHEGOU a decidir comprar');
    ok(tentativas.every((t) => t.preco <= TETO && t.moeda === 'bits' && t.qtd === 1), 'toda tentativa respeitou teto, moeda e qtd');
    log('\n  Nada foi enviado. Rode com --comprar para a prova final.');
  } else {
    // Confirmacao pelo inventario e pelo saldo.
    await new Promise((r) => setTimeout(r, 3000));
    const ovos1 = new Set((c.state.ovos || []).map((o) => o.id));
    const novos = [...ovos1].filter((x) => !ovos0.has(x));
    const bits1 = c.state.bits;
    log(`  bits antes ${bits0} | depois ${bits1} | diferenca ${bits1 - bits0}`);
    log(`  ovos antes ${ovos0.size} | depois ${ovos1.size} | novos: ${novos.join(', ') || 'nenhum'}`);
    log('\n=== VEREDITO (compra real) ===');
    ok(!!enviou, 'a ferramenta enviou a compra');
    ok(novos.length > 0, `um ovo novo chegou na conta (${novos.join(', ') || 'nenhum'})`);
    ok(bits0 - bits1 >= enviou?.preco * 0.9, `o saldo caiu ~${bits0 - bits1} bits (preco ${enviou?.preco})`);
    ok(tentativas.length === 1, `tentou comprar uma vez so (maxPorHora=1): ${tentativas.length}`);
  }
  log(`\nrelatorio: ${SAIDA}`);
  try { c.disconnect(); } catch {}
  fim(0);
}
let falhas = 0;
const ok = (cond, txt) => { log(`  ${cond ? 'OK  ' : 'FALHA'} ${txt}`); if (!cond) falhas++; };
function fim(code) { setTimeout(() => app.exit(code || falhas ? 1 : 0), 400); }
main().catch((e) => { log('FATAL: ' + (e.stack || e)); fim(1); });
