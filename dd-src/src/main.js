'use strict';
const {
  app, BrowserWindow, ipcMain, Notification, Tray, Menu, powerSaveBlocker,
  webContents, session, dialog, shell, safeStorage, net,
} = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { makeIcon, makeDot, writeIco } = require('./icon');
const { Vault, encryptBackup, decryptBackup } = require('./vault');
const { createUpdater } = require('./updater');
const { HeadlessManager } = require('./headless/manager');

const DEV = !app.isPackaged;

// Pasta de dados alternativa (útil para testes): --data-dir=C:\caminho
const dataDirArg = process.argv.find((a) => a.startsWith('--data-dir='));
if (dataDirArg) app.setPath('userData', path.resolve(dataDirArg.slice('--data-dir='.length)));

app.setAppUserModelId('com.desdeck.app');

// Mantém a lógica dos jogos (timers, WebSocket) a 100% mesmo minimizado, coberto ou na bandeja.
// O desenho é outra história: conta que ninguém está vendo para de desenhar (economia, no renderer)
// e a página se vê oculta, como numa aba de fundo do navegador, só que sem congelar nem atrasar timers.
for (const sw of [
  'disable-renderer-backgrounding',
  'disable-background-timer-throttling',
  'disable-backgrounding-occluded-windows',
]) app.commandLine.appendSwitch(sw);
app.commandLine.appendSwitch('disable-features', [
  'CalculateNativeWinOcclusion',
  'IntensiveWakeUpThrottling', // timers de página oculta seguem no ritmo normal (não 1x por minuto)
  'SpareRendererForSitePerProcess', // sem processo "reserva" ocioso esperando a próxima aba
  'BackForwardCache', // não guarda a página anterior inteira na memória ao navegar
  'HardwareMediaKeyHandling',
  'MediaRouter',
].join(','));

let win = null;
let tray = null;
let quitting = false;
let updater = null;
let state = null;
let loadInfo = {};
let vault = null;
let pendingBackup = null;
let sleepBlocker = null;
const icons = {};
// Session não expõe a partição, então a chave é o próprio objeto da sessão
// (session.fromPartition devolve sempre a mesma instância para a mesma partição).
const proxyCredentials = new Map(); // Session -> { user, pass }

// Gerenciador de clientes headless (Fase 1)
const headlessManager = new HeadlessManager();

const storeFile = () => path.join(app.getPath('userData'), 'digideck.json');

function applySettings() {
  const s = (state && state.settings) || {};
  if (s.preventSleep !== false) {
    if (sleepBlocker === null) sleepBlocker = powerSaveBlocker.start('prevent-app-suspension');
  } else if (sleepBlocker !== null) {
    powerSaveBlocker.stop(sleepBlocker);
    sleepBlocker = null;
  }
  if (!DEV && state) app.setLoginItemSettings({ openAtLogin: !!s.openAtLogin, args: ['--hidden'] });
}

// ---------------------------------------------------------------- janela
function send(channel, ...args) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function shortcutFor(i) {
  const k = (i.key || '').toLowerCase();
  if (k === 'f5' && !i.control && !i.alt) return i.shift ? 'reload-all' : 'reload';
  if (!i.control || i.alt || i.meta) return null;
  if (/^[1-9]$/.test(k) && !i.shift) return 'focus:' + k;
  if (k === 'tab') return i.shift ? 'prev' : 'next';
  if (k === 'pagedown') return 'screen-next';
  if (k === 'pageup') return 'screen-prev';
  if (i.shift) return k === 'r' ? 'reload-all' : null;
  return { r: 'update', g: 'view:grid', e: 'view:main', f: 'view:focus', d: 'view:dash', m: 'mute-all', n: 'add', l: 'lock', b: 'sidebar' }[k] || null;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'DigiDeck',
    icon: icons.app,
    backgroundColor: '#040b16',
    autoHideMenuBar: true,
    // Barra de título própria (desenhada pelo app); o Windows só desenha os botões _ □ X por cima.
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#081422', symbolColor: '#9cc3dc', height: 38 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
      // A interface pode dormir com a janela escondida: os timers seguem (switches acima),
      // só para de desenhar. As contas com "sempre desenhar" não dependem disso.
      backgroundThrottling: true,
      spellcheck: false,
    },
  });
  win.setMenu(null);
  // Ícone do botão na barra de tarefas do Windows. Instalado, o próprio .exe já tem a logo;
  // em desenvolvimento o .exe é o electron.exe, então gera um .ico da logo.
  if (process.platform === 'win32') {
    try {
      const appIconPath = DEV ? writeIco(path.join(app.getPath('userData'), 'taskbar.ico')) : process.execPath;
      win.setAppDetails({ appId: 'br.digideck.app', appIconPath, appIconIndex: 0 });
    } catch (err) { console.error('taskbar icon', err); }
  }
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  win.once('ready-to-show', () => {
    if (!process.argv.includes('--hidden')) win.show();
  });

  win.on('close', (e) => {
    const toTray = !state || !state.settings || state.settings.closeToTray !== false;
    if (!quitting && toTray) {
      e.preventDefault();
      win.hide();
    }
  });
  win.on('closed', () => { win = null; });

  for (const ev of ['blur', 'hide', 'minimize']) win.on(ev, () => send('win:away'));
  for (const ev of ['focus', 'show', 'restore']) win.on(ev, () => send('win:back'));
  win.on('focus', () => win.flashFrame(false));

  // Segurança das abas de jogo: nada de Node, sempre partição isolada por conta.
  win.webContents.on('will-attach-webview', (e, prefs, params) => {
    delete prefs.preload;
    prefs.nodeIntegration = false;
    prefs.nodeIntegrationInSubFrames = false;
    prefs.contextIsolation = true;
    prefs.sandbox = true;
    // Ligado: a conta fora da tela (ou com a janela escondida) para de desenhar e a página se vê
    // oculta. Timers não são segurados (switches lá em cima). "Sempre desenhar" desliga por conta (wc:keep-painting).
    prefs.backgroundThrottling = true;
    prefs.spellcheck = false;
    if (!/^persist:acc-[\w-]+$/.test(params.partition || '')) e.preventDefault();
    if (params.src && !/^https?:\/\//i.test(params.src)) e.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

function buildTray() {
  tray = new Tray(icons.tray);
  tray.setToolTip('DigiDeck');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir DigiDeck', click: showWindow },
    { label: 'Bloquear', click: () => send('shortcut', 'lock') },
    { label: 'Silenciar / ativar som de tudo', click: () => send('shortcut', 'mute-all') },
    { label: 'Recarregar todas as contas', click: () => send('shortcut', 'reload-all') },
    { type: 'separator' },
    { label: 'Sair', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', showWindow);
}

// ---------------------------------------------------------------- IPC
// Só a interface do próprio DigiDeck pode chamar o processo principal. Páginas de jogos não.
function handle(channel, fn) {
  ipcMain.handle(channel, (e, ...args) => {
    if (!win || e.sender !== win.webContents || !e.senderFrame || !e.senderFrame.url.startsWith('file://')) {
      throw new Error('origem não autorizada');
    }
    return fn(e, ...args);
  });
}

const goodPassword = (p) => typeof p === 'string' && p.length >= 8 && p.length <= 256;

function registerIpc() {
  handle('state:get', () => ({ state, locked: vault.locked, vault: vault.info(), error: loadInfo.error || null }));

  handle('state:save', (_e, s) => {
    if (vault.locked || !s || typeof s !== 'object') return false;
    state = s;
    vault.write(s);
    applySettings();
    return true;
  });

  handle('vault:unlock', async (_e, password) => {
    const s = await vault.unlock(String(password || ''));
    if (!s) return { ok: false };
    state = s;
    applySettings();
    return { ok: true, state, vault: vault.info() };
  });

  handle('vault:verify', (_e, password) => vault.verify(String(password || '')));

  handle('vault:set-password', async (_e, { current, next } = {}) => {
    if (!goodPassword(next)) return { ok: false, error: 'A senha precisa ter pelo menos 8 caracteres.' };
    const ok = await vault.setPassword(String(current || ''), next, state);
    return ok ? { ok, vault: vault.info() } : { ok, error: 'Senha atual incorreta.' };
  });

  handle('vault:remove-password', async (_e, current) => {
    const ok = await vault.removePassword(String(current || ''), state);
    return ok ? { ok, vault: vault.info() } : { ok, error: 'Senha incorreta.' };
  });

  handle('vault:reset', () => {
    vault.reset();
    state = null;
    return { ok: true, vault: vault.info() };
  });

  handle('app:info', () => ({
    version: app.getVersion(),
    dataPath: app.getPath('userData'),
    packaged: app.isPackaged,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  }));

  handle('notify', (_e, { title, body, accId } = {}) => {
    if (!Notification.isSupported()) return false;
    const n = new Notification({ title: String(title || 'DigiDeck'), body: String(body || ''), icon: icons.app, silent: true });
    n.on('click', () => { showWindow(); send('notify-click', accId || null); });
    n.show();
    return true;
  });

  handle('remote-alert', async (_e, text) => {
    const s = (state && state.settings) || {};
    const msg = String(text || '').slice(0, 1900);
    const out = {};
    if (s.discordWebhook) {
      try {
        if (!/^https:\/\/(?:\w+\.)?discord(?:app)?\.com\/api\/webhooks\//i.test(s.discordWebhook)) throw new Error('URL inválida');
        const r = await net.fetch(s.discordWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'DigiDeck', content: msg }),
        });
        out.discord = r.ok ? 'ok' : `HTTP ${r.status}`;
      } catch (err) { out.discord = String(err.message || err); }
    }
    if (s.telegramToken && s.telegramChatId) {
      try {
        if (!/^\d+:[\w-]+$/.test(s.telegramToken)) throw new Error('token inválido');
        const r = await net.fetch(`https://api.telegram.org/bot${s.telegramToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: s.telegramChatId, text: msg }),
        });
        out.telegram = r.ok ? 'ok' : `HTTP ${r.status}`;
      } catch (err) { out.telegram = String(err.message || err); }
    }
    return out;
  });

  handle('capture', async (_e, wcId, opts = {}) => {
    const wc = webContents.fromId(wcId);
    if (!wc || wc.isDestroyed() || wc.getType() !== 'webview') return null;
    try {
      const img = await wc.capturePage();
      if (img.isEmpty()) return null;
      const out = {};
      if (opts.thumb) out.thumb = 'data:image/jpeg;base64,' + img.resize({ width: Math.min(800, opts.thumb), quality: 'good' }).toJPEG(72).toString('base64');
      if (opts.hash) {
        const bmp = img.resize({ width: 32, height: 20 }).toBitmap();
        for (let i = 0; i < bmp.length; i++) bmp[i] >>= 3; // ignora ruído mínimo
        out.hash = crypto.createHash('sha1').update(bmp).digest('hex');
      }
      return out;
    } catch {
      return null;
    }
  });

  handle('metrics', (_e, list = []) => {
    const all = app.getAppMetrics();
    const byPid = new Map(all.map((p) => [p.pid, p]));
    const accounts = {};
    for (const { accId, wcId } of list) {
      const wc = webContents.fromId(wcId);
      if (!wc || wc.isDestroyed()) continue;
      const p = byPid.get(wc.getOSProcessId());
      if (p) accounts[accId] = { cpu: p.cpu.percentCPUUsage, memKB: p.memory.workingSetSize };
    }
    const total = all.reduce((t, p) => ({ cpu: t.cpu + p.cpu.percentCPUUsage, memKB: t.memKB + p.memory.workingSetSize }), { cpu: 0, memKB: 0 });
    return { accounts, total };
  });

  // Recarrega uma aba. Não usar forcefullyCrashRenderer(): seguido de qualquer navegação,
  // derruba o processo principal com FATAL/NOTREACHED (check.cc), mesmo esperando o
  // render-process-gone. Um renderer preso em loop infinito também não para com reload
  // nenhum: nesse caso o renderer recria o elemento <webview> (recreateWebview).
  handle('wc:force-reload', (_e, wcId) => {
    const wc = webContents.fromId(wcId);
    if (!wc || wc.isDestroyed() || wc.getType() !== 'webview') return false;
    try { wc.reloadIgnoringCache(); } catch { return false; }
    return true;
  });

  // Conta que precisa desenhar mesmo sem ninguém ver (jogos cuja lógica roda no requestAnimationFrame).
  handle('wc:keep-painting', (_e, wcId, on) => {
    const wc = webContents.fromId(wcId);
    if (!wc || wc.isDestroyed() || wc.getType() !== 'webview') return false;
    wc.setBackgroundThrottling(!on);
    return true;
  });

  handle('partition:clear', async (_e, partition) => {
    if (!/^persist:acc-[\w-]+$/.test(partition || '')) return false;
    const ses = session.fromPartition(partition);
    await ses.clearStorageData();
    await ses.clearCache();
    return true;
  });

  handle('proxy:apply', async (_e, partition, proxy) => {
    if (!/^persist:acc-[\w-]+$/.test(partition || '')) return false;
    try {
      const ses = session.fromPartition(partition);
      if (proxy && proxy.host && proxy.port && proxy.user && proxy.pass) {
        proxyCredentials.set(ses, { user: proxy.user, pass: proxy.pass });
        const proxyUrl = `http://${proxy.host}:${proxy.port}`;
        await ses.setProxy({ proxyRules: proxyUrl, proxyBypassRules: '<-loopback>' });
      } else {
        proxyCredentials.delete(ses);
        await ses.setProxy({ mode: 'direct' });
      }
      ses.forceReloadProxyConfig();
      return true;
    } catch (err) {
      console.error('[proxy:apply] erro ao aplicar proxy:', err);
      return false;
    }
  });

  handle('proxy:test', async (_e, proxy) => {
    if (!proxy || !proxy.host || !proxy.port) return { error: 'Host e port obrigatórios' };
    const testSession = session.fromPartition('digideck-proxy-test-' + Date.now());
    try {
      const proxyUrl = `http://${proxy.host}:${proxy.port}`;
      await testSession.setProxy({ proxyRules: proxyUrl, proxyBypassRules: '<-loopback>' });
      testSession.forceReloadProxyConfig();
      // net.request (e não net.fetch): só o ClientRequest expõe o evento 'login',
      // necessário para responder ao desafio 407 de um proxy com usuário e senha.
      const data = await new Promise((resolve, reject) => {
        const req = net.request({ url: 'https://api.ipify.org?format=json', session: testSession });
        const timer = setTimeout(() => { req.abort(); reject(new Error('tempo esgotado (15s)')); }, 15000);
        req.on('login', (authInfo, callback) => {
          if (proxy.user && proxy.pass) callback(proxy.user, proxy.pass);
          else { clearTimeout(timer); req.abort(); reject(new Error('o proxy pediu usuário e senha')); }
        });
        req.on('response', (res) => {
          let body = '';
          res.on('data', (c) => { body += c; });
          res.on('end', () => {
            clearTimeout(timer);
            if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
            try { resolve(JSON.parse(body)); } catch { reject(new Error('resposta inesperada')); }
          });
        });
        req.on('error', (err) => { clearTimeout(timer); reject(err); });
        req.end();
      });
      return { ok: true, ip: data.ip };
    } catch (err) {
      return { error: String(err.message || err).slice(0, 200) };
    } finally {
      await testSession.clearStorageData();
    }
  });

  handle('badge', (_e, n) => {
    if (!win) return;
    const count = Number(n) || 0;
    win.setOverlayIcon(count > 0 ? icons.dot : null, count > 0 ? `${count} alerta(s)` : '');
    if (tray) {
      tray.setImage(count > 0 ? icons.trayAlert : icons.tray);
      tray.setToolTip(count > 0 ? `DigiDeck · ${count} alerta(s)` : 'DigiDeck');
    }
  });

  handle('flash', () => { if (win && !win.isFocused()) win.flashFrame(true); });

  handle('backup:export', async (_e, password) => {
    if (!state) return { ok: false };
    if (!goodPassword(password)) return { ok: false, error: 'A senha do backup precisa ter pelo menos 8 caracteres.' };
    const stamp = new Date().toISOString().slice(0, 10);
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Salvar backup criptografado',
      defaultPath: `digideck-backup-${stamp}.digideck`,
      filters: [{ name: 'Backup criptografado do DigiDeck', extensions: ['digideck'] }],
    });
    if (canceled || !filePath) return { ok: false };
    const payload = { app: 'digideck', version: 2, exportedAt: new Date().toISOString(), data: state };
    fs.writeFileSync(filePath, await encryptBackup(password, payload));
    return { ok: true };
  });

  handle('backup:import', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Importar backup do DigiDeck',
      properties: ['openFile'],
      filters: [{ name: 'Backup do DigiDeck', extensions: ['digideck', 'json'] }],
    });
    if (canceled || !filePaths[0]) return null;
    try {
      const parsed = JSON.parse(fs.readFileSync(filePaths[0], 'utf8').replace(/^\uFEFF/, ''));
      if (parsed.format === 'digideck-backup') {
        pendingBackup = parsed;
        return { encrypted: true };
      }
      if (parsed.app !== 'digideck' || !parsed.data || !Array.isArray(parsed.data.accounts)) return { error: 'Esse arquivo não é um backup do DigiDeck.' };
      return { data: parsed.data, legacy: true };
    } catch (err) {
      return { error: 'Não consegui ler o arquivo: ' + err.message };
    }
  });

  handle('backup:decrypt', async (_e, password) => {
    if (!pendingBackup) return { error: 'Escolha o arquivo de novo.' };
    try {
      const payload = await decryptBackup(String(password || ''), pendingBackup);
      if (payload.app !== 'digideck' || !payload.data || !Array.isArray(payload.data.accounts)) return { error: 'Backup inválido.' };
      pendingBackup = null;
      return { data: payload.data };
    } catch {
      return { error: 'Senha incorreta ou arquivo alterado.' };
    }
  });

  handle('open-external', (_e, url) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  });

  handle('open-data-folder', () => shell.openPath(app.getPath('userData')));

  handle('app:quit', () => { quitting = true; app.quit(); });

  handle('update:status', () => updater.getStatus());
  handle('update:check', () => updater.check());
  handle('update:install', () => updater.installNow());
  handle('update:channel', (_e, c) => updater.setChannel(String(c)));

  // ---- Headless (Fase 1)
  handle('headless:start', (_e, accId, options = {}) => {
    const acc = state.accounts?.find((a) => a.id === accId);
    if (!acc) return { ok: false, error: 'Conta não encontrada' };
    const partition = `persist:acc-${accId}`;
    headlessManager.start(accId, partition, { name: acc.name, ...options });
    return { ok: true };
  });

  handle('headless:stop', (_e, accId) => {
    headlessManager.stop(accId);
    return { ok: true };
  });

  handle('headless:status', (_e, accId) => {
    return headlessManager.getStatus(accId);
  });
}

// Grava no disco os cookies de login de todas as contas.
function flushAccountCookies() {
  for (const acc of state.accounts || []) {
    if (!acc || !acc.id) continue;
    try { session.fromPartition(`persist:acc-${acc.id}`).cookies.flushStore(); } catch { /* ignora */ }
  }
}

// ---------------------------------------------------------------- boot
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);

  app.on('session-created', (ses) => {
    // Remove "Electron/x" do user agent: alguns sites bloqueiam navegadores embutidos.
    ses.setUserAgent(ses.getUserAgent().replace(/\sElectron\/\S+/, '').replace(/\sdigideck\/\S+/i, ''));
    // Jogos não precisam de câmera, microfone, localização etc.: nega tudo que não seja básico.
    const allowed = new Set(['clipboard-sanitized-write', 'fullscreen', 'pointerLock', 'notifications']);
    ses.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.has(permission)));
  });

  // Autenticação de proxy. O evento 'login' existe em app e WebContents, nunca em Session
  // (e Session não tem .partition), por isso as credenciais são achadas pela sessão do webContents.
  app.on('login', (event, contents, _details, authInfo, callback) => {
    if (!authInfo.isProxy) return; // login de site: deixa a própria página tratar
    const creds = contents && proxyCredentials.get(contents.session);
    if (!creds) return; // sem credenciais: não responde ao desafio (não vaza nada)
    event.preventDefault();
    callback(creds.user, creds.pass);
  });

  app.on('web-contents-created', (_e, contents) => {
    contents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;
      const isMain = win && contents === win.webContents;
      if (!isMain && contents.getType() !== 'webview') return;
      if (DEV && isMain && input.control && input.shift && (input.key || '').toLowerCase() === 'i') {
        contents.toggleDevTools();
        event.preventDefault();
        return;
      }
      const combo = shortcutFor(input);
      if (combo) {
        event.preventDefault();
        send('shortcut', combo);
      }
    });

    if (contents.getType() === 'webview') {
      // Pop-ups do jogo (login com Google/Discord etc.) abrem numa janela na mesma sessão da conta.
      contents.setWindowOpenHandler(({ url }) => {
        if (!/^https?:\/\//i.test(url)) return { action: 'deny' };
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 560,
            height: 760,
            autoHideMenuBar: true,
            icon: icons.app,
            backgroundColor: '#040b16',
            webPreferences: { backgroundThrottling: false, sandbox: true, contextIsolation: true, nodeIntegration: false },
          },
        };
      });
    }
  });

  app.whenReady().then(() => {
    icons.app = makeIcon(256);
    icons.tray = makeIcon(32);
    icons.trayAlert = makeIcon(32, { badge: true });
    icons.dot = makeDot(32);

    vault = new Vault(storeFile(), safeStorage);
    loadInfo = vault.load();
    state = loadInfo.state;
    if (state && loadInfo.migrated) vault.write(state); // formato antigo -> cofre criptografado
    updater = createUpdater({
      app,
      send,
      beforeInstall: () => { quitting = true; },
      log: (...a) => console.error('[update]', ...a),
    });
    registerIpc();
    applySettings();
    createWindow();
    buildTray();
    updater.init();

    // Headless manager listeners (Fase 1)
    headlessManager.on('account:update', ({ index, state }) => {
      send('headless:account:update', { index, state });
    });
    headlessManager.on('account:status', ({ index, status }) => {
      send('headless:account:status', { index, status });
    });
    headlessManager.on('account:error', ({ index, message }) => {
      send('headless:account:error', { index, message });
    });

    // Ajudante de desenvolvimento: tira um print da janela e (opcional) fecha.
    if (DEV && process.env.DIGIDECK_SHOT) {
      setTimeout(async () => {
        try {
          const img = await win.webContents.capturePage();
          fs.writeFileSync(process.env.DIGIDECK_SHOT, img.toPNG());
        } catch (err) { console.error('shot failed', err); }
        if (process.env.DIGIDECK_SHOT_QUIT) { quitting = true; app.quit(); }
      }, Number(process.env.DIGIDECK_SHOT_DELAY || 9000));
    }
  });

  // Ao sair, grava os cookies de cada conta no disco. O Chromium salva de forma
  // preguiçosa: sem este flush, um encerramento abrupto perde a sessão do jogo e
  // a conta aparece deslogada (e o modo headless fica sem como autenticar).
  app.on('before-quit', () => {
    quitting = true;
    flushAccountCookies();
  });
  // Rede de segurança: se o app cair sem passar pelo before-quit, o login mais
  // recente já está no disco (perde no máximo 5 min).
  setInterval(flushAccountCookies, 5 * 60 * 1000).unref?.();
  app.on('window-all-closed', () => app.quit());
}
