'use strict';
/**
 * O LOG DO SNIPER, FASE POR FASE
 *
 * A pergunta que este log existe para responder e "esta funcionando?", e a
 * parte dificil dela e "fui EU quem comprei?". O jogo nao responde ao
 * 'mercado.comprar' (conferido em mercado-grep.txt e nos campos medidos em
 * conta real): nao existe pacote de confirmacao. A unica prova e o historico de
 * 'mercado.meus', que chega segundos depois.
 *
 * Entao a compra tem DOIS momentos, e o teste trata os dois:
 *   - 'tentando': o comando saiu;
 *   - 'comprei' (o historico confirmou) ou 'perdido' (ninguem confirmou).
 *
 * Rodar:  node test-sniper-log.js
 */
const fs = require('fs');
const path = require('path');

const SAIDA = path.join(__dirname, 'sniper-log.txt');
const out = [];
const log = (...a) => { const t = a.join(' '); out.push(t); console.log(t); };
let falhas = 0;
const ok = (cond, txt) => { log(`  ${cond ? 'OK  ' : 'FALHA'} ${txt}`); if (!cond) falhas++; };

const { ToolSniper } = require('./src/headless/tools');

// O mesmo dublê do test-sniper-headless, mais a captura dos eventos de
// atividade — que e o que esta sob teste aqui.
function montar(cfg, lista, opts = {}) {
  const ouvintes = {};
  const eventos = [];
  const c = {
    index: 0,
    connected: true,
    state: Object.assign({ nick: 'teste', local: 'hunt', nivel: 50, bits: 1000000, gemas: 100 }, opts.estado),
    enviados: [],
    tools: new Map(),
    on(ev, fn) { (ouvintes[ev] = ouvintes[ev] || []).push(fn); },
    removeListener(ev, fn) {
      const L = ouvintes[ev]; if (!L) return;
      const i = L.indexOf(fn); if (i >= 0) L.splice(i, 1);
    },
    off(ev, fn) { this.removeListener(ev, fn); },
    listenerCount(ev) { return (ouvintes[ev] || []).length; },
    emit(ev, m) {
      if (ev === 'atividade') eventos.push(m);
      for (const fn of [...(ouvintes[ev] || [])]) fn(m);
    },
    sendCommand(t, d) {
      this.enviados.push({ t, d });
      if (t === 'mercado.listar') {
        const L = typeof lista === 'function' ? lista(d) : lista;
        const agora = Date.now() - (opts.desvio || 0);
        setTimeout(() => c.emit('mercado', { t: 'mercado', lista: L, total: L.length, agora }), 0);
      }
      return true;
    },
  };
  const tool = new ToolSniper(c, cfg);
  c.tools.set('sniper', tool);
  tool.running = true;
  tool.pronto = true;
  return { c, tool, eventos };
}

const fases = (ev) => ev.filter((e) => e.tipo === 'sniper').map((e) => e.fase);
const porFase = (ev, f) => ev.filter((e) => e.tipo === 'sniper' && e.fase === f);
const anuncio = (o = {}) => Object.assign({
  id: 1, preco: 1000, moeda: 'bits', tipo: 'ovo', estado: 'aberto', meu: false,
  libera: 0, nick: 'Vendedor', resumo: { especie: 'lopmon', potencia: 4, data: 0 },
}, o);
const CFG = (o = {}) => Object.assign({
  alvos: [{ nome: 'meu alvo', tipo: 'ovo', especie: 'lopmon', tetoBits: 5000 }],
  intervaloSec: 60, reservaBits: 0,
}, o);

async function main() {
  log('=== O LOG DO SNIPER, FASE POR FASE ===');

  log('\n=== 1. MIROU: o anuncio que bateu no alvo vira linha ===');
  {
    const { tool, eventos } = montar(CFG(), [anuncio({ id: 10, preco: 1000 })]);
    await tool.step();
    const m = porFase(eventos, 'mirou');
    ok(m.length === 1, `uma linha 'mirou' (${m.length})`);
    ok(m[0] && m[0].id === 10, 'traz o id do anuncio');
    ok(m[0] && m[0].preco === 1000, 'traz o preco');
    ok(m[0] && m[0].especie === 'lopmon', 'traz a especie, para o nome bonito');
    ok(m[0] && m[0].alvo === 'meu alvo', 'diz QUAL alvo disparou');
    ok(m[0] && m[0].teto === 5000, 'traz o teto configurado');
    ok(m[0] && m[0].nick === 'Vendedor', 'traz o vendedor');
    tool.stop();
  }

  log('\n=== 2. O MESMO ANUNCIO NAO VIRA DUAS LINHAS ===');
  {
    // Ele segue no Mercado enquanto nao for comprado: sem memoria, cada
    // varredura repetiria a mesma linha. Com saldo curto para nao comprar.
    const { tool, eventos } = montar(CFG(), [anuncio({ id: 11, preco: 5000 })], { estado: { bits: 10 } });
    await tool.step();
    await tool.step();
    await tool.step();
    ok(porFase(eventos, 'mirou').length === 1, `mirou uma vez so em 3 varreduras (${porFase(eventos, 'mirou').length})`);
    tool.stop();
  }

  log('\n=== 3. TENTANDO, E SO TENTANDO ===');
  {
    const { c, tool, eventos } = montar(CFG(), [anuncio({ id: 12, preco: 1000 })]);
    await tool.step();
    ok(c.enviados.some((e) => e.t === 'mercado.comprar'), 'mandou o comando de compra');
    ok(porFase(eventos, 'tentando').length === 1, 'emitiu a fase tentando');
    // O ponto central: sem confirmacao, NAO dizemos que compramos.
    ok(porFase(eventos, 'comprei').length === 0, 'NAO disse "comprei" sem o historico confirmar');
    tool.stop();
  }

  log('\n=== 4. COMPREI: o historico confirma que foi nossa ===');
  {
    const { tool, eventos } = montar(CFG(), [anuncio({ id: 13, preco: 1000 })]);
    await tool.step();
    // E o que o client faz ao receber 'mercado.meus': uma compra (vendi:false)
    // com o mesmo preco e moeda da tentativa.
    const casou = tool.confirmar({ vendi: false, preco: 1000, moeda: 'bits', outro: 'Vendedor', tipo: 'ovo' });
    ok(casou === true, 'reconheceu a negociacao como a sua compra');
    const k = porFase(eventos, 'comprei');
    ok(k.length === 1, 'emitiu a fase comprei');
    ok(k[0] && k[0].de === 'Vendedor', 'diz de quem comprou');
    ok(porFase(eventos, 'perdido').length === 0, 'nao emitiu perdido');
    tool.stop();
  }

  log('\n=== 5. PERDIDO: ninguem confirmou no prazo ===');
  {
    const { tool, eventos } = montar(CFG(), [anuncio({ id: 14, preco: 1000 })]);
    // O prazo real e de 15 s; aqui o timer e disparado na mao para o teste nao
    // levar 15 s. E o mesmo caminho de codigo.
    await tool.step();
    ok(tool.aguardando.has(14), 'a tentativa ficou aguardando confirmacao');
    for (const t of tool.timers.values()) clearTimeout(t);
    tool.timers.clear();
    tool.aguardando.delete(14);
    tool.evento('sniper', { fase: 'perdido', id: 14, preco: 1000, moeda: 'bits', oque: 'ovo', especie: 'lopmon' });
    const p = porFase(eventos, 'perdido');
    ok(p.length === 1, 'emitiu a fase perdido');
    ok(porFase(eventos, 'comprei').length === 0, 'e NAO disse que comprou');
    tool.stop();
  }

  log('\n=== 6. A VENDA DE OUTRA PESSOA NAO CONFIRMA A NOSSA COMPRA ===');
  {
    const { tool, eventos } = montar(CFG(), [anuncio({ id: 15, preco: 1000 })]);
    await tool.step();
    ok(tool.confirmar({ vendi: true, preco: 1000, moeda: 'bits' }) === false, 'uma VENDA minha nao casa com a compra');
    ok(tool.confirmar({ vendi: false, preco: 999, moeda: 'bits' }) === false, 'preco diferente nao casa');
    ok(tool.confirmar({ vendi: false, preco: 1000, moeda: 'gemas' }) === false, 'moeda diferente nao casa');
    ok(porFase(eventos, 'comprei').length === 0, 'nenhuma delas virou "comprei"');
    ok(tool.aguardando.has(15), 'a tentativa segue aguardando a confirmacao certa');
    tool.stop();
  }

  log('\n=== 7. BARRADO PELA RESERVA: o motivo vai nos campos ===');
  {
    const { tool, eventos } = montar(CFG({ reservaBits: 999000 }), [anuncio({ id: 16, preco: 5000 })]);
    await tool.step();
    const b = porFase(eventos, 'barrado');
    ok(b.length === 1, 'emitiu a fase barrado');
    ok(b[0] && b[0].motivo === 'reserva', `o motivo e a reserva (${b[0] && b[0].motivo})`);
    ok(b[0] && b[0].saldo === 1000000 && b[0].reserva === 999000, 'traz saldo e reserva, para a linha explicar');
    tool.stop();
  }

  log('\n=== 8. FILA: o anuncio retido diz em quantos segundos libera ===');
  {
    const libera = Date.now() + 120000;
    const { tool, eventos } = montar(CFG(), [anuncio({ id: 17, preco: 1000, libera })]);
    await tool.step();
    const f = porFase(eventos, 'fila');
    ok(f.length === 1, 'emitiu a fase fila');
    ok(f[0] && f[0].seg > 100 && f[0].seg <= 121, `diz os segundos que faltam (${f[0] && f[0].seg}s)`);
    ok(porFase(eventos, 'mirou').length === 1, 'o retido tambem conta como mirado');
    tool.stop();
  }

  log('\n=== 9. VARREU: o pulso que prova que a ferramenta roda ===');
  {
    const { tool, eventos } = montar(CFG(), []);
    await tool.step();
    const v = porFase(eventos, 'varreu');
    ok(v.length === 1, 'emitiu o pulso mesmo sem achar nada');
    ok(v[0] && v[0].buscas === 1, `conta as buscas feitas (${v[0] && v[0].buscas})`);
    ok(v[0] && v[0].vistos === 0, 'e quantos anuncios viu (0, mercado vazio)');
    ok(fases(eventos).filter((f) => f !== 'varreu').length === 0, 'sem alvo batido, so o pulso: nao enche a aba');
    tool.stop();
  }

  log('\n=== 10. DESISTIU: quem entrou na fila e nao virou compra diz por que ===');
  {
    // O anuncio e retido, entra na fila, e quando o prazo chega ele JA NAO esta
    // mais no Mercado: alguem comprou durante os 2 min de retencao.
    let volta = 0;
    const retido = anuncio({ id: 20, preco: 1000, libera: Date.now() + 40 });
    const { tool, eventos } = montar(CFG(), () => (volta++ === 0 ? [retido] : []));
    await tool.step();
    ok(porFase(eventos, 'fila').length === 1, 'entrou na fila');
    await new Promise((r) => setTimeout(r, 450));
    const d = porFase(eventos, 'desistiu');
    ok(d.length === 1, `emitiu a fase desistiu (${d.length})`);
    ok(d[0] && d[0].motivo === 'sumiu', `o motivo e que o anuncio sumiu (${d[0] && d[0].motivo})`);
    ok(porFase(eventos, 'comprei').length === 0, 'e nao disse que comprou');
    tool.stop();
  }

  log('\n=== 11. DESISTIU: o preco subiu acima do teto durante a retencao ===');
  {
    let volta = 0;
    const retido = anuncio({ id: 21, preco: 1000, libera: Date.now() + 40 });
    const caro = anuncio({ id: 21, preco: 99000, libera: 0 });
    const { tool, eventos } = montar(CFG(), () => (volta++ === 0 ? [retido] : [caro]));
    await tool.step();
    await new Promise((r) => setTimeout(r, 450));
    const d = porFase(eventos, 'desistiu');
    ok(d.length === 1, 'emitiu a fase desistiu');
    ok(d[0] && d[0].motivo === 'subiu', `o motivo e que o preco subiu (${d[0] && d[0].motivo})`);
    ok(d[0] && d[0].antes === 1000, `guarda o preco de antes (${d[0] && d[0].antes})`);
    ok(d[0] && d[0].preco === 99000, 'e o preco novo');
    ok(porFase(eventos, 'comprei').length === 0, 'nao comprou acima do teto');
    tool.stop();
  }

  log('\n=== 12. STOP LIMPA OS PRAZOS DE CONFIRMACAO ===');
  {
    const { tool } = montar(CFG(), [anuncio({ id: 18, preco: 1000 })]);
    await tool.step();
    ok(tool.timers.size === 1, 'havia um prazo de confirmacao pendente');
    tool.stop();
    ok(tool.timers.size === 0, 'o stop limpou os prazos');
    ok(tool.aguardando.size === 0, 'e esqueceu as tentativas');
  }

  log('\n' + '='.repeat(60));
  log(falhas ? `${falhas} FALHA(S)` : 'TODOS OS TESTES PASSARAM');
  fs.writeFileSync(SAIDA, out.join('\n') + '\n', 'utf8');
  log('relatorio: ' + SAIDA);
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
