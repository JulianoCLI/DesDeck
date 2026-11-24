#!/usr/bin/env node
/**
 * Procura, no CLIENTE do jogo, como o Labirinto COMECA a corrida e como TROCA
 * a dificuldade -- em vez de chutar nome de comando e formato de payload.
 *
 * Precisamos de tres coisas para o auto-start:
 *   1. o nome exato do comando de iniciar e o que ele leva (se leva algo);
 *   2. o nome exato do comando de dificuldade e o formato do argumento
 *      (o id cru 'pesadelo'? um indice? uma chave 'dif'?);
 *   3. quem o jogo deixa clicar nesses botoes (a regra de dono/sub-dono).
 *
 * Mesma tecnica do test-passe-grep.js, que foi como 'lab.info'/'lab.entrar'
 * sairam de verdade.
 *
 * Nao toca em conta nenhuma: so baixa arquivos publicos do site.
 *
 * Uso: node test-lab-grep.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SAIDA = path.join(__dirname, 'lab-grep.txt');
const out = [];
const log = (...a) => { const t = a.join(' '); out.push(t); console.log(t); try { fs.writeFileSync(SAIDA, out.join('\n') + '\n'); } catch {} };

const BASE = 'https://digiidle.com';

async function baixa(u) {
  const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error(`${r.status} ${u}`);
  return r.text();
}

async function main() {
  const html = await baixa(BASE + '/');
  // O jogo carrega os modulos sozinho (import()/injecao), entao o index nao
  // lista guild.js. Juntamos o que o HTML declara com o que ele menciona em
  // qualquer string '/js/*.js', e garantimos os modulos que ja conhecemos.
  const noHtml = [...new Set([...html.matchAll(/(?:src|href)\s*=\s*["']([^"']+\.(?:js|mjs))["']/g)].map((m) => m[1]))];
  const mencionados = [...new Set([...html.matchAll(/["'`](\/?js\/[\w.-]+\.js)(?:\?[^"'`]*)?["'`]/g)].map((m) => m[1]))];
  const srcs = [...new Set([...noHtml, ...mencionados, '/js/guild.js'])]
    .filter((s) => !/mercadopago|google|gtag|analytics/i.test(s));
  log(`scripts a inspecionar: ${srcs.length}`);
  srcs.forEach((s) => log('  ' + s));
  log('');

  for (const s of srcs) {
    const url = s.startsWith('http') ? s : BASE + (s.startsWith('/') ? s : '/' + s);
    let js;
    try { js = await baixa(url); } catch (e) { log(`  ! ${s}: ${e.message}`); continue; }

    // Todo comando 'lab.*' que o cliente manda.
    const cmds = new Set();
    for (const re of [/enviar\(\s*['"`](lab[\w.]*)['"`]/g, /\bt\s*:\s*['"`](lab[\w.]*)['"`]/g, /send\(\s*['"`](lab[\w.]*)['"`]/g]) {
      for (const m of js.matchAll(re)) cmds.add(m[1]);
    }
    if (cmds.size) log(`${s}: comandos lab.* -> ${[...cmds].sort().join(', ')}`);

    // O PAYLOAD: pegamos o trecho inteiro da chamada, com o 2o argumento.
    // E isso que diz se 'lab.dificuldade' leva {dif:'pesadelo'} ou outra coisa.
    const chamadas = [...js.matchAll(/enviar\(\s*['"`](lab[\w.]*)['"`]\s*(,[^;]{0,160})?\)/g)];
    for (const m of chamadas) {
      const arg = (m[2] || '(sem 2o argumento)').replace(/\s+/g, ' ').trim();
      log(`    ${m[1].padEnd(18)} ${arg}`);
    }

    // O contexto de 'dificuldade'/'iniciar': a regra de quem pode clicar.
    for (const chave of ['dificuldade', 'iniciar', 'gerente', 'bauPorDia', 'bauHoje']) {
      const i = js.indexOf(chave);
      if (i < 0) continue;
      log(`\n  --- contexto de "${chave}" em ${s}`);
      log('  ' + js.slice(Math.max(0, i - 320), i + 320).replace(/\s+/g, ' '));
    }
    log('');
  }
  log(`relatorio: ${SAIDA}`);
}

main().catch((e) => { log('FATAL: ' + (e.stack || e)); process.exit(1); });
