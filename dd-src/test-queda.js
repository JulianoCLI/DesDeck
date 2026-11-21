#!/usr/bin/env node
/**
 * A conta estava CONECTADA e o socket caiu - ela volta sozinha?
 *
 * Diferente do test-502 (que testa a falha no handshake, antes de conectar),
 * aqui a conexao e estabelecida, o servidor derruba, e o que se verifica e se o
 * client sai do 'disconnected' em vez de ficar parado nele.
 *
 * Testa tambem os codigos que NAO devem reconectar (4000 = jogo aberto em outro
 * lugar, 4001 = bloqueio): insistir neles so piora.
 *
 * Nao encosta em conta nenhuma: servidor e cookie sao de mentira.
 *
 * Uso: .\node_modules\electron\dist\electron.exe test-queda.js
 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const { app, session } = require('electron');

app.setPath('userData', path.join(process.env.TEMP || '.', 'desdeck-queda-test'));

const SAIDA = path.join(__dirname, 'queda-report.txt');
const linhas = [];
const log = (...a) => { const s = a.join(' '); linhas.push(s); try { fs.writeFileSync(SAIDA, linhas.join('\n') + '\n'); } catch { /* ignora */ } };

const PORTA = 38522;
const falhas = [];

function servidor(aoConectar) {
  const { WebSocketServer } = require('ws');
  const srv = http.createServer((_q, res) => { res.writeHead(404); res.end(); });
  const wss = new WebSocketServer({ noServer: true });
  let n = 0;
  srv.on('upgrade', (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => {
      n++;
      ws.send(JSON.stringify({ t: 'estado', nivel: 7, bits: 42 }));
      aoConectar(ws, n);
    });
  });
  srv.conexoes = () => n;
  return srv;
}

async function cliente(nome) {
  const particao = `persist:teste-queda-${nome}`;
  await session.fromPartition(particao).cookies.set({
    url: 'https://digiidle.com/', name: 'digiclone_sessao', value: 'faz-de-conta',
  });
  const { DigiiIdleHeadlessClient } = require('./src/headless/client');
  const c = new DigiiIdleHeadlessClient(nome, particao, { name: nome });
  c.wsUrl = `ws://127.0.0.1:${PORTA}/ws`;
  c.origin = `http://127.0.0.1:${PORTA}`;
  return c;
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function cenario(titulo, codigo, deveVoltar) {
  log(`\n--- ${titulo}`);
  const t0 = Date.now();
  const ms = () => String(((Date.now() - t0) / 1000).toFixed(1)).padStart(5) + 's';

  let derrubou = false;
  const srv = servidor((ws, n) => {
    log(`  ${ms()}  servidor: conexao ${n} aberta`);
    if (n === 1 && !derrubou) {
      derrubou = true;
      // Deixa o client assentar em 'connected' antes de derrubar.
      setTimeout(() => { log(`  ${ms()}  servidor: DERRUBANDO com code ${codigo}`); ws.close(codigo, 'teste'); }, 1500);
    }
  });
  await new Promise((r) => srv.listen(PORTA, '127.0.0.1', r));

  const c = await cliente(`q${codigo}`);
  const sts = [];
  c.on('status', (s) => { sts.push(s); log(`  ${ms()}  status -> ${s}`); });
  c.on('error', (m) => log(`  ${ms()}  ERRO   -> ${m}`));

  c.connect();
  await espera(16000);

  const voltou = c.status === 'connected' && srv.conexoes() >= 2;
  log(`  resultado: status=${c.status}, conexoes=${srv.conexoes()}`);

  if (deveVoltar && !voltou) {
    falhas.push(`${titulo}: NAO voltou (status=${c.status}, conexoes=${srv.conexoes()})`);
  }
  if (!deveVoltar && srv.conexoes() > 1) {
    falhas.push(`${titulo}: reconectou quando NAO devia (${srv.conexoes()} conexoes)`);
  }
  // Ficar preso em 'disconnected' e o sintoma que se esta cacando.
  if (deveVoltar && c.status === 'disconnected') {
    falhas.push(`${titulo}: ficou preso em 'disconnected' sem tentar de novo`);
  }

  c.disconnect();
  await new Promise((r) => srv.close(r));
  await espera(400);
}

async function main() {
  await app.whenReady();
  log('=== O SOCKET CAIU DEPOIS DE CONECTADO: A CONTA VOLTA? ===');

  // Queda comum: servidor reiniciou, rede oscilou. Tem que voltar.
  await cenario('queda normal (code 1006/1000)', 1000, true);
  // Jogo aberto em outro lugar: insistir brigaria com a outra sessao.
  await cenario('code 4000 (jogo aberto em outro lugar)', 4000, false);
  // Bloqueio do admin: insistir nao resolve nada.
  await cenario('code 4001 (conta bloqueada)', 4001, false);

  log('');
  log(`=== ${falhas.length ? 'FAIL:\n  - ' + falhas.join('\n  - ') : 'PASS: volta das quedas comuns e nao insiste nos codigos definitivos'} ===`);
  setTimeout(() => app.exit(falhas.length ? 1 : 0), 300);
}

main().catch((e) => { log('FATAL: ' + ((e && e.stack) || e)); setTimeout(() => app.exit(1), 300); });
