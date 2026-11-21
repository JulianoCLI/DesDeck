#!/usr/bin/env node
/**
 * Prova que a ferramenta de hunt devolve a conta a hunt original SEMPRE que ela
 * aparece parada no Hospital/praca - nao "as vezes".
 *
 * Nao toca em conta nenhuma: o client e um dublê e sendCommand e um espiao. O
 * que esta sob teste e a decisao da ferramenta, entao o dublê so precisa do que
 * ela le (state, connected, on/removeListener) e emitir 'update'.
 *
 * O caso que importa e o 4: 'offline.cfg' sem resposta. Era ali que o caminho
 * antigo desistia e a conta passava o ciclo inteiro parada.
 *
 * Uso: node test-hunt-volta.js
 */
'use strict';

const { EventEmitter } = require('events');
const Module = require('module');

// catalogo.js usa net.request do Electron, que nao existe no node puro. A hunt
// so o usa para saber a ilha de cada area (excluir 'halloween'), o que nao tem
// peso nenhum nestes casos: devolvemos um catalogo vazio.
const realLoad = Module._load;
Module._load = function (req, parent, isMain) {
  if (req === './catalogo' || req === './src/headless/catalogo') {
    return { ilhaPorSlug: async () => ({}), precos: async () => ({}), tierOvo: async () => ({}), carregar: async () => ({}) };
  }
  return realLoad(req, parent, isMain);
};

const { ToolHunt } = require('./src/headless/tools');

let falhas = 0;
const ok = (cond, txt) => { console.log(`  ${cond ? 'ok  ' : 'FALHA'} ${txt}`); if (!cond) falhas++; };

class ClientDublê extends EventEmitter {
  constructor(state, { respondeCfg = true, conectado = true } = {}) {
    super();
    this.state = state;
    this.connected = conectado;
    this.respondeCfg = respondeCfg;
    this.enviados = [];
  }
  sendCommand(type, data) {
    this.enviados.push({ type, data });
    // O jogo responde 'offline.cfg' com a lista; o dublê imita isso para que a
    // espera da ferramenta termine.
    if (type === 'offline.cfg' && this.respondeCfg) {
      this.state.offCfg = { hunts: [{ slug: 'recomendada', nome: 'Recomendada', perigo: 0, xpH: 9999, bitsH: 9999 }] };
    }
    return true;
  }
  mudarEstado(patch) {
    Object.assign(this.state, patch);
    this.emit('update');
  }
  get selects() { return this.enviados.filter((e) => e.type === 'hunt.select').map((e) => e.data.slug); }
}

const estado = (over = {}) => ({
  local: 'hunt', huntSlug: 'floresta-1', ativoId: 7, travaSaidaAte: null,
  bits: 0, itens: {}, ovos: [], offCfg: null, nivel: 10, ...over,
});

// A ferramenta espera catalogos antes de agir (pronto). Evitamos o start() real
// para nao depender de timers: preparamos e chamamos o passo a mao.
async function armar(client, cfg = {}) {
  const t = new ToolHunt(client, { intervaloMin: 5, soTranquilas: true, ganhoMin: 0, ...cfg });
  t.running = true;
  t.aoEstado = () => t.lembrarHunt(client.state);
  client.on('update', t.aoEstado);
  t.lembrarHunt(client.state);
  await t.preparar();
  t.pronto = true;
  return t;
}

async function main() {
  console.log('=== VOLTA PARA A HUNT ORIGINAL ===\n');

  // 1. O caso do usuario, inteiro: cacando -> Labirinto -> Hospital.
  console.log('1. cacando em floresta-1, entra no Labirinto, sai no Hospital');
  {
    const c = new ClientDublê(estado());
    const t = await armar(c);
    c.mudarEstado({ local: 'lab' });          // entrou no Labirinto
    await t.step();
    ok(c.selects.length === 0, 'no Labirinto nao manda nada');
    c.mudarEstado({ local: 'praca' });        // saiu: o jogo joga no Hospital
    await t.step();
    ok(c.selects[0] === 'floresta-1', `voltou para floresta-1 (foi: ${c.selects[0]})`);
  }

  // 2. O Labirinto comeca E acaba entre dois passos. Com o intervalo de 5 min
  //    este e o caso comum, e e o que exige o gancho no 'estado' em vez de so
  //    olhar o estado no passo.
  console.log('\n2. a corrida inteira acontece entre dois passos');
  {
    const c = new ClientDublê(estado({ huntSlug: 'deserto-3' }));
    const t = await armar(c);
    c.mudarEstado({ local: 'lab', huntSlug: 'deserto-3' });
    c.mudarEstado({ local: 'praca', huntSlug: 'deserto-3' });
    await t.step();                            // o primeiro passo ja ve a praca
    ok(c.selects[0] === 'deserto-3', `voltou para deserto-3 (foi: ${c.selects[0]})`);
  }

  // 3. O servidor zera huntSlug ao mandar para o Hospital. A memoria propria da
  //    ferramenta e a unica fonte que sobra.
  console.log('\n3. o servidor esquece huntSlug na praca');
  {
    const c = new ClientDublê(estado({ huntSlug: 'vulcao-9' }));
    const t = await armar(c);
    c.mudarEstado({ local: 'praca', huntSlug: null });
    await t.step();
    ok(c.selects[0] === 'vulcao-9', `voltou para vulcao-9 (foi: ${c.selects[0]})`);
  }

  // 4. O CASO QUE QUEBRAVA. 'offline.cfg' nao responde: o caminho antigo
  //    desistia aqui e a conta ficava parada.
  console.log("\n4. 'offline.cfg' nao responde (servidor ocupado/religacao)");
  {
    const c = new ClientDublê(estado({ huntSlug: 'praia-2' }), { respondeCfg: false });
    const t = await armar(c);
    c.mudarEstado({ local: 'praca' });
    const t0 = Date.now();
    await t.step();
    ok(c.selects[0] === 'praia-2', `voltou mesmo sem a lista (foi: ${c.selects[0]})`);
    // O caminho antigo gastava os 5s da espera por 'offline.cfg' e desistia. O
    // novo so paga o respiro do disfarce (ate 4s), que e outra coisa: ele sempre
    // termina em comando.
    const d = Date.now() - t0;
    ok(d < 4500, `nao esperou os 5s da lista; so o respiro do disfarce (${d}ms)`);
  }

  // 5. A ferramenta sobe com a conta JA na praca (app reaberto): nunca viu a
  //    hunt acontecer, mas o jogo ainda guarda a ultima em huntSlug.
  console.log('\n5. ferramenta sobe com a conta ja no Hospital');
  {
    const c = new ClientDublê(estado({ local: 'praca', huntSlug: 'ruinas-4' }));
    const t = await armar(c);
    await t.step();
    ok(c.selects[0] === 'ruinas-4', `usou o huntSlug do jogo (foi: ${c.selects[0]})`);
  }

  // 6. Conta nova, nunca cacou: nao ha para onde voltar. Deixar parada seria o
  //    pior resultado, entao vale a recomendada.
  console.log('\n6. conta nova, sem hunt anterior');
  {
    const c = new ClientDublê(estado({ local: 'praca', huntSlug: null }));
    const t = await armar(c);
    await t.step();
    ok(c.selects[0] === 'recomendada', `caiu na recomendada (foi: ${c.selects[0]})`);
  }

  // 7. As guardas que ja existiam nao podem ter sido afrouxadas pela mudanca.
  console.log('\n7. as guardas continuam valendo');
  {
    const c = new ClientDublê(estado({ local: 'praca', travaSaidaAte: Date.now() + 600000 }));
    const t = await armar(c);
    await t.step();
    ok(c.selects.length === 0, 'trava de saida do servidor barra o retorno');
  }
  {
    const c = new ClientDublê(estado({ local: 'praca', ativoId: null }));
    const t = await armar(c);
    await t.step();
    ok(c.selects.length === 0, 'sem Digimon em campo nao manda nada');
  }
  {
    const c = new ClientDublê(estado({ local: 'praca' }));
    const t = await armar(c);
    t.config.__off = true;
    await t.step();
    ok(c.selects.length === 0, 'desligada na UI nao manda nada');
  }
  {
    const c = new ClientDublê(estado({ local: 'praca' }), { conectado: false });
    const t = await armar(c);
    await t.step();
    ok(c.enviados.length === 0, 'sem socket nada e enviado');
  }

  // 8. Quem prefere a recomendada pode desligar a volta.
  console.log('\n8. voltarUltima: false mantem o comportamento antigo');
  {
    const c = new ClientDublê(estado({ local: 'praca', huntSlug: 'floresta-1' }));
    const t = await armar(c, { voltarUltima: false });
    await t.step();
    ok(c.selects[0] === 'recomendada', `foi para a recomendada (foi: ${c.selects[0]})`);
  }

  // 9. Cacando normalmente a ferramenta segue otimizando: a volta nao sequestra
  //    o comportamento principal.
  console.log('\n9. cacando, segue trocando para a recomendada');
  {
    const c = new ClientDublê(estado({ local: 'hunt', huntSlug: 'floresta-1' }));
    const t = await armar(c);
    await t.step();
    ok(c.selects[0] === 'recomendada', `trocou para a recomendada (foi: ${c.selects[0]})`);
  }

  // 10. SEMPRE, nao as vezes: 25 idas ao Hospital, de hunts diferentes.
  console.log('\n10. 25 ciclos Labirinto -> Hospital, sem uma falha');
  {
    const c = new ClientDublê(estado());
    const t = await armar(c);
    const esperados = [];
    for (let i = 1; i <= 25; i++) {
      const slug = `area-${i}`;
      c.mudarEstado({ local: 'hunt', huntSlug: slug });
      c.mudarEstado({ local: 'lab' });
      c.mudarEstado({ local: 'praca', huntSlug: null });
      await t.step();
      esperados.push(slug);
      t.ultimaTroca = 0; // o respiro de 60s e de outro cenario; aqui ja se passou
    }
    const iguais = JSON.stringify(c.selects) === JSON.stringify(esperados);
    ok(iguais, iguais ? '25 de 25 voltaram para a hunt certa' : `divergiu: ${JSON.stringify(c.selects)}`);
  }

  // 11. O gancho do 'estado' nao pode vazar: religar ferramenta e rotina.
  console.log('\n11. parar remove o ouvinte (sem vazamento ao religar)');
  {
    const c = new ClientDublê(estado());
    const t = await armar(c);
    const antes = c.listenerCount('update');
    t.stop();
    ok(c.listenerCount('update') === antes - 1, `ouvinte removido (${antes} -> ${c.listenerCount('update')})`);
  }

  console.log(falhas ? `\n=== FALHOU: ${falhas} caso(s) ===` : '\n=== PASS: a volta acontece sempre ===');
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
