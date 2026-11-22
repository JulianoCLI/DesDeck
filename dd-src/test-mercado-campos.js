#!/usr/bin/env node
/**
 * Confere, em CONTA REAL, o mercado que o grep achou no cliente — antes de
 * escrever uma linha de sniper.
 *
 * O grep (test-mercado-grep.js) leu do cliente:
 *   - pedido:   enviar('mercado.listar', { tipo, moeda, tiers, ordem, pagina, ... })
 *   - RESPOSTA: pacote 't: "mercado"'  (menus2.js L941: `mercado: (m) => { lista = m }`)
 *   - comprar:  enviar('mercado.comprar', { id, qtd, preco, moeda })
 *   - retencao: a.libera > agora()  -> "todo anuncio espera 2 min antes de poder
 *               ser comprado" (menus2.js L677). ESTE e o "tempo" do sniper.
 *   - push:     't: "mercado.mudou"' quando alguem vende/compra/expira.
 *
 * NAO COMPRA NADA. 'mercado.comprar' nao existe neste arquivo, e qualquer comando
 * fora da lista de leitura e BARRADO e logado.
 *
 * O que ele mede, e por que cada coisa importa para o sniper:
 *   1. os CAMPOS reais de um anuncio (preco, moeda, libera, qtd, resumo.tier...);
 *   2. se 'tiers' e 'maisMin' filtram no SERVIDOR (se filtram, o sniper nao
 *      precisa reimplementar regra de tier — e a regra do projeto);
 *   3. quanto tempo a retencao realmente dura (o grep diz 2 min: confirmar);
 *   4. se 'mercado.mudou' chega sozinho (push) — se chegar, o sniper nao precisa
 *      depender so do relogio de 1 min;
 *   5. qual o item mais barato a venda, para o teste real de compra.
 *
 * Uso: .\node_modules\electron\dist\electron.exe test-mercado-campos.js
 *      ...                                        test-mercado-campos.js <particao>
 */
'use strict';
const { app, session } = require('electron');
const path = require('path');
const fs = require('fs');

const DATA_DIR = require('./perfil-real').usar();
const SAIDA = path.join(__dirname, 'mercado-campos.txt');
const out = [];
const log = (...a) => { const t = a.join(' '); out.push(t); console.log(t); try { fs.writeFileSync(SAIDA, out.join('\n') + '\n'); } catch {} };

const particaoPedida = process.argv[2] || null;
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

// So leitura. 'mercado.comprar'/'comprarQtd'/'anunciar' NAO estao aqui de proposito.
const LEITURA = new Set(['mercado.listar', 'mercado.itens', 'mercado.precos', 'ping', 'pong']);

const resumo = (v, prof = 0) => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    if (prof >= 1) return `array[${v.length}]`;
    return `array[${v.length}] primeiro=${resumo(v[0], prof + 1)}`;
  }
  const ks = Object.keys(v);
  if (prof >= 2) return `{${ks.join(',')}}`;
  return `{ ${ks.map((k) => `${k}: ${resumo(v[k], prof + 1)}`).join(', ')} }`;
};

async function main() {
  await app.whenReady();
  const todas = await particoesComSessao();
  if (!todas.length) {
    log('Nenhuma conta com sessao salva no perfil.');
    log(`perfil: ${DATA_DIR}`);
    log('Entre numa conta pelo app (modo normal) e rode de novo.');
    return fim(1);
  }
  const partition = particaoPedida || todas[0];
  if (particaoPedida && !todas.includes(particaoPedida)) {
    log(`a particao ${particaoPedida} nao tem sessao. Com sessao: ${todas.join(', ')}`);
    return fim(1);
  }
  log(`contas com sessao: ${todas.length} | usando: ${partition}\n`);

  const { DigiiIdleHeadlessClient } = require('./src/headless/client');
  const c = new DigiiIdleHeadlessClient('mercado', partition, { name: 'mercado-campos' });

  const real = c.sendCommand.bind(c);
  c.sendCommand = (t, d) => (LEITURA.has(t) ? real(t, d) : (log(`[BARRADO] ${t}`), true));

  // Guarda cada resposta do mercado e conta os pushes nao pedidos.
  let ultimaLista = null;
  let mudou = 0;
  const primeiraVezMudou = [];
  const orig = c.onMessage.bind(c);
  c.onMessage = (ev) => {
    try {
      const m = JSON.parse(ev.data);
      if (m && m.t === 'mercado') ultimaLista = m;
      else if (m && m.t === 'mercado.mudou') { mudou++; primeiraVezMudou.push(Date.now()); }
    } catch {}
    return orig(ev);
  };

  await new Promise((r) => {
    let f = 0; const go = () => { if (!f++) r(); };
    c.on('update', go); c.on('error', (m) => { log('erro: ' + m); go(); });
    setTimeout(go, 30000); c.connect();
  });
  if (!c.connected) { log('nao conectou. Se o app estiver aberto nesta conta, feche-a.'); return fim(1); }
  log(`conectado: ${c.state.nick || '(sem nick)'} | bits ${c.state.bits} | gemas(D-Dol) ${c.state.gemas}\n`);

  // Pede uma listagem e espera a resposta 'mercado'.
  const pedir = async (payload, rotulo) => {
    ultimaLista = null;
    real('mercado.listar', payload);
    for (let i = 0; i < 24 && !ultimaLista; i++) await new Promise((r) => setTimeout(r, 250));
    log(`\n--- ${rotulo} ---`);
    log(`  pedido: ${JSON.stringify(payload)}`);
    if (!ultimaLista) { log('  (sem resposta em 6 s)'); return null; }
    const m = ultimaLista;
    log(`  resposta: chaves = ${Object.keys(m).join(', ')}`);
    for (const k of Object.keys(m)) if (k !== 'lista' && k !== 't') log(`    ${k} = ${resumo(m[k])}`);
    const L = Array.isArray(m.lista) ? m.lista : [];
    log(`  anuncios: ${L.length}`);
    if (L[0]) {
      log('  PRIMEIRO ANUNCIO, campo por campo:');
      for (const k of Object.keys(L[0])) log(`    ${k.padEnd(12)} = ${resumo(L[0][k])}`);
      const ag = Date.now();
      for (const a of L.slice(0, 5)) {
        const falta = (a.libera || 0) - ag;
        log(`    #${a.id} ${a.moeda} ${a.preco} | libera em ${falta > 0 ? Math.round(falta / 1000) + 's' : 'JA LIBERADO'} | tier=${a.resumo?.tier ?? '-'} nota=${a.resumo?.nota ?? '-'}`);
      }
    }
    return m;
  };

  log('=== 1. OVOS: a listagem que o sniper vai usar ===');
  const ovos = await pedir({ tipo: 'ovo', moeda: '', ordem: 'barato', pagina: 0 }, 'ovos, mais baratos primeiro');

  log('\n=== 2. O FILTRO DE TIER E DO SERVIDOR? ===');
  // Se 'tiers' filtra no servidor, o sniper NAO reimplementa regra de tier.
  const soS = await pedir({ tipo: 'ovo', moeda: '', tiers: 'S,SS,SSS', ordem: 'barato', pagina: 0 }, "tiers = 'S,SS,SSS'");
  if (ovos && soS) {
    const todosT = (ovos.lista || []).map((a) => a.resumo?.tier).filter(Boolean);
    const sT = (soS.lista || []).map((a) => a.resumo?.tier).filter(Boolean);
    log(`  tiers sem filtro: ${[...new Set(todosT)].join(', ') || '(nenhum tier no resumo)'}`);
    log(`  tiers com filtro: ${[...new Set(sT)].join(', ') || '(nenhum tier no resumo)'}`);
    log(`  >> ${sT.length && sT.every((x) => ['S', 'SS', 'SSS'].includes(x)) ? 'SIM: o servidor filtra por tier.' : 'INCONCLUSIVO: confira os valores acima.'}`);
  }

  log('\n=== 3. POTENCIA (ovo p4+/p5): o campo maisMin ===');
  await pedir({ tipo: 'ovo', moeda: '', maisMin: 4, ordem: 'barato', pagina: 0 }, 'maisMin = 4');

  log('\n=== 4. ITENS BARATOS (para o teste real de compra) ===');
  const itens = await pedir({ tipo: 'tudo', moeda: 'bits', ordem: 'barato', pagina: 0 }, 'tudo, mais barato primeiro');
  if (itens) {
    const L = (itens.lista || []).filter((a) => !a.meu).slice(0, 10);
    log('  candidatos ao teste real (os 10 mais baratos, nao meus):');
    for (const a of L) log(`    #${a.id} tipo=${a.tipo} item=${a.item || a.resumo?.especie || '-'} ${a.moeda} ${a.preco} qtd=${a.qtd}`);
  }

  log('\n=== 5. RETENCAO: quanto tempo o anuncio fica retido ===');
  // O cliente diz 2 min. Medir de verdade: pega o anuncio MAIS RECENTE e observa.
  const todos = (ovos?.lista || []).concat(itens?.lista || []);
  const retidos = todos.filter((a) => (a.libera || 0) > Date.now());
  if (!retidos.length) log('  nenhum anuncio retido neste instante (todos ja passaram dos 2 min).');
  for (const a of retidos.slice(0, 5)) {
    log(`  #${a.id}: criado=${new Date(a.criado).toISOString()} libera=${new Date(a.libera).toISOString()} => retencao = ${Math.round((a.libera - a.criado) / 1000)}s`);
  }

  log('\n=== 6. PUSH: o servidor avisa quando o mercado muda? ===');
  log('  (ouvindo 60 s por "mercado.mudou", sem pedir nada)');
  const t0 = Date.now();
  await new Promise((r) => setTimeout(r, 60000));
  log(`  'mercado.mudou' recebidos em 60 s: ${mudou}`);
  if (mudou) {
    const dts = primeiraVezMudou.map((t) => Math.round((t - t0) / 1000));
    log(`  nos segundos: ${dts.join(', ')}`);
    log('  >> SIM: o sniper pode reagir ao push, alem do relogio.');
  } else {
    log('  >> Nenhum push nesta janela. O sniper nao pode depender dele; o relogio e a base.');
  }

  log(`\nrelatorio: ${SAIDA}`);
  try { c.disconnect(); } catch {}
  fim(0);
}
function fim(c) { setTimeout(() => app.exit(c), 400); }
main().catch((e) => { log('FATAL: ' + (e.stack || e)); fim(1); });
