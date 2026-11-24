#!/usr/bin/env node
/**
 * Compila o JS que o modo normal injeta em cada webview. Os testes das classes
 * headless nao cobrem este caminho: ali o codigo e uma STRING, e um erro de
 * sintaxe so apareceria na conta do usuario.
 *
 * Uso: node test-webview-compila.js
 */
'use strict';
const fs = require('fs');
const vm = require('vm');

const src = fs.readFileSync('src/renderer/tools.js', 'utf8');
const sandbox = { window: {}, console, location: { host: 'x' }, document: {}, fetch: () => {} };
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: 'tools.js' });
const T = sandbox.window.DDTools;

let falhas = 0;
const ok = (c, t) => { console.log(`  ${c ? 'ok  ' : 'FALHA'} ${t}`); if (!c) falhas++; };

console.log('=== JS INJETADO NO WEBVIEW ===\n');
console.log('ferramentas: ' + T.TOOLS.map((t) => t.id).join(', ') + '\n');

for (const t of T.TOOLS) {
  for (const rotulo of ['defaults', 'cfg vazio']) {
    const cfg = rotulo === 'defaults' ? t.defaults() : {};
    let code;
    try { code = t.code(cfg); } catch (e) { ok(false, `${t.id} (${rotulo}): nao gerou - ${e.message}`); continue; }
    try { new vm.Script(code, { filename: t.id + '.js' }); ok(true, `${t.id} (${rotulo}) compila, ${code.length} bytes`); }
    catch (e) { ok(false, `${t.id} (${rotulo}): ${e.message}`); }
  }
}
try { new vm.Script(T.offCode('lab')); ok(true, 'offCode compila'); } catch (e) { ok(false, 'offCode: ' + e.message); }

console.log('\nferramenta de labirinto:');
const L = T.toolById('lab');
ok(!!L, 'esta no catalogo');
console.log(`  defaults: ${JSON.stringify(L.defaults())}`);
console.log(`  resumo  : ${L.summary(L.defaults())}`);
const code = L.code(L.defaults());
for (const f of ['aoLabMudou.push', 'motivoParaNaoEntrar', 'pedirLab', 'G.respirar', 'G.jitter'])
  ok(code.includes(f), `o corpo injetado tem ${f}`);
ok(code.includes("G.enviar('lab.entrar'"), 'manda lab.entrar');
// Sair do lobby e chamar a guild continuam proibidos, sempre.
for (const f of ['lab.sair', 'lab.voltar', 'lab.chamar'])
  ok(!code.includes("G.enviar('" + f), `NAO manda ${f}`);

// Com o padrao (start desligado) o codigo ate contem lab.iniciar, mas CFG o
// barra. O que importa e que o DEFAULT venha desligado e sem dificuldade.
const d = L.defaults();
ok(d.autoStart === false, 'o inicio automatico vem DESLIGADO de fabrica');
ok(!d.dificuldade, 'a dificuldade vem em "nao mexer" de fabrica');
ok(code.includes('"autoStart":false'), 'o CFG injetado leva autoStart false');

console.log('\nlabirinto com start ligado:');
const codeS = L.code({ ...d, autoStart: true, startLotado: true, dificuldade: 'pesadelo' });
ok(codeS.includes("G.enviar('lab.iniciar'"), 'ligado: manda lab.iniciar');
ok(codeS.includes("G.enviar('lab.dificuldade'"), 'ligado: manda lab.dificuldade');
ok(codeS.includes('"dif": CFG.dificuldade') || codeS.includes('{ dif: CFG.dificuldade }'), 'dificuldade vai como { dif: <id> }');
ok(codeS.includes('motivoParaNaoComecar'), 'tem a guarda motivoParaNaoComecar');
ok(codeS.includes('L.gerente'), 'confere gerente antes de agir');
ok(codeS.includes('"dificuldade":"pesadelo"'), 'a dificuldade escolhida chega no CFG');
// Uma dificuldade que nao existe no servidor nao pode ser injetada.
const codeX = L.code({ ...d, dificuldade: 'impossivel' });
ok(codeX.includes('"dificuldade":null'), 'dificuldade desconhecida vira null');

console.log('\nlabirinto sem bau (3/3):');
ok(d.entrarSemBau === false, 'entrarSemBau vem DESLIGADO de fabrica');
ok(d.startSemBau === false, 'startSemBau vem DESLIGADO de fabrica');
ok(code.includes('CFG.entrarSemBau'), 'a guarda de entrada consulta CFG.entrarSemBau');
ok(code.includes('CFG.startSemBau'), 'a guarda de start consulta CFG.startSemBau');
const codeB = L.code({ ...d, entrarSemBau: true, startSemBau: true });
ok(codeB.includes('"entrarSemBau":true'), 'entrarSemBau chega no CFG injetado');
ok(codeB.includes('"startSemBau":true'), 'startSemBau chega no CFG injetado');

console.log('\nferramenta de passe:');
const P = T.toolById('passe');
ok(!!P, 'esta no catalogo');
console.log(`  defaults: ${JSON.stringify(P.defaults())}`);
console.log(`  resumo  : ${P.summary(P.defaults())}`);
const codeP = P.code(P.defaults());
ok(codeP.includes("G.enviar('passe.resgatar'"), 'manda passe.resgatar');
ok(codeP.includes("G.enviar('passe.premium'"), 'manda passe.premium (quando ha atrasado)');
ok(codeP.includes('motivoParaNaoResgatar'), 'tem a guarda motivoParaNaoResgatar');
ok(codeP.includes('P.premium'), 'confere se a conta TEM Premium antes do atrasado');
ok(codeP.includes('E.nivel < min'), 'respeita o nivel minimo do passe');
// Comprar o Premium custa 50 DCoin: nunca pode sair daqui.
for (const f of ['shop.comprar', 'passe.comprar'])
  ok(!codeP.includes(f), `NAO manda ${f}`);

console.log('\nponte:');
ok(src.includes('passe'), 'a ponte/ferramenta conhece o passe (vem no estado)');
for (const f of ['lab: null, aoLabMudou: []', "m.t === 'lab'", "m.t === 'lab.mudou'"])
  ok(src.includes(f), `a ponte trata ${f}`);

console.log(falhas ? `\n=== FALHOU: ${falhas} caso(s) ===` : '\n=== PASS: o webview compila ===');
process.exit(falhas ? 1 : 0);
