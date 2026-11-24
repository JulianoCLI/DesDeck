#!/usr/bin/env node
/**
 * Descobre, NO CLIENTE DO JOGO, de onde sai cada numero que o painel novo quer
 * mostrar. Nada aqui e chutado: o painel atual mostra 'abates/capturas/bits',
 * e o pedido novo fala de XP/h, Bits/h, Kills/h, D-Dol, labs disponiveis, hunt
 * atual, tempo de caca, e de LOGS especificos (captura de ovo com tier e
 * potencia, venda no mercado, ovo chocado, item raro, compra do sniper).
 *
 * Nenhum desses campos esta no repo hoje. Chutar o nome de um deles daria um
 * painel que mostra '0' para sempre - do lado de fora, identico a quebrado.
 *
 * Nao toca em conta nenhuma: so baixa e le arquivos publicos do site.
 *
 * O que ele extrai:
 *   1. os CAMPOS do pacote 'estado' que o cliente le (onde moram xph/bitsph);
 *   2. os TIPOS de log ('log'.tipo) que o cliente conhece e como os desenha;
 *   3. onde o cliente calcula ou exibe taxa por hora (/h);
 *   4. o que o cliente chama de 'lab'/labirinto disponivel;
 *   5. os campos de ovo (tier, potencia) e de item raro.
 *
 * Uso: node test-painel2-grep.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SAIDA = path.join(__dirname, 'painel2-grep.txt');
const out = [];
const log = (...a) => { const t = a.join(' '); out.push(t); console.log(t); try { fs.writeFileSync(SAIDA, out.join('\n') + '\n'); } catch {} };

const BASE = 'https://digiidle.com';

async function baixa(u) {
  const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error(`${r.status} ${u}`);
  return r.text();
}

// O mesmo crawl do test-mercado-grep.js: o cliente e um ES module e os menus
// moram em imports relativos, com cache-buster no fim.
async function fontes() {
  const html = await baixa(BASE + '/');
  const achados = new Set(
    [...html.matchAll(/(?:src|href)\s*=\s*["']([^"']+?\.(?:js|mjs))(?:\?[^"']*)?["']/g)]
      .map((m) => m[1])
      .filter((s) => !/^https?:\/\//.test(s) || s.includes('digiidle')),
  );
  const norm = (s) => (s.startsWith('http') ? s : BASE + (s.startsWith('/') ? s : '/' + s));
  const fila = [...achados];
  const vistos = new Set();
  const fonte = new Map();
  while (fila.length) {
    const s = fila.shift();
    if (vistos.has(s)) continue;
    vistos.add(s);
    let js;
    try { js = await baixa(norm(s)); } catch (e) { log(`  ! ${s}: ${e.message}`); continue; }
    fonte.set(s, js);
    for (const m of js.matchAll(/(?:from|import\s*\(?)\s*['"]([^'"]+?\.js)(?:\?[^'"]*)?['"]/g)) {
      let dep = m[1];
      if (dep.startsWith('.')) {
        const base = s.slice(0, s.lastIndexOf('/') + 1);
        dep = path.posix.normalize(base + dep);
      }
      if (!vistos.has(dep)) fila.push(dep);
    }
  }
  return fonte;
}

function secao(t) { log('\n' + '='.repeat(64)); log(t); log('='.repeat(64)); }

/** As linhas de cada arquivo que casam com o padrao, com numero de linha. */
function linhas(fonte, re, limite = 30) {
  for (const [s, js] of fonte) {
    const achou = [];
    js.split(/\n/).forEach((l, i) => {
      if (re.test(l)) achou.push(`    L${i + 1}: ` + l.trim().slice(0, 260));
    });
    if (achou.length) {
      log(`\n  ${s} (${achou.length}):`);
      achou.slice(0, limite).forEach((t) => log(t));
      if (achou.length > limite) log(`    ...(+${achou.length - limite})`);
    }
  }
}

async function main() {
  const fonte = await fontes();
  log(`arquivos lidos (com imports): ${fonte.size}`);

  // ---- 1. taxa por hora. O estado headless tem 'a: {segundos, xph, bitsph}'
  // zerado e NUNCA preenchido pelo roteador: se esses campos existem de
  // verdade, e aqui que o cliente os le.
  secao('1. TAXA POR HORA (xph / bitsph / kills por hora)');
  linhas(fonte, /xph|bitsph|xpH|bitsH|porHora|perHour|\/\s*h['"`]|kills?H|killsph/i);

  // ---- 2. os tipos de log. O cliente ja separa o diario por tipo ('abate' e
  // o unico que o repo conhece): a lista completa e o que diz se 'captura',
  // 'chocou', 'venda' e 'drop' sao tipos proprios ou texto solto.
  secao('2. TIPOS DE LOG (o campo .tipo do pacote "log")');
  linhas(fonte, /tipo\s*===?\s*['"`]|tipo\s*:\s*['"`]|\.tipo\b/);

  // ---- 3. o texto de cada log. O painel novo precisa reconhecer captura de
  // ovo, venda, ovo chocado, item raro e compra. Se o servidor manda texto
  // pronto, o painel le o texto; se manda campos, le os campos. Isso muda o
  // desenho inteiro.
  secao('3. TEXTO/CAMPOS DOS LOGS DE INTERESSE');
  linhas(fonte, /chocou|chocar|eclod|nasceu|capturou|capturad|vendeu|vendid|dropou|dropad|achou|ganhou|raro/i);

  // ---- 4. labirinto disponivel. O pedido diz "Labs disponiveis para fazer":
  // o repo ja le lab.bauHoje e lab.cfg.bauPorDia (ferramenta de labirinto).
  secao('4. LABIRINTO (baus disponiveis no dia)');
  linhas(fonte, /bauHoje|bauPorDia|baus|\blab\b.*bau|bau.*\blab\b/i);

  // ---- 5. D-Dol. O estado headless le 'bits' mas nunca D-Dol.
  secao('5. D-DOL (a segunda moeda)');
  linhas(fonte, /ddol|dDol|d-dol/i, 20);

  // ---- 6. tempo de caca / hunt atual.
  secao('6. TEMPO DE CACA / HUNT ATUAL');
  linhas(fonte, /huntDesde|huntEm|desdeHunt|huntSlug|tempoHunt|huntInicio/i, 20);

  // ---- 7. item raro. O pedido lista Boss token, d-kill, aoe, e EXCLUI
  // 'Protecao de Ovo': esses sao nomes de item do catalogo.
  secao('7. ITENS CITADOS (boss token, d-kill, aoe, protecao de ovo)');
  linhas(fonte, /boss.?token|d.?kill|\baoe\b|protec.*ovo|ovo.*protec/i, 20);

  log(`\nrelatorio: ${SAIDA}`);
}
main().catch((e) => { log('FATAL: ' + (e.stack || e)); process.exit(1); });
