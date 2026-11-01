(async () => {
  'use strict';
  const $ = s => document.querySelector(s);
  let mode = 'bookmarks';
  let marks = await rift.bookmarks.list();
  let hist = [];

  async function load() {
    if (mode === 'history') hist = await rift.history.list();
    draw();
  }

  function draw() {
    const f = $('#filter').value.toLowerCase();
    const rows = (mode === 'bookmarks' ? marks : hist).filter(x => (x.title + ' ' + x.url).toLowerCase().includes(f));
    $('#clear').hidden = mode !== 'history' || !hist.length;
    if (!rows.length) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = mode === 'bookmarks' ? 'No bookmarks yet. Press the star in the address bar to save a page.' : 'Nothing here yet.';
      $('#list').replaceChildren(p);
      return;
    }
    $('#list').replaceChildren(...rows.slice(0, 200).map(x => {
      const li = document.createElement('li');
      const open = document.createElement('button');
      open.className = 'open';
      const b = document.createElement('b');
      b.textContent = x.title || x.url;
      const u = document.createElement('span');
      u.textContent = x.url;
      open.append(b, u);
      open.onclick = () => rift.tabs.new(x.url);
      li.append(open);
      if (mode === 'bookmarks') {
        const d = document.createElement('button');
        d.className = 'del';
        d.textContent = '\u00d7';
        d.setAttribute('aria-label', 'Remove bookmark');
        d.onclick = async () => { marks = await rift.bookmarks.remove(x.url); draw(); };
        li.append(d);
      }
      return li;
    }));
  }

  function setMode(m) {
    mode = m;
    $('#tB').classList.toggle('on', m === 'bookmarks');
    $('#tH').classList.toggle('on', m === 'history');
    load();
  }
  $('#tB').onclick = () => setMode('bookmarks');
  $('#tH').onclick = () => setMode('history');
  $('#filter').oninput = draw;
  $('#clear').onclick = async () => { hist = await rift.history.clear(); draw(); };
  rift.bookmarks.onChange(b => { marks = b; draw(); });
  draw();
})();
