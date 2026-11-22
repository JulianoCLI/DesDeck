/**
 * De quem e a culpa do 502?
 *
 * Fica sondando o handshake de wss://digiidle.com/ws SEM cookie e anota cada
 * resposta. Como nao manda sessao, o servidor saudavel responde 401
 * ("sem sessao") vindo da ORIGEM - da para ver em server-timing: cfOrigin.
 *
 * Com isso, as tres hipoteses se separam sozinhas:
 *
 *   - 502 aqui tambem, no mesmo minuto do app  -> o servidor do jogo caiu.
 *     E geral, nao e o DesDeck nem o seu IP.
 *   - 401 normal aqui enquanto o app leva 502   -> o problema e so das SUAS
 *     conexoes: IP/sessao/numero de contas, nao o servidor.
 *   - erro de rede (ETIMEDOUT, ENOTFOUND)       -> a sua internet/DNS.
 *
 * Deixe rodando junto com o DesDeck e compare os horarios com o historico.
 * Nao toca em conta nenhuma: nao manda cookie e nunca completa o socket.
 *
 * Uso: node diag-502.js [minutos]   (padrao: 60)
 */
'use strict';
const https = require('https');
const fs = require('fs');
const path = require('path');

const MINUTOS = Number(process.argv[2]) || 60;
const INTERVALO_MS = 5000;
const SAIDA = path.join(__dirname, 'diag502-report.txt');

const fim = Date.now() + MINUTOS * 60000;
const contagem = new Map();
let ultimo = null;

fs.writeFileSync(SAIDA, `=== sonda do handshake, ${new Date().toLocaleString()} ===\n` +
  `401 "sem sessao" = servidor de pe. 502/503/504 = servidor do jogo fora do ar.\n\n`);

function anota(linha) {
  console.log(linha);
  fs.appendFileSync(SAIDA, linha + '\n');
}

function hora() {
  return new Date().toTimeString().slice(0, 8);
}

function sonda() {
  const t = Date.now();
  const req = https.request({
    host: 'digiidle.com',
    path: '/ws?off=1&dl=1',
    method: 'GET',
    timeout: 15000,
    headers: {
      Origin: 'https://digiidle.com',
      Connection: 'Upgrade',
      Upgrade: 'websocket',
      'Sec-WebSocket-Version': '13',
      'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
    },
  }, (res) => {
    let corpo = '';
    res.on('data', (d) => (corpo += d));
    res.on('end', () => registra(String(res.statusCode), Date.now() - t, res.headers, corpo));
  });

  req.on('timeout', () => { req.destroy(); registra('TIMEOUT', Date.now() - t); });
  req.on('error', (e) => registra('REDE:' + (e.code || e.message), Date.now() - t));
  req.end();
}

function registra(chave, ms, headers = {}, corpo = '') {
  contagem.set(chave, (contagem.get(chave) || 0) + 1);

  // So escreve quando MUDA: 12 linhas por minuto de "401 ok" nao dizem nada.
  // O que interessa e o instante da virada - e com ele o horario para cruzar
  // com o historico do DesDeck.
  if (chave !== ultimo) {
    // De onde veio a resposta: a origem respondeu (cfOrigin) ou so a borda do
    // Cloudflare? E a diferenca entre "o jogo caiu" e "o jogo nem foi ouvido".
    const st = headers['server-timing'] || '';
    const origem = /cfOrigin/.test(st) ? 'origem respondeu' : (headers.server ? 'so o Cloudflare' : '');
    const extra = [origem, corpo.trim().slice(0, 40)].filter(Boolean).join(' · ');
    anota(`${hora()}  ${chave === '401' ? 'servidor de pe' : '>>> ' + chave} (${ms}ms)${extra ? '  ' + extra : ''}`);
    ultimo = chave;
  }

  if (Date.now() < fim) setTimeout(sonda, INTERVALO_MS);
  else resumo();
}

function resumo() {
  const total = [...contagem.values()].reduce((a, b) => a + b, 0);
  anota(`\n=== ${MINUTOS} min, ${total} sondagens ===`);
  for (const [k, v] of [...contagem].sort((a, b) => b[1] - a[1])) {
    anota(`  ${k}: ${v}  (${((v / total) * 100).toFixed(1)}%)`);
  }
  const ruins = [...contagem].filter(([k]) => /^(50[234]|TIMEOUT|REDE)/.test(k))
    .reduce((a, [, v]) => a + v, 0);
  anota(ruins
    ? `\nO servidor do jogo FALHOU em ${ruins} de ${total} sondagens, sem cookie nenhum.\nA queda e dele: nao e o DesDeck, nem a sua sessao, nem o numero de contas.`
    : `\nO servidor respondeu em TODAS as ${total} sondagens.\nSe o app levou 502 nesta janela, o problema esta nas SUAS conexoes\n(IP, sessao ou quantidade de contas juntas), nao no servidor em geral.`);
  anota(`\nrelatorio: ${SAIDA}`);
}

console.log(`sondando digiidle.com a cada ${INTERVALO_MS / 1000}s por ${MINUTOS} min...`);
console.log(`deixe o DesDeck rodando e compare os horarios.\n`);
sonda();
