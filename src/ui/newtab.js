(async () => {
  'use strict';
  const q = document.getElementById('q');
  const dial = document.getElementById('dial');
  q.addEventListener('keydown', e => { if (e.key === 'Enter' && q.value.trim()) rift.nav('go', q.value); });

  const DEFAULTS = [
    { title: 'YouTube', url: 'https://www.youtube.com/' },
    { title: 'GitHub', url: 'https://github.com/' },
    { title: 'Reddit', url: 'https://www.reddit.com/' },
    { title: 'Wikipedia', url: 'https://www.wikipedia.org/' }
  ];

  function render(marks) {
    const items = (marks.length ? marks : DEFAULTS).slice(0, 12);
    dial.replaceChildren(...items.map(m => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      const mono = document.createElement('span');
      mono.className = 'mono';
      mono.textContent = (m.title || m.url).replace(/^https?:\/\/(www\.)?/, '').charAt(0).toUpperCase();
      const n = document.createElement('span');
      n.className = 'n';
      n.textContent = m.title || m.url;
      b.title = m.url;
      b.append(mono, n);
      b.onclick = () => rift.nav('go', m.url);
      li.append(b);
      return li;
    }));
  }
  render(await rift.bookmarks.list());
  rift.bookmarks.onChange(render);
})();
