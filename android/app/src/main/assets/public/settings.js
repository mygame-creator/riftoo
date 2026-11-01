'use strict';

const $ = (id) => document.getElementById(id);

async function renderProfiles() {
  const profiles = await rift.profiles.list(); // Need to add to preload
  const activeId = (await rift.profile.get())?.id;
  const list = $('#profile-list');
  list.innerHTML = '';

  profiles.forEach(p => {
    const card = document.createElement('div');
    card.className = 'profile-card';
    if (p.id === activeId) card.style.borderColor = 'var(--accent)';

    card.innerHTML = `
      <div class="profile-info">
        <div class="profile-avatar" style="background:${p.color}">${p.name[0].toUpperCase()}</div>
        <span>${p.name} ${p.id === activeId ? ' (Active)' : ''}</span>
      </div>
      <div class="field">
        <button class="btn" onclick="switchProfile('${p.id}')">Switch</button>
        <button class="btn btn-danger" onclick="deleteProfile('${p.id}')">Delete</button>
      </div>
    `;
    list.append(card);
  });
}

async function renderExtensions() {
  const extensions = await rift.extensions.list();
  const list = $('#ext-list');
  list.innerHTML = '';

  extensions.forEach((path, i) => {
    const item = document.createElement('div');
    item.className = 'profile-card';
    item.innerHTML = `
      <div class="profile-info">
        <span style="font-size:0.8rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:250px;">${path}</span>
      </div>
      <button class="btn btn-danger" onclick="removeExtension(${i})">Remove</button>
    `;
    list.append(item);
  });
}

window.switchProfile = async (id) => {
  await rift.profiles.switch(id);
};

window.deleteProfile = async (id) => {
  if (confirm('Delete this profile?')) {
    await rift.profiles.delete(id);
    renderProfiles();
  }
};

window.removeExtension = async (index) => {
  // Need a remove handler in main.js
  // For now, let's just reload
  alert('Extension removal not yet implemented in main.js');
};

$('#btn-create-profile').onclick = async () => {
  const name = prompt('Enter profile name:');
  if (name) {
    await rift.profiles.create({
      id: 'p_' + Date.now(),
      name: name,
      color: '#fa1e4e',
      signedIn: false
    });
    renderProfiles();
  }
};

$('#btn-load-ext').onclick = async () => {
  const path = await rift.extensions.openDir();
  if (path) {
    const res = await rift.extensions.load(path);
    if (res.ok) renderExtensions();
    else alert('Error: ' + res.error);
  }
};

$('#btn-signout').onclick = async () => {
  if (confirm('Sign out of current account?')) {
    await rift.profile.signOut(false);
    loadSettings();
  }
};

// Settings updates
$('#set-engine').onchange = () => rift.settings.set({ engine: $('#set-engine').value });
$('#set-adblock').onchange = () => rift.settings.set({ adblock: $('#set-adblock').checked });
$('#set-accent').oninput = () => rift.settings.set({ accent: $('#set-accent').value });
$('#set-syncurl').onchange = () => rift.settings.set({ syncUrl: $('#set-syncurl').value });
$('#set-syncuser').onchange = () => rift.settings.set({ syncUser: $('#set-syncuser').value });

// Nav
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    $(`#section-${btn.dataset.section}`).classList.add('active');
  }
});

async function init() {
  await loadSettings();
  await renderProfiles();
  await renderExtensions();
}

init();
