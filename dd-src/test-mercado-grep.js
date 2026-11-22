#!/usr/bin/env node
/**
 * Descobre o protocolo do MERCADO no CLIENTE do jogo, em vez de chutar nomes.
 *
 * O repo so conhece 'market.comprar' {item,qtd}, que e a LOJA (precos fixos, bits).
 * O sniper precisa de outra coisa: o mercado entre jogadores, onde anuncios tem
 * preco escolhido pelo vendedor, moeda (bits/ddol) e um TEMPO que corre. Nada
 * disso esta no repo, e nenhum nome pode ser chutado: comprar o anuncio errado
 * gasta dinheiro de verdade.
 *
 * Nao toca em conta nenhuma: so baixa e le arquivos publicos do site.
 *
 * O que ele extrai:
 *   1. todo comando que o cliente manda e que cheire a mercado/anuncio/leilao;
 *   2. o contexto (a linha) de cada um, para saber o que o comando faz;
 *   3. os CAMPOS de anuncio citados no cliente (preco, moeda, expira, tier...),
 *      que sao o que os filtros vao ler;
 *   4. os arquivos JSON compartilhados (itens/areas), onde ficam ids de item.
 *
 * Uso: node test-mercado-grep.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SAIDA = path.join(__dirname, 'mercado-grep.txt');
const out = [];
const log = (...a) => { const t = a.join(' '); out.push(t); console.log(t); try { fs.writeFileSync(SAIDA, out.join('\n') + '\n'); } catch {} };

const BASE = 'https://digiidle.com';

// O que caracteriza o mercado entre jogadores. Proposital largo: e melhor olhar
// um comando a mais do que perder o que compra o anuncio.
const PISTA = /market|mercado|anuncio|anunci|leilao|leilo|auction|bid|lance|vender|venda|sell|comprar|compra|buy|oferta|offer|listag|listing|ddol|bits|preco|price/i;

// Campos que um anuncio costuma ter. Sao as chaves que os filtros vao ler.
const CAMPO = /preco|price|valor|moeda|currency|ddol|bits|expira|expire|fim|ate|termina|prazo|tempo|restante|tier|raridade|rarity|grade|nivel|level|qtd|quant|amount|item|ovo|egg|vendedor|seller|dono|id\b/i;

async function baixa(u) {
  const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error(`${r.status} ${u}`);
  return r.text();
}

async function main() {
  const html = await baixa(BASE + '/');
  // O cliente e um ES module: os imports nao aparecem como <script src>.
  // Entao seguimos tambem os import/from de dentro de cada arquivo.
  // Os scripts do jogo vem com cache-buster ('/js/app.js?v=1'), entao a extensao
  // nao fica no fim da string: aceitar o ?query depois dela e o que faz o grep ver
  // o cliente inteiro em vez de so os scripts de terceiros.
  const achados = new Set(
    [...html.matchAll(/(?:src|href)\s*=\s*["']([^"']+?\.(?:js|mjs))(?:\?[^"']*)?["']/g)]
      .map((m) => m[1])
      .filter((s) => !/^https?:\/\//.test(s) || s.includes('digiidle')), // so o cliente
  );
  log(`scripts no index: ${achados.size}`);
  [...achados].forEach((s) => log('  ' + s));

  const norm = (s) => (s.startsWith('http') ? s : BASE + (s.startsWith('/') ? s : '/' + s));
  const fila = [...achados];
  const vistosArq = new Set();
  const fonte = new Map(); // caminho -> texto

  while (fila.length) {
    const s = fila.shift();
    if (vistosArq.has(s)) continue;
    vistosArq.add(s);
    let js;
    try { js = await baixa(norm(s)); } catch (e) { log(`  ! ${s}: ${e.message}`); continue; }
    fonte.set(s, js);
    // Segue os imports relativos, que e onde moram os menus (menus2.js, loja.js...).
    // Tambem com cache-buster: './loja.js?v=5'. Sem tolerar o ?query, o crawl
    // parava no app.js e nunca via os menus, que e onde o mercado mora.
    for (const m of js.matchAll(/(?:from|import\s*\(?)\s*['"]([^'"]+?\.js)(?:\?[^'"]*)?['"]/g)) {
      let dep = m[1];
      if (dep.startsWith('.')) {
        const base = s.slice(0, s.lastIndexOf('/') + 1);
        dep = path.posix.normalize(base + dep);
      }
      if (!vistosArq.has(dep)) fila.push(dep);
    }
  }
  log(`\narquivos lidos (com imports): ${fonte.size}\n`);

  const vistos = new Map(); // comando -> arquivos
  for (const [s, js] of fonte) {
    const cmds = new Set();
    for (const re of [/enviar\(\s*['"`]([\w.]+)['"`]/g, /\bt\s*:\s*['"`]([\w.]+)['"`]/g, /send\(\s*['"`]([\w.]+)['"`]/g]) {
      for (const m of js.matchAll(re)) cmds.add(m[1]);
    }
    const interessa = [...cmds].filter((x) => PISTA.test(x));
    if (interessa.length) {
      log(`${s}:`);
      for (const x of interessa) {
        log(`   -> ${x}`);
        if (!vistos.has(x)) vistos.set(x, []);
        vistos.get(x).push(s);
      }
    }
  }

  // Contexto: as linhas onde o comando de mercado aparece. E aqui que se ve o
  // PAYLOAD real (quais campos o cliente manda junto).
  log('\n' + '='.repeat(60));
  log('CONTEXTO (payload dos comandos)');
  for (const [s, js] of fonte) {
    const linhas = js.split(/\n/);
    const trechos = [];
    linhas.forEach((l, i) => {
      if (/market|mercado|anunci|leila|auction/i.test(l) && /enviar\(|\bt\s*:|send\(/.test(l)) {
        trechos.push(`    L${i + 1}: ` + l.trim().slice(0, 240));
      }
    });
    if (trechos.length) {
      log(`\n  ${s} (${trechos.length} linha(s)):`);
      trechos.slice(0, 25).forEach((t) => log(t));
    }
  }

  // Os campos de um anuncio, lidos de onde o cliente DESENHA a lista.
  log('\n' + '='.repeat(60));
  log('CAMPOS DE ANUNCIO citados no cliente');
  for (const [s, js] of fonte) {
    if (!/market|mercado|anunci|leila/i.test(js)) continue;
    const campos = new Set();
    // a.preco, l.moeda, x?.expira ...
    for (const m of js.matchAll(/\b(?:a|an|l|it|o|m|r|x|v)\s*(?:\?)?\.\s*(\w+)/g)) {
      if (CAMPO.test(m[1])) campos.add(m[1]);
    }
    if (campos.size) log(`  ${s}: ${[...campos].sort().join(', ')}`);
  }

  log('\n' + '='.repeat(60));
  log('COMANDOS CANDIDATOS AO MERCADO:');
  if (!vistos.size) log('  nenhum. O mercado pode ser HTTP, nao WebSocket.');
  for (const [cmd, onde] of [...vistos].sort()) log(`  ${cmd.padEnd(28)} (${onde.join(', ')})`);
  log(`\nrelatorio: ${SAIDA}`);
}
main().catch((e) => { log('FATAL: ' + (e.stack || e)); process.exit(1); });
