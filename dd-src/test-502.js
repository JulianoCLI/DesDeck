#!/usr/bin/env node
/**
 * O servidor do jogo caiu (502) - o headless se recupera sozinho?
 *
 * Sobe um servidor local que devolve 502 no handshake por alguns segundos e
 * depois aceita o WebSocket normalmente. O client e apontado para ele. O que se
 * verifica:
 *   - a mensagem de erro explica que a culpa e do servidor, nao fica no cru
 *     "Unexpected server response: 502";
 *   - o backoff cresce em vez de martelar;
 *   - quando o servidor volta, a conta reconecta sozinha.
 *
 * Nao encosta em conta nenhuma: servidor e cookie sao de mentira.
 *
 * Uso: .\node_modules\electron\dist\electron.exe test-502.js
 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const { app, session } = require('electron');

require('./perfil-real'); // so para manter o padrao dos outros scripts
app.setPath('userData', path.join(process.env.TEMP || '.', 'desdeck-502-test'));

const SAIDA = path.join(__dirname, 'erro502-report.txt');
const linhas = [];
const log = (...a) => { const s = a.join(' '); linhas.push(s); try { fs.writeFileSync(SAIDA, linhas.join('\n') + '\n'); } catch { /* ignora */ } };

const PORTA = 38521;
const VOLTA_APOS_MS = 9000; // quanto tempo o servidor fica "fora do ar"

async function main() {
  await app.whenReady();
  log('=== SERVIDOR FORA DO AR (502): O HEADLESS SE RECUPERA? ===\n');

  const t0 = Date.now();
  const ms = () => String(((Date.now() - t0) / 1000).toFixed(1)).padStart(5) + 's';

  // Servidor que comeca quebrado e depois melhora.
  let tentativas = 0;
  let aceitando = false;
  const { WebSocketServer } = require('ws');
  const srv = http.createServer((req, res) => { res.writeHead(502); res.end('bad gateway'); });
  const wss = new WebSocketServer({ noServer: true });
  srv.on('upgrade', (req, socket, head) => {
    tentativas++;
    if (!aceitando) {
      log(`  ${ms()}  servidor: devolveu 502 (tentativa ${tentativas})`);
      socket.write('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      log(`  ${ms()}  servidor: ACEITOU o socket (tentativa ${tentativas})`);
      ws.send(JSON.stringify({ t: 'estado', nivel: 7, bits: 42 }));
    });
  });
  await new Promise((r) => srv.listen(PORTA, '127.0.0.1', r));
  log(`servidor de teste em ws://127.0.0.1:${PORTA}, devolvendo 502 por ${VOLTA_APOS_MS / 1000}s\n`);
  setTimeout(() => { aceitando = true; log(`  ${ms()}  servidor: VOLTOU ao ar\n`); }, VOLTA_APOS_MS);

  // Um cookie de mentira em digiidle.com: e de la que getCookieHeader le, e o
  // teste nao pode depender de nenhuma conta real ter sessao.
  const particao = 'persist:teste-502';
  await session.fromPartition(particao).cookies.set({
    url: 'https://digiidle.com/', name: 'digiclone_sessao', value: 'faz-de-conta',
  });

  const { DigiiIdleHeadlessClient } = require('./src/headless/client');
  const client = new DigiiIdleHeadlessClient('t502', particao, { name: 'Teste 502' });
  // Aponta para o servidor local: o que se testa e a reacao ao 502, nao o jogo.
  client.wsUrl = `ws://127.0.0.1:${PORTA}/ws`;
  client.origin = `http://127.0.0.1:${PORTA}`;

  const erros = [];
  const statuses = [];
  client.on('error', (m) => { erros.push(m); log(`  ${ms()}  ERRO   -> ${m}`); });
  client.on('status', (s) => { statuses.push(s); log(`  ${ms()}  status -> ${s}`); });

  log('eventos:');
  client.connect();
  await new Promise((r) => setTimeout(r, 30000));

  const st = client.getStatus ? client.getStatus() : { status: client.status, error: client.lastError };
  log('');
  log(`status final: ${client.status}`);
  log(`nivel recebido: ${client.state.nivel} (7 = o servidor respondeu de verdade)`);
  log(`tentativas de handshake: ${tentativas}`);

  const falhas = [];
  if (!erros.some((e) => /Servidor do jogo fora do ar \(502\)/.test(e))) {
    falhas.push('o erro de 502 nao foi traduzido (a pessoa veria "Unexpected server response: 502")');
  }
  if (erros.some((e) => /Unexpected server response/.test(e))) {
    falhas.push('a mensagem crua vazou para a UI');
  }
  if (client.status !== 'connected') falhas.push(`nao reconectou quando o servidor voltou (ficou em ${client.status})`);
  if (client.state.nivel !== 7) falhas.push('conectou mas nao recebeu o estado');
  // Martelar o servidor caido seria pior que o problema.
  if (tentativas > 8) falhas.push(`${tentativas} tentativas em 30s: o backoff nao esta segurando`);

  log('');
  log('--- CHECAGENS');
  log(`  erro traduzido: ${erros[0] || '(nenhum)'}`);
  log(`  reconectou sozinho: ${client.status === 'connected' ? 'sim' : 'NAO'}`);
  log(`  tentativas em 30s: ${tentativas} (backoff segurando se <= 8)`);
  log('');
  log(`=== ${falhas.length ? 'FAIL:\n  - ' + falhas.join('\n  - ') : 'PASS: o 502 foi explicado e a conta voltou sozinha'} ===`);

  client.disconnect();
  srv.close();
  setTimeout(() => app.exit(falhas.length ? 1 : 0), 300);
}

main().catch((e) => { log('FATAL: ' + ((e && e.stack) || e)); setTimeout(() => app.exit(1), 300); });
