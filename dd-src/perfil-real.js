'use strict';
/**
 * O diretorio de dados do DesDeck, para os scripts de teste e diagnostico.
 *
 * Os scripts chutavam '%APPDATA%\DigiDeck' e liam um perfil antigo e abandonado:
 * o diagnostico mostrava 4 contas em modo webview enquanto o app rodava 8 contas
 * em headless, e eu quase tratei a correcao como regressao por causa disso.
 *
 * O nome certo e o "name" do package.json, de onde o Electron deriva o userData
 * quando o app roda normalmente. Rodando um script solto
 * (electron.exe script.js) ele usaria 'Electron', entao o nome tem que ser
 * fixado antes de ler o caminho.
 *
 * Uso: const DATA_DIR = require('./perfil-real').usar();  // antes do whenReady
 */
const path = require('path');
const { app } = require('electron');

function usar() {
  const nome = require(path.join(__dirname, 'package.json')).name;
  app.setName(nome);
  // setName sozinho nao move o userData se ele ja foi resolvido, entao o caminho
  // e montado e aplicado explicitamente.
  const dir = path.join(app.getPath('appData'), nome);
  app.setPath('userData', dir);
  return dir;
}

module.exports = { usar, dir: () => app.getPath('userData') };
