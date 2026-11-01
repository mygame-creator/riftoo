'use strict';
// Tiny zero-dependency sync server. Stores one encrypted blob per user.
// Run behind HTTPS (Caddy / nginx / Cloudflare Tunnel) in production.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = +process.env.PORT || 8787;
const DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const MAX = 5 * 1024 * 1024;
fs.mkdirSync(DIR, { recursive: true });

const eq = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

http.createServer((req, res) => {
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
  const m = /^\/v1\/blob\/([\w.@-]{3,64})$/.exec(req.url.split('?')[0]);
  if (!m) return send(404, { error: 'not found' });

  const file = path.join(DIR, m[1] + '.json');
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  let rec = null;
  try { rec = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* new user */ }
  if (rec && !eq(rec.token, token)) return send(401, { error: 'unauthorized' });

  if (req.method === 'GET') return rec ? send(200, { blob: rec.blob, updatedAt: rec.updatedAt }) : send(404, { error: 'empty' });

  if (req.method === 'PUT') {
    if (!/^[a-f0-9]{64}$/.test(token)) return send(400, { error: 'bad token' });
    const chunks = [];
    let size = 0;
    req.on('data', c => { size += c.length; if (size > MAX) req.destroy(); else chunks.push(c); });
    req.on('end', () => {
      try {
        const { blob } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (typeof blob !== 'string') throw new Error('blob');
        fs.writeFileSync(file, JSON.stringify({ token, blob, updatedAt: Date.now() }));
        send(200, { ok: true });
      } catch { send(400, { error: 'bad body' }); }
    });
    return;
  }
  send(405, { error: 'method not allowed' });
}).listen(PORT, () => console.log('Rift sync server listening on :' + PORT));
