#!/usr/bin/env node
/**
 * Descobre o PACOTE e os CAMPOS do Passe, para escrever as guardas do Auto Passe.
 *
 * O repo nao tem nada de passe ainda: nao sabemos como o pacote se chama, quais
 * campos dizem "tem premio para resgatar" nem qual comando resgata. Este script
 * descobre isso do mesmo jeito que o test-lab-campos.js descobriu o Labirinto:
 * perguntando ao servidor e anotando o que ele responde.
 *
 * NAO MUTA A CONTA. Nenhum resgate e enviado:
 *   - so comandos de LEITURA passam (a lista PEDIDOS abaixo);
 *   - qualquer outro comando que o cliente tente mandar e BARRADO e logado;
 *   - nao existe nenhum 'resgatar' aqui. Descobrir o nome do comando de resgate
 *     e feito observando o pacote, nao chamando-o.
 *
 * Como o pedido certo e desconhecido, ele tenta uma lista de candidatos (o jogo
 * ignora o que nao existe) e, em paralelo, grava TODO pacote cujo tipo lembre
 * passe/missao/recompensa - inclusive os que chegam sozinhos, sem pedido.
 *
 * Autentica REUSANDO a sessao de uma conta que ja entrou no jogo pelo app: o
 * DigiIdle autentica por cookie (digiclone_sessao), nao por token, entao nao
 * precisa de senha. Sem argumentos, ele escolhe sozinho a primeira particao do
 * perfil que tenha sessao valida.
 *
 * Uso: .\node_modules\electron\dist\electron.exe test-passe-campos.js
 *      ...                                       test-passe-campos.js <particao>
 *      ...                                       test-passe-campos.js --login <login> <senha>
 */
'use strict';
const { app, session, net } = require('electron');
const path = require('path');
const fs = require('fs');

// O perfil REAL do app, nao um nome chutado (ver perfil-real.js).
const DATA_DIR = require('./perfil-real').usar();
const SAIDA = path.join(__dirname, 'passe-campos.txt');
const out = [];
const log = (...a) => { const t = a.join(' '); out.push(t); console.log(t); try { fs.writeFileSync(SAIDA, out.join('\n') + '\n'); } catch {} };

const argv = process.argv.slice(2);
const usarLogin = argv[0] === '--login';
const [login, senha] = usarLogin ? argv.slice(1) : [];
const particaoPedida = !usarLogin && argv[0] ? argv[0] : null;

const { SESSION_COOKIE } = require('./src/headless/cookies');

/** As particoes do perfil que tem cookie de sessao, ou seja, dao para conectar. */
async function particoesComSessao() {
  const dir = path.join(DATA_DIR, 'Partitions');
  if (!fs.existsSync(dir)) return [];
  const achadas = [];
  for (const nome of fs.readdirSync(dir)) {
    const part = `persist:${nome}`;
    try {
      const cks = await session.fromPartition(part).cookies.get({ url: 'https://digiidle.com/' });
      if (cks.some((c) => c.name === SESSION_COOKIE)) achadas.push(part);
    } catch {}
  }
  return achadas;
}

// Candidatos de LEITURA. Nomes no estilo do que o jogo ja usa ('lab.info',
// 'offline.cfg'). O servidor ignora o que nao conhece, entao tentar e barato.
const PEDIDOS = [
  'passe.info', 'passe', 'passe.cfg', 'passe.estado',
  'pass.info', 'battlepass.info',
  'missoes.info', 'missao.info', 'diario.info', 'daily.info',
  'recompensas.info', 'temporada.info', 'season.info',
];

// Tipos de pacote que nos interessam, por nome.
const INTERESSA = /pass|miss|diar|daily|recomp|reward|tempor|season|resgat|claim|bau|chest/i;

// Campos que normalmente carregam a decisao "da para resgatar agora?".
const CHAVES_DECISAO = /resgat|claim|disp|avail|pronto|ready|pode|can|prox|next|reset|expira|cooldown|nivel|tier|xp|pontos|premio|reward|bau|chest|hoje|today|dia|streak/i;

function postLogin(ses) {
  return new Promise((resolve, reject) => {
    const req = net.request({ method: 'POST', url: 'https://digiidle.com/auth/entrar', session: ses, useSessionCookies: true });
    req.setHeader('Content-Type', 'application/json');
    req.setHeader('Origin', 'https://digiidle.com');
    let b = '';
    req.on('response', (r) => { r.on('data', (c) => { b += c; }); r.on('end', () => resolve(b)); });
    req.on('error', reject);
    req.end(JSON.stringify({ login, senha, lembrar: true, lang: 'pt' }));
  });
}

// Resume um valor sem despejar estruturas gigantes no relatorio.
const tipos = (v) => (v === null ? 'null' : Array.isArray(v) ? `array[${v.length}]` : typeof v);
const resumo = (v, prof = 0) => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    if (prof >= 1) return `array[${v.length}]`;
    return `array[${v.length}] primeiro=${resumo(v[0], prof + 1)}`;
  }
  const ks = Object.keys(v);
  if (prof >= 1) return `{${ks.join(',')}}`;
  return `{ ${ks.map((k) => `${k}: ${resumo(v[k], prof + 1)}`).join(', ')} }`;
};

async function main() {
  await app.whenReady();

  // Qual conta usar. O caminho normal e reusar uma sessao que ja existe.
  let partition;
  if (usarLogin) {
    if (!login || !senha) { log('uso: --login <login> <senha>'); return fim(1); }
    partition = 'persist:passe-campos';
    const j = JSON.parse(await postLogin(session.fromPartition(partition)));
    if (!j.ok) { log('login falhou'); return fim(1); }
    log(`login ok: ${j.conta.nick}`);
  } else {
    const todas = await particoesComSessao();
    if (!todas.length) {
      log('Nenhuma conta com sessao salva no perfil.');
      log(`perfil: ${DATA_DIR}`);
      log('Entre numa conta em modo normal pelo app e rode de novo,');
      log('ou passe credenciais: test-passe-campos.js --login <login> <senha>');
      return fim(1);
    }
    if (particaoPedida && !todas.includes(particaoPedida)) {
      log(`a particao ${particaoPedida} nao tem sessao. Com sessao: ${todas.join(', ')}`);
      return fim(1);
    }
    partition = particaoPedida || todas[0];
    log(`contas com sessao: ${todas.length} | usando: ${partition}`);
  }
  log('');

  const { DigiiIdleHeadlessClient } = require('./src/headless/client');
  const c = new DigiiIdleHeadlessClient('passe', partition, { name: 'passe-campos' });

  // Barra TUDO que possa mutar a conta. So leitura passa.
  const real = c.sendCommand.bind(c);
  const liberado = new Set([...PEDIDOS, 'pong', 'ping']);
  c.sendCommand = (t, d) => (liberado.has(t) ? real(t, d) : (log(`[BARRADO] ${t}`), true));

  // Grava todo pacote interessante, inclusive os nao pedidos.
  const vistos = new Map();   // tipo -> ultimo pacote
  const ordem = [];           // tipos na ordem em que apareceram
  const todosTipos = new Set();
  const orig = c.onMessage.bind(c);
  c.onMessage = (ev) => {
    try {
      const m = JSON.parse(ev.data);
      if (m && typeof m.t === 'string') {
        todosTipos.add(m.t);
        if (INTERESSA.test(m.t)) {
          if (!vistos.has(m.t)) ordem.push(m.t);
          vistos.set(m.t, m);
        }
      }
    } catch {}
    return orig(ev);
  };

  // Espera o primeiro 'estado' (ou desiste em 30 s).
  await new Promise((r) => {
    let f = 0; const go = () => { if (!f++) r(); };
    c.on('update', go); c.on('error', (m) => { log('erro: ' + m); go(); });
    setTimeout(go, 30000); c.connect();
  });

  if (!c.connected) { log('nao conectou (veja o erro acima). Se o app estiver aberto nesta conta, feche-a.'); return fim(1); }
  log(`conectado: ${c.state.nick || '(sem nick ainda)'} | nivel ${c.state.nivel} | local ${c.state.local}\n`);

  // Um pedido por vez, com folga entre eles, para dar para associar resposta a pedido.
  log('--- PEDIDOS (so leitura) ---');
  for (const p of PEDIDOS) {
    const antes = new Set(vistos.keys());
    real(p, {});
    await new Promise((r) => setTimeout(r, 2500));
    const novos = [...vistos.keys()].filter((k) => !antes.has(k));
    log(`  ${p.padEnd(20)} -> ${novos.length ? 'RESPONDEU: ' + novos.join(', ') : '(nada novo)'}`);
  }

  // Alguns pacotes chegam sozinhos, no proprio ritmo do servidor.
  log('\n(esperando 15 s por pacotes nao pedidos...)');
  await new Promise((r) => setTimeout(r, 15000));

  log('\n=== PACOTES RELACIONADOS AO PASSE ===');
  if (!ordem.length) {
    log('  NENHUM. O passe pode ter outro nome, ou ser so HTTP (nao WebSocket).');
    log('  Tipos de pacote vistos nesta sessao, para procurar a mao:');
    log('    ' + [...todosTipos].sort().join(', '));
  }
  for (const t of ordem) {
    const m = vistos.get(t);
    log(`\n--- pacote "${t}" ---`);
    log(`  chaves: ${Object.keys(m).join(', ')}`);
    for (const k of Object.keys(m)) {
      if (k === 't') continue;
      const marca = CHAVES_DECISAO.test(k) ? ' <== decisao?' : '';
      log(`  ${k.padEnd(14)} = ${resumo(m[k])}   (${tipos(m[k])})${marca}`);
    }
    // O reset diario: procuramos um timestamp que caia na proxima meia-noite.
    for (const k of Object.keys(m)) {
      const v = m[k];
      if (typeof v !== 'number' || v < 1e12) continue;
      const d = new Date(v);
      log(`  >> ${k} como data: ${d.toISOString()} (local: ${d.toString()})`);
    }
  }

  log(`\nrelatorio: ${SAIDA}`);
  log('\nPROXIMO PASSO: me mande este arquivo. Com os campos reais eu escrevo as');
  log('guardas do Auto Passe (e o nome do comando de resgate, que NAO foi chamado aqui).');
  try { c.disconnect(); } catch {}
  fim(0);
}
function fim(c) { setTimeout(() => app.exit(c), 400); }
main().catch((e) => { log('FATAL: ' + (e.stack || e)); fim(1); });
