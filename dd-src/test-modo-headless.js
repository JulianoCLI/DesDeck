#!/usr/bin/env node
/**
 * Testa a decisao "esta conta roda em headless?" - a logica que causou o bug de
 * a conta subir nos DOIS modos ao abrir o programa (socket + webview na mesma
 * conta, que o servidor derruba com code 4000).
 *
 * isHeadless() vive no app.js, que e um renderer sem Node (nao exporta nada),
 * entao o teste extrai a funcao do arquivo e a avalia com um 'state' montado a
 * mao. Assim ele testa o codigo de verdade, nao uma copia que pode divergir.
 *
 * Uso: node test-modo-headless.js
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, 'src/renderer/app.js'), 'utf8');

// Extrai o corpo de isHeadless() e o DEFAULT_ACCOUNT do app.js.
const mIs = src.match(/function isHeadless\(accId\) \{[\s\S]*?\n\}/);
if (!mIs) { console.error('FATAL: nao achei isHeadless() em app.js'); process.exit(1); }
const mDef = src.match(/const DEFAULT_ACCOUNT = \{[\s\S]*?\n\};/);
if (!mDef) { console.error('FATAL: nao achei DEFAULT_ACCOUNT em app.js'); process.exit(1); }
// A migracao de contas salvas, para checar que o 'false' antigo nao trava a conta.
const mMig = src.match(/headless: a\.headless === true \? true : undefined,/);

let state;
// eslint-disable-next-line no-eval
const isHeadless = eval(`(() => { ${mIs[0]}; return isHeadless; })()`);
// eslint-disable-next-line no-eval
const DEFAULT_ACCOUNT = eval(`(() => { ${mDef[0]}; return DEFAULT_ACCOUNT; })()`);

const falhas = [];
function checa(nome, real, esperado) {
  const ok = real === esperado;
  console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${nome}: ${real}${ok ? '' : ` (esperado ${esperado})`}`);
  if (!ok) falhas.push(nome);
}

const cenario = (headlessConta, bootHeadless) => {
  state = { accounts: [{ id: 'a1', headless: headlessConta }], settings: { bootHeadless } };
  return isHeadless('a1');
};

console.log('=== MODO DE CADA CONTA ===\n');

console.log('com "iniciar todas em headless" DESLIGADO:');
checa('conta sem escolha (undefined) -> webview', cenario(undefined, false), false);
checa('conta marcada true -> headless', cenario(true, false), true);
checa('conta marcada false -> webview', cenario(false, false), false);

console.log('\ncom "iniciar todas em headless" LIGADO:');
checa('conta sem escolha (undefined) -> headless', cenario(undefined, true), true);
checa('conta marcada true -> headless', cenario(true, true), true);
// O caso do bug: sem o tri-estado, a preferencia vencia e nao dava para tirar
// UMA conta do headless.
checa('conta marcada false -> webview (a escolha vence)', cenario(false, true), false);

console.log('\ncasos de borda:');
state = { accounts: [], settings: { bootHeadless: true } };
checa('conta inexistente -> false (nao assume headless)', isHeadless('nao-existe'), false);
state = { accounts: [{ id: 'a1' }], settings: {} };
checa('sem settings -> webview', isHeadless('a1'), false);

console.log('\npadrao de conta nova:');
checa('DEFAULT_ACCOUNT.headless e undefined (segue a preferencia)', DEFAULT_ACCOUNT.headless, undefined);
state = { accounts: [{ id: 'a1', ...DEFAULT_ACCOUNT }], settings: { bootHeadless: true } };
checa('conta nova com a preferencia ligada -> headless', isHeadless('a1'), true);

console.log('\nmigracao de contas salvas:');
checa('o false antigo volta a ser "segue a preferencia"', !!mMig, true);

// A invariante que o bug violava: um modo, nunca os dois.
console.log('\ninvariante: a pagina so carrega quando NAO e headless');
const temGuarda = /if \(isHeadless\(id\)\) \{\s*\n\s*r\.tile\.classList\.add\('headless-mode'\);\s*\n\s*return r;/.test(src);
checa("createRuntime sai antes de setar o src quando e headless", temGuarda, true);
const botao = /toggleHeadlessMode\(id, !isHeadless\(id\)\)/.test(src);
checa('o botao de energia compara com o estado real, nao com acc.headless', botao, true);

console.log(`\n=== ${falhas.length ? 'FAIL: ' + falhas.join(', ') : 'PASS'} ===`);
process.exit(falhas.length ? 1 : 0);
