'use strict';

const $ = (id) => document.getElementById(id);

async function updateUI() {
  const p = await rift.profile.get();
  if (!p) return;

  $('#avatar').textContent = p.name ? p.name[0].toUpperCase() : '?';
  $('#avatar').style.backgroundColor = p.color || 'var(--accent)';
  $('#name').textContent = p.name;
  $('#status').textContent = p.signedIn ? 'Signed in' : 'Local Profile';
  $('#rename-input').value = p.name;
}

$('#btn-rename').onclick = async () => {
  const name = $('#rename-input').value;
  if (name) await rift.profile.rename(name);
};

$('#btn-sync').onclick = async () => {
  try {
    await rift.profile.syncNow();
    alert('Sync completed successfully');
  } catch (e) {
    alert('Sync failed: ' + e.message);
  }
};

$('#btn-signout').onclick = async () => {
  if (confirm('Are you sure you want to sign out?')) {
    const wipe = confirm('Also wipe local bookmarks and history?');
    await rift.profile.signOut(wipe);
    rift.panel.toggle('profile');
  }
};

rift.profile.onChange(updateUI);
updateUI();
