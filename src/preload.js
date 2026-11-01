'use strict';
// Exposed to every view, but main.js only answers IPC from file:// pages (our own UI).
const { contextBridge, ipcRenderer } = require('electron');
const inv = (c, ...a) => ipcRenderer.invoke(c, ...a);
const on = (c, f) => {
  const h = (_e, d) => f(d);
  ipcRenderer.on(c, h);
  return () => ipcRenderer.removeListener(c, h);
};

contextBridge.exposeInMainWorld('rift', {
  platform: process.platform,
  tabs: {
    list: () => inv('tabs:list'),
    new: url => inv('tabs:new', url),
    close: id => inv('tabs:close', id),
    activate: id => inv('tabs:activate', id),
    onChange: f => on('tabs', f)
  },
  nav: (action, value) => inv('nav', { action, value }),
  panel: { toggle: id => inv('panel:toggle', id) },
  bookmarks: {
    list: () => inv('bookmarks:list'),
    toggle: () => inv('bookmarks:toggle'),
    remove: url => inv('bookmarks:remove', url),
    onChange: f => on('bookmarks', f)
  },
  history: { list: () => inv('history:list'), clear: () => inv('history:clear') },
  settings: {
    get: () => inv('settings:get'),
    set: patch => inv('settings:set', patch),
    onChange: f => on('settings', f)
  },
  profile: {
    get: () => inv('profile:get'),
    signOut: wipe => inv('profile:signout', wipe),
    rename: name => inv('profile:rename', name),
    syncNow: () => inv('profile:syncnow'),
    onChange: f => on('profile', f)
  },
  profiles: {
    list: () => inv('profiles:list'),
    create: p => inv('profiles:create', p),
    switch: id => inv('profiles:switch', id),
    delete: id => inv('profiles:delete', id)
  },
  extensions: {
    load: () => inv('extensions:load'),
    list: () => inv('extensions:list'),
    openDir: () => inv('dialog:openDirectory')
  },
  stats: () => inv('gx:stats'),
  sync: opts => inv('sync:run', opts),
  onFocusAddress: f => on('focus-address', f)
});
