'use strict';
const { session } = require('electron');

// O DigiIdle autentica por cookie de sessão (POST /auth/entrar devolve
// digiclone_sessao HttpOnly+Secure), não por token no handshake. O header Cookie
// do WebSocket tem que levar esse cookie, lido da partição da conta.
const SESSION_COOKIE = 'digiclone_sessao';

/**
 * Monta o header Cookie de uma partição Electron para o handshake headless.
 * @returns {Promise<string|null>} header pronto, ou null se a conta não tem sessão.
 */
async function getCookieHeader(partition) {
  try {
    const ses = session.fromPartition(partition);
    const cookies = await ses.cookies.get({ url: 'https://digiidle.com/' });
    if (!cookies.length) return null;
    // Sem o cookie de sessão o servidor derruba a conexão: melhor falhar aqui,
    // com um motivo claro, do que reconectar em loop.
    if (!cookies.some((c) => c.name === SESSION_COOKIE)) return null;
    return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  } catch (err) {
    console.error(`[headless:cookies] erro ao ler da partição ${partition}:`, err);
    return null;
  }
}

module.exports = { getCookieHeader, SESSION_COOKIE };
