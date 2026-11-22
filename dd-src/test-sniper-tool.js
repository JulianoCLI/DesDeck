#!/usr/bin/env node
/**
 * Testa a ferramenta Sniper sem tocar em conta nenhuma.
 *
 * `node --check tools.js` nao basta: o codigo da ferramenta vive DENTRO de uma
 * template string, entao um erro de sintaxe ali passa pelo --check e so aparece
 * quando a ferramenta e injetada numa conta real — tarde demais.
 *
 * Aqui o codigo gerado e compilado de verdade (new Function) e depois RODADO
 * contra um mercado de mentira, com um socket de mentira. Nada sai para a rede:
 * o 'enviar' e interceptado e cada comando fica registrado, o que deixa provar
 * as coisas que de outro jeito custariam dinheiro:
 *
 *   - alvo com teto 0 nao compra nada;
 *   - anuncio acima do teto nao e comprado;
 *   - anuncio retido NAO e comprado na hora: ele espera o libera;
 *   - o anuncio que some durante a espera nao gera compra;
 *   - o anuncio que SOBE de preco durante a espera nao gera compra;
 *   - a reserva e o limite por hora seguram a compra;
 *   - o proprio anuncio (meu) e ignorado;
 *   - a moeda errada e ignorada.
 *
 * Uso: node test-sniper-tool.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SAIDA = path.join(__dirname, 'sniper-tool.txt');
const out = [];
const log = (...a) => { const t = a.join(' '); out.push(t); console.log(t); try { fs.writeFileSync(SAIDA, out.join('\n') + '\n'); } catch {} };

let falhas = 0;
const ok = (cond, txt) => { log(`  ${cond ? 'OK  ' : 'FALHA'} ${txt}`); if (!cond) falhas++; };

// Carrega o catalogo como o renderer faria (sem Node, publicando em window).
const codigo = fs.readFileSync(path.join(__dirname, 'src/renderer/tools.js'), 'utf8');
const win = {};
new Function('window', codigo)(win);
const DDTools = win.DDTools;
const tool = DDTools.TOOLS.find((t) => t.id === 'sniper');

log('=== 1. A FERRAMENTA EXISTE E COMPILA ===');
ok(!!tool, 'o catalogo tem a ferramenta "sniper"');
const cfgPadrao = tool.defaults();
const src = tool.code(cfgPadrao);
ok(typeof src === 'string' && src.length > 500, `code() gerou ${src.length} caracteres`);
// A prova real: compilar o que vai ser injetado.
try { new Function(src); ok(true, 'o codigo gerado COMPILA (new Function)'); }
catch (e) { ok(false, 'o codigo gerado NAO compila: ' + e.message); }

log('\n=== 2. PADRAO DE FABRICA E SEGURO ===');
ok((cfgPadrao.alvos || []).every((a) => !a.tetoPreco), 'todo alvo de fabrica tem teto 0 (nao compra nada)');
ok(cfgPadrao.maxPorHora > 0, `vem com limite de ${cfgPadrao.maxPorHora} compras/hora`);
ok(tool.padraoLigado !== true, 'NAO vem ligada de fabrica');
ok(/sem alvo com teto/.test(tool.summary(cfgPadrao)), 'o resumo avisa que nao compra nada');

// ---------------------------------------------------------------- o laboratorio
// Um mercado de mentira. 'mercado.listar' responde com os anuncios que o teste
// montou; 'mercado.comprar' so e anotado.
function laboratorio(anuncios, estado, cfg) {
  const enviados = [];
  const ouvintes = [];
  // O relogio do servidor de mentira tem de ANDAR. Na primeira versao ele era um
  // Date.now() congelado no comeco do teste, e isso quebrava a fila de um jeito
  // instrutivo: a ferramenta calcula o desvio como (nosso agora - agora do
  // servidor) e decide tudo no tempo do servidor. Com o servidor parado, o desvio
  // crescia junto com o teste, o "agora do servidor" ficava eternamente no
  // instante inicial e nenhum 'libera' chegava nunca. O defeito era do mock, nao
  // da ferramenta — mas sem andar, este teste nao prova fila nenhuma.
  const t0 = Date.now();
  let empurrao = 0;
  const agoraServidorFake = () => Date.now() - t0 + t0 + empurrao;

  const sock = {
    readyState: 1,
    url: 'wss://x/ws',
    addEventListener: (ev, fn) => { if (ev === 'message') ouvintes.push(fn); },
    send: () => {},
  };
  const responder = (m) => { for (const fn of ouvintes) fn({ data: JSON.stringify(m) }); };

  const G = {
    sock, estado, ovos: null, campo: null, pronto: true,
    espera: [], aoMorrer: [], aoEstado: [], aoLabMudou: [], cfg: {},
    aplicar(id, novo) { this.cfg[id] = novo; return false; },
    desligar(id) { if (this.cfg[id]) this.cfg[id].__off = true; },
    quando(fn) { fn(); },
    log: () => {},
    jitter: () => 0,
    semente: () => 0.5,
    respirar: () => Promise.resolve(),
    enviar(t, dados) {
      enviados.push({ t, ...dados });
      if (t === 'mercado.listar') {
        // O servidor aplica os filtros. Reproduzimos o essencial para o teste.
        const f = dados;
        let L = anuncios.filter((a) => (a.tipo === f.tipo || f.tipo === 'tudo'));
        if (f.moeda) L = L.filter((a) => a.moeda === f.moeda);
        if (f.precoMax) L = L.filter((a) => a.preco <= f.precoMax);
        if (f.potencias) { const s = new Set(f.potencias.split(',').map(Number)); L = L.filter((a) => s.has(a.resumo?.potencia)); }
        if (f.maisMin) L = L.filter((a) => (a.resumo?.data || 0) >= f.maisMin);
        if (f.especie) L = L.filter((a) => a.resumo?.especie === f.especie);
        setTimeout(() => responder({ t: 'mercado', lista: L, total: L.length, agora: agoraServidorFake(), pagina: 0 }), 5);
      }
      return true;
    },
  };
  // A ferramenta roda no escopo global da pagina, com `G` ja definido.
  const corpo = tool.code(cfg).replace(/^\(\(\) => \{\n/, '').replace(/\n\}\)\(\);$/, '');
  new Function('G', 'window', corpo)(G, { __ddGame: G });
  return { enviados, responder, G, empurrar: (ms) => { empurrao += ms; } };
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const compras = (lab) => lab.enviados.filter((e) => e.t === 'mercado.comprar');

// A ferramenta estreia com 15 s + jitter de atraso (o disfarce: varias contas
// sobem juntas e nao devem varrer no mesmo segundo). Esperar isso em teste seria
// absurdo, e esperar MENOS daria falso "nao comprou" — foi o que aconteceu na
// primeira rodada: metade dos testes passava porque a ferramenta nem tinha
// comecado. O caminho honesto e provocar uma varredura de verdade pelo push
// 'mercado.mudou', que e o mesmo gatilho que o servidor usa, e esperar o atraso
// aleatorio dele (400-1200 ms) antes de conferir.
const KICK_MS = 1800;
const varrerAgora = async (lab) => { lab.responder({ t: 'mercado.mudou' }); await espera(KICK_MS); };

const anuncio = (over = {}) => ({
  id: 1, tipo: 'ovo', moeda: 'bits', preco: 1000, qtd: 1, meu: false,
  criado: Date.now() - 200000, libera: Date.now() - 80000, estado: 'aberto',
  resumo: { especie: 'lopmon', potencia: 4, data: 0 }, ...over,
});
const ESTADO = { t: 'estado', bits: 1000000, gemas: 1000, nick: 'teste', contaId: 'c1' };
const ALVO = (over = {}) => ({ nome: 'teste', tipo: 'ovo', moeda: 'bits', tetoPreco: 5000, tiers: [], potencias: [], energiaMin: 0, especie: '', soShiny: false, ...over });
const CFG = (over = {}) => ({ alvos: [ALVO()], intervaloSec: 20, reservaBits: 0, reservaGemas: 0, maxPorHora: 0, soLiberados: false, ...over });

(async () => {
  log('\n=== 3. COMPRA O QUE DEVE ===');
  {
    const lab = laboratorio([anuncio({ id: 10, preco: 1000 })], ESTADO, CFG());
    await varrerAgora(lab);
    const c = compras(lab);
    ok(c.length === 1, `comprou 1 anuncio liberado e abaixo do teto (comprou ${c.length})`);
    ok(c[0] && c[0].id === 10 && c[0].preco === 1000 && c[0].moeda === 'bits' && c[0].qtd === 1,
      'o comando levou { id, qtd, preco, moeda } como o jogo manda: ' + JSON.stringify(c[0]));
  }

  log('\n=== 4. NAO COMPRA O QUE NAO DEVE ===');
  const naoDeve = [
    ['acima do teto', [anuncio({ id: 12, preco: 9999 })], CFG({ alvos: [ALVO({ tetoPreco: 5000 })] })],
    ['o meu proprio anuncio', [anuncio({ id: 13, meu: true })], CFG()],
    ['anuncio ja vendido/retirado', [anuncio({ id: 14, estado: 'vendido' })], CFG()],
    ['moeda diferente da do alvo', [anuncio({ id: 15, moeda: 'gemas' })], CFG({ alvos: [ALVO({ moeda: 'bits' })] })],
    ['a reserva nao deixa', [anuncio({ id: 16, preco: 1000 })], CFG({ reservaBits: 999999 })],
    ['potencia fora do filtro', [anuncio({ id: 17, resumo: { especie: 'lopmon', potencia: 1, data: 0 } })], CFG({ alvos: [ALVO({ potencias: [4, 5] })] })],
    ['energia (+N) abaixo do minimo', [anuncio({ id: 18, resumo: { especie: 'lopmon', potencia: 4, data: 0 } })], CFG({ alvos: [ALVO({ energiaMin: 4 })] })],
    ['especie diferente', [anuncio({ id: 19, resumo: { especie: 'patamon', potencia: 4, data: 0 } })], CFG({ alvos: [ALVO({ especie: 'agumon' })] })],
  ];
  // Cada caso aqui precisa de uma varredura DE VERDADE: sem ela, o "nao comprou"
  // seria so a ferramenta ainda nao ter acordado — um teste que passa sozinho.
  // Por isso o controle logo abaixo, que falha de proposito se nada varrer.
  for (const [nome, anus, cfg] of naoDeve) {
    const lab = laboratorio(anus, ESTADO, cfg);
    await varrerAgora(lab);
    const varreu = lab.enviados.some((e) => e.t === 'mercado.listar');
    ok(compras(lab).length === 0 && varreu, `nao comprou: ${nome}${varreu ? '' : ' (ATENCAO: nem varreu)'}`);
  }

  // Teto 0 e um caso a parte, e de proposito: o alvo e descartado ANTES de
  // qualquer pedido, entao a ferramenta nem fala com o mercado. E a garantia de
  // que ligar a ferramenta recem-configurada nao gasta nada — nem trafego.
  {
    const lab = laboratorio([anuncio({ id: 11, preco: 1 })], ESTADO, CFG({ alvos: [ALVO({ tetoPreco: 0 })] }));
    await varrerAgora(lab);
    ok(compras(lab).length === 0, 'nao comprou: alvo com teto 0');
    ok(!lab.enviados.some((e) => e.t === 'mercado.listar'), 'com teto 0 nem pede a lista (alvo descartado antes)');
  }

  log('\n=== 5. A FILA DA RETENCAO (o coracao da ferramenta) ===');
  {
    // Um anuncio que libera em 1,2 s: o sniper deve ESPERAR, nao comprar na hora.
    // Libera depois da varredura, para a espera ser observada de verdade.
    const a = anuncio({ id: 20, preco: 1000, criado: Date.now(), libera: Date.now() + KICK_MS + 1200 });
    const lab = laboratorio([a], ESTADO, CFG());
    await varrerAgora(lab);
    ok(compras(lab).length === 0, 'anuncio retido NAO foi comprado na hora');
    await espera(2200);
    const c = compras(lab);
    ok(c.length === 1, `comprou depois do libera (comprou ${c.length})`);
  }
  {
    // 'soLiberados' ligado: ignora a fila por completo.
    const a = anuncio({ id: 21, criado: Date.now(), libera: Date.now() + KICK_MS + 600 });
    const lab = laboratorio([a], ESTADO, CFG({ soLiberados: true }));
    await varrerAgora(lab);
    await espera(1400);
    ok(compras(lab).length === 0, 'com "so liberados" ligado, o retido e ignorado');
  }
  {
    // Alguem chegou antes: o anuncio sai da lista durante a espera.
    const anus = [anuncio({ id: 22, criado: Date.now(), libera: Date.now() + KICK_MS + 900 })];
    const lab = laboratorio(anus, ESTADO, CFG());
    await varrerAgora(lab);
    ok(compras(lab).length === 0, 'controle: ainda nao comprou (esta na fila)');
    anus.length = 0;                       // alguem chegou antes: sumiu do mercado
    await espera(1800);
    ok(compras(lab).length === 0, 'anuncio que sumiu durante a espera nao gera compra');
  }
  {
    // O vendedor subiu o preco durante a retencao.
    const a = anuncio({ id: 23, preco: 1000, criado: Date.now(), libera: Date.now() + KICK_MS + 900 });
    const anus = [a];
    const lab = laboratorio(anus, ESTADO, CFG({ alvos: [ALVO({ tetoPreco: 5000 })] }));
    await varrerAgora(lab);
    a.preco = 999999;                      // o vendedor subiu: agora fura o teto
    await espera(1800);
    ok(compras(lab).length === 0, 'anuncio que subiu acima do teto na espera nao e comprado');
  }

  log('\n=== 6. LIMITE POR HORA ===');
  {
    const anus = [1, 2, 3, 4, 5].map((i) => anuncio({ id: 100 + i, preco: 100 * i }));
    const lab = laboratorio(anus, ESTADO, CFG({ maxPorHora: 2 }));
    await varrerAgora(lab);
    const n = compras(lab).length;
    // Tem de comprar ALGO (senao o limite nao foi testado) e nunca passar de 2.
    ok(n > 0 && n <= 2, `respeitou o limite de 2/hora e comprou de fato (comprou ${n})`);
  }

  log('\n=== 7. NAO COMPRA O MESMO ANUNCIO DUAS VEZES ===');
  {
    const anus = [anuncio({ id: 30, preco: 500 })];
    const lab = laboratorio(anus, ESTADO, CFG({ intervaloSec: 20 }));
    await varrerAgora(lab);
    // O anuncio continua na lista (o mercado de mentira nao o remove): uma
    // segunda varredura nao pode comprar de novo.
    await varrerAgora(lab);
    const n = compras(lab).filter((c) => c.id === 30).length;
    ok(n === 1, `comprou o #30 uma vez so (comprou ${n})`);
  }

  log('\n=== 8. DESLIGAR PARA NA HORA ===');
  {
    const a = anuncio({ id: 40, criado: Date.now(), libera: Date.now() + KICK_MS + 900 });
    const lab = laboratorio([a], ESTADO, CFG());
    await varrerAgora(lab);
    lab.G.desligar('sniper');     // o que a UI faz ao desligar a ferramenta
    await espera(1800);
    ok(compras(lab).length === 0, 'desligada na espera, nao compra quando o libera chega');
  }

  log('\n' + '='.repeat(60));
  log(falhas ? `${falhas} FALHA(S)` : 'TODOS OS TESTES PASSARAM');
  log(`relatorio: ${SAIDA}`);
  process.exit(falhas ? 1 : 0);
})();
