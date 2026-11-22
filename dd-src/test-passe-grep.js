#!/usr/bin/env node
/**
 * Procura o "passe" no CLIENTE do jogo, em vez de chutar nomes de comando.
 *
 * O test-passe-campos.js provou que 'passe.info' e companhia nao existem, e o
 * dump mostrou que 'metas' e global (metas do servidor), nao um passe por conta.
 * A fonte da verdade e o JS do proprio jogo: e dele que saem os nomes reais,
 * que foi como o Labirinto virou 'lab.info'/'lab.entrar'.
 *
 * Nao toca em conta nenhuma: so baixa e le arquivos publicos do site.
 *
 * Uso: node test-passe-grep.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SAIDA = path.join(__dirname, 'passe-grep.txt');
const out = [];
const log = (...a) => { const t = a.join(' '); out.push(t); console.log(t); try { fs.writeFileSync(SAIDA, out.join('\n') + '\n'); } catch {} };

const BASE = 'https://digiidle.com';
// O que caracteriza um passe: niveis/temporada + resgate.
const PISTA = /passe|batalha.?pass|battlepass|temporada|season|resgat|claim|premi|reward|recompensa|missao|missoes|diari|daily|streak|login.?bonus/i;

async function baixa(u) {
  const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error(`${r.status} ${u}`);
  return r.text();
}

async function main() {
  const html = await baixa(BASE + '/');
  const srcs = [...new Set([...html.matchAll(/(?:src|href)\s*=\s*["']([^"']+\.(?:js|mjs))["']/g)].map((m) => m[1]))];
  log(`scripts no index: ${srcs.length}`);
  srcs.forEach((s) => log('  ' + s));
  log('');

  // Pistas no proprio HTML (nomes de menu costumam aparecer ali).
  const noHtml = [...new Set([...html.matchAll(/[\w.-]*(?:passe|temporada|season|missao|missoes|diario|resgat)[\w.-]*/gi)].map((m) => m[0]))];
  if (noHtml.length) log(`pistas no index.html: ${noHtml.join(', ')}\n`);

  const vistos = new Map(); // comando -> arquivos
  for (const s of srcs) {
    const url = s.startsWith('http') ? s : BASE + (s.startsWith('/') ? s : '/' + s);
    let js;
    try { js = await baixa(url); } catch (e) { log(`  ! ${s}: ${e.message}`); continue; }

    // Todo comando que o cliente manda: enviar('x'), send({t:'x'}), t:"x".
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

    // Contexto textual, para entender o que o comando faz.
    const linhas = js.split(/\n/);
    const trechos = [];
    linhas.forEach((l, i) => {
      if (PISTA.test(l) && /enviar\(|\bt\s*:|resgat|claim/i.test(l)) {
        trechos.push(`    L${i + 1}: ` + l.trim().slice(0, 220));
      }
    });
    if (trechos.length) {
      log(`  contexto em ${s} (${trechos.length} linha(s), 12 primeiras):`);
      trechos.slice(0, 12).forEach((t) => log(t));
    }
    if (interessa.length || trechos.length) log('');
  }

  log('='.repeat(60));
  log('COMANDOS CANDIDATOS AO PASSE:');
  if (!vistos.size) log('  nenhum. O passe pode nao existir neste jogo, ou ser HTTP.');
  for (const [cmd, onde] of vistos) log(`  ${cmd.padEnd(26)} (${onde.join(', ')})`);
  log(`\nrelatorio: ${SAIDA}`);
}
main().catch((e) => { log('FATAL: ' + (e.stack || e)); process.exit(1); });
