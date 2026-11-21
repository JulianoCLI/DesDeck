#!/usr/bin/env node
/**
 * O resumo do card headless: com um 'estado' montado a mao, ele diz quem esta
 * lutando contra quem?
 *
 * Verifica tambem o recorte do sprite: a folha do jogo tem dezenas de quadros
 * numa grade, e o retrato e o primeiro deles. Se a grade estiver errada, sai um
 * pedaco de bicho ou uma tira de 123x960.
 *
 * Nao encosta em conta nenhuma: o estado e inventado. Baixa os catalogos e
 * sprites publicos do jogo (read-only).
 *
 * Uso: .\node_modules\electron\dist\electron.exe test-painel.js
 */
const path = require('path');
const fs = require('fs');
const { app, nativeImage } = require('electron');

app.setPath('userData', path.join(process.env.TEMP || '.', 'desdeck-painel-test'));

const SAIDA = path.join(__dirname, 'painel-report.txt');
const linhas = [];
const log = (...a) => { const s = a.join(' '); linhas.push(s); try { fs.writeFileSync(SAIDA, linhas.join('\n') + '\n'); } catch { /* ignora */ } };

const falhas = [];

// Um 'estado' como o socket manda, com os campos que o painel le. Os numeros
// vieram de uma captura real (lab-pacotes.js).
function estadoFalso(extra = {}) {
  return {
    nick: 'ms4', nivel: 98, bits: 4330982,
    ativoId: 26536, local: 'hunt', huntSlug: 'gaomon',
    equipe: [{ id: 26536, especie: 'agumon', nivel: 54, hp: 820, hpMax: 1000, shiny: false, poder: 7321 }],
    sessao: { inicio: Date.now() - 3600000, abates: 412, capturas: 7, xpTamer: 8240, bits: 91000, shinyVistos: 2 },
    online: 2843, evp: 0, evpMax: 0, eventoXP: null, ultimoAbate: null,
    ...extra,
  };
}

app.whenReady().then(async () => {
  log('=== O RESUMO DO CARD HEADLESS ===\n');
  const { resumo } = require('./src/headless/painel');

  // 1) Caçando, nada abatido ainda: o alvo e uma previsao pela area.
  log('--- 1. cacando, nenhum abate ainda');
  const a = await resumo(estadoFalso());
  log(JSON.stringify({ ...a, digimon: { ...a.digimon, img: a.digimon.img ? `data:…(${a.digimon.img.length}b)` : null }, alvo: a.alvo && { ...a.alvo, img: a.alvo.img ? `data:…(${a.alvo.img.length}b)` : null } }, null, 1));

  if (!a.digimon) falhas.push('1: nao identificou o Digimon ativo');
  else {
    if (a.digimon.nome !== 'Agumon') falhas.push(`1: nome do ativo saiu "${a.digimon.nome}", esperado Agumon`);
    if (a.digimon.hpPct !== 82) falhas.push(`1: hpPct saiu ${a.digimon.hpPct}, esperado 82`);
    if (!a.digimon.img) falhas.push('1: sem retrato do Digimon ativo');
  }
  if (!a.alvo) falhas.push('1: nao previu o alvo pela area');
  else if (a.alvo.certo) falhas.push('1: marcou o alvo como certo, mas e so previsao da area');
  if (!/Caçando em /.test(a.onde)) falhas.push(`1: 'onde' saiu "${a.onde}"`);
  // A area se chama como o bicho; repetir o nome do alvo nao informaria nada.
  if (a.alvo && a.onde.includes(a.alvo.nome)) falhas.push(`1: 'onde' so repete o alvo ("${a.onde}")`);
  if (a.farm.abates !== 412) falhas.push('1: perdeu os contadores da sessao');

  // 2) Acabou de abater: o nome do inimigo e a verdade do momento.
  log('\n--- 2. abate recente (o socket revela o nome)');
  const b = await resumo(estadoFalso({ ultimoAbate: { nome: 'Gaomon', em: Date.now() - 5000 } }));
  log(`  alvo: ${b.alvo && b.alvo.nome} | certo: ${b.alvo && b.alvo.certo} | id: ${b.alvo && b.alvo.especie} | retrato: ${b.alvo && b.alvo.img ? 'sim' : 'NAO'}`);
  if (!b.alvo || b.alvo.nome !== 'Gaomon') falhas.push('2: nao usou o nome do abate');
  if (b.alvo && !b.alvo.certo) falhas.push('2: marcou como incerto um abate de 5s atras');
  if (b.alvo && !b.alvo.especie) falhas.push('2: nao achou o id da especie pelo nome (sem retrato)');

  // 3) Abate velho nao vale: o bicho de 10 min atras nao esta mais na frente.
  log('\n--- 3. abate velho (5 min) volta para a previsao da area');
  const c = await resumo(estadoFalso({ ultimoAbate: { nome: 'Gaomon', em: Date.now() - 300000 } }));
  log(`  alvo: ${c.alvo && c.alvo.nome} | certo: ${c.alvo && c.alvo.certo}`);
  if (c.alvo && c.alvo.certo) falhas.push('3: tratou um abate de 5 min como atual');

  // 4) Estado magro (conta acabou de conectar): nao pode explodir.
  log('\n--- 4. estado magro, sem equipe nem sessao');
  const d = await resumo({ nivel: 1 });
  log(`  digimon: ${d.digimon} | alvo: ${d.alvo} | onde: ${d.onde} | abates: ${d.farm.abates}`);
  if (d === null || typeof d !== 'object') falhas.push('4: devolveu nada');
  if (d.farm.abates !== 0) falhas.push('4: contadores nao zeraram');

  // 5) O recorte: o retrato tem que parecer um bicho, nao uma tira.
  log('\n--- 5. o recorte do sprite');
  const img = nativeImage.createFromDataURL(a.digimon.img);
  const s = img.getSize();
  log(`  retrato do Agumon: ${s.width}x${s.height}`);
  log('  (a folha e 984x1920; o quadro cru, 123x120)');
  const prop = s.width / s.height;
  if (s.height !== 96 && s.width !== 96) falhas.push(`5: o lado maior nao ficou em 96 (${s.width}x${s.height})`);
  // 123x120 -> quase quadrado. Uma tira (123x960) daria 0.13.
  if (prop < 0.5 || prop > 2) falhas.push(`5: proporcao ${prop.toFixed(2)} - a grade do recorte esta errada`);

  // 6) Cache: a segunda chamada nao pode baixar de novo.
  log('\n--- 6. cache do retrato');
  const t0 = Date.now();
  await resumo(estadoFalso());
  const ms = Date.now() - t0;
  log(`  2a chamada: ${ms}ms (download custaria centenas de ms)`);
  if (ms > 400) falhas.push(`6: ${ms}ms na 2a chamada - o cache nao esta pegando`);

  log('');
  log(`=== ${falhas.length ? 'FAIL:\n  - ' + falhas.join('\n  - ') : 'PASS: o resumo identifica os dois lados, o retrato sai recortado certo e o cache pega'} ===`);
  setTimeout(() => app.exit(falhas.length ? 1 : 0), 300);
}).catch((e) => { log('FATAL: ' + ((e && e.stack) || e)); setTimeout(() => app.exit(1), 300); });
