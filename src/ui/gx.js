(async () => {
  'use strict';
  const $ = s => document.querySelector(s);
  const COLORS = ['#fa1e4e', '#8b5cf6', '#22d3ee', '#a3e635', '#fb923c'];

  const s = await rift.settings.get();
  $('#limiter').checked = s.limiter;
  $('#minutes').value = s.limiterMinutes;
  $('#cap').value = s.ramCapMB;
  $('#adblock').checked = s.adblock;
  $('#engine').value = s.engine;
  $('#sUrl').value = s.syncUrl;
  $('#sUser').value = s.syncUser;

  const num = (el, min, max) => Math.min(max, Math.max(min, parseInt(el.value, 10) || 0));
  $('#limiter').onchange = e => rift.settings.set({ limiter: e.target.checked });
  $('#minutes').onchange = e => rift.settings.set({ limiterMinutes: num(e.target, 1, 240) });
  $('#cap').onchange = e => rift.settings.set({ ramCapMB: num(e.target, 0, 65536) });
  $('#adblock').onchange = e => rift.settings.set({ adblock: e.target.checked });
  $('#engine').onchange = e => rift.settings.set({ engine: e.target.value });

  const sw = $('#swatches');
  function drawSwatches(cur) {
    sw.replaceChildren(...COLORS.map(c => {
      const b = document.createElement('button');
      b.className = 'sw' + (c === cur ? ' on' : '');
      b.style.background = c;
      b.setAttribute('aria-label', 'Accent ' + c);
      b.onclick = () => rift.settings.set({ accent: c });
      return b;
    }));
  }
  drawSwatches(s.accent);
  rift.settings.onChange(n => drawSwatches(n.accent));

  $('#sBtn').onclick = async () => {
    const msg = $('#sMsg');
    msg.className = 'msg';
    msg.textContent = 'Syncing...';
    $('#sBtn').disabled = true;
    const r = await rift.sync({ url: $('#sUrl').value.trim(), user: $('#sUser').value.trim(), pass: $('#sPass').value });
    $('#sBtn').disabled = false;
    if (r.ok) { msg.className = 'msg ok'; msg.textContent = 'Synced. ' + r.bookmarks + ' bookmarks on this device.'; $('#sPass').value = ''; }
    else { msg.className = 'msg err'; msg.textContent = r.error; }
  };

  async function poll() {
    const t = await rift.stats();
    $('#memT').textContent = t.memMB + ' MB of ' + t.totalMemMB + ' MB';
    $('#memB').style.width = Math.min(100, (t.memMB / t.totalMemMB) * 100) + '%';
    $('#cpuT').textContent = t.cpu + '%';
    $('#cpuB').style.width = Math.min(100, t.cpu) + '%';
    $('#tabT').textContent = t.tabs + ' open, ' + t.sleeping + ' sleeping';
  }
  poll();
  setInterval(poll, 2000);
})();
