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
  // O Passe: um calendário com o dia marcado, que é o que a ferramenta faz.
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M8.5 14.5l2 2 4-4"/>',
  // O Auto Seller: a etiqueta de preço, que é o que ele põe nos itens.
  tag: '<path d="M12.6 2.6H21v8.4l-9.8 9.8a2 2 0 0 1-2.8 0l-5.6-5.6a2 2 0 0 1 0-2.8z"/><circle cx="17" cy="7" r="1.4" fill="currentColor"/>',
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

// Os tipos de log do Sniper. 'sniper-ok' é a compra confirmada e 'sniper-no' é
// o que escapou: separados do 'sniper' comum porque merecem cor própria na
// Atividade — é o que se procura ao abrir a aba.
const SNIPER_TYPES = ['sniper', 'sniper-ok', 'sniper-no'];

// Os tipos de log do Auto Seller, na mesma divisão do Sniper: 'seller-ok' é o
// anúncio confirmado pela mochila e 'seller-no' é o que não foi ao ar.
const SELLER_TYPES = ['seller', 'seller-ok', 'seller-no'];

// O último "estou vivo" do Sniper. Não é uma linha do log (ele varre a cada
// minuto, e isso encheria a aba): é o rodapé da aba Mercado, que responde
// "a ferramenta está rodando?" sem poluir o histórico.
let sniperPulso = null;

// O mesmo rodapé para o Auto Seller. Ele roda a cada 5 min e quase sempre não
// tem nada a fazer (mochila vazia), e é exatamente aí que "não anunciou nada" e
// "não está rodando" ficam indistinguíveis.
let sellerPulso = null;

// O retrato de cada especie, por id, para a lista de ovos desenhar.
//
// O cache de verdade vive no processo principal (memoria + userData/sprites);
// este aqui so evita repetir o IPC a cada redesenho da lista.
const retratosCache = new Map(); // especie -> data-URL | null
let retratosEmVoo = null;

/**
 * Garante os retratos das especies pedidas e redesenha quando chegarem.
 *
 * Desenha primeiro sem imagem (a inicial do nome) e preenche depois: esperar o
 * IPC deixaria a lista em branco, e a linha sem foto ja informa.
 */
function carregaRetratos(especies, aoChegar) {
  const faltam = [...new Set(especies.filter((s) => s && !retratosCache.has(s)))];
  if (!faltam.length || retratosEmVoo) return;
  retratosEmVoo = deck.retratos(faltam)
    .then((mapa) => {
      for (const id of faltam) retratosCache.set(id, (mapa && mapa[id]) || null);
      if (aoChegar) aoChegar();
    })
    .catch(() => { for (const id of faltam) retratosCache.set(id, null); })
    .finally(() => { retratosEmVoo = null; });
}

// Quais itens sao raros quem diz e o JOGO: o manager marca cada drop com
// `raro`, pela mesma lista da aba "Itens Raros" da Mochila (shared/itens.json,
// chaves 'raros' e 'zmoves' - os D-Skills moram la).
//
// Sobra uma excecao, e so uma: a Protecao de Ovo esta no bolso dos raros mas
// cai a cada poucos abates, e afogaria as linhas que importam (Boss Token,
// D-Skill, Chip AoE). E escolha de interface, por isso mora aqui.
const DROP_COMUM = [/prote[cç][aã]o de ovo/i];
const dropRaro = (item) => !!item && !DROP_COMUM.some((re) => re.test(item));

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
    if (window.DDTools.toolLigada(conf, tool)) {
      const cfg = { ...tool.defaults(), ...((conf && conf.cfg) || {}) };
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
    if (!window.DDTools.toolLigada(conf, t)) continue;
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
    if (!window.DDTools.toolLigada(conf, t)) continue;
    out.push({ id: `tool-${t.id}`, name: t.name, code: t.code({ ...t.defaults(), ...((conf && conf.cfg) || {}) }) });
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
    if (window.DDTools.toolLigada(conf, tool)) {
      await r.wv.executeJavaScript(tool.code({ ...tool.defaults(), ...((conf && conf.cfg) || {}) }));
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
    // A lista "Ovos nas contas" NAO tem estado guardado: ela mostra a bolsa que
    // o servidor manda, e isso so vale enquanto a conta esta ligada (ver
    // `bolsas` no renderer).
    //
    // Os filtros que o usuario monta ("SSS P1-P5, SS
    // P4-P5"). Ficam no estado, e nao em variavel de modulo como o ovoFilter:
    // montar um da trabalho, e perde-lo ao reiniciar seria perder o trabalho.
    ovoFiltros: [],
    daily: {},
    ui: { view: 'grid', current: null, groupFilter: g.id, mix: false },
    muteAll: false,
  };
}
// O estado lido tinha um histórico de ovos guardado e ele foi descartado (ver
// normalize). Força uma gravação no start() para o arquivo encolher na hora.
let ovosMigrados = false;

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
  // O histórico de ovos acumulado é descartado na leitura: a lista do Painel
  // agora mostra a bolsa atual das contas, que não se guarda em disco.
  //
  // Era a causa medida do app travar: 2000 capturas com o retrato em data-URL
  // dentro de cada uma dava 17,23 MB (96% do arquivo) para 18 espécies
  // distintas, e o estado inteiro era reserializado, recriptografado e regravado
  // a cada gravação.
  //
  // 'ovosMigrados' avisa o start() para gravar logo: sem isso o arquivo só
  // encolheria na próxima mudança de verdade, e um app parado (nenhuma conta
  // ligada) seguiria carregando os 24 MB a cada abertura.
  ovosMigrados = Array.isArray(s.ovos) && s.ovos.length > 0;
  delete out.ovos;
  // Só os filtros com id, nome e ao menos uma regra: um registro meio gravado
  // viraria um chip que não filtra nada e não dá para apagar.
  out.ovoFiltros = Array.isArray(s.ovoFiltros)
    ? s.ovoFiltros.filter((f) => f && f.id && f.nome && Array.isArray(f.regras) && f.regras.length)
    : [];
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
//
// Gravar custa caro: o estado inteiro atravessa o IPC, é criptografado e vai ao
// disco. Por isso há DOIS níveis de "sujo", e a diferença importa.
//
//   dirty     -> mudança de verdade (conta criada, ajuste trocado, ovo novo).
//                Vale gravar logo: perder isso é perder uma decisão da pessoa.
//   softDirty -> só contadores que andam sozinhos (o "tempo online" soma a cada
//                segundo). Perder os últimos segundos num fechamento abrupto não
//                custa nada.
//
// Antes só existia 'dirty', e tick() o levantava a cada segundo para cada conta
// online: o estado estava permanentemente sujo, então o laço de 10 s gravava
// para sempre, mesmo sem nada ter mudado. Com um arquivo grande, era isso que
// travava o app de forma periódica.
let dirty = false;
let softDirty = false;
let saveTimer = null;
function flush() {
  dirty = false;
  softDirty = false;
  clearTimeout(saveTimer);
  return deck.saveState(state);
}
function save() { dirty = true; clearTimeout(saveTimer); saveTimer = setTimeout(flush, 350); }
function markDirty() { dirty = true; }
/** Contador que anda sozinho: grava na próxima gravação lenta, não agora. */
function markSoftDirty() { softDirty = true; }

/**
 * Como a conta deve ser chamada no log.
 *
 * Com várias contas rodando a mesma ferramenta, "DigiIdle 3" não diz nada: o
 * nick do jogo é o nome que a pessoa reconhece, e é por ele que ela confere a
 * compra dentro do jogo. O nick só existe em headless (vem no pacote 'estado'),
 * então o nome da conta no DesDeck segue como reserva.
 */
function nickDe(acc) {
  if (!acc) return '';
  const r = rt.get(acc.id);
  const nick = r && r.headlessState && r.headlessState.nick;
  return nick || acc.name || '';
}

// Redesenha a lista do log no máximo 1x por frame.
//
// log() é chamado em rajada (uma conta que cai gera várias linhas, e 16 contas
// caem juntas quando a internet oscila), e cada chamada redesenhava a lista
// inteira. Agrupar no próximo frame faz uma rajada de 20 linhas custar um
// redesenho em vez de 20.
// requestAnimationFrame NÃO serve aqui: com a janela minimizada ou escondida o
// navegador não entrega frame nenhum, e o redesenho ficaria pendurado até a
// pessoa voltar — justamente quando as contas estão rodando sozinhas. Um
// setTimeout curto agrupa a rajada do mesmo jeito e sempre dispara.
const AGRUPA_MS = 50;

let logPendente = false;
function pedeRenderLog() {
  if (logPendente || state.ui.view !== 'dash') return;
  logPendente = true;
  setTimeout(() => {
    logPendente = false;
    if (state.ui.view === 'dash') renderLog();
  }, AGRUPA_MS);
}

// O mesmo agrupamento para a lista de ovos.
let ovosPendente = false;
function pedeRenderOvos() {
  if (ovosPendente || state.ui.view !== 'dash') return;
  ovosPendente = true;
  setTimeout(() => {
    ovosPendente = false;
    if (state.ui.view === 'dash') renderOvos();
  }, AGRUPA_MS);
}

function log(type, acc, msg, nome) {
  state.log.push({ t: Date.now(), type, accId: acc ? acc.id : null, name: nome || (acc ? acc.name : ''), msg });
  if (state.log.length > 800) state.log.splice(0, state.log.length - 800);
  markDirty();
  pedeRenderLog();
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
  painel: null, // o resumo do card em headless (ver desenhaPainel)
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
  // Onde o resumo da conta headless é desenhado. Fica fora do .wv-wrap porque
  // esse é escondido no modo headless (não há webview para mostrar).
  r.els.painel = h('div', { class: 'hl-painel' });
  r.tile = h('div', { class: 'tile', dataset: { id } }, head, h('div', { class: 'wv-wrap' }, wv, banner), r.els.painel, handles);
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

  // O resumo do que a conta está fazendo. Em headless não há tela: é por aqui
  // que se vê qual Digimon está lutando, contra quem e com que resultado.
  const unsubHeadlessPainel = deck.onHeadlessPainel(({index, painel}) => {
    if (index !== id) return;
    const rr = rt.get(id);
    if (!rr) return;
    rr.painel = painel;
    desenhaPainel(id);
    // O card do Painel lê as métricas (XP/h, Bits, D-Dol, hunt…) de r.painel
    // pelo data-live. Sem este updateLive, elas só mudariam no próximo tique do
    // relógio: o resumo chegava e a tela continuava mostrando '—'.
    updateLive();
  });

  // O que aconteceu de notável na conta: ovo capturado, ovo chocado, item raro
  // dropado, venda de ovo e compra do sniper. Vira linha na Atividade do Painel.
  const unsubHeadlessAtividade = deck.onHeadlessAtividade(({index, atividade}) => {
    if (index !== id) return;
    registraAtividade(id, atividade);
  });

  // A bolsa de ovos da conta: o que ela tem AGORA. Chega inteira a cada vez (o
  // servidor manda a lista toda, não um delta), então substitui a anterior.
  const unsubHeadlessBolsa = deck.onHeadlessBolsa(({index, ovos}) => {
    if (index !== id) return;
    guardaBolsa(id, ovos);
  });

  // Os digimons da conta: equipe + DigiBank + coleção, tudo o que ela tem.
  // Também chega inteiro a cada vez.
  const unsubHeadlessDigimons = deck.onHeadlessDigimons(({index, digimons}) => {
    if (index !== id) return;
    guardaDigimons(id, digimons);
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
    // O relógio do card e do painel. Em headless não há markOnline() para
    // escrever isto, e sem a marca o "Farmando" contava a partir de um
    // onlineSince velho (ou de nada). Só na transição: um 'connected' repetido
    // não pode reiniciar a contagem de uma conta que nunca saiu do ar.
    if (status === 'connected' && antes !== 'connected') rr.onlineSince = Date.now();
    else if (status !== 'connected') rr.onlineSince = null;
    // As ferramentas só agem com o socket de pé, e o socket pode cair e voltar.
    // Ligar na transição para 'connected' cobre a conexão inicial e cada
    // reconexão — startTool é idempotente, então religar não duplica laço.
    if (status === 'connected' && antes !== 'connected') applyToolsHeadless(id);
    // O painel mostra o status enquanto o primeiro 'estado' não chega.
    if (!rr.painel) desenhaPainel(id);
    updateLive();
  });

  // Limpa listeners ao destruir
  r._cleanup = () => {
    if (unsubHeadlessUpdate) unsubHeadlessUpdate();
    if (unsubHeadlessStatus) unsubHeadlessStatus();
    if (unsubHeadlessError) unsubHeadlessError();
    if (unsubHeadlessPainel) unsubHeadlessPainel();
    if (unsubHeadlessAtividade) unsubHeadlessAtividade();
    if (unsubHeadlessBolsa) unsubHeadlessBolsa();
    if (unsubHeadlessDigimons) unsubHeadlessDigimons();
    // A conta saiu: os ovos dela não são mais "o que está nas contas".
    esqueceBolsa(id);
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
        // Trava a partição ANTES de tentar aplicar. Se o applyProxy falhar ou
        // a conta navegar por outro caminho, nada sai: a trava só abre quando
        // o setProxy confirma.
        await deck.armProxy(partitionOf(id));
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
// Um retrato de Digimon. Sem imagem (sprite que não baixou, espécie fora do
// catálogo) sobra a inicial do nome: um card sem foto ainda informa, um card
// com buraco parece defeito.
function retratoEl(nome, img, cls) {
  const corpo = img
    ? h('img', { src: img, alt: nome || '', draggable: 'false' })
    : h('span', { class: 'hl-semfoto' }, String(nome || '?').slice(0, 1).toUpperCase());
  return h('div', { class: 'hl-face ' + cls, title: nome || '' }, corpo);
}

/**
 * Desenha o resumo da conta headless no card.
 *
 * Em headless não há webview: este painel é a única forma de ver o que a conta
 * está fazendo. Mostra o Digimon ativo contra o alvo (como o Pio faz), onde
 * está caçando, e os contadores da sessão.
 *
 * Reconstrói o conteúdo inteiro a cada chamada. Cabe porque o manager já limita
 * a 1 resumo a cada 2 s por conta: um diff aqui seria complexidade sem ganho.
 */
function desenhaPainel(accId) {
  const r = rt.get(accId);
  if (!r || !r.els.painel) return;
  const el = r.els.painel;
  invalidaLive(); // o painel é reconstruído inteiro: os nós de antes saem do DOM

  // Fora do headless o painel não aparece: a página é a própria informação.
  if (!isHeadless(accId)) { el.replaceChildren(); return; }

  const p = r.painel;
  if (!p) {
    // O socket pode estar de pé e o primeiro 'estado' ainda não ter chegado.
    el.replaceChildren(h('div', { class: 'hl-vazio' },
      r.headlessStatus === 'connected' ? 'Aguardando dados do jogo…' : (HEADLESS_ROTULO[r.headlessStatus] || '—')));
    return;
  }

  const meu = p.digimon;
  const alvo = p.alvo;

  // A arena: eu × ele. A vida do meu entra como barra porque é o que se olha de
  // relance para saber se a conta está em apuros.
  const arena = h('div', { class: 'hl-arena' },
    h('div', { class: 'hl-lado' },
      retratoEl(meu && meu.nome, meu && meu.img, 'meu'),
      h('div', { class: 'hl-nome' }, meu ? (meu.shiny ? '✦ ' : '') + meu.nome : '—'),
      meu ? h('div', { class: 'hl-sub' }, `Nv ${fmtNum(meu.nivel)}`) : null,
      meu && meu.hpMax ? h('div', { class: 'hl-hp', title: `${fmtNum(meu.hp)} / ${fmtNum(meu.hpMax)} HP` },
        h('i', { style: { width: Math.max(0, Math.min(100, meu.hpPct)) + '%' },
          class: meu.hpPct <= 30 ? 'baixo' : '' })) : null),
    h('div', { class: 'hl-vs' }, 'vs'),
    h('div', { class: 'hl-lado' },
      retratoEl(alvo && alvo.nome, alvo && alvo.img, 'alvo'),
      // O alvo "incerto" é quem mora na área, não quem está na frente agora: o
      // socket só revela o nome do inimigo quando ele cai. Marcar com '~' evita
      // afirmar o que não se sabe.
      h('div', { class: 'hl-nome' + (alvo && !alvo.certo ? ' incerto' : '') },
        alvo ? (alvo.certo ? alvo.nome : '~ ' + alvo.nome) : '—'),
      alvo ? h('div', { class: 'hl-sub' }, alvo.certo ? 'último abate' : 'nativo da área') : null));

  const f = p.farm;
  const stat = (rotulo, valor) => h('div', { class: 'hl-stat' },
    h('b', null, valor), h('span', null, rotulo));

  // Tudo dentro de .hl-in, não direto no painel: o painel é o container das
  // @container queries, e um elemento não pode ser estilizado pela própria
  // query. Sem este wrapper, o layout compacto dos cards baixos não aplicava.
  el.replaceChildren(h('div', { class: 'hl-in' },
    h('div', { class: 'hl-onde' },
      h('span', { class: 'hl-local' }, p.onde),
      h('span', { class: 'hl-tempo' }, fmtDur((p.online || 0) * 1000))),
    arena,
    h('div', { class: 'hl-stats' },
      stat('abates', fmtNum(f.abates)),
      stat('capturas', fmtNum(f.capturas)),
      stat('bits', fmtNum(f.bits)),
      stat('xp tamer', fmtNum(f.xpTamer))),
    // Só aparece quando há algo a dizer: linha fixa com '—' é ruído.
    (f.shinyVistos || p.evpMax || p.evento) ? h('div', { class: 'hl-extra' },
      f.shinyVistos ? h('span', null, `✦ ${fmtNum(f.shinyVistos)} shiny`) : null,
      p.evpMax ? h('span', null, `EVP ${fmtNum(p.evp)}/${fmtNum(p.evpMax)}`) : null,
      p.evento ? h('span', null, `${p.evento.nome} ${p.evento.pct}%`) : null) : null,
  ));
}

// ---- Ovos das contas e Atividade
//
// A lista mostra os ovos que as contas TÊM agora — os que a venda automática não
// levou. Nada disso é guardado em disco: o servidor manda a bolsa inteira a cada
// vez, e ela só vale enquanto a conta está ligada. A versão anterior acumulava
// cada captura para sempre no estado criptografado, e foi assim que o arquivo
// chegou a 24 MB (eram 17,23 MB só de retratos repetidos).
//
// accId -> { ovos: [...], digimons: [...], em: timestamp }
const bolsas = new Map();

const bolsaDe = (accId) => bolsas.get(accId) || { ovos: [], digimons: [], em: 0 };

/** Troca a bolsa de ovos de uma conta pela recém-chegada. */
function guardaBolsa(accId, lista) {
  if (!Array.isArray(lista)) return;
  bolsas.set(accId, { ...bolsaDe(accId), ovos: lista, em: Date.now() });
  // Mesmo agrupamento do log: 16 contas conectando juntas mandam a bolsa quase
  // ao mesmo tempo, e sem isto a lista seria redesenhada 16 vezes em sequência.
  pedeRenderOvos();
}

/** O mesmo para os digimons: equipe + DigiBank + coleção, já enriquecidos. */
function guardaDigimons(accId, lista) {
  if (!Array.isArray(lista)) return;
  bolsas.set(accId, { ...bolsaDe(accId), digimons: lista, em: Date.now() });
  pedeRenderOvos();
}

/** Conta desligada: a lista não pode mostrar o que aquela conta tinha. */
function esqueceBolsa(accId) {
  if (bolsas.delete(accId)) pedeRenderOvos();
}

// O que as contas em modo WEBVIEW têm.
//
// Em headless o manager avisa sozinho (eventos 'bolsa' e 'digimons'). No webview
// não há cliente headless: as listas cruas estão na ponte injetada na página
// (G.ovos, G.depot, G.colecao e G.estado.equipe, que ela guarda a cada pacote),
// e são lidas daqui de tempo em tempo. O nome e a letra vêm do processo
// principal, que é quem tem os catálogos do jogo.
const BOLSA_WEBVIEW_MS = 60000;
let bolsaWebviewOcupado = false;

// Uma leitura só, para não pagar dois executeJavaScript por conta. A equipe
// mora no 'estado'; o resto vem do pacote 'depot'.
const LE_BOLSA_JS = `(() => {
  const g = window.__ddGame;
  if (!g) return null;
  return {
    ovos: Array.isArray(g.ovos) ? g.ovos : null,
    equipe: g.estado && Array.isArray(g.estado.equipe) ? g.estado.equipe : null,
    depot: Array.isArray(g.depot) ? g.depot : null,
    colecao: Array.isArray(g.colecao) ? g.colecao : null,
  };
})()`;

async function bolsaLoop() {
  if (bolsaWebviewOcupado || lockedUI || !started) return;
  bolsaWebviewOcupado = true;
  try {
    for (const [id, r] of rt) {
      // Headless tem o seu próprio caminho; página dormindo ou sem carregar não
      // responde (e acordá-la só por causa da lista não se justifica).
      if (isHeadless(id) || !r.wv || !r.ready || r.sleeping || r.status !== 'online') continue;
      let cru;
      try {
        cru = await withTimeout(r.wv.executeJavaScript(LE_BOLSA_JS), 5000);
      } catch { continue; } // página ocupada: fica para a próxima rodada
      if (!cru) continue; // a ponte ainda não foi injetada
      // Cada lista é independente: a ponte pode já ter visto 'ovos' e ainda não
      // 'depot'. Guardar só o que chegou evita apagar o que já estava na tela.
      if (Array.isArray(cru.ovos)) {
        try { guardaBolsa(id, await deck.ovosBolsa(cru.ovos)); } catch { /* sem catálogo, tenta depois */ }
      }
      if (cru.equipe || cru.depot || cru.colecao) {
        try {
          guardaDigimons(id, await deck.ovosDigimons({
            equipe: cru.equipe || [], depot: cru.depot || [], colecao: cru.colecao || [],
          }));
        } catch { /* idem */ }
      }
    }
  } finally {
    bolsaWebviewOcupado = false;
  }
}

/**
 * Tudo o que as contas ligadas têm — ovos e digimons —, com o nome da conta em
 * cada linha. Contas que já não existem são ignoradas (e limpas no caminho).
 */
function todosOsOvos() {
  const out = [];
  for (const [accId, b] of bolsas) {
    const acc = accById(accId);
    if (!acc) { bolsas.delete(accId); continue; }
    for (const o of b.ovos || []) out.push({ ...o, accId, nomeConta: acc.name });
    for (const d of b.digimons || []) out.push({ ...d, accId, nomeConta: acc.name });
  }
  return out;
}

// A venda de ovos e a compra do sniper não são pacotes do jogo: são decisões
// nossas, que chegam como texto do log da ferramenta. Reconhecer só as duas
// frases que interessam evita encher a Atividade com "passo falhou" e afins.
const SNIPER_RE = /^comprei #(\S+) \(([^)]*)\) por (\d+) (\S+)/i;

/**
 * O nome do que foi negociado no Mercado, como o jogo o escreve.
 *
 * O campo 'tipo' do histórico diz a natureza do negócio (menus2.js, nomeVenda):
 * digimon, ovo, casa (Ilha), bike (Cartão de Speed) ou item — e 'diamantes' é
 * DCoin, não D-Dol.
 */
function nomeNegocio(a) {
  // 'nome' vem pronto do processo principal, que tem o catálogo das espécies e
  // dos itens; aqui no renderer só existiria o slug ("agumon").
  const nome = a.nome || a.especie || null;
  if (a.oque === 'digimon') {
    return `${nome || 'Digimon'}${a.potencia ? ` P${a.potencia}` : ''}${a.shiny ? ' ✦' : ''}`;
  }
  if (a.oque === 'ovo') {
    return `ovo${nome ? ` de ${nome}` : ''}${a.potencia ? ` P${a.potencia}` : ''}${a.shiny ? ' ✦' : ''}`;
  }
  if (a.oque === 'casa') return 'uma Ilha';
  if (a.oque === 'bike') return 'um Cartão de Speed';
  if (a.item === 'diamantes') return 'DCoin';
  return nome || a.item || 'item';
}

/**
 * O que o Sniper viu ou fez, em português.
 *
 * As fases vêm do headless com CAMPOS, não com texto pronto, então a frase é
 * montada aqui — onde ela pertence. As fases são:
 *   mirou    = um anúncio bateu num alvo seu (o começo de tudo)
 *   fila     = estava retido (todo anúncio nasce com 2 min de trava)
 *   tentando = o comando de compra foi enviado
 *   comprei  = CONFIRMADO pelo histórico da conta: foi você quem levou
 *   perdido  = ninguém confirmou em 15 s: alguém chegou antes
 *   barrado  = ele desistiu, e o 'motivo' diz por quê
 *   varreu   = o pulso: prova que a ferramenta está rodando
 */
function nomeSniper(a) {
  // 'nome' vem traduzido do processo principal, que tem o catálogo; aqui só
  // existiria o slug ('gaomon').
  const nome = a.nome || a.especie || a.item || null;
  const extra = `${a.potencia ? ` P${a.potencia}` : ''}${a.shiny ? ' ✦' : ''}`;
  if (a.oque === 'ovo') return `ovo${nome ? ` de ${nome}` : ''}${extra}`;
  if (a.oque === 'digimon') return `${nome || 'Digimon'}${extra}`;
  return nome || 'item';
}

function registraSniper(acc, a) {
  const moeda = a.moeda === 'gemas' ? 'D-Dol' : 'bits';
  const preco = `${fmtNum(a.preco || 0)} ${moeda}`;
  const oque = nomeSniper(a);
  const alvo = a.alvo ? ` [${a.alvo}]` : '';
  // Quem agiu é o nick do jogo, não "eu": com várias contas rodando o Sniper, a
  // primeira pessoa não diz QUAL conta comprou — que é o que se quer saber.
  const nick = nickDe(acc);

  if (a.fase === 'varreu') {
    // O pulso não merece uma linha por volta: ele sozinho encheria a aba. Só
    // atualiza o rodapé de status, que diz "está vivo e varrendo".
    sniperPulso = { t: Date.now(), buscas: a.buscas || 0, vistos: a.vistos || 0, nick };
    if (state.ui.view === 'dash') renderLog();
    return;
  }

  if (a.fase === 'mirou') {
    const teto = a.teto ? `, teto ${fmtNum(a.teto)}` : '';
    log('sniper', acc, `achou ${oque} por ${preco}${teto}${alvo}`, nick);
    return;
  }
  if (a.fase === 'fila') {
    log('sniper', acc, `${oque} está retido; compra em ${a.seg}s${alvo}`, nick);
    return;
  }
  if (a.fase === 'tentando') {
    log('sniper', acc, `enviou a compra de ${oque} por ${preco}…`, nick);
    return;
  }
  if (a.fase === 'comprei') {
    const de = a.de ? ` de ${a.de}` : '';
    log('sniper-ok', acc, `COMPROU ${oque} por ${preco}${de}${alvo}`, nick);
    return;
  }
  if (a.fase === 'perdido') {
    log('sniper-no', acc, `não levou ${oque} por ${preco} — outro comprador chegou antes`, nick);
    return;
  }
  // Estava na fila e não virou compra. Sem esta linha o Painel prometia
  // "compra em 118s" e depois ficava calado, que é o pior dos mundos.
  if (a.fase === 'desistiu') {
    if (a.motivo === 'sumiu') {
      log('sniper-no', acc, `${oque} saiu do Mercado antes de liberar — outro comprador chegou antes`, nick);
      return;
    }
    if (a.motivo === 'subiu') {
      log('sniper-no', acc, `${oque} subiu de ${fmtNum(a.antes || 0)} para ${preco}, acima do teto${alvo}`, nick);
      return;
    }
    log('sniper-no', acc, `desistiu de ${oque}: o alvo foi alterado ou removido`, nick);
    return;
  }

  if (a.fase === 'barrado') {
    if (a.motivo === 'reserva') {
      const livre = (a.saldo || 0) - (a.reserva || 0);
      log('sniper-no', acc, `deixou passar ${oque} por ${preco}: só há ${fmtNum(livre)} ${moeda} livres (reserva de ${fmtNum(a.reserva || 0)})`, nick);
      return;
    }
    if (a.motivo === 'limite') {
      log('sniper-no', acc, `deixou passar ${oque}: no limite de ${a.max} compra(s)/hora`, nick);
      return;
    }
    log('sniper-no', acc, `deixou passar ${oque} por ${preco} (${a.motivo || 'motivo desconhecido'})`, nick);
  }
}

function registraSeller(acc, a) {
  const moeda = a.moeda === 'gemas' ? 'D-Dol' : 'bits';
  // O nome bonito vem do catálogo, pelo manager; sem ele, o id cru ainda é
  // melhor que nada.
  const oque = a.nome || a.item || 'item';
  const preco = `${fmtNum(a.preco || 0)} ${moeda}`;
  const nick = nickDe(acc);

  if (a.fase === 'varreu') {
    // Como no Sniper: uma linha por volta encheria a aba. Vai para o rodapé.
    sellerPulso = { t: Date.now(), olhados: a.olhados || 0, anunciados: a.anunciados || 0, nick };
    if (state.ui.view === 'dash') renderLog();
    return;
  }

  if (a.fase === 'anunciando') {
    // De onde saiu o preço é a pergunta central desta ferramenta, então ela é
    // respondida na própria linha.
    const fonte = a.manual
      ? 'preço fixo seu'
      : `média de 7 dias${a.mediaQtd ? ` sobre ${fmtNum(a.mediaQtd)} venda(s)` : ''}`;
    log('seller', acc, `anunciando ${fmtNum(a.qtd || 0)}× ${oque} a ${preco} cada (${fonte})…`, nick);
    return;
  }
  if (a.fase === 'anunciou') {
    // O "você recebe" é o número que importa: a comissão de 15% sai do
    // vendedor, então o total bruto engana.
    const liquido = fmtNum((a.total || 0) - (a.taxa || 0));
    const somou = a.somou ? ' (somou no anúncio que já estava aberto)' : '';
    log('seller-ok', acc, `ANUNCIOU ${fmtNum(a.saiu || a.qtd || 0)}× ${oque} a ${preco} cada · recebe ${liquido} ${moeda} após a comissão${somou}`, nick);
    return;
  }
  if (a.fase === 'recusado') {
    log('seller-no', acc, `o anúncio de ${oque} não foi ao ar: o item continua na mochila (o jogo recusou)`, nick);
    return;
  }
  if (a.fase === 'barrado') {
    if (a.motivo === 'sem-media') {
      log('seller-no', acc, `não anunciou ${oque}: o servidor não tem média em ${moeda} (nenhuma venda em 7 dias)`, nick);
      return;
    }
    if (a.motivo === 'piso') {
      log('seller-no', acc, `não anunciou ${oque}: a média está em ${preco}, abaixo do seu piso de ${fmtNum(a.piso || 0)}`, nick);
      return;
    }
    if (a.motivo === 'offline') {
      log('seller-no', acc, `não anunciou ${oque}: a conta não estava conectada`, nick);
      return;
    }
    log('seller-no', acc, `não anunciou ${oque} (${a.motivo || 'motivo desconhecido'})`, nick);
  }
}

/**
 * Transforma uma atividade do headless numa linha do log, ou ignora.
 *
 * O filtro é aqui e não no socket porque é escolha de interface: o que conta
 * como "digno de uma linha" pode mudar sem mexer no protocolo.
 */
function registraAtividade(accId, a) {
  if (!a) return;
  const acc = accById(accId);
  if (!acc) return;

  if (a.tipo === 'captura' && a.ovo) {
    const o = a.ovo;
    const pot = o.potencia ? ` P${o.potencia}` : '';
    const ux = o.scanner === 'ux' ? ' [UX]' : '';
    log('ovo', acc, `ovo ${o.letra}${pot}${ux}: ${o.nome}${o.shiny ? ' ✦' : ''}`);
    return;
  }

  if (a.tipo === 'chocou') { log('chocou', acc, a.txt); return; }

  // Item dropado. Raro é o que o JOGO chama de raro: o manager marca a[.raro]
  // pela mesma lista da aba "Itens Raros" da Mochila (shared/itens.json, chaves
  // 'raros' e 'zmoves'). A Proteção de Ovo está nessa lista mas cai o tempo
  // todo, então é a única exceção — e agora é a única mesmo, porque a "Energia
  // de Ovo" nunca foi rara: é categoria 'datas'.
  if (a.tipo === 'drop') {
    if (a.raro && dropRaro(a.item)) log('item', acc, `dropou ${a.item}${a.de ? ` (${a.de})` : ''}`);
    return;
  }

  // Venda ou compra no Mercado da Comunidade — entre players. A venda de ovos
  // da ferramenta é 'ovo.vender', para o NPC da Loja, e não aparece aqui.
  if (a.tipo === 'mercado') {
    const moeda = a.moeda === 'gemas' ? 'D-Dol' : 'bits';
    const total = (a.preco || 0) * (a.qtd || 1);
    const qtd = a.qtd > 1 ? `${fmtNum(a.qtd)}× ` : '';
    const quem = a.outro ? ` ${a.vendi ? 'para' : 'de'} ${a.outro}` : '';
    log('mercado', acc, `${a.vendi ? 'vendeu' : 'comprou'} ${qtd}${nomeNegocio(a)} por ${fmtNum(total)} ${moeda}${quem}`);
    return;
  }

  // O log do Sniper, em etapas. Cada fase é uma linha, para dar para acompanhar
  // o que ele viu, o que tentou e se a compra foi mesmo nossa — o jogo não
  // confirma 'mercado.comprar', então 'tentando' e 'comprei' são momentos
  // diferentes, separados pela chegada do histórico.
  if (a.tipo === 'sniper') { registraSniper(acc, a); return; }

  // O log do Auto Seller, pelo mesmo motivo: o jogo não responde a
  // 'mercado.anunciar', então "anunciando" e "anunciou" são momentos
  // diferentes, separados pela mochila diminuir.
  if (a.tipo === 'seller') { registraSeller(acc, a); return; }

  if (a.tipo === 'ferramenta') {
    const txt = String(a.txt || '');
    // A venda de ovos é para o NPC da Loja ('ovo.vender'), não o Mercado da
    // Comunidade. Ficava como "vendeu N ovo(s) no Mercado", que era errado e
    // poluía a lista: dezenas de linhas por hora, de uma venda automática que
    // não é notícia. As vendas reais entre players vêm como tipo 'mercado'.
    const s = SNIPER_RE.exec(txt);
    if (s && a.tool === 'sniper') {
      const moeda = s[4] === 'gemas' || /D-Dol/i.test(s[4]) ? 'D-Dol' : 'bits';
      log('sniper', acc, `sniper comprou ${s[2]} por ${fmtNum(Number(s[3]))} ${moeda}`);
      return;
    }
    return;
  }
}

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
      desenhaPainel(accId);
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
        // applyProxy devolve false em vez de lançar, então o catch sozinho não
        // pegava falha de setProxy: a página carregava pelo IP real.
        let ok = false;
        try {
          await deck.armProxy(`persist:acc-${accId}`);
          ok = await deck.applyProxy(`persist:acc-${accId}`, group.proxy);
        } catch (err) {
          console.error('[proxy] falhou ao aplicar:', err);
        }
        if (!ok) {
          raiseAlert(acc, 'Proxy', 'Não consegui aplicar o proxy desta tela.');
          log('erro', acc, 'Saída do headless cancelada: proxy não aplicado');
          return false;
        }
      }

      wv.setAttribute('src', url);
      r.tile.classList.remove('headless-mode');
      // O resumo é do socket que acabou de cair: deixá-lo na tela mostraria
      // dados congelados ao lado da página ao vivo.
      r.painel = null;
      desenhaPainel(accId);
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
    // O tempo no ar conta nos DOIS modos. Antes só olhava r.status, que em
    // headless nunca vira 'online' (markOnline depende do webview): o "Tempo
    // online hoje" ficava congelado no valor da última vez que a conta rodou
    // com janela, mesmo com as contas caçando a noite toda.
    if (contaOnline(r)) {
      acc.stats.onlineMs += dt;
      today().onlineMs += dt;
      // 'soft': este contador anda a cada segundo por conta. Marcá-lo como
      // mudança real deixava o estado sempre sujo e fazia o app regravar o
      // arquivo inteiro a cada 10 s, para sempre.
      markSoftDirty();
    }
    // Daqui para baixo é vigilância de PÁGINA (travou, não responde, recarga
    // automática). Nada disso existe sem webview, então segue olhando r.status.
    if (r.status === 'online') {
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

// Quanto tempo uma rodada de miniaturas pode levar. Cada espiada numa conta
// dormindo custa 400 ms (peekThumb espera a cena ser desenhada), e o laço roda a
// cada 4 s: com 8 contas dormindo uma rodada passava de 3 s e encavalava na
// seguinte, deixando o app capturando tela quase sem pausa. Com orçamento, as
// contas que não couberam ficam para a próxima rodada — elas só perdem alguns
// segundos de atualização da miniatura, que ninguém percebe.
const THUMB_ORCAMENTO_MS = 2500;

// Por onde a próxima rodada começa, para as contas do fim da lista não ficarem
// sempre sem vez quando o orçamento estoura.
let thumbCursor = 0;

async function thumbLoop() {
  const view = state.ui.view;
  if (thumbBusy || lockedUI || document.hidden || (view !== 'main' && view !== 'dash')) return;
  thumbBusy = true;
  const ate = Date.now() + THUMB_ORCAMENTO_MS;
  try {
    const ids = [...rt.keys()];
    if (!ids.length) return;
    if (thumbCursor >= ids.length) thumbCursor = 0;
    for (let n = 0; n < ids.length; n++) {
      const i = (thumbCursor + n) % ids.length;
      const id = ids[i];
      const r = rt.get(id);
      if (!r) continue;
      // O orçamento estourou: guarda onde paramos e deixa o resto para a
      // próxima rodada, em vez de atrasar todos os outros laços.
      if (Date.now() > ate) { thumbCursor = i; return; }
      if (!r.wcId || r.status === 'reconnecting' || r.goingToSleep) continue;
      if (view === 'main' && id === state.ui.current) continue;
      if (r.sleeping) { if (Date.now() - r.thumbAt >= PEEK_MS) await peekThumb(r); } else await captureThumb(r);
    }
    thumbCursor = 0; // a rodada fechou inteira
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

// Esta conta está no ar?
//
// Existem dois caminhos para uma conta ficar online, e só um deles escrevia
// r.status: markOnline() depende do webview (lê r.wv.getURL()), então em
// headless ele NUNCA roda e r.status fica para sempre no 'disconnected' do
// começo. O socket marca o seu estado em r.headlessStatus, à parte.
//
// Sem olhar os dois, todo contador de "online" dava zero no modo headless: o
// rodapé mostrava 0/16 com as contas caçando, os pontinhos dos cards ficavam
// cinzas e o relógio de "Farmando" congelava. Quem tirava e repunha a conta no
// headless via tudo voltar ao normal — não porque algo tivesse sido religado,
// mas porque a passagem pelo webview finalmente escrevia r.status.
function contaOnline(r) {
  if (!r) return false;
  return r.status === 'online' || r.headlessStatus === 'connected';
}

// Desde quando a conta está no ar, ou null. Mesma história do contaOnline:
// onlineSince só era escrito por markOnline(), então em headless ele ficava
// parado no valor de uma sessão antiga de webview — era esse o relógio travado.
function onlineDesde(r) {
  if (!contaOnline(r)) return null;
  return r.onlineSince || null;
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
  // Headless: o estado vem do socket, não do webview. 'connecting' e
  // 'reconnecting' acendem o mesmo amarelo de uma conta se reconectando.
  if (isHeadless(id) && r.headlessStatus) {
    return { connected: 'ok', connecting: 'load', reconnecting: 'warn', failed: 'alert' }[r.headlessStatus] || 'off';
  }
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
        const rotulo = HEADLESS_ROTULO[r.headlessStatus] || r.headlessStatus;
        // Conectado mostra há quanto tempo, como o card do webview faz. Sem
        // isso o headless era o único modo sem noção de tempo no ar.
        const d = onlineDesde(r);
        return '⚡ ' + rotulo + (d ? ' há ' + fmtDur(now - d) : '');
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
    case 'up': { const d = onlineDesde(r); return d ? fmtDur(now - d) : '—'; }
    case 'total': return acc ? fmtDur(acc.stats.onlineMs) : '';
    case 'drops': return acc ? String(acc.stats.drops) : '';
    case 'recov': return acc ? String(acc.stats.recoveries) : '';
    case 'mem': return r && r.metrics ? fmtMem(r.metrics.memKB) : '—';
    case 'cpu': return r && r.metrics ? fmtCpu(r.metrics.cpu) : '—';

    // ---- as métricas do card no Painel. Todas vêm do resumo do headless
    // (r.painel): fora do headless não há socket e não há o que mostrar.
    //
    // As taxas podem ser null de propósito: menos de 1 min de caça. É o mesmo
    // corte que o jogo faz, e '—' é honesto onde um número seria invenção.
    case 'xph': { const t = r && r.painel && r.painel.taxas; return t && t.xpTamerH != null ? fmtNum(Math.round(t.xpTamerH)) : '—'; }
    case 'bitsh': { const t = r && r.painel && r.painel.taxas; return t && t.bitsH != null ? fmtNum(Math.round(t.bitsH)) : '—'; }
    case 'killsh': { const t = r && r.painel && r.painel.taxas; return t && t.killsH != null ? fmtNum(Math.round(t.killsH)) : '—'; }
    case 'bits': return r && r.painel ? fmtNum(r.painel.bits) : '—';
    case 'ddol': return r && r.painel ? fmtNum(r.painel.ddol) : '—';
    // 0 é uma afirmação ("acabaram hoje"); null é a ausência dela (o lobby do
    // Labirinto ainda não respondeu, ou a conta não tem guild).
    case 'labs': return r && r.painel && r.painel.labs != null ? String(r.painel.labs) : '—';
    case 'hunt': return r && r.painel && r.painel.hunt ? r.painel.hunt.nome : '—';
    // O tempo de CAÇA, não o tempo conectado: medido em conta real, dá para
    // estar 48 min online com 0 de caça (Hospital, praça, menus).
    case 'caca': return r && r.painel && r.painel.farm ? fmtDur(r.painel.farm.caca) : '—';

    case 'scr': {
      const accs = state.accounts.filter((a) => screenOf(a) === id);
      const on = accs.filter((a) => contaOnline(rt.get(a.id))).length;
      return `${on}/${accs.length}`;
    }
    case 'kpi': {
      const enabled = state.accounts.filter((a) => a.enabled).length;
      const online = [...rt.values()].filter(contaOnline);
      const t = today();
      switch (id) {
        case 'online': return `${online.length}/${enabled}`;
        case 'farm': {
          // Só conta quem tem marca de início: uma conta sem onlineSince
          // (headless que conectou antes desta correção) puxaria o Math.min
          // para 0 e mostraria um relógio absurdo desde 1970.
          const desde = online.map(onlineDesde).filter(Boolean);
          return desde.length ? fmtClock(now - Math.min(...desde)) : '—';
        }
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
// Os retratos no card do Painel: o Digimon ativo contra o alvo, como no foco.
//
// Fora do laço de texto do updateLive porque imagem não é textContent. A guarda
// do 'assinatura' é o que impede recriar dois <img> com data-URL a cada tique:
// o navegador descartaria e redecodificaria as imagens 1x por segundo.
function desenhaRostos(el, accId) {
  const r = rt.get(accId);
  const p = r && r.painel;
  const meu = p && p.digimon;
  const alvo = p && p.alvo;
  const assinatura = `${meu ? meu.especie : ''}|${alvo ? alvo.especie : ''}`;
  if (el.dataset.faces === assinatura) return;
  el.dataset.faces = assinatura;
  if (!meu && !alvo) { el.replaceChildren(); return; }
  el.replaceChildren(
    retratoEl(meu && meu.nome, meu && meu.img, 'meu'),
    h('span', { class: 'dash-vs' }, 'vs'),
    retratoEl(alvo && alvo.nome, alvo && alvo.img, 'alvo'),
  );
}

// Os nós que o updateLive atualiza, guardados entre chamadas.
//
// updateLive roda 1x por segundo e varria o documento inteiro com
// querySelectorAll duas vezes. Com 16 contas no Painel são ~150 nós por
// segundo, e a lista só muda quando a tela é redesenhada — então ela é
// recolhida uma vez e invalidada por invalidaLive().
let liveEls = null;
let dotEls = null;
function invalidaLive() { liveEls = null; dotEls = null; }

function updateLive() {
  if (!liveEls) liveEls = $$('[data-live]');
  if (!dotEls) dotEls = $$('[data-dot]');
  for (const el of liveEls) {
    const chave = el.dataset.live;
    if (chave.startsWith('faces:')) { desenhaRostos(el, chave.slice(6)); continue; }
    const v = liveValue(chave);
    if (el.textContent !== v) el.textContent = v;
  }
  for (const el of dotEls) {
    const c = 'dot ' + dotClass(el.dataset.dot);
    if (el.className !== c) el.className = c;
  }
  for (const [, r] of rt) r.tile.classList.toggle('is-down', r.status === 'reconnecting');
  $('#netOff').classList.toggle('hidden', navigator.onLine);
  updateTitle();
}
function updateTitle() {
  const enabled = state.accounts.filter((a) => a.enabled).length;
  const online = [...rt.values()].filter(contaOnline).length;
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
  invalidaLive();
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
  // Entrar ou sair um tile muda os nós data-live (cada card tem os seus).
  for (const id of [...rt.keys()]) if (!want.has(id)) { destroyRuntime(id); invalidaLive(); }
  for (const acc of state.accounts) if (acc.enabled && !rt.has(acc.id)) { createRuntime(acc); invalidaLive(); }
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
  invalidaLive(); // a tela vai ser redesenhada: os nós de antes não valem mais
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
  invalidaLive();
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
  invalidaLive();
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
  invalidaLive();
  const dash = $('#dash');
  const stat = (label, key, hint, cls = '') => h('div', { class: 'card stat ' + cls },
    h('div', { class: 'label' }, label), h('div', { class: 'value', dataset: { live: key } }), hint ? h('div', { class: 'hint' }, hint) : null);
  const cards = state.accounts.map((acc) => {
    const g = groupOf(acc);
    // O duplo clique substitui o botão "Focar". Clique simples não serve: o
    // card inteiro ficaria sendo um botão, e selecionar o texto de uma métrica
    // jogaria a pessoa para a tela da conta sem querer.
    return paintAccColor(h('div', {
      class: 'card acc-card',
      title: 'Dois cliques para focar esta conta',
      ondblclick: () => { if (acc.enabled) toggleFocus(acc.id); else setEnabled(acc.id, true); },
    },
      // O print da tela só existe no modo webview. Em headless não há página
      // para fotografar, e o espaço reservado para ele (2/3 da altura do card)
      // ficava ocupado por uma inicial gigante — empurrando as métricas e os
      // retratos para fora da área visível.
      isHeadless(acc.id) ? null : shot(acc),
      h('div', { class: 'acc-card-body' },
        h('div', { class: 'acc-card-title' },
          h('span', { class: 'dot', dataset: { dot: acc.id } }),
          h('span', { class: 'acc-name' }, acc.name),
          g ? h('span', { class: 'pill', style: { '--gc': tone(g.color) } }, g.name) : null),
        h('div', { class: 'acc-meta', style: { marginBottom: '8px' }, dataset: { live: 'status:' + acc.id } }),
        // O retrato de quem está lutando, igual ao modo foco. Em headless não há
        // tela: sem a imagem, o card é só números e não se reconhece a conta.
        h('div', { class: 'dash-faces', dataset: { live: 'faces:' + acc.id } }),
        // As métricas que respondem "esta conta está rendendo?". Memória, CPU e
        // quedas saíram: nenhuma delas diz nada sobre a caça, e ocupavam as seis
        // linhas que o card tem.
        h('div', { class: 'kv' },
          h('div', {}, h('span', {}, 'XP/h'), h('span', { dataset: { live: 'xph:' + acc.id } })),
          h('div', {}, h('span', {}, 'Bits/h'), h('span', { dataset: { live: 'bitsh:' + acc.id } })),
          h('div', {}, h('span', {}, 'Kills/h'), h('span', { dataset: { live: 'killsh:' + acc.id } })),
          h('div', {}, h('span', {}, 'Bits'), h('span', { dataset: { live: 'bits:' + acc.id } })),
          h('div', {}, h('span', {}, 'D-Dol'), h('span', { dataset: { live: 'ddol:' + acc.id } })),
          h('div', {}, h('span', {}, 'Labs'), h('span', { dataset: { live: 'labs:' + acc.id } })),
          h('div', {}, h('span', {}, 'hunt'), h('span', { dataset: { live: 'hunt:' + acc.id } })),
          h('div', {}, h('span', {}, 'caçando há'), h('span', { dataset: { live: 'caca:' + acc.id } }))))), acc);
  });

  dash.replaceChildren(
    h('div', { class: 'dash-head' },
      h('h2', {}, 'Painel'),
      h('span', { class: 'sub' }, `hoje, ${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}`),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn sm', onclick: () => showSummary(Date.now() - 24 * 3600000, 'Resumo das últimas 24h') }, 'Resumo 24h')),
    // Sem faixa de KPIs. Ela ocupava a primeira tela inteira com números que o
    // resto do Painel já conta melhor: quantas contas estão online se vê nos
    // cards, quedas e alertas aparecem na Atividade na hora em que acontecem, e
    // os totais do dia continuam no Resumo 24h, a um clique daqui.
    h('div', { class: 'dash-cols' },
      h('div', {},
        h('h3', { class: 'section-title' }, 'Contas'),
        cards.length ? h('div', { class: 'acc-cards' }, cards) : h('div', { class: 'card stat' }, 'Nenhuma conta ainda.')),
      h('div', { class: 'dash-side' },
        h('div', { class: 'card logbox' },
          h('h3', { class: 'section-title' }, 'Atividade'),
          h('div', { class: 'chips', id: 'logChips' }),
          h('div', { class: 'log', id: 'logList' })),
        h('div', { class: 'card logbox' },
          h('div', { class: 'inline' },
            // Não é histórico: é o que as contas TÊM agora. Por isso não há
            // botão de apagar — não existe nada guardado para apagar, e a lista
            // esvazia sozinha quando a venda automática leva os ovos.
            h('h3', { class: 'section-title', style: { margin: '0' } }, 'Ovos e digimons nas contas'),
            h('span', { class: 'grow' }),
            h('span', { class: 'acc-meta', id: 'ovosCount' })),
          h('div', { class: 'chips', id: 'ovoChips' }),
          h('div', { class: 'ovo-list', id: 'ovoList' })))),
  );
  renderLog();
  renderOvos();
  updateLive();
}

// =============================================================== ovos
// Um filtro por vez, como pedido: clicar em "SS" mostra só SS. 'all' volta ao
// começo. Guardar em variável de módulo (e não no estado) é de propósito: é
// uma escolha do momento, não uma preferência que deva sobreviver ao reinício.
let ovoFilter = 'all';

// As letras na ordem do jogo (ovo-tier.js), mais os outros eixos pelos quais um
// ovo ou digimon se destaca.
//
// A letra vale para os dois: o servidor manda a 'nota' do digimon já calculada
// na MESMA escala de 0 a 10 do ovo, então o corte D..SSS é o mesmo (ver
// letraDeNota em ovo-tier.js). "SSS" quer dizer a mesma coisa nas duas linhas.
//
// 'Ovos'/'Digimons' existem porque a pergunta mais comum é justamente separar
// os dois ("o que ainda não chocou?" / "o que eu tenho?").
//
// Não há filtro "UX": medido numa conta real, o pacote 'ovos' não traz
// 'scanner'. Ele existia só no histórico de capturas, que não é mais a fonte.
// 'travado' entrou no lugar — é o que diz quais ovos a venda automática nunca
// vai levar.
const OVO_FILTROS = [
  ['all', 'Tudo'], ['ovo', '🥚 Ovos'], ['digi', 'Digimons'],
  ['SSS', 'SSS'], ['SS', 'SS'], ['S', 'S'], ['A', 'A'], ['B', 'B'], ['C', 'C'], ['D', 'D'],
  ['shiny', '✦ Shiny'], ['travado', '🔒 Travado'], ['p5', 'P5'], ['p4', 'P4'],
];

/**
 * Um ovo passa por um filtro salvo?
 *
 * O filtro é uma lista de regras unidas por OU, como o pedido "SSS P1 ao P5,
 * SS P4 ao P5": cada regra é uma letra com uma faixa de potência. É OU porque
 * nenhum ovo é SSS e SS ao mesmo tempo — E não deixaria passar nada.
 *
 * 'shiny' é exigência dentro da regra, não regra própria: "SSS ✦" pede as duas
 * coisas no mesmo ovo.
 *
 * Filtros salvos antes podem ter 'r.ux'. Ele é ignorado: o campo 'scanner' não
 * existe na bolsa, e exigi-lo esconderia todos os ovos sem dizer por quê.
 */
function ovoPassaNoFiltro(o, f) {
  if (!f || !Array.isArray(f.regras) || !f.regras.length) return true;
  return f.regras.some((r) => {
    if (r.letra && r.letra !== o.letra) return false;
    const p = o.potencia || 0;
    if (r.pMin != null && p < r.pMin) return false;
    if (r.pMax != null && p > r.pMax) return false;
    if (r.shiny && !o.shiny) return false;
    return true;
  });
}

function renderOvos() {
  const chips = $('#ovoChips'), list = $('#ovoList'), cont = $('#ovosCount');
  if (!chips || !list) return;

  const salvos = state.ovoFiltros || [];
  chips.replaceChildren(
    ...OVO_FILTROS.map(([k, label]) => h('button', {
      class: 'chip' + (ovoFilter === k ? ' active' : ''),
      onclick: () => { ovoFilter = k; renderOvos(); },
    }, label)),
    // Os filtros que o próprio usuário montou. Ficam depois dos de fábrica, com
    // um X para apagar: são dele, e tirar um não pode exigir ir às configurações.
    ...salvos.map((f) => h('button', {
      class: 'chip chip-custom' + (ovoFilter === 'f:' + f.id ? ' active' : ''),
      title: descreveFiltroOvo(f),
      onclick: () => { ovoFilter = 'f:' + f.id; renderOvos(); },
    }, f.nome, h('span', {
      class: 'chip-x', title: 'Apagar este filtro',
      onclick: (e) => { e.stopPropagation(); apagarFiltroOvo(f.id); },
    }, '×'))),
    h('button', { class: 'chip chip-novo', title: 'Criar um filtro seu, por letra e potência', onclick: novoFiltroOvo }, '+ Filtro'),
  );

  const salvo = ovoFilter.startsWith('f:') ? salvos.find((f) => 'f:' + f.id === ovoFilter) : null;
  // Um filtro salvo que foi apagado noutra aba: cai para 'Tudo' em vez de
  // esconder todos os ovos sem explicação.
  if (ovoFilter.startsWith('f:') && !salvo) ovoFilter = 'all';

  const match = (o) => (salvo ? ovoPassaNoFiltro(o, salvo)
    : ovoFilter === 'all'
    // 'tipo' separa as duas naturezas da mesma lista. Um item sem tipo é
    // tratado como ovo: era o que a lista tinha antes dos digimons.
    || (ovoFilter === 'ovo' && (o.tipo || 'ovo') === 'ovo')
    || (ovoFilter === 'digi' && o.tipo === 'digi')
    || (ovoFilter === 'shiny' && o.shiny)
    || (ovoFilter === 'travado' && o.travado)
    || (ovoFilter === 'p5' && o.potencia === 5)
    || (ovoFilter === 'p4' && o.potencia === 4)
    || o.letra === ovoFilter);

  const bolsa = todosOsOvos();
  const todos = bolsa.filter(match);
  // Os melhores primeiro: é a pergunta que se faz olhando isto ("sobrou algo
  // bom?"), não "o que entrou agora". Empate de letra desempata pela nota.
  todos.sort((a, b) => (ORDEM_LETRA[b.letra] || 0) - (ORDEM_LETRA[a.letra] || 0)
    || (b.nota || 0) - (a.nota || 0)
    || (b.em || 0) - (a.em || 0));
  // Um teto na tela: centenas de linhas com imagem travariam a rolagem.
  const rows = todos.slice(0, 200);
  if (cont) cont.textContent = `${fmtNum(todos.length)} de ${fmtNum(bolsa.length)}`;

  list.replaceChildren(...(rows.length ? rows.map(ovoRow)
    : [h('div', { class: 'log-empty' }, bolsa.length
      ? 'Nada com este filtro.'
      : (bolsas.size ? 'As contas ligadas não têm ovos nem digimons agora.' : 'Ligue as contas para ver o que elas têm.'))]));

  // Os retratos que ainda não estão em cache. Só as linhas visíveis.
  carregaRetratos(rows.map((o) => o.especie), () => {
    if (state.ui.view === 'dash') renderOvos();
  });
}

// Para ordenar: a letra é texto, e 'SSS' > 'A' por acaso alfabético não serve.
const ORDEM_LETRA = { D: 1, C: 2, B: 3, A: 4, S: 5, SS: 6, SSS: 7 };

// Onde o digimon está guardado, em uma palavra. 'equipe' é o único que muda o
// que a conta faz (são os que lutam), por isso é o que ganha destaque.
const LOCAL_DIGI = { equipe: 'equipe', depot: 'DigiBank', colecao: '★ coleção', mercado: 'anunciado' };

function ovoRow(o) {
  const digi = o.tipo === 'digi';
  const d = new Date(o.em || 0);
  const quando = o.em ? (dayKey(o.em) === dayKey() ? fmtTime(o.em) : `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`) : '';
  // A dica diz por extenso o que a linha abrevia: a faixa do jogo ("Mítico") e
  // quando o bicho entrou na conta.
  const dica = [o.nome, digi && o.faixa ? o.faixa : '', o.em ? 'capturado em ' + d.toLocaleString('pt-BR') : '']
    .filter(Boolean).join(' · ');
  return h('div', { class: 'ovo-row', title: dica },
    // O retrato vem do cache por espécie: a imagem nunca entra nesta lista.
    retratoEl(o.nome, retratosCache.get(o.especie) || null, 'ovo'),
    h('div', { class: 'ovo-info' },
      // O 🥚 distingue o que ainda não chocou do que já é digimon — as duas
      // coisas moram na mesma lista e podem ser a mesma espécie.
      h('div', { class: 'ovo-nome' }, (digi ? '' : '🥚 ') + (o.shiny ? '✦ ' : '') + o.nome),
      h('div', { class: 'ovo-sub' },
        o.nomeConta ? h('span', {}, o.nomeConta) : null,
        // Nível e poder só existem no digimon, e são o que se olha nele.
        digi && o.nivel ? h('span', {}, `Nv ${fmtNum(o.nivel)}`) : null,
        digi && o.poder ? h('span', {}, `${fmtNum(o.poder)} poder`) : null,
        digi && o.local ? h('span', {}, LOCAL_DIGI[o.local] || o.local) : null,
        quando ? h('span', {}, quando) : null,
        // A nota de 0 a 10 é o número por trás da letra: duas letras iguais
        // podem estar bem longe uma da outra dentro da mesma faixa.
        o.nota != null ? h('span', {}, `nota ${Number(o.nota).toFixed(2)}`) : null,
        // O +N de energia: é o que a venda automática olha para poupar o ovo.
        !digi && o.data ? h('span', {}, `+${o.data}`) : null)),
    h('div', { class: 'ovo-tags' },
      // Cadeado: a venda automática nunca leva este ovo.
      o.travado ? h('span', { class: 'ovo-pot', title: 'Travado: a venda automática não leva' }, '🔒') : null,
      h('span', { class: 'ovo-tier t' + (o.letra || 'x') }, o.letra || '?'),
      o.potencia ? h('span', { class: 'ovo-pot p' + o.potencia }, 'P' + o.potencia) : null));
}

/** O filtro em palavras: "SSS P1–P5 · SS P4–P5". Vira o title do chip. */
function descreveFiltroOvo(f) {
  if (!f || !f.regras || !f.regras.length) return 'Mostra todos os ovos';
  return f.regras.map((r) => {
    const faixa = r.pMin === r.pMax ? `P${r.pMin}` : `P${r.pMin}–P${r.pMax}`;
    return [r.letra || 'qualquer', faixa, r.shiny ? '✦' : ''].filter(Boolean).join(' ');
  }).join(' · ');
}

const LETRAS_OVO = ['SSS', 'SS', 'S', 'A', 'B', 'C', 'D'];

/**
 * O editor de filtro: uma linha por letra, com a faixa de potência.
 *
 * Em grade e não em texto livre: "SSS P1 ao P5, SS P4 ao P5" é fácil de dizer e
 * chato de escrever sem errar. Aqui marca-se a letra e escolhem-se os dois
 * extremos — o que se pode montar é exatamente o que o filtro sabe aplicar.
 */
function novoFiltroOvo() {
  // Começa vazio: um padrão marcado viraria um filtro salvo sem querer.
  const linhas = new Map(); // letra -> { on, pMin, pMax, shiny }
  for (const l of LETRAS_OVO) linhas.set(l, { on: false, pMin: 1, pMax: 5, shiny: false });

  const nomeIn = h('input', { class: 'inp', placeholder: 'ex.: Os bons', maxlength: 24 });
  const resumo = h('p', { class: 'help', style: { margin: '2px 0 0' } }, 'Marque pelo menos uma letra.');

  const atualiza = () => {
    const f = coleta();
    resumo.textContent = f.regras.length ? descreveFiltroOvo(f) : 'Marque pelo menos uma letra.';
    // Quantos ovos o filtro pegaria AGORA. Sem isto, só se descobre que o
    // filtro está errado depois de salvar e clicar nele.
    if (f.regras.length) {
      const bolsa = todosOsOvos();
      const n = bolsa.filter((o) => ovoPassaNoFiltro(o, f)).length;
      resumo.textContent += ` — ${fmtNum(n)} de ${fmtNum(bolsa.length)} ovo(s) nas contas`;
    }
  };

  const coleta = () => ({
    regras: LETRAS_OVO.filter((l) => linhas.get(l).on).map((l) => {
      const v = linhas.get(l);
      // Invertido pelo usuário (min 5, max 1) não devolveria nada: ordena.
      const a = Math.min(v.pMin, v.pMax), b = Math.max(v.pMin, v.pMax);
      return { letra: l, pMin: a, pMax: b, shiny: v.shiny };
    }),
  });

  const selP = (letra, qual) => {
    const v = linhas.get(letra);
    return h('select', {
      class: 'inp inp-mini',
      onchange: (e) => { v[qual] = Number(e.target.value); atualiza(); },
    }, ...[1, 2, 3, 4, 5].map((n) => h('option', { value: String(n), selected: v[qual] === n ? '' : null }, 'P' + n)));
  };

  const linha = (letra) => {
    const v = linhas.get(letra);
    const cb = h('input', { type: 'checkbox', onchange: (e) => { v.on = e.target.checked; atualiza(); } });
    const sh = h('input', { type: 'checkbox', onchange: (e) => { v.shiny = e.target.checked; atualiza(); } });
    return h('div', { class: 'ovof-linha' },
      h('label', { class: 'ovof-letra' }, cb, h('span', { class: 'ovo-tier t' + letra }, letra)),
      h('div', { class: 'ovof-faixa' }, selP(letra, 'pMin'), h('span', {}, 'até'), selP(letra, 'pMax')),
      h('label', { class: 'ovof-mini', title: 'Só os shiny' }, sh, h('span', {}, '✦')));
  };

  const salvar = () => {
    const f = coleta();
    if (!f.regras.length) { toast('Marque pelo menos uma letra.', 'warn'); return; }
    const nome = (nomeIn.value || '').trim() || descreveFiltroOvo(f).slice(0, 24);
    if (!state.ovoFiltros) state.ovoFiltros = [];
    const id = uid();
    state.ovoFiltros.push({ id, nome, regras: f.regras });
    save();
    // Já abre no filtro recém-criado: foi para isso que ele o montou.
    ovoFilter = 'f:' + id;
    closeModal();
    renderOvos();
    toast(`Filtro "${nome}" salvo.`, 'ok');
  };

  modal({
    title: 'Novo filtro de ovos',
    body: h('div', {},
      field('Nome', nomeIn, 'Como ele vai aparecer no botão.'),
      h('div', { class: 'ovof-grade' }, ...LETRAS_OVO.map(linha)),
      resumo),
    foot: [
      h('button', { class: 'btn', onclick: () => closeModal() }, 'Cancelar'),
      h('button', { class: 'btn primary', onclick: salvar }, 'Salvar filtro'),
    ],
  });
}

async function apagarFiltroOvo(id) {
  const f = (state.ovoFiltros || []).find((x) => x.id === id);
  if (!f) return;
  const ok = await confirmBox('Apagar filtro', `Apaga o filtro "${f.nome}". Os ovos não são tocados.`, 'Apagar', true);
  if (!ok) return;
  state.ovoFiltros = state.ovoFiltros.filter((x) => x.id !== id);
  if (ovoFilter === 'f:' + id) ovoFilter = 'all';
  save();
  renderOvos();
}

function renderLog() {
  const chips = $('#logChips'), list = $('#logList');
  if (!chips || !list) return;
  // 'Jogo' junta o que acontece dentro da conta (ovo, choco, item, venda,
  // sniper); as quedas e alertas são do app. Separar os dois é o que faz a
  // Atividade servir: um alerta de captcha não disputa espaço com um drop.
  const filters = [
    ['all', 'Tudo'], ['jogo', 'Jogo'], ['ovo', 'Ovos'], ['chocou', 'Chocados'],
    ['item', 'Itens'], ['mercado', 'Mercado'], ['drop', 'Quedas'], ['alert', 'Alertas'],
  ];
  chips.replaceChildren(...filters.map(([k, label]) => h('button', {
    class: 'chip' + (logFilter === k ? ' active' : ''), onclick: () => { logFilter = k; renderLog(); },
  }, label)));
  const JOGO = ['ovo', 'chocou', 'item', 'mercado', ...SNIPER_TYPES, ...SELLER_TYPES];
  const match = (e) => logFilter === 'all'
    || (logFilter === 'jogo' && JOGO.includes(e.type))
    || (logFilter === 'mercado' && (e.type === 'mercado' || SNIPER_TYPES.includes(e.type) || SELLER_TYPES.includes(e.type)))
    || (logFilter === 'drop' && (e.type === 'drop' || e.type === 'freeze'))
    || (logFilter === 'recover' && e.type === 'recover')
    || (logFilter === 'alert' && ALERT_TYPES.includes(e.type))
    || e.type === logFilter;
  const rows = state.log.filter(match).slice(-150).reverse();
  const filhos = rows.length ? rows.map(logRow) : [h('div', { class: 'log-empty' }, 'Nada por aqui ainda.')];
  // Na aba Mercado, o pulso do Sniper fica no rodapé: é a diferença entre
  // "não achou nada" e "não está rodando".
  if (logFilter === 'mercado') {
    for (const p of [sniperPulsoRow(), sellerPulsoRow()]) if (p) filhos.push(p);
  }
  list.replaceChildren(...filhos);
}

/** O rodapé "o Sniper está vivo", ou null quando ele nunca varreu. */
function sniperPulsoRow() {
  if (!sniperPulso) return null;
  const p = sniperPulso;
  const quando = fmtTime(p.t);
  // Qual conta varreu é parte da informação: com várias rodando o Sniper, um
  // pulso sem nick não diz se a conta que importa está viva.
  const quem = p.nick ? `${p.nick} · ` : '';
  return h('div', { class: 'log-pulse', title: 'O Sniper varre a cada volta do intervalo e também quando o servidor avisa que o mercado mudou.' },
    `${quem}Sniper ativo · última varredura ${quando}: ${p.buscas} busca(s), ${fmtNum(p.vistos)} anúncio(s) vistos`);
}

/** O rodapé "o Auto Seller está vivo", ou null quando ele nunca rodou. */
function sellerPulsoRow() {
  if (!sellerPulso) return null;
  const p = sellerPulso;
  const quem = p.nick ? `${p.nick} · ` : '';
  // 'olhados' é quantos itens da lista estavam de fato na mochila. Zero aqui
  // significa "a mochila não tem nenhum deles", que é diferente de "não rodou".
  const oque = p.olhados
    ? `${p.olhados} item(ns) na mochila, ${p.anunciados} anunciado(s)`
    : 'nenhum item da lista está na mochila';
  return h('div', { class: 'log-pulse', title: 'O Auto Seller confere a mochila a cada volta do intervalo e anuncia pela média de 7 dias do servidor.' },
    `${quem}Auto Seller ativo · última volta ${fmtTime(p.t)}: ${oque}`);
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
  padraoFerramentas(acc.id);
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
      padraoFerramentas(acc2.id);
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
          if (!r || !r.wv) continue; // conta parada: pega o proxy novo ao ligar
          const partition = `persist:acc-${acc.id}`;
          if (proxy) {
            // O retorno era jogado fora e o reload() acontecia de qualquer
            // jeito - inclusive quando o proxy não subia.
            let ok = false;
            try {
              await deck.armProxy(partition);
              ok = await deck.applyProxy(partition, proxy);
            } catch (err) {
              console.error('[proxy] falhou ao aplicar:', err);
            }
            if (!ok) {
              raiseAlert(acc, 'Proxy', 'Não consegui aplicar o proxy desta tela.');
              drop(acc.id, `proxy não aplicado (${n})`);
              continue;
            }
            r.wv.reload();
          } else {
            // Tirar o proxy de uma tela é passar as contas dela para conexão
            // direta: isso é uma escolha, e precisa ser consciente.
            await deck.applyProxy(partition, null);
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
    const naTela = state.accounts.filter((a) => a.groupId === g.id);
    const count = naTela.length;
    // "Sem grupo" não tem proxy: apagar uma tela proxiada passava as contas
    // dela para conexão direta sem dizer nada. Quem confirma precisa saber.
    const aviso = count && g.proxy
      ? `As ${count} conta(s) desta tela vão para "Sem grupo", que NÃO tem proxy. Elas serão desligadas: religue só depois de pôr o proxy numa tela nova.`
      : count ? `As ${count} conta(s) desta tela vão para "Sem grupo". Nenhuma conta é apagada.` : 'A tela está vazia.';
    const ok = await confirmBox('Excluir tela', aviso, 'Excluir tela', true);
    if (!ok) return;
    // Derruba antes de soltar o grupo: enquanto a conta está ligada, a sessão
    // dela já está proxiada, e o próximo reload sairia direto.
    if (g.proxy) {
      for (const a of naTela) if (rt.has(a.id)) drop(a.id, `tela "${g.name}" (com proxy) foi excluída`);
    }
    state.groups = state.groups.filter((x) => x.id !== g.id);
    for (const a of state.accounts) {
      if (a.groupId !== g.id) continue;
      a.groupId = null;
      if (g.proxy) a.enabled = false;
    }
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

// Liga nas contas novas o conjunto de ferramentas que a pessoa quase sempre
// quer. Chamado em todo lugar que cria conta, antes do save().
function padraoFerramentas(accId) {
  if (!state.tools || typeof state.tools !== 'object') state.tools = {};
  window.DDTools?.aplicarPadraoContaNova?.(state.tools, accId);
}

// Copia a configuração de UMA ferramenta de uma conta para outras. Devolve
// quantas contas foram escritas. Não salva nem aplica: quem chama decide.
function copiarConfigFerramenta(toolId, deId, paraIds) {
  const tool = window.DDTools?.toolById(toolId);
  if (!tool) return 0;
  if (!state.tools[toolId]) state.tools[toolId] = {};
  const porConta = state.tools[toolId];
  const origem = porConta[deId];
  const enabled = window.DDTools.toolLigada(origem, tool);
  const cfg = { ...tool.defaults(), ...(origem?.cfg || {}) };
  let n = 0;
  for (const id of paraIds) {
    if (id === deId) continue;
    porConta[id] = { enabled, cfg: JSON.parse(JSON.stringify(cfg)) };
    n++;
  }
  return n;
}

// Copia TODAS as ferramentas de uma conta para outras (usado na duplicação).
function copiarFerramentas(deId, paraIds) {
  for (const toolId of Object.keys(state.tools || {})) {
    if (!state.tools[toolId]?.[deId]) continue;
    copiarConfigFerramenta(toolId, deId, paraIds);
  }
}

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
      const ligadas = state.accounts.filter((a) => window.DDTools.toolLigada(porConta[a.id], t));
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

// Traz para o deck as contas que o lote confirmou: uma tela (grupo) por bloco,
// com o proxy que criou aquelas contas, e o headless ligado no fim.
//
// O id da conta vem do lote, não é sorteado aqui: a sessão foi criada em
// persist:acc-<id> durante o cadastro, e é esse cookie que evita pedir login.
async function importarContasDoLote(contas) {
  const confirmadas = (contas || []).filter((c) => c.status === 'confirmada' && c.contaId);
  if (!confirmadas.length) return { criadas: 0, telas: 0 };

  const telas = new Map(); // tela do lote -> groupId
  const novas = [];

  for (const c of confirmadas) {
    if (state.accounts.some((a) => a.id === c.contaId)) continue; // já importada

    if (!telas.has(c.tela)) {
      const existentes = state.groups.length;
      const g = {
        id: uid(),
        // O nome da tela é a base de nick daquele bloco, que é como a pessoa
        // reconhece o grupo. Sem base (lote antigo), cai no rótulo genérico.
        name: c.baseNick || `Lote ${existentes + 1}`,
        color: COLORS[existentes % COLORS.length],
        limit: 0,
        // O proxy fica na tela, que é onde o deck o lê (group.proxy).
        proxy: c.proxy || null,
      };
      state.groups.push(g);
      telas.set(c.tela, g.id);
    }

    const acc = {
      ...DEFAULT_ACCOUNT,
      id: c.contaId,
      name: c.nick,
      url: DIGIIDLE.url,
      groupId: telas.get(c.tela),
      enabled: true,
      // Marca explícita, e não toggleHeadlessMode() depois: o createRuntime do
      // refresh já decide por isHeadless(), e ligar depois dele achava a conta
      // "já no modo pedido" e saía sem subir o socket — era a conta que chegava
      // com o headless aparentemente desligado até desligar e religar na mão.
      headless: true,
      createdAt: Date.now(),
      stats: { onlineMs: 0, drops: 0, recoveries: 0 },
    };
    state.accounts.push(acc);
    novas.push(acc);

    // Conta nova nasce na cidade, sem hunt. As ferramentas padrão marcadas aqui
    // (entre elas a "Auto Melhor Hunt") são ligadas pelo applyToolsHeadless
    // quando o socket conecta, e a primeira passada já leva a conta para a
    // melhor área.
    padraoFerramentas(acc.id);

    log('info', acc, 'conta criada pelo cadastro em lote');
  }

  if (!novas.length) return { criadas: 0, telas: 0 };

  save();
  refresh();

  return { criadas: novas.length, telas: telas.size };
}

// Cadastro em lote de contas (com proxies por tela).
function openCadastro() {
  const container = h('div', { class: 'cadastro-host' });
  const ui = new window.CadastroUI();
  // A UI do cadastro roda em outro escopo e não enxerga state/save/refresh.
  ui.importarContas = importarContasDoLote;
  ui.avisar = (msg, tipo) => toast(msg, tipo || 'ok', 6000);
  modal({
    title: 'Cadastro em Lote',
    wide: true,
    body: container,
    foot: [h('button', { class: 'btn', onclick: closeModal }, 'Fechar')],
    // Fechar a janela não pode descartar um lote em andamento: o polling segue
    // em segundo plano só para importar as contas no fim.
    onClose: () => { ui.container = null; },
  });
  // Monta depois do DOM existir no modal.
  requestAnimationFrame(() => ui.mount('.cadastro-host'));
}

// Uma ferramenta, conta a conta: liga/desliga e abre os ajustes daquela conta.
// scrollTop existe porque "Ajustar" e "Replicar" trocam o modal inteiro: ao
// voltar, a lista é remontada do zero e precisa ser recolocada onde estava.
function openToolAccounts(tool, scrollTop = 0) {
  if (!state.tools[tool.id]) state.tools[tool.id] = {};
  const porConta = state.tools[tool.id];
  const list = h('div', {});

  // Posição atual da rolagem desta lista, para quem vai abrir um submodal.
  const scrollAtual = () => list.closest('.modal-body')?.scrollTop || 0;
  const voltar = () => { const y = scrollAtual(); return () => openToolAccounts(tool, y); };

  const draw = () => {
    list.replaceChildren();
    if (!state.accounts.length) {
      list.append(h('p', { class: 'about' }, 'Nenhuma conta cadastrada ainda.'));
      return;
    }
    for (const acc of state.accounts) {
      // O padrão da ferramenta decide o estado inicial: quase todas desligadas,
      // o Auto Passe ligado. A partir daqui o registro passa a ser explícito.
      if (!porConta[acc.id]) porConta[acc.id] = { enabled: !!tool.padraoLigado, cfg: tool.defaults() };
      const conf = porConta[acc.id];
      const cfg = { ...tool.defaults(), ...(conf.cfg || {}) };
      list.append(h('div', { class: 'row-line', style: { display: 'flex', gap: '10px', alignItems: 'center', padding: '8px 0' } },
        h('input', {
          type: 'checkbox',
          class: 'toggle',
          checked: !!conf.enabled,
          title: `Ligar esta ferramenta em ${acc.name}`,
          onchange: (e) => {
            conf.enabled = e.target.checked;
            save();
            // Nada mais na lista depende deste valor, então não há redesenho:
            // é o que mantém o scroll e o foco onde a pessoa deixou.
            applyToolLive(tool.id, acc.id); // liga/desliga na hora, sem F5
          },
        }),
        h('div', { style: { flex: 1, minWidth: 0 } },
          h('div', {}, acc.name),
          h('span', { class: 'about' }, tool.summary(cfg))),
        h('button', { class: 'btn sm', type: 'button', title: `Copiar os ajustes de ${acc.name} para outras contas`, onclick: () => openToolCopy(tool, acc, voltar()) }, 'Replicar'),
        h('button', { class: 'btn sm', type: 'button', onclick: () => openToolConfig(tool, acc, voltar()) }, 'Ajustar')));
    }
  };

  draw();
  modal({
    title: `${tool.name} · por conta`,
    wide: true,
    body: h('div', {}, h('p', { class: 'about' }, tool.desc), list),
    foot: [h('button', { class: 'btn', onclick: () => { closeModal(); openTools(); } }, 'Voltar')],
  });
  if (scrollTop) {
    // Depois do modal entrar no DOM; o modal() já usa setTimeout para o foco.
    requestAnimationFrame(() => { const box = list.closest('.modal-body'); if (box) box.scrollTop = scrollTop; });
  }
}

// Copia os ajustes desta ferramenta nesta conta para as contas escolhidas.
function openToolCopy(tool, origem, onDone) {
  const marcadas = new Set();
  const outras = state.accounts.filter((a) => a.id !== origem.id);
  const list = h('div', { style: { maxHeight: '260px', overflowY: 'auto', marginTop: '6px' } });

  const todos = h('input', { type: 'checkbox' });
  todos.onchange = () => {
    for (const a of outras) (todos.checked ? marcadas.add(a.id) : marcadas.delete(a.id));
    for (const cb of list.querySelectorAll('input[type=checkbox]')) cb.checked = todos.checked;
  };

  if (!outras.length) {
    list.append(h('p', { class: 'about' }, 'Não há outra conta para receber estes ajustes.'));
  } else {
    for (const a of outras) {
      list.append(h('label', { class: 'check' },
        h('input', {
          type: 'checkbox',
          onchange: (e) => (e.target.checked ? marcadas.add(a.id) : marcadas.delete(a.id)),
        }),
        h('span', {}, a.name)));
    }
  }

  const cfgOrigem = { ...tool.defaults(), ...(state.tools[tool.id]?.[origem.id]?.cfg || {}) };
  const ligada = window.DDTools.toolLigada(state.tools[tool.id]?.[origem.id], tool);

  modal({
    title: `Replicar · ${tool.name}`,
    wide: true,
    body: h('div', {},
      h('p', { class: 'about' }, `Copia os ajustes de "${origem.name}" (${tool.summary(cfgOrigem)}) e o estado ${ligada ? 'ligado' : 'desligado'} para as contas marcadas, substituindo o que elas tiverem hoje.`),
      field('Copiar para quais contas?', list),
      outras.length ? checkRow(todos, 'Marcar todas') : null),
    foot: [
      h('button', { class: 'btn', onclick: () => { closeModal(); onDone(); } }, 'Cancelar'),
      h('button', {
        class: 'btn primary',
        onclick: async () => {
          const alvos = [...marcadas];
          if (!alvos.length) { toast('Marque pelo menos uma conta.', 'warn', 3000); return; }
          const n = copiarConfigFerramenta(tool.id, origem.id, alvos);
          save();
          closeModal();
          onDone();
          for (const id of alvos) await applyToolLive(tool.id, id);
          toast(`Ajustes de "${tool.name}" copiados para ${n} conta(s).`, 'ok', 4000);
        },
      }, 'Copiar'),
    ],
  });
}

// Os ajustes de uma ferramenta numa conta. Cada ferramenta desenha o seu formulário.
function openToolConfig(tool, acc, onDone) {
  const conf = state.tools[tool.id][acc.id];
  const cfg = { ...tool.defaults(), ...(conf.cfg || {}) };
  const forms = { refill: refillForm, eggs: eggsForm, hunt: huntForm, scan: scanForm, lab: labForm, passe: passeForm, sniper: sniperForm, seller: sellerForm };
  // A conta vai junto porque o Auto Seller mostra a mochila E a média de 7 dias
  // DELA: os dois números só existem no processo principal, por conta.
  const form = (forms[tool.id] || refillForm)(cfg, acc);

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

  // Os ids são os de cfg.dificuldades no servidor (lab.info da conta real).
  const dificuldade = h('select', { class: 'input' },
    h('option', { value: '', selected: !cfg.dificuldade }, 'Não mexer (deixa como está)'),
    h('option', { value: 'normal', selected: cfg.dificuldade === 'normal' }, 'Normal — prêmio ×1'),
    h('option', { value: 'dificil', selected: cfg.dificuldade === 'dificil' }, 'Difícil — prêmio ×1,6'),
    h('option', { value: 'pesadelo', selected: cfg.dificuldade === 'pesadelo' }, 'Pesadelo — prêmio ×2,4'));

  const entrarSemBau = h('input', { type: 'checkbox', checked: cfg.entrarSemBau === true });
  const startSemBau = h('input', { type: 'checkbox', checked: cfg.startSemBau === true });
  const autoStart = h('input', { type: 'checkbox', checked: cfg.autoStart === true });
  const gLotado = h('input', { type: 'checkbox', checked: cfg.startLotado === true });
  const gAposMin = h('input', { type: 'checkbox', checked: cfg.startAposMinimo === true });
  const gAposMinN = h('input', { class: 'input', type: 'number', min: '1', style: { width: '90px' }, value: String(cfg.startAposMinimoMin || 10) });
  const gSemEntrar = h('input', { type: 'checkbox', checked: cfg.startSemEntrar === true });
  const gSemEntrarN = h('input', { class: 'input', type: 'number', min: '1', style: { width: '90px' }, value: String(cfg.startSemEntrarMin || 5) });

  // Os gatilhos só fazem sentido com o início automático ligado.
  const bloco = h('div', { style: { marginTop: '8px' } });
  const sync = () => {
    const on = autoStart.checked;
    bloco.style.opacity = on ? '1' : '0.45';
    for (const e of [gLotado, gAposMin, gAposMinN, gSemEntrar, gSemEntrarN]) e.disabled = !on;
    gAposMinN.disabled = !on || !gAposMin.checked;
    gSemEntrarN.disabled = !on || !gSemEntrar.checked;
    // Começar sem baú só faz sentido com o início automático ligado E com a
    // conta entrando sem baú: o start exige estar no lobby.
    startSemBau.disabled = !on || !entrarSemBau.checked;
    if (startSemBau.disabled) startSemBau.checked = false;
  };
  autoStart.onchange = sync; gAposMin.onchange = sync; gSemEntrar.onchange = sync;
  entrarSemBau.onchange = sync;

  const linhaNum = (chk, texto, input, sufixo) => h('div', { class: 'row', style: { alignItems: 'center', gap: '8px', margin: '6px 0' } },
    chk, h('span', { style: { flex: 1 } }, texto), input, h('span', { class: 'help' }, sufixo));

  bloco.append(
    linhaNum(gLotado, 'Quando o lobby lotar (30 Tamers)', h('span'), ''),
    linhaNum(gAposMin, 'Depois de atingir o mínimo de 3, esperar', gAposMinN, 'min'),
    linhaNum(gSemEntrar, 'Quando ninguém entrar nem sair por', gSemEntrarN, 'min'));

  const el = h('div', {},
    field('Conferir o lobby a cada (minutos)', intervalo, 'Ela também entra assim que o lobby reabre, sem esperar este intervalo.'),
    field('Dificuldade do grupo', dificuldade, 'Afeta a guild inteira e só o dono/sub-dono pode trocar. A ferramenta mantém a escolhida enquanto não houver corrida.'),
    checkRow(entrarSemBau, 'Entrar mesmo sem baú (3/3 hoje)', 'Por padrão ela para de entrar quando os 3 baús do dia acabam. Marque para entrar assim mesmo: ajuda a guild a fechar o mínimo e a corrida ainda dá XP.'),
    checkRow(autoStart, 'Começar a corrida sozinha', 'Só funciona se a conta for dona ou sub-dona da guild. O jogo exige 3 Tamers no lobby para começar.'),
    bloco,
    h('span', { class: 'help' }, 'Com mais de um gatilho marcado, vale o primeiro que acontecer.'),
    checkRow(startSemBau, 'Começar mesmo sem baú (3/3 hoje)', 'Puxa a guild inteira para 25 minutos de corrida que não dá baú para esta conta. Precisa de "Entrar mesmo sem baú" marcado, porque começar exige estar no lobby.'),
    h('div', { class: 'warnbox' }, 'Começar manda todos do lobby para a corrida de uma vez e afeta a guild inteira. Em conta que não é dona nem sub-dona, esta parte fica inerte e só a inscrição no lobby funciona. A ferramenta nunca chama a guild nem sai do lobby.'));

  sync();

  return {
    el,
    read: () => ({
      intervaloMin: Math.max(1, +intervalo.value || 2),
      dificuldade: dificuldade.value || null,
      autoStart: autoStart.checked,
      startLotado: gLotado.checked,
      startAposMinimo: gAposMin.checked,
      startAposMinimoMin: Math.max(1, +gAposMinN.value || 10),
      startSemEntrar: gSemEntrar.checked,
      startSemEntrarMin: Math.max(1, +gSemEntrarN.value || 5),
      entrarSemBau: entrarSemBau.checked,
      // Sem o "entrar sem baú" a conta nem chega ao lobby: guardar true aqui
      // seria uma opção ligada que nunca age.
      startSemBau: startSemBau.checked && entrarSemBau.checked && autoStart.checked,
    }),
  };
}

// ------------------------------------------------- formulário do Auto Passe
function passeForm(cfg) {
  const intervalo = h('input', { class: 'input', type: 'number', min: '1', value: String(cfg.intervaloMin || 10) });
  const premium = h('input', { type: 'checkbox', checked: cfg.premiumAtrasado !== false });

  const el = h('div', {},
    field('Conferir a cada (minutos)', intervalo, 'O dia vira à meia-noite de Brasília. A ferramenta não depende do relógio do PC: ela pergunta ao servidor se o resgate está liberado.'),
    checkRow(premium, 'Resgatar também o Premium atrasado', 'Só age se a conta tiver o Passe Premium. Sem Premium, não há nada atrasado e ela nem tenta.'),
    h('div', { class: 'warnbox' }, 'Perder um dia volta a trilha para o Dia 1, levando os baús (dias 7, 14, 21 e 28) e o Lendário (dia 30). O Premium nunca é comprado: isso custa DCoin e fica com você.'));

  return {
    el,
    read: () => ({
      intervaloMin: Math.max(1, +intervalo.value || 10),
      premiumAtrasado: premium.checked,
    }),
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

// ------------------------------------------- formulário do Sniper de Mercado
// Um alvo é uma "procura salva": o que comprar, de que tipo, em que moeda e até
// que preço. Vários alvos convivem, porque o caso real é justamente esse —
// "ovo S+ até 2M em bits" e "ovo P5 até 30 D-Dol" são buscas diferentes.
//
// O teto é o único campo sem padrão útil: alvo com teto 0 não compra nada, de
// propósito. É o que torna seguro ligar a ferramenta antes de configurá-la.
function sniperForm(cfg) {
  const TIERS = window.DDTools.TIERS;
  const MERCADO_ITENS = window.DDTools.MERCADO_ITENS;

  // Um alvo guarda DOIS tetos, um por moeda. Alvo antigo (moeda + tetoPreco) é
  // convertido na entrada, senão a config salva de quem já usava a ferramenta
  // apareceria zerada na tela.
  const normaliza = (a) => {
    const n = {
      nome: a.nome || '',
      tipo: a.tipo || 'ovo',
      tetoBits: Math.max(0, +a.tetoBits || 0),
      tetoGemas: Math.max(0, +a.tetoGemas || 0),
      tiers: [...(a.tiers || [])],
      potencias: [...(a.potencias || [])],
      energiaMin: Math.max(0, +a.energiaMin || 0),
      especie: a.especie || '',
      soShiny: !!a.soShiny,
    };
    if (a.tetoPreco > 0 && a.tetoBits == null && a.tetoGemas == null) {
      if ((a.moeda || 'bits') === 'gemas') n.tetoGemas = +a.tetoPreco;
      else n.tetoBits = +a.tetoPreco;
    }
    return n;
  };

  const alvos = (cfg.alvos || []).map(normaliza);
  const alvoNovo = () => ({ nome: '', tipo: 'ovo', tetoBits: 0, tetoGemas: 0, tiers: [], potencias: [], energiaMin: 0, especie: '', soShiny: false });

  const semAcento = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const armado = (a) => (+a.tetoBits > 0 || +a.tetoGemas > 0) && ((a.tipo || 'ovo') === 'item' ? !!a.especie : true);

  /**
   * Os campos de UM alvo. É a mesma função para o rascunho (acima, ainda não
   * salvo) e para os alvos já na lista — se fossem dois blocos parecidos, um
   * campo novo entraria em só um deles e a diferença passaria calada.
   *
   * `aoMudar` existe porque os dois lados querem reagir a coisas diferentes: o
   * rascunho precisa reavaliar o botão "Adicionar"; a lista, repintar a cor.
   */
  const editor = (a, aoMudar) => {
    const mudou = () => { if (aoMudar) aoMudar(); };

    const nome = h('input', { class: 'input', value: a.nome || '', placeholder: 'nome do alvo (só para você)' });
    nome.addEventListener('input', () => { a.nome = nome.value; mudou(); });

    const tipo = h('select', { class: 'input' },
      ...[['ovo', 'Ovo'], ['digimon', 'Digimon'], ['item', 'Item'], ['tudo', 'Tudo']]
        .map(([v, n]) => h('option', { value: v, selected: (a.tipo || 'ovo') === v }, n)));

    // Um teto por moeda. 0 = não compre nesta moeda, e é isso que faz um alvo
    // "só em bits" nunca encostar no D-Dol.
    const tBits = h('input', { class: 'input', type: 'number', min: '0', value: String(a.tetoBits || 0) });
    tBits.addEventListener('input', () => { a.tetoBits = Math.max(0, +tBits.value || 0); mudou(); });
    const tGemas = h('input', { class: 'input', type: 'number', min: '0', value: String(a.tetoGemas || 0) });
    tGemas.addEventListener('input', () => { a.tetoGemas = Math.max(0, +tGemas.value || 0); mudou(); });

    const esp = h('input', { class: 'input', value: a.especie || '', placeholder: 'ex.: agumon (vazio = qualquer)' });
    esp.addEventListener('input', () => { a.especie = esp.value.trim(); mudou(); });

    const tierSet = new Set(a.tiers || []);
    const tierBox = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '10px' } });
    for (const t of TIERS) {
      const cb = h('input', { type: 'checkbox', checked: tierSet.has(t) });
      cb.addEventListener('change', () => { cb.checked ? tierSet.add(t) : tierSet.delete(t); a.tiers = [...tierSet]; mudou(); });
      tierBox.append(h('label', { class: 'check', style: { margin: 0 } }, cb, h('span', {}, t)));
    }

    const potSet = new Set(a.potencias || []);
    const potBox = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '10px' } });
    for (const p of [1, 2, 3, 4, 5]) {
      const cb = h('input', { type: 'checkbox', checked: potSet.has(p) });
      cb.addEventListener('change', () => { cb.checked ? potSet.add(p) : potSet.delete(p); a.potencias = [...potSet]; mudou(); });
      potBox.append(h('label', { class: 'check', style: { margin: 0 } }, cb, h('span', {}, `P${p}`)));
    }

    const energia = h('select', { class: 'input' },
      ...[0, 1, 2, 3, 4, 5].map((n) => h('option', { value: String(n), selected: (a.energiaMin || 0) === n }, n ? `+${n} ou mais` : 'qualquer')));
    energia.addEventListener('change', () => { a.energiaMin = +energia.value; mudou(); });

    const shiny = h('input', { type: 'checkbox', checked: !!a.soShiny });
    shiny.addEventListener('change', () => { a.soShiny = shiny.checked; mudou(); });

    // --- item: escolher pelo NOME, filtrando a lista ao vivo ---
    const itemBusca = h('input', { class: 'input', value: '', placeholder: 'digite para filtrar: fogo, dragon, fragmento…' });
    const itemSel = h('select', { class: 'input', size: '8', style: { width: '100%' } });
    const itemAviso = h('span', { class: 'help' });

    const desenhaItens = () => {
      const q = itemBusca.value.trim();
      const casam = !q ? MERCADO_ITENS
        : MERCADO_ITENS.filter((it) => semAcento(it.nome).includes(semAcento(q)) || it.id.includes(q.toLowerCase()));
      itemSel.replaceChildren(...casam.map((it) => h('option', { value: it.id, selected: it.id === a.especie }, it.nome)));

      const antes = MERCADO_ITENS.find((it) => it.id === a.especie);
      if (!casam.length) {
        itemAviso.style.color = 'var(--warn, #f59e0b)';
        itemAviso.textContent = `Nenhum item do Mercado bate com "${q}".`;
        return;
      }
      // Sobrou um só: já escolhe. Com vários, NÃO escolhe nada sozinho — "chip"
      // casa com doze, e cravar o primeiro compraria o Chip de Trevas para quem
      // queria o de Fogo.
      if (casam.length === 1 && q) { a.especie = casam[0].id; itemSel.value = casam[0].id; mudou(); }
      const atual = MERCADO_ITENS.find((it) => it.id === a.especie);
      if (atual) {
        itemAviso.style.color = '';
        itemAviso.textContent = `Vai comprar: ${atual.nome} (${atual.id})`;
      } else if (a.especie) {
        itemAviso.style.color = 'var(--warn, #f59e0b)';
        itemAviso.textContent = `Id avulso: "${a.especie}" — não está na lista do Mercado.`;
      } else {
        itemAviso.style.color = 'var(--warn, #f59e0b)';
        itemAviso.textContent = `${casam.length} item(ns) na lista. Clique em um: sem item escolhido este alvo não compra nada.`;
      }
      if (antes && !casam.some((it) => it.id === antes.id)) {
        itemAviso.textContent += ' (fora do filtro atual, mas ainda escolhido)';
      }
    };
    itemSel.addEventListener('change', () => { a.especie = itemSel.value; desenhaItens(); mudou(); });
    itemBusca.addEventListener('input', desenhaItens);
    desenhaItens();

    // O miolo muda com o tipo, então ele é redesenhado em vez de a tela toda:
    // repintar tudo faria o campo em foco perder o cursor no meio da digitação.
    const miolo = h('div', { style: { marginTop: '8px' } });
    const desenhaMiolo = () => {
      const digi = (a.tipo || 'ovo') === 'ovo' || a.tipo === 'digimon';
      miolo.replaceChildren(...(digi ? [
        h('span', { class: 'help' }, 'Tier (vazio = qualquer)'), tierBox,
        h('span', { class: 'help' }, 'Potência (vazio = qualquer)'), potBox,
        h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' } },
          h('label', { style: { flex: '1 1 150px' } }, h('span', { class: 'help' }, 'Energia do ovo (+N)'), energia),
          h('label', { style: { flex: '1 1 200px' } }, h('span', { class: 'help' }, 'Espécie'), esp)),
        h('label', { class: 'check', style: { marginTop: '8px' } }, shiny, h('span', {}, 'Só Shiny / UX')),
      ] : (a.tipo === 'item' ? [
        h('span', { class: 'help' }, 'Qual item (digite para filtrar a lista)'), itemBusca,
        h('div', { style: { marginTop: '6px' } }, itemSel),
        h('div', { style: { marginTop: '6px' } }, itemAviso),
      ] : [
        h('span', { class: 'help' }, 'Espécie ou id (vazio = qualquer)'), esp,
      ])));
    };
    tipo.addEventListener('change', () => { a.tipo = tipo.value; desenhaMiolo(); mudou(); });
    desenhaMiolo();

    return {
      nome,
      campos: h('div', {},
        h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
          h('label', { style: { flex: '1 1 110px' } }, h('span', { class: 'help' }, 'Tipo'), tipo),
          h('label', { style: { flex: '1 1 140px' } }, h('span', { class: 'help' }, 'Teto em bits'), tBits),
          h('label', { style: { flex: '1 1 140px' } }, h('span', { class: 'help' }, 'Teto em D-Dol'), tGemas)),
        h('span', { class: 'help' }, 'Um teto por moeda. 0 = não compra naquela moeda — deixe o D-Dol em 0 para procurar só em bits.'),
        miolo),
    };
  };

  // ------------------------------------------------ rascunho (o alvo em edição)
  // Fica logo abaixo do botão, e só entra na lista quando você clica "Adicionar".
  // Antes, "Adicionar alvo" empurrava um alvo vazio para o fim da pilha e era lá
  // embaixo que se preenchia — longe do botão que acabou de ser clicado.
  const rascunho = h('div', {});
  let novo = null;

  const fechaRascunho = () => { novo = null; rascunho.replaceChildren(); };

  const abreRascunho = () => {
    novo = alvoNovo();
    const okBt = h('button', { class: 'btn primary', type: 'button' }, 'Adicionar');
    const cancelBt = h('button', { class: 'btn', type: 'button', onclick: fechaRascunho }, 'Cancelar');
    const aviso = h('span', { class: 'help', style: { margin: 0 } });

    const revisar = () => {
      const pode = armado(novo);
      okBt.disabled = !pode;
      okBt.style.opacity = pode ? '' : '0.5';
      aviso.style.color = pode ? '' : 'var(--warn, #f59e0b)';
      aviso.textContent = pode
        ? 'Pronto para entrar na lista.'
        : ((novo.tipo || 'ovo') === 'item' && !novo.especie && (+novo.tetoBits > 0 || +novo.tetoGemas > 0)
          ? 'Escolha o item: sem ele, o alvo compraria qualquer item abaixo do teto.'
          : 'Defina um teto em bits ou em D-Dol para poder adicionar.');
    };

    const ed = editor(novo, revisar);
    okBt.addEventListener('click', () => {
      if (!armado(novo)) return;   // a trava real; o disabled é só a dica visual
      alvos.push(novo);
      fechaRascunho();
      draw();
    });
    revisar();

    rascunho.replaceChildren(h('div', { class: 'card', style: { padding: '12px', marginTop: '10px', borderLeft: '3px solid var(--accent, #60a5fa)' } },
      h('strong', { style: { display: 'block', marginBottom: '8px' } }, 'Novo alvo'),
      ed.nome,
      h('div', { style: { marginTop: '8px' } }, ed.campos),
      h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '12px', flexWrap: 'wrap' } },
        okBt, cancelBt, aviso)));
  };

  // ------------------------------------------------------- a lista dos salvos
  const rows = h('div', {});

  const draw = () => {
    rows.replaceChildren();
    if (!alvos.length) {
      rows.append(h('p', { class: 'about' }, 'Nenhum alvo ainda. Clique em "Adicionar alvo".'));
      return;
    }
    const nArmados = alvos.filter(armado).length;
    rows.append(h('div', { style: { display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '8px' } },
      h('strong', {}, `Alvos configurados (${alvos.length})`),
      h('span', { class: 'help', style: { margin: 0 } }, nArmados ? `${nArmados} armado(s)` : 'nenhum armado — nada será comprado')));

    alvos.forEach((a, i) => {
      const card = h('div', { class: 'card', style: { padding: '12px', marginBottom: '10px' } });
      const selo = h('span', { class: 'help' });

      // A cor diz, de relance, qual alvo de fato compra — e em que moeda.
      const pintar = () => {
        const on = armado(a);
        card.style.borderLeft = on ? '3px solid var(--ok, #22c55e)' : '3px solid var(--line-2)';
        card.style.background = on ? 'color-mix(in srgb, var(--ok, #22c55e) 7%, transparent)' : '';
        selo.style.color = on ? 'var(--ok, #22c55e)' : '';
        if (!on) {
          selo.textContent = (a.tipo || 'ovo') === 'item' && !a.especie && (+a.tetoBits > 0 || +a.tetoGemas > 0)
            ? 'Sem item escolhido: este alvo não compra nada.'
            : 'Sem teto de preço: este alvo não compra nada.';
          return;
        }
        const partes = [];
        if (+a.tetoBits > 0) partes.push(`até ${(+a.tetoBits).toLocaleString('pt-BR')} bits`);
        if (+a.tetoGemas > 0) partes.push(`até ${(+a.tetoGemas).toLocaleString('pt-BR')} D-Dol`);
        selo.textContent = `Armado: ${partes.join(' · ')}`;
      };

      const ed = editor(a, pintar);
      const del = h('button', { class: 'btn danger', type: 'button', onclick: () => { alvos.splice(i, 1); draw(); } }, 'Remover');
      pintar();

      card.append(
        h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' } }, ed.nome, del),
        selo,
        h('div', { style: { marginTop: '6px' } }, ed.campos));
      rows.append(card);
    });
  };

  const addBt = h('button', { class: 'btn', type: 'button', onclick: () => (novo ? fechaRascunho() : abreRascunho()) }, 'Adicionar alvo');
  draw();

  const intervalo = h('input', { class: 'input', type: 'number', min: '20', value: String(cfg.intervaloSec || 60) });
  const resBits = h('input', { class: 'input', type: 'number', min: '0', value: String(cfg.reservaBits || 0) });
  const resGemas = h('input', { class: 'input', type: 'number', min: '0', value: String(cfg.reservaGemas || 0) });
  const maxHora = h('input', { class: 'input', type: 'number', min: '0', value: String(cfg.maxPorHora ?? 5) });
  const soLib = h('input', { type: 'checkbox', checked: !!cfg.soLiberados });

  const el = h('div', {},
    h('p', { class: 'about' }, 'Cada alvo é uma procura: o que comprar e até que preço em cada moeda. Alvo sem teto nunca compra — é assim que a ferramenta fica segura antes de você configurá-la.'),
    // Botão, rascunho e só então a lista: o que você acabou de abrir fica ao lado
    // do botão que abriu, não no fim de uma pilha de alvos.
    addBt,
    rascunho,
    h('div', { style: { marginTop: '12px' } }, rows),
    h('div', { class: 'field', style: { marginTop: '14px' } }, h('label', {}, 'Varrer a cada (segundos)'), intervalo,
      h('span', { class: 'help' }, 'Mínimo de 20 s. A ferramenta também varre na hora em que o servidor avisa que o mercado mudou.')),
    field('Reserva de bits (nunca gastar)', resBits),
    field('Reserva de D-Dol (nunca gastar)', resGemas),
    h('div', { class: 'field' }, h('label', {}, 'Máximo de compras por hora'), maxHora,
      h('span', { class: 'help' }, '0 = sem limite. É a trava que segura um erro de configuração.')),
    checkRow(soLib, 'Só comprar o que já está liberado',
      'Desligado (recomendado): anúncio retido entra na fila e é comprado no instante em que libera — os 2 min de espera são onde as pechinchas são disputadas.'),
    h('div', { class: 'warnbox' }, 'A compra é definitiva e gasta moeda de verdade. Comece com um teto baixo e o limite por hora ligado. O preço vai junto no comando, então o jogo recusa a compra se o vendedor mudar o valor — você nunca paga mais do que o teto.'));

  return {
    el,
    read: () => ({
      // O rascunho não entra: enquanto não se clica "Adicionar", ele é um alvo
      // pela metade, e salvar meio alvo é o caminho para comprar o que não foi
      // pedido.
      alvos: alvos.map((a) => ({
        nome: a.nome || '',
        tipo: a.tipo || 'ovo',
        tetoBits: Math.max(0, +a.tetoBits || 0),
        tetoGemas: Math.max(0, +a.tetoGemas || 0),
        tiers: a.tiers || [],
        potencias: a.potencias || [],
        energiaMin: Math.max(0, +a.energiaMin || 0),
        especie: a.especie || '',
        soShiny: !!a.soShiny,
      })),
      intervaloSec: Math.max(20, +intervalo.value || 60),
      reservaBits: Math.max(0, +resBits.value || 0),
      reservaGemas: Math.max(0, +resGemas.value || 0),
      maxPorHora: Math.max(0, +maxHora.value || 0),
      soLiberados: soLib.checked,
    }),
  };
}

// --------------------------------------------- formulário do Auto Seller
// Um "item da lista" é: qual item, em que moeda, e por quanto. O "por quanto"
// nasce da média de venda de 7 dias do servidor — o MESMO número que o jogo
// oferece no botão "usar" da tela de anúncio, sem acréscimo nem desconto.
//
// A tela busca ao vivo duas coisas que o renderer não tem: quantas unidades a
// mochila tem e qual é essa média. Sem elas a pessoa escolheria o preço no
// escuro, que é justamente o que a ferramenta existe para evitar.
function sellerForm(cfg, acc) {
  const MERCADO_ITENS = (window.DDTools.MERCADO_ITENS || []).filter((it) => window.DDTools.vendavel(it.id));
  const semAcento = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const nomeDe = (id) => (MERCADO_ITENS.find((it) => it.id === id) || {}).nome || id;

  const normaliza = (i) => ({
    item: i.item || '',
    moeda: i.moeda === 'gemas' ? 'gemas' : 'bits',
    precoManual: Math.max(0, +i.precoManual || 0),
    precoMinimo: Math.max(0, +i.precoMinimo || 0),
  });
  const itens = (cfg.itens || []).map(normaliza);
  const itemNovo = () => ({ item: '', moeda: 'bits', precoManual: 0, precoMinimo: 0 });

  // A mochila é pedida UMA vez e reaproveitada por todas as linhas: ela já está
  // no estado do socket, mas uma ida por linha faria a tela piscar sem motivo.
  let mochila = null;
  const mochilaPronta = (async () => {
    try {
      const r = await deck.headlessMochila(acc.id);
      mochila = r && r.ok ? (r.itens || {}) : null;
    } catch { mochila = null; }
  })();

  /**
   * Os campos de UM item. Mesma função para o rascunho e para os já salvos, pelo
   * mesmo motivo do Sniper: um campo novo entraria em só um dos dois lados.
   */
  const editor = (it, aoMudar) => {
    const mudou = () => { if (aoMudar) aoMudar(); };

    const busca = h('input', { class: 'input', value: '', placeholder: 'digite para filtrar: chip, fragmento, disco…' });
    const sel = h('select', { class: 'input', size: '8', style: { width: '100%' } });
    const aviso = h('span', { class: 'help' });

    const moeda = h('select', { class: 'input' },
      h('option', { value: 'bits', selected: it.moeda !== 'gemas' }, 'bits'),
      h('option', { value: 'gemas', selected: it.moeda === 'gemas' }, 'D-Dol'));

    const manual = h('input', { class: 'input', type: 'number', min: '0', value: String(it.precoManual || 0) });
    const minimo = h('input', { class: 'input', type: 'number', min: '0', value: String(it.precoMinimo || 0) });

    // As duas linhas de informação viva: a mochila e a média.
    const infoQtd = h('span', { class: 'help', style: { margin: 0 } }, 'conferindo a mochila…');
    const infoMedia = h('span', { class: 'help', style: { margin: 0 } }, '');
    const usarBt = h('button', { class: 'btn sm', type: 'button', style: { display: 'none' } }, 'usar como preço fixo');

    const pintaQtd = async () => {
      await mochilaPronta;
      if (!it.item) { infoQtd.textContent = 'Escolha um item para ver quanto você tem.'; return; }
      if (!mochila) {
        infoQtd.style.color = 'var(--warn, #f59e0b)';
        infoQtd.textContent = 'A conta não está conectada em headless: não dá para ler a mochila agora.';
        return;
      }
      const n = Math.max(0, +mochila[it.item] || 0);
      infoQtd.style.color = n ? '' : 'var(--warn, #f59e0b)';
      infoQtd.textContent = n
        ? `Na mochila agora: ${fmtNum(n)} unidade(s) — a ferramenta anuncia TODAS.`
        : 'Na mochila agora: nenhuma. Nada será anunciado até você obter o item.';
    };

    // Cada ida ao servidor é um pedido de listagem; um 'pedido' identifica o
    // último, para uma resposta lenta de um item antigo não sobrescrever a tela.
    let pedido = 0;
    const pintaMedia = async () => {
      const meu = ++pedido;
      usarBt.style.display = 'none';
      if (!it.item) { infoMedia.textContent = ''; return; }
      infoMedia.style.color = '';
      infoMedia.textContent = 'consultando a média do servidor…';
      let r = null;
      try { r = await deck.headlessMercadoMedia(acc.id, it.item, it.moeda); } catch { r = null; }
      if (meu !== pedido) return;
      const nomeMoeda = it.moeda === 'gemas' ? 'D-Dol' : 'bits';
      if (!r || !r.ok) {
        infoMedia.style.color = 'var(--warn, #f59e0b)';
        infoMedia.textContent = 'Não deu para consultar (a conta precisa estar conectada em headless).';
        return;
      }
      if (!r.media) {
        infoMedia.style.color = 'var(--warn, #f59e0b)';
        infoMedia.textContent = `Sem média em ${nomeMoeda}: ninguém vendeu este item nos últimos 7 dias. `
          + 'Com a lista assim, só um preço fixo seu faria a ferramenta anunciar.';
        return;
      }
      // A comissão de 15% sai do vendedor, então o bruto engana: o que a pessoa
      // precisa comparar é o líquido.
      const liquido = Math.round(r.media * 0.85);
      const partes = [`Média de 7 dias: ${fmtNum(r.media)} ${nomeMoeda} por unidade`,
        `você recebe ${fmtNum(liquido)} após a comissão de 15%`];
      if (r.mediaQtd) partes.push(`sobre ${fmtNum(r.mediaQtd)} venda(s)`);
      if (r.menor) partes.push(`anúncio mais barato aberto: ${fmtNum(r.menor)}`);
      if (r.jaAberto) partes.push(`você já tem ${fmtNum(r.jaAberto.qtd)} à venda a ${fmtNum(r.jaAberto.preco)} — o jogo SOMA as novas unidades nesse anúncio e mantém o preço antigo`);
      infoMedia.textContent = `${partes.join(' · ')}.`;
      usarBt.style.display = '';
      usarBt.onclick = () => { it.precoManual = r.media; manual.value = String(r.media); mudou(); };
    };

    const desenha = () => {
      const q = busca.value.trim();
      const casam = !q ? MERCADO_ITENS
        : MERCADO_ITENS.filter((x) => semAcento(x.nome).includes(semAcento(q)) || x.id.includes(q.toLowerCase()));
      sel.replaceChildren(...casam.map((x) => h('option', { value: x.id, selected: x.id === it.item }, x.nome)));
      if (!casam.length) {
        aviso.style.color = 'var(--warn, #f59e0b)';
        aviso.textContent = `Nenhum item negociável bate com "${q}".`;
        return;
      }
      // Sobrou um só com filtro digitado: já escolhe. Com vários, não escolhe
      // nada sozinho — "chip" casa com doze, e cravar o primeiro poria à venda
      // o item errado.
      if (casam.length === 1 && q && it.item !== casam[0].id) {
        it.item = casam[0].id; sel.value = casam[0].id;
        pintaQtd(); pintaMedia(); mudou();
      }
      if (it.item) {
        aviso.style.color = '';
        aviso.textContent = `Vai anunciar: ${nomeDe(it.item)} (${it.item})`;
      } else {
        aviso.style.color = 'var(--warn, #f59e0b)';
        aviso.textContent = `${casam.length} item(ns) negociáveis. Clique em um: sem item escolhido nada é anunciado.`;
      }
    };

    sel.addEventListener('change', () => { it.item = sel.value; desenha(); pintaQtd(); pintaMedia(); mudou(); });
    busca.addEventListener('input', desenha);
    moeda.addEventListener('change', () => { it.moeda = moeda.value; pintaMedia(); mudou(); });
    manual.addEventListener('input', () => { it.precoManual = Math.max(0, +manual.value || 0); mudou(); });
    minimo.addEventListener('input', () => { it.precoMinimo = Math.max(0, +minimo.value || 0); mudou(); });
    desenha(); pintaQtd(); pintaMedia();

    return {
      campos: h('div', {},
        h('span', { class: 'help' }, 'Qual item (digite para filtrar a lista)'), busca,
        h('div', { style: { marginTop: '6px' } }, sel),
        h('div', { style: { marginTop: '6px' } }, aviso),
        h('div', { style: { marginTop: '8px' } }, infoQtd),
        h('div', { style: { marginTop: '4px', display: 'flex', gap: '8px', alignItems: 'baseline', flexWrap: 'wrap' } }, infoMedia, usarBt),
        h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' } },
          h('label', { style: { flex: '1 1 110px' } }, h('span', { class: 'help' }, 'Moeda'), moeda),
          h('label', { style: { flex: '1 1 150px' } }, h('span', { class: 'help' }, 'Preço fixo (0 = usar a média)'), manual),
          h('label', { style: { flex: '1 1 150px' } }, h('span', { class: 'help' }, 'Piso: não anunciar abaixo de'), minimo)),
        h('span', { class: 'help' }, 'Com preço fixo em 0 o valor é a média de 7 dias do servidor, igualzinha — sem aumentar nem baixar. O piso é a trava: se a média cair abaixo dele, a ferramenta não anuncia e o item fica na mochila.')),
    };
  };

  // --------------------------------------------------- rascunho (item em edição)
  const rascunho = h('div', {});
  let novo = null;
  const fechaRascunho = () => { novo = null; rascunho.replaceChildren(); };

  const abreRascunho = () => {
    novo = itemNovo();
    const okBt = h('button', { class: 'btn primary', type: 'button' }, 'Adicionar');
    const cancelBt = h('button', { class: 'btn', type: 'button', onclick: fechaRascunho }, 'Cancelar');
    const dica = h('span', { class: 'help', style: { margin: 0 } });

    const revisar = () => {
      const pode = !!novo.item;
      okBt.disabled = !pode;
      okBt.style.opacity = pode ? '' : '0.5';
      dica.style.color = pode ? '' : 'var(--warn, #f59e0b)';
      dica.textContent = pode ? 'Pronto para entrar na lista.' : 'Escolha o item para poder adicionar.';
    };

    const ed = editor(novo, revisar);
    okBt.addEventListener('click', () => {
      if (!novo.item) return;   // a trava real; o disabled é só a dica visual
      itens.push(novo);
      fechaRascunho();
      draw();
    });
    revisar();

    rascunho.replaceChildren(h('div', { class: 'card', style: { padding: '12px', marginTop: '10px', borderLeft: '3px solid var(--accent, #60a5fa)' } },
      h('strong', { style: { display: 'block', marginBottom: '8px' } }, 'Novo item'),
      ed.campos,
      h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '12px', flexWrap: 'wrap' } },
        okBt, cancelBt, dica)));
  };

  // ------------------------------------------------------- a lista dos salvos
  const rows = h('div', {});

  const draw = () => {
    rows.replaceChildren();
    if (!itens.length) {
      rows.append(h('p', { class: 'about' }, 'Nenhum item ainda. Clique em "Adicionar item" — com a lista vazia a ferramenta não anuncia nada.'));
      return;
    }
    rows.append(h('div', { style: { display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '8px' } },
      h('strong', {}, `Itens à venda (${itens.length})`)));

    itens.forEach((it, i) => {
      const card = h('div', { class: 'card', style: { padding: '12px', marginBottom: '10px' } });
      const titulo = h('strong', { style: { flex: 1, minWidth: 0 } });
      const pintar = () => {
        const on = !!it.item;
        card.style.borderLeft = on ? '3px solid #fcd34d' : '3px solid var(--line-2)';
        titulo.textContent = on
          ? `${nomeDe(it.item)} · ${it.moeda === 'gemas' ? 'D-Dol' : 'bits'} · ${it.precoManual > 0 ? `preço fixo ${fmtNum(it.precoManual)}` : 'pela média de 7 dias'}`
          : 'Sem item escolhido: esta linha não anuncia nada.';
      };
      const ed = editor(it, pintar);
      const del = h('button', { class: 'btn danger', type: 'button', onclick: () => { itens.splice(i, 1); draw(); } }, 'Remover');
      pintar();

      card.append(
        h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' } }, titulo, del),
        ed.campos);
      rows.append(card);
    });
  };

  const addBt = h('button', { class: 'btn', type: 'button', onclick: () => (novo ? fechaRascunho() : abreRascunho()) }, 'Adicionar item');
  draw();

  // O intervalo é em MINUTOS porque é a unidade real desta ferramenta: o jogo só
  // deixa mudar o preço de um item uma vez a cada 30 min, então conferir de 10
  // em 10 segundos não adiantaria nada.
  const intervalo = h('input', { class: 'input', type: 'number', min: '1', value: String(Math.max(1, Math.round((cfg.intervaloSec || 300) / 60))) });
  const maxHora = h('input', { class: 'input', type: 'number', min: '0', value: String(cfg.maxPorHora ?? 10) });

  const el = h('div', {},
    h('p', { class: 'about' }, 'Cada linha é um item da mochila posto à venda no Mercado pela média de venda dos últimos 7 dias — o mesmo preço que o jogo sugere, sem acréscimo nem desconto. Lista vazia não anuncia nada.'),
    addBt,
    rascunho,
    h('div', { style: { marginTop: '12px' } }, rows),
    h('div', { class: 'field', style: { marginTop: '14px' } }, h('label', {}, 'Conferir a mochila a cada (minutos)'), intervalo,
      h('span', { class: 'help' }, 'O jogo só permite trocar o preço de um item uma vez a cada 30 min, então conferir de minuto em minuto não traz ganho.')),
    h('div', { class: 'field' }, h('label', {}, 'Máximo de anúncios por hora'), maxHora,
      h('span', { class: 'help' }, '0 = sem limite. É a trava que segura um erro de configuração.')),
    h('div', { class: 'warnbox' }, 'O anúncio põe o item de verdade à venda e a comissão de 15% sai de você. '
      + 'Se já houver um anúncio seu do mesmo item, o jogo SOMA as unidades novas nele e mantém o preço antigo — a ferramenta não repreça nada. '
      + 'Todo anúncio fica retido 2 min antes de aparecer para os outros.'));

  return {
    el,
    read: () => ({
      // O rascunho não entra: enquanto não se clica "Adicionar", ele é meio
      // item, e salvar meio item é o caminho para anunciar o que não foi pedido.
      itens: itens.filter((i) => i.item).map(normaliza),
      intervaloSec: Math.max(60, Math.round((+intervalo.value || 5) * 60)),
      maxPorHora: Math.max(0, +maxHora.value || 0),
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
        checkRow(inputs.closeToTray, 'Minimizar manda para a bandeja', 'As contas continuam farmando, e o ícone da bandeja traz a janela de volta. Fechar a janela (X) encerra o DigiDeck.'),
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
  // A cópia herda as ferramentas da conta de origem; o que a origem nunca
  // configurou cai no padrão de conta nova.
  copiarFerramentas(acc.id, [copy.id]);
  padraoFerramentas(copy.id);
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
  // Grava já quando não havia estado (primeira execução) ou quando a leitura
  // jogou fora os retratos embutidos: aí o arquivo de 24 MB encolhe na abertura,
  // em vez de esperar a próxima mudança que talvez nunca venha.
  if (!loaded || ovosMigrados) flush();
  applySide();
  refresh();
  updateSecureBadge();
  setInterval(tick, 1000);
  setInterval(freezeLoop, 30000);
  setInterval(thumbLoop, 4000);
  setInterval(metricsLoop, 5000);
  // A bolsa das contas em modo webview (em headless ela chega sozinha).
  setInterval(bolsaLoop, BOLSA_WEBVIEW_MS);
  bolsaLoop();
  // Mudança de verdade: grava em até 10 s.
  setInterval(() => { if (dirty) flush(); }, 10000);
  // Só os contadores de tempo online: a cada 5 min. Eles sobem sozinhos a cada
  // segundo, e gravar o estado inteiro por causa deles era trabalho jogado fora.
  setInterval(() => { if (softDirty && !dirty) flush(); }, 5 * 60000);
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
  $('#btnCadastro').addEventListener('click', () => started && !lockedUI && openCadastro());
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
  // Ao fechar vale gravar os dois níveis: aqui o custo é pago uma vez, e é o que
  // garante que o "tempo online" do dia não perca os últimos minutos.
  window.addEventListener('beforeunload', () => { if (started && (dirty || softDirty)) deck.saveState(state); });
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
