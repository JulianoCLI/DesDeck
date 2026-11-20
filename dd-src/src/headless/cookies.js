'use strict';
const { session } = require('electron');

/**
 * Extrai cookies de uma partição Electron para montagem de header Cookie.
 * Usado na autenticação do cliente headless: o DigiIdle autentica por cookie
 * de sessão, não por token no handshake.
 */
async function getCookieHeader(partition) {
  try {
    const ses = session.fromPartition(partition);
    const cookies = await ses.cookies.get({ url: 'https://digiidle.com/' });
    if (!cookies.length) return null;
    return cookies.map(c => `${c.name}=${c.value}`).join('; ');
  } catch (err) {
    console.error(`[headless:cookies] erro ao ler da partição ${partition}:`, err);
    return null;
  }
}

module.exports = { getCookieHeader };
