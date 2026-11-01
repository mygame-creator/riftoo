'use strict';
const { app, BrowserWindow, WebContentsView, ipcMain, Menu, session, safeStorage, dialog } = require('electron');
const path = require('path');
const os = require('os');
const { pathToFileURL } = require('url');
const store = require('./store');
const sync = require('./sync');

// Look like plain Chrome to websites (WhatsApp Web & co. reject "Electron").
app.userAgentFallback = app.userAgentFallback.replace(/ Electron\/\S+/, '').replace(/ rift-browser\/\S+/, '');

const UI = path.join(__dirname, 'ui');
const UI_URL = pathToFileURL(UI).href;
const PRELOAD = path.join(__dirname, 'preload.js');
const PARTITION = 'persist:rift';
const SIDEBAR = 60, TOP = 84, PANEL_W = 380;

const PANELS = {
  gx: { file: 'gx.html' },
  library: { file: 'library.html' },
  profile: { file: 'profile.html' },
  settings: { file: 'settings.html' },
  whatsapp: { url: 'https://web.whatsapp.com/' },
  telegram: { url: 'https://web.telegram.org/a/' },
  discord: { url: 'https://discord.com/app' },
  spotify: { url: 'https://open.spotify.com/' },
  ytmusic: { url: 'https://music.youtube.com/' },
  twitch: { url: 'https://www.twitch.tv/' }
};

const AD_HOSTS = [
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'adservice.google.com',
  'taboola.com', 'outbrain.com', 'adnxs.com', 'criteo.com', 'criteo.net', 'scorecardresearch.com',
  'amazon-adsystem.com', 'pubmatic.com', 'rubiconproject.com', 'openx.net', 'adsrvr.org',
  'moatads.com', 'quantserve.com', 'hotjar.com', 'mixpanel.com'
];

const SEARCH = {
  google: 'https://www.google.com/search?q=',
  duckduckgo: 'https://duckduckgo.com/?q=',
  bing: 'https://www.bing.com/search?q=',
  brave: 'https://search.brave.com/search?q='
};

let win = null;
const tabs = new Map();
let activeId = null;
let nextId = 1;
let panel = null; // { id, view }
const readySessions = new Set();

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
app.on('second-instance', (_e, argv) => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
  const u = argv.find(a => /^https?:\/\//i.test(a));
  if (u) newTab(u);
});

/* ---------- helpers ---------- */
const settings = () => store.get().settings;
const activeTab = () => tabs.get(activeId);
const alive = wc => wc && !wc.isDestroyed();

function broadcast(channel, data) {
  const targets = [win && win.webContents, panel && panel.view.webContents, ...[...tabs.values()].map(t => t.view && t.view.webContents)];
  for (const wc of targets) if (alive(wc)) wc.send(channel, data);
}

function resolveInput(input) {
  input = String(input || '').trim();
  if (!input) return '';
  if (/^https?:\/\//i.test(input)) return input;
  if (!/\s/.test(input) && /^(localhost|\d{1,3}(\.\d{1,3}){3}|[\w-]+(\.[\w-]+)+)(:\d+)?([/?#].*)?$/i.test(input)) return 'https://' + input;
  return (SEARCH[settings().engine] || SEARCH.google) + encodeURIComponent(input);
}

// Only our own file:// UI may talk to the main process.
function handle(channel, fn) {
  ipcMain.handle(channel, (e, ...args) => {
    const url = (e.senderFrame && e.senderFrame.url) || '';
    if (!url.startsWith(UI_URL)) throw new Error('Blocked');
    return fn(e, ...args);
  });
}

function memMB() {
  return app.getAppMetrics().reduce((s, p) => s + p.memory.workingSetSize, 0) / 1024;
}

/* ---------- sessions ---------- */
function setupSession(part, allowMedia) {
  if (readySessions.has(part)) return;
  readySessions.add(part);
  const ses = session.fromPartition(part);
  const ok = new Set(['fullscreen', 'notifications', 'clipboard-sanitized-write', ...(allowMedia ? ['media'] : [])]);
  ses.setPermissionRequestHandler((_wc, perm, cb) => cb(ok.has(perm)));
  ses.setPermissionCheckHandler((_wc, perm) => ok.has(perm));
  if (part === PARTITION) {
    ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (d, cb) => {
      if (settings().adblock) {
        try {
          const h = new URL(d.url).hostname;
          if (AD_HOSTS.some(b => h === b || h.endsWith('.' + b))) return cb({ cancel: true });
        } catch { /* ignore */ }
      }
      cb({});
    });
  }
}

/* ---------- layout ---------- */
function layout() {
  if (!win || win.isDestroyed()) return;
  const [w, h] = win.getContentSize();
  const pw = panel ? PANEL_W : 0;
  const x = SIDEBAR + pw;
  const t = activeTab();
  if (t && t.view) t.view.setBounds({ x, y: TOP, width: Math.max(0, w - x), height: Math.max(0, h - TOP) });
  if (panel) panel.view.setBounds({ x: SIDEBAR, y: TOP, width: pw, height: Math.max(0, h - TOP) });
}

/* ---------- tabs ---------- */
function bootstrapTabs() {
  const saved = store.get().session;
  if (saved.length) saved.forEach((u, i) => newTab(u, i === 0));
  else newTab();
}

function snapshot() {
  const t = activeTab();
  const wc = t && t.view && t.view.webContents;
  return {
    tabs: [...tabs.values()].map(x => ({
      id: x.id, title: x.title, url: x.url, favicon: x.favicon, loading: x.loading, discarded: x.discarded,
      audible: !!(x.view && alive(x.view.webContents) && x.view.webContents.isCurrentlyAudible())
    })),
    activeId,
    panelId: panel ? panel.id : null,
    canBack: !!(alive(wc) && wc.navigationHistory.canGoBack()),
    canForward: !!(alive(wc) && wc.navigationHistory.canGoForward())
  };
}

function pushTabs() {
  if (win && !win.isDestroyed()) win.webContents.send('tabs', snapshot());
}

function addHistory(url, title) {
  const d = store.get();
  const pid = d.activeProfileId;
  if (!pid) return;
  if (!d.history[pid]) d.history[pid] = [];
  const h = d.history[pid];
  if (h[0] && h[0].url === url) h[0].title = title || h[0].title;
  else h.unshift({ url, title: title || url, ts: Date.now() });
  if (h.length > 1000) h.length = 1000;
  store.save();
}

function wire(tab) {
  const wc = tab.view.webContents;
  wc.on('page-title-updated', (_e, t) => { tab.title = t; pushTabs(); });
  wc.on('page-favicon-updated', (_e, f) => { tab.favicon = f[0] || ''; pushTabs(); });
  wc.on('did-start-loading', () => { tab.loading = true; pushTabs(); });
  wc.on('did-stop-loading', () => {
    tab.loading = false;
    if (tab.url) addHistory(tab.url, wc.getTitle());
    pushTabs();
  });
  wc.on('audio-state-changed', pushTabs);
  const nav = () => {
    const u = wc.getURL();
    tab.url = u.startsWith('file:') ? '' : u;
    if (!tab.url) tab.favicon = '';
    pushTabs();
  };
  wc.on('did-navigate', nav);
  wc.on('did-navigate-in-page', nav);
  wc.on('will-navigate', (e, u) => {
    if (u.startsWith('file:') ? !u.startsWith(UI_URL) : !/^https?:/i.test(u)) e.preventDefault();
  });
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) newTab(url);
    return { action: 'deny' };
  });
  wc.on('context-menu', (_e, p) => {
    const items = [];
    if (/^https?:/i.test(p.linkURL || '')) items.push({ label: 'Open link in new tab', click: () => newTab(p.linkURL, false) });
    if (p.selectionText) items.push({ role: 'copy' });
    if (p.isEditable) items.push({ role: 'paste' });
    items.push({ label: 'Inspect', click: () => wc.inspectElement(p.x, p.y) });
    Menu.buildFromTemplate(items).popup({ window: win });
  });
}

function attach(tab) {
  const view = new WebContentsView({
    webPreferences: { partition: PARTITION, preload: PRELOAD, contextIsolation: true, sandbox: true }
  });
  tab.view = view;
  tab.discarded = false;
  wire(tab);
  win.contentView.addChildView(view);
  view.setVisible(false);
  const wc = view.webContents;
  if (tab.url) wc.loadURL(tab.url).catch(() => {});
  else wc.loadFile(path.join(UI, 'newtab.html'));
}

function newTab(url, activateIt = true) {
  const id = nextId++;
  const tab = { id, url: url || '', title: 'New tab', favicon: '', loading: false, view: null, discarded: false, lastActive: Date.now() };
  tabs.set(id, tab);
  attach(tab);
  if (activateIt) activate(id); else pushTabs();
  return id;
}

function activate(id) {
  const t = tabs.get(id);
  if (!t) return;
  if (t.discarded) attach(t);
  for (const o of tabs.values()) if (o.view) o.view.setVisible(o.id === id);
  activeId = id;
  t.lastActive = Date.now();
  layout();
  t.view.webContents.focus();
  pushTabs();
}

function destroyView(t) {
  if (!t.view) return;
  if (win && !win.isDestroyed()) win.contentView.removeChildView(t.view);
  if (alive(t.view.webContents)) t.view.webContents.close();
  t.view = null;
}

function discard(t) {
  if (!t.view || t.id === activeId) return;
  destroyView(t);
  t.discarded = true;
  t.loading = false;
  pushTabs();
}

function closeTab(id) {
  const t = tabs.get(id);
  if (!t) return;
  const ids = [...tabs.keys()];
  const idx = ids.indexOf(id);
  destroyView(t);
  tabs.delete(id);
  if (tabs.size === 0) { newTab(); return; }
  if (activeId === id) activate(ids[idx + 1] ?? ids[idx - 1]);
  else pushTabs();
}

function cycle(dir) {
  const ids = [...tabs.keys()];
  if (ids.length < 2) return;
  activate(ids[(ids.indexOf(activeId) + dir + ids.length) % ids.length]);
}

/* ---------- docked side panel ---------- */
function closePanel() {
  if (!panel) return;
  win.contentView.removeChildView(panel.view);
  if (alive(panel.view.webContents)) panel.view.webContents.close();
  panel = null;
  layout();
  pushTabs();
}

function togglePanel(id) {
  if (panel && panel.id === id) { closePanel(); return; }
  closePanel();
  const def = PANELS[id];
  if (!def) return;
  const local = !!def.file;
  const part = local ? undefined : 'persist:app-' + id;
  if (part) setupSession(part, true);
  const view = new WebContentsView({
    webPreferences: { partition: part, preload: PRELOAD, contextIsolation: true, sandbox: true }
  });
  panel = { id, view };
  win.contentView.addChildView(view);
  const wc = view.webContents;
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) newTab(url);
    return { action: 'deny' };
  });
  if (local) wc.loadFile(path.join(UI, def.file));
  else wc.loadURL(def.url).catch(() => {});
  layout();
  pushTabs();
}

/* ---------- IPC ---------- */
handle('tabs:list', () => snapshot());
handle('tabs:new', (_e, url) => newTab(url ? resolveInput(url) : ''));
handle('tabs:close', (_e, id) => closeTab(id));
handle('tabs:activate', (_e, id) => activate(id));
handle('panel:toggle', (_e, id) => togglePanel(id));

function navigate(action, value) {
  const t = activeTab();
  if (!t || !t.view) return;
  const wc = t.view.webContents;
  const h = wc.navigationHistory;
  if (action === 'back' && h.canGoBack()) h.goBack();
  else if (action === 'forward' && h.canGoForward()) h.goForward();
  else if (action === 'reload') wc.reload();
  else if (action === 'go') {
    const u = resolveInput(value);
    if (u) wc.loadURL(u).catch(() => {});
  }
}
handle('nav', (_e, { action, value }) => navigate(action, value));

handle('profile:get', () => store.getActiveProfile());

handle('profiles:list', () => store.get().profiles);

handle('profiles:switch', (_e, id) => {
  store.switchProfile(id);
  broadcast('profile', store.getActiveProfile());
  win.loadFile(path.join(UI, 'index.html'));
  win.webContents.once('did-finish-load', bootstrapTabs);
  return { ok: true };
});

handle('profiles:create', (_e, p) => {
  store.setProfile(p);
  broadcast('profile', store.getActiveProfile());
  return { ok: true };
});

handle('profiles:delete', (_e, id) => {
  const d = store.get();
  d.profiles = d.profiles.filter(p => p.id !== id);
  if (d.activeProfileId === id) {
    d.activeProfileId = d.profiles[0]?.id || null;
  }
  store.save();
  broadcast('profile', store.getActiveProfile());
  return { ok: true };
});

handle('profile:signin', async (_e, { url, user, pass }) => {
  if (!syncAllowed(url)) throw new Error('Server must use https:// (http:// is only allowed for localhost)');
  if (!user || !pass) throw new Error('Enter a username and passphrase');
  try {
    const merged = await runSync(url, user, pass);
    const s = settings();
    s.syncUrl = url;
    s.syncUser = user;
    if (safeStorage.isEncryptionAvailable()) store.get().syncPass = safeStorage.encryptString(pass).toString('base64');
    store.setProfile({ id: user, name: user, color: s.accent, signedIn: true });
    store.save();
    broadcast('settings', s);
    broadcast('profile', store.getProfile());
    win.loadFile(path.join(UI, 'index.html'));
    win.webContents.once('did-finish-load', bootstrapTabs);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

handle('profile:local', (_e, name) => {
  store.setProfile({ id: 'local', name: name || 'User', color: settings().accent, signedIn: false });
  broadcast('profile', store.getProfile());
  win.loadFile(path.join(UI, 'index.html'));
  win.webContents.once('did-finish-load', bootstrapTabs);
  return { ok: true };
});

handle('profile:signout', (_e, wipe) => {
  const d = store.get();
  delete d.syncPass;
  const s = settings();
  s.syncUrl = '';
  s.syncUser = '';
  store.get().profile = { ...store.getProfile(), signedIn: false };
  if (wipe) {
    d.bookmarks = [];
    d.history = [];
  }
  store.save();
  broadcast('settings', s);
  broadcast('profile', store.getProfile());
  win.loadFile(path.join(UI, 'welcome.html'));
  return { ok: true };
});

handle('profile:rename', (_e, name) => {
  const p = store.getProfile();
  if (p) {
    p.name = name;
    store.setProfile(p);
    broadcast('profile', p);
  }
  return store.getProfile();
});

handle('profile:syncnow', async () => {
  const s = settings();
  const d = store.get();
  if (!s.syncUrl || !s.syncUser || !d.syncPass || !safeStorage.isEncryptionAvailable()) throw new Error('Not signed in');
  return await runSync(s.syncUrl, s.syncUser, safeStorage.decryptString(Buffer.from(d.syncPass, 'base64')));
});

handle('dialog:openDirectory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  return result.filePaths[0] || null;
});

handle('extensions:load', async (_e, path) => {
  try {
    await session.defaultSession.loadExtension(path, { allowFileAccessFromFonts: true });
    const d = store.get();
    if (!d.extensions) d.extensions = [];
    if (!d.extensions.includes(path)) d.extensions.push(path);
    store.save();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

handle('extensions:list', () => store.get().extensions || []);

function toggleBookmark() {
  const t = activeTab();
  const d = store.get();
  const pid = d.activeProfileId;
  if (!pid) return d.bookmarks;
  if (!d.bookmarks[pid]) d.bookmarks[pid] = [];
  const b = d.bookmarks[pid];
  if (t && t.url) {
    const i = b.findIndex(x => x.url === t.url);
    if (i >= 0) b.splice(i, 1);
    else b.unshift({ url: t.url, title: t.title || t.url, ts: Date.now() });
    store.save();
    broadcast('bookmarks', b);
  }
  return b;
}
handle('bookmarks:list', () => {
  const d = store.get();
  const pid = d.activeProfileId;
  return (pid && d.bookmarks[pid]) || [];
});
handle('bookmarks:toggle', () => toggleBookmark());
handle('bookmarks:remove', (_e, url) => {
  const d = store.get();
  const pid = d.activeProfileId;
  if (!pid || !d.bookmarks[pid]) return [];
  d.bookmarks[pid] = d.bookmarks[pid].filter(x => x.url !== url);
  store.save();
  broadcast('bookmarks', d.bookmarks[pid]);
  return d.bookmarks[pid];
});
handle('history:list', () => {
  const d = store.get();
  const pid = d.activeProfileId;
  return (pid && d.history[pid]) ? d.history[pid].slice(0, 300) : [];
});
handle('history:clear', () => {
  const d = store.get();
  const pid = d.activeProfileId;
  if (pid) d.history[pid] = [];
  store.save();
  return [];
});

handle('settings:get', () => settings());
handle('settings:set', (_e, patch) => {
  const s = settings();
  for (const k of Object.keys(store.DEFAULT_SETTINGS)) {
    if (patch && k in patch && typeof patch[k] === typeof store.DEFAULT_SETTINGS[k]) s[k] = patch[k];
  }
  store.save();
  broadcast('settings', s);
  return s;
});

handle('gx:stats', () => {
  const m = app.getAppMetrics();
  const cpu = m.reduce((a, p) => a + p.cpu.percentCPUUsage, 0) / os.cpus().length;
  return {
    cpu: Math.round(cpu * 10) / 10,
    memMB: Math.round(memMB()),
    totalMemMB: Math.round(os.totalmem() / 1048576),
    tabs: tabs.size,
    sleeping: [...tabs.values()].filter(t => t.discarded).length
  };
});

/* ---------- sync ---------- */
function syncAllowed(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname));
  } catch { return false; }
}

async function runSync(url, user, pass) {
  const d = store.get();
  const merged = await sync.run({ url, user, pass, local: { bookmarks: d.bookmarks, history: d.history.slice(0, 500) } });
  d.bookmarks = merged.bookmarks;
  d.history = merged.history;
  store.save();
  broadcast('bookmarks', d.bookmarks);
  return merged;
}

handle('sync:run', async (_e, { url, user, pass }) => {
  if (!syncAllowed(url)) return { ok: false, error: 'Server must use https:// (http:// is only allowed for localhost)' };
  if (!user || !pass) return { ok: false, error: 'Enter a username and passphrase' };
  try {
    const merged = await runSync(url, user, pass);
    const s = settings();
    s.syncUrl = url;
    s.syncUser = user;
    if (safeStorage.isEncryptionAvailable()) store.get().syncPass = safeStorage.encryptString(pass).toString('base64');
    store.save();
    broadcast('settings', s);
    return { ok: true, bookmarks: merged.bookmarks.length };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Background sync every 10 minutes once the user has synced once.
setInterval(async () => {
  const s = settings();
  const d = store.get();
  if (!s.syncUrl || !s.syncUser || !d.syncPass || !safeStorage.isEncryptionAvailable() || !syncAllowed(s.syncUrl)) return;
  try { await runSync(s.syncUrl, s.syncUser, safeStorage.decryptString(Buffer.from(d.syncPass, 'base64'))); } catch { /* retry later */ }
}, 10 * 60 * 1000);

/* ---------- memory limiter (tab sleeping) ---------- */
setInterval(() => {
  const s = settings();
  if (!s.limiter) return;
  const now = Date.now();
  const idle = [...tabs.values()]
    .filter(t => t.id !== activeId && t.view && t.url && alive(t.view.webContents) && !t.view.webContents.isCurrentlyAudible())
    .sort((a, b) => a.lastActive - b.lastActive);
  for (const t of idle) if (now - t.lastActive > s.limiterMinutes * 60000) discard(t);
  if (s.ramCapMB > 0 && memMB() > s.ramCapMB) {
    const victim = idle.find(t => t.view);
    if (victim) discard(victim);
  }
}, 10000);

/* ---------- window + menu ---------- */
function createWindow() {
  win = new BrowserWindow({
    width: 1360, height: 860, minWidth: 800, minHeight: 520,
    backgroundColor: '#0b0b10',
    title: 'Rift',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0b0b10', symbolColor: '#f1f1f5', height: 38 },
    trafficLightPosition: { x: 8, y: 12 },
    webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true }
  });
  win.loadFile(path.join(UI, 'index.html'));
  win.on('resize', layout);
  win.on('closed', () => { win = null; });
  win.webContents.once('did-finish-load', bootstrapTabs);
}

function buildMenu() {
  const mac = process.platform === 'darwin';
  const zoom = d => {
    const t = activeTab();
    if (t && t.view) { const wc = t.view.webContents; wc.setZoomLevel(d === 0 ? 0 : wc.getZoomLevel() + d); }
  };
  const tpl = [
    ...(mac ? [{ role: 'appMenu' }] : []),
    {
      label: 'Browser',
      submenu: [
        { label: 'New tab', accelerator: 'CmdOrCtrl+T', click: () => newTab() },
        { label: 'Close tab', accelerator: 'CmdOrCtrl+W', click: () => closeTab(activeId) },
        { label: 'Address bar', accelerator: 'CmdOrCtrl+L', click: () => { win.webContents.focus(); win.webContents.send('focus-address'); } },
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => navigate('reload') },
        { label: 'Back', accelerator: 'Alt+Left', click: () => navigate('back') },
        { label: 'Forward', accelerator: 'Alt+Right', click: () => navigate('forward') },
        { label: 'Next tab', accelerator: 'Ctrl+Tab', click: () => cycle(1) },
        { label: 'Previous tab', accelerator: 'Ctrl+Shift+Tab', click: () => cycle(-1) },
        { label: 'Bookmark page', accelerator: 'CmdOrCtrl+D', click: () => toggleBookmark() },
        { label: 'GX Control', accelerator: 'CmdOrCtrl+Shift+G', click: () => togglePanel('gx') },
        { label: 'Zoom in', accelerator: 'CmdOrCtrl+=', click: () => zoom(0.5) },
        { label: 'Zoom out', accelerator: 'CmdOrCtrl+-', click: () => zoom(-0.5) },
        { label: 'Reset zoom', accelerator: 'CmdOrCtrl+0', click: () => zoom(0) },
        { label: 'Developer tools', accelerator: 'F12', click: () => { const t = activeTab(); if (t && t.view) t.view.webContents.openDevTools({ mode: 'detach' }); } },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    { role: 'editMenu' }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

app.whenReady().then(() => {
  setupSession(PARTITION, false);

  const d = store.get();
  if (d.extensions) {
    d.extensions.forEach(path => {
      session.defaultSession.loadExtension(path, { allowFileAccessFromFonts: true }).catch(() => {});
    });
  }

  const p = store.getProfile();
  const s = settings();
  if (p && p.signedIn && s.syncUrl && s.syncUser && d.syncPass && safeStorage.isEncryptionAvailable() && syncAllowed(s.syncUrl)) {
    runSync(s.syncUrl, s.syncUser, safeStorage.decryptString(Buffer.from(d.syncPass, 'base64'))).catch(() => {});
  }

  if (store.get().profiles.length === 0) {
    store.setProfile({
      id: 'default',
      name: 'User',
      color: '#fa1e4e',
      signedIn: false
    });
  }

  createWindow();
  buildMenu();
});

app.on('before-quit', () => {
  store.get().session = [...tabs.values()].filter(t => t.url).map(t => t.url);
  store.flush();
});
app.on('window-all-closed', () => app.quit());
