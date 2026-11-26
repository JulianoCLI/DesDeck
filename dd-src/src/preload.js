'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// Cada card de conta registra os seus próprios ouvintes de headless, então o
// número deles cresce com o número de contas. O limite padrão do Node é 10, e
// a partir da 11ª conta o ipcRenderer passou a despejar MaxListenersExceeded
// no console — um alarme falso, porque os ouvintes são removidos no _cleanup
// de cada card. O ruído é pior do que inútil: ele esconderia um vazamento de
// verdade. 0 = sem limite.
ipcRenderer.setMaxListeners(0);

const on = (channel) => (cb) => {
  const fn = (_e, ...args) => cb(...args);
  ipcRenderer.on(channel, fn);
  return () => ipcRenderer.removeListener(channel, fn);
};

contextBridge.exposeInMainWorld('deck', {
  getState: () => ipcRenderer.invoke('state:get'),
  saveState: (s) => ipcRenderer.invoke('state:save', s),
  unlock: (password) => ipcRenderer.invoke('vault:unlock', password),
  verifyPassword: (password) => ipcRenderer.invoke('vault:verify', password),
  setPassword: (o) => ipcRenderer.invoke('vault:set-password', o),
  removePassword: (current) => ipcRenderer.invoke('vault:remove-password', current),
  resetVault: () => ipcRenderer.invoke('vault:reset'),
  info: () => ipcRenderer.invoke('app:info'),
  notify: (o) => ipcRenderer.invoke('notify', o),
  remoteAlert: (text) => ipcRenderer.invoke('remote-alert', text),
  capture: (wcId, opts) => ipcRenderer.invoke('capture', wcId, opts),
  metrics: (list) => ipcRenderer.invoke('metrics', list),
  forceReload: (wcId) => ipcRenderer.invoke('wc:force-reload', wcId),
  keepPainting: (wcId, on) => ipcRenderer.invoke('wc:keep-painting', wcId, !!on),
  clearPartition: (p) => ipcRenderer.invoke('partition:clear', p),
  applyProxy: (partition, proxy) => ipcRenderer.invoke('proxy:apply', partition, proxy),
  armProxy: (partition) => ipcRenderer.invoke('proxy:arm', partition),
  testProxy: (proxy) => ipcRenderer.invoke('proxy:test', proxy),
  setBadge: (n) => ipcRenderer.invoke('badge', n),
  flash: () => ipcRenderer.invoke('flash'),
  exportBackup: (password) => ipcRenderer.invoke('backup:export', password),
  importBackup: () => ipcRenderer.invoke('backup:import'),
  decryptBackup: (password) => ipcRenderer.invoke('backup:decrypt', password),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openDataFolder: () => ipcRenderer.invoke('open-data-folder'),
  quit: () => ipcRenderer.invoke('app:quit'),
  updateStatus: () => ipcRenderer.invoke('update:status'),
  updateCheck: () => ipcRenderer.invoke('update:check'),
  updateChannel: (c) => ipcRenderer.invoke('update:channel', c),
  updateInstall: () => ipcRenderer.invoke('update:install'),
  onUpdate: on('update:status'),
  onShortcut: on('shortcut'),
  onNotifyClick: on('notify-click'),
  onAway: on('win:away'),
  onBack: on('win:back'),

  // Headless (Fase 1-3)
  headlessStart: (accId, options) => ipcRenderer.invoke('headless:start', accId, options),
  headlessStop: (accId) => ipcRenderer.invoke('headless:stop', accId),
  headlessStatus: (accId) => ipcRenderer.invoke('headless:status', accId),
  headlessToolStart: (accId, toolId, config) => ipcRenderer.invoke('headless:tool:start', accId, toolId, config),
  headlessToolStop: (accId, toolId) => ipcRenderer.invoke('headless:tool:stop', accId, toolId),
  // Só leitura, para a tela do Auto Seller mostrar "você tem N na mochila" e a
  // média de 7 dias antes de a pessoa decidir o preço.
  headlessMochila: (accId) => ipcRenderer.invoke('headless:mochila', accId),
  headlessMercadoMedia: (accId, item, moeda) => ipcRenderer.invoke('headless:mercado:media', accId, item, moeda),
  // Os retratos pedidos por espécie. A lista de ovos guarda só o id da
  // espécie; a imagem vem daqui, do cache de sprites do processo principal.
  retratos: (especies) => ipcRenderer.invoke('sprites:retratos', especies),
  // A bolsa crua de uma conta em modo webview ganha nome e letra aqui.
  ovosBolsa: (lista) => ipcRenderer.invoke('ovos:bolsa', lista),
  onHeadlessUpdate: on('headless:account:update'),
  onHeadlessStatus: on('headless:account:status'),
  onHeadlessError: on('headless:account:error'),
  onHeadlessPainel: on('headless:account:painel'),
  onHeadlessAtividade: on('headless:account:atividade'),
  // Os ovos que a conta tem agora. Não é histórico: é um retrato da bolsa, que
  // chega inteiro a cada vez e substitui o anterior.
  onHeadlessBolsa: on('headless:account:bolsa'),

  // Cadastro em lote (Fase B/C)
  cadastroStart: (config) => ipcRenderer.invoke('cadastro:start', config),
  cadastroStatus: (id) => ipcRenderer.invoke('cadastro:status', id),
  cadastroStop: (id) => ipcRenderer.invoke('cadastro:stop', id),
  cadastroPresets: () => ipcRenderer.invoke('cadastro:presets'),
  cadastroValidarSenha: (senha) => ipcRenderer.invoke('cadastro:validar-senha', senha),
  cadastroValidarCustom: (sufixos) => ipcRenderer.invoke('cadastro:validar-custom', sufixos),
});
