#!/usr/bin/env node
/**
 * Quanto trabalho a lista de digimons gera por minuto, em REGIME.
 *
 * O travamento de 24 MB foi corrigido e medido (o estado esta em 0,18 MB). Mas
 * o app voltou a travar depois que os digimons entraram na lista - entao a
 * suspeita e o caminho novo, e esta sonda mede o custo dele.
 *
 * A hipotese a testar: emitDigimons() e agrupado em 5 s, mas NAO e condicional.
 * O pacote 'estado' chega varias vezes por segundo para sempre (o HP muda a
 * cada golpe), logo o debounce nunca fica em repouso: ele dispara a cada 5 s,
 * por conta, PARA SEMPRE - mesmo quando nenhum digimon mudou. Com 34 contas
 * isso e ~7 avisos por segundo, cada um reenriquecendo a lista e forcando um
 * renderOvos que reconstroi os chips e ate 200 linhas.
 *
 * O que fica provado aqui:
 *   1. quantas vezes 'estado' chega por minuto (a fonte do pulso);
 *   2. quantas vezes 'digimons' seria emitido no mesmo minuto;
 *   3. quantas dessas emissoes trazem conteudo IGUAL a anterior (= trabalho
 *      jogado fora, que e o que trava);
 *   4. o custo de uma rodada de enriquecerDigimons, para extrapolar por conta.
 *
 * NAO MUTA A CONTA: sendCommand e barrado por completo, menos ping/pong.
 *
 * Uso: .\node_modules\electron\dist\electron.exe test-digi-pulso.js
 */
'use strict';
const { app, session } = require('electron');
const path = require('path');
const fs = require('fs');

const DATA_DIR = require('./perfil-real').usar();
const SAIDA = path.join(__dirname, 'digi-pulso.txt');
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

async function main() {
  await app.whenReady();
  const todas = await particoesComSessao();
  if (!todas.length) { log('nenhuma conta com sessao salva'); return fim(1); }
  const partition = todas[0];
  log(`contas com sessao no perfil: ${todas.length} | medindo em: ${partition}\n`);

  const { DigiiIdleHeadlessClient } = require('./src/headless/client');
  const { enriquecerDigimons } = require('./src/headless/ovos');
  const c = new DigiiIdleHeadlessClient('pulso', partition, { name: 'pulso' });

  const real = c.sendCommand.bind(c);
  c.sendCommand = (t, d) => (t === 'pong' || t === 'ping' ? real(t, d) : true);
  const realSend = c.send.bind(c);
  c.send = (o) => (o && (o.t === 'ping' || o.t === 'pong') ? realSend(o) : true);

  let estados = 0;
  c.on('msg', (msg) => { if (msg && msg.t === 'estado') estados++; });

  // As emissoes de verdade, do codigo como esta hoje.
  const emissoes = [];
  c.on('digimons', (g) => emissoes.push({
    em: Date.now(),
    // A assinatura do que a LISTA mostra. Se duas emissoes seguidas tem a mesma,
    // a segunda nao mudou um pixel da tela: e trabalho puro jogado fora.
    assina: JSON.stringify([...(g.equipe || []), ...(g.depot || []), ...(g.colecao || [])]
      .map((d) => d && [d.id, d.especie, d.nivel, d.nota, d.poder, d.local, d.shiny])),
    // O pacote cru, para comparar com o que o HP faz mudar.
    cru: JSON.stringify([...(g.equipe || []), ...(g.depot || []), ...(g.colecao || [])]),
  }));

  await new Promise((res) => {
    let pronto = false;
    c.on('update', () => { if (!pronto) { pronto = true; res(); } });
    c.on('error', (m) => { log('erro: ' + m); if (!pronto) { pronto = true; res(); } });
    c.connect();
  });
  log(`conectado: ${c.state.nick} | nivel ${c.state.nivel}`);
  const t0 = Date.now();
  log(`\nmedindo ${ESCUTA_MS / 1000}s em regime (conta cacando)...\n`);
  await new Promise((r) => setTimeout(r, ESCUTA_MS));
  const secs = (Date.now() - t0) / 1000;

  log('================================================================');
  log("1. O PULSO: quantas vezes 'estado' chega");
  log('================================================================');
  log(`  pacotes 'estado' em ${secs.toFixed(0)}s: ${estados}  (${(estados / secs).toFixed(1)}/s)`);
  log('  -> e este o pulso que mantem o debounce de 5 s sempre aceso.');

  log('\n================================================================');
  log("2. QUANTAS VEZES 'digimons' FOI EMITIDO");
  log('================================================================');
  log(`  emissoes: ${emissoes.length} em ${secs.toFixed(0)}s`);
  log(`  intervalo medio: ${emissoes.length > 1 ? ((emissoes[emissoes.length - 1].em - emissoes[0].em) / (emissoes.length - 1) / 1000).toFixed(1) : '-'}s`);
  log(`  extrapolado para ${todas.length} contas: ${(emissoes.length / secs * todas.length).toFixed(1)} avisos/s`);
  log('  (cada aviso = 1 enriquecer + 1 IPC + 1 renderOvos com chips e ate 200 linhas)');

  log('  ESPERADO DEPOIS DA CORRECAO: 1 emissao (a do login). O emissor compara');
  log('  a lista antes de avisar, entao em regime o numero fica em zero.');

  log('\n================================================================');
  log('3. QUANTAS MUDARAM DE VERDADE (o desperdicio)');
  log('================================================================');
  let iguaisTela = 0;
  let iguaisCru = 0;
  for (let i = 1; i < emissoes.length; i++) {
    if (emissoes[i].assina === emissoes[i - 1].assina) iguaisTela++;
    if (emissoes[i].cru === emissoes[i - 1].cru) iguaisCru++;
  }
  const pares = Math.max(1, emissoes.length - 1);
  log(`  emissoes seguidas com o CRU identico      : ${iguaisCru}/${pares}`);
  log(`  emissoes seguidas com a TELA identica     : ${iguaisTela}/${pares}  (${(iguaisTela / pares * 100).toFixed(0)}%)`);
  log('  -> \"tela identica\" = redesenho que nao muda nada. Se for ~100%, o');
  log('     caminho novo e um moinho: trabalha sem parar e nao produz nada.');
  if (emissoes.length > 1 && iguaisCru < pares) {
    log('  (o cru muda mais que a tela: e o HP da equipe, que a lista nem mostra)');
  }

  log('\n================================================================');
  log('4. O CUSTO DE UMA RODADA');
  log('================================================================');
  const grupos = { equipe: c.state.equipe || [], depot: c.state.depot || [], colecao: c.state.colecao || [] };
  const n = grupos.equipe.length + grupos.depot.length + grupos.colecao.length;
  const m0 = Date.now();
  for (let i = 0; i < 20; i++) await enriquecerDigimons(grupos);
  const porRodada = (Date.now() - m0) / 20;
  log(`  digimons na conta: ${n}`);
  log(`  enriquecerDigimons: ${porRodada.toFixed(2)} ms por rodada`);
  log(`  com ${todas.length} contas no ritmo medido: ${(porRodada * emissoes.length / secs * todas.length).toFixed(1)} ms/s so de enriquecer`);
  log('  (sem contar o IPC e o renderOvos, que correm no renderer - onde trava)');

  fim(0);
}

function fim(c) {
  log(`\nrelatorio: ${SAIDA}`);
  setTimeout(() => app.exit(c), 300);
}
main().catch((e) => { log('FATAL: ' + ((e && e.stack) || e)); fim(1); });
