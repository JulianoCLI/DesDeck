#!/usr/bin/env node
/**
 * De onde sai a COLECAO de digimons de uma conta?
 *
 * A lista "Ovos nas contas" mostra a bolsa (pacote 'ovos'). O pedido novo e
 * mostrar tambem os DIGIMONS - e nao so os da equipe. A equipe ja chega no
 * pacote 'estado' (campo 'equipe', 1..n membros ativos), mas os digimons
 * guardados fora dela nao estao em nenhum pacote que o repo conheca.
 *
 * Chutar o nome do pacote daria uma lista vazia para sempre, indistinguivel de
 * quebrada - por isso esta sonda. Ela le o cliente do jogo e procura:
 *   1. o pacote que traz a colecao (nome do 't' e campo da lista);
 *   2. o comando que a PEDE, se ela nao vier sozinha no login;
 *   3. os campos de cada digimon (ivs/u decidem se da para calcular a letra);
 *   4. o teto/paginacao, se houver (uma colecao de 500 nao cabe num pacote).
 *
 * Nao toca em conta nenhuma: so baixa arquivos publicos do site.
 *
 * Uso: node test-colecao-grep.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SAIDA = path.join(__dirname, 'colecao-grep.txt');
const out = [];
const log = (...a) => { const t = a.join(' '); out.push(t); console.log(t); try { fs.writeFileSync(SAIDA, out.join('\n') + '\n'); } catch {} };

const BASE = 'https://digiidle.com';

async function baixa(u) {
  const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error(`${r.status} ${u}`);
  return r.text();
}

// O cliente e um ES module e os menus moram em imports relativos, com
// cache-buster no fim. Mesmo crawl das outras sondas.
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

function linhas(fonte, re, limite = 30) {
  let total = 0;
  for (const [s, js] of fonte) {
    const achou = [];
    js.split(/\n/).forEach((l, i) => {
      if (re.test(l)) achou.push(`    L${i + 1}: ` + l.trim().slice(0, 260));
    });
    if (achou.length) {
      total += achou.length;
      log(`\n  ${s} (${achou.length}):`);
      achou.slice(0, limite).forEach((t) => log(t));
      if (achou.length > limite) log(`    ...(+${achou.length - limite})`);
    }
  }
  if (!total) log('\n  (nada)');
}

async function main() {
  const fonte = await fontes();
  log(`arquivos lidos (com imports): ${fonte.size}`);

  // ---- 1. Todo pacote que o cliente roteia. A lista completa dos 't'
  // possiveis diz, de uma vez, se existe um pacote de colecao e como se chama.
  // O repo conhece 15; o cliente conhece todos.
  secao('1. TODOS OS PACOTES QUE O CLIENTE ROTEIA (os valores de .t)');
  linhas(fonte, /\bcase\s*['"][a-z][\w.]*['"]\s*:|\bt\s*===?\s*['"][a-z][\w.]*['"]/i, 80);

  // ---- 2. O nome do pacote/lista. 'equipe' e o que o repo ja le; os outros
  // sao os candidatos plausiveis para "todos os que a conta tem".
  secao('2. COLECAO / CAIXA / GUARDADOS');
  linhas(fonte, /colec|colle|caixa|box\b|guardad|armazen|storage|reserva|dormit|pc\b|deposito|todos.*digi|digi.*todos|meusDigi|digimons\b/i, 40);

  // ---- 3. Os COMANDOS que o cliente manda. Se a colecao nao vem no login,
  // ela vem em resposta a um desses - e e esse que o headless tera de pedir.
  secao('3. COMANDOS QUE O CLIENTE ENVIA (send/emit com nome de pacote)');
  linhas(fonte, /send\s*\(\s*\{?\s*t\s*:\s*['"]|enviar\s*\(\s*['"]|emit\s*\(\s*['"]|\bt:\s*['"][a-z][\w.]*['"]/i, 80);

  // ---- 4. Os campos de um digimon. ivs/u sao o que ovo-tier.js precisa: com
  // eles a letra D..SSS do digimon sai do mesmo calculo que a do ovo; sem
  // eles, so da para mostrar nivel/HP/poder.
  secao('4. CAMPOS DE UM DIGIMON (ivs / u / poder / estagio)');
  linhas(fonte, /\bivs\b|\.u\b|\bpotencia\b|\bpoder\b|\bestagio\b|hpMax|\bshiny\b/i, 40);

  // ---- 5. A equipe: quantos membros cabem, e se o que esta fora dela mora
  // noutro lugar. Isso define se "colecao" e um conceito do jogo ou se a
  // equipe JA e tudo o que a conta tem.
  secao('5. EQUIPE (tamanho, troca, quem fica de fora)');
  linhas(fonte, /\bequipe\b|\bativoId\b|trocar.*digi|digi.*trocar|slot/i, 40);

  // ---- 6. Paginacao. Uma colecao grande nao cabe num pacote: se houver
  // pagina/offset/limite, o headless tera de percorrer.
  secao('6. PAGINACAO (pagina / offset / limite / cursor)');
  linhas(fonte, /pagina|offset|\blimite\b|cursor|skip\b|porPagina/i, 30);

  log(`\nrelatorio: ${SAIDA}`);
}
main().catch((e) => { log('FATAL: ' + (e.stack || e)); process.exit(1); });
