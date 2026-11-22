#!/usr/bin/env node
/**
 * TESTE REAL do sniper, no mercado real, com UMA compra barata.
 *
 * Isto GASTA BITS DE VERDADE. Por isso as travas sao todas explicitas e
 * conferidas antes de cada envio, nao no fim:
 *   - TETO:      so compra se preco <= TETO_BITS (10.000);
 *   - MOEDA:     so 'bits'. Nunca gemas/D-Dol;
 *   - 1 COMPRA:  depois da primeira, o envio fica bloqueado para sempre;
 *   - SO OVO:    tipo === 'ovo' (o teste pedido);
 *   - NAO MEU:   nunca compra o proprio anuncio;
 *   - SALDO:     exige folga de 2x o teto;
 *   - DRY-RUN:   sem --comprar, ele faz TUDO menos enviar o comando.
 *
 * O ciclo que o teste prova, de ponta a ponta:
 *   1. varre o mercado (mercado.listar) com os filtros do servidor;
 *   2. acha um alvo abaixo do teto;
 *   3. se estiver RETIDO, enfileira e espera o 'libera' (2 min, medido);
 *   4. compra no instante do libera (mercado.comprar);
 *   5. confirma: o anuncio sai da lista e o ovo aparece na conta.
 *
 * Uso: .\node_modules\electron\dist\electron.exe test-sniper-real.js
 *      (ensaio: nao compra, so mostra o que faria)
 *
 *      .\node_modules\electron\dist\electron.exe test-sniper-real.js --comprar
 *      (COMPRA DE VERDADE, 1 ovo, no maximo 10.000 bits)
 */
'use strict';
const { app, session } = require('electron');
const path = require('path');
const fs = require('fs');

const DATA_DIR = require('./perfil-real').usar();
const SAIDA = path.join(__dirname, 'sniper-real.txt');
const out = [];
const log = (...a) => { const t = a.join(' '); out.push(t); console.log(t); try { fs.writeFileSync(SAIDA, out.join('\n') + '\n'); } catch {} };

const argv = process.argv.slice(2);
const COMPRAR_DE_VERDADE = argv.includes('--comprar');
const particaoPedida = argv.find((a) => a.startsWith('persist:')) || null;

// --- As travas ---
const TETO_BITS = 10000;   // o teto do teste
const MOEDA = 'bits';      // nunca gemas
const TIPO = 'ovo';
const FOLGA_SALDO = 2;     // exige 2x o teto em caixa

const { SESSION_COOKIE } = require('./src/headless/cookies');

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
  log(COMPRAR_DE_VERDADE
    ? '*** MODO COMPRA: vai gastar bits de verdade (1 ovo, teto 10.000) ***'
    : '--- ENSAIO: nenhuma compra sera enviada (use --comprar para valer) ---');
  log('');

  const todas = await particoesComSessao();
  if (!todas.length) { log('nenhuma conta com sessao.'); return fim(1); }
  const partition = particaoPedida || todas[0];
  log(`conta: ${partition}`);

  const { DigiiIdleHeadlessClient } = require('./src/headless/client');
  const c = new DigiiIdleHeadlessClient('mercado', partition, { name: 'sniper-real' });

  // A trava central: o unico comando que muta e 'mercado.comprar', e ele passa
  // por aqui. Uma vez usado, nunca mais.
  let jaComprou = false;
  const real = c.sendCommand.bind(c);
  const enviar = (t, d) => {
    if (t === 'mercado.listar' || t === 'ping' || t === 'pong') return real(t, d);
    if (t !== 'mercado.comprar') { log(`[BARRADO] ${t}`); return true; }
    // Reconfere TUDO no proprio envio, nao so em quem chamou.
    if (jaComprou) { log('[BARRADO] segunda compra'); return true; }
    if (d.moeda !== MOEDA) { log(`[BARRADO] moeda ${d.moeda}`); return true; }
    if (!(d.preco > 0) || d.preco > TETO_BITS) { log(`[BARRADO] preco ${d.preco} acima do teto`); return true; }
    if (d.qtd !== 1) { log(`[BARRADO] qtd ${d.qtd}`); return true; }
    if (!COMPRAR_DE_VERDADE) { log(`[ENSAIO] compraria #${d.id} por ${d.preco} ${d.moeda}`); return true; }
    jaComprou = true;
    log(`>>> ENVIANDO mercado.comprar #${d.id} por ${d.preco} ${d.moeda}`);
    return real(t, d);
  };
  c.sendCommand = enviar;

  let lista = null, mudou = 0;
  const orig = c.onMessage.bind(c);
  const avisos = [];
  c.onMessage = (ev) => {
    try {
      const m = JSON.parse(ev.data);
      if (m && m.t === 'mercado') lista = m;
      else if (m && m.t === 'mercado.mudou') mudou++;
      // O servidor fala por 'erro' (app.js L611). E aqui que uma recusa aparece.
      else if (m && (m.t === 'erro' || m.t === 'aviso')) { avisos.push(m.mensagem); log(`  [servidor] ${m.t}: ${m.mensagem}`); }
    } catch {}
    return orig(ev);
  };

  await new Promise((r) => {
    let f = 0; const go = () => { if (!f++) r(); };
    c.on('update', go); c.on('error', (m) => { log('erro: ' + m); go(); });
    setTimeout(go, 30000); c.connect();
  });
  if (!c.connected) { log('nao conectou. Feche esta conta no app, se estiver aberta.'); return fim(1); }

  const bits0 = c.state.bits;
  log(`conectado: ${c.state.nick} | bits: ${bits0}`);
  if (bits0 < TETO_BITS * FOLGA_SALDO) {
    log(`saldo baixo: preciso de ${TETO_BITS * FOLGA_SALDO} bits de folga. Abortando.`);
    return fim(1);
  }

  // A confirmacao pelo inventario: o ovo comprado aparece na conta.
  //
  // Duas armadilhas que o ensaio revelou, as duas corrigidas aqui:
  //   - a lista de ovos NAO vem no primeiro 'estado' (ela chega no pacote 'ovos',
  //     depois). Lida na hora, ela dava 0 e a confirmacao acusava um falso "+15".
  //     Entao esperamos a lista chegar antes de tirar a foto inicial.
  //   - comparar a CONTAGEM e fraco: a conta pode chocar/vender um ovo no meio do
  //     teste. O que prova a compra e o ID do ovo do anuncio (resumo.id) aparecer
  //     na conta, e esse id ja vem no anuncio.
  const idsOvos = () => new Set((Array.isArray(c.state.ovos) ? c.state.ovos : []).map((o) => o.id));
  for (let i = 0; i < 20 && !Array.isArray(c.state.ovos); i++) await new Promise((r) => setTimeout(r, 250));
  const ovos0 = idsOvos();
  log(`ovos na conta agora: ${ovos0.size}${Array.isArray(c.state.ovos) ? '' : ' (a lista nao chegou)'}`);
  log('');

  const pedir = async (payload) => {
    lista = null;
    real('mercado.listar', payload);
    for (let i = 0; i < 24 && !lista; i++) await new Promise((r) => setTimeout(r, 250));
    return lista;
  };

  // --- 1. varredura: exatamente o que o sniper fara a cada minuto ---
  log('=== 1. VARREDURA (filtros do servidor) ===');
  const filtro = { tipo: TIPO, moeda: MOEDA, precoMax: TETO_BITS, ordem: 'barato', pagina: 0 };
  log(`  filtro: ${JSON.stringify(filtro)}`);
  const m = await pedir(filtro);
  if (!m) { log('  sem resposta do mercado.'); return fim(1); }
  log(`  'agora' do servidor: ${m.agora} (o meu: ${Date.now()}, diferenca ${Date.now() - m.agora} ms)`);
  log(`  total que casa com o filtro: ${m.total}`);

  const candidatos = (m.lista || []).filter((a) => !a.meu && a.moeda === MOEDA && a.preco <= TETO_BITS && a.tipo === TIPO && a.qtd === 1 && (!a.estado || a.estado === 'aberto'));
  log(`  candidatos nesta pagina: ${candidatos.length}`);
  for (const a of candidatos.slice(0, 8)) {
    const falta = a.libera - m.agora;
    log(`    #${a.id} ${a.resumo?.especie} P${a.resumo?.potencia} +${a.resumo?.data} | ${a.preco} ${a.moeda} | ${falta > 0 ? 'RETIDO ' + Math.ceil(falta / 1000) + 's' : 'liberado'}`);
  }
  if (!candidatos.length) { log('  nada abaixo do teto agora. Rode de novo mais tarde.'); return fim(1); }

  // --- 2. a fila: retido primeiro, que e o caso que o sniper existe para pegar ---
  log('\n=== 2. FILA DO SNIPER ===');
  // O relogio do servidor manda: comparar 'libera' com Date.now() local erraria
  // pela diferenca de relogio. Guardamos o desvio e usamos o tempo do servidor.
  const desvio = Date.now() - m.agora;
  const agoraServidor = () => Date.now() - desvio;
  log(`  desvio de relogio: ${desvio} ms (uso o tempo do servidor para decidir)`);

  const retidos = candidatos.filter((a) => a.libera > agoraServidor());
  const livres = candidatos.filter((a) => a.libera <= agoraServidor());
  log(`  retidos: ${retidos.length} | ja livres: ${livres.length}`);

  // Prefere um RETIDO: e o unico jeito de provar a espera do 'libera'.
  const alvo = retidos.length
    ? retidos.sort((x, y) => x.libera - y.libera)[0]
    : livres.sort((x, y) => x.preco - y.preco)[0];
  const eraRetido = alvo.libera > agoraServidor();
  log(`  ALVO: #${alvo.id} ${alvo.resumo?.especie} por ${alvo.preco} bits (${eraRetido ? 'retido' : 'ja livre'})`);
  if (eraRetido) {
    log(`    criado:  ${new Date(alvo.criado).toISOString()}`);
    log(`    libera:  ${new Date(alvo.libera).toISOString()}`);
    log(`    retencao total: ${Math.round((alvo.libera - alvo.criado) / 1000)}s`);
  }

  // --- 3. esperar o libera e comprar no instante ---
  log('\n=== 3. ESPERA E COMPRA ===');
  const esperar = Math.max(0, alvo.libera - agoraServidor());
  if (esperar > 0) {
    log(`  esperando ${Math.ceil(esperar / 1000)}s pelo libera...`);
    // Acorda um pouco depois do libera: o servidor recusa se chegar adiantado.
    const FOLGA_MS = 300;
    await new Promise((r) => setTimeout(r, esperar + FOLGA_MS));
    log(`  libera passou (folga de ${FOLGA_MS} ms). Comprando agora.`);
  } else {
    log('  ja esta liberado: comprando agora.');
  }

  const tEnvio = Date.now();
  enviar('mercado.comprar', { id: alvo.id, qtd: 1, preco: alvo.preco, moeda: alvo.moeda });

  // --- 4. confirmacao ---
  log('\n=== 4. CONFIRMACAO ===');
  await new Promise((r) => setTimeout(r, 4000));
  log(`  'mercado.mudou' recebidos: ${mudou}`);
  const depois = await pedir(filtro);
  const aindaLa = (depois?.lista || []).some((a) => a.id === alvo.id);
  log(`  o anuncio #${alvo.id} ainda esta a venda? ${aindaLa ? 'SIM' : 'NAO (saiu da lista)'}`);
  const bits1 = c.state.bits;
  const ovos1 = idsOvos();
  // O ovo do anuncio: o id dele ja vinha no resumo. Se ele esta na conta agora e
  // nao estava antes, a compra chegou — prova independente do saldo.
  const idOvo = alvo.resumo?.id;
  const ovoChegou = idOvo != null && !ovos0.has(idOvo) && ovos1.has(idOvo);
  const novos = [...ovos1].filter((x) => !ovos0.has(x));
  log(`  bits antes: ${bits0} | depois: ${bits1} | diferenca: ${bits1 - bits0}`);
  log(`  (a conta rende sozinha, entao a diferenca nao e exatamente o preco)`);
  log(`  ovos antes: ${ovos0.size} | depois: ${ovos1.size} | novos: ${novos.join(', ') || 'nenhum'}`);
  log(`  o ovo do anuncio (id ${idOvo ?? '-'}) chegou na conta? ${ovoChegou ? 'SIM' : 'nao'}`);
  if (avisos.length) log(`  avisos do servidor: ${avisos.join(' | ')}`);

  log('\n=== VEREDITO ===');
  if (!COMPRAR_DE_VERDADE) {
    log('  ENSAIO: o ciclo rodou inteiro (varredura -> fila -> espera do libera ->');
    log('  ponto de compra) sem enviar nada. Rode com --comprar para valer.');
  } else if (ovoChegou && !aindaLa) {
    log(`  SUCESSO: o anuncio saiu da lista e o ovo ${idOvo} esta na conta.`);
    log(`  A compra foi feita ${eraRetido ? 'no instante do libera' : 'direto'}.`);
  } else if (!aindaLa && bits0 - bits1 >= alvo.preco * 0.9) {
    log(`  PROVAVELMENTE COMPROU: o anuncio saiu e o saldo caiu ~${bits0 - bits1} bits,`);
    log('  mas o ovo nao apareceu na lista (ela pode nao ter sido reenviada ainda).');
  } else {
    log('  NAO CONFIRMADO. Veja os avisos do servidor e os saldos acima.');
  }
  log(`\nrelatorio: ${SAIDA}`);
  try { c.disconnect(); } catch {}
  fim(0);
}
function fim(c) { setTimeout(() => app.exit(c), 400); }
main().catch((e) => { log('FATAL: ' + (e.stack || e)); fim(1); });
