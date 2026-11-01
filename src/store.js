'use strict';
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const DEFAULT_SETTINGS = {
  accent: '#fa1e4e',
  engine: 'google',
  limiter: true,
  limiterMinutes: 10,
  ramCapMB: 0,
  adblock: true,
  syncUrl: '',
  syncUser: ''
};

let data = null;
let timer = null;
const file = () => path.join(app.getPath('userData'), 'rift-data.json');

function get() {
  if (data) return data;
  try {
    data = JSON.parse(fs.readFileSync(file(), 'utf8'));
  } catch {
    data = {};
  }
  data.bookmarks = data.bookmarks && typeof data.bookmarks === 'object' && !Array.isArray(data.bookmarks)
    ? data.bookmarks
    : {};
  data.history = data.history && typeof data.history === 'object' && !Array.isArray(data.history)
    ? data.history
    : {};
  data.session = Array.isArray(data.session) ? data.session : [];
  data.profiles = Array.isArray(data.profiles) ? data.profiles : [];
  data.activeProfileId = data.activeProfileId || (data.profiles[0] ? data.profiles[0].id : null);
  data.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
  return data;
}

function getActiveProfile() {
  const d = get();
  return d.profiles.find(p => p.id === d.activeProfileId) || null;
}

function setProfile(p) {
  const d = get();
  const idx = d.profiles.findIndex(x => x.id === p.id);
  if (idx >= 0) d.profiles[idx] = p;
  else d.profiles.push(p);
  d.activeProfileId = p.id;
  save();
}

function switchProfile(id) {
  get().activeProfileId = id;
  save();
}

function getProfile(id) {
  return get().profiles.find(p => p.id === id);
}

function flush() {
  clearTimeout(timer);
  try { fs.writeFileSync(file(), JSON.stringify(get())); } catch (e) { console.error('store write failed', e); }
}

function save() {
  clearTimeout(timer);
  timer = setTimeout(flush, 400);
}

module.exports = { get, save, flush, getActiveProfile, setProfile, switchProfile, getProfile, DEFAULT_SETTINGS };
