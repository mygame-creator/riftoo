(() => {
  'use strict';
  const $ = s => document.querySelector(s);

  const PATHS = {
    logo: '<path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7z"/><path d="M9.5 8v8M9.5 8h3.5a2.2 2.2 0 0 1 0 4.4H9.5M13 12.4l2.5 3.6"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
    send: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>',
    pad: '<rect x="2" y="7" width="20" height="11" rx="4"/><path d="M7 10v5M4.5 12.5h5"/><circle cx="15.5" cy="12" r=".8"/><circle cx="18" cy="14" r=".8"/>',
    music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    play: '<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4z"/>',
    tv: '<rect x="2" y="5" width="20" height="13" rx="2"/><path d="M8 21h8"/>',
    gauge: '<path d="m12 14 4-4"/><path d="M3.3 17a9 9 0 1 1 17.4 0"/>',
    star: '<path d="m12 3 2.8 5.8 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 3 1.1-6.2L3 9.7l6.2-.9z"/>',
    back: '<path d="m15 6-6 6 6 6"/>',
    fwd: '<path d="m9 6 6 6-6 6"/>',
    reload: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    sound: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 9a4 4 0 0 1 0 6"/>'
  };
  const svg = (n, s = 20) =>
    `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[n]}</svg>`;

  const APPS = [
    { id: 'whatsapp', icon: 'chat', label: 'WhatsApp' },
    { id: 'telegram', icon: 'send', label: 'Telegram' },
    { id: 'discord', icon: 'pad', label: 'Discord' },
    { id: 'spotify', icon: 'music', label: 'Spotify' },
    { id: 'ytmusic', icon: 'play', label: 'YouTube Music' },
    { id: 'twitch', icon: 'tv', label: 'Twitch' }
  ];

  let st = { tabs: [], activeId: null, panelId: null, canBack: false, canForward: false };
  let marks = [];

  document.body.classList.add(rift.platform === 'darwin' ? 'mac' : 'other');
  document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = svg(el.dataset.icon, 18); });

  function sideButton(id, icon, label) {
    const b = document.createElement('button');
    b.className = 'sb';
    b.dataset.id = id;
    b.title = label;
    b.setAttribute('aria-label', label);
    b.innerHTML = svg(icon, 22);
    b.onclick = () => rift.panel.toggle(id);
    return b;
  }
  $('#apps').replaceChildren(...APPS.map(a => sideButton(a.id, a.icon, a.label)));
  $('#bottom').replaceChildren(
    sideButton('library', 'star', 'Bookmarks and history'),
    sideButton('gx', 'gauge', 'GX Control'),
    (function() {
      const b = document.createElement('button');
      b.className = 'sb avatar';
      b.id = 'avatar';
      b.onclick = () => rift.panel.toggle('settings');
      return b;
    })()
  );

  $('#logo').innerHTML = svg('logo', 28);
  $('#logo').onclick = () => rift.tabs.new();

  const url = $('#url');

  async function updateAvatar() {
    const p = await rift.profile.get();
    const avatar = $('#avatar');
    if (!avatar || !p) return;
    avatar.textContent = p.name ? p.name[0].toUpperCase() : '?';
    avatar.style.backgroundColor = p.color || 'var(--accent)';
  }

  rift.profile.onChange(updateAvatar);
  updateAvatar();

  function renderTabs() {
    const els = st.tabs.map(t => {
      const el = document.createElement('div');
      el.className = 'tab' + (t.id === st.activeId ? ' on' : '') + (t.discarded ? ' zz' : '');
      el.setAttribute('role', 'tab');
      el.setAttribute('aria-selected', t.id === st.activeId);
      el.title = t.discarded ? t.title + ' (sleeping)' : t.title;
      el.onmousedown = e => {
        if (e.button === 1) { e.preventDefault(); rift.tabs.close(t.id); }
        else if (e.button === 0) rift.tabs.activate(t.id);
      };

      const fav = document.createElement('span');
      fav.className = 'fav';
      if (t.loading) fav.innerHTML = '<span class="spin"></span>';
      else if (t.favicon) {
        const img = document.createElement('img');
        img.alt = '';
        img.src = t.favicon;
        img.onerror = () => { fav.innerHTML = '<span class="dot"></span>'; };
        fav.append(img);
      } else fav.innerHTML = '<span class="dot"></span>';

      const title = document.createElement('span');
      title.className = 't';
      title.textContent = t.title || 'New tab';

      const x = document.createElement('button');
      x.className = 'x';
      x.setAttribute('aria-label', 'Close tab');
      x.innerHTML = svg('x', 12);
      x.onmousedown = e => e.stopPropagation();
      x.onclick = e => { e.stopPropagation(); rift.tabs.close(t.id); };

      el.append(fav, title);
      if (t.audible) { const s = document.createElement('span'); s.innerHTML = svg('sound', 14); el.append(s); }
      el.append(x);
      return el;
    });
    const plus = document.createElement('button');
    plus.id = 'newtab';
    plus.title = 'New tab';
    plus.setAttribute('aria-label', 'New tab');
    plus.innerHTML = svg('plus', 16);
    plus.onclick = () => rift.tabs.new();
    $('#tabs').replaceChildren(...els, plus);
  }

  function render() {
    renderTabs();
    document.querySelectorAll('.sb').forEach(b => b.classList.toggle('on', b.dataset.id === st.panelId));
    $('#back').disabled = !st.canBack;
    $('#fwd').disabled = !st.canForward;
    const a = st.tabs.find(t => t.id === st.activeId);
    if (document.activeElement !== url) url.value = a ? a.url : '';
    $('#star').classList.toggle('on', !!(a && a.url && marks.some(b => b.url === a.url)));
  }

  $('#back').onclick = () => rift.nav('back');
  $('#fwd').onclick = () => rift.nav('forward');
  $('#reload').onclick = () => rift.nav('reload');
  $('#star').onclick = async () => { marks = await rift.bookmarks.toggle(); render(); };
  url.addEventListener('focus', () => url.select());
  url.addEventListener('keydown', e => {
    if (e.key === 'Enter') { rift.nav('go', url.value); url.blur(); }
    if (e.key === 'Escape') { url.blur(); render(); }
  });

  rift.tabs.onChange(s => { st = s; render(); });
  rift.bookmarks.onChange(b => { marks = b; render(); });
  rift.onFocusAddress(() => url.focus());
  Promise.all([rift.tabs.list(), rift.bookmarks.list()]).then(([s, b]) => { st = s; marks = b; render(); });
})();
