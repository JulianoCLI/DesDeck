'use strict';
// Atualização automática (electron-updater, provedor "generic" em deck.digiidle.com/updates/).
// Só vale para a versão instalada (NSIS). A portátil e o modo dev apenas ficam de fora.
// Como os jogos rodam 24/7, nunca reinicia sozinho: baixa em segundo plano e instala ao sair
// ou quando o usuário clica em "Reiniciar e atualizar".

const CHECK_FIRST_MS = 30 * 1000;
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;

const fs = require('fs');
const path = require('path');

// Canais: stable -> latest.yml, beta -> beta.yml, nightly -> nightly.yml (no servidor).
const CHANNELS = ['stable', 'beta', 'nightly'];
const feedName = (c) => (c === 'stable' ? 'latest' : c);

function createUpdater({ app, send, beforeInstall, log = () => {} }) {
  const portable = !!process.env.PORTABLE_EXECUTABLE_FILE;
  const supported = app.isPackaged && !portable && process.platform === 'win32';

  let status = { state: supported ? 'idle' : 'unsupported', version: null, percent: 0, error: null };
  let autoUpdater = null;
  let timer = null;

  // A escolha fica num arquivo simples (não no cofre): precisa valer mesmo com o app bloqueado.
  const prefFile = () => path.join(app.getPath('userData'), 'update-channel.json');
  function loadChannel() {
    try {
      const c = JSON.parse(fs.readFileSync(prefFile(), 'utf8')).channel;
      if (CHANNELS.includes(c)) return c;
    } catch { /* padrão */ }
    // Sem escolha salva: segue o canal da própria versão (0.4.0-beta.1 -> beta).
    const tag = (String(app.getVersion()).split('-')[1] || '').split('.')[0];
    return CHANNELS.includes(tag) ? tag : 'stable';
  }
  let channel = loadChannel();
  status.channel = channel;

  function set(patch) {
    status = { ...status, ...patch };
    send('update:status', status);
  }

  function init() {
    if (!supported || autoUpdater) return;
    try {
      ({ autoUpdater } = require('electron-updater'));
    } catch (err) {
      log('electron-updater indisponível', err);
      status = { ...status, state: 'unsupported' };
      return;
    }
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = false;
    // Downgrade liberado: voltar de beta para estável, ou o servidor apontar o canal para uma versão anterior (rollback).
    autoUpdater.allowDowngrade = true;
    autoUpdater.channel = feedName(channel);
    autoUpdater.logger = { info() {}, warn: (m) => log(m), error: (m) => log(m), debug() {} };

    autoUpdater.on('checking-for-update', () => set({ state: 'checking', error: null }));
    autoUpdater.on('update-available', (i) => set({ state: 'downloading', version: i.version, percent: 0 }));
    autoUpdater.on('update-not-available', () => set({ state: 'current', version: null }));
    autoUpdater.on('download-progress', (p) => set({ state: 'downloading', percent: Math.round(p.percent || 0) }));
    autoUpdater.on('update-downloaded', (i) => set({ state: 'ready', version: i.version, percent: 100 }));
    autoUpdater.on('error', (err) => set({ state: 'error', error: String((err && err.message) || err).slice(0, 300) }));

    setTimeout(check, CHECK_FIRST_MS);
    timer = setInterval(check, CHECK_EVERY_MS);
    timer.unref();
  }

  async function check() {
    if (!autoUpdater || status.state === 'checking' || status.state === 'downloading' || status.state === 'ready') return status;
    try { await autoUpdater.checkForUpdates(); } catch { /* o evento 'error' já cuida */ }
    return status;
  }

  async function setChannel(next) {
    if (!CHANNELS.includes(next) || next === channel) return status;
    channel = next;
    try { fs.writeFileSync(prefFile(), JSON.stringify({ channel })); } catch (err) { log('não salvou o canal', err); }
    if (!autoUpdater) { set({ channel }); return status; }
    autoUpdater.channel = feedName(channel);
    // Zera o estado para o 'ready' do canal antigo não impedir a nova checagem.
    set({ channel, state: 'idle', version: null, percent: 0, error: null });
    return check();
  }

  function installNow() {
    if (!autoUpdater || status.state !== 'ready') return false;
    beforeInstall();
    // isSilent=true: sem janela do instalador; isForceRunAfter=true: reabre o DigiDeck depois.
    autoUpdater.quitAndInstall(true, true);
    return true;
  }

  return { init, check, setChannel, installNow, getStatus: () => status };
}

module.exports = { createUpdater, CHANNELS };
