'use strict';
// O 'deck' falso do teste do Painel.
//
// Troca o preload de verdade por um dublê: nada de IPC, nada de rede, nada de
// webview navegando. O app.js roda inteiro e sem saber disso — é a única forma
// de testar renderDash()/renderOvos() como o usuário os vê, em vez de testar um
// recorte do arquivo que pode divergir do original.
const { contextBridge, ipcRenderer } = require('electron');

const ouvintes = new Map(); // canal -> Set<cb>
const on = (canal) => (cb) => {
  if (!ouvintes.has(canal)) ouvintes.set(canal, new Set());
  ouvintes.get(canal).add(cb);
  return () => ouvintes.get(canal).delete(cb);
};
const nada = () => Promise.resolve();

// O estado inicial: duas contas em headless, histórico vazio. O teste alimenta
// o resto pelos eventos, como o processo principal faria.
const CONTAS = [
  { id: 'a1', name: 'desum', url: 'https://digiidle.com/', enabled: true, headless: true, groupId: 'g1', createdAt: 1, stats: { onlineMs: 0, drops: 0, recoveries: 0 } },
  { id: 'a2', name: 'desdois', url: 'https://digiidle.com/', enabled: true, headless: true, groupId: 'g1', createdAt: 2, stats: { onlineMs: 0, drops: 0, recoveries: 0 } },
];

let salvo = null;

contextBridge.exposeInMainWorld('deck', {
  getState: () => Promise.resolve({
    locked: false,
    vault: { mode: null },
    state: { version: 2, groups: [{ id: 'g1', name: 'DigiIdle', color: '#4ade80', limit: 0 }], accounts: CONTAS, scripts: [], tools: {}, log: [], ovos: [], daily: {}, ui: { view: 'dash', current: 'a1', groupFilter: 'g1', mix: false } },
  }),
  // Guardar o que foi salvo é o que prova o que persiste e o que não persiste.
  saveState: (s) => { salvo = s; return Promise.resolve({ ok: true }); },
  info: () => Promise.resolve({ version: 'teste', platform: process.platform }),
  updateStatus: () => Promise.resolve({ state: 'unsupported' }),
  metrics: () => Promise.resolve([]),
  capture: () => Promise.resolve(null),
  notify: nada, remoteAlert: nada, setBadge: nada, flash: nada,
  applyProxy: nada, clearPartition: nada, forceReload: nada, keepPainting: nada,
  // O headless nunca sobe no teste: nada de socket, nada de rede.
  headlessStart: nada, headlessStop: nada,
  headlessStatus: () => Promise.resolve({ active: false, status: 'inactive', state: null }),
  headlessToolStart: nada, headlessToolStop: nada,
  updateCheck: nada, updateChannel: nada, updateInstall: nada,
  openExternal: nada, openDataFolder: nada, quit: nada,
  exportBackup: nada, importBackup: nada, decryptBackup: nada,
  unlock: nada, verifyPassword: nada, setPassword: nada, removePassword: nada, resetVault: nada,
  onUpdate: on('update'), onShortcut: on('shortcut'), onNotifyClick: on('notify'),
  onAway: on('away'), onBack: on('back'),
  onHeadlessUpdate: on('hl:update'),
  onHeadlessStatus: on('hl:status'),
  onHeadlessError: on('hl:error'),
  onHeadlessPainel: on('hl:painel'),
  onHeadlessAtividade: on('hl:atividade'),
  onHeadlessBolsa: on('hl:bolsa'),
  // A bolsa das contas em modo webview passa por aqui para ganhar nome e letra.
  // No teste os ovos já chegam prontos, então é a identidade.
  ovosBolsa: (l) => Promise.resolve(l || []),
  onHeadlessDigimons: on('hl:digimons'),
  ovosDigimons: (g) => Promise.resolve([
    ...((g && g.equipe) || []), ...((g && g.depot) || []), ...((g && g.colecao) || []),
  ]),
  retratos: () => Promise.resolve({}),
});

// A torneira do teste: dispara um evento como se viesse do processo principal.
contextBridge.exposeInMainWorld('tst', {
  emitir: (canal, carga) => {
    for (const cb of ouvintes.get(canal) || []) cb(carga);
  },
  salvo: () => salvo,
});
