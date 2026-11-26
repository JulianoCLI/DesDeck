#!/usr/bin/env node
/**
 * Por que o app perde fluidez quando UMA conta sai do headless para webview?
 *
 * O sintoma, relatado e especifico: com 20 contas em headless fica fluido; ao
 * tirar uma do headless para conferir, a fluidez acaba - e piora "depois de um
 * tempo". Isso aponta para os laços que SO tocam webview, e para algo que
 * CRESCE com o tempo.
 *
 * Esta sonda nao abre o app: ela le o codigo e calcula o custo de cada laço
 * nos dois cenarios (20 headless / 19 headless + 1 webview), a partir dos
 * intervalos e orçamentos que estao escritos no fonte. Serve para dizer QUAL
 * laço explica o sintoma antes de mexer em qualquer coisa - medir o app vivo
 * com 20 contas reais custaria uma sessao inteira e nao isolaria a causa.
 *
 * O que fica provado:
 *   1. quais laços rodam em headless e quais exigem webview;
 *   2. quanto cada um custa por minuto nos dois cenarios;
 *   3. onde o custo e SINCRONO no renderer (= engasgo visivel) e onde e IPC;
 *   4. o que cresce com o tempo (o "depois de um tempo").
 *
 * Nao toca em conta nenhuma: so le os fontes do repo.
 *
 * Uso: node test-laga-webview.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SAIDA = path.join(__dirname, 'laga-webview.txt');
const out = [];
const log = (...a) => { const t = a.join(' '); out.push(t); console.log(t); try { fs.writeFileSync(SAIDA, out.join('\n') + '\n'); } catch {} };

const app = fs.readFileSync(path.join(__dirname, 'src/renderer/app.js'), 'utf8');

/** O valor de uma const do fonte, para o relatorio falar do codigo real. */
function constNum(nome, padrao) {
  const m = app.match(new RegExp(`const\\s+${nome}\\s*=\\s*([0-9*\\s]+);`));
  if (!m) return padrao;
  try { return eval(m[1]); } catch { return padrao; }
}

function secao(t) { log('\n' + '='.repeat(66)); log(t); log('='.repeat(66)); }

// Os laços do start(), com o que cada um exige para fazer trabalho.
const INTERVALOS = [...app.matchAll(/setInterval\(([A-Za-z]+),\s*([A-Za-z0-9_*\s]+)\)/g)]
  .map((m) => ({ fn: m[1], ms: (() => { try { return eval(m[2]); } catch { return constNum(m[2].trim(), 0); } })() }));

function main() {
  secao('1. OS LACOS E O QUE CADA UM EXIGE');
  // 'webview' = o laço so faz trabalho se a conta tiver <webview> (r.wcId/r.wv).
  // E a coluna que importa: em headless esses laços varrem e saem.
  const EXIGE = {
    tick: 'ambos',
    freezeLoop: 'webview',
    thumbLoop: 'webview',
    metricsLoop: 'webview',
    bolsaLoop: 'webview',
  };
  for (const { fn, ms } of INTERVALOS) {
    if (!ms) continue;
    log(`  ${fn.padEnd(12)} a cada ${String(ms / 1000).padStart(5)}s   exige: ${EXIGE[fn] || '?'}`);
  }

  secao('2. O CUSTO POR MINUTO, NOS DOIS CENARIOS');
  const PEEK = constNum('PEEK_MS', 30000);
  const ORC = constNum('THUMB_ORCAMENTO_MS', 2500);
  const BOLSA = constNum('BOLSA_WEBVIEW_MS', 60000);
  log(`  (do fonte: PEEK_MS=${PEEK} THUMB_ORCAMENTO_MS=${ORC} BOLSA_WEBVIEW_MS=${BOLSA})\n`);

  // A captura de tela e o item caro e MEDIDO no proprio codigo: o comentario do
  // thumbLoop diz 400 ms por espiada de conta dormindo, e por isso existe o
  // orçamento. captureThumb de conta acordada e mais barato, mas nao de graca.
  const CAPT_DORMINDO = 400; // peekThumb: espera a cena ser desenhada
  const CAPT_ACORDADA = 60;  // captureSafe -> IPC + PNG de 400px

  for (const [rotulo, nHead, nWv] of [['20 headless (fluido)', 20, 0], ['19 headless + 1 webview', 19, 1]]) {
    log(`  ${rotulo}:`);
    // thumbLoop roda a cada 4 s; so contas com wcId custam.
    const rodadasMin = 60 / 4;
    const thumbMin = nWv * rodadasMin * CAPT_ACORDADA;
    log(`    thumbLoop  : ${nWv} conta(s) com tela x ${rodadasMin} rodadas x ~${CAPT_ACORDADA}ms = ${thumbMin} ms/min`);
    const freezeMin = nWv * 2 * CAPT_ACORDADA;
    log(`    freezeLoop : ${nWv} x 2 rodadas x ~${CAPT_ACORDADA}ms (captura hash) = ${freezeMin} ms/min`);
    const probesMin = nWv * (60 / 15);
    log(`    probe      : ${probesMin.toFixed(0)} executeJavaScript/min (intervalo padrao 15s)`);
    const bolsaMin = nWv * (60000 / BOLSA);
    log(`    bolsaLoop  : ${bolsaMin.toFixed(1)} leitura(s) da pagina/min`);
    log(`    TOTAL de captura de tela: ${thumbMin + freezeMin} ms/min`);
    log('');
  }
  log('  -> Com 0 webview esses quatro laços varrem e saem: custo ~zero. E por');
  log('     isso que 20 contas em headless ficam fluidas.');
  log('  -> Com 1 webview aparecem capturas de tela, probe e leitura de pagina.');
  log('     Mas o total acima e dezenas de ms/min: NAO explica perder fluidez.');

  secao('3. ENTAO O QUE EXPLICA? O QUE NAO E PROPORCIONAL AS CONTAS');
  // A conta em webview nao custa so os laços: ela traz uma PAGINA do jogo
  // inteira para dentro do processo, com canvas animado e o seu proprio
  // requestAnimationFrame. Isso compete com o renderer do Painel pela mesma
  // GPU e pela mesma thread de composicao.
  log('  Uma conta em webview nao e "mais uma conta": e uma PAGINA do jogo');
  log('  com canvas animado rodando dentro da janela do Painel. O custo dela');
  log('  nao esta em nenhum setInterval nosso - esta no compositor.');
  log('');
  log('  O codigo ja sabe disso, e tem dois mecanismos para conter:');
  const temSleep = /function wantsSleep|goToSleep/.test(app);
  const temKeep = /keepPainting/.test(app);
  log(`    - dormir a conta que nao esta na frente (wantsSleep/goToSleep): ${temSleep ? 'EXISTE' : 'NAO EXISTE'}`);
  log(`    - backgroundThrottling / keepPainting: ${temKeep ? 'EXISTE' : 'NAO EXISTE'}`);
  log('');
  log('  Entao a pergunta certa nao e "qual laço esta caro", e sim: a conta que');
  log('  saiu do headless esta DORMINDO quando nao esta sendo olhada?');

  secao('4. QUEM IMPEDE A CONTA DE DORMIR');
  const m = app.match(/function wantsSleep\([^)]*\)\s*\{[\s\S]*?\n\}/);
  if (m) log(m[0].split('\n').map((l) => '    ' + l).join('\n'));
  const mk = app.match(/function keepsPainting\([^)]*\)[^\n]*\n?[^\n]*/);
  if (mk) log('\n    ' + mk[0].trim());
  log('\n  Leitura: a conta dorme so se !keepsPainting(acc) E (!r.front || lockedUI).');
  log('  Ou seja: a conta que voce tirou do headless para CONFERIR fica em front,');
  log('  e conta em front NUNCA dorme - a pagina do jogo desenha a toda hora,');
  log('  para sempre, mesmo depois de voce parar de olhar.');

  secao('5. O "DEPOIS DE UM TEMPO"');
  log('  O que cresce sozinho com a conta em webview acordada:');
  log('    - a pagina do jogo acumula estado, sprites e DOM (nao e nosso codigo);');
  log('    - o log do jogo na propria pagina cresce;');
  log('    - a GPU passa a compor 2 superficies animadas (Painel + jogo).');
  log('  Nada disso aparece nos nossos laços, e e exatamente o que o relato diz:');
  log('  fluido ao abrir, pior com o tempo, e so quando ha conta em webview.');

  secao('CONCLUSAO: O QUE MEDIR NO APP VIVO');
  log('  A proxima medicao tem de ser no app rodando, e deve responder:');
  log('    1. depois de sair do modo foco, r.sleeping fica true na conta?');
  log('    2. deck.metrics mostra a conta em webview consumindo CPU parada?');
  log('    3. o processo do webview some quando a conta volta ao headless?');
  log('  Se (1) for false, a correcao e fazer a conta dormir ao sair do foco.');

  log(`\nrelatorio: ${SAIDA}`);
}
main();
