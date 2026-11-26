#!/usr/bin/env node
/**
 * As correcoes do travamento, verificadas.
 *
 * O travamento tinha uma causa medida: o Historico de Ovos guardava o retrato de
 * cada ovo em data-URL dentro do estado. Deu 17,23 MB em 2000 ovos (96% do
 * arquivo) para 18 especies distintas, cada retrato repetido ~111x. E o estado
 * inteiro era reserializado, recriptografado e gravado de forma SINCRONA a cada
 * 10 s - para sempre, porque o contador de tempo online marcava o estado como
 * sujo a cada segundo.
 *
 * Uso: .\node_modules\electron\dist\electron.exe test-tamanho.js
 */
const { app, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

app.setPath('userData', path.join(os.tmpdir(), 'desdeck-test-tamanho'));

const SAIDA = path.join(__dirname, 'tamanho-test.txt');
const linhas = [];
const log = (...a) => {
  linhas.push(a.join(' '));
  try { fs.writeFileSync(SAIDA, linhas.join('\n') + '\n'); } catch { /* ignora */ }
};

let falhas = 0;
function ok(cond, nome, detalhe = '') {
  log(`${cond ? 'PASS' : 'FALHA'}  ${nome}${detalhe ? '  — ' + detalhe : ''}`);
  if (!cond) falhas++;
}

const mb = (n) => (n / 1048576).toFixed(2) + ' MB';
const tam = (v) => Buffer.byteLength(JSON.stringify(v), 'utf8');

// Um retrato de verdade tem ~8,8 KB em base64 (medido nos sprites reais).
const IMG_FALSA = 'data:image/png;base64,' + 'A'.repeat(8800);

function ovosComImagem(n) {
  const especies = ['agumon', 'gabumon', 'patamon', 'gaomon'];
  return Array.from({ length: n }, (_, i) => ({
    especie: especies[i % especies.length],
    nome: 'Agumon', img: IMG_FALSA, letra: 'B', nota: 5.5, potencia: 3,
    shiny: false, nivel: 1, scanner: 'scanner-basico', em: 1700000000000 + i,
    k: `conta|agumon|${i}`, accId: 'conta', nomeConta: 'c1',
  }));
}

app.whenReady().then(async () => {
  log('=== CORRECAO DO TRAVAMENTO: O ARQUIVO DE ESTADO ===\n');

  // ---- 1. O estado nao deve mais carregar imagem nenhuma.
  log('--- 1. o retrato sai do estado');
  const comImg = { ovos: ovosComImagem(2000), log: [], accounts: [] };
  const antes = tam(comImg);
  log(`  estado do jeito antigo (2000 ovos com retrato): ${mb(antes)}`);

  // A migracao do normalize(): o historico inteiro e descartado na leitura. A
  // lista do Painel agora mostra a bolsa que o servidor manda, e ela chega de
  // novo a cada conexao - guardar copia no disco nao servia para nada.
  const migrado = { ...comImg };
  delete migrado.ovos;
  const depois = tam(migrado);
  log(`  depois da migracao:                             ${mb(depois)}`);
  const reducao = Math.round((1 - depois / antes) * 100);
  log(`  reducao: ${reducao}%`);
  ok(reducao >= 90, 'o arquivo encolhe ao menos 90%', `encolheu ${reducao}%`);
  ok(!JSON.stringify(migrado).includes('data:image'), 'nenhum data-URL sobra no estado');
  ok(migrado.ovos === undefined, 'o historico de ovos nao existe mais no estado');

  // ---- 2. A gravacao nao pode mais bloquear o processo principal.
  log('\n--- 2. a gravacao e assincrona');
  const { Vault } = require('./src/vault');
  const arq = path.join(app.getPath('userData'), 'teste.json');
  try { fs.unlinkSync(arq); } catch { /* nao existia */ }
  const vault = new Vault(arq, safeStorage);
  vault.load();

  const grande = { ovos: ovosComImagem(2000), log: [], accounts: [] };
  const t0 = Date.now();
  vault.write(grande);
  const sincrono = Date.now() - t0;
  log(`  write() devolveu em ${sincrono} ms (cripto + serializacao, sem o disco)`);
  await vault.flushed();
  log(`  o disco terminou em ${Date.now() - t0} ms no total`);
  ok(fs.existsSync(arq), 'o arquivo foi gravado');
  ok(!fs.existsSync(arq + '.tmp'), 'o .tmp temporario foi renomeado, nao deixado para tras');

  // O que importa: o conteudo tem que voltar igual.
  const v2 = new Vault(arq, safeStorage);
  const lido = v2.load();
  ok(lido.state && lido.state.ovos.length === 2000, 'o estado gravado le de volta inteiro');

  // ---- 3. Gravacoes em rajada nao podem disputar o mesmo .tmp.
  log('\n--- 3. gravacoes em rajada nao se atropelam');
  for (let i = 0; i < 8; i++) vault.write({ ovos: [], log: [], marca: i });
  await vault.flushed();
  const v3 = new Vault(arq, safeStorage);
  const ultimo = v3.load();
  ok(ultimo.state && ultimo.state.marca === 7,
    'a ultima gravacao da rajada e a que vale', `marca=${ultimo.state && ultimo.state.marca}`);
  ok(!fs.existsSync(arq + '.tmp'), 'nenhum .tmp sobrou depois da rajada');

  // ---- 4. A saida do app ainda grava, bloqueando (writeSync).
  log('\n--- 4. a saida do app grava mesmo sem esperar promessa');
  vault.writeSync({ ovos: [], log: [], marca: 'saida' });
  const v4 = new Vault(arq, safeStorage);
  ok(v4.load().state.marca === 'saida', 'writeSync grava na hora, para o before-quit');

  log(`\n=== ${falhas ? falhas + ' FALHA(S)' : 'TODOS OS TESTES PASSARAM'} ===`);
  setTimeout(() => app.exit(falhas ? 1 : 0), 200);
}).catch((e) => { log('FATAL: ' + ((e && e.stack) || e)); setTimeout(() => app.exit(1), 200); });
