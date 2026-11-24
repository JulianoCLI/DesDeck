#!/usr/bin/env node
/**
 * Tres perguntas que eu NAO posso responder por suposicao:
 *
 *  1. Existe uma classificacao de "item raro" no cliente (a aba Itens Raros)?
 *     Se existir, o Painel deve usar a MESMA, em vez da minha lista escrita a mao.
 *  2. Quais pacotes o Mercado entre players usa (comprar/vender item), e como se
 *     distinguem da venda de ovos para o NPC?
 *  3. Que campos um ovo tem, para montar filtros combinados (SSS P1..P5 etc.)?
 *
 * Baixa o cliente do jogo e mostra as linhas cruas. Nao conclui nada sozinho:
 * a leitura e minha, a partir do que aparecer aqui.
 *
 * Uso: node test-raros-grep.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SAIDA = path.join(__dirname, 'raros-grep.txt');
const out = [];
const log = (...a) => { const t = a.join(' '); out.push(t); try { fs.writeFileSync(SAIDA, out.join('\n') + '\n'); } catch {} };

const BASE = 'https://digiidle.com';

async function baixa(u) {
  const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error(`${r.status} ${u}`);
  return r.text();
}

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
    try { js = await baixa(norm(s)); } catch { continue; }
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

function secao(t) { log('\n' + '='.repeat(70)); log(t); log('='.repeat(70)); }

function linhas(fonte, re, limite = 40) {
  let total = 0;
  for (const [s, js] of fonte) {
    const achou = [];
    js.split(/\n/).forEach((l, i) => {
      if (re.test(l)) achou.push(`    L${i + 1}: ` + l.trim().slice(0, 300));
    });
    if (achou.length) {
      log(`  ${s}  (${achou.length})`);
      for (const a of achou.slice(0, limite)) log(a);
      if (achou.length > limite) log(`    ... +${achou.length - limite}`);
      total += achou.length;
    }
  }
  if (!total) log('  (nada)');
}

(async () => {
  const fonte = await fontes();
  log(`fontes baixadas: ${fonte.size}`);

  secao('1a. A ABA "ITENS RAROS" / qualquer rotulo de raridade');
  linhas(fonte, /raro|Raro|RARO|rarity|rarid/);

  secao('1b. Os tres itens citados pelo usuario, literalmente');
  linhas(fonte, /boss.?token|d-?skill|dskill|\baoe\b/i);

  secao('1c. Catalogo de itens: onde a lista de itens e definida');
  linhas(fonte, /itens\.json|items\.json|ITENS|catalogo.*iten|shared\/.*item/i);

  secao('1d. Categoria / tipo / tag de item');
  linhas(fonte, /\b(categoria|category|tipo|tier|grupo)\s*[:=]\s*['"]/);

  secao('2a. Pacotes do MERCADO entre players');
  linhas(fonte, /mercado\.|market\.|'mercado|"mercado|'market|"market/);

  secao('2b. Comprar / vender / anunciar / listagem');
  linhas(fonte, /t:\s*['"](?:[\w.]*)(?:compra|venda|sell|buy|list|anunci|oferta)/i);

  secao('2c. Venda de ovos (para distinguir do mercado de itens)');
  linhas(fonte, /ovo.*vend|vend.*ovo|egg.*sell|sell.*egg/i);

  secao('2d. Todos os t: do cliente (nomes de pacote)');
  const ts = new Set();
  for (const [, js] of fonte) for (const m of js.matchAll(/t:\s*['"]([\w.]+)['"]/g)) ts.add(m[1]);
  log('  ' + [...ts].sort().join('  '));

  secao('2e. Mensagens de log/toast de compra e venda');
  linhas(fonte, /(comprou|vendeu|vendido|comprado|Comprou|Vendeu)/);

  secao('3a. Campos do ovo no historico');
  linhas(fonte, /historico|potencia|shiny|scanner/);

  secao('3b. O drop: como o texto do abate e montado');
  linhas(fonte, /drop/i);

  console.log(out.join('\n'));
})().catch((e) => { console.log('FATAL ' + (e && e.stack || e)); process.exit(1); });
