#!/usr/bin/env node
/**
 * Prova a ferramenta de Labirinto (ToolLab) offline, com o pacote 'lab' real
 * capturado na conta ms1 (test-lab-campos.js) como molde.
 *
 * Nao toca em conta nenhuma: o client e falso e sendCommand so registra.
 *
 * Uso: node test-lab-tool.js
 */
'use strict';

const { EventEmitter } = require('events');
const Module = require('module');
const realLoad = Module._load;
Module._load = function (req, parent, isMain) {
  if (req === './catalogo') {
    return { ilhaPorSlug: async () => ({}), precos: async () => ({}), tierOvo: async () => ({ letraOvo: () => '?' }), carregar: async () => ({}) };
  }
  return realLoad(req, parent, isMain);
};

const { ToolLab } = require('./src/headless/tools');

let falhas = 0;
const ok = (c, t) => { console.log(`  ${c ? 'ok  ' : 'FALHA'} ${t}`); if (!c) falhas++; };

// O pacote real da ms1, reduzido aos campos de decisao.
const LAB_REAL = () => ({
  t: 'lab',
  noLobby: false,
  pronto: true,
  gerente: false,
  guild: true,
  dif: 'pesadelo',
  bauHoje: 0,
  eu: { conta: 'e14af562', nick: 'MS1', nivel: 136, esp: 'gottsumon' },
  fila: Array.from({ length: 14 }, (_, i) => ({ nick: 'x' + i })),
  cfg: { min: 3, max: 30, bauPorDia: 3, duracaoMin: 25 },
});

function clientFake({ local = 'hunt', lab = LAB_REAL(), responde = true } = {}) {
  const c = new EventEmitter();
  c.index = 'ms1';
  c.connected = true;
  c.state = { ativoId: 31792, local, huntSlug: 'agumon', lab };
  c.enviados = [];
  // Resposta do servidor ao 'lab.info': devolve o pacote guardado, como o
  // client real faz ao receber t:'lab'.
  c.proximaResposta = lab;
  c.sendCommand = (type, data) => {
    c.enviados.push({ type, data });
    if (type === 'lab.info' && responde) {
      setTimeout(() => { c.state.lab = c.proximaResposta; }, 30);
    }
    return true;
  };
  return c;
}

const cfg = { intervaloMin: 2 };
const entrou = (c) => c.enviados.filter((e) => e.type === 'lab.entrar').length;

async function main() {
  console.log('=== FERRAMENTA DE LABIRINTO ===\n');

  console.log('1. o caso bom: lobby aberto, conta apta -> entra');
  {
    const c = clientFake();
    const t = new ToolLab(c, cfg);
    t.running = true;
    await t.step();
    ok(entrou(c) === 1, `mandou lab.entrar uma vez (foi ${entrou(c)})`);
    ok(c.enviados[0].type === 'lab.info', 'pediu o lobby antes de decidir');
  }

  console.log('\n2. ja inscrito (noLobby) -> nao reenvia');
  {
    const lab = { ...LAB_REAL(), noLobby: true };
    const c = clientFake({ lab });
    const t = new ToolLab(c, cfg);
    t.running = true;
    await t.step();
    await t.step();
    ok(entrou(c) === 0, 'nao mandou lab.entrar nenhuma vez');
  }

  console.log('\n3. cada motivo para NAO entrar barra o comando');
  {
    const casos = [
      ['sem guild', { guild: false }],
      ['mapa nao instalado', { pronto: false }],
      ['sem Digimon que possa lutar', { eu: null }],
      ['corrida em andamento', { run: { id: 1 } }],
      ['lobby cheio', { fila: Array.from({ length: 30 }, () => ({})) }],
    ];
    for (const [nome, patch] of casos) {
      const c = clientFake({ lab: { ...LAB_REAL(), ...patch } });
      const t = new ToolLab(c, cfg);
      t.running = true;
      await t.step();
      ok(entrou(c) === 0, `${nome}: nada enviado`);
    }
    // 'run' com acabou=true e corrida encerrada: o lobby reabriu.
    const c = clientFake({ lab: { ...LAB_REAL(), run: { id: 1, acabou: true } } });
    const t = new ToolLab(c, cfg);
    t.running = true;
    await t.step();
    ok(entrou(c) === 1, 'corrida já encerrada (acabou): entra normalmente');
  }

  console.log('\n4. dentro do Labirinto nao ha lobby a entrar');
  {
    const c = clientFake({ local: 'lab' });
    const t = new ToolLab(c, cfg);
    t.running = true;
    await t.step();
    ok(c.enviados.length === 0, 'nem pediu o lobby');
  }

  console.log('\n5. o servidor nao responde lab.info');
  {
    const c = clientFake({ lab: null, responde: false });
    const t = new ToolLab(c, cfg);
    t.running = true;
    await t.step();
    ok(entrou(c) === 0, 'sem lobby, nao entra as cegas');
  }

  console.log('\n6. desligada na UI / sem socket');
  {
    const c = clientFake();
    // 'desligada' é derivada de config.__off, que é o que a UI escreve.
    const t = new ToolLab(c, { ...cfg, __off: true });
    t.running = true;
    await t.step();
    ok(c.enviados.length === 0, 'desligada: nada enviado');
  }
  {
    const c = clientFake();
    c.connected = false;
    c.sendCommand = () => false; // o client real recusa sem socket
    const t = new ToolLab(c, cfg);
    t.running = true;
    await t.step();
    ok(entrou(c) === 0, 'sem socket: nada enviado');
  }

  console.log('\n7. nao reenvia logo depois de entrar (espera o servidor)');
  {
    const c = clientFake();
    const t = new ToolLab(c, cfg);
    t.running = true;
    await t.step();
    const n = entrou(c);
    // O servidor ainda nao devolveu noLobby=true: o passo seguinte nao pode
    // remandar o comando.
    await t.step();
    ok(entrou(c) === n, `segundo passo nao duplicou (${entrou(c)} total)`);
  }

  console.log('\n8. o lobby enche durante o respiro -> desiste');
  {
    const c = clientFake();
    const t = new ToolLab(c, cfg);
    t.running = true;
    const real = t.respirar.bind(t);
    t.respirar = async (ms) => {
      // Enquanto esperamos, a guild lota o lobby.
      c.state.lab = { ...LAB_REAL(), fila: Array.from({ length: 30 }, () => ({})) };
      return real(ms);
    };
    await t.step();
    ok(entrou(c) === 0, 'releu o lobby depois do respiro e desistiu');
  }

  console.log('\n9. corrida comeca durante o respiro -> desiste');
  {
    const c = clientFake();
    const t = new ToolLab(c, cfg);
    t.running = true;
    const real = t.respirar.bind(t);
    t.respirar = async (ms) => { c.state.lab = { ...LAB_REAL(), run: { id: 9 } }; return real(ms); };
    await t.step();
    ok(entrou(c) === 0, 'nao entrou em corrida em andamento');
  }

  console.log('\n10. parar remove o ouvinte de lab-mudou');
  {
    const c = clientFake();
    const t = new ToolLab(c, cfg);
    t.start();
    ok(c.listenerCount('lab-mudou') === 1, 'start registra o ouvinte');
    t.stop();
    ok(c.listenerCount('lab-mudou') === 0, 'stop remove o ouvinte');
    // Religar nao acumula.
    const t2 = new ToolLab(c, cfg);
    t2.start(); t2.stop(); t2.start(); t2.stop();
    ok(c.listenerCount('lab-mudou') === 0, 'religar nao acumula ouvintes');
  }

  console.log('\n11. o intervalo respeita o piso e o disfarce');
  {
    // 0/ausente cai no default de 2 min; o piso de 30s so aparece para valores
    // pequenos mas verdadeiros (o formulario ja limita a 1 min).
    const t0 = new ToolLab(clientFake(), { intervaloMin: 0 });
    ok(t0.getInterval() === 120000, `sem valor usa o default de 2 min (${t0.getInterval()}ms)`);
    const t = new ToolLab(clientFake(), { intervaloMin: 0.1 });
    ok(t.getInterval() === 30000, `piso de 30s respeitado (${t.getInterval()}ms)`);
    const t2 = new ToolLab(clientFake(), { intervaloMin: 2 });
    ok(t2.getInterval() === 120000, '2 min = 120000ms');
    const j = t2.jitterMs(120000);
    ok(j > 0, `tem jitter (${j}ms), as contas nao conferem juntas`);
  }

  console.log('\n12. a ferramenta nunca manda comando que afete a guild');
  {
    const c = clientFake();
    const t = new ToolLab(c, cfg);
    t.running = true;
    await t.step();
    const proibidos = ['lab.iniciar', 'lab.dificuldade', 'lab.sair', 'lab.voltar', 'lab.chamar'];
    const achou = c.enviados.filter((e) => proibidos.includes(e.type));
    ok(achou.length === 0, `nenhum comando de grupo enviado (${c.enviados.map((e) => e.type).join(', ')})`);
  }

  console.log('\n13. baus do dia esgotados -> nao ocupa vaga no lobby');
  {
    // cfg.bauPorDia=3 e bauHoje=3 (campos reais de lab.info, ver lab-report.txt):
    // a corrida nao daria recompensa nenhuma.
    const c = clientFake({ lab: { ...LAB_REAL(), bauHoje: 3 } });
    const t = new ToolLab(c, cfg);
    t.running = true;
    await t.step();
    ok(entrou(c) === 0, 'com 3/3 baus nao entrou no lobby');

    // Passou do teto (o servidor pode contar a mais): tambem barra.
    const c2 = clientFake({ lab: { ...LAB_REAL(), bauHoje: 5 } });
    const t2 = new ToolLab(c2, cfg);
    t2.running = true;
    await t2.step();
    ok(entrou(c2) === 0, 'acima do teto (5/3) tambem barra');

    // Ainda sobra chance: tem de entrar normalmente.
    for (const n of [0, 1, 2]) {
      const c3 = clientFake({ lab: { ...LAB_REAL(), bauHoje: n } });
      const t3 = new ToolLab(c3, cfg);
      t3.running = true;
      await t3.step();
      ok(entrou(c3) === 1, `com ${n}/3 baus ainda entra`);
    }
  }

  console.log('\n14. sem o teto no pacote nao chutamos nada');
  {
    // Servidor que nao manda cfg.bauPorDia: barrar seria inventar regra.
    const semTeto = LAB_REAL();
    delete semTeto.cfg.bauPorDia;
    const c = clientFake({ lab: { ...semTeto, bauHoje: 99 } });
    const t = new ToolLab(c, cfg);
    t.running = true;
    await t.step();
    ok(entrou(c) === 1, 'sem bauPorDia entra como antes');

    // bauHoje ausente conta como 0.
    const semHoje = LAB_REAL();
    delete semHoje.bauHoje;
    const c2 = clientFake({ lab: semHoje });
    const t2 = new ToolLab(c2, cfg);
    t2.running = true;
    await t2.step();
    ok(entrou(c2) === 1, 'sem bauHoje entra como antes');
  }

  console.log('\n15. os baus acabam durante o respiro -> desiste');
  {
    const c = clientFake();
    const t = new ToolLab(c, cfg);
    t.running = true;
    const real = t.respirar.bind(t);
    t.respirar = async (ms) => { c.state.lab = { ...LAB_REAL(), bauHoje: 3 }; return real(ms); };
    await t.step();
    ok(entrou(c) === 0, 'releu o lobby e viu que nao ha mais bau');
  }

  console.log('\n16. ja inscrito com os baus no fim -> nao e expulso');
  {
    // So decidimos NAO ENTRAR. Sair do lobby seria outra decisao, e a conta
    // pode estar la para ajudar a guild.
    const c = clientFake({ lab: { ...LAB_REAL(), noLobby: true, bauHoje: 3 } });
    const t = new ToolLab(c, cfg);
    t.running = true;
    await t.step();
    const saiu = c.enviados.filter((e) => e.type === 'lab.sair').length;
    ok(saiu === 0 && entrou(c) === 0, 'nao manda lab.sair nem lab.entrar');
  }

  // ----------------------------------------------- inicio automatico
  // Regras lidas do cliente do jogo (js/guild.js, via test-lab-grep.js):
  // o botao Comecar so existe para gerente e fica disabled com
  // `falta || correndo || !L.pronto`; 'lab.iniciar' nao leva argumento;
  // 'lab.dificuldade' leva { dif: <id> }.
  const comecou = (c) => c.enviados.filter((e) => e.type === 'lab.iniciar').length;
  const mudouDif = (c) => c.enviados.filter((e) => e.type === 'lab.dificuldade');
  // Conta ja no lobby e com permissao: o cenario do auto-start.
  const LIDER = (extra = {}) => ({ ...LAB_REAL(), noLobby: true, gerente: true, ...extra });
  const START = { intervaloMin: 2, autoStart: true };

  console.log('\n17. por padrao NUNCA comeca nem mexe na dificuldade');
  {
    const c = clientFake({ lab: LIDER() });
    const t = new ToolLab(c, cfg);           // cfg sem autoStart
    t.running = true;
    await t.step();
    ok(comecou(c) === 0 && mudouDif(c).length === 0, 'sem config, nada de lab.iniciar/dificuldade');
  }

  console.log('\n18. conta sem permissao nao tenta (e avisa uma vez)');
  {
    const c = clientFake({ lab: { ...LIDER(), gerente: false } });
    const t = new ToolLab(c, { ...START, startLotado: true, dificuldade: 'normal' });
    t.running = true;
    let avisos = 0;
    t.log = (m) => { if (String(m).includes('não é dono')) avisos++; };
    await t.step();
    await t.step();
    ok(comecou(c) === 0, 'nao mandou lab.iniciar');
    ok(mudouDif(c).length === 0, 'nao mandou lab.dificuldade');
    ok(avisos === 1, `avisou uma unica vez (foram ${avisos})`);
  }

  console.log('\n19. gatilho 1: lobby lotado');
  {
    // 29/30 ainda nao e lotado.
    const c = clientFake({ lab: LIDER({ fila: Array.from({ length: 29 }, () => ({})) }) });
    const t = new ToolLab(c, { ...START, startLotado: true });
    t.running = true;
    await t.step();
    ok(comecou(c) === 0, '29/30 nao comeca');

    const c2 = clientFake({ lab: LIDER({ fila: Array.from({ length: 30 }, () => ({})) }) });
    const t2 = new ToolLab(c2, { ...START, startLotado: true });
    t2.running = true;
    await t2.step();
    ok(comecou(c2) === 1, '30/30 comeca');
    ok(c2.enviados.find((e) => e.type === 'lab.iniciar').data === undefined
      || JSON.stringify(c2.enviados.find((e) => e.type === 'lab.iniciar').data) === '{}',
      'lab.iniciar vai sem argumento util (como o jogo faz)');
  }

  console.log('\n20. gatilho 2: x min depois de bater o minimo');
  {
    const c = clientFake({ lab: LIDER() });   // 14 no lobby, minimo 3
    const t = new ToolLab(c, { ...START, startAposMinimo: true, startAposMinimoMin: 10 });
    t.running = true;
    await t.step();
    ok(comecou(c) === 0, 'acabou de encher: ainda nao comeca');
    // 10 min depois.
    t.lobbyDesde = Date.now() - 10 * 60000;
    await t.step();
    ok(comecou(c) === 1, 'passados 10 min, comeca');
  }

  console.log('\n21. gatilho 2 reinicia se o lobby esvazia');
  {
    const c = clientFake({ lab: LIDER({ fila: Array.from({ length: 5 }, () => ({})) }) });
    const t = new ToolLab(c, { ...START, startAposMinimo: true, startAposMinimoMin: 10 });
    t.running = true;
    await t.step();
    const marcou = t.lobbyDesde;
    ok(marcou > 0, 'com 5 (minimo 3) o relogio comecou');
    // Cai para 2: abaixo do minimo, o relogio zera.
    c.state.lab = c.proximaResposta = LIDER({ fila: [{}, {}] });
    await t.step();
    ok(t.lobbyDesde === 0, 'abaixo do minimo o relogio zerou');
    ok(comecou(c) === 0, 'e nao comecou com gente de menos');
  }

  console.log('\n22. gatilho 3: x min sem ninguem entrar nem sair');
  {
    const c = clientFake({ lab: LIDER() });
    const t = new ToolLab(c, { ...START, startSemEntrar: true, startSemEntrarMin: 5 });
    t.running = true;
    await t.step();
    ok(comecou(c) === 0, 'acabou de ver o lobby: espera');
    t.ultimaMudanca = Date.now() - 5 * 60000;
    await t.step();
    ok(comecou(c) === 1, '5 min parado, comeca');
  }

  console.log('\n23. gatilho 3 reinicia quando alguem entra');
  {
    const c = clientFake({ lab: LIDER() });
    const t = new ToolLab(c, { ...START, startSemEntrar: true, startSemEntrarMin: 5 });
    t.running = true;
    await t.step();
    t.ultimaMudanca = Date.now() - 4 * 60000;  // quase la
    c.state.lab = c.proximaResposta = LIDER({ fila: Array.from({ length: 15 }, () => ({})) });
    await t.step();                            // entrou mais um: zera
    ok(comecou(c) === 0, 'entrou alguem: nao comeca');
    ok(Date.now() - t.ultimaMudanca < 1000, 'o relogio de "parado" reiniciou');
  }

  console.log('\n24. os 3 juntos: vale o PRIMEIRO que bater');
  {
    const todos = { ...START, startLotado: true, startAposMinimo: true, startAposMinimoMin: 10, startSemEntrar: true, startSemEntrarMin: 5 };
    // Nenhum bateu ainda.
    const c = clientFake({ lab: LIDER() });
    const t = new ToolLab(c, todos);
    t.running = true;
    await t.step();
    ok(comecou(c) === 0, 'nenhum gatilho bateu: espera');
    // So o de "parado" bate.
    t.ultimaMudanca = Date.now() - 5 * 60000;
    await t.step();
    ok(comecou(c) === 1, 'o primeiro a bater ja comeca (nao espera os outros)');
  }

  console.log('\n25. start ligado mas sem gatilho nenhum nao comeca');
  {
    const c = clientFake({ lab: LIDER() });
    const t = new ToolLab(c, { ...START });   // autoStart sem gatilho
    t.running = true;
    let msg = '';
    t.log = (m) => { msg += m; };
    await t.step();
    ok(comecou(c) === 0, 'nao comeca as cegas');
    ok(/nenhum gatilho/.test(msg), 'o log explica que falta configurar gatilho');
  }

  console.log('\n26. as guardas do botao Comecar do jogo');
  {
    const casos = [
      ['falta gente (2 < min 3)', { fila: [{}, {}] }],
      ['corrida rodando', { run: { id: 1 } }],
      ['mapa nao instalado', { pronto: false }],
      ['nao esta no lobby', { noLobby: false }],
    ];
    for (const [nome, patch] of casos) {
      const c = clientFake({ lab: LIDER(patch) });
      const t = new ToolLab(c, { ...START, startLotado: true, startSemEntrar: true, startSemEntrarMin: 1 });
      t.running = true;
      t.ultimaMudanca = Date.now() - 60 * 60000;  // o gatilho ja bateu
      t.lobbyDesde = Date.now() - 60 * 60000;
      await t.step();
      ok(comecou(c) === 0, `${nome}: nao comeca`);
    }
  }

  console.log('\n27. dificuldade: so corrige quando esta diferente');
  {
    // Ja esta em pesadelo: nao remanda.
    const c = clientFake({ lab: LIDER({ dif: 'pesadelo' }) });
    const t = new ToolLab(c, { intervaloMin: 2, dificuldade: 'pesadelo' });
    t.running = true;
    await t.step();
    ok(mudouDif(c).length === 0, 'ja na dificuldade certa: nao manda nada');

    // Esta em normal e queremos pesadelo.
    const c2 = clientFake({ lab: LIDER({ dif: 'normal' }) });
    const t2 = new ToolLab(c2, { intervaloMin: 2, dificuldade: 'pesadelo' });
    t2.running = true;
    await t2.step();
    const m = mudouDif(c2);
    ok(m.length === 1, 'mandou lab.dificuldade uma vez');
    ok(m[0] && m[0].data && m[0].data.dif === 'pesadelo', `payload { dif: 'pesadelo' } (foi ${JSON.stringify(m[0] && m[0].data)})`);
  }

  console.log('\n28. dificuldade nao e trocada durante a corrida');
  {
    const c = clientFake({ lab: LIDER({ dif: 'normal', run: { id: 7 } }) });
    const t = new ToolLab(c, { intervaloMin: 2, dificuldade: 'pesadelo' });
    t.running = true;
    await t.step();
    ok(mudouDif(c).length === 0, 'o jogo trava os botoes na corrida: nos tambem');
  }

  console.log('\n29. dificuldade que nao existe no servidor e recusada');
  {
    const c = clientFake({ lab: LIDER({ dif: 'normal', cfg: { min: 3, max: 30, bauPorDia: 3, dificuldades: [{ id: 'normal' }, { id: 'dificil' }, { id: 'pesadelo' }] } }) });
    const t = new ToolLab(c, { intervaloMin: 2, dificuldade: 'impossivel' });
    t.running = true;
    let msg = '';
    t.log = (m) => { msg += m; };
    await t.step();
    ok(mudouDif(c).length === 0, 'nao manda id inventado');
    ok(/não existe/.test(msg), 'o log explica');
  }

  console.log('\n30. comeca na dificuldade certa, nao na velha');
  {
    // Queremos pesadelo, o lobby esta em normal e o gatilho ja bateu: a
    // ferramenta troca a dificuldade PRIMEIRO e so comeca depois.
    const c = clientFake({ lab: LIDER({ dif: 'normal', fila: Array.from({ length: 30 }, () => ({})) }) });
    const t = new ToolLab(c, { ...START, startLotado: true, dificuldade: 'pesadelo' });
    t.running = true;
    await t.step();
    ok(mudouDif(c).length === 1, 'trocou a dificuldade');
    ok(comecou(c) === 0, 'nao comecou no mesmo passo (espera o servidor aplicar)');
    // O servidor aplicou: agora sim.
    c.state.lab = c.proximaResposta = LIDER({ dif: 'pesadelo', fila: Array.from({ length: 30 }, () => ({})) });
    t.ultimaDif = Date.now() - 20000;
    await t.step();
    ok(comecou(c) === 1, 'com a dificuldade aplicada, comeca');
  }

  console.log('\n31. nao duplica o start nem entra em corrida alheia');
  {
    const c = clientFake({ lab: LIDER({ fila: Array.from({ length: 30 }, () => ({})) }) });
    const t = new ToolLab(c, { ...START, startLotado: true });
    t.running = true;
    await t.step();
    ok(comecou(c) === 1, 'comecou uma vez');
    await t.step();
    ok(comecou(c) === 1, 'o passo seguinte nao remanda lab.iniciar');

    // Outro gerente comecou durante o respiro: desistimos.
    const c2 = clientFake({ lab: LIDER({ fila: Array.from({ length: 30 }, () => ({})) }) });
    const t2 = new ToolLab(c2, { ...START, startLotado: true });
    t2.running = true;
    const real = t2.respirar.bind(t2);
    t2.respirar = async (ms) => { c2.state.lab = LIDER({ run: { id: 3 }, fila: Array.from({ length: 30 }, () => ({})) }); return real(ms); };
    await t2.step();
    ok(comecou(c2) === 0, 'alguem comecou antes: nao duplica a corrida');
  }

  console.log('\n32. mesmo com start ligado, nunca chama a guild nem sai');
  {
    const c = clientFake({ lab: LIDER({ fila: Array.from({ length: 30 }, () => ({})) }) });
    const t = new ToolLab(c, { ...START, startLotado: true, dificuldade: 'pesadelo' });
    t.running = true;
    await t.step();
    const proibidos = ['lab.sair', 'lab.voltar', 'lab.chamar'];
    const achou = c.enviados.filter((e) => proibidos.includes(e.type));
    ok(achou.length === 0, `nada de sair/chamar/voltar (${c.enviados.map((e) => e.type).join(', ')})`);
  }

  console.log('\n33. os baus esgotados tambem barram o start');
  {
    // Sem recompensa a corrida nao vale: nem entramos, nem comecamos.
    const c = clientFake({ lab: LIDER({ bauHoje: 3, fila: Array.from({ length: 30 }, () => ({})) }) });
    const t = new ToolLab(c, { ...START, startLotado: true });
    t.running = true;
    await t.step();
    ok(comecou(c) === 0, 'com 3/3 baus nao comeca a corrida');
  }

  console.log('\n34. "entrar mesmo sem bau" ligado: entra com 3/3');
  {
    const c = clientFake({ lab: { ...LAB_REAL(), bauHoje: 3 } });
    const t = new ToolLab(c, { ...cfg, entrarSemBau: true });
    t.running = true;
    await t.step();
    ok(entrou(c) === 1, 'com 3/3 e a opcao ligada, entra');

    // Acima do teto tambem.
    const c2 = clientFake({ lab: { ...LAB_REAL(), bauHoje: 9 } });
    const t2 = new ToolLab(c2, { ...cfg, entrarSemBau: true });
    t2.running = true;
    await t2.step();
    ok(entrou(c2) === 1, 'acima do teto tambem entra');
  }

  console.log('\n35. a opcao de entrar NAO libera o start sozinha');
  {
    // So 'entrarSemBau': a conta entra, mas comecar continua barrado. Sao
    // duas decisoes diferentes -- entrar custa uma vaga, comecar custa 25 min
    // da guild inteira.
    const c = clientFake({ lab: LIDER({ bauHoje: 3, fila: Array.from({ length: 30 }, () => ({})) }) });
    const t = new ToolLab(c, { ...START, startLotado: true, entrarSemBau: true });
    t.running = true;
    await t.step();
    ok(comecou(c) === 0, 'entrar sem bau nao implica comecar sem bau');
  }

  console.log('\n36. "comecar mesmo sem bau" ligado: comeca com 3/3');
  {
    const c = clientFake({ lab: LIDER({ bauHoje: 3, fila: Array.from({ length: 30 }, () => ({})) }) });
    const t = new ToolLab(c, { ...START, startLotado: true, entrarSemBau: true, startSemBau: true });
    t.running = true;
    await t.step();
    ok(comecou(c) === 1, 'com as duas opcoes ligadas, comeca');
  }

  console.log('\n37. as duas opcoes nao afrouxam nenhuma outra guarda');
  {
    const tudo = { ...START, startLotado: true, entrarSemBau: true, startSemBau: true };
    // Sem permissao continua sem comecar.
    const c = clientFake({ lab: LIDER({ bauHoje: 3, gerente: false, fila: Array.from({ length: 30 }, () => ({})) }) });
    const t = new ToolLab(c, tudo);
    t.running = true;
    await t.step();
    ok(comecou(c) === 0, 'sem ser gerente continua sem comecar');

    // Falta gente continua barrando.
    const c2 = clientFake({ lab: LIDER({ bauHoje: 3, fila: [{}, {}] }) });
    const t2 = new ToolLab(c2, tudo);
    t2.running = true;
    await t2.step();
    ok(comecou(c2) === 0, 'abaixo do minimo continua sem comecar');

    // Corrida rodando continua barrando a entrada.
    const c3 = clientFake({ lab: { ...LAB_REAL(), bauHoje: 3, run: { id: 2 } } });
    const t3 = new ToolLab(c3, { ...cfg, entrarSemBau: true });
    t3.running = true;
    await t3.step();
    ok(entrou(c3) === 0, 'corrida em andamento continua barrando a entrada');

    // Sem guild continua barrando.
    const c4 = clientFake({ lab: { ...LAB_REAL(), bauHoje: 3, guild: false } });
    const t4 = new ToolLab(c4, { ...cfg, entrarSemBau: true });
    t4.running = true;
    await t4.step();
    ok(entrou(c4) === 0, 'sem guild continua barrando');
  }

  console.log('\n38. desligadas, o comportamento de ontem continua igual');
  {
    const c = clientFake({ lab: { ...LAB_REAL(), bauHoje: 3 } });
    const t = new ToolLab(c, cfg);
    t.running = true;
    await t.step();
    ok(entrou(c) === 0, 'sem as opcoes, 3/3 ainda barra a entrada');

    const c2 = clientFake({ lab: LIDER({ bauHoje: 3, fila: Array.from({ length: 30 }, () => ({})) }) });
    const t2 = new ToolLab(c2, { ...START, startLotado: true });
    t2.running = true;
    await t2.step();
    ok(comecou(c2) === 0, 'sem as opcoes, 3/3 ainda barra o start');
  }

  console.log(falhas ? `\n=== FALHOU: ${falhas} caso(s) ===` : '\n=== PASS: a ferramenta de labirinto se comporta ===');
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
