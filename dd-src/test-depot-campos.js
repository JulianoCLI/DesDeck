#!/usr/bin/env node
/**
 * Em CONTA REAL, o que o pacote 'depot' traz - e se da para montar a lista de
 * TODOS os digimons da conta.
 *
 * O cliente do jogo (app.js L4158) define:
 *     todosDigimons = [...E.equipe, ...depot, ...colecao]
 * e o pacote 'depot' (L621) traz os dois ultimos de uma vez:
 *     case 'depot': depot = m.lista; colecao = m.colecao || [];
 * A equipe ja chega no 'estado', que o repo le.
 *
 * O que precisa ficar provado antes de escrever a tela:
 *   1. 'depot' chega SOZINHO no login? em quanto tempo? (nenhum comando do
 *      cliente o pede, mas "o cliente nao pede" nao prova "o servidor manda")
 *   2. que campos cada digimon tem - e, principalmente, se tem ivs/u, que e o
 *      que ovo-tier.js precisa para calcular a mesma letra D..SSS dos ovos
 *   3. os tres grupos (equipe/depot/colecao) tem o MESMO formato? Se nao, a
 *      linha da lista tem de tratar cada um
 *   4. quantos digimons sao, por conta: decide se cabe na tela e se vale um
 *      teto como o dos ovos
 *   5. o campo 'local' bate com o grupo onde o digimon veio?
 *
 * NAO MUTA A CONTA: sendCommand e barrado por completo, menos ping/pong.
 *
 * Uso: .\node_modules\electron\dist\electron.exe test-depot-campos.js [particao]
 */
'use strict';
const { app, session } = require('electron');
const path = require('path');
const fs = require('fs');

const DATA_DIR = require('./perfil-real').usar();
const SAIDA = path.join(__dirname, 'depot-campos.txt');
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

/** Que campos existem em quantos itens: um campo intermitente nao da para exigir. */
function presenca(lista, rotulo) {
  if (!lista.length) { log(`  ${rotulo}: vazio`); return; }
  const chaves = new Map();
  for (const d of lista) for (const k of Object.keys(d || {})) chaves.set(k, (chaves.get(k) || 0) + 1);
  log(`  ${rotulo} (${lista.length}):`);
  for (const [k, n] of [...chaves].sort((a, b) => b[1] - a[1])) {
    log(`    ${String(n).padStart(5)}/${lista.length}  ${k}`);
  }
}

async function main() {
  await app.whenReady();
  const todas = await particoesComSessao();
  if (!todas.length) { log('nenhuma conta com sessao salva'); return fim(1); }
  const pedida = process.argv.slice(2).find((a) => a.startsWith('persist:'));
  const partition = pedida || todas[0];
  log(`contas com sessao: ${todas.length} | usando: ${partition}\n`);

  const { DigiiIdleHeadlessClient } = require('./src/headless/client');
  const c = new DigiiIdleHeadlessClient('depot', partition, { name: 'depot' });

  const real = c.sendCommand.bind(c);
  c.sendCommand = (t, d) => (t === 'pong' || t === 'ping' ? real(t, d) : (log(`[BARRADO] ${t}`), true));
  const realSend = c.send.bind(c);
  c.send = (o) => (o && (o.t === 'ping' || o.t === 'pong') ? realSend(o) : (log(`[BARRADO send] ${o && o.t}`), true));

  const pacotes = [];
  const t0 = Date.now();
  let ultimo = null;
  c.on('msg', (msg) => {
    if (!msg || msg.t !== 'depot') return;
    ultimo = msg;
    pacotes.push({
      em: Date.now() - t0,
      lista: (msg.lista || []).length,
      colecao: (msg.colecao || []).length,
      campos: Object.keys(msg).join(','),
    });
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
  log("1. O PACOTE 'depot' CHEGA SOZINHO?");
  log('================================================================');
  log(`  pacotes 'depot' recebidos: ${pacotes.length}`);
  for (const p of pacotes) {
    log(`    +${(p.em / 1000).toFixed(1)}s -> lista=${p.lista} colecao=${p.colecao} | campos: ${p.campos}`);
  }
  if (!pacotes.length) {
    log('\n  NAO chegou sozinho nesta escuta de 60s.');
    log('  -> a lista tera de PEDIR (algum comando); este probe nao pede nada.');
    log('  -> alternativa: mostrar so a equipe, que vem no pacote "estado".');
  }

  const equipe = Array.isArray(c.state.equipe) ? c.state.equipe : [];
  const depot = ultimo && Array.isArray(ultimo.lista) ? ultimo.lista : [];
  const colecao = ultimo && Array.isArray(ultimo.colecao) ? ultimo.colecao : [];
  const todosD = [...equipe, ...depot, ...colecao];

  log('\n================================================================');
  log('2. QUANTOS DIGIMONS, E ONDE');
  log('================================================================');
  log(`  equipe  (pacote 'estado'): ${equipe.length}`);
  log(`  depot   (pacote 'depot'.lista)   : ${depot.length}`);
  log(`  colecao (pacote 'depot'.colecao) : ${colecao.length}`);
  log(`  TOTAL                            : ${todosD.length}`);
  if (!todosD.length) { log('\n  nenhum digimon visivel: nada a medir.'); return fim(1); }

  log('\n================================================================');
  log('3. CAMPOS DE CADA GRUPO (o formato e o mesmo?)');
  log('================================================================');
  if (equipe.length) log(`  equipe[0] : ${tipos(equipe[0])}`);
  if (depot.length) log(`  depot[0]  : ${tipos(depot[0])}`);
  if (colecao.length) log(`  colecao[0]: ${tipos(colecao[0])}`);
  log('');
  presenca(equipe, 'equipe');
  log('');
  presenca(depot, 'depot');
  log('');
  presenca(colecao, 'colecao');

  log('\n  um digimon cru (o primeiro que houver):');
  log(JSON.stringify(todosD[0], null, 2).split('\n').map((l) => '    ' + l).join('\n'));

  log('\n================================================================');
  log('4. DA PARA CALCULAR A LETRA (D..SSS), COMO NOS OVOS?');
  log('================================================================');
  // ovo-tier.js precisa de especie.bases, d.ivs e d.u. Se os digimons nao
  // trazem ivs/u, a letra do digimon nao existe e a tela tem de mostrar
  // nivel/HP/poder - e o filtro por letra nao pode valer para eles.
  const comIvs = todosD.filter((d) => d && Array.isArray(d.ivs)).length;
  const comU = todosD.filter((d) => d && Array.isArray(d.u)).length;
  log(`  com ivs: ${comIvs}/${todosD.length}`);
  log(`  com u  : ${comU}/${todosD.length}`);
  try {
    const { tierOvo } = require('./src/headless/catalogo');
    const { letraOvo, notaOvo } = await tierOvo();
    const contagem = {};
    let comLetra = 0;
    for (const d of todosD) {
      const l = letraOvo(d);
      contagem[l] = (contagem[l] || 0) + 1;
      if (l && l !== '?') comLetra++;
    }
    log(`  com letra calculada: ${comLetra}/${todosD.length}`);
    log(`  distribuicao: ${Object.entries(contagem).map(([k, v]) => `${k}=${v}`).join(', ')}`);
    const ex = todosD.find((d) => letraOvo(d) !== '?');
    if (ex) log(`  exemplo: ${ex.especie} -> letra ${letraOvo(ex)}, nota ${notaOvo(ex)}`);
    else log('  -> NENHUM digimon da letra: a tela precisa de outro eixo (nivel/poder)');
  } catch (e) {
    log(`  FALHOU: ${e.message}`);
  }

  log('\n================================================================');
  log("5. O CAMPO 'local' BATE COM O GRUPO?");
  log('================================================================');
  const porLocal = {};
  for (const d of todosD) porLocal[(d && d.local) || '(sem local)'] = (porLocal[(d && d.local) || '(sem local)'] || 0) + 1;
  log(`  ${Object.entries(porLocal).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  log('  (o cliente usa local==="mercado" para excluir quem esta anunciado)');

  log('\n================================================================');
  log('6. QUANTO ISSO OCUPA');
  log('================================================================');
  log(`  bytes crus dos ${todosD.length} digimons: ${Buffer.byteLength(JSON.stringify(todosD))}`);
  log(`  especies distintas: ${new Set(todosD.map((d) => d && d.especie)).size}`);

  fim(0);
}

function fim(c) {
  log(`\nrelatorio: ${SAIDA}`);
  setTimeout(() => app.exit(c), 300);
}
main().catch((e) => { log('FATAL: ' + ((e && e.stack) || e)); fim(1); });
