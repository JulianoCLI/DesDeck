'use strict';
const path = require('path');
const fs = require('fs');
const { app, net, nativeImage } = require('electron');

// O retrato de cada Digimon, para o card da conta em headless mostrar quem esta
// lutando contra quem.
//
// O jogo nao publica retratos: publica folhas de sprite de animacao
// (/img/digimon/<id>.png, varios quadros numa grade). O catalogo de especies da
// a grade: 'colunas' colunas e 'frames' linhas. O primeiro quadro (0,0) e a pose
// parada, que e o que serve de retrato.
//
// Por que recortar aqui e nao no renderer: a CSP da janela so aceita
// img-src 'self' data:. Baixar direto na pagina exigiria afrouxa-la para
// https://digiidle.com, o que abriria a janela para qualquer imagem remota. O
// processo principal baixa, recorta e devolve um data: URL pequeno.
//
// A folha do Agumon tem 508 KB; o quadro recortado, poucos KB. Sem o recorte,
// mostrar 8 contas custaria alguns MB de rede a cada abertura.

const BASE = 'https://digiidle.com';
const LADO = 96; // o retrato final, em px (o card mostra bem menor; sobra para telas densas)

let cacheDir = null;
const memoria = new Map(); // especieId -> data URL
const emVoo = new Map();   // especieId -> Promise (duas contas no mesmo bicho = um download)

function dir() {
  if (!cacheDir) {
    cacheDir = path.join(app.getPath('userData'), 'sprites');
    try { fs.mkdirSync(cacheDir, { recursive: true }); } catch { /* ignora */ }
  }
  return cacheDir;
}

function baixar(url) {
  return new Promise((resolve, reject) => {
    const req = net.request(url);
    const partes = [];
    req.on('response', (res) => {
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`HTTP ${res.statusCode}`)); return; }
      res.on('data', (c) => partes.push(c));
      res.on('end', () => resolve(Buffer.concat(partes)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

/**
 * O primeiro quadro da folha, quadrado e do tamanho do card.
 *
 * O quadro costuma ser mais alto que largo (o bicho em pe). Encaixar num
 * quadrado deformaria: entao a imagem e reduzida mantendo a proporcao, pelo
 * lado maior.
 */
function recortar(buf, colunas, frames) {
  const folha = nativeImage.createFromBuffer(buf);
  const { width, height } = folha.getSize();
  if (!width || !height) throw new Error('imagem vazia');

  const w = Math.floor(width / Math.max(1, colunas));
  const h = Math.floor(height / Math.max(1, frames));
  if (w < 2 || h < 2) throw new Error(`grade suspeita: ${colunas}x${frames} em ${width}x${height}`);

  const quadro = folha.crop({ x: 0, y: 0, width: w, height: h });
  // resize com so uma dimensao preserva a proporcao.
  const menor = h >= w ? quadro.resize({ height: LADO, quality: 'good' }) : quadro.resize({ width: LADO, quality: 'good' });
  return menor.toPNG();
}

/**
 * Retrato de uma especie, como data: URL. Devolve null se nao der - quem chama
 * mostra o nome sem imagem, que e melhor do que um card quebrado.
 *
 * @param {string} id        id da especie, ex 'agumon'
 * @param {object} especie   a entrada do catalogo (sprite, colunas, frames)
 */
async function retrato(id, especie) {
  if (!id) return null;
  if (memoria.has(id)) return memoria.get(id);
  if (emVoo.has(id)) return emVoo.get(id);

  const tarefa = (async () => {
    const arq = path.join(dir(), `${id}.png`);
    // O disco primeiro: sprites nao mudam, e isto sobrevive ao reinicio.
    try {
      const png = fs.readFileSync(arq);
      const url = `data:image/png;base64,${png.toString('base64')}`;
      memoria.set(id, url);
      return url;
    } catch { /* ainda nao baixado */ }

    if (!especie || !especie.sprite) return null;
    try {
      const buf = await baixar(`${BASE}${especie.sprite}.png`);
      const png = recortar(buf, especie.colunas || 8, especie.frames || 16);
      try { fs.writeFileSync(arq, png); } catch { /* cache e opcional */ }
      const url = `data:image/png;base64,${png.toString('base64')}`;
      memoria.set(id, url);
      return url;
    } catch (err) {
      console.error(`[sprites] ${id}:`, err.message);
      memoria.set(id, null); // nao fica tentando de novo a cada atualizacao
      return null;
    }
  })();

  emVoo.set(id, tarefa);
  try { return await tarefa; } finally { emVoo.delete(id); }
}

module.exports = { retrato };
