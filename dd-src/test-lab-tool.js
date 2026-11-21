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
  cfg: { min: 3, max: 30 },
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

  console.log(falhas ? `\n=== FALHOU: ${falhas} caso(s) ===` : '\n=== PASS: a ferramenta de labirinto se comporta ===');
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
