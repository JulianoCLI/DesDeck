'use strict';
const { net } = require('electron');

// Os catálogos públicos do jogo (/shared/*.json). As ferramentas no webview
// buscam esses arquivos com fetch; no headless não há página, então a busca é
// feita aqui com net.request e o resultado fica em cache no processo.
//
// Por que importa: sem os preços reais, o refill chuta o custo e pede uma compra
// que o servidor recusa; sem as áreas, a ferramenta de hunt não sabe excluir a
// ilha de Halloween, como o Mapa do jogo faz.

const BASE = 'https://digiidle.com/shared/';
const TTL_MS = 60 * 60 * 1000; // 1 h: estes arquivos quase não mudam
const cache = new Map(); // nome -> { em, dados }

function baixar(url) {
  return new Promise((resolve, reject) => {
    const req = net.request(url);
    let body = '';
    req.on('response', (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      res.on('data', (c) => { body += c.toString('utf8'); });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (err) { reject(new Error('JSON inválido: ' + err.message)); }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

/**
 * Carrega um catálogo público, com cache.
 * @param {'itens'|'areas'|'especies'} nome
 */
async function carregar(nome) {
  const agora = Date.now();
  const hit = cache.get(nome);
  if (hit && agora - hit.em < TTL_MS) return hit.dados;

  const dados = await baixar(`${BASE}${nome}.json?v=1`);
  cache.set(nome, { em: agora, dados });
  return dados;
}

/** Preço em bits de cada item comprável na Loja. */
async function precos() {
  const j = await carregar('itens');
  const out = {};
  for (const c of ['scanners', 'pocoes', 'revives', 'evolucao']) {
    for (const i of j[c] || []) if (i.preco > 0) out[i.id] = i.preco;
  }
  return out;
}

/** Ilha de cada área, por slug. Usado para excluir 'halloween', igual ao Mapa. */
async function ilhaPorSlug() {
  const areas = await carregar('areas');
  const lista = Array.isArray(areas) ? areas : (areas.areas || []);
  const out = {};
  for (const a of lista) out[a.slug] = a.ilha || 'file-island';
  return out;
}

/** Calculador de tier de ovo, alimentado pelos catálogos do jogo. */
async function tierOvo() {
  const [especies, itens] = await Promise.all([carregar('especies'), carregar('itens')]);
  const { criarTierOvo } = require('./ovo-tier');
  return criarTierOvo(especies, itens);
}

module.exports = { carregar, precos, ilhaPorSlug, tierOvo };
