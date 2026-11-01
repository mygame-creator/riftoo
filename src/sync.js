'use strict';
// End-to-end encrypted sync. The server only ever sees an opaque blob.
// Key derivation + blob format are shared with the Android app:
//   k = PBKDF2-HMAC-SHA256(pass, "rift:" + user, 200000, 64 bytes)
//   key = k[0..32]   token = hex(SHA256(k[32..64]))
//   blob = base64( iv(12) || AES-256-GCM ciphertext || tag(16) )
const crypto = require('crypto');

function derive(user, pass) {
  const k = crypto.pbkdf2Sync(pass, 'rift:' + user, 200000, 64, 'sha256');
  return { key: k.subarray(0, 32), token: crypto.createHash('sha256').update(k.subarray(32)).digest('hex') };
}

function encrypt(key, obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return Buffer.concat([iv, ct, c.getAuthTag()]).toString('base64');
}

function decrypt(key, b64) {
  const b = Buffer.from(b64, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(0, 12));
  d.setAuthTag(b.subarray(b.length - 16));
  const pt = Buffer.concat([d.update(b.subarray(12, b.length - 16)), d.final()]);
  return JSON.parse(pt.toString('utf8'));
}

function mergeList(a, b, keyFn) {
  const m = new Map();
  for (const x of [...(b || []), ...(a || [])]) {
    const k = keyFn(x);
    const o = m.get(k);
    if (!o || (x.ts || 0) > (o.ts || 0)) m.set(k, x);
  }
  return [...m.values()].sort((x, y) => (y.ts || 0) - (x.ts || 0));
}

function merge(local, remote) {
  return {
    ...remote,
    bookmarks: mergeList(local.bookmarks, remote.bookmarks, x => x.url),
    history: mergeList(local.history, remote.history, x => x.url + '|' + x.ts).slice(0, 1000)
  };
}

async function run({ url, user, pass, local }) {
  const { key, token } = derive(user, pass);
  const base = url.replace(/\/+$/, '') + '/v1/blob/' + encodeURIComponent(user);
  const headers = { Authorization: 'Bearer ' + token };
  const signal = () => AbortSignal.timeout(15000);

  let remote = {};
  const r = await fetch(base, { headers, signal: signal() });
  if (r.status === 401) throw new Error('Wrong passphrase for this account');
  if (r.ok) remote = decrypt(key, (await r.json()).blob);
  else if (r.status !== 404) throw new Error('Server error ' + r.status);

  const merged = merge(local, remote);
  const p = await fetch(base, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ blob: encrypt(key, merged) }),
    signal: signal()
  });
  if (!p.ok) throw new Error('Push failed (' + p.status + ')');
  return merged;
}

module.exports = { run };
