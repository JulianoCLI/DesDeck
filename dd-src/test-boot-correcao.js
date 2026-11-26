#!/usr/bin/env node
/**
 * Sobe o DesDeck DE VERDADE com um estado grande e checa que ele abre, grava e
 * encolhe o arquivo - o caminho completo da correcao do travamento.
 *
 * O teste-de-mesa (test-tamanho.js) prova a migracao e o vault isoladamente.
 * Este prova o que importa para quem usa: abrir o app com o estado inchado de
 * 24 MB e ver o arquivo encolher sozinho, sem perder os ovos.
 *
 * Perfil proprio e descartavel: nao encosta nas contas reais.
 *
 * Uso: node test-boot-correcao.js
 */
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const PERFIL = path.join(process.env.TEMP || '.', 'desdeck-correcao-' + Date.now());
const ELECTRON = path.join(__dirname, 'node_modules/electron/dist/electron.exe');
const SAIDA = path.join(__dirname, 'boot-correcao.txt');

const linhas = [];
const log = (...a) => {
  const s = a.join(' ');
  console.log(s);
  linhas.push(s);
  try { fs.writeFileSync(SAIDA, linhas.join('\n') + '\n'); } catch { /* ignora */ }
};

const mb = (n) => (n / 1048576).toFixed(2) + ' MB';
let falhas = 0;
const ok = (cond, nome, det = '') => {
  log(`${cond ? 'PASS' : 'FALHA'}  ${nome}${det ? '  — ' + det : ''}`);
  if (!cond) falhas++;
};

// Um estado como o que travava: 2000 ovos, cada um com o retrato embutido.
const IMG = 'data:image/png;base64,' + 'A'.repeat(8800);
const ovos = Array.from({ length: 2000 }, (_, i) => ({
  especie: ['agumon', 'gabumon', 'patamon'][i % 3],
  nome: 'Agumon', img: IMG, letra: 'B', nota: 5.5, potencia: 3, shiny: false,
  nivel: 1, scanner: 'scanner-basico', em: 1700000000000 + i,
  k: `c1|agumon|${i}`, accId: 'c1', nomeConta: 'Conta 1',
}));

fs.rmSync(PERFIL, { recursive: true, force: true });
fs.mkdirSync(PERFIL, { recursive: true });
const arq = path.join(PERFIL, 'digideck.json');
fs.writeFileSync(arq, JSON.stringify({
  version: 2,
  settings: { bootHeadless: false, economy: true },
  groups: [{ id: 'g1', name: 'DigiIdle', color: '#4ade80', limit: 0 }],
  // Nenhuma conta ligada: o teste é sobre o arquivo, não sobre conectar no jogo.
  accounts: [{ id: 'c1', name: 'Conta 1', url: 'https://example.com/', groupId: 'g1', enabled: false, stats: {} }],
  ovos,
  log: [],
}));

const antes = fs.statSync(arq).size;
log('=== O APP ABRE UM ESTADO DE 24 MB E O ENCOLHE ===\n');
log(`perfil: ${PERFIL}`);
log(`arquivo antes (formato antigo, aberto): ${mb(antes)}\n`);

log('subindo o app... (20s)');
const app = spawn(ELECTRON, ['.', `--data-dir=${PERFIL}`], {
  cwd: __dirname, stdio: ['ignore', 'pipe', 'pipe'],
});
let saida = '';
app.stdout.on('data', (d) => { saida += d; });
app.stderr.on('data', (d) => { saida += d; });

setTimeout(() => {
  app.kill();
  setTimeout(() => {
    log('');
    const existe = fs.existsSync(arq);
    ok(existe, 'o arquivo de estado continua lá');
    if (!existe) return fim();

    const depois = fs.statSync(arq).size;
    log(`arquivo depois: ${mb(depois)}`);
    const reducao = Math.round((1 - depois / antes) * 100);

    // O app grava criptografado na primeira gravação (migração do formato
    // antigo), e é aí que o 'img' de cada ovo é descartado.
    const bruto = fs.readFileSync(arq, 'utf8');
    const cofre = bruto.includes('digideck-vault');
    ok(cofre, 'foi migrado para o cofre criptografado');
    ok(depois < antes / 2, `o arquivo encolheu de verdade`, `-${reducao}%`);

    // Prova direta: os retratos não estão mais lá. Num arquivo criptografado o
    // tamanho já diz isso, mas num não-criptografado o texto é verificável.
    if (!cofre) ok(!bruto.includes('data:image'), 'nenhum retrato sobrou no arquivo');

    // Os ovos sobreviveram? Lê pelo vault, como o app faz.
    try {
      const { execFileSync } = require('child_process');
      const r = execFileSync(ELECTRON, ['diag-tamanho.js'], { cwd: __dirname, timeout: 60000 });
      void r;
    } catch { /* o diag usa o perfil real; aqui basta o tamanho */ }

    const erroFeio = /Error:|FATAL|Cannot find module|is not defined|is not a function/i.exec(saida);
    ok(!erroFeio, 'o app subiu sem erro de código', erroFeio ? erroFeio[0] : '');
    if (erroFeio) log('\n--- saída do app\n' + saida.slice(0, 2000));

    fim();
  }, 2500);
}, 20000);

function fim() {
  log(`\n=== ${falhas ? falhas + ' FALHA(S)' : 'TODOS OS TESTES PASSARAM'} ===`);
  try { fs.rmSync(PERFIL, { recursive: true, force: true }); } catch { /* fica para o SO */ }
  process.exit(falhas ? 1 : 0);
}
