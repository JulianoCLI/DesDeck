#!/usr/bin/env node
/**
 * Em CONTA REAL, o que o pacote 'ovos' (a bolsa de ovos da conta) traz.
 *
 * Isto decide o desenho do Historico de Ovos novo: em vez de acumular capturas
 * para sempre no disco, a aba vai mostrar os ovos que a conta TEM agora. Antes
 * de escrever a tela, preciso saber o que da para mostrar e o que da para
 * filtrar - "o cliente le este campo" nao e o mesmo que "o servidor manda".
 *
 * O que precisa ficar provado:
 *   1. o pacote 'ovos' chega sozinho? em quanto tempo? (ele NAO vem no 'estado')
 *   2. que campos cada ovo tem (id, especie, ivs, u, potencia, data, shiny,
 *      travado, protegido)
 *   3. da para calcular a letra D..SSS com ovo-tier.js? em quantos dos ovos?
 *   4. existe 'scanner' na bolsa? (o filtro UX do historico depende dele; o
 *      welcome.historico TEM, e se a bolsa nao tiver o filtro precisa sair)
 *   5. existe 'em' (quando foi capturado)? (a ordenacao da lista)
 *   6. a bolsa muda sozinha depois (chocou/vendeu)? quantos pacotes 'ovos'?
 *
 * NAO MUTA A CONTA: sendCommand e barrado por completo, menos ping/pong.
 *
 * Uso: .\node_modules\electron\dist\electron.exe test-bolsa-campos.js [particao]
 */
'use strict';
const { app, session } = require('electron');
const path = require('path');
const fs = require('fs');

const DATA_DIR = require('./perfil-real').usar();
const SAIDA = path.join(__dirname, 'bolsa-campos.txt');
const out = [];
const log = (...a) => {
  const t = a.join(' ');
  out.push(t);
  try { fs.writeFileSync(SAIDA, out.join('\n') + '\n'); } catch { /* ignora */ }
};

const { SESSION_COOKIE } = require('./src/headless/cookies');
const ESCUTA_MS = 60000;

async function particoesComSessao() {
  const dir = path.join(DATA_DIR, 'Partitions');
  if (!fs.existsSync(dir)) return [];
  const achadas = [];
  for (const nome of fs.readdirSync(dir)) {
    const part = `persist:${nome}`;
    try {
      const cks = await session.fromPartition(part).cookies.get({ url: 'https://digiidle.com/' });
      if (cks.some((c) => c.name === SESSION_COOKIE)) achadas.push(part);
    } catch { /* particao sem cookies */ }
  }
  return achadas;
}

const tipos = (o) => Object.entries(o || {})
  .map(([k, v]) => `${k}:${Array.isArray(v) ? `array(${v.length})` : v === null ? 'null' : typeof v}`)
  .join(', ');

async function main() {
  await app.whenReady();
  const todas = await particoesComSessao();
  if (!todas.length) { log('nenhuma conta com sessao salva'); return fim(1); }
  // argv pode trazer flags do Electron (--enable-logging): só vale um persist:.
  const pedida = process.argv.slice(2).find((a) => a.startsWith('persist:'));
  const partition = pedida || todas[0];
  log(`contas com sessao: ${todas.length} | usando: ${partition}\n`);

  const { DigiiIdleHeadlessClient } = require('./src/headless/client');
  const c = new DigiiIdleHeadlessClient('bolsa', partition, { name: 'bolsa' });

  // Nada sai daqui a nao ser ping/pong: a conta nao pode ser alterada.
  const real = c.sendCommand.bind(c);
  c.sendCommand = (t, d) => (t === 'pong' || t === 'ping' ? real(t, d) : (log(`[BARRADO] ${t}`), true));
  const realSend = c.send.bind(c);
  c.send = (o) => (o && (o.t === 'ping' || o.t === 'pong') ? realSend(o) : (log(`[BARRADO send] ${o && o.t}`), true));

  const pacotes = [];
  const t0 = Date.now();
  // 'msg' é o espelho cru de tudo que chega (client.js: this.emit('msg', msg)).
  c.on('msg', (msg) => {
    if (msg && msg.t === 'ovos') pacotes.push({ em: Date.now() - t0, lista: msg.lista || [] });
  });

  await new Promise((res) => {
    let pronto = false;
    c.on('update', () => { if (!pronto) { pronto = true; res(); } });
    c.on('error', (m) => { log('erro: ' + m); if (!pronto) { pronto = true; res(); } });
    c.connect();
  });
  log(`conectado: ${c.state.nick} | nivel ${c.state.nivel}\n`);

  log(`escutando ${ESCUTA_MS / 1000}s...\n`);
  await new Promise((r) => setTimeout(r, ESCUTA_MS));

  log('================================================================');
  log("1. O PACOTE 'ovos' CHEGA SOZINHO?");
  log('================================================================');
  log(`  pacotes 'ovos' recebidos: ${pacotes.length}`);
  for (const p of pacotes) log(`    +${(p.em / 1000).toFixed(1)}s -> ${p.lista.length} ovos`);
  if (!pacotes.length) {
    log('\n  A bolsa NAO chegou sozinha nesta escuta.');
    log('  (o Historico novo teria de PEDIR a lista; este probe nao pede nada)');
    return fim(1);
  }

  const bolsa = Array.isArray(c.state.ovos) ? c.state.ovos : [];
  log(`\n  state.ovos tem ${bolsa.length} ovos`);
  if (!bolsa.length) { log('  bolsa vazia: nada a medir.'); return fim(0); }

  log('\n================================================================');
  log('2. CAMPOS DE CADA OVO');
  log('================================================================');
  log(`  campos: ${tipos(bolsa[0])}`);
  log('\n  um ovo cru:');
  log(JSON.stringify(bolsa[0], null, 2).split('\n').map((l) => '    ' + l).join('\n'));

  // Quais campos existem em QUANTOS ovos: um campo que so aparece as vezes
  // (shiny, travado) nao da para exigir na tela.
  const chaves = new Map();
  for (const o of bolsa) for (const k of Object.keys(o || {})) chaves.set(k, (chaves.get(k) || 0) + 1);
  log('\n  presenca de cada campo:');
  for (const [k, n] of [...chaves].sort((a, b) => b[1] - a[1])) {
    log(`    ${String(n).padStart(5)}/${bolsa.length}  ${k}`);
  }

  log('\n================================================================');
  log('3. DA PARA CALCULAR A LETRA (D..SSS)?');
  log('================================================================');
  try {
    const { tierOvo } = require('./src/headless/catalogo');
    const { letraOvo, notaOvo } = await tierOvo();
    const contagem = {};
    let comLetra = 0;
    for (const o of bolsa) {
      const l = letraOvo(o);
      contagem[l] = (contagem[l] || 0) + 1;
      if (l && l !== '?') comLetra++;
    }
    log(`  com letra: ${comLetra}/${bolsa.length}`);
    log(`  distribuicao: ${Object.entries(contagem).map(([k, v]) => `${k}=${v}`).join(', ')}`);
    const ex = bolsa.find((o) => letraOvo(o) !== '?');
    if (ex) log(`  exemplo: ${ex.especie} -> letra ${letraOvo(ex)}, nota ${notaOvo(ex)}`);
  } catch (e) {
    log(`  FALHOU: ${e.message}`);
  }

  log('\n================================================================');
  log('4. OS FILTROS DE HOJE AINDA FAZEM SENTIDO?');
  log('================================================================');
  const tem = (k) => bolsa.filter((o) => o && o[k] !== undefined).length;
  const vale = (k) => bolsa.filter((o) => o && o[k]).length;
  log(`  scanner (filtro "UX"): presente em ${tem('scanner')}/${bolsa.length} ovos`);
  log(`    -> ${tem('scanner') ? 'o filtro UX sobrevive' : 'O FILTRO UX PRECISA SAIR (campo nao existe na bolsa)'}`);
  log(`  em (data da captura): presente em ${tem('em')}/${bolsa.length}`);
  log(`    -> ${tem('em') ? 'da para ordenar por data' : 'SEM DATA: a ordenacao tem de ser outra'}`);
  log(`  shiny=true  : ${vale('shiny')}`);
  log(`  travado=true: ${vale('travado')}  (cadeado: a venda nunca leva)`);
  log(`  protegido=true: ${vale('protegido')}`);
  log(`  data (+N)>0 : ${vale('data')}`);
  const pots = {};
  for (const o of bolsa) pots[o.potencia || 0] = (pots[o.potencia || 0] || 0) + 1;
  log(`  potencias   : ${Object.entries(pots).map(([k, v]) => `P${k}=${v}`).join(', ')}`);

  log('\n================================================================');
  log('5. QUANTO ISSO OCUPARIA NA TELA');
  log('================================================================');
  log(`  ovos nesta conta: ${bolsa.length}`);
  log(`  bytes do estado se fosse guardado: ${Buffer.byteLength(JSON.stringify(bolsa))} (nao vai ser guardado)`);
  log(`  especies distintas: ${new Set(bolsa.map((o) => o.especie)).size}`);

  fim(0);
}

function fim(c) {
  log(`\nrelatorio: ${SAIDA}`);
  setTimeout(() => app.exit(c), 300);
}
main().catch((e) => { log('FATAL: ' + ((e && e.stack) || e)); fim(1); });
