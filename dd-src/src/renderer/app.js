'use strict';
/* global deck */

// =============================================================== helpers
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v)) {
        if (sk.startsWith('--')) el.style.setProperty(sk, sv);
        else el.style[sk] = sv;
      }
    } else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const ICONS = {
  palette: '<circle cx="13.5" cy="6.5" r="1.2"/><circle cx="17.5" cy="10.5" r="1.2"/><circle cx="8.5" cy="7.5" r="1.2"/><circle cx="6.5" cy="12.5" r="1.2"/><path d="M12 2a10 10 0 0 0 0 20c.9 0 1.6-.7 1.6-1.6 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16a6 6 0 0 0 6-6C22 6 17.5 2 12 2z"/>',
  reload: '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  vol: '<path d="M11 5L6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>',
  mute: '<path d="M11 5L6 9H2v6h4l5 4z"/><path d="M22 9l-6 6"/><path d="M16 9l6 6"/>',
  expand: '<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>',
  shrink: '<path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M3 21l7-7"/>',
  more: '<circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/>',
  grip: '<circle cx="9" cy="6" r="1.2" fill="currentColor"/><circle cx="15" cy="6" r="1.2" fill="currentColor"/><circle cx="9" cy="12" r="1.2" fill="currentColor"/><circle cx="15" cy="12" r="1.2" fill="currentColor"/><circle cx="9" cy="18" r="1.2" fill="currentColor"/><circle cx="15" cy="18" r="1.2" fill="currentColor"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  power: '<path d="M12 3v9"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h9"/>',
  code: '<path d="M8 6l-6 6 6 6"/><path d="M16 6l6 6-6 6"/>',
  swap: '<path d="M4 7h13l-3-3"/><path d="M20 17H7l3 3"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21h4"/>',
  folder: '<path d="M3 6h6l2 2h10v11H3z"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  split: '<rect x="3" y="4" width="7" height="16" rx="2"/><rect x="14" y="4" width="7" height="16" rx="2"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.6 0l3-3a4 4 0 0 0-5.6-5.6l-1 1"/><path d="M14 10a4 4 0 0 0-5.6 0l-3 3a4 4 0 0 0 5.6 5.6l1-1"/>',
  grid: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>',
  main: '<rect x="3" y="4" width="12" height="16" rx="2"/><path d="M18.5 4h1.5a1 1 0 0 1 1 1v4M18.5 20h1.5a1 1 0 0 0 1-1v-4M18.5 12h2.5"/>',
  focus: '<rect x="3" y="4" width="18" height="16" rx="2"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  move: '<path d="M12 3v18M3 12h18"/><path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 5.2a3.5 3.5 0 0 1 0 5.6"/><path d="M17.5 14.2a6.5 6.5 0 0 1 4 5.8"/>',
};
function icon(name, size = 16) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', size);
  s.setAttribute('height', size);
  s.setAttribute('aria-hidden', 'true');
  s.classList.add('ic');
  s.innerHTML = ICONS[name] || '';
  return s;
}
function iconBtn(name, title, onclick, cls = 'icon-btn') {
  return h('button', {
    class: cls, title, 'aria-label': title, draggable: 'false',
    onclick: (e) => { e.stopPropagation(); onclick(e); },
  }, icon(name));
}
const logoEl = () => h('img', { class: 'logo', src: 'mark.png', alt: '', draggable: 'false' });

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const pad2 = (n) => String(n).padStart(2, '0');

const fmtNum = (n) => Number(n || 0).toLocaleString('pt-BR');

// Os status do socket headless, em português. No card eles apareciam crus
// ('disconnected', 'failed'), o que não dizia nada a quem não leu o código.
const HEADLESS_ROTULO = {
  disconnected: 'desligado',
  connecting: 'conectando…',
  connected: 'Headless',
  reconnecting: 'reconectando…',
  failed: 'falhou',
};

function fmtDur(ms) {
  if (!ms || ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), hh = Math.floor((s % 86400) / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  if (d) return `${d}d ${hh}h`;
  if (hh) return `${hh}h ${pad2(mm)}m`;
  if (mm) return `${mm}m ${pad2(ss)}s`;
  return `${ss}s`;
}
function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`;
}
const fmtTime = (t) => { const d = new Date(t); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const fmtMem = (kb) => (kb == null ? '—' : kb > 1048576 ? (kb / 1048576).toFixed(1) + ' GB' : Math.round(kb / 1024) + ' MB');
const fmtCpu = (c) => (c == null ? '—' : c.toFixed(c < 10 ? 1 : 0) + '%');
const dayKey = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

// =============================================================== dados
const DIGIIDLE = { name: 'DigiIdle', url: 'https://digiidle.com/' };
const isDigi = (url) => /^https?:\/\/(www\.)?digiidle\.com(\.br)?\//i.test(url || '');
// Tons de azul do tema Oceano & Ouro. Grupos salvos com os cinzas do tema antigo (GRAYS) ou com a paleta
// colorida mais antiga (OLD_COLORS) são convertidos na hora, mantendo a posição do tom.
const COLORS = ['#e6f6ff', '#bfe3f5', '#9cc3dc', '#7fa6c2', '#668aa6', '#4f6f8a', '#3c5873', '#2c435c'];
const GRAYS = ['#fafafa', '#d4d4d4', '#a3a3a3', '#8a8a8a', '#737373', '#5c5c5c', '#474747', '#333333'];
// Cores neon do emblema (logo): azul, vermelho, laranja, amarelo, verde, roxo, ciano.
const LOGO_COLORS = ['#2f7bff', '#ff3b3b', '#ff8a1f', '#ffd21f', '#2fe05a', '#a64dff', '#1fd9ff'];
// Cores que a pessoa pode dar a cada conta (opcional; sem cor, a conta segue o tema).
const ACC_COLORS = ['#22d3ee', '#38bdf8', '#a78bfa', '#f472b6', '#f87171', '#fb923c', '#fbbf24', '#4ade80'];
const accColor = (acc) => (acc && typeof acc.color === 'string' && /^#[0-9a-f]{6}$/i.test(acc.color) ? acc.color : null);
const OLD_COLORS = ['#22d3ee', '#e879f9', '#fbbf24', '#4ade80', '#a78bfa', '#38bdf8', '#fb923c', '#cbd5e1'];
const tone = (c) => (COLORS.includes(c) || LOGO_COLORS.includes(c) ? c : COLORS[GRAYS.indexOf(c)] || COLORS[OLD_COLORS.indexOf(c)] || COLORS[0]);
const BACKOFF = [5, 10, 20, 30, 60, 120, 300].map((s) => s * 1000);
const PROBE_JS = '(() => { const b = document.body; return { t: b ? b.innerText.slice(0, 120000) : "", title: document.title }; })()';
const ALERT_TYPES = ['alert', 'word', 'freeze', 'drop-alert'];

// =============================================================== scripts do usuário
// Roda JS do usuário dentro da página de cada conta, via executeJavaScript (o mesmo
// caminho do PROBE_JS acima). A página segue em sandbox, sem Node: um script só mexe
// no DOM do próprio jogo. Erro em um script não atrapalha os outros nem o DigiDeck.

// "https://jogo.com/*" -> casa com qualquer coisa depois da barra. Vazio = qualquer URL.
function scriptMatches(pattern, url) {
  if (!pattern) return true;
  const rx = String(pattern).replace(/[.+^${}()|[\]\\?]/g, '\\$&').replace(/\*/g, '.*');
  try { return new RegExp('^' + rx + '$').test(url); } catch { return false; }
}

// API mínima oferecida ao script, montada dentro da própria página.
// O storage é por script e persiste no localStorage da partição daquela conta.
const DD_API_JS = `(() => {
  const SID = __DD_SID__;
  const KEY = 'digideck:script:' + SID;
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const tag = '[script ' + SID + ']';
  return {
    log: (...a) => console.log(tag, ...a),
    storage: {
      get: (k) => read()[k],
      set: (k, v) => {
        const all = read(); all[k] = v;
        try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* cota cheia */ }
      },
      remove: (k) => {
        const all = read(); delete all[k];
        try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* ignora */ }
      },
    },
    waitFor: (sel, timeout = 10000) => new Promise((resolve) => {
      const found = document.querySelector(sel);
      if (found) return resolve(found);
      const root = document.body || document.documentElement;
      const obs = new MutationObserver(() => {
        const el = document.querySelector(sel);
        if (el) { obs.disconnect(); clearTimeout(t); resolve(el); }
      });
      const t = setTimeout(() => { obs.disconnect(); resolve(null); }, timeout);
      obs.observe(root, { childList: true, subtree: true });
    }),
    onTick: (fn, every = 1000) => {
      const id = setInterval(() => {
        try { fn(); } catch (err) { console.error(tag, 'tick', err); }
      }, every);
      return () => clearInterval(id);
    },
  };
})()`;

// Embrulha o código do usuário: recebe DD como parâmetro e nunca deixa um erro escapar.
function wrapUserScript(script) {
  const sid = JSON.stringify(String(script.id || 'anon'));
  return `(() => {
  const DD = ${DD_API_JS.replace('__DD_SID__', sid)};
  window.DD = DD;
  try {
${script.code || ''}
  } catch (err) {
    console.error('[script ' + ${sid} + '] falhou:', err);
  }
})()`;
}

function scriptsFor(url, accId) {
  return (state.scripts || []).filter((s) => s && s.enabled && s.code
    && (!Array.isArray(s.accountIds) || !s.accountIds.length || s.accountIds.includes(accId))
    && scriptMatches(s.matchUrl, url));
}

// Esta conta está rodando sem webview (modo headless)?
//
// São três estados, não dois, e por isso acc.headless é tri-estado:
//   true      -> headless, independente da preferência geral
//   false     -> webview, independente da preferência geral (a pessoa saiu do
//                headless nesta conta mesmo com "iniciar todas em headless")
//   undefined -> segue a preferência geral
//
// Sem o false explícito, com bootHeadless ligado não havia como tirar UMA conta
// do headless: a preferência vencia sempre e o botão de energia não saía do modo.
function isHeadless(accId) {
  const acc = state.accounts?.find((a) => a.id === accId);
  if (!acc) return false;
  if (typeof acc.headless === 'boolean') return acc.headless;
  return !!state.settings?.bootHeadless;
}

// Liga/desliga uma ferramenta numa conta headless. A config é a mesma da versão
// do webview (defaults + ajustes da pessoa); quem executa é src/headless/tools.js.
async function applyToolHeadless(toolId, accId, tool, conf) {
  try {
    if (conf && conf.enabled) {
      const cfg = { ...tool.defaults(), ...(conf.cfg || {}) };
      await deck.headlessToolStart(accId, toolId, cfg);
    } else {
      await deck.headlessToolStop(accId, toolId);
    }
    return true;
  } catch (err) {
    console.error('[ferramentas] headless falhou', toolId, accId, err);
    return false;
  }
}

// Liga em uma conta headless todas as ferramentas marcadas para ela. Chamado
// quando o socket fica de pé (conexão e cada reconexão).
function applyToolsHeadless(accId) {
  for (const t of (window.DDTools?.TOOLS || [])) {
    const conf = state.tools?.[t.id]?.[accId];
    if (!conf || !conf.enabled) continue;
    applyToolHeadless(t.id, accId, t, conf);
  }
}

// Ferramentas ligadas para esta conta, já viradas em código. Só valem no DigiIdle:
// os comandos ('market.comprar', 'ovo.vender') são do jogo e não existem em outro site.
function toolScriptsFor(url, accId) {
  if (!isDigi(url)) return [];
  const out = [];
  for (const t of (window.DDTools?.TOOLS || [])) {
    const conf = state.tools?.[t.id]?.[accId];
    if (!conf || !conf.enabled) continue;
    out.push({ id: `tool-${t.id}`, name: t.name, code: t.code({ ...t.defaults(), ...(conf.cfg || {}) }) });
  }
  return out;
}

// Aplica a ferramenta numa conta que já está aberta, sem F5.
//
// Reinjetar o código é seguro e é justamente o mecanismo: a ponte guarda a config em
// G.cfg[id], e o script reinjetado só troca os valores desse objeto e sai, deixando o
// laço que já roda seguir com os ajustes novos. Sem isso, reinjetar criaria um segundo
// laço e as compras sairiam em dobro.
//
// Contas fechadas ou noutro site são ignoradas: elas recebem a config nova no dom-ready.
async function applyToolLive(toolId, accId) {
  const r = rt.get(accId);
  if (!r) return false;

  const tool = window.DDTools?.toolById(toolId);
  if (!tool) return false;
  const conf = state.tools?.[toolId]?.[accId];

  // Conta em headless: não há página para injetar. A mesma ferramenta roda no
  // processo principal, sobre o socket, e recebe a config por IPC.
  if (!r.wv) {
    if (!isHeadless(accId)) return false;
    return applyToolHeadless(toolId, accId, tool, conf);
  }

  let url = '';
  try { url = r.wv.getURL(); } catch { return false; }
  if (!isDigi(url)) return false;

  try {
    if (conf && conf.enabled) {
      await r.wv.executeJavaScript(tool.code({ ...tool.defaults(), ...(conf.cfg || {}) }));
    } else {
      await r.wv.executeJavaScript(window.DDTools.offCode(toolId));
    }
    return true;
  } catch (err) {
    console.error('[ferramentas] não apliquei ao vivo', toolId, accId, err);
    return false;
  }
}

// Chamado no dom-ready de cada conta. Não derruba o carregamento se algo falhar.
async function runUserScripts(id) {
  const r = rt.get(id);
  if (!r || !r.wv) return;
  let url = '';
  try { url = r.wv.getURL(); } catch { return; }
  const list = [...toolScriptsFor(url, id), ...scriptsFor(url, id)];
  for (const s of list) {
    try {
      await r.wv.executeJavaScript(wrapUserScript(s));
    } catch (err) {
      console.error('[scripts] não injetou', s.name, err);
    }
  }
}

const DEFAULT_SETTINGS = {
  closeToTray: true,
  preventSleep: true,
  openAtLogin: false,
  summaryAfterMin: 10,
  sound: true,
  notifications: true,
  flash: true,
  notifyEveryDrop: false,
  alertAfterRetries: 3,
  reloadAfterOutage: true,
  checkIntervalSec: 15,
  watchWords: ['captcha', 'verificação', 'verify you are human'],
  discordWebhook: '',
  telegramToken: '',
  telegramChatId: '',
  remotePrivacy: false,
  autoLockMin: 0,
  economy: true,
};
const DEFAULT_ACCOUNT = {
  enabled: true, muted: false, zoom: 1, autoReloadMin: 0, freezeMin: 0, freezeAction: 'alert', watchWords: [], notes: '',
  alwaysRender: false, color: null,
  // Tri-estado (ver isHeadless): undefined = segue "iniciar todas em headless".
  // false aqui travaria toda conta nova fora do modo, ignorando a preferência.
  headless: undefined,
};

function defaultState() {
  const g = { id: uid(), name: 'DigiIdle', color: COLORS[0], limit: 0 };
  return {
    version: 2,
    settings: { ...DEFAULT_SETTINGS },
    groups: [g],
    accounts: [],
    scripts: [],
    tools: {}, // { [toolId]: { [accountId]: { enabled, cfg } } }
    log: [],
    daily: {},
    ui: { view: 'grid', current: null, groupFilter: g.id, mix: false },
    muteAll: false,
  };
}
function normalize(s) {
  const d = defaultState();
  const out = { ...d, ...s };
  out.settings = { ...DEFAULT_SETTINGS, ...(s.settings || {}) };
  out.groups = Array.isArray(s.groups) && s.groups.length ? s.groups : d.groups;
  out.ui = { ...d.ui, groupFilter: out.groups[0].id, ...(s.ui || {}) };
  if (out.ui.groupFilter === 'all') { out.ui.mix = true; out.ui.groupFilter = out.groups[0].id; }
  out.accounts = (s.accounts || []).filter((a) => a && a.id && a.url).map((a) => ({
    ...DEFAULT_ACCOUNT, ...a,
    // Contas de antes da economia: só o DigiIdle sabe rodar oculto; outros jogos continuam desenhando.
    alwaysRender: typeof a.alwaysRender === 'boolean' ? a.alwaysRender : !isDigi(a.url),
    // headless virou tri-estado. O 'false' das contas antigas era só o padrão de
    // antes, não uma escolha — mantê-lo travaria todas elas fora de "iniciar
    // todas em headless". Então false volta a ser "segue a preferência"; só o
    // true (que só existe se a pessoa ligou o modo) é preservado.
    headless: a.headless === true ? true : undefined,
    color: accColor(a),
    stats: { onlineMs: 0, drops: 0, recoveries: 0, ...(a.stats || {}) },
  }));
  out.tools = s.tools && typeof s.tools === 'object' ? s.tools : {};
  out.log = Array.isArray(s.log) ? s.log.slice(-800) : [];
  out.daily = s.daily || {};
  return out;
}

let state = null;
let info = {};
let vaultInfo = { mode: null };
let started = false;
let lockedUI = false;
const rt = new Map(); // runtime por conta: webview, status, timers…
let unseen = 0;
let awaySince = null;
let netDownAt = null;
let metricsTotal = null;
let lastTickAt = Date.now();
let dragId = null;

const accById = (id) => state.accounts.find((a) => a.id === id);
const groupById = (id) => state.groups.find((g) => g.id === id);
const groupOf = (acc) => groupById(acc.groupId) || null;
const screenOf = (acc) => (groupOf(acc) ? acc.groupId : 'none');
const screenName = (key) => (key === 'none' ? 'Sem grupo' : groupById(key)?.name || '');
const partitionOf = (id) => `persist:acc-${id}`;

function today() {
  const k = dayKey();
  if (!state.daily[k]) {
    state.daily[k] = { drops: 0, recoveries: 0, alerts: 0, onlineMs: 0 };
    const keys = Object.keys(state.daily).sort();
    while (keys.length > 60) delete state.daily[keys.shift()];
  }
  return state.daily[k];
}

// ---------------------------------------------------------------- persistência
let dirty = false;
let saveTimer = null;
function flush() {
  dirty = false;
  clearTimeout(saveTimer);
  return deck.saveState(state);
}
function save() { dirty = true; clearTimeout(saveTimer); saveTimer = setTimeout(flush, 350); }
function markDirty() { dirty = true; }

function log(type, acc, msg) {
  state.log.push({ t: Date.now(), type, accId: acc ? acc.id : null, name: acc ? acc.name : '', msg });
  if (state.log.length > 800) state.log.splice(0, state.log.length - 800);
  markDirty();
  if (state.ui.view === 'dash') renderLog();
}

// =============================================================== alertas
let audioCtx = null;
function beep(kind = 'warn') {
  try {
    audioCtx = audioCtx || new AudioContext();
    const t0 = audioCtx.currentTime;
    const tones = kind === 'info' ? [660, 880] : [880, 660, 880];
    tones.forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain(), t = t0 + i * 0.16;
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      o.connect(g).connect(audioCtx.destination);
      o.start(t);
      o.stop(t + 0.16);
    });
  } catch { /* sem áudio */ }
}

function remoteEnabled() {
  const s = state.settings;
  return !!(s.discordWebhook || (s.telegramToken && s.telegramChatId));
}

function raiseAlert(acc, title, body, { type = 'alert' } = {}) {
  const s = state.settings;
  log(type, acc, `${title}: ${body}`);
  today().alerts++;
  unseen++;
  deck.setBadge(unseen);
  const r = acc && rt.get(acc.id);
  if (r) { r.attention = true; r.tile.classList.add('attention'); }
  if (s.notifications) deck.notify({ title: `${acc ? acc.name + ' · ' : ''}${title}`, body, accId: acc ? acc.id : null });
  if (s.sound) beep('warn');
  if (s.flash) deck.flash();
  if (remoteEnabled()) {
    deck.remoteAlert(s.remotePrivacy ? `⚠️ DigiDeck: ${title}. Abra o app para ver.` : `⚠️ ${acc ? acc.name + ' — ' : ''}${title}\n${body}`);
  }
  toast(`${acc ? acc.name + ': ' : ''}${title}`, 'warn');
  updateTitle();
}

function infoNotice(acc, title, body) {
  const s = state.settings;
  if (s.notifications) deck.notify({ title, body, accId: acc ? acc.id : null });
  if (s.sound) beep('info');
  if (remoteEnabled()) deck.remoteAlert(s.remotePrivacy ? '✅ DigiDeck: uma conta voltou sozinha.' : `✅ ${title}\n${body}`);
}

function clearAttention(id) {
  const r = rt.get(id);
  if (r && r.attention) { r.attention = false; r.tile.classList.remove('attention'); }
}

// =============================================================== contas (runtime)
// Navega uma conta já existente. Depois do primeiro carregamento (atributo "src") o webview
// aceita loadURL; se ainda não anexou, cai de volta no src para não perder a navegação.
function navigate(r, url) {
  if (!r || !r.wv || !/^https?:\/\//i.test(url || '')) return;
  try {
    const p = r.wv.loadURL(url);
    if (p && typeof p.catch === 'function') p.catch((err) => console.error('[account] loadURL', url, err));
  } catch (err) {
    console.error('[account] loadURL indisponível, usando src:', err);
    r.wv.setAttribute('src', url);
  }
}

// Liga os eventos do jogo a um <webview>. Fica numa função separada porque o elemento
// pode ser recriado (ver recreateWebview): um renderer pendurado num loop infinito só
// se destrava substituindo o elemento, e o novo precisa dos mesmos ouvintes.
function wireWebview(acc, r, wv) {
  const id = acc.id;
  wv.addEventListener('focus', () => { closeMenus(); setCurrent(id, { quiet: true }); raiseFree(id); });
  wv.addEventListener('did-start-loading', () => { r.failedNav = false; });
  wv.addEventListener('dom-ready', () => {
    try { r.wcId = wv.getWebContentsId(); } catch { /* ainda não anexou */ }
    applyPainting(id);
    // Só pode dormir depois de desenhar ao menos uma vez (sem isso a captura da miniatura falha).
    if (r.sleepOkAt === Infinity) {
      r.sleepOkAt = Date.now() + 1500;
      setTimeout(updateSleep, 1600);
    }
    applyAudio(id);
    try { wv.setZoomFactor(Number(accById(id)?.zoom) || 1); } catch { /* ignora */ }
    runUserScripts(id); // scripts do usuário desta conta
    markOnline(id);
  });
  wv.addEventListener('did-navigate', (e) => {
    const code = e.httpResponseCode;
    if (code >= 500 || code === 429) { r.failedNav = true; drop(id, `site fora do ar (HTTP ${code})`); }
  });
  wv.addEventListener('did-fail-load', (e) => {
    if (!e.isMainFrame || e.errorCode === -3) return; // -3 = navegação cancelada
    r.failedNav = true;
    // Erros de proxy (códigos reais do Chromium, verificados): -130 ERR_PROXY_CONNECTION_FAILED,
    // -131 ERR_MANDATORY_PROXY_CONFIG_FAILED, -336 ERR_TUNNEL_CONNECTION_FAILED.
    if (e.errorCode === -130 || e.errorCode === -131 || e.errorCode === -336) {
      const group = groupOf(acc);
      drop(id, `proxy falhou (${group?.name || 'desta tela'})`);
    } else {
      drop(id, navigator.onLine ? `não carregou (${e.errorDescription || e.errorCode})` : 'sem internet');
    }
  });
  wv.addEventListener('render-process-gone', (e) => {
    r.ready = false;
    r.sleepOkAt = Infinity; // processo novo: acorda até desenhar de novo
    updateSleep();
    if (r.forcing) { r.forcing = false; return; } // fomos nós que reiniciamos
    drop(id, `a aba do jogo fechou (${(e.details && e.details.reason) || 'travou'})`);
  });
  wv.addEventListener('unresponsive', () => { r.unresponsiveSince = Date.now(); });
  wv.addEventListener('responsive', () => { r.unresponsiveSince = null; });
}

// Troca o <webview> por um novo e recarrega. É a única forma verificada de destravar um
// renderer preso em loop infinito: reloadIgnoringCache() não o interrompe, e
// forcefullyCrashRenderer() seguido de qualquer navegação derruba o processo principal
// (FATAL/NOTREACHED em check.cc).
function recreateWebview(id) {
  const r = rt.get(id);
  const acc = accById(id);
  if (!r || !acc || !r.wv) return false;
  const url = r.lastGoodUrl || acc.url || '';
  if (!/^https?:\/\//i.test(url)) return false;

  const velho = r.wv;
  const novo = document.createElement('webview');
  novo.setAttribute('partition', partitionOf(id));
  novo.setAttribute('allowpopups', '');
  novo.setAttribute('webpreferences', 'backgroundThrottling=yes');

  r.wv = novo;
  r.wcId = null;
  r.ready = false;
  r.sleepOkAt = Infinity;
  wireWebview(acc, r, novo);

  velho.replaceWith(novo);
  try { velho.remove(); } catch { /* já saiu do DOM */ }
  novo.setAttribute('src', url);
  return true;
}

function createRuntime(acc) {
  const id = acc.id;
  const r = {
    id, status: 'loading', reason: '', retries: 0, retryAt: null, retryTimer: null, attemptAt: 0,
    onlineSince: null, dropAt: 0, loadedAt: Date.now(), lastProbe: 0, probing: false, missed: 0,
    unresponsiveSince: null, hung: false, forcing: false, failedNav: false, ready: false, wcId: null, lastGoodUrl: null,
    lastHash: null, hashSince: Date.now(), frozenAlerted: false, wordActive: {}, wordAlertAt: {},
    dropAlerted: false, attention: false, thumb: null, thumbAt: 0, metrics: null,
    front: true, sleeping: false, goingToSleep: false, peeking: false, sleepOkAt: Infinity,
    headlessStatus: 'disconnected', headlessState: null, headlessError: null, headlessUltimoErro: null,
  };

  const wv = document.createElement('webview');
  wv.setAttribute('partition', partitionOf(id));
  wv.setAttribute('allowpopups', '');
  wv.setAttribute('webpreferences', 'backgroundThrottling=yes');
  r.wv = wv;

  const muteBtn = iconBtn(acc.muted ? 'mute' : 'vol', 'Som desta conta', () => toggleMute(id));
  const focusBtn = iconBtn('expand', 'Focar nesta conta (duplo clique no título)', () => toggleFocus(id));
  r.els = {
    name: h('span', { class: 't-name' }, acc.name),
    group: h('span', { class: 't-group' }),
    mute: muteBtn,
    focus: focusBtn,
  };
  const head = h('div', {
    class: 'tile-head',
    draggable: 'true',
    title: 'Arraste para mudar a ordem',
    ondblclick: () => toggleFocus(id),
    onmousedown: () => setCurrent(id, { quiet: true }),
    ondragstart: (e) => startDrag(e, id),
  },
  h('span', { class: 'grip' }, icon('grip', 14)),
  h('span', { class: 'dot load', dataset: { dot: id } }),
  r.els.name,
  r.els.group,
  h('span', { class: 't-status', dataset: { live: 'status:' + id } }),
  h('span', { class: 'spacer' }),
  h('div', { class: 't-btns' },
    iconBtn('back', 'Voltar', () => { if (wv.canGoBack()) wv.goBack(); }),
    iconBtn('home', 'Página inicial do jogo', () => navigate(rt.get(id), accById(id)?.url)),
    iconBtn('reload', 'Recarregar (F5)', () => manualReload(id)),
    muteBtn,
    focusBtn,
    // isHeadless() e não acc.headless: com "iniciar todas em headless" a conta
    // está em headless com acc.headless false, e o botão tentava ENTRAR no modo
    // em que ela já estava — não saía nunca.
    iconBtn('power', 'Alterna modo headless', () => toggleHeadlessMode(id, !isHeadless(id))),
    iconBtn('more', 'Mais opções', (e) => openAccountMenu(id, e.currentTarget))));
  const banner = h('div', { class: 'banner' },
    icon('reload'),
    h('span', { class: 'msg', dataset: { live: 'banner:' + id } }),
    h('button', { class: 'btn sm', onclick: () => retryNow(id) }, 'Tentar agora'));
  r.els.head = head;
  const handles = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map((d) => h('div', {
    class: 'rz rz-' + d, dataset: { dir: d }, title: 'Arraste para redimensionar',
    onpointerdown: (e) => startFree(e, id, d),
  }));
  head.addEventListener('pointerdown', (e) => {
    if (!isFree() || e.button !== 0 || e.target.closest('button')) return;
    startFree(e, id, 'move');
  });
  r.tile = h('div', { class: 'tile', dataset: { id } }, head, h('div', { class: 'wv-wrap' }, wv, banner), handles);
  wireTileDrop(r.tile, id);
  updateTileMeta(acc, r);

  // ---- eventos do jogo
  wireWebview(acc, r, wv);

  rt.set(id, r);
  $('#tiles').append(r.tile);

  // ---- listeners headless (Fase 2)
  // Vale tanto para o toggle da conta quanto para o "iniciar todas em headless":
  // antes só olhava acc.headless, então com bootHeadless o socket nunca subia.
  if (isHeadless(id)) {
    deck.headlessStart(id).catch(err => console.error('[headless] erro ao iniciar:', err));
  }

  const unsubHeadlessUpdate = deck.onHeadlessUpdate(({index, state}) => {
    if (index !== id) return;
    const rr = rt.get(id);
    if (!rr) return;
    rr.headlessState = state;
    updateLive();
  });

  // O motivo da falha. Sem isto, o card dizia só "disconnected" e a explicação
  // do client ("abra a conta e faça login uma vez") era emitida e jogada fora —
  // a pessoa via a conta não conectar sem nenhuma pista do porquê.
  const unsubHeadlessError = deck.onHeadlessError(({index, message}) => {
    if (index !== id) return;
    const rr = rt.get(id);
    if (!rr) return;
    rr.headlessError = message;
    const acc2 = accById(id);
    if (acc2) {
      // A MESMA falha repetida não vira linha nova: o backoff tenta de novo a
      // cada poucos segundos, e um servidor fora do ar (502) enchia o log com
      // dezenas de linhas identicas por conta, escondendo o resto.
      if (message !== rr.headlessUltimoErro) {
        rr.headlessUltimoErro = message;
        // raiseAlert já escreve no log: chamar log() antes duplicava toda
        // mensagem de erro do headless no histórico.
        raiseAlert(acc2, 'Headless', message);
      }
    }
    updateLive();
  });

  const unsubHeadlessStatus = deck.onHeadlessStatus(({index, status}) => {
    if (index !== id) return;
    const rr = rt.get(id);
    if (!rr) return;
    const antes = rr.headlessStatus;
    rr.headlessStatus = status;
    // Conectou: o erro velho não vale mais. Zerar também o 'ultimo erro' faz
    // com que uma queda futura volte a avisar, em vez de ficar muda por ser
    // igual à anterior.
    if (status === 'connected') { rr.headlessError = null; rr.headlessUltimoErro = null; }
    // As ferramentas só agem com o socket de pé, e o socket pode cair e voltar.
    // Ligar na transição para 'connected' cobre a conexão inicial e cada
    // reconexão — startTool é idempotente, então religar não duplica laço.
    if (status === 'connected' && antes !== 'connected') applyToolsHeadless(id);
    updateLive();
  });

  // Limpa listeners ao destruir
  r._cleanup = () => {
    if (unsubHeadlessUpdate) unsubHeadlessUpdate();
    if (unsubHeadlessStatus) unsubHeadlessStatus();
    if (unsubHeadlessError) unsubHeadlessError();
    if (isHeadless(id)) deck.headlessStop(id).catch(() => {});
  };

  // Conta que abre em headless: a página NÃO é carregada.
  //
  // O servidor aceita uma conexão por conta. Carregar a página aqui abriria um
  // segundo socket para a mesma conta e o jogo derrubaria um dos dois (code
  // 4000, "jogo aberto em outro lugar") — era o bug em que o card dizia
  // "headless" enquanto a tela carregava e o jogo reclamava de sessão
  // duplicada. Fora isso, levantar o Chromium para derrubá-lo em seguida
  // desperdiça justamente a RAM que o modo existe para poupar.
  //
  // O <webview> fica no DOM sem src (não custa processo nenhum enquanto não
  // navega), pronto para toggleHeadlessMode() usar se a pessoa sair do headless.
  if (isHeadless(id)) {
    r.tile.classList.add('headless-mode');
    return r;
  }

  // O primeiro carregamento usa o atributo "src": loadURL() só funciona depois do dom-ready,
  // e o dom-ready só acontece quando o webview tem uma página para carregar. Sem src, nada carrega.
  // O proxy da tela é aplicado antes (a sessão da partição existe independente do webview),
  // para o IP real não escapar na primeira requisição.
  (async () => {
    const url = acc.url || '';
    if (!/^https?:\/\//i.test(url)) {
      console.error('[account] URL inválida:', url);
      drop(id, 'endereço inválido (precisa começar com http:// ou https://)');
      return;
    }
    const group = groupOf(acc);
    const proxy = group?.proxy || null;
    if (proxy) {
      try {
        const ok = await deck.applyProxy(partitionOf(id), proxy);
        if (!ok) throw new Error('setProxy recusou');
      } catch (err) {
        console.error('[proxy] falhou ao aplicar:', err);
        raiseAlert(acc, 'Proxy', 'Não consegui aplicar o proxy desta tela.');
        drop(id, `proxy não aplicado (${group?.name || 'desta tela'})`);
        return; // sem proxy ativo não carrega: evita vazar o IP real
      }
    }
    if (!rt.has(id)) return; // a conta saiu enquanto o proxy era aplicado
    r.wv.setAttribute('src', url);
  })();

  return r;
}

function destroyRuntime(id) {
  const r = rt.get(id);
  if (!r) return;
  if (r._cleanup) r._cleanup();
  clearTimeout(r.retryTimer);
  r.tile.remove();
  rt.delete(id);
}

function updateTileMeta(acc, r) {
  r.els.name.textContent = acc.name;
  const g = groupOf(acc);
  r.els.group.textContent = g ? g.name : '';
  r.els.group.style.display = g && state.ui.mix ? '' : 'none';
  if (g) r.els.group.style.setProperty('--gc', tone(g.color));
  r.els.mute.replaceChildren(icon(acc.muted ? 'mute' : 'vol'));
  r.els.mute.classList.toggle('on', !!acc.muted);
  paintAccColor(r.tile, acc);
}

// Cor própria da conta (opcional): vira a variável --ac e a classe .colored no elemento.
function paintAccColor(el, acc) {
  const c = accColor(acc);
  el.classList.toggle('colored', !!c);
  if (c) el.style.setProperty('--ac', c); else el.style.removeProperty('--ac');
  return el;
}

function applyAudio(id) {
  const acc = accById(id), r = rt.get(id);
  if (!acc || !r || (!r.ready && !r.wcId)) return;
  try { r.wv.setAudioMuted(!!acc.muted || !!state.muteAll); } catch { /* ainda carregando */ }
}

// ---- Headless Mode (Fase 2)
async function toggleHeadlessMode(accId, enable) {
  const acc = accById(accId);
  const r = rt.get(accId);
  if (!acc || !r) return false;

  // O estado real, não só a marca da conta: com bootHeadless ligado a conta roda
  // em headless com acc.headless false. Comparar com a marca fazia os dois ramos
  // serem pulados, e o botão não respondia.
  const agora = isHeadless(accId);
  if (enable === agora) return true; // já está no modo pedido

  try {
    if (enable) {
      // Entrando em headless
      console.log(`[headless] ativando para ${acc.name}`);
      acc.headless = true;
      save();
      await deck.headlessStart(accId);
      if (r.wv && r.wv.parentElement) { r.wv.remove(); r.wv = null; r.wcId = null; }
      r.tile.classList.add('headless-mode');
      // As ferramentas marcadas para a conta tinham que seguir rodando: a página
      // acabou de ser destruída, então quem passa a executá-las é o socket.
      // (O listener de status também liga em 'connected'; aqui cobre o caso de o
      // socket já estar de pé, onde a transição não acontece de novo.)
      applyToolsHeadless(accId);
      log('info', acc, 'Modo headless ativado');
    } else {
      // Saindo de headless
      console.log(`[headless] desativando para ${acc.name}`);
      // Para as ferramentas do socket antes de derrubá-lo. Sem isto, elas
      // continuariam ligadas no processo principal e, quando a página voltasse
      // com as suas próprias cópias, cada compra sairia em dobro.
      // (headlessStop já pararia tudo, mas ser explícito deixa o par simétrico
      // com a entrada e sobrevive a mudanças no stop.)
      for (const t of (window.DDTools?.TOOLS || [])) {
        try { await deck.headlessToolStop(accId, t.id); } catch { /* já estava parada */ }
      }
      await deck.headlessStop(accId);
      // false explícito, não undefined: é uma escolha da pessoa para ESTA conta,
      // e precisa vencer a preferência "iniciar todas em headless".
      acc.headless = false;
      save();

      const url = acc.url || '';
      if (!/^https?:\/\//i.test(url)) {
        raiseAlert(acc, 'URL inválida', 'Configure a URL antes');
        return false;
      }

      // Quando a conta abriu em headless, o <webview> já está no DOM sem src e
      // com os eventos ligados: criar outro deixaria dois no mesmo card, e o
      // antigo apareceria como uma faixa morta. Só criamos se não houver.
      let wv = r.wv;
      if (!wv) {
        wv = document.createElement('webview');
        wv.setAttribute('partition', `persist:acc-${accId}`);
        wv.setAttribute('allowpopups', '');
        wv.setAttribute('webpreferences', 'backgroundThrottling=yes');
        r.wv = wv;
        const wvWrap = r.tile.querySelector('.wv-wrap');
        if (wvWrap) wvWrap.insertBefore(wv, wvWrap.firstChild);
        wireWebview(acc, r, wv);
      }
      r.wcId = null;
      r.ready = false;
      r.sleepOkAt = Infinity;

      const group = groupOf(acc);
      if (group?.proxy) {
        try {
          await deck.applyProxy(`persist:acc-${accId}`, group.proxy);
        } catch (err) {
          raiseAlert(acc, 'Proxy', 'Erro ao aplicar');
          return false;
        }
      }

      wv.setAttribute('src', url);
      r.tile.classList.remove('headless-mode');
      log('info', acc, 'Modo webview restaurado');
    }
    return true;
  } catch (err) {
    console.error(`[headless] erro:`, err);
    raiseAlert(acc, 'Erro', err.message);
    return false;
  }
}

// ---- economia: conta que ninguém está vendo para de desenhar (a página se vê oculta, como uma aba de
// fundo) e segue jogando: timers e WebSocket não são segurados. O DigiIdle, oculto, avisa o servidor
// (aba.oculta), que segue caçando e manda só o estado a cada 5 s em vez da cena em tempo real.
function keepsPainting(acc) { return state.settings.economy === false || !!(acc && acc.alwaysRender); }
function applyPainting(id) {
  const acc = accById(id), r = rt.get(id);
  if (acc && r && r.wcId) deck.keepPainting(r.wcId, keepsPainting(acc)).catch(() => {});
}
// Está desenhando agora? (O detector de tela parada só conta esse tempo.)
function painting(acc, r) { return keepsPainting(acc) || (!r.sleeping && !r.goingToSleep && !document.hidden); }
function wantsSleep(id, r) {
  const acc = accById(id);
  return !!acc && !keepsPainting(acc) && (!r.front || lockedUI) && !!r.wcId && Date.now() >= r.sleepOkAt;
}
function setSleepClass(r, on) { r.tile.classList.toggle('sleep', on); }
function wake(r) {
  r.sleeping = false;
  setSleepClass(r, false);
  r.hashSince = Date.now();
  r.lastHash = null;
}
async function goToSleep(id, r) {
  r.goingToSleep = true;
  // Última imagem antes de dormir, para a miniatura não ficar vazia.
  if (!document.hidden && r.status === 'online') await captureThumb(r);
  r.goingToSleep = false;
  if (rt.get(id) !== r) return;
  if (wantsSleep(id, r)) { r.sleeping = true; setSleepClass(r, true); } else updateSleep();
}
function updateSleep() {
  if (!started) return;
  for (const [id, r] of rt) {
    if (r.goingToSleep) continue;
    const want = wantsSleep(id, r);
    if (want && !r.sleeping) goToSleep(id, r);
    else if (!want && r.sleeping) wake(r);
  }
}
// Capturar uma conta que não está desenhando trava (e a deixa "visível" sem desenhar): checa na hora,
// porque a janela pode ter sido escondida no meio de uma rodada de miniaturas.
function captureSafe(r, opts) {
  if (!r.wcId) return Promise.resolve(null);
  if (!keepsPainting(accById(r.id)) && (document.hidden || r.tile.classList.contains('sleep'))) return Promise.resolve(null);
  return withTimeout(deck.capture(r.wcId, opts), 3000).catch(() => null);
}
async function captureThumb(r) {
  const res = await captureSafe(r, { thumb: 400 });
  if (!res || !res.thumb) return;
  r.thumb = res.thumb;
  r.thumbAt = Date.now();
  for (const img of $$(`img[data-thumb="${r.id}"]`)) img.src = res.thumb;
}
// Miniatura de conta dormindo: acorda por um instante atrás do véu, captura e volta a dormir.
async function peekThumb(r) {
  r.peeking = true;
  setSleepClass(r, false);
  await new Promise((res) => setTimeout(res, 400)); // tempo para a cena chegar e ser desenhada
  if (r.sleeping) await captureThumb(r);
  r.peeking = false;
  r.thumbAt = Date.now(); // mesmo se falhar, só tenta de novo daqui a PEEK_MS
  if (r.sleeping) setSleepClass(r, true);
}

function markOnline(id) {
  const acc = accById(id), r = rt.get(id);
  if (!acc || !r || r.failedNav) return;
  const was = r.status;
  r.ready = true;
  r.missed = 0;
  r.hung = false;
  r.unresponsiveSince = null;
  r.loadedAt = Date.now();
  try { const u = r.wv.getURL(); if (/^https?:/i.test(u)) r.lastGoodUrl = u; } catch { /* ignora */ }
  if (was === 'online') return;

  r.status = 'online';
  r.onlineSince = Date.now();
  r.hashSince = Date.now();
  r.lastHash = null;
  r.frozenAlerted = false;
  clearTimeout(r.retryTimer);
  r.retryTimer = null;
  r.retryAt = null;
  if (was === 'reconnecting') {
    const dur = Date.now() - r.dropAt;
    acc.stats.recoveries++;
    today().recoveries++;
    log('recover', acc, `voltou sozinha após ${fmtDur(dur)}`);
    if (r.dropAlerted) infoNotice(acc, `${acc.name} voltou`, `Recuperada após ${fmtDur(dur)} e ${r.retries} tentativa(s).`);
    r.retries = 0;
    r.dropAlerted = false;
    r.reason = '';
  }
  save();
  updateLive();
}

function drop(id, reason) {
  const acc = accById(id), r = rt.get(id);
  if (!acc || !r) return;
  if (r.status === 'reconnecting') {
    r.reason = reason;
    if (!r.retryTimer) scheduleRetry(id);
    return;
  }
  r.status = 'reconnecting';
  r.reason = reason;
  r.dropAt = Date.now();
  r.onlineSince = null;
  r.retries = 0;
  r.dropAlerted = false;
  acc.stats.drops++;
  today().drops++;
  log('drop', acc, `caiu: ${reason}`);
  if (state.settings.notifyEveryDrop) {
    r.dropAlerted = true;
    raiseAlert(acc, 'Caiu', `${reason}. Reconectando sozinha…`, { type: 'drop-alert' });
  }
  scheduleRetry(id);
  save();
  updateLive();
}

function scheduleRetry(id) {
  const r = rt.get(id);
  if (!r) return;
  clearTimeout(r.retryTimer);
  const delay = BACKOFF[Math.min(r.retries, BACKOFF.length - 1)];
  r.retryAt = Date.now() + delay;
  r.retryTimer = setTimeout(() => retryNow(id), delay);
}

function retryNow(id) {
  const acc = accById(id), r = rt.get(id);
  if (!acc || !r) return;
  clearTimeout(r.retryTimer);
  r.retryTimer = null;
  if (!navigator.onLine) {
    r.reason = 'sem internet, esperando a conexão voltar';
    scheduleRetry(id);
    return;
  }
  r.retries++;
  r.attemptAt = Date.now();
  const limit = Number(state.settings.alertAfterRetries) || 0;
  if (limit > 0 && r.retries === limit && !r.dropAlerted) {
    r.dropAlerted = true;
    raiseAlert(acc, 'Não voltou', `${r.reason}. Já tentei ${r.retries} vezes e continuo tentando.`);
  }
  r.failedNav = false;
  if (r.hung) {
    r.hung = false;
    // Travado: recria o elemento. Não há render-process-gone neste caminho, por isso
    // r.forcing não é usado aqui (ficaria preso e engoliria um crash real mais tarde).
    if (!recreateWebview(id)) navigate(r, r.lastGoodUrl || acc.url);
  } else {
    navigate(r, r.lastGoodUrl || acc.url);
  }
  // Se não ficar online até lá, tenta de novo (com espera crescente).
  scheduleRetry(id);
}

function manualReload(id) {
  const r = rt.get(id);
  if (!r) return;
  clearAttention(id);
  if (r.status === 'reconnecting') return retryNow(id);
  try { r.wv.reload(); } catch { /* ignora */ }
}

async function probe(id) {
  const acc = accById(id), r = rt.get(id);
  if (!acc || !r || r.probing || r.status !== 'online' || !r.ready) return;
  r.probing = true;
  r.lastProbe = Date.now();
  try {
    const res = await withTimeout(r.wv.executeJavaScript(PROBE_JS), 10000);
    r.missed = 0;
    if (res && typeof res.t === 'string') checkWords(acc, r, res.t);
  } catch (err) {
    if (err && err.message === 'timeout' && r.status === 'online') {
      r.missed++;
      if (r.missed >= 2) { r.hung = true; drop(id, 'a página parou de responder'); }
    }
  } finally {
    r.probing = false;
  }
}

function checkWords(acc, r, text) {
  const words = [...(state.settings.watchWords || []), ...(acc.watchWords || [])].map((w) => w.trim()).filter(Boolean);
  if (!words.length) return;
  const t = norm(text);
  for (const w of words) {
    const nw = norm(w);
    if (t.includes(nw)) {
      if (!r.wordActive[nw] && Date.now() - (r.wordAlertAt[nw] || 0) > 10 * 60000) {
        r.wordAlertAt[nw] = Date.now();
        raiseAlert(acc, 'Precisa de você', `apareceu "${w}" na tela`, { type: 'word' });
      }
      r.wordActive[nw] = true;
    } else {
      r.wordActive[nw] = false;
    }
  }
}

// =============================================================== laços
function tick() {
  const now = Date.now();
  const dt = Math.min(now - lastTickAt, 5000); // evita somar tempo de PC suspenso
  lastTickAt = now;
  const interval = Math.max(5, Number(state.settings.checkIntervalSec) || 15) * 1000;

  for (const [id, r] of rt) {
    const acc = accById(id);
    if (!acc) continue;
    if (r.status === 'online') {
      acc.stats.onlineMs += dt;
      today().onlineMs += dt;
      markDirty();
      if (r.unresponsiveSince && now - r.unresponsiveSince > 30000) {
        r.hung = true;
        drop(id, 'a página travou (sem resposta há 30s)');
        continue;
      }
      if (now - r.lastProbe > interval) probe(id);
      if (acc.autoReloadMin > 0 && now - r.loadedAt > acc.autoReloadMin * 60000) {
        r.loadedAt = now;
        log('info', acc, `recarregada automaticamente (a cada ${acc.autoReloadMin} min)`);
        try { r.wv.reload(); } catch { /* ignora */ }
      }
    }
  }
  // Janela escondida/minimizada: ninguém vê os textos ao vivo; só o título (aparece na barra de tarefas).
  if (document.hidden) updateTitle(); else updateLive();
}

async function freezeLoop() {
  for (const [id, r] of rt) {
    const acc = accById(id);
    if (!acc || !(acc.freezeMin > 0) || r.status !== 'online' || !r.wcId) continue;
    // Conta que não está desenhando não muda a tela por definição: o relógio só anda enquanto desenha.
    if (!painting(acc, r)) { r.hashSince = Date.now(); r.lastHash = null; continue; }
    const res = await captureSafe(r, { hash: true });
    if (!res || !res.hash) continue;
    if (res.hash !== r.lastHash) {
      r.lastHash = res.hash;
      r.hashSince = Date.now();
      r.frozenAlerted = false;
    } else if (!r.frozenAlerted && Date.now() - r.hashSince > acc.freezeMin * 60000) {
      r.frozenAlerted = true;
      const mins = Math.round((Date.now() - r.hashSince) / 60000);
      if (acc.freezeAction === 'reload') {
        log('freeze', acc, `tela parada há ${mins} min, recarregando`);
        drop(id, `tela parada há ${mins} min`);
        retryNow(id);
      } else {
        raiseAlert(acc, 'Tela parada', `nada mudou na tela há ${mins} min`, { type: 'freeze' });
      }
    }
  }
}

// Conta dormindo ganha miniatura nova no máximo a cada PEEK_MS (cada espiada acorda o jogo por um instante).
const PEEK_MS = 30000;
let thumbBusy = false;
async function thumbLoop() {
  const view = state.ui.view;
  if (thumbBusy || lockedUI || document.hidden || (view !== 'main' && view !== 'dash')) return;
  thumbBusy = true;
  try {
    for (const [id, r] of rt) {
      if (!r.wcId || r.status === 'reconnecting' || r.goingToSleep) continue;
      if (view === 'main' && id === state.ui.current) continue;
      if (r.sleeping) { if (Date.now() - r.thumbAt >= PEEK_MS) await peekThumb(r); } else await captureThumb(r);
    }
  } finally {
    thumbBusy = false;
  }
}

async function metricsLoop() {
  if (document.hidden) return;
  const list = [...rt.values()].filter((r) => r.wcId).map((r) => ({ accId: r.id, wcId: r.wcId }));
  try {
    const res = await deck.metrics(list);
    metricsTotal = res.total;
    for (const [id, r] of rt) r.metrics = res.accounts[id] || null;
  } catch { /* ignora */ }
}

// =============================================================== textos ao vivo
function statusText(id) {
  const acc = accById(id);
  if (!acc) return '';
  if (!acc.enabled) return 'desligada';
  const r = rt.get(id);
  if (!r) return '';
  const now = Date.now();
  switch (r.status) {
    case 'loading': return 'carregando…';
    case 'online': return (r.unresponsiveSince ? 'lenta · ' : '') + 'online há ' + fmtDur(now - r.onlineSince);
    case 'reconnecting':
      if (now - r.attemptAt < 4000 || !r.retryAt) return 'reconectando…';
      return `caiu · tenta em ${Math.max(1, Math.ceil((r.retryAt - now) / 1000))}s`;
    default: return '';
  }
}
function dotClass(id) {
  const acc = accById(id);
  if (!acc || !acc.enabled) return 'off';
  const r = rt.get(id);
  if (!r) return 'off';
  if (r.attention) return 'alert';
  return { online: 'ok', loading: 'load', reconnecting: 'warn' }[r.status] || 'off';
}
function liveValue(key) {
  const i = key.indexOf(':');
  const k = key.slice(0, i), id = key.slice(i + 1);
  const acc = id && accById(id);
  const r = id && rt.get(id);
  const now = Date.now();
  switch (k) {
    case 'status': {
      if (!r) return '—';
      // Em headless o status vem do socket. Traduzido: 'disconnected' e
      // 'failed' no card não diziam nada a quem não leu o código.
      if (isHeadless(id) && r.headlessStatus) {
        return '⚡ ' + (HEADLESS_ROTULO[r.headlessStatus] || r.headlessStatus);
      }
      return statusText(id);
    }
    case 'banner': {
      // O motivo da falha vem antes do estado: é o que a pessoa precisa ler.
      if (isHeadless(id) && r.headlessError && r.headlessStatus !== 'connected') {
        return `⚡ ${r.headlessError}`;
      }
      // Em headless, mostra info de conexão
      if (isHeadless(id) && r.headlessState) {
        return `⚡ Nível ${r.headlessState.nivel} · ${fmtNum(r.headlessState.bits)} bits`;
      }
      if (!r || r.status !== 'reconnecting') return '';
      const when = now - r.attemptAt < 4000 || !r.retryAt ? 'tentando agora…' : `próxima tentativa em ${Math.max(1, Math.ceil((r.retryAt - now) / 1000))}s`;
      return `Caiu: ${r.reason}. ${when}${r.retries ? ` (tentativa ${r.retries + 1})` : ''}`;
    }
    case 'up': return r && r.status === 'online' ? fmtDur(now - r.onlineSince) : '—';
    case 'total': return acc ? fmtDur(acc.stats.onlineMs) : '';
    case 'drops': return acc ? String(acc.stats.drops) : '';
    case 'recov': return acc ? String(acc.stats.recoveries) : '';
    case 'mem': return r && r.metrics ? fmtMem(r.metrics.memKB) : '—';
    case 'cpu': return r && r.metrics ? fmtCpu(r.metrics.cpu) : '—';
    case 'scr': {
      const accs = state.accounts.filter((a) => screenOf(a) === id);
      const on = accs.filter((a) => rt.get(a.id)?.status === 'online').length;
      return `${on}/${accs.length}`;
    }
    case 'kpi': {
      const enabled = state.accounts.filter((a) => a.enabled).length;
      const online = [...rt.values()].filter((x) => x.status === 'online');
      const t = today();
      switch (id) {
        case 'online': return `${online.length}/${enabled}`;
        case 'farm': return online.length ? fmtClock(now - Math.min(...online.map((x) => x.onlineSince))) : '—';
        case 'drops': return String(t.drops);
        case 'recov': return String(t.recoveries);
        case 'alerts': return String(t.alerts);
        case 'today': return fmtDur(t.onlineMs);
        case 'rate': return t.drops ? Math.round((t.recoveries / t.drops) * 100) + '%' : '—';
        case 'mem': return metricsTotal ? fmtMem(metricsTotal.memKB) : '—';
        case 'cpu': return metricsTotal ? fmtCpu(metricsTotal.cpu) : '—';
        default: return '';
      }
    }
    default: return '';
  }
}
function updateLive() {
  for (const el of $$('[data-live]')) {
    const v = liveValue(el.dataset.live);
    if (el.textContent !== v) el.textContent = v;
  }
  for (const el of $$('[data-dot]')) {
    const c = 'dot ' + dotClass(el.dataset.dot);
    if (el.className !== c) el.className = c;
  }
  for (const [, r] of rt) r.tile.classList.toggle('is-down', r.status === 'reconnecting');
  $('#netOff').classList.toggle('hidden', navigator.onLine);
  updateTitle();
}
function updateTitle() {
  const enabled = state.accounts.filter((a) => a.enabled).length;
  const online = [...rt.values()].filter((x) => x.status === 'online').length;
  const t = `${unseen ? `(${unseen}) ` : ''}DigiDeck · ${online}/${enabled} online`;
  if (document.title !== t) document.title = t;
  const tb = `${online}/${enabled} online`;
  if ($('#tbOnline').textContent !== tb) $('#tbOnline').textContent = tb;
  const dc = 'dot ' + (!enabled ? 'off' : online === enabled ? 'ok' : online ? 'warn' : 'alert');
  if ($('#tbDot').className !== dc) $('#tbDot').className = dc;
}

// =============================================================== telas (separadas ou misturadas)
function enabledAccounts() { return state.accounts.filter((a) => a.enabled); }
function screens() {
  const list = state.groups.map((g) => g.id);
  if (state.accounts.some((a) => !groupOf(a))) list.push('none');
  return list;
}
function ensureScreen() {
  const f = state.ui.groupFilter;
  if (screens().includes(f)) return;
  const cur = state.ui.current && accById(state.ui.current);
  const firstOn = enabledAccounts()[0];
  state.ui.groupFilter = (cur && cur.enabled && screenOf(cur)) || (firstOn && screenOf(firstOn)) || screens()[0] || 'none';
}
function matchesScreen(acc) { return state.ui.mix || screenOf(acc) === state.ui.groupFilter; }
function visibleAccounts() { return enabledAccounts().filter(matchesScreen); }

function ensureCurrent() {
  const vis = visibleAccounts();
  if (state.ui.current && rt.has(state.ui.current) && vis.some((a) => a.id === state.ui.current)) return state.ui.current;
  state.ui.current = vis[0] ? vis[0].id : null;
  return state.ui.current;
}

function setScreen(key) {
  state.ui.mix = false;
  state.ui.groupFilter = key;
  state.ui.current = null;
  save();
  refresh();
}
function setMix(on) {
  state.ui.mix = !!on;
  save();
  refresh();
  toast(on ? 'Telas misturadas: todas as contas juntas.' : `Telas separadas: mostrando "${screenName(state.ui.groupFilter)}".`, 'ok', 2200);
}
function cycleScreen(dir) {
  const list = screens();
  if (!list.length) return;
  if (state.ui.mix) return setScreen(list[0]);
  const i = list.indexOf(state.ui.groupFilter);
  setScreen(list[(i + dir + list.length) % list.length]);
}

function renderScreenbar() {
  const bar = $('#screenbar');
  const tabs = screens().map((key) => {
    const g = groupById(key);
    const tab = h('button', {
      class: 'stab' + (key === state.ui.groupFilter ? ' active' : ''),
      style: g ? { '--gc': tone(g.color) } : null,
      title: state.ui.mix ? `Separar e mostrar só "${screenName(key)}"` : `Mostrar "${screenName(key)}" (Ctrl+PgDn/PgUp troca)`,
      onclick: () => setScreen(key),
    },
    h('span', { class: 'gdot', style: g ? null : { background: 'var(--faint)', boxShadow: 'none' } }),
    h('span', {}, screenName(key)),
    h('span', { class: 'n', dataset: { live: 'scr:' + key } }));
    wireGroupDrop(tab, key);
    return tab;
  });
  const mixInput = h('input', { type: 'checkbox', checked: !!state.ui.mix, 'aria-label': 'Misturar telas', onchange: (e) => setMix(e.target.checked) });
  const freeInput = h('input', { type: 'checkbox', 'aria-label': 'Layout livre', onchange: (e) => setFree(e.target.checked) });
  bar.replaceChildren(
    h('div', { class: 'stabs' }, tabs),
    h('div', { class: 'free-ctl', id: 'freeCtl' },
      h('button', { class: 'icon-btn sm hidden', id: 'btnFreeReset', title: 'Reorganizar em grade (mantém o layout livre)', onclick: resetFree }, icon('grid', 14)),
      h('label', { class: 'mix', title: 'Mover e redimensionar cada janela do seu jeito (arraste o título e as bordas)' },
        icon('move', 15), 'Layout livre', h('span', { class: 'switch' }, freeInput, h('span')))),
    h('label', { class: 'mix' + (state.ui.mix ? ' on' : ''), title: 'Mostrar contas de todos os grupos juntas' },
      icon('layers', 15), 'Misturar telas', h('span', { class: 'switch' }, mixInput, h('span'))),
  );
  updateFreeBtn();
}

// =============================================================== layout / views
function syncTiles() {
  const want = new Set(enabledAccounts().map((a) => a.id));
  for (const id of [...rt.keys()]) if (!want.has(id)) destroyRuntime(id);
  for (const acc of state.accounts) if (acc.enabled && !rt.has(acc.id)) createRuntime(acc);
  // A ordem visual vem do CSS "order": mover não recria o webview (o jogo não recarrega).
  state.accounts.forEach((a, i) => { const r = rt.get(a.id); if (r) { r.tile.style.order = i; updateTileMeta(a, r); } });
}

function layout() {
  const view = state.ui.view;
  const stage = $('#stage');
  stage.dataset.view = view;
  stage.classList.toggle('has-bar', view === 'grid' || view === 'main');
  stage.classList.toggle('mixed', !!state.ui.mix);
  for (const b of $$('#views button')) b.classList.toggle('active', b.dataset.view === view);
  ensureScreen();
  const current = ensureCurrent();
  const vis = visibleAccounts();
  const visIds = new Set(vis.map((a) => a.id));

  for (const [id, r] of rt) {
    let front;
    if (view === 'grid') front = visIds.has(id);
    else if (view === 'focus' || view === 'main') front = id === current;
    else front = false;
    r.front = front;
    r.tile.classList.toggle('front', front);
    r.tile.classList.toggle('back', !front);
    r.tile.classList.toggle('current', id === current);
    r.els.focus.replaceChildren(icon(view === 'focus' && id === current ? 'shrink' : 'expand'));
  }

  const tiles = $('#tiles');
  const free = view === 'grid' && isFree() && vis.length > 0;
  tiles.classList.toggle('free', free);
  if (view === 'grid' && vis.length && !free) {
    const best = bestCols(vis.length, tiles.clientWidth - 20, tiles.clientHeight - 20);
    tiles.style.gridTemplateColumns = `repeat(${best}, minmax(0, 1fr))`;
    tiles.style.gridTemplateRows = `repeat(${Math.ceil(vis.length / best)}, minmax(0, 1fr))`;
  } else {
    tiles.style.gridTemplateColumns = '';
    tiles.style.gridTemplateRows = '';
  }
  if (free) placeFree(vis);
  const viewName = { grid: 'Grade', main: 'Principal', focus: 'Foco', dash: 'Painel' }[view] || '';
  const where = view === 'dash' ? viewName
    : `${viewName} · ${state.ui.mix ? 'Telas misturadas' : screenName(state.ui.groupFilter)}${free ? ' · livre' : ''}`;
  $('#tbWhere').textContent = where;
  for (const [id, r] of rt) {
    r.els.head.draggable = !free;
    r.els.head.title = free ? 'Arraste para mover · duplo clique foca' : 'Arraste para mudar a ordem';
    if (!(free && visIds.has(id))) for (const k of ['left', 'top', 'width', 'height', 'zIndex']) r.tile.style[k] = '';
  }
  updateFreeBtn();

  const empty = $('#empty');
  const showEmpty = view !== 'dash' && (state.accounts.length === 0 || !vis.length);
  empty.classList.toggle('hidden', !showEmpty);
  if (showEmpty) renderEmpty();
  updateSleep();
}

// =============================================================== layout livre (mover e redimensionar cada janela)
// Cada tela (grupo, ou "misturadas") guarda o próprio arranjo em frações da área, então ele acompanha o tamanho do app.
const FREE_GAP = 10, FREE_MIN_W = 240, FREE_MIN_H = 150, FREE_SNAP = 8;
const clamp = (v, a, b) => Math.min(Math.max(v, a), Math.max(a, b));
function freeKey() { return state.ui.mix ? 'mix' : String(state.ui.groupFilter); }
function freeData() { return (state.ui.free || {})[freeKey()] || null; }
function isFree() { const d = state && state.ui.view === 'grid' && freeData(); return !!(d && d.on); }
function freeArea() {
  const t = $('#tiles');
  return { W: Math.max(1, t.clientWidth - 20), H: Math.max(1, t.clientHeight - 20) };
}
function bestCols(n, W, H) {
  let best = 1, bestScore = 0;
  for (let c = 1; c <= n; c++) {
    const score = Math.min(W / c, ((H / Math.ceil(n / c)) - 34) * 1.6);
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best;
}
// O mesmo arranjo da grade automática, como ponto de partida do layout livre.
function autoRects(vis) {
  const { W, H } = freeArea();
  const c = bestCols(vis.length, W, H), rows = Math.ceil(vis.length / c);
  const cw = (W - FREE_GAP * (c - 1)) / c, ch = (H - FREE_GAP * (rows - 1)) / rows;
  const out = {};
  vis.forEach((a, i) => {
    out[a.id] = { x: ((i % c) * (cw + FREE_GAP)) / W, y: (Math.floor(i / c) * (ch + FREE_GAP)) / H, w: cw / W, h: ch / H, z: i + 1 };
  });
  return out;
}
function setFreeData(d) {
  state.ui.free = { ...(state.ui.free || {}), [freeKey()]: d };
}
function placeFree(vis) {
  const d = freeData();
  if (!d) return;
  const { W, H } = freeArea();
  let added = 0, maxZ = Math.max(0, ...Object.values(d.rects).map((q) => q.z || 0));
  for (const a of vis) {
    if (d.rects[a.id]) continue; // conta nova: entra em cascata no canto, por cima
    const off = 28 * added++;
    d.rects[a.id] = { x: Math.min(off / W, 0.58), y: Math.min(off / H, 0.54), w: 0.42, h: 0.46, z: ++maxZ };
    save();
  }
  const order = [...vis].sort((a, b) => (d.rects[a.id].z || 0) - (d.rects[b.id].z || 0));
  order.forEach((a, rank) => {
    const r = rt.get(a.id), q = d.rects[a.id];
    if (!r) return;
    const w = clamp(q.w * W, Math.min(FREE_MIN_W, W), W), hh = clamp(q.h * H, Math.min(FREE_MIN_H, H), H);
    Object.assign(r.tile.style, {
      left: 10 + clamp(q.x * W, 0, W - w) + 'px', top: 10 + clamp(q.y * H, 0, H - hh) + 'px',
      width: w + 'px', height: hh + 'px', zIndex: String(2 + rank),
    });
  });
}
function raiseFree(id) {
  const d = isFree() && freeData();
  if (!d || !d.rects[id]) return;
  const maxZ = Math.max(0, ...Object.values(d.rects).map((q) => q.z || 0));
  if (d.rects[id].z === maxZ) return;
  d.rects[id].z = maxZ + 1;
  placeFree(visibleAccounts());
  save();
}
function setFree(on) {
  const d = freeData();
  if (on && !(d && d.rects && Object.keys(d.rects).length)) setFreeData({ on: true, rects: autoRects(visibleAccounts()) });
  else setFreeData({ ...d, on: !!on });
  save();
  layout();
  toast(on ? 'Layout livre: arraste o título para mover e as bordas para redimensionar.' : 'Grade automática.', 'ok', 2400);
}
function resetFree() {
  setFreeData({ on: true, rects: autoRects(visibleAccounts()) });
  save();
  layout();
}
function updateFreeBtn() {
  const box = $('#freeCtl');
  if (!box) return;
  const on = isFree();
  box.classList.toggle('hidden', state.ui.view !== 'grid');
  box.classList.toggle('on', on);
  $('input', box).checked = on;
  $('#btnFreeReset').classList.toggle('hidden', !on);
}

const CURSORS = { move: 'grabbing', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize' };
function startFree(e, id, mode) {
  if (e.button !== 0 || !state || state.ui.view !== 'grid') return;
  const vis = visibleAccounts();
  if (!vis.some((a) => a.id === id)) return;
  e.preventDefault();
  e.stopPropagation();
  closeMenus();
  if (!isFree()) { // primeira vez: congela a grade atual e passa para o modo livre
    setFreeData({ on: true, rects: autoRects(vis) });
    layout();
  }
  setCurrent(id, { quiet: true });
  raiseFree(id);
  const d = freeData(), { W, H } = freeArea();
  const r = rt.get(id);
  const px = (el) => ({ x: parseFloat(el.style.left) - 10, y: parseFloat(el.style.top) - 10, w: parseFloat(el.style.width), h: parseFloat(el.style.height) });
  const start = px(r.tile);
  let cur = { ...start }, moved = false;
  // Linhas de encaixe: bordas da área e das outras janelas (encostado ou com o espaço da grade).
  const xs = [0, W], ys = [0, H];
  for (const a of vis) {
    if (a.id === id || !rt.get(a.id)) continue;
    const o = px(rt.get(a.id).tile);
    xs.push(o.x, o.x + o.w, o.x - FREE_GAP, o.x + o.w + FREE_GAP);
    ys.push(o.y, o.y + o.h, o.y - FREE_GAP, o.y + o.h + FREE_GAP);
  }
  const near = (v, lines) => {
    let best = null, bd = FREE_SNAP + 1;
    for (const l of lines) { const dd = Math.abs(l - v); if (dd < bd) { bd = dd; best = l; } }
    return best;
  };
  const shift = (a, b, lines) => { // menor ajuste que encosta a borda a ou b numa linha
    const sa = near(a, lines), sb = near(b, lines);
    const da = sa == null ? Infinity : sa - a, db = sb == null ? Infinity : sb - b;
    const dd = Math.abs(da) <= Math.abs(db) ? da : db;
    return Number.isFinite(dd) ? dd : 0;
  };
  const minW = Math.min(FREE_MIN_W, W), minH = Math.min(FREE_MIN_H, H);
  const x0 = e.clientX, y0 = e.clientY, target = e.currentTarget;
  try { target.setPointerCapture(e.pointerId); } catch { /* segue com o window */ }
  document.body.style.setProperty('--cur', CURSORS[mode]);
  document.body.classList.add('free-moving');
  r.tile.classList.add('moving');

  const move = (ev) => {
    const dx = ev.clientX - x0, dy = ev.clientY - y0;
    if (!moved && Math.hypot(dx, dy) < 3) return;
    moved = true;
    const snap = !ev.altKey; // Alt solta o encaixe
    let { x, y, w, h: hh } = start;
    if (mode === 'move') {
      x = clamp(x + dx, 0, W - w);
      y = clamp(y + dy, 0, H - hh);
      if (snap) { x = clamp(x + shift(x, x + w, xs), 0, W - w); y = clamp(y + shift(y, y + hh, ys), 0, H - hh); }
    } else {
      if (mode.includes('e')) {
        let R = clamp(x + w + dx, x + minW, W);
        const s = snap && near(R, xs); if (s != null && s !== false && s - x >= minW) R = s;
        w = R - x;
      }
      if (mode.includes('w')) {
        let L = clamp(x + dx, 0, x + w - minW);
        const s = snap && near(L, xs); if (s != null && s !== false && x + w - s >= minW) L = s;
        w = x + w - L; x = L;
      }
      if (mode.includes('s')) {
        let B = clamp(y + hh + dy, y + minH, H);
        const s = snap && near(B, ys); if (s != null && s !== false && s - y >= minH) B = s;
        hh = B - y;
      }
      if (mode.includes('n')) {
        let T = clamp(y + dy, 0, y + hh - minH);
        const s = snap && near(T, ys); if (s != null && s !== false && y + hh - s >= minH) T = s;
        hh = y + hh - T; y = T;
      }
    }
    cur = { x, y, w, h: hh };
    Object.assign(r.tile.style, { left: 10 + x + 'px', top: 10 + y + 'px', width: w + 'px', height: hh + 'px' });
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    document.body.classList.remove('free-moving');
    r.tile.classList.remove('moving');
    if (moved) {
      d.rects[id] = { x: cur.x / W, y: cur.y / H, w: cur.w / W, h: cur.h / H, z: d.rects[id].z };
      save();
    }
    layout();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

function setView(v) {
  if (!['grid', 'main', 'focus', 'dash'].includes(v)) return;
  state.ui.view = v;
  save();
  layout();
  if (v === 'main') renderThumbs();
  if (v === 'dash') renderDash();
  thumbLoop();
}

function setCurrent(id, { quiet = false } = {}) {
  const acc = id && accById(id);
  if (!acc) return;
  clearAttention(id);
  if (state.ui.current === id && quiet && matchesScreen(acc)) return;
  state.ui.current = id;
  if (!state.ui.mix && screenOf(acc) !== state.ui.groupFilter) {
    state.ui.groupFilter = screenOf(acc); // separadas: a tela acompanha a conta escolhida
    renderScreenbar();
  }
  save();
  layout();
  renderSidebar();
  if (state.ui.view === 'main') { renderThumbs(); thumbLoop(); }
  if (!quiet && state.ui.view === 'grid') {
    const r = rt.get(id);
    if (r) { r.tile.classList.remove('flash'); void r.tile.offsetWidth; r.tile.classList.add('flash'); }
  }
}

function toggleFocus(id) {
  if (state.ui.view === 'focus' && state.ui.current === id) return setView('grid');
  setCurrent(id, { quiet: true });
  setView('focus');
}

function refresh() {
  syncTiles();
  ensureScreen();
  ensureCurrent();
  renderSidebar();
  renderScreenbar();
  layout();
  if (state.ui.view === 'main') renderThumbs();
  if (state.ui.view === 'dash') renderDash();
  updateMuteAllBtn();
  updateLive();
}

// =============================================================== arrastar e soltar
function startDrag(e, id) {
  dragId = id;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', 'digideck:' + id);
  const r = rt.get(id);
  if (r) e.dataTransfer.setDragImage(r.tile.querySelector('.tile-head'), 40, 16);
  // Adia para o navegador capturar a imagem do arrasto antes de mudar o visual.
  requestAnimationFrame(() => {
    document.body.classList.add('dragging');
    rt.get(id)?.tile.classList.add('drag-src');
    $$(`.acc-item[data-id="${id}"]`).forEach((el) => el.classList.add('drag-src'));
  });
}
function endDrag() {
  dragId = null;
  document.body.classList.remove('dragging');
  for (const el of $$('.drag-src, .drop-before, .drop-after, .drop-into')) el.classList.remove('drag-src', 'drop-before', 'drop-after', 'drop-into');
}
document.addEventListener('dragend', endDrag);

function wireTileDrop(tile, id) {
  tile.addEventListener('dragover', (e) => {
    if (!dragId || dragId === id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const b = tile.getBoundingClientRect();
    const after = state.ui.view === 'grid' ? e.clientX > b.left + b.width / 2 : e.clientY > b.top + b.height / 2;
    tile.classList.toggle('drop-after', after);
    tile.classList.toggle('drop-before', !after);
  });
  tile.addEventListener('dragleave', (e) => {
    if (!tile.contains(e.relatedTarget)) tile.classList.remove('drop-before', 'drop-after');
  });
  tile.addEventListener('drop', (e) => {
    if (!dragId || dragId === id) return;
    e.preventDefault();
    const after = tile.classList.contains('drop-after');
    const src = dragId;
    endDrag();
    moveAccount(src, { targetId: id, after });
  });
}

function wireItemDrop(item, acc) {
  item.addEventListener('dragover', (e) => {
    if (!dragId || dragId === acc.id) return;
    e.preventDefault();
    e.stopPropagation();
    const b = item.getBoundingClientRect();
    const after = e.clientY > b.top + b.height / 2;
    item.classList.toggle('drop-after', after);
    item.classList.toggle('drop-before', !after);
  });
  item.addEventListener('dragleave', () => item.classList.remove('drop-before', 'drop-after'));
  item.addEventListener('drop', (e) => {
    if (!dragId || dragId === acc.id) return;
    e.preventDefault();
    e.stopPropagation();
    const after = item.classList.contains('drop-after');
    const src = dragId;
    endDrag();
    moveAccount(src, { targetId: acc.id, after, groupId: groupOf(acc) ? acc.groupId : null });
  });
}

function wireGroupDrop(el, key) {
  el.addEventListener('dragover', (e) => {
    if (!dragId) return;
    e.preventDefault();
    el.classList.add('drop-into');
  });
  el.addEventListener('dragleave', () => el.classList.remove('drop-into'));
  el.addEventListener('drop', (e) => {
    if (!dragId) return;
    e.preventDefault();
    const src = dragId;
    endDrag();
    moveAccount(src, { groupId: key === 'none' ? null : key });
  });
}

function moveAccount(id, { targetId = null, after = false, groupId } = {}) {
  const arr = state.accounts;
  const from = arr.findIndex((a) => a.id === id);
  if (from < 0) return;
  const [acc] = arr.splice(from, 1);
  const before = screenOf(acc);
  if (groupId !== undefined) acc.groupId = groupId;
  let to;
  if (targetId) {
    const t = arr.findIndex((a) => a.id === targetId);
    to = t < 0 ? arr.length : t + (after ? 1 : 0);
  } else {
    let last = -1;
    arr.forEach((a, i) => { if (screenOf(a) === screenOf(acc)) last = i; });
    to = last < 0 ? arr.length : last + 1;
  }
  arr.splice(to, 0, acc);
  if (screenOf(acc) !== before) {
    log('info', acc, `movida para "${screenName(screenOf(acc))}"`);
    toast(`${acc.name} foi para "${screenName(screenOf(acc))}".`, 'ok', 2500);
    if (acc.enabled) checkLimit(acc.groupId);
  }
  save();
  refresh();
}

// =============================================================== lateral
// Esmaece o topo/fim da lista quando há contas escondidas acima/abaixo (mostra que dá para rolar).
function sideFade(el) {
  el.classList.toggle('fade-top', el.scrollTop > 2);
  el.classList.toggle('fade-bottom', el.scrollTop + el.clientHeight < el.scrollHeight - 2);
}
const sideScrollObs = new ResizeObserver((entries) => { for (const e of entries) sideFade(e.target); });
function renderSidebar() {
  const side = $('#sideList');
  const prevTop = $('.side-scroll', side)?.scrollTop || 0; // redesenhar não pode jogar a lista de volta ao topo
  const scroll = h('div', { class: 'side-scroll', onscroll: () => sideFade(scroll) });
  const sections = screens().map((key) => ({ key, g: groupById(key), accs: state.accounts.filter((a) => screenOf(a) === key) }));

  for (const { key, g, accs } of sections) {
    const on = accs.filter((a) => a.enabled).length;
    const over = g && g.limit > 0 && on > g.limit;
    const head = h('div', {
      class: 'group-head' + (!state.ui.mix && state.ui.groupFilter === key ? ' active' : ''),
      style: g ? { '--gc': tone(g.color) } : null,
      title: 'Abrir esta tela',
      onclick: () => setScreen(key),
    },
    h('span', { class: 'gdot', style: g ? null : { background: 'var(--faint)', boxShadow: 'none' } }),
    h('span', { class: 'gname' }, screenName(key)),
    h('span', { class: 'gcount' + (over ? ' over' : ''), title: over ? `Acima do limite de ${g.limit}` : '' }, g && g.limit > 0 ? `${on}/${g.limit}` : `${on}/${accs.length}`),
    accs.length ? iconBtn('swap', 'Rodízio: ligar só este grupo e desligar o resto', () => activateOnlyGroup(key), 'icon-btn sm') : null,
    accs.length ? iconBtn('power', on ? 'Desligar todas deste grupo' : 'Ligar todas deste grupo', () => toggleGroupPower(key), 'icon-btn sm') : null,
    g ? iconBtn('edit', 'Editar grupo', () => openGroupForm(g), 'icon-btn sm') : null);
    const box = h('div', { class: 'group' }, head);
    wireGroupDrop(box, key);
    for (const acc of accs) {
      const item = h('div', {
        class: 'acc-item' + (acc.id === state.ui.current ? ' current' : '') + (acc.enabled ? '' : ' disabled'),
        style: accColor(acc) ? { '--ac': accColor(acc) } : null,
        draggable: 'true',
        dataset: { id: acc.id },
        title: `${acc.url}\nArraste para reordenar ou mudar de grupo`,
        onclick: () => { if (acc.enabled) setCurrent(acc.id); },
        ondblclick: () => { if (acc.enabled) toggleFocus(acc.id); },
        oncontextmenu: (e) => { e.preventDefault(); openAccountMenu(acc.id, e); },
        ondragstart: (e) => startDrag(e, acc.id),
      },
      h('span', { class: 'dot', dataset: { dot: acc.id } }),
      h('div', { class: 'acc-main' },
        h('span', { class: 'acc-name' }, acc.name),
        h('span', { class: 'acc-meta', dataset: { live: 'status:' + acc.id } })),
      h('label', { class: 'switch', title: acc.enabled ? 'Desligar conta' : 'Ligar conta', onclick: (e) => e.stopPropagation() },
        h('input', { type: 'checkbox', checked: acc.enabled, 'aria-label': `Ligar ${acc.name}`, onchange: () => setEnabled(acc.id, !acc.enabled) }),
        h('span')));
      item.classList.toggle('colored', !!accColor(acc));
      wireItemDrop(item, acc);
      box.append(item);
    }
    if (!accs.length) box.append(h('div', { class: 'acc-meta', style: { padding: '6px 20px' } }, 'arraste contas para cá'));
    scroll.append(box);
  }

  side.replaceChildren(
    h('div', { class: 'side-head' }, h('span', {}, 'Telas'), iconBtn('plus', 'Nova tela (grupo)', () => openGroupForm(null), 'icon-btn sm')),
    h('div', { class: 'seg', role: 'group', 'aria-label': 'Modo das telas' },
      h('button', { class: state.ui.mix ? '' : 'active', onclick: () => state.ui.mix && setMix(false), title: 'Cada grupo na sua tela' }, 'Separadas'),
      h('button', { class: state.ui.mix ? 'active' : '', onclick: () => !state.ui.mix && setMix(true), title: 'Todas as contas juntas' }, 'Misturadas')),
    scroll,
  );
  updateLive(); // preenche os status antes, para a lista já ter a altura final
  scroll.scrollTop = prevTop;
  sideFade(scroll);
  sideScrollObs.disconnect();
  sideScrollObs.observe(scroll);
}

// Menu lateral: arraste a borda para ajustar a largura; arraste até o fim (ou clique na borda / Ctrl+B) para fechar.
const SIDE_MIN = 210, SIDE_MAX = 420, SIDE_DEF = 264, SIDE_CLOSE_AT = 140;
function sideW() { return Math.min(SIDE_MAX, Math.max(SIDE_MIN, Number(state && state.ui.sideW) || SIDE_DEF)); }
function applySide(closed = !!(state && state.ui.sideClosed), w = sideW()) {
  document.body.classList.toggle('side-closed', closed);
  document.body.style.setProperty('--side-w', `${closed ? 0 : w}px`);
}
function setSideClosed(closed) {
  if (!state) return;
  state.ui.sideClosed = !!closed;
  applySide();
  save();
}
function wireResizer() {
  const handle = $('#resizer');
  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !state) return;
    e.preventDefault();
    try { handle.setPointerCapture(e.pointerId); } catch { /* o window abaixo cobre */ }
    const x0 = e.clientX;
    let moved = false, closed = !!state.ui.sideClosed, w = sideW();
    document.body.classList.add('side-dragging', 'dragging');
    const move = (ev) => {
      if (Math.abs(ev.clientX - x0) > 3) moved = true;
      if (!moved) return;
      closed = ev.clientX < SIDE_CLOSE_AT;
      if (!closed) w = Math.min(SIDE_MAX, Math.max(SIDE_MIN, ev.clientX));
      applySide(closed, w);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      document.body.classList.remove('side-dragging', 'dragging');
      if (!moved) closed = !state.ui.sideClosed; // clique simples alterna
      else if (!closed) state.ui.sideW = w;
      setSideClosed(closed);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });
}

function checkLimit(gid) {
  const g = groupById(gid);
  if (!g || !(g.limit > 0)) return;
  const on = state.accounts.filter((a) => a.groupId === gid && a.enabled).length;
  if (on > g.limit) toast(`"${g.name}": ${on} contas ligadas, acima do limite de ${g.limit}. Cuidado com as regras do jogo.`, 'warn', 7000);
}

function setEnabled(id, on) {
  const acc = accById(id);
  if (!acc) return;
  acc.enabled = on;
  log('info', acc, on ? 'ligada' : 'desligada');
  if (on) { checkLimit(acc.groupId); if (!state.ui.mix) state.ui.groupFilter = screenOf(acc); }
  save();
  refresh();
}

function activateOnlyGroup(key) {
  for (const a of state.accounts) a.enabled = screenOf(a) === key;
  log('info', null, `rodízio: só "${screenName(key)}" ligado`);
  toast(`Rodízio: só "${screenName(key)}" está ligado agora.`, 'ok');
  checkLimit(key);
  state.ui.groupFilter = key;
  state.ui.current = null;
  save();
  refresh();
}

function toggleGroupPower(key) {
  const accs = state.accounts.filter((a) => screenOf(a) === key);
  const anyOn = accs.some((a) => a.enabled);
  for (const a of accs) a.enabled = !anyOn;
  if (!anyOn) checkLimit(key);
  save();
  refresh();
}

// =============================================================== miniaturas (view principal)
function shot(acc) {
  const r = rt.get(acc.id);
  return h('div', { class: 'shot' }, (acc.name[0] || '?').toUpperCase(), h('img', { alt: '', dataset: { thumb: acc.id }, src: r && r.thumb ? r.thumb : null }));
}

function renderThumbs() {
  const box = $('#thumbs');
  const cur = ensureCurrent();
  const others = visibleAccounts().filter((a) => a.id !== cur);
  box.replaceChildren(
    ...others.map((acc) => paintAccColor(h('button', { class: 'thumb', title: `Trocar para ${acc.name}`, onclick: () => setCurrent(acc.id, { quiet: true }) },
      shot(acc),
      h('div', { class: 'thumb-head' }, h('span', { class: 'dot', dataset: { dot: acc.id } }), h('span', { class: 'acc-name' }, acc.name),
        h('span', { class: 'acc-meta', dataset: { live: 'up:' + acc.id } }))), acc)),
  );
  if (!others.length) box.append(h('div', { class: 'thumbs-empty' }, 'Ligue mais contas nesta tela para vê-las aqui.'));
  updateLive();
}

// =============================================================== painel
let logFilter = 'all';
function renderDash() {
  const dash = $('#dash');
  const stat = (label, key, hint, cls = '') => h('div', { class: 'card stat ' + cls },
    h('div', { class: 'label' }, label), h('div', { class: 'value', dataset: { live: key } }), hint ? h('div', { class: 'hint' }, hint) : null);
  const cards = state.accounts.map((acc) => {
    const g = groupOf(acc);
    return paintAccColor(h('div', { class: 'card acc-card' },
      shot(acc),
      h('div', { class: 'acc-card-body' },
        h('div', { class: 'acc-card-title' },
          h('span', { class: 'dot', dataset: { dot: acc.id } }),
          h('span', { class: 'acc-name' }, acc.name),
          g ? h('span', { class: 'pill', style: { '--gc': tone(g.color) } }, g.name) : null),
        h('div', { class: 'acc-meta', style: { marginBottom: '8px' }, dataset: { live: 'status:' + acc.id } }),
        h('div', { class: 'kv' },
          h('div', {}, h('span', {}, 'online agora'), h('span', { dataset: { live: 'up:' + acc.id } })),
          h('div', {}, h('span', {}, 'total online'), h('span', { dataset: { live: 'total:' + acc.id } })),
          h('div', {}, h('span', {}, 'quedas'), h('span', { dataset: { live: 'drops:' + acc.id } })),
          h('div', {}, h('span', {}, 'voltaram'), h('span', { dataset: { live: 'recov:' + acc.id } })),
          h('div', {}, h('span', {}, 'memória'), h('span', { dataset: { live: 'mem:' + acc.id } })),
          h('div', {}, h('span', {}, 'CPU'), h('span', { dataset: { live: 'cpu:' + acc.id } }))),
        h('div', { class: 'acc-card-actions' },
          acc.enabled
            ? h('button', { class: 'btn sm', onclick: () => toggleFocus(acc.id) }, icon('expand', 14), 'Focar')
            : h('button', { class: 'btn sm', onclick: () => setEnabled(acc.id, true) }, icon('power', 14), 'Ligar'),
          acc.enabled ? h('button', { class: 'btn sm', onclick: () => manualReload(acc.id) }, icon('reload', 14), 'Recarregar') : null,
          h('button', { class: 'btn sm', onclick: () => openAccountForm(acc) }, icon('edit', 14), 'Editar')))), acc);
  });

  dash.replaceChildren(
    h('div', { class: 'dash-head' },
      h('h2', {}, 'Painel'),
      h('span', { class: 'sub' }, `hoje, ${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}`),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn sm', onclick: () => showSummary(Date.now() - 24 * 3600000, 'Resumo das últimas 24h') }, 'Resumo 24h')),
    h('div', { class: 'kpi-grid' },
      stat('Contas online', 'kpi:online', null, 'accent'),
      stat('Farmando sem parar', 'kpi:farm', 'conta mais antiga online'),
      stat('Tempo online hoje', 'kpi:today', 'somando todas as contas'),
      stat('Quedas hoje', 'kpi:drops'),
      stat('Voltaram sozinhas', 'kpi:recov'),
      stat('Recuperação', 'kpi:rate', 'quedas que voltaram'),
      stat('Alertas hoje', 'kpi:alerts'),
      stat('Memória do app', 'kpi:mem'),
      stat('CPU do app', 'kpi:cpu')),
    h('div', { class: 'dash-cols' },
      h('div', {},
        h('h3', { class: 'section-title' }, 'Contas'),
        cards.length ? h('div', { class: 'acc-cards' }, cards) : h('div', { class: 'card stat' }, 'Nenhuma conta ainda.')),
      h('div', { class: 'card logbox' },
        h('h3', { class: 'section-title' }, 'Atividade'),
        h('div', { class: 'chips', id: 'logChips' }),
        h('div', { class: 'log', id: 'logList' }))),
  );
  renderLog();
  updateLive();
}

function renderLog() {
  const chips = $('#logChips'), list = $('#logList');
  if (!chips || !list) return;
  const filters = [['all', 'Tudo'], ['drop', 'Quedas'], ['recover', 'Voltas'], ['alert', 'Alertas']];
  chips.replaceChildren(...filters.map(([k, label]) => h('button', {
    class: 'chip' + (logFilter === k ? ' active' : ''), onclick: () => { logFilter = k; renderLog(); },
  }, label)));
  const match = (e) => logFilter === 'all'
    || (logFilter === 'drop' && (e.type === 'drop' || e.type === 'freeze'))
    || (logFilter === 'recover' && e.type === 'recover')
    || (logFilter === 'alert' && ALERT_TYPES.includes(e.type));
  const rows = state.log.filter(match).slice(-150).reverse();
  list.replaceChildren(...(rows.length ? rows.map(logRow) : [h('div', { class: 'log-empty' }, 'Nada por aqui ainda.')]));
}
function logRow(e) {
  const type = e.type === 'drop-alert' ? 'drop' : e.type;
  const d = new Date(e.t);
  const time = dayKey(e.t) === dayKey() ? fmtTime(e.t) : `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
  return h('div', { class: 'log-row ' + type, title: new Date(e.t).toLocaleString('pt-BR') },
    h('span', { class: 'time' }, time), h('span', { class: 'mark' }),
    h('span', {}, e.name ? h('b', {}, e.name + ' ') : null, e.msg));
}

// =============================================================== vazio / boas-vindas
function digiGroupId() {
  let g = state.groups.find((x) => norm(x.name) === 'digiidle');
  if (!g) {
    g = { id: uid(), name: 'DigiIdle', color: COLORS[0], limit: 0 };
    state.groups.unshift(g);
  }
  return g.id;
}

function quickAddDigi() {
  const n = state.accounts.filter((a) => isDigi(a.url)).length + 1;
  const acc = {
    ...DEFAULT_ACCOUNT, id: uid(), name: `DigiIdle ${n}`, url: DIGIIDLE.url, groupId: digiGroupId(),
    enabled: true, createdAt: Date.now(), stats: { onlineMs: 0, drops: 0, recoveries: 0 },
  };
  state.accounts.push(acc);
  log('info', acc, 'conta adicionada');
  state.ui.current = acc.id;
  if (!state.ui.mix) state.ui.groupFilter = acc.groupId;
  checkLimit(acc.groupId);
  save();
  refresh();
  toast(`${acc.name} adicionada. Faça o login dentro dela: fica salvo e separado das outras.`, 'ok', 5000);
}

function renderEmpty() {
  const empty = $('#empty');
  if (state.accounts.length) {
    const key = state.ui.groupFilter;
    const hasHere = state.accounts.some((a) => screenOf(a) === key);
    empty.replaceChildren(h('div', { class: 'empty-inner' },
      h('h1', {}, state.ui.mix ? 'Nenhuma conta ligada' : `Nada ligado em "${screenName(key)}"`),
      h('p', {}, hasHere || state.ui.mix ? 'Ligue uma conta na barra lateral para ela aparecer aqui.' : 'Arraste contas para esta tela ou adicione uma nova.'),
      h('div', { class: 'inline', style: { justifyContent: 'center' } },
        !state.ui.mix && !hasHere && key !== 'none' && groupById(key) && norm(groupById(key).name) === 'digiidle'
          ? h('button', { class: 'btn primary', onclick: quickAddDigi }, icon('plus', 15), 'Adicionar conta DigiIdle')
          : h('button', { class: 'btn primary', onclick: () => openAccountForm(null) }, icon('plus', 15), 'Adicionar conta'))));
    return;
  }
  empty.replaceChildren(h('div', { class: 'empty-inner' },
    h('div', { class: 'hero hud' },
      h('span', { class: 'eyebrow' }, 'JOGO PADRÃO'),
      h('h1', {}, 'DigiIdle'),
      h('p', {}, 'Monte seu deck de contas DigiIdle. Cada conta tem login próprio, continua farmando com a janela minimizada e volta sozinha se cair.'),
      h('div', { class: 'hero-actions' },
        h('button', { class: 'btn primary lg', onclick: quickAddDigi }, icon('plus', 17), 'Adicionar conta DigiIdle'),
        h('button', { class: 'linkish', onclick: () => openAccountForm(null, { custom: true }) }, 'Usar outro jogo (URL)'))),
    h('div', { class: 'features' },
      h('span', {}, 'Login separado por conta'),
      h('span', {}, 'Roda 100% minimizado'),
      h('span', {}, 'Reconecta sozinho'),
      h('span', {}, 'Alertas no Windows, Discord e Telegram'),
      h('span', {}, 'Dados criptografados AES-256'))));
}

// =============================================================== menus
function closeMenus() { $('#menuRoot').replaceChildren(); }
function openMenu(anchor, items) {
  closeMenus();
  const menu = h('div', { class: 'menu', role: 'menu' },
    ...items.map((it) => (it === '-' ? h('hr') : h('button', {
      class: it.danger ? 'danger' : '', role: 'menuitem', onclick: () => { closeMenus(); it.onClick(); },
    }, icon(it.icon, 15), it.label))));
  $('#menuRoot').append(menu);
  let x, y;
  if (anchor instanceof MouseEvent) { x = anchor.clientX; y = anchor.clientY; } else {
    const b = anchor.getBoundingClientRect();
    x = b.right - menu.offsetWidth; y = b.bottom + 4;
  }
  x = Math.max(8, Math.min(x, innerWidth - menu.offsetWidth - 8));
  y = Math.max(8, Math.min(y, innerHeight - menu.offsetHeight - 8));
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  menu.querySelector('button')?.focus();
}
document.addEventListener('mousedown', (e) => { if (!e.target.closest('.menu')) closeMenus(); });
window.addEventListener('blur', closeMenus);

function openAccountMenu(id, anchor) {
  const acc = accById(id);
  if (!acc) return;
  const r = rt.get(id);
  const moveItems = screens().filter((k) => k !== screenOf(acc) && k !== 'none')
    .map((k) => ({ icon: 'split', label: `Mover para "${screenName(k)}"`, onClick: () => moveAccount(id, { groupId: k }) }));
  openMenu(anchor, [
    { icon: 'edit', label: 'Editar conta', onClick: () => openAccountForm(acc) },
    { icon: 'palette', label: 'Mudar cor', onClick: () => openAccColorForm(acc) },
    { icon: 'copy', label: 'Duplicar (nova conta, outro login)', onClick: () => duplicateAccount(id) },
    ...moveItems,
    r ? { icon: 'code', label: 'Ferramentas de desenvolvedor', onClick: () => r.wv.openDevTools() } : null,
    { icon: 'key', label: 'Sair do login (apagar dados da conta)', onClick: () => clearLogin(id) },
    '-',
    { icon: 'power', label: acc.enabled ? 'Desligar conta' : 'Ligar conta', onClick: () => setEnabled(id, !acc.enabled) },
    { icon: 'trash', label: 'Excluir conta', danger: true, onClick: () => deleteAccount(id) },
  ].filter(Boolean));
}

// =============================================================== modais
function closeModal() { $('#modalRoot').replaceChildren(); }
function modal({ title, body, foot, wide = false, onClose }) {
  const close = () => { closeModal(); if (onClose) onClose(); };
  const overlay = h('div', { class: 'overlay', onmousedown: (e) => { if (e.target === overlay) close(); } },
    h('div', { class: 'modal hud' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'modal-head' }, h('h3', {}, title), iconBtn('x', 'Fechar', close)),
      h('div', { class: 'modal-body' }, body),
      foot ? h('div', { class: 'modal-foot' }, foot) : null));
  overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  $('#modalRoot').replaceChildren(overlay);
  setTimeout(() => overlay.querySelector('input:not([type=checkbox]), select, textarea, button.primary')?.focus(), 0);
  return { overlay, close };
}

function confirmBox(title, text, okLabel = 'Confirmar', danger = false) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; closeModal(); resolve(v); } };
    modal({
      title,
      body: h('p', { style: { margin: '4px 0 6px', color: 'var(--muted)' } }, text),
      foot: [
        h('button', { class: 'btn', onclick: () => finish(false) }, 'Cancelar'),
        h('button', { class: 'btn ' + (danger ? 'danger solid' : 'primary'), onclick: () => finish(true) }, okLabel),
      ],
      onClose: () => finish(false),
    });
  });
}

const field = (label, input, help) => h('div', { class: 'field' }, h('label', {}, label), input, help ? h('span', { class: 'help' }, help) : null);
const checkRow = (input, label, small) => h('label', { class: 'check' }, input, h('span', {}, label, small ? h('small', {}, small) : null));

function openAccountForm(acc, opts = {}) {
  const isNew = !acc;
  const startCustom = acc ? !isDigi(acc.url) : !!opts.custom;
  const a = acc || {
    ...DEFAULT_ACCOUNT,
    name: startCustom ? '' : `DigiIdle ${state.accounts.filter((x) => isDigi(x.url)).length + 1}`,
    url: startCustom ? '' : DIGIIDLE.url,
    groupId: !state.ui.mix && groupById(state.ui.groupFilter) ? state.ui.groupFilter : (startCustom ? state.groups[0]?.id : digiGroupId()),
  };

  const name = h('input', { class: 'input', value: a.name, placeholder: 'Ex.: DigiIdle 1', maxlength: 60 });
  const game = h('select', { class: 'input', 'aria-label': 'Jogo' },
    h('option', { value: 'digi', selected: !startCustom }, 'DigiIdle'),
    h('option', { value: 'custom', selected: startCustom }, 'Outro jogo (URL)'));
  const url = h('input', { class: 'input', value: startCustom ? a.url : '', placeholder: 'https://…', spellcheck: 'false' });
  const urlField = field('Endereço do jogo (URL)', url, 'Qualquer jogo que rode no navegador.');
  const syncGame = () => {
    urlField.style.display = game.value === 'custom' ? '' : 'none';
    if (!alwaysTouched) alwaysRender.checked = game.value === 'custom'; // outro jogo: na dúvida, desenha sempre
    if (game.value === 'digi' && isNew && !name.value.trim()) name.value = `DigiIdle ${state.accounts.filter((x) => isDigi(x.url)).length + 1}`;
  };
  game.addEventListener('change', () => { syncGame(); if (game.value === 'custom') url.focus(); });

  const group = h('select', { class: 'input' },
    ...state.groups.map((g) => h('option', { value: g.id, selected: g.id === a.groupId }, g.name)),
    h('option', { value: '', selected: !groupById(a.groupId) }, 'Sem grupo'));
  const zoom = h('select', { class: 'input' }, ...[0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5].map((z) => h('option', { value: z, selected: Math.abs(z - (a.zoom || 1)) < 0.001 }, Math.round(z * 100) + '%')));
  const muted = h('input', { type: 'checkbox', checked: a.muted });
  const alwaysRender = h('input', { type: 'checkbox', checked: isNew ? startCustom : !!a.alwaysRender });
  let alwaysTouched = !isNew;
  alwaysRender.addEventListener('change', () => { alwaysTouched = true; });
  const autoReload = h('input', { class: 'input', type: 'number', min: 0, max: 1440, value: a.autoReloadMin || 0 });
  const freezeMin = h('input', { class: 'input', type: 'number', min: 0, max: 1440, value: a.freezeMin || 0 });
  const freezeAction = h('select', { class: 'input' },
    h('option', { value: 'alert', selected: a.freezeAction !== 'reload' }, 'Só avisar'),
    h('option', { value: 'reload', selected: a.freezeAction === 'reload' }, 'Recarregar sozinho'));
  const words = h('input', { class: 'input', value: (a.watchWords || []).join(', '), placeholder: 'ex.: inventário cheio, sessão expirada' });
  const notes = h('textarea', { class: 'input', rows: 2, placeholder: 'Anotações (só você vê, ficam criptografadas)' });
  notes.value = a.notes || '';
  const colorPick = swatchPicker(accColor(a), ACC_SWATCHES, { allowNone: true });

  const submit = () => {
    let finalUrl = DIGIIDLE.url;
    if (game.value === 'custom') {
      const u = url.value.trim();
      let parsed;
      try { parsed = new URL(/^https?:\/\//i.test(u) ? u : 'https://' + u); } catch { parsed = null; }
      if (!u || !parsed || !/^https?:$/.test(parsed.protocol)) { url.focus(); return toast('URL inválida.', 'error'); }
      finalUrl = parsed.href;
    } else if (acc && isDigi(acc.url)) {
      finalUrl = acc.url; // mantém .com / .com.br que a pessoa já usava
    }
    const data = {
      name: name.value.trim() || (game.value === 'digi' ? 'DigiIdle' : new URL(finalUrl).hostname),
      url: finalUrl,
      groupId: group.value || null,
      zoom: Number(zoom.value) || 1,
      muted: muted.checked,
      alwaysRender: alwaysRender.checked,
      autoReloadMin: Math.max(0, Number(autoReload.value) || 0),
      freezeMin: Math.max(0, Number(freezeMin.value) || 0),
      freezeAction: freezeAction.value,
      watchWords: words.value.split(',').map((w) => w.trim()).filter(Boolean),
      notes: notes.value,
      color: colorPick.get(),
    };
    if (isNew) {
      const acc2 = { ...DEFAULT_ACCOUNT, ...data, id: uid(), enabled: true, createdAt: Date.now(), stats: { onlineMs: 0, drops: 0, recoveries: 0 } };
      state.accounts.push(acc2);
      log('info', acc2, 'conta adicionada');
      checkLimit(acc2.groupId);
      state.ui.current = acc2.id;
      if (!state.ui.mix) state.ui.groupFilter = screenOf(acc2);
    } else {
      const urlChanged = acc.url !== data.url;
      Object.assign(acc, data);
      const r = rt.get(acc.id);
      if (r) {
        updateTileMeta(acc, r);
        applyAudio(acc.id);
        applyPainting(acc.id);
        try { r.wv.setZoomFactor(acc.zoom); } catch { /* ignora */ }
        if (urlChanged) { r.lastGoodUrl = null; navigate(r, acc.url); }
      }
    }
    closeModal();
    save();
    refresh();
  };

  modal({
    title: isNew ? 'Adicionar conta' : `Editar ${acc.name}`,
    body: h('form', { onsubmit: (e) => { e.preventDefault(); submit(); } },
      h('div', { class: 'row' }, field('Jogo', game), field('Nome', name)),
      urlField,
      field('Tela (grupo)', group),
      field('Cor da conta', colorPick.el, 'Opcional. Pinta a borda da janela, o título e o item no menu.'),
      h('div', { class: 'row3' },
        field('Zoom', zoom),
        field('Recarregar a cada (min)', autoReload, '0 = nunca'),
        field('Tela parada após (min)', freezeMin, '0 = não vigiar')),
      h('div', { class: 'row' },
        field('Se a tela parar', freezeAction),
        field('Palavras vigiadas desta conta', words, 'separe por vírgula')),
      checkRow(muted, 'Começar sem som'),
      checkRow(alwaysRender, 'Sempre desenhar esta conta', 'Para jogos que param quando a aba fica oculta (vem marcado em outros jogos). O DigiIdle não precisa: fora da tela ele segue caçando sem desenhar. Gasta mais CPU e GPU.'),
      field('Notas', notes),
      isNew ? h('p', { class: 'note' }, 'Cada conta tem cookies e login próprios. Faça o login uma vez dentro da conta e ele fica salvo.') : null,
      h('button', { type: 'submit', hidden: true })),
    foot: [
      h('button', { class: 'btn', onclick: closeModal }, 'Cancelar'),
      h('button', { class: 'btn primary', onclick: submit }, isNew ? 'Adicionar' : 'Salvar'),
    ],
  });
  syncGame();
  setTimeout(() => (startCustom ? url.focus() : name.select()), 0);
}

// Bolinhas de cor. sets: [[título, cores, classe extra]]; allowNone mostra "Sem cor" (valor null).
function swatchPicker(initial, sets, { allowNone = false, onPick } = {}) {
  let color = initial;
  const box = h('div', { class: 'swatch-sets' });
  const btn = (c, cls) => h('button', {
    type: 'button', class: 'swatch' + (cls ? ' ' + cls : '') + (c === color ? ' active' : ''),
    style: { background: c, '--sw': c }, title: c, 'aria-label': 'Cor ' + c,
    onclick: () => { color = c; paint(); if (onPick) onPick(c); },
  });
  const paint = () => box.replaceChildren(
    ...sets.map(([title, list, cls]) => h('div', { class: 'swatch-set' },
      h('span', { class: 'swatch-cap' }, title),
      h('div', { class: 'swatches' }, list.map((c) => btn(c, cls))))),
    allowNone ? h('div', { class: 'swatches' },
      h('button', {
        type: 'button', class: 'swatch none' + (color ? '' : ' active'), title: 'Sem cor (segue o tema)', 'aria-label': 'Sem cor',
        onclick: () => { color = null; paint(); if (onPick) onPick(null); },
      }),
      h('span', { class: 'swatch-cap' }, 'Sem cor (segue o tema)')) : null);
  paint();
  return { el: box, get: () => color };
}
const ACC_SWATCHES = [['Cores do DigiIdle', ACC_COLORS, 'neon'], ['Cores da logo', LOGO_COLORS, 'neon']];

// Parseia proxy do formato "host:port:user:pass" ou "user:pass@host:port" ou "host:port"
function parseProxyString(str) {
  if (!str || typeof str !== 'string') return null;
  str = str.trim();
  if (!str) return null;
  
  let host, port, user, pass;
  
  // Formato "user:pass@host:port"
  if (str.includes('@')) {
    const [creds, addr] = str.split('@');
    const [u, p] = creds.split(':');
    user = u.trim();
    pass = p?.trim() || '';
    const [h, po] = addr.split(':');
    host = h.trim();
    port = parseInt(po, 10);
  } else {
    // Formato "host:port:user:pass" (Webshare) ou "host:port"
    const parts = str.split(':');
    if (parts.length >= 2) {
      host = parts[0].trim();
      port = parseInt(parts[1], 10);
      if (parts.length === 4) {
        user = parts[2].trim();
        pass = parts[3].trim();
      }
    }
  }
  
  if (!host || !port || isNaN(port) || port < 1 || port > 65535) return null;
  
  return { host, port, user: user || '', pass: pass || '' };
}

function formatProxyForDisplay(proxy) {
  if (!proxy) return '';
  if (proxy.user && proxy.pass) {
    return `${proxy.host}:${proxy.port} (${proxy.user}:${proxy.pass.slice(0, 2)}...${proxy.pass.slice(-2)})`;
  }
  return `${proxy.host}:${proxy.port}`;
}

// Atalho do menu da conta: escolher a cor sem abrir o formulário inteiro.
function openAccColorForm(acc) {
  const set = (c) => {
    acc.color = c;
    const r = rt.get(acc.id);
    if (r) paintAccColor(r.tile, acc);
    save();
    refresh();
    closeModal();
  };
  const picker = swatchPicker(accColor(acc), ACC_SWATCHES, { allowNone: true, onPick: set });
  modal({
    title: `Cor de ${acc.name}`,
    body: h('div', {},
      h('p', { class: 'note', style: { marginBottom: '12px' } }, 'Pinta a borda da janela, o título e o item no menu, para achar a conta de relance.'),
      picker.el),
  });
}

function openGroupForm(g) {
  const isNew = !g;
  let color = g ? tone(g.color) : COLORS[state.groups.length % COLORS.length];
  let proxy = g && g.proxy ? { ...g.proxy } : null;
  
  const name = h('input', { class: 'input', value: g ? g.name : '', placeholder: 'Ex.: DigiIdle Time A, Outro jogo…', maxlength: 40 });
  const limit = h('input', { class: 'input', type: 'number', min: 0, max: 99, value: g ? g.limit || 0 : 0 });
  const proxyInput = h('textarea', { class: 'input', style: { fontFamily: 'monospace', minHeight: '60px' }, placeholder: 'Cole o proxy aqui: host:port:user:pass', spellcheck: 'false' });
  const proxyStatus = h('span', { class: 'help', style: { display: 'block', marginTop: '4px' } }, proxy ? `✓ ${formatProxyForDisplay(proxy)}` : 'Nenhum proxy');
  const sw = swatchPicker(color, [['Tons', COLORS], ['Cores da logo', LOGO_COLORS, 'neon']], { onPick: (c) => { color = c; } }).el;
  
  let testingProxy = false;
  const testProxyBtn = h('button', { type: 'button', class: 'btn', style: { marginRight: '8px' } }, 'Testar');
  const clearProxyBtn = h('button', { type: 'button', class: 'btn', style: { marginRight: '8px' } }, 'Remover');
  
  const updateProxyStatus = () => {
    const text = proxyInput.value.trim();
    if (text) {
      const parsed = parseProxyString(text);
      if (parsed) {
        proxy = parsed;
        proxyStatus.textContent = `✓ ${formatProxyForDisplay(proxy)}`;
        proxyStatus.style.color = '';
      } else {
        proxyStatus.textContent = '✗ Formato inválido';
        proxyStatus.style.color = '#f87171';
        proxy = null;
      }
    } else {
      proxy = null;
      proxyStatus.textContent = 'Nenhum proxy';
      proxyStatus.style.color = '';
    }
  };
  
  testProxyBtn.onclick = async (e) => {
    e.preventDefault();
    updateProxyStatus();
    if (!proxy) return;
    testingProxy = true;
    testProxyBtn.disabled = true;
    testProxyBtn.textContent = 'Testando…';
    try {
      const result = await deck.testProxy(proxy);
      if (result.ok) {
        proxyStatus.textContent = `✓ IP de saída: ${result.ip}`;
        proxyStatus.style.color = '#4ade80';
      } else {
        proxyStatus.textContent = `✗ Falhou: ${result.error}`;
        proxyStatus.style.color = '#f87171';
      }
    } catch (err) {
      proxyStatus.textContent = `✗ Erro: ${err.message}`;
      proxyStatus.style.color = '#f87171';
    } finally {
      testingProxy = false;
      testProxyBtn.disabled = false;
      testProxyBtn.textContent = 'Testar';
    }
  };
  
  clearProxyBtn.onclick = (e) => {
    e.preventDefault();
    proxy = null;
    proxyInput.value = '';
    proxyStatus.textContent = 'Nenhum proxy';
    proxyStatus.style.color = '';
  };

  const submit = async () => {
    const n = name.value.trim();
    if (!n) { name.focus(); return; }
    
    updateProxyStatus();
    
    const oldProxy = g ? g.proxy : null;
    const proxyChanged = JSON.stringify(proxy) !== JSON.stringify(oldProxy);
    
    if (isNew) {
      const ng = { id: uid(), name: n, color, limit: Number(limit.value) || 0, proxy: proxy || null };
      state.groups.push(ng);
      if (!state.ui.mix) state.ui.groupFilter = ng.id;
    } else {
      Object.assign(g, { name: n, color, limit: Number(limit.value) || 0, proxy: proxy || null });
      checkLimit(g.id);
      
      if (proxyChanged) {
        const accsInGroup = state.accounts.filter((a) => a.groupId === g.id);
        for (const acc of accsInGroup) {
          const r = rt.get(acc.id);
          if (r && r.wv) {
            const partition = `persist:acc-${acc.id}`;
            await deck.applyProxy(partition, proxy);
            r.wv.reload();
          }
        }
      }
    }
    closeModal();
    save();
    refresh();
  };
  
  const remove = async () => {
    const count = state.accounts.filter((a) => a.groupId === g.id).length;
    const ok = await confirmBox('Excluir tela', count ? `As ${count} conta(s) desta tela vão para "Sem grupo". Nenhuma conta é apagada.` : 'A tela está vazia.', 'Excluir tela', true);
    if (!ok) return;
    state.groups = state.groups.filter((x) => x.id !== g.id);
    for (const a of state.accounts) if (a.groupId === g.id) a.groupId = null;
    save();
    refresh();
  };

  modal({
    title: isNew ? 'Nova tela' : 'Editar tela',
    body: h('form', { onsubmit: (e) => { e.preventDefault(); submit(); } },
      h('p', { class: 'note', style: { marginBottom: '14px' } }, 'Cada tela é um grupo: as contas dela aparecem juntas, separadas das outras. Use "Misturar telas" para ver tudo junto.'),
      field('Nome', name),
      field('Limite de contas ligadas', limit, 'O DigiDeck avisa se você ligar mais contas que o jogo permite. 0 = sem limite.'),
      h('div', { class: 'field' },
        h('label', {}, 'Proxy (opcional)'),
        h('p', { class: 'note', style: { margin: '0 0 8px 0', fontSize: '0.85em' } }, 'Cole no formato "host:port:user:pass" (Webshare) ou "host:port". As contas desta tela sairão apenas por este proxy.'),
        proxyInput,
        h('div', { style: { marginTop: '8px', display: 'flex', gap: '8px' } },
          testProxyBtn,
          clearProxyBtn),
        proxyStatus),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Cor'), sw),
      h('button', { type: 'submit', hidden: true })),
    foot: [
      !isNew && state.groups.length > 1 ? h('button', { class: 'btn danger left', onclick: remove }, icon('trash', 14), 'Excluir') : null,
      h('button', { class: 'btn', onclick: closeModal }, 'Cancelar'),
      h('button', { class: 'btn primary', onclick: submit }, isNew ? 'Criar' : 'Salvar'),
    ],
  });
}

// =============================================================== segurança
function secureLabel() {
  if (vaultInfo.mode === 'password') return 'senha mestra';
  if (vaultInfo.mode === 'dpapi') return 'Windows';
  return 'sem proteção';
}
function updateSecureBadge() {
  $('#btnLock').replaceChildren(icon(vaultInfo.mode === 'password' ? 'lock' : 'unlock', 18));
  $('#btnLock').title = vaultInfo.mode === 'password' ? 'Bloquear (Ctrl+L)' : 'Bloqueio: defina uma senha mestra';
}

function strengthOf(p) {
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  if (p.length >= 16) s++;
  return Math.min(4, Math.floor(s * 0.8));
}
function strengthMeter(input) {
  const bar = h('i');
  const label = h('span', { class: 'help' });
  const upd = () => {
    const s = input.value ? strengthOf(input.value) : -1;
    const colors = ['#f87171', '#fb923c', '#fbbf24', '#86efac', '#4ade80'];
    const names = ['muito fraca', 'fraca', 'razoável', 'forte', 'muito forte'];
    bar.style.width = s < 0 ? '0' : `${(s + 1) * 20}%`;
    bar.style.background = s < 0 ? 'transparent' : colors[s];
    label.textContent = s < 0 ? 'Mínimo de 8 caracteres. Uma frase longa é o melhor.' : `Força: ${names[s]}`;
  };
  input.addEventListener('input', upd);
  upd();
  return [h('div', { class: 'strength' }, bar), label];
}

function passwordInput(placeholder, autocomplete = 'new-password') {
  return h('input', { class: 'input', type: 'password', placeholder, autocomplete, maxlength: 256, spellcheck: 'false' });
}

// =============================================================== ferramentas
// Lista as ferramentas prontas; cada uma é ligada e configurada por conta.
function openTools() {
  if (!state.tools || typeof state.tools !== 'object') state.tools = {};
  const body = h('div', {});

  const draw = () => {
    body.replaceChildren();
    body.append(h('p', { class: 'about' },
      'Automações prontas que rodam dentro do jogo. Ligue por conta e ajuste o que cada uma faz. Depois de salvar, recarregue a conta (F5) para aplicar.'));

    for (const t of (window.DDTools?.TOOLS || [])) {
      const porConta = state.tools[t.id] || {};
      const ligadas = state.accounts.filter((a) => porConta[a.id]?.enabled);
      body.append(h('div', { class: 'row-line', style: { display: 'flex', gap: '10px', alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--line-2)' } },
        icon(t.icon, 18),
        h('div', { style: { flex: 1, minWidth: 0 } },
          h('div', {}, t.name),
          h('span', { class: 'about' }, ligadas.length
            ? `Ligada em ${ligadas.length} conta(s): ${ligadas.map((a) => a.name).join(', ')}`
            : t.desc)),
        h('button', { class: 'btn sm', type: 'button', onclick: () => openToolAccounts(t) }, 'Configurar')));
    }
  };

  draw();
  modal({
    title: 'Ferramentas',
    wide: true,
    body,
    foot: [h('button', { class: 'btn', onclick: closeModal }, 'Fechar')],
  });
}

// Uma ferramenta, conta a conta: liga/desliga e abre os ajustes daquela conta.
function openToolAccounts(tool) {
  if (!state.tools[tool.id]) state.tools[tool.id] = {};
  const porConta = state.tools[tool.id];
  const list = h('div', {});

  const draw = () => {
    list.replaceChildren();
    if (!state.accounts.length) {
      list.append(h('p', { class: 'about' }, 'Nenhuma conta cadastrada ainda.'));
      return;
    }
    for (const acc of state.accounts) {
      if (!porConta[acc.id]) porConta[acc.id] = { enabled: false, cfg: tool.defaults() };
      const conf = porConta[acc.id];
      const cfg = { ...tool.defaults(), ...(conf.cfg || {}) };
      list.append(h('div', { class: 'row-line', style: { display: 'flex', gap: '10px', alignItems: 'center', padding: '8px 0' } },
        h('input', {
          type: 'checkbox',
          checked: !!conf.enabled,
          title: `Ligar esta ferramenta em ${acc.name}`,
          onchange: (e) => {
            conf.enabled = e.target.checked;
            save();
            draw();
            applyToolLive(tool.id, acc.id); // liga/desliga na hora, sem F5
          },
        }),
        h('div', { style: { flex: 1, minWidth: 0 } },
          h('div', {}, acc.name),
          h('span', { class: 'about' }, tool.summary(cfg))),
        h('button', { class: 'btn sm', type: 'button', onclick: () => openToolConfig(tool, acc, () => openToolAccounts(tool)) }, 'Ajustar')));
    }
  };

  draw();
  modal({
    title: `${tool.name} · por conta`,
    wide: true,
    body: h('div', {}, h('p', { class: 'about' }, tool.desc), list),
    foot: [h('button', { class: 'btn', onclick: () => { closeModal(); openTools(); } }, 'Voltar')],
  });
}

// Os ajustes de uma ferramenta numa conta. Cada ferramenta desenha o seu formulário.
function openToolConfig(tool, acc, onDone) {
  const conf = state.tools[tool.id][acc.id];
  const cfg = { ...tool.defaults(), ...(conf.cfg || {}) };
  const forms = { refill: refillForm, eggs: eggsForm, hunt: huntForm, scan: scanForm, lab: labForm };
  const form = (forms[tool.id] || refillForm)(cfg);

  modal({
    title: `${tool.name} · ${acc.name}`,
    wide: true,
    body: form.el,
    foot: [
      h('button', { class: 'btn', onclick: () => { closeModal(); onDone(); } }, 'Cancelar'),
      h('button', {
        class: 'btn primary',
        onclick: async () => {
          conf.cfg = form.read();
          save();
          closeModal();
          onDone();
          // Vale já na conta aberta; se ela estiver fechada, vale no próximo carregamento.
          const vivo = conf.enabled ? await applyToolLive(tool.id, acc.id) : false;
          toast(vivo ? `Ferramenta salva e já aplicada em ${acc.name}.`
            : 'Ferramenta salva.', 'ok', 4000);
        },
      }, 'Salvar'),
    ],
  });
}

// --------------------------------------------------- formulário do Auto Refill
function refillForm(cfg) {
  const itens = window.DDTools.REFILL_ITENS;
  const rows = h('div', {});
  const regras = (cfg.regras || []).map((r) => ({ ...r }));

  const draw = () => {
    rows.replaceChildren();
    if (!regras.length) rows.append(h('p', { class: 'about' }, 'Nenhum item ainda. Clique em "Adicionar item".'));
    regras.forEach((r, i) => {
      const sel = h('select', { class: 'input', style: { flex: 1 } },
        ...itens.map((it) => h('option', { value: it.id, selected: it.id === r.item }, it.nome)));
      sel.addEventListener('change', () => { r.item = sel.value; });
      const min = h('input', { class: 'input', type: 'number', min: '0', value: String(r.min), style: { width: '90px' } });
      const max = h('input', { class: 'input', type: 'number', min: '1', value: String(r.max), style: { width: '90px' } });
      min.addEventListener('change', () => { r.min = Math.max(0, +min.value || 0); });
      max.addEventListener('change', () => { r.max = Math.max(1, +max.value || 1); });
      rows.append(h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', padding: '4px 0' } },
        sel,
        h('span', { class: 'about' }, 'mín.'), min,
        h('span', { class: 'about' }, 'até'), max,
        iconBtn('trash', 'Remover', () => { regras.splice(i, 1); draw(); })));
    });
  };
  draw();

  const reserva = h('input', { class: 'input', type: 'number', min: '0', value: String(cfg.reservaBits || 0) });
  const intervalo = h('input', { class: 'input', type: 'number', min: '5', value: String(cfg.intervaloSec || 15) });
  const parcial = h('input', { type: 'checkbox', checked: cfg.parcial !== false });

  const el = h('div', {},
    h('div', { class: 'field' },
      h('label', {}, 'Itens'),
      rows,
      h('button', {
        class: 'btn sm', type: 'button', style: { marginTop: '6px' },
        onclick: () => { regras.push({ item: itens[0].id, min: 10, max: 50 }); draw(); },
      }, icon('plus', 14), 'Adicionar item'),
      h('span', { class: 'help' }, 'Compra quando a quantidade chegar ao mínimo (ou abaixo) e repõe até o valor final.')),
    field('Reserva de bits', reserva, 'A ferramenta nunca gasta abaixo deste saldo. 0 = pode usar tudo.'),
    field('Conferir a cada (segundos)', intervalo),
    checkRow(parcial, 'Comprar o que couber', 'Sem bits para o lote inteiro, compra a quantidade possível.'),
    h('div', { class: 'warnbox' }, 'Só itens com preço em bits na Loja. Scanner Prismático (DCoin) e Evoluter (drop) não são compráveis.'));

  return {
    el,
    read: () => ({
      regras: regras.filter((r) => r.max > r.min),
      reservaBits: Math.max(0, +reserva.value || 0),
      intervaloSec: Math.max(5, +intervalo.value || 15),
      parcial: parcial.checked,
    }),
  };
}

// ----------------------------------------- formulário do Auto Melhor Hunt
function huntForm(cfg) {
  const intervalo = h('input', { class: 'input', type: 'number', min: '1', value: String(cfg.intervaloMin || 5) });
  const ganho = h('input', { class: 'input', type: 'number', min: '0', value: String(cfg.ganhoMin || 0) });
  const tranq = h('input', { type: 'checkbox', checked: cfg.soTranquilas !== false });
  const volta = h('input', { type: 'checkbox', checked: cfg.voltarUltima !== false });

  const el = h('div', {},
    field('Conferir a cada (minutos)', intervalo),
    checkRow(volta, 'Ao sair do Hospital, voltar para a hunt em que estava', 'É o que acontece ao sair do Labirinto da Guild: o jogo manda a conta para o Hospital. Marcado, ela volta para a área de antes; desmarcado, vai para a recomendada do Mapa.'),
    checkRow(tranq, 'Só trocar para áreas tranquilas', 'A recomendada do jogo já é a de menor perigo; isto recusa a troca se mesmo assim ela não for tranquila. Não afeta a volta para a hunt de antes.'),
    field('Ganho mínimo de XP para trocar (%)', ganho, '0 = troca sempre que não estivermos na recomendada. Ex.: 15 só troca se render 15% mais XP/h.'),
    h('div', { class: 'warnbox' }, 'Durante o Labirinto da Guild a ferramenta não troca nada. Parada no Hospital Digital, ela reconfere a cada 30 s até a conta sair de lá. Se a conta nunca caçou, não há hunt de antes: nesse caso vai para a recomendada.'));

  return {
    el,
    read: () => ({
      intervaloMin: Math.max(1, +intervalo.value || 5),
      ganhoMin: Math.max(0, +ganho.value || 0),
      soTranquilas: tranq.checked,
      voltarUltima: volta.checked,
    }),
  };
}

// ---------------------------------------------- formulário do Auto Labirinto
function labForm(cfg) {
  const intervalo = h('input', { class: 'input', type: 'number', min: '1', value: String(cfg.intervaloMin || 2) });

  const el = h('div', {},
    field('Conferir o lobby a cada (minutos)', intervalo, 'Além disso, a ferramenta reage ao aviso do servidor de que o lobby mudou — então ela entra logo depois de a corrida acabar, sem esperar este intervalo.'),
    h('div', { class: 'warnbox' }, 'A ferramenta só se INSCREVE no lobby. Ela nunca começa a corrida (isso exige ser dono ou sub-dono da guild) nem mexe na dificuldade, que vale para a guild inteira. Se a conta não tem guild, não tem Digimon que possa lutar, ou o lobby está cheio ou com corrida rodando, ela não faz nada e diz o motivo no log.'));

  return {
    el,
    read: () => ({ intervaloMin: Math.max(1, +intervalo.value || 2) }),
  };
}

// --------------------------------------------------- formulário do Auto Scan
function scanForm(cfg) {
  const escolhidos = [...(cfg.scanners || [])];
  const box = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '10px' } });
  const SCANNERS = window.DDTools.REFILL_ITENS.filter((i) => i.id.startsWith('scanner-'));
  for (const s of SCANNERS) {
    const cb = h('input', { type: 'checkbox', checked: escolhidos.includes(s.id) });
    cb.addEventListener('change', () => {
      const i = escolhidos.indexOf(s.id);
      if (cb.checked && i < 0) escolhidos.push(s.id);
      else if (!cb.checked && i >= 0) escolhidos.splice(i, 1);
    });
    box.append(h('label', { class: 'check', style: { margin: 0 } }, cb, h('span', {}, s.nome)));
  }

  const teto = h('input', { class: 'input', type: 'number', min: '0', value: String(cfg.maxPorMin || 0) });
  const semVip = h('input', { type: 'checkbox', checked: cfg.soSemVip !== false });

  const el = h('div', {},
    h('div', { class: 'field' }, h('label', {}, 'Scanners a usar'), box,
      h('span', { class: 'help' }, 'Usa o primeiro da lista que você tiver na mochila. Marque mais de um para ter reserva.')),
    field('Máximo de scans por minuto', teto, '0 = sem limite (escaneia todo Digimon que cair). Use para segurar o gasto de scanner.'),
    checkRow(semVip, 'Só agir em contas sem VIP', 'Com VIP o jogo já escaneia sozinho; agir junto gastaria scanner em dobro.'),
    h('div', { class: 'warnbox' }, 'Escaneia no instante em que o Digimon cai, então funciona com a cena desligada e no Modo Economia. Cada corpo aceita uma tentativa só. No Labirinto não há scan de corpo.'));

  return {
    el,
    read: () => ({
      scanners: escolhidos.length ? escolhidos : ['scanner-basico'],
      maxPorMin: Math.max(0, +teto.value || 0),
      soSemVip: semVip.checked,
    }),
  };
}

// --------------------------------------------------- formulário do Vender ovos
function eggsForm(cfg) {
  const tiers = new Set(cfg.tiers || []);
  const pots = new Set(cfg.potencias || []);

  const tierBox = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '10px' } });
  for (const t of window.DDTools.TIERS) {
    const cb = h('input', { type: 'checkbox', checked: tiers.has(t) });
    cb.addEventListener('change', () => (cb.checked ? tiers.add(t) : tiers.delete(t)));
    tierBox.append(h('label', { class: 'check', style: { margin: 0 } }, cb, h('span', {}, t)));
  }

  const potBox = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '10px' } });
  for (const p of [1, 2, 3, 4, 5]) {
    const cb = h('input', { type: 'checkbox', checked: pots.has(p) });
    cb.addEventListener('change', () => (cb.checked ? pots.add(p) : pots.delete(p)));
    potBox.append(h('label', { class: 'check', style: { margin: 0 } }, cb, h('span', {}, `P${p}`)));
  }

  const intervalo = h('input', { class: 'input', type: 'number', min: '1', value: String(cfg.intervaloMin || 10) });
  const shiny = h('input', { type: 'checkbox', checked: !!cfg.shiny });
  const energia = h('input', { type: 'checkbox', checked: !!cfg.comEnergia });
  const prot = h('input', { type: 'checkbox', checked: !!cfg.protegido });
  const semTier = h('input', { type: 'checkbox', checked: !!cfg.semTier });

  const el = h('div', {},
    h('div', { class: 'field' }, h('label', {}, 'Vender estes tiers'), tierBox,
      h('span', { class: 'help' }, 'De fábrica, S, SS e SSS ficam de fora: esses ovos nunca são vendidos.')),
    h('div', { class: 'field' }, h('label', {}, 'Vender estas potências'), potBox),
    field('Vender a cada (minutos)', intervalo),
    checkRow(shiny, 'Vender ovos Shiny', 'Desligado: ovo Shiny nunca é vendido.'),
    checkRow(energia, 'Vender ovos com energia (+1 a +5)'),
    checkRow(prot, 'Vender ovos com Proteção'),
    checkRow(semTier, 'Vender ovos sem tier', 'Ovos antigos, sem o sorteio: não dá para saber o que nascem.'),
    h('div', { class: 'warnbox' }, 'Ovos com cadeado nunca são vendidos — a trava é do próprio jogo. A venda é definitiva: comece com poucos tiers e confira o resultado.'));

  return {
    el,
    read: () => ({
      tiers: [...tiers],
      potencias: [...pots],
      shiny: shiny.checked,
      comEnergia: energia.checked,
      protegido: prot.checked,
      semTier: semTier.checked,
      intervaloMin: Math.max(1, +intervalo.value || 10),
    }),
  };
}

// Lista de scripts do usuário: liga/desliga, edita, remove.
function openScriptsEditor() {
  if (!Array.isArray(state.scripts)) state.scripts = [];
  const list = h('div', { style: { marginBottom: '12px' } });

  // Nome próprio: refresh() global é o do app, não pode ser sombreado aqui.
  const drawList = () => {
    list.replaceChildren();
    if (!state.scripts.length) {
      list.append(h('p', { class: 'about' }, 'Nenhum script ainda. Clique em "Novo script" para começar.'));
      return;
    }
    for (const script of state.scripts) {
      const alvo = script.matchUrl || 'qualquer página';
      const contas = Array.isArray(script.accountIds) && script.accountIds.length
        ? `${script.accountIds.length} conta(s)` : 'todas as contas';
      list.append(h('div', { class: 'row-line', style: { display: 'flex', gap: '10px', alignItems: 'center', padding: '8px 0' } },
        h('input', {
          type: 'checkbox',
          checked: !!script.enabled,
          title: 'Ligar/desligar este script',
          onchange: (e) => { script.enabled = e.target.checked; save(); },
        }),
        h('div', { style: { flex: 1, minWidth: 0 } },
          h('div', {}, script.name || 'Sem nome'),
          h('span', { class: 'about' }, `${alvo} · ${contas}`)),
        h('button', { class: 'btn sm', type: 'button', onclick: () => editScript(script, () => { drawList(); }) }, 'Editar'),
        h('button', {
          class: 'btn sm danger',
          type: 'button',
          onclick: () => {
            const i = state.scripts.indexOf(script);
            if (i >= 0) state.scripts.splice(i, 1);
            save();
            drawList();
          },
        }, 'Remover')));
    }
  };

  const novo = () => {
    const script = {
      id: uid(),
      name: 'Novo script',
      code: 'DD.log("ola do meu script");',
      enabled: true,
      matchUrl: '',
      accountIds: [],
      runAt: 'dom-ready',
    };
    state.scripts.push(script);
    save();
    editScript(script, () => openScriptsEditor());
  };

  drawList();

  modal({
    title: 'Scripts do usuário',
    wide: true,
    body: h('div', {},
      h('p', { class: 'about' }, 'Cada script roda dentro da página da conta quando ela termina de carregar. Depois de salvar, recarregue a conta (F5) para aplicar.'),
      list,
      h('button', { class: 'btn sm primary', type: 'button', onclick: novo }, icon('plus', 14), 'Novo script')),
    foot: [h('button', { class: 'btn', onclick: closeModal }, 'Fechar')],
  });
}

function editScript(script, onDone) {
  const name = h('input', { class: 'input', value: script.name, placeholder: 'Nome do script' });
  const matchUrl = h('input', { class: 'input', value: script.matchUrl || '', placeholder: 'https://digiidle.com/* (vazio = todas as URLs)' });
  const code = h('textarea', { class: 'input', rows: 20, value: script.code, style: { fontFamily: 'GeistMono, monospace', fontSize: '12px' } });
  
  // Seleção de contas: nenhuma marcada = roda em todas.
  const marcadas = new Set(Array.isArray(script.accountIds) ? script.accountIds : []);
  const accList = h('div', { style: { maxHeight: '150px', overflowY: 'auto', marginTop: '6px' } });
  if (!state.accounts.length) {
    accList.append(h('p', { class: 'about' }, 'Nenhuma conta cadastrada ainda.'));
  } else {
    for (const acc of state.accounts) {
      accList.append(h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', padding: '3px 0' } },
        h('input', {
          type: 'checkbox',
          checked: marcadas.has(acc.id),
          onchange: (e) => (e.target.checked ? marcadas.add(acc.id) : marcadas.delete(acc.id)),
        }),
        h('span', {}, acc.name)));
    }
  }

  // Nome diferente de save() para não sombrear o save() global (que grava no cofre).
  const applyEdits = () => {
    script.name = name.value.trim() || 'Sem nome';
    script.matchUrl = matchUrl.value.trim();
    script.code = code.value;
    script.accountIds = [...marcadas];
    save(); // persiste no cofre criptografado
    closeModal();
    toast('Script salvo. Recarregue a conta (F5) para aplicar.', 'ok', 5000);
    if (typeof onDone === 'function') onDone();
  };

  modal({
    title: 'Editar script',
    wide: true,
    body: h('div', {},
      field('Nome', name),
      field('Rodar em quais páginas?', matchUrl, 'Use * como curinga. Vazio = qualquer página da conta.'),
      h('div', { class: 'field' }, h('label', {}, 'Rodar em quais contas?'), accList,
        h('span', { class: 'about' }, 'Nenhuma marcada = todas as contas.')),
      field('Código JavaScript', code),
      h('div', { class: 'warnbox' }, 'O script roda dentro da página do jogo. Só use código que você entende: ele pode mexer em tudo que a conta vê.'),
      h('p', { class: 'about' },
        'Disponível: DD.log(...) · DD.storage.get/set/remove(chave) · DD.waitFor(seletor, ms) · DD.onTick(fn, ms)')),
    foot: [
      h('button', { class: 'btn', onclick: closeModal }, 'Cancelar'),
      h('button', { class: 'btn primary', onclick: applyEdits }, 'Salvar'),
    ],
  });
}

function openPasswordForm(mode) {
  const current = mode !== 'set' ? passwordInput('Senha atual', 'current-password') : null;
  const next = mode !== 'remove' ? passwordInput('Nova senha mestra') : null;
  const confirm = mode !== 'remove' ? passwordInput('Repita a nova senha') : null;
  const err = h('div', { class: 'lock-err' });
  const okBtn = h('button', { class: 'btn ' + (mode === 'remove' ? 'danger solid' : 'primary') },
    mode === 'set' ? 'Ativar senha mestra' : mode === 'change' ? 'Trocar senha' : 'Remover senha');

  const submit = async () => {
    err.textContent = '';
    if (next && next.value.length < 8) { err.textContent = 'A senha precisa ter pelo menos 8 caracteres.'; return next.focus(); }
    if (next && next.value !== confirm.value) { err.textContent = 'As senhas não batem.'; return confirm.focus(); }
    okBtn.disabled = true;
    okBtn.textContent = 'Criptografando…';
    await flush();
    const res = mode === 'remove'
      ? await deck.removePassword(current.value)
      : await deck.setPassword({ current: current ? current.value : '', next: next.value });
    okBtn.disabled = false;
    okBtn.textContent = mode === 'set' ? 'Ativar senha mestra' : mode === 'change' ? 'Trocar senha' : 'Remover senha';
    if (!res.ok) { err.textContent = res.error || 'Não deu certo.'; return; }
    vaultInfo = res.vault;
    updateSecureBadge();
    log('security', null, mode === 'set' ? 'senha mestra ativada' : mode === 'change' ? 'senha mestra trocada (chave nova gerada)' : 'senha mestra removida');
    closeModal();
    toast(mode === 'remove' ? 'Senha removida. Os dados continuam criptografados com a proteção do Windows.' : 'Pronto. Seus dados agora só abrem com a senha mestra.', 'ok', 5000);
  };

  modal({
    title: mode === 'set' ? 'Ativar senha mestra' : mode === 'change' ? 'Trocar senha mestra' : 'Remover senha mestra',
    body: h('form', { onsubmit: (e) => { e.preventDefault(); submit(); } },
      mode !== 'remove' ? h('div', { class: 'secbox' }, icon('shield', 18), h('div', {},
        h('b', {}, 'Só você abre os seus dados'),
        h('span', {}, 'Contas, grupos, notas, estatísticas e tokens são criptografados com AES-256-GCM. A chave sai da sua senha via scrypt. A senha nunca é salva em lugar nenhum.'))) : null,
      mode !== 'remove' ? h('div', { class: 'warnbox' }, 'Se esquecer a senha, não existe recuperação. Ninguém consegue abrir, nem nós. Guarde num gerenciador de senhas.') : null,
      current ? field('Senha atual', current) : null,
      next ? h('div', { class: 'field' }, h('label', {}, 'Nova senha'), next, ...strengthMeter(next)) : null,
      confirm ? field('Confirmar', confirm) : null,
      mode === 'remove' ? h('p', { class: 'note' }, 'Sem a senha, os dados continuam criptografados, mas a chave fica protegida só pelo seu usuário do Windows.') : null,
      err,
      h('button', { type: 'submit', hidden: true })),
    foot: [h('button', { class: 'btn', onclick: closeModal }, 'Cancelar'), okBtn],
  });
  okBtn.addEventListener('click', submit);
}

function showLock({ boot = false, onTry, after }) {
  lockedUI = true;
  updateSleep(); // a tela de bloqueio cobre tudo: as contas seguem jogando sem desenhar
  closeModal();
  closeMenus();
  const pw = h('input', { class: 'input lg', type: 'password', placeholder: 'Senha mestra', autocomplete: 'current-password', 'aria-label': 'Senha mestra' });
  const err = h('div', { class: 'lock-err', role: 'alert' });
  const btn = h('button', { class: 'btn primary lg', type: 'submit' }, icon('unlock', 17), 'Desbloquear');
  const card = h('form', {
    class: 'lock-card hud',
    onsubmit: async (e) => {
      e.preventDefault();
      if (!pw.value || btn.disabled) return;
      btn.disabled = true;
      err.textContent = '';
      btn.lastChild.textContent = 'Verificando…';
      const ok = await onTry(pw.value);
      btn.disabled = false;
      btn.lastChild.textContent = 'Desbloquear';
      if (ok) {
        $('#lockRoot').replaceChildren();
        lockedUI = false;
        updateSleep();
        if (after) after();
        return;
      }
      err.textContent = 'Senha incorreta.';
      pw.select();
      card.classList.remove('shake');
      void card.offsetWidth;
      card.classList.add('shake');
    },
  },
  logoEl(),
  h('h2', {}, boot ? 'DigiDeck protegido' : 'DigiDeck bloqueado'),
  h('p', {}, boot ? 'Digite sua senha mestra para abrir suas contas.' : 'Os jogos continuam rodando. Digite a senha para voltar.'),
  pw, err, btn,
  boot ? h('button', { type: 'button', class: 'linkish', onclick: forgotPassword }, 'Esqueci a senha') : null,
  h('div', { class: 'lock-foot' }, icon('shield', 13), 'Criptografia de ponta a ponta'));
  $('#lockRoot').replaceChildren(h('div', { class: 'lock' }, card));
  setTimeout(() => pw.focus(), 50);
}

async function forgotPassword() {
  const lockEl = $('#lockRoot');
  lockEl.style.display = 'none'; // o aviso precisa aparecer por cima da tela de bloqueio
  const ok = await confirmBox(
    'Esqueci a senha',
    'Sem a senha não há como abrir os dados: essa é a garantia da criptografia. Dá para começar do zero: o arquivo criptografado fica guardado numa cópia, caso você lembre da senha depois. Os logins dos jogos não são afetados.',
    'Começar do zero', true,
  );
  lockEl.style.display = '';
  if (!ok) return;
  const res = await deck.resetVault();
  vaultInfo = res.vault;
  $('#lockRoot').replaceChildren();
  lockedUI = false;
  start(null);
}

function lockNow() {
  if (!started) return;
  if (vaultInfo.mode !== 'password') {
    toast('Para bloquear, ative uma senha mestra em Configurações › Segurança.', 'warn', 4500);
    return openSettings();
  }
  flush();
  log('security', null, 'app bloqueado');
  showLock({ onTry: (pw) => deck.verifyPassword(pw) });
}

// =============================================================== configurações
function openSettings() {
  const upd = updateControls();
  const s = state.settings;
  const cb = (k) => h('input', { type: 'checkbox', checked: !!s[k], dataset: { k } });
  const inputs = {
    closeToTray: cb('closeToTray'),
    preventSleep: cb('preventSleep'),
    openAtLogin: cb('openAtLogin'),
    sound: cb('sound'),
    notifications: cb('notifications'),
    flash: cb('flash'),
    notifyEveryDrop: cb('notifyEveryDrop'),
    reloadAfterOutage: cb('reloadAfterOutage'),
    remotePrivacy: cb('remotePrivacy'),
    economy: cb('economy'),
    bootHeadless: cb('bootHeadless'),
    summaryAfterMin: h('input', { class: 'input', type: 'number', min: 0, max: 1440, value: s.summaryAfterMin }),
    autoLockMin: h('input', { class: 'input', type: 'number', min: 0, max: 1440, value: s.autoLockMin }),
    alertAfterRetries: h('input', { class: 'input', type: 'number', min: 0, max: 50, value: s.alertAfterRetries }),
    checkIntervalSec: h('input', { class: 'input', type: 'number', min: 5, max: 600, value: s.checkIntervalSec }),
    watchWords: h('textarea', { class: 'input', rows: 3, placeholder: 'uma por linha' }),
    discordWebhook: h('input', { class: 'input', type: 'password', value: s.discordWebhook, placeholder: 'https://discord.com/api/webhooks/…', spellcheck: 'false' }),
    telegramToken: h('input', { class: 'input', type: 'password', value: s.telegramToken, placeholder: '123456:ABC…', spellcheck: 'false' }),
    telegramChatId: h('input', { class: 'input', value: s.telegramChatId, placeholder: 'ID do chat', spellcheck: 'false' }),
  };
  inputs.watchWords.value = (s.watchWords || []).join('\n');

  const collect = () => {
    for (const k of ['closeToTray', 'preventSleep', 'openAtLogin', 'sound', 'notifications', 'flash', 'notifyEveryDrop', 'reloadAfterOutage', 'remotePrivacy', 'economy', 'bootHeadless']) s[k] = inputs[k].checked;
    for (const id of rt.keys()) applyPainting(id);
    updateSleep();
    s.summaryAfterMin = Math.max(0, Number(inputs.summaryAfterMin.value) || 0);
    s.autoLockMin = Math.max(0, Number(inputs.autoLockMin.value) || 0);
    s.alertAfterRetries = Math.max(0, Number(inputs.alertAfterRetries.value) || 0);
    s.checkIntervalSec = Math.min(600, Math.max(5, Number(inputs.checkIntervalSec.value) || 15));
    s.watchWords = inputs.watchWords.value.split('\n').map((w) => w.trim()).filter(Boolean);
    s.discordWebhook = inputs.discordWebhook.value.trim();
    s.telegramToken = inputs.telegramToken.value.trim();
    s.telegramChatId = inputs.telegramChatId.value.trim();
  };
  const testRemote = async () => {
    collect();
    await flush();
    if (!remoteEnabled()) return toast('Preencha o Discord ou o Telegram primeiro.', 'warn');
    const res = await deck.remoteAlert('🔔 Teste do DigiDeck: os alertas estão chegando aqui.');
    const parts = Object.entries(res).map(([k, v]) => `${k === 'discord' ? 'Discord' : 'Telegram'}: ${v === 'ok' ? 'enviado' : 'falhou (' + v + ')'}`);
    toast(parts.join(' · ') || 'Nada enviado.', Object.values(res).every((v) => v === 'ok') ? 'ok' : 'error', 7000);
  };
  const go = (fn) => () => { collect(); save(); closeModal(); fn(); };

  const hasPw = vaultInfo.mode === 'password';
  const secText = hasPw
    ? 'Chave protegida pela sua senha mestra (scrypt). Sem a senha, ninguém abre os dados, nem copiando o arquivo para outro PC.'
    : vaultInfo.mode === 'dpapi'
      ? 'Chave protegida pela criptografia do Windows: só o seu usuário, neste PC, abre. Ative a senha mestra para proteção total e para poder bloquear o app.'
      : 'A criptografia do Windows não está disponível neste PC. Ative a senha mestra para proteger a chave.';

  modal({
    title: 'Configurações',
    wide: true,
    body: h('div', {},
      h('div', { class: 'settings-section', style: { borderTop: 0, paddingTop: 0 } },
        h('h4', {}, icon('shield', 16), 'Segurança e criptografia'),
        h('div', { class: 'secbox' }, icon(hasPw ? 'lock' : 'shield', 18), h('div', {},
          h('b', {}, 'Dados criptografados com AES-256-GCM'),
          h('span', {}, secText))),
        h('div', { class: 'inline', style: { marginBottom: '12px' } },
          hasPw
            ? [h('button', { class: 'btn sm', type: 'button', onclick: go(() => openPasswordForm('change')) }, icon('key', 14), 'Trocar senha'),
              h('button', { class: 'btn sm danger', type: 'button', onclick: go(() => openPasswordForm('remove')) }, 'Remover senha'),
              h('button', { class: 'btn sm', type: 'button', onclick: go(lockNow) }, icon('lock', 14), 'Bloquear agora')]
            : h('button', { class: 'btn sm primary', type: 'button', onclick: go(() => openPasswordForm('set')) }, icon('lock', 14), 'Ativar senha mestra')),
        h('div', { class: 'row' },
          field('Bloquear sozinho depois de (min fora)', inputs.autoLockMin, hasPw ? '0 = nunca. Os jogos continuam rodando bloqueados.' : 'Precisa da senha mestra.'),
          h('div')),
        checkRow(inputs.remotePrivacy, 'Alertas do Discord e do Telegram sem detalhes', 'Manda só "uma conta precisa de você", sem o nome da conta nem o motivo. Essas mensagens passam pelos servidores do Discord e do Telegram.'),
        h('p', { class: 'about' }, 'Os logins dos jogos (cookies) ficam na pasta de cada conta, criptografados pelo Chromium com a proteção do Windows (na versão instalada). As páginas dos jogos não conseguem falar com o DigiDeck nem pedir câmera, microfone ou localização.')),
      h('div', { class: 'settings-section' },
        h('h4', {}, 'Geral'),
        checkRow(inputs.closeToTray, 'Fechar a janela manda para a bandeja', 'As contas continuam farmando. Para sair de verdade, use Sair no ícone da bandeja.'),
        checkRow(inputs.preventSleep, 'Impedir que o PC entre em suspensão', 'A tela pode desligar normalmente.'),
        checkRow(inputs.economy, 'Economia de recursos (recomendado)', 'Conta que não está na tela (outra tela, atrás da principal, painel, bloqueio, janela minimizada ou na bandeja) para de desenhar e segue jogando. No DigiIdle o servidor continua caçando e manda só o estado. Bem menos CPU, GPU e rede. Contas de outros jogos já vêm com "Sempre desenhar" marcado (dá para desmarcar na conta, se o jogo seguir rodando oculto).'),
        checkRow(inputs.bootHeadless, 'Iniciar todas as contas em modo headless', 'Sem renderizar a interface: apenas WebSocket. Medido: ~10 MB por conta em headless contra ~254 MB com janela (5 contas: 2.2 GB para 244 MB). A conta precisa ter feito login antes em modo normal. O botão de poder alterna conta por conta.'),
        checkRow(inputs.openAtLogin, 'Iniciar com o Windows (minimizado)', info.packaged ? (hasPw ? 'Com senha mestra, as contas só começam depois que você desbloquear.' : null) : 'Só funciona na versão instalada.'),
        h('div', { class: 'row' },
          field('Mostrar resumo ao voltar depois de (min)', inputs.summaryAfterMin, '0 = nunca'),
          field('Verificar cada conta a cada (s)', inputs.checkIntervalSec, 'Detecta travamento e palavras vigiadas.'))),
      h('div', { class: 'settings-section' },
        h('h4', {}, 'Quedas e alertas'),
        checkRow(inputs.notifications, 'Notificação do Windows'),
        checkRow(inputs.sound, 'Tocar som'),
        checkRow(inputs.flash, 'Piscar na barra de tarefas'),
        checkRow(inputs.notifyEveryDrop, 'Avisar a cada queda', 'Desligado: só avisa quando a conta não volta sozinha.'),
        checkRow(inputs.reloadAfterOutage, 'Recarregar as contas quando a internet voltar', 'Depois de quedas de mais de 30 s.'),
        h('div', { class: 'row' },
          field('Avisar se não voltar após (tentativas)', inputs.alertAfterRetries, '0 = nunca'),
          field('Palavras vigiadas em todas as contas', inputs.watchWords, 'Avisa quando aparecerem na tela. O DigiDeck só lê, nunca clica.'))),
      h('div', { class: 'settings-section' },
        h('h4', {}, 'Alertas no celular'),
        field('Webhook do Discord', inputs.discordWebhook, 'Canal › Editar canal › Integrações › Webhooks › Copiar URL.'),
        h('div', { class: 'row' },
          field('Token do bot do Telegram', inputs.telegramToken, 'Crie com o @BotFather.'),
          field('Chat ID do Telegram', inputs.telegramChatId, 'Mande uma mensagem ao bot e pegue o ID com o @userinfobot.')),
        h('button', { class: 'btn sm', type: 'button', onclick: testRemote }, icon('bell', 14), 'Enviar teste')),
      h('div', { class: 'settings-section' },
        h('h4', {}, icon('code', 16), 'Scripts do usuário'),
        h('button', { class: 'btn sm', type: 'button', onclick: go(openScriptsEditor) }, icon('code', 14), 'Gerenciar scripts'),
        h('p', { class: 'about' }, 'Rode seu próprio JavaScript dentro da página de cada conta, quando ela terminar de carregar. Útil para acompanhar valores na tela ou ajustar a interface do jogo. O script fica preso à página: não acessa o DigiDeck, nem outras contas, nem arquivos do PC.')),
      h('div', { class: 'settings-section' },
        h('h4', {}, 'Backup criptografado'),
        h('div', { class: 'inline' },
          h('button', { class: 'btn sm', type: 'button', onclick: go(openExportBackup) }, icon('lock', 14), 'Exportar backup'),
          h('button', { class: 'btn sm', type: 'button', onclick: go(importBackup) }, 'Importar backup'),
          h('button', { class: 'btn sm', type: 'button', onclick: () => deck.openDataFolder() }, icon('folder', 14), 'Abrir pasta de dados')),
        h('p', { class: 'about' }, 'O backup sai num arquivo .digideck criptografado com uma senha que você escolhe na hora (AES-256-GCM + scrypt). Pode guardar na nuvem ou mandar para outro PC: só abre com a senha. Os logins dos jogos não vão junto.')),
      h('div', { class: 'settings-section' },
        h('h4', {}, 'Atualizações'),
        upd,
        h('p', { class: 'about' }, 'Estável: versões testadas (recomendado). Beta: novidades antes de todo mundo, pode ter bugs. Nightly: build diário, o mais instável. Trocar para um canal mais estável pode instalar uma versão anterior. O DigiDeck procura versões novas sozinho e baixa em segundo plano. Nada reinicia sem você: a atualização é instalada quando você sair do app (ou ao clicar em "Reiniciar e atualizar"). Vale só para a versão instalada; a portátil precisa ser baixada de novo.')),
      h('div', { class: 'settings-section' },
        h('h4', {}, 'Atalhos'),
        h('p', { class: 'about', style: { lineHeight: 1.8 } },
          'Ctrl+1…9 focar conta · Ctrl+Tab próxima · Ctrl+PgDn/PgUp trocar tela · Ctrl+G grade · Ctrl+E principal · Ctrl+F foco · Ctrl+D painel · F5 recarregar conta · Shift+F5 recarregar todas · Ctrl+M silenciar tudo · Ctrl+R atualizações · Ctrl+N nova conta · Ctrl+L bloquear · Ctrl+B abrir/fechar menu')),
      h('p', { class: 'about' }, `DigiDeck ${info.version || ''} · Electron ${info.electron || ''} · Chromium ${info.chrome || ''}`, h('br'), 'Dados em ', h('code', {}, info.dataPath || ''))),
    foot: [
      h('button', { class: 'btn danger left', onclick: () => deck.quit() }, icon('power', 14), 'Sair do DigiDeck'),
      h('button', { class: 'btn', onclick: closeModal }, 'Cancelar'),
      h('button', { class: 'btn primary', onclick: () => { collect(); closeModal(); save(); toast('Configurações salvas.', 'ok'); } }, 'Salvar'),
    ],
  });
}

function openExportBackup() {
  const pw = passwordInput('Senha do backup');
  const pw2 = passwordInput('Repita a senha');
  const err = h('div', { class: 'lock-err' });
  const okBtn = h('button', { class: 'btn primary' }, icon('lock', 14), 'Criptografar e salvar');
  const submit = async () => {
    err.textContent = '';
    if (pw.value.length < 8) { err.textContent = 'A senha precisa ter pelo menos 8 caracteres.'; return pw.focus(); }
    if (pw.value !== pw2.value) { err.textContent = 'As senhas não batem.'; return pw2.focus(); }
    okBtn.disabled = true;
    await flush();
    const res = await deck.exportBackup(pw.value);
    okBtn.disabled = false;
    if (res.ok) { closeModal(); toast('Backup criptografado salvo.', 'ok'); log('security', null, 'backup criptografado exportado'); } else if (res.error) err.textContent = res.error;
  };
  modal({
    title: 'Exportar backup criptografado',
    body: h('form', { onsubmit: (e) => { e.preventDefault(); submit(); } },
      h('div', { class: 'secbox' }, icon('shield', 18), h('div', {},
        h('b', {}, 'Criptografia de ponta a ponta'),
        h('span', {}, 'O arquivo é criptografado aqui no seu PC antes de sair. Só abre onde alguém digitar esta senha.'))),
      h('div', { class: 'field' }, h('label', {}, 'Senha do backup'), pw, ...strengthMeter(pw)),
      field('Confirmar', pw2),
      h('div', { class: 'warnbox' }, 'Sem essa senha o backup não abre. Não tem como recuperar.'),
      err,
      h('button', { type: 'submit', hidden: true })),
    foot: [h('button', { class: 'btn', onclick: closeModal }, 'Cancelar'), okBtn],
  });
  okBtn.addEventListener('click', submit);
}

async function importBackup() {
  const res = await deck.importBackup();
  if (!res) return;
  if (res.error) return toast(res.error, 'error', 6000);
  if (res.encrypted) {
    const pw = passwordInput('Senha do backup', 'current-password');
    const err = h('div', { class: 'lock-err' });
    const okBtn = h('button', { class: 'btn primary' }, icon('unlock', 14), 'Abrir backup');
    const submit = async () => {
      okBtn.disabled = true;
      err.textContent = '';
      const r = await deck.decryptBackup(pw.value);
      okBtn.disabled = false;
      if (r.error) { err.textContent = r.error; pw.select(); return; }
      closeModal();
      applyImport(r.data, false);
    };
    modal({
      title: 'Abrir backup criptografado',
      body: h('form', { onsubmit: (e) => { e.preventDefault(); submit(); } }, field('Senha do backup', pw), err, h('button', { type: 'submit', hidden: true })),
      foot: [h('button', { class: 'btn', onclick: closeModal }, 'Cancelar'), okBtn],
    });
    okBtn.addEventListener('click', submit);
    return;
  }
  applyImport(res.data, true);
}

async function applyImport(data, legacy) {
  const ok = await confirmBox('Importar backup', `Isso troca suas ${state.accounts.length} conta(s) e telas atuais pelas ${data.accounts.length} do backup. Logins dos jogos não vêm no backup.`, 'Importar', true);
  if (!ok) return;
  const keep = { discordWebhook: state.settings.discordWebhook, telegramToken: state.settings.telegramToken, telegramChatId: state.settings.telegramChatId };
  state = normalize(data);
  if (legacy) Object.assign(state.settings, keep);
  log('security', null, 'backup importado');
  await flush();
  location.reload();
}

function showSummary(since, title) {
  const events = state.log.filter((e) => e.t >= since);
  const drops = events.filter((e) => e.type === 'drop').length;
  const recov = events.filter((e) => e.type === 'recover').length;
  const alerts = events.filter((e) => ALERT_TYPES.includes(e.type)).length;
  const online = [...rt.values()].filter((r) => r.status === 'online').length;
  const stat = (label, value) => h('div', { class: 'card stat' }, h('div', { class: 'label' }, label), h('div', { class: 'value' }, value));
  modal({
    title: title || `Enquanto você esteve fora (${fmtDur(Date.now() - since)})`,
    wide: true,
    body: h('div', {},
      h('div', { class: 'summary-kpis' },
        stat('Online agora', `${online}/${enabledAccounts().length}`),
        stat('Quedas', String(drops)),
        stat('Voltaram sozinhas', String(recov)),
        stat('Alertas', String(alerts))),
      h('div', { class: 'summary-list log' }, ...(events.length ? events.slice().reverse().slice(0, 120).map(logRow) : [h('div', { class: 'log-empty' }, 'Tudo tranquilo. Nenhuma queda nem alerta.')]))),
    foot: [
      h('button', { class: 'btn', onclick: () => { closeModal(); setView('dash'); } }, 'Abrir painel'),
      h('button', { class: 'btn primary', onclick: closeModal }, 'Beleza'),
    ],
  });
}

// =============================================================== ações de conta
function toggleMute(id) {
  const acc = accById(id);
  if (!acc) return;
  acc.muted = !acc.muted;
  applyAudio(id);
  const r = rt.get(id);
  if (r) updateTileMeta(acc, r);
  save();
}

function updateMuteAllBtn() {
  const b = $('#btnMuteAll');
  b.replaceChildren(icon(state.muteAll ? 'mute' : 'vol', 18));
  b.classList.toggle('on', !!state.muteAll);
  b.title = state.muteAll ? 'Ativar som (Ctrl+M)' : 'Silenciar tudo (Ctrl+M)';
}
function toggleMuteAll() {
  state.muteAll = !state.muteAll;
  for (const id of rt.keys()) applyAudio(id);
  updateMuteAllBtn();
  toast(state.muteAll ? 'Tudo silenciado.' : 'Som ativado.', 'ok', 1800);
  save();
}

function duplicateAccount(id) {
  const acc = accById(id);
  if (!acc) return;
  const base = acc.name.replace(/\s\d+$/, '');
  const n = state.accounts.filter((a) => a.name.replace(/\s\d+$/, '') === base).length + 1;
  const copy = { ...JSON.parse(JSON.stringify(acc)), id: uid(), name: `${base} ${n}`, enabled: true, createdAt: Date.now(), stats: { onlineMs: 0, drops: 0, recoveries: 0 } };
  state.accounts.splice(state.accounts.indexOf(acc) + 1, 0, copy);
  log('info', copy, 'conta criada (duplicada)');
  checkLimit(copy.groupId);
  save();
  refresh();
  toast(`"${copy.name}" criada com login separado. Faça o login nela.`, 'ok');
}

async function clearLogin(id) {
  const acc = accById(id);
  if (!acc) return;
  const ok = await confirmBox('Sair do login', `Apaga cookies, login e dados salvos do site em "${acc.name}". As outras contas não são afetadas.`, 'Apagar dados', true);
  if (!ok) return;
  await deck.clearPartition(partitionOf(id));
  const r = rt.get(id);
  navigate(r, acc.url);
  log('info', acc, 'login e dados apagados');
  toast('Dados da conta apagados.', 'ok');
}

async function deleteAccount(id) {
  const acc = accById(id);
  if (!acc) return;
  const ok = await confirmBox('Excluir conta', `Remove "${acc.name}" do DigiDeck e apaga o login salvo dela. Isso não mexe na conta do jogo.`, 'Excluir', true);
  if (!ok) return;
  destroyRuntime(id);
  state.accounts = state.accounts.filter((a) => a.id !== id);
  if (state.ui.current === id) state.ui.current = null;
  deck.clearPartition(partitionOf(id));
  log('info', acc, 'conta excluída');
  save();
  refresh();
}

// =============================================================== atalhos
function cycle(dir) {
  const list = visibleAccounts();
  if (!list.length) return;
  const i = list.findIndex((a) => a.id === state.ui.current);
  const next = list[(i + dir + list.length) % list.length];
  setCurrent(next.id, { quiet: state.ui.view !== 'grid' });
}

function handleShortcut(combo) {
  if (!started || lockedUI) return;
  if (combo === 'lock') return lockNow();
  if ($('#modalRoot').children.length && combo !== 'mute-all') return;
  if (combo.startsWith('focus:')) {
    const acc = visibleAccounts()[Number(combo.slice(6)) - 1];
    if (!acc) return;
    setCurrent(acc.id, { quiet: true });
    if (state.ui.view === 'grid' || state.ui.view === 'dash') setView('focus');
    return;
  }
  if (combo.startsWith('view:')) return setView(combo.slice(5));
  switch (combo) {
    case 'next': return cycle(1);
    case 'prev': return cycle(-1);
    case 'screen-next': return cycleScreen(1);
    case 'screen-prev': return cycleScreen(-1);
    case 'update': return openUpdates();
    case 'reload': return state.ui.current && manualReload(state.ui.current);
    case 'reload-all': for (const id of rt.keys()) manualReload(id); return toast('Recarregando todas as contas.', 'ok', 1800);
    case 'mute-all': return toggleMuteAll();
    case 'sidebar': return setSideClosed(!state.ui.sideClosed);
    case 'add': return openAccountForm(null);
    default:
  }
}

// =============================================================== toasts
function toast(msg, type = '', ms = 4000) {
  const el = h('div', { class: 'toast ' + type, role: 'status' }, h('span', {}, msg));
  $('#toasts').append(el);
  setTimeout(() => el.remove(), ms);
  while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove();
}

// =============================================================== início
function start(loaded) {
  state = normalize(loaded || defaultState());
  started = true;
  if (!loaded) flush();
  applySide();
  refresh();
  updateSecureBadge();
  setInterval(tick, 1000);
  setInterval(freezeLoop, 30000);
  setInterval(thumbLoop, 4000);
  setInterval(metricsLoop, 5000);
  setInterval(() => { if (dirty) flush(); }, 10000);
  metricsLoop();
  updateSleep();
}

// ---- atualização automática
let updStatus = { state: 'idle' };
const updViews = new Set(); // callbacks que redesenham os controles de atualização abertos (Configurações ou Ctrl+R)
function updText(u) {
  switch (u.state) {
    case 'unsupported': return 'Atualização automática indisponível nesta versão (portátil ou modo de desenvolvimento).';
    case 'checking': return 'Procurando atualização…';
    case 'downloading': return `Baixando ${u.version || 'nova versão'}… ${u.percent || 0}%`;
    case 'ready': return `Versão ${u.version} pronta. Será instalada ao sair do DigiDeck.`;
    case 'current': return 'Você está na versão mais recente.';
    case 'error': return `Não deu para verificar: ${u.error || 'erro desconhecido'}`;
    default: return 'Ainda não verificado.';
  }
}
function renderUpdate() {
  for (const fn of [...updViews]) { if (!fn()) updViews.delete(fn); }
}

// Canal + estado + botões. Usado em Configurações › Atualizações e na janela do Ctrl+R.
function updateControls() {
  const text = h('span', { class: 'about' });
  const chanSel = h('select', { class: 'input', onchange: (e) => deck.updateChannel(e.target.value) },
    ...[['stable', 'Estável'], ['beta', 'Beta'], ['nightly', 'Nightly']].map(([v, t]) => h('option', { value: v }, t)));
  const checkBtn = h('button', { class: 'btn sm', type: 'button', onclick: () => { deck.updateCheck(); } }, 'Verificar agora');
  const installBtn = h('button', { class: 'btn sm primary', type: 'button', onclick: () => deck.updateInstall() }, 'Reiniciar e atualizar');
  const root = h('div', {},
    h('div', { class: 'inline' }, h('label', { class: 'about' }, 'Canal '), chanSel, text),
    h('div', { class: 'inline' }, checkBtn, installBtn));
  const draw = () => {
    if (!root.isConnected) return false;
    text.textContent = updText(updStatus);
    if (updStatus.channel) chanSel.value = updStatus.channel;
    const busy = updStatus.state === 'checking' || updStatus.state === 'downloading';
    checkBtn.disabled = busy || updStatus.state === 'unsupported';
    chanSel.disabled = updStatus.state === 'unsupported';
    installBtn.disabled = updStatus.state !== 'ready';
    return true;
  };
  updViews.add(draw);
  queueMicrotask(draw); // root ainda não está no DOM aqui
  return root;
}

// Ctrl+R: abre a janela de atualizações e já procura.
function openUpdates() {
  const upd = updateControls();
  modal({
    title: 'Atualizações',
    body: h('div', {},
      upd,
      h('p', { class: 'about' }, 'Estável: versões testadas (recomendado). Beta: novidades antes de todo mundo, pode ter bugs. Nightly: build diário, o mais instável. Trocar para um canal mais estável pode instalar uma versão anterior. Nada reinicia sozinho: a versão baixada é instalada ao sair, ou em "Reiniciar e atualizar".')),
    foot: [h('button', { class: 'btn', onclick: closeModal }, 'Fechar')],
  });
  deck.updateCheck();
}
function onUpdateStatus(u) {
  const was = updStatus.state;
  updStatus = u;
  renderUpdate();
  if (u.state === 'ready' && was !== 'ready') {
    toast(`DigiDeck ${u.version} baixado. Instala ao sair, ou em Configurações › Atualizações.`, 'ok', 12000);
  }
}

async function boot() {
  info = await deck.info();
  const res = await deck.getState();
  vaultInfo = res.vault || {};

  for (const b of $$('#views button')) {
    b.prepend(icon(b.dataset.icon, 16));
    // O botão Ferramentas abre uma janela; os outros trocam a visualização.
    if (!b.dataset.view) continue;
    b.addEventListener('click', () => started && setView(b.dataset.view));
  }
  $('#btnTools').addEventListener('click', () => started && !lockedUI && openTools());
  $('#btnAdd').append(icon('plus', 14), 'Conta');
  $('#btnAdd').addEventListener('click', () => started && openAccountForm(null));
  $('#btnAddGroup').append(icon('plus', 14), 'Tela');
  $('#btnAddGroup').addEventListener('click', () => started && openGroupForm(null));
  $('#btnSide').append(icon('panel', 16));
  $('#btnSide').addEventListener('click', () => started && !lockedUI && setSideClosed(!state.ui.sideClosed));
  wireResizer();
  applySide();
  $('#btnSettings').append(icon('sliders', 17));
  $('#btnSettings').addEventListener('click', () => started && openSettings());
  $('#btnMuteAll').addEventListener('click', () => started && toggleMuteAll());
  $('#btnLock').addEventListener('click', lockNow);
  updateSecureBadge();

  deck.onShortcut(handleShortcut);
  deck.onUpdate(onUpdateStatus);
  deck.updateStatus().then((u) => { updStatus = u; renderUpdate(); });
  deck.onNotifyClick((id) => {
    if (started && !lockedUI && id && rt.has(id)) { setCurrent(id, { quiet: true }); setView('focus'); }
  });
  deck.onAway(() => { if (!awaySince) awaySince = Date.now(); });
  deck.onBack(() => {
    const since = awaySince;
    awaySince = null;
    if (!started) return;
    if (unseen) { unseen = 0; deck.setBadge(0); updateTitle(); }
    const away = since ? Date.now() - since : 0;
    const lockMin = Number(state.settings.autoLockMin) || 0;
    const sumMin = Number(state.settings.summaryAfterMin) || 0;
    const wantSummary = sumMin > 0 && away > sumMin * 60000;
    if (!lockedUI && vaultInfo.mode === 'password' && lockMin > 0 && away > lockMin * 60000) {
      log('security', null, `bloqueado sozinho após ${fmtDur(away)} fora`);
      showLock({ onTry: (pw) => deck.verifyPassword(pw), after: wantSummary ? () => showSummary(since) : null });
      return;
    }
    if (wantSummary && !lockedUI && !$('#modalRoot').children.length) showSummary(since);
  });

  window.addEventListener('offline', () => {
    if (!started) return;
    netDownAt = Date.now();
    log('net', null, 'a internet caiu');
    updateLive();
  });
  window.addEventListener('online', () => {
    if (!started) return;
    const dur = netDownAt ? Date.now() - netDownAt : 0;
    netDownAt = null;
    log('net', null, `a internet voltou${dur ? ` após ${fmtDur(dur)}` : ''}`);
    for (const [id, r] of rt) {
      if (r.status === 'reconnecting') retryNow(id);
      else if (r.status === 'online' && state.settings.reloadAfterOutage && dur > 30000) { drop(id, 'a internet caiu'); retryNow(id); }
    }
    updateLive();
  });
  // Janela voltou (estava minimizada ou na bandeja): atualiza o que ficou parado e recomeça o relógio
  // de tela parada das contas que não desenhavam.
  document.addEventListener('visibilitychange', () => {
    if (!started || document.hidden) return;
    for (const [id, r] of rt) if (!keepsPainting(accById(id))) { r.hashSince = Date.now(); r.lastHash = null; }
    updateLive();
    metricsLoop();
  });
  window.addEventListener('beforeunload', () => { if (started && dirty) deck.saveState(state); });
  new ResizeObserver(() => { if (started) layout(); }).observe($('#stage'));

  if (res.locked) {
    showLock({
      boot: true,
      onTry: async (pw) => {
        const r = await deck.unlock(pw);
        if (!r.ok) return false;
        vaultInfo = r.vault;
        start(r.state);
        return true;
      },
    });
  } else {
    start(res.state);
  }
  if (res.error) setTimeout(() => toast(res.error, 'warn', 9000), 600);
}

boot();
