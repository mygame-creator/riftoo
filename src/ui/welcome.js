'use strict';

const $ = (id) => document.getElementById(id);
const err = $('#error');

const state = {
  url: '',
  user: '',
  pass: '',
  localName: ''
};

function showView(viewId) {
  const views = document.querySelectorAll('.view');
  const target = $(viewId);

  views.forEach(v => {
    v.classList.remove('active', 'prev');
    if (v === target) {
      v.classList.add('active');
    } else if (v.id === (viewId === 'view-step2' ? 'view-step1' :
                         viewId === 'view-local' ? 'view-step1' : '')) {
      v.classList.add('prev');
    }
  });
  err.textContent = '';
}

$('#btn-next').onclick = () => {
  state.url = $('#url').value;
  state.user = $('#user').value.trim();

  if (!state.user) {
    err.textContent = 'Please enter your username';
    return;
  }

  $('#display-user').textContent = state.user;
  showView('view-step2');
};

$('#btn-signin').onclick = async () => {
  err.textContent = '';
  state.pass = $('#pass').value;

  if (!state.pass) {
    err.textContent = 'Please enter your passphrase';
    return;
  }

  const res = await rift.profile.signIn({
    url: state.url,
    user: state.user,
    pass: state.pass
  });

  if (res && res.ok === false) {
    err.textContent = res.error || 'Sign in failed';
  }
};

$('#btn-back').onclick = () => {
  showView('view-step1');
};

$('#link-local').onclick = () => {
  showView('view-local');
};

$('#btn-local-back').onclick = () => {
  showView('view-step1');
};

$('#btn-local').onclick = async () => {
  err.textContent = '';
  const name = $('#local-name').value.trim();
  if (!name) {
    err.textContent = 'Please enter a display name';
    return;
  }
  await rift.profile.local(name);
};
