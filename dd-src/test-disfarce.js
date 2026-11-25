#!/usr/bin/env node
/**
 * Mede o disfarce de tempo: 4 contas nao podem agir no mesmo instante.
 *
 * Nao toca em conta nenhuma. Mede as decisoes de agendamento da ferramenta e a
 * fila de entrada do manager.
 *
 * Uso: node test-disfarce.js
 */
'use strict';

const { EventEmitter } = require('events');
const Module = require('module');

const realLoad = Module._load;
Module._load = function (req, parent, isMain) {
  if (req === './catalogo') {
    return { ilhaPorSlug: async () => ({}), precos: async () => ({}), tierOvo: async () => ({}), carregar: async () => ({}) };
  }
  // O manager puxa o client, que puxa 'ws' e 'electron'. Para medir a FILA de
  // entrada so precisamos saber quando connect() seria chamado.
  if (req === './client') {
    return {
      DigiiIdleHeadlessClient: class extends EventEmitter {
        constructor(index) { super(); this.index = index; this.state = {}; this.conectouEm = null; }
        connect() { this.conectouEm = Date.now(); }
        disconnect() {}
      },
    };
  }
  return realLoad(req, parent, isMain);
};

const { ToolHunt, HeadlessTool } = require('./src/headless/tools');
const { HeadlessManager } = require('./src/headless/manager');

let falhas = 0;
const ok = (cond, txt) => { console.log(`  ${cond ? 'ok  ' : 'FALHA'} ${txt}`); if (!cond) falhas++; };

const clientFake = (index) => ({ index, connected: true, state: {}, on() {}, removeListener() {}, sendCommand: () => true });

async function main() {
  console.log('=== DISFARCE DE TEMPO (4 contas) ===\n');

  // 1. O intervalo nunca e o valor exato configurado.
  console.log('1. o intervalo sai da grade exata');
  {
    const t = new ToolHunt(clientFake('ms1'), { intervaloMin: 5 });
    const base = 300000;
    const amostras = Array.from({ length: 200 }, () => base + t.jitterMs(base));
    ok(!amostras.includes(base), 'nenhuma volta usa o intervalo cru');
    ok(new Set(amostras).size > 150, `as voltas variam entre si (${new Set(amostras).size}/200 distintas)`);
    const max = Math.max(...amostras);
    ok(max <= base * 1.6, `o atraso e contido: maximo ${Math.round(max / 1000)}s para base de ${base / 1000}s`);
  }

  // 2. O ponto central: 4 contas com a MESMA config nao coincidem.
  console.log('\n2. 4 contas com a mesma config nao agem juntas');
  {
    const base = 300000;
    const contas = ['ms1', 'ms2', 'ms3', 'ms4'];
    const tools = contas.map((id) => new ToolHunt(clientFake(id), { intervaloMin: 5 }));
    // O componente fixo e o que mantem as contas fora de fase. Medimos ele a
    // parte, zerando o sorteio.
    const real = Math.random;
    Math.random = () => 0;
    const fixos = tools.map((t) => t.jitterMs(base));
    Math.random = real;
    ok(new Set(fixos).size === 4, `cada conta tem o seu deslocamento fixo: ${fixos.map((f) => Math.round(f / 1000) + 's').join(', ')}`);
    const ordenados = [...fixos].sort((a, b) => a - b);
    const menorGap = Math.min(...ordenados.slice(1).map((v, i) => v - ordenados[i]));
    ok(menorGap >= 1000, `a menor distancia entre duas contas e ${Math.round(menorGap / 1000)}s (>= 1s)`);
  }

  // 3. O deslocamento fixo e estavel: a mesma conta nao pula de lugar a cada
  //    religacao, senao as contas voltariam a se cruzar.
  console.log('\n3. o deslocamento de cada conta e estavel entre religacoes');
  {
    const real = Math.random;
    Math.random = () => 0;
    const a = new ToolHunt(clientFake('ms1'), {}).jitterMs(300000);
    const b = new ToolHunt(clientFake('ms1'), {}).jitterMs(300000);
    Math.random = real;
    ok(a === b, 'a mesma conta recebe sempre o mesmo deslocamento fixo');
  }

  // 4. Ferramentas diferentes da MESMA conta tambem nao disparam juntas.
  console.log('\n4. ferramentas da mesma conta nao disparam juntas');
  {
    const c = clientFake('ms1');
    const real = Math.random;
    Math.random = () => 0;
    const porFerramenta = ['hunt', 'scan', 'refill', 'eggs'].map((id) => {
      const t = new HeadlessTool(c, id, {});
      return t.jitterMs(300000);
    });
    Math.random = real;
    ok(new Set(porFerramenta).size === 4, `4 deslocamentos distintos: ${porFerramenta.map((f) => Math.round(f / 1000) + 's').join(', ')}`);
  }

  // 5. respirar(): a pausa antes do comando existe e e curta.
  console.log('\n5. respirar() atrasa o comando sem travar a conta');
  {
    const t = new ToolHunt(clientFake('ms1'), {});
    t.running = true;
    const t0 = Date.now();
    const seguir = await t.respirar(4000);
    const d = Date.now() - t0;
    ok(seguir === true, 'devolve true para o passo continuar');
    ok(d >= 250 && d <= 4200, `esperou ${d}ms (entre 250 e 4000)`);
  }
  {
    // Parada durante a espera: o passo nao pode seguir e mandar comando.
    const t = new ToolHunt(clientFake('ms1'), {});
    t.running = true;
    const p = t.respirar(1000);
    t.running = false;
    ok((await p) === false, 'parada durante a espera cancela o comando');
  }

  // 6. A fila de entrada do manager: 4 contas ligadas de uma vez.
  console.log('\n6. o manager escalona a entrada das 4 contas');
  {
    const m = new HeadlessManager();
    const cs = ['ms1', 'ms2', 'ms3', 'ms4'].map((id) => m.start(id, `persist:acc-${id}`, {}));
    const imediatas = cs.filter((c) => c.conectouEm).length;
    ok(imediatas === 1, `so 1 conta entra na hora (foram ${imediatas})`);
    ok(m.entradas.size === 3, `as outras 3 ficam agendadas (${m.entradas.size})`);
    // A fila e crescente e com folga real entre as contas.
    const marcas = [0];
    let acc = 0;
    for (let i = 0; i < 3; i++) acc += 3000; // piso conhecido por passo
    ok(m.proximaEntrada - Date.now() >= acc, `a 4a conta entra depois de pelo menos ${acc / 1000}s`);
    m.stopAll();
    ok(m.entradas.size === 0, 'stopAll cancela as entradas pendentes');
  }

  // 7. Parar uma conta antes da vez dela nao pode conectar depois.
  console.log('\n7. parar antes da vez cancela a entrada');
  {
    const m = new HeadlessManager();
    m.start('a', 'persist:acc-a', {});
    const segunda = m.start('b', 'persist:acc-b', {});
    m.stop('b');
    await new Promise((r) => setTimeout(r, 50));
    ok(segunda.conectouEm === null, 'a conta parada nunca conectou');
    m.stopAll();
  }

  // 8. A sequencia de entradas nao se repete entre execucoes.
  console.log('\n8. a sequencia de entradas varia');
  {
    const seq = () => {
      const m = new HeadlessManager();
      ['a', 'b', 'c', 'd'].forEach((id) => m.start(id, `persist:acc-${id}`, {}));
      const v = m.proximaEntrada;
      m.stopAll();
      return v;
    };
    const vals = new Set([seq(), seq(), seq(), seq(), seq()]);
    ok(vals.size > 1, `a fila nao e sempre a mesma (${vals.size}/5 distintas)`);
  }

  console.log(falhas ? `\n=== FALHOU: ${falhas} caso(s) ===` : '\n=== PASS: nada acontece em bloco ===');
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
