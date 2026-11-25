'use strict';
const { net, session } = require('electron');

// De onde saem os pedidos HTTP auxiliares do headless (catálogos e sprites).
//
// Antes, catalogo.js e sprites.js chamavam net.request(url) com uma string. Uma
// string usa a SESSÃO PADRÃO, onde setProxy nunca é chamado: os pedidos a
// digiidle.com saíam pelo IP real mesmo quando a conta tinha proxy. Aqui o
// pedido é amarrado à partição da conta, que é onde o proxy está aplicado.
//
// Enquanto nenhuma conta tiver entrado em headless, não há proxy a respeitar e
// os pedidos saem por uma sessão própria (nunca a padrão, que é a do app). É o
// caso dos scripts de teste da pasta, que só querem os catálogos públicos.
//
// Assim que uma conta entra, a partição dela passa a ser usada para tudo: daí
// em diante nada mais sai sem o proxy da conta.

const PUBLICA = 'persist:dd-publico';
let particaoAtual = null;

/** Qual partição usar quando quem chama não sabe (cache compartilhado). */
function usarParticao(partition) {
  if (/^persist:acc-[\w-]+$/.test(partition || '')) particaoAtual = partition;
}

/** Volta para a sessão pública (nenhuma conta em headless). */
function esquecerParticao() {
  particaoAtual = null;
}

function sessaoDe(partition) {
  const p = partition || particaoAtual || PUBLICA;
  if (p !== PUBLICA && !/^persist:acc-[\w-]+$/.test(p)) return null;
  try { return session.fromPartition(p); } catch { return null; }
}

/**
 * GET cru, pela sessão da conta (logo, pelo proxy dela).
 * @returns {Promise<Buffer>}
 */
function buscar(url, partition) {
  const ses = sessaoDe(partition);
  if (!ses) {
    return Promise.reject(new Error('partição inválida: pedido recusado para não vazar o IP real'));
  }
  return new Promise((resolve, reject) => {
    const req = net.request({ url, session: ses });
    const partes = [];
    const timer = setTimeout(() => { req.abort(); reject(new Error('tempo esgotado (20s)')); }, 20000);
    // O proxy da conta pode pedir usuário e senha: sem responder ao 407 o
    // pedido morre e o card fica sem retrato.
    req.on('login', (_authInfo, cb) => {
      const { creds } = require('../proxy-guard');
      const c = creds(ses);
      if (c) cb(c.user, c.pass);
      else { clearTimeout(timer); req.abort(); reject(new Error('proxy pediu usuário e senha')); }
    });
    req.on('response', (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        clearTimeout(timer);
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      res.on('data', (c) => partes.push(c));
      res.on('end', () => { clearTimeout(timer); resolve(Buffer.concat(partes)); });
      res.on('error', (err) => { clearTimeout(timer); reject(err); });
    });
    req.on('error', (err) => { clearTimeout(timer); reject(err); });
    req.end();
  });
}

/** O mesmo, já com JSON.parse. */
async function buscarJson(url, partition) {
  const buf = await buscar(url, partition);
  try { return JSON.parse(buf.toString('utf8')); } catch (err) {
    throw new Error('JSON inválido: ' + err.message);
  }
}

module.exports = { buscar, buscarJson, usarParticao, esquecerParticao };
