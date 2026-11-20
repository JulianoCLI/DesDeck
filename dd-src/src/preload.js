'use strict';
const { contextBridge, ipcRenderer } = require('electron');

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
  onHeadlessUpdate: on('headless:account:update'),
  onHeadlessStatus: on('headless:account:status'),
  onHeadlessError: on('headless:account:error'),
});
