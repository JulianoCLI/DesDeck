'use strict';

// Trava de proxy por sessão (partição de conta).
//
// O problema que isto resolve: setProxy() é assíncrono e a sessão continua
// utilizável enquanto ele não termina. Pior, qualquer caminho que recrie um
// <webview> ou navegue antes/depois de uma falha de setProxy sairia pelo IP
// real, e o Chromium não avisa nada - a página simplesmente carrega.
//
// A trava funciona ao contrário do código anterior: uma partição que DEVE usar
// proxy é "armada" ANTES de qualquer tentativa de aplicar, e enquanto ela não
// estiver confirmada (ready) todo pedido da sessão é cancelado em
// onBeforeRequest. Falha fechado: se o setProxy der erro, a partição fica
// armada e sem ready, ou seja, muda, e não vaza.
//
// Só `clear()` desarma, e ele é a única porta para rodar direto.

const guards = new Map(); // Session -> { creds, armed, ready, hooked }

function info(ses) {
  let g = guards.get(ses);
  if (!g) {
    g = { creds: null, armed: false, ready: false, hooked: false };
    guards.set(ses, g);
  }
  return g;
}

// O bloqueador fica instalado para sempre na sessão: registrar e remover
// onBeforeRequest a cada troca de proxy abriria exatamente a janela que a trava
// existe para fechar. Quando a partição não está armada ele só deixa passar.
function hook(ses) {
  const g = info(ses);
  if (g.hooked) return;
  g.hooked = true;
  ses.webRequest.onBeforeRequest((details, cb) => {
    const atual = guards.get(ses);
    if (atual && atual.armed && !atual.ready) {
      cb({ cancel: true });
      return;
    }
    cb({});
  });
}

/** Arma a partição: nada sai dela até um apply() dar certo. */
function arm(ses) {
  hook(ses);
  const g = info(ses);
  g.armed = true;
  g.ready = false;
}

/**
 * Aplica o proxy e libera a partição. Usuário e senha são opcionais: um proxy
 * sem autenticação é um proxy válido, e a versão anterior o transformava em
 * conexão direta devolvendo `true` - o vazamento mais silencioso que havia.
 */
async function apply(ses, proxy) {
  if (!proxy || !proxy.host || !proxy.port) return false;
  arm(ses);
  const g = info(ses);
  g.creds = proxy.user && proxy.pass ? { user: proxy.user, pass: proxy.pass } : null;
  try {
    const proxyUrl = `http://${proxy.host}:${proxy.port}`;
    // proxyBypassRules '<-loopback>' REMOVE a exceção implícita de localhost,
    // então nem o loopback escapa do proxy.
    await ses.setProxy({ proxyRules: proxyUrl, proxyBypassRules: '<-loopback>' });
    ses.forceReloadProxyConfig();
  } catch (err) {
    console.error('[proxy-guard] setProxy falhou, partição segue travada:', err);
    return false;
  }
  g.ready = true;
  return true;
}

/** Desarma e volta para conexão direta. Único caminho para rodar sem proxy. */
async function clear(ses) {
  const g = info(ses);
  g.creds = null;
  try {
    await ses.setProxy({ mode: 'direct' });
    ses.forceReloadProxyConfig();
  } catch (err) {
    console.error('[proxy-guard] não consegui voltar para direto:', err);
    return false;
  }
  g.armed = false;
  g.ready = true;
  return true;
}

/** Credenciais para responder ao desafio 407, achadas pela sessão. */
function creds(ses) {
  const g = guards.get(ses);
  return (g && g.creds) || null;
}

/** Esquece a sessão (conta ou tela apagada). */
function forget(ses) {
  const g = guards.get(ses);
  if (g) g.creds = null;
}

module.exports = { arm, apply, clear, creds, forget };
