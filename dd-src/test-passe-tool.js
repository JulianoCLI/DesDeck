#!/usr/bin/env node
/**
 * Prova a ferramenta de Passe (ToolPasse) offline, usando como molde o
 * estado.passe REAL capturado em 4 contas (test-passe-estado.js).
 *
 * Nao toca em conta nenhuma: o client e falso e sendCommand so registra.
 *
 * Uso: node test-passe-tool.js
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

const { ToolPasse } = require('./src/headless/tools');

let falhas = 0;
const ok = (c, t) => { console.log(`  ${c ? 'ok  ' : 'FALHA'} ${t}`); if (!c) falhas++; };

// O estado.passe real da conta ms3, com 'pode' aberto (no dia em que ainda
// nao resgatou). As contas observadas tinham pode:false, dia 5-6, nivel 10.
const PASSE_REAL = (over = {}) => ({
  dia: 5,
  feitos: 4,
  nivel: 10,
  pode: true,
  premium: false,
  premiumAte: 0,
  premiumMask: 0,
  premiumPend: null,
  ultimo: '2026-11-20',
  ...over,
});

function clientFake({ passe = PASSE_REAL(), nivel = 106, local = 'hunt' } = {}) {
  const c = new EventEmitter();
  c.index = 'ms3';
  c.connected = true;
  c.state = { local, nivel, passe };
  c.enviados = [];
  c.sendCommand = (type, data) => { c.enviados.push({ type, data }); return true; };
  return c;
}

const cfg = { intervaloMin: 10, premiumAtrasado: true };
const conta = (c, t) => c.enviados.filter((e) => e.type === t).length;

async function main() {
  console.log('=== FERRAMENTA DE PASSE ===\n');

  console.log('1. o caso bom: pode resgatar -> resgata uma vez');
  {
    const c = clientFake();
    const t = new ToolPasse(c, cfg);
    t.running = true;
    await t.step();
    ok(conta(c, 'passe.resgatar') === 1, `mandou passe.resgatar uma vez (foi ${conta(c, 'passe.resgatar')})`);
    ok(c.enviados[0].data === undefined || typeof c.enviados[0].data === 'object', 'sem argumentos estranhos');
  }

  console.log('\n2. ja resgatou hoje (pode:false) -> nao manda nada');
  {
    const c = clientFake({ passe: PASSE_REAL({ pode: false }) });
    const t = new ToolPasse(c, cfg);
    t.running = true;
    await t.step();
    await t.step();
    ok(c.enviados.length === 0, 'nada enviado, nem repetido');
  }

  console.log('\n3. abaixo do nivel minimo -> nao tenta');
  {
    const c = clientFake({ nivel: 5, passe: PASSE_REAL({ nivel: 10 }) });
    const t = new ToolPasse(c, cfg);
    t.running = true;
    await t.step();
    ok(c.enviados.length === 0, 'nivel 5 < 10: nada enviado');
    const t2 = new ToolPasse(clientFake({ nivel: 10 }), cfg);
    t2.running = true;
    ok(t2.motivoParaNaoResgatar(PASSE_REAL(), { nivel: 10 }) === null, 'exatamente no nivel minimo: libera');
  }

  console.log('\n4. o passe ainda nao chegou no estado -> espera');
  {
    const c = clientFake({ passe: null });
    const t = new ToolPasse(c, cfg);
    t.running = true;
    await t.step();
    ok(c.enviados.length === 0, 'sem passe no estado, nao age as cegas');
  }

  console.log('\n5. Premium atrasado: so resgata se a conta TEM Premium');
  {
    // Sem Premium, premiumPend nem deveria vir - mas se vier, ignoramos.
    const semPrem = clientFake({ passe: PASSE_REAL({ premium: false, premiumPend: [1, 2, 3] }) });
    const t1 = new ToolPasse(semPrem, cfg);
    t1.running = true;
    await t1.step();
    ok(conta(semPrem, 'passe.premium') === 0, 'sem Premium: NAO manda passe.premium');
    ok(conta(semPrem, 'passe.resgatar') === 1, 'mas o resgate normal acontece');

    const comPrem = clientFake({ passe: PASSE_REAL({ premium: true, premiumPend: [2, 3] }) });
    const t2 = new ToolPasse(comPrem, cfg);
    t2.running = true;
    await t2.step();
    ok(conta(comPrem, 'passe.resgatar') === 1, 'com Premium: resgata o dia');
    ok(conta(comPrem, 'passe.premium') === 1, 'com Premium: resgata o atrasado tambem');
  }

  console.log('\n6. Premium atrasado sem resgate do dia (pode:false)');
  {
    const c = clientFake({ passe: PASSE_REAL({ pode: false, premium: true, premiumPend: [4] }) });
    const t = new ToolPasse(c, cfg);
    t.running = true;
    await t.step();
    ok(conta(c, 'passe.resgatar') === 0, 'nao resgata o dia (ja pego)');
    ok(conta(c, 'passe.premium') === 1, 'mas pega o Premium atrasado');
  }

  console.log('\n7. Premium ligado mas lista vazia -> nao manda');
  {
    for (const pend of [null, [], undefined]) {
      const c = clientFake({ passe: PASSE_REAL({ premium: true, premiumPend: pend }) });
      const t = new ToolPasse(c, cfg);
      t.running = true;
      await t.step();
      ok(conta(c, 'passe.premium') === 0, `premiumPend=${JSON.stringify(pend)}: nada enviado`);
    }
  }

  console.log('\n8. a opcao da UI desliga o Premium atrasado');
  {
    const c = clientFake({ passe: PASSE_REAL({ premium: true, premiumPend: [1, 2] }) });
    const t = new ToolPasse(c, { intervaloMin: 10, premiumAtrasado: false });
    t.running = true;
    await t.step();
    ok(conta(c, 'passe.premium') === 0, 'desmarcado na UI: nao manda passe.premium');
    ok(conta(c, 'passe.resgatar') === 1, 'o resgate normal continua');
  }

  console.log('\n9. desligada na UI / sem socket');
  {
    const c = clientFake();
    const t = new ToolPasse(c, { ...cfg, __off: true });
    t.running = true;
    await t.step();
    ok(c.enviados.length === 0, 'desligada: nada enviado');
  }
  {
    const c = clientFake();
    c.connected = false;
    c.sendCommand = () => false;
    const t = new ToolPasse(c, cfg);
    t.running = true;
    await t.step();
    ok(conta(c, 'passe.resgatar') === 0, 'sem socket: nada enviado');
  }

  console.log('\n10. nao reenvia logo depois de resgatar');
  {
    const c = clientFake();
    const t = new ToolPasse(c, cfg);
    t.running = true;
    await t.step();
    const n = conta(c, 'passe.resgatar');
    // O 'estado' ainda nao trouxe pode:false; o passo seguinte nao pode duplicar.
    await t.step();
    ok(conta(c, 'passe.resgatar') === n, `segundo passo nao duplicou (${n} total)`);
  }

  console.log('\n11. o dia vira durante o respiro -> desiste');
  {
    const c = clientFake();
    const t = new ToolPasse(c, cfg);
    t.running = true;
    const real = t.respirar.bind(t);
    t.respirar = async (ms) => {
      // Outra sessao resgatou enquanto esperavamos.
      c.state.passe = PASSE_REAL({ pode: false });
      return real(ms);
    };
    await t.step();
    ok(conta(c, 'passe.resgatar') === 0, 'releu o estado depois do respiro e desistiu');
  }

  console.log('\n12. o intervalo respeita o piso e o disfarce');
  {
    const t0 = new ToolPasse(clientFake(), { intervaloMin: 0 });
    ok(t0.getInterval() === 600000, `sem valor usa o default de 10 min (${t0.getInterval()}ms)`);
    const t1 = new ToolPasse(clientFake(), { intervaloMin: 0.1 });
    ok(t1.getInterval() === 60000, `piso de 1 min respeitado (${t1.getInterval()}ms)`);
    const t2 = new ToolPasse(clientFake(), { intervaloMin: 10 });
    ok(t2.getInterval() === 600000, '10 min = 600000ms');
    ok(t2.jitterMs(600000) > 0, 'tem jitter: as contas nao resgatam no mesmo segundo');
  }

  console.log('\n13. NUNCA compra o Premium');
  {
    const c = clientFake({ passe: PASSE_REAL({ premium: true, premiumPend: [1] }) });
    const t = new ToolPasse(c, cfg);
    t.running = true;
    await t.step();
    const gastou = c.enviados.filter((e) => e.type === 'shop.comprar' || /comprar/.test(e.type));
    ok(gastou.length === 0, `nenhum comando de compra (${c.enviados.map((e) => e.type).join(', ')})`);
  }

  console.log(falhas ? `\n=== FALHOU: ${falhas} caso(s) ===` : '\n=== PASS: a ferramenta de passe se comporta ===');
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
