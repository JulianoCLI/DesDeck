'use strict';
// Ícones do app (janela, bandeja, notificações) feitos a partir do logo em src/renderer/logo.png.
const path = require('path');
const fs = require('fs');
const { nativeImage } = require('electron');

const LOGO = path.join(__dirname, 'renderer', 'logo.png');
const RED = [255, 77, 94];

// Pinta um círculo vermelho (com borda suave) no bitmap BGRA.
function paintDot(buf, size, cx, cy, r) {
  const S = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hit = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const px = (x + (sx + 0.5) / S) / size, py = (y + (sy + 0.5) / S) / size;
          if ((px - cx) ** 2 + (py - cy) ** 2 <= r * r) hit++;
        }
      }
      if (!hit) continue;
      const a = hit / (S * S), i = (y * size + x) * 4;
      buf[i] = Math.round(RED[2] * a + buf[i] * (1 - a));
      buf[i + 1] = Math.round(RED[1] * a + buf[i + 1] * (1 - a));
      buf[i + 2] = Math.round(RED[0] * a + buf[i + 2] * (1 - a));
      buf[i + 3] = Math.round(255 * a + buf[i + 3] * (1 - a));
    }
  }
}

function makeIcon(size, { badge = false } = {}) {
  const img = nativeImage.createFromPath(LOGO).resize({ width: size, height: size, quality: 'best' });
  if (!badge) return img;
  const buf = Buffer.from(img.toBitmap());
  paintDot(buf, size, 0.79, 0.21, 0.2);
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

function makeDot(size) {
  const buf = Buffer.alloc(size * size * 4);
  paintDot(buf, size, 0.5, 0.5, 0.42);
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

// Grava um .ico (várias resoluções em PNG) feito do logo. O Windows usa o .ico para o
// botão da barra de tarefas; sem ele, rodando por "npm start", aparece o átomo do electron.exe.
function writeIco(file, sizes = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256]) {
  const src = nativeImage.createFromPath(LOGO);
  const pngs = sizes.map((s) => src.resize({ width: s, height: s, quality: 'best' }).toPNG());
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2); // 1 = ícone
  head.writeUInt16LE(pngs.length, 4);
  let off = head.length;
  pngs.forEach((png, i) => {
    const o = 6 + 16 * i, s = sizes[i] >= 256 ? 0 : sizes[i]; // 0 = 256px
    head.writeUInt8(s, o);
    head.writeUInt8(s, o + 1);
    head.writeUInt16LE(1, o + 4); // planos
    head.writeUInt16LE(32, o + 6); // bits por pixel
    head.writeUInt32LE(png.length, o + 8);
    head.writeUInt32LE(off, o + 12);
    off += png.length;
  });
  fs.writeFileSync(file, Buffer.concat([head, ...pngs]));
  return file;
}

module.exports = { makeIcon, makeDot, writeIco };
