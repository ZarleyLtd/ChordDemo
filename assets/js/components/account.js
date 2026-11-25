/* User accounts (Connect-style): handle + password on any device, one-time invite codes to register,
   admin-issued reset codes for forgotten passwords. Accounts are regular users or admins; admins can
   issue invite and reset codes and change other accounts' type. Guests can use the whole player.
   Session: token + account summary in localStorage, restored with whoAmI on load. */
window.Account = (function () {
  const TOKEN_KEY = 'stomper:sessionToken';
  const ACCOUNT_KEY = 'stomper:account';
  const EVENT = 'stomper-session-changed';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  /** Brief message next to el. The shared helper appends to <body>, which sits under an open modal
   *  dialog's top layer, so move it into the dialog (it is position: fixed, so it stays in place). */
  function brief(text, el, opts) {
    window.BriefMessage.show(text, el, opts);
    const dlg = el && el.closest('dialog[open]');
    const msgs = document.body.querySelectorAll(':scope > .brief-message');
    if (dlg && msgs.length) dlg.appendChild(msgs[msgs.length - 1]);
  }

  // ---------------------------------------------------------------- session
  function token() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
  }
  function account() {
    try {
      const a = JSON.parse(localStorage.getItem(ACCOUNT_KEY));
      return a && a.handle ? a : null;
    } catch { return null; }
  }
  const isSignedIn = () => !!(token() && account());
  const isAdmin = () => isSignedIn() && !!account().isAdmin;

  function changed() {
    refreshButton();
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { account: isSignedIn() ? account() : null } }));
  }
  function store(tok, acct) {
    try {
      if (tok) localStorage.setItem(TOKEN_KEY, tok);
      localStorage.setItem(ACCOUNT_KEY, JSON.stringify(acct));
    } catch { /* storage unavailable: the session lasts until reload */ }
    changed();
  }
  function clearLocal() {
    try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(ACCOUNT_KEY); } catch { /* ignore */ }
    changed();
  }

  /** Call an action that needs the session; a 401 means the session is gone, so drop it. */
  async function call(action, data) {
    try {
      return await window.StomperApi.post(action, Object.assign({ token: token() }, data));
    } catch (err) {
      if (err.status === 401) {
        clearLocal();
        $('accountDlg').close();
        openConnect('', 'Your session has expired. Connect again.');
      }
      throw err;
    }
  }

  async function restore() {
    if (!token()) { clearLocal(); return; }
    try {
      const r = await window.StomperApi.post('whoAmI', { token: token() });
      store(null, r.account);
    } catch (err) {
      if (err.status === 401) clearLocal(); // expired or disabled; offline keeps the stored session
    }
  }

  function signOut() {
    const tok = token();
    clearLocal();
    if (tok) window.StomperApi.post('signOut', { token: tok }).catch(() => {});
  }

  function refreshButton() {
    const a = isSignedIn() ? account() : null;
    const btn = $('accountBtn');
    const label = a ? `${a.handle} (${a.isAdmin ? 'Admin' : 'User'}): account` : 'Connect';
    btn.classList.toggle('signed-in', !!a);
    btn.setAttribute('aria-label', label);
    btn.title = label;
  }

  // ---------------------------------------------------------------- dialogs
  function setMsg(id, text, kind) {
    const el = $(id);
    el.textContent = text || '';
    el.hidden = !text;
    el.className = 'acct-msg' + (kind ? ' ' + kind : '');
  }

  function openConnect(handle, notice) {
    setMsg('connectMsg', notice || '', notice ? 'ok' : '');
    $('connectPassword').value = '';
    if (handle) $('connectHandle').value = handle;
    $('connectDlg').showModal();
    (handle ? $('connectPassword') : $('connectHandle')).focus();
  }

  function openRegister() {
    setMsg('registerMsg', '');
    $('registerDlg').showModal();
    $('registerCode').focus();
  }

  function openReset(handle) {
    setMsg('resetMsg', '');
    if (handle) $('resetHandle').value = handle;
    $('resetDlg').showModal();
    (handle ? $('resetCode') : $('resetHandle')).focus();
  }

  function openAccount() {
    const a = account();
    $('accountHandle').textContent = a.handle;
    $('accountType').textContent = a.isAdmin ? 'Admin' : 'User';
    $('accountType').classList.toggle('admin', !!a.isAdmin);
    $('adminPanel').hidden = !a.isAdmin;
    $('issuedCode').hidden = true;
    $('accountDlg').showModal();
    if (a.isAdmin) loadAdmin();
  }

  /** Run a form submit: show the busy text, and the server's message if it fails. */
  function onSubmit(formId, msgId, busy, fn) {
    $(formId).addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('[type="submit"]');
      setMsg(msgId, busy);
      btn.disabled = true;
      try { await fn(); } catch (err) { setMsg(msgId, err.message || 'Something went wrong', 'err'); }
      finally { btn.disabled = false; }
    });
  }

  function wireDialogs() {
    $('accountBtn').addEventListener('click', () => (isSignedIn() ? openAccount() : openConnect()));
    for (const id of ['connectDlg', 'registerDlg', 'resetDlg', 'accountDlg']) {
      const dlg = $(id);
      dlg.addEventListener('click', (e) => {
        if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); // backdrop or ✕
      });
    }
    $('toRegister').addEventListener('click', () => { $('connectDlg').close(); openRegister(); });
    $('toReset').addEventListener('click', () => { $('connectDlg').close(); openReset($('connectHandle').value.trim()); });

    onSubmit('connectForm', 'connectMsg', 'Checking…', async () => {
      const r = await window.StomperApi.post('connect', {
        handle: $('connectHandle').value, password: $('connectPassword').value,
      });
      $('connectPassword').value = '';
      store(r.sessionToken, r.account);
      $('connectDlg').close();
      brief('Connected as ' + r.account.handle, $('accountBtn'));
    });

    onSubmit('registerForm', 'registerMsg', 'Registering…', async () => {
      if ($('registerPassword').value !== $('registerPassword2').value) throw new Error('Passwords do not match.');
      const r = await window.StomperApi.post('register', {
        inviteCode: $('registerCode').value, handle: $('registerHandle').value, password: $('registerPassword').value,
      });
      for (const id of ['registerCode', 'registerPassword', 'registerPassword2']) $(id).value = '';
      store(r.sessionToken, r.account);
      $('registerDlg').close();
      brief('Welcome, ' + r.account.handle, $('accountBtn'));
    });

    onSubmit('resetForm', 'resetMsg', 'Updating…', async () => {
      const handle = $('resetHandle').value.trim();
      await window.StomperApi.post('resetPassword', {
        handle, resetCode: $('resetCode').value, newPassword: $('resetPassword').value,
      });
      $('resetCode').value = ''; $('resetPassword').value = '';
      $('resetDlg').close();
      openConnect(handle, 'Password updated. Connect with your new password.');
    });

    $('signOutBtn').addEventListener('click', () => {
      $('accountDlg').close();
      signOut();
      brief('Signed out', $('accountBtn'));
    });
    $('switchBtn').addEventListener('click', () => {
      $('accountDlg').close();
      openConnect();
    });
    wireAdmin();
  }

  // ---------------------------------------------------------------- admin: invites, reset codes, account types
  const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const fmtWhen = (iso) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  async function loadAdmin() {
    $('userList').innerHTML = $('inviteList').innerHTML = '<li class="empty">Loading…</li>';
    try {
      const [u, i] = await Promise.all([call('listAccounts'), call('listInvites')]);
      renderUsers(u.accounts);
      renderInvites(i.invites);
    } catch (err) {
      $('userList').innerHTML = `<li class="empty">${esc(err.message || 'Could not load users')}</li>`;
      $('inviteList').innerHTML = '';
    }
  }

  function renderUsers(list) {
    const me = account();
    $('userList').innerHTML = list.map((a) => {
      const self = a.id === me.id;
      const seen = a.lastSeenAt ? 'last seen ' + fmtDate(a.lastSeenAt) : 'never connected';
      return `<li class="acct-row" data-id="${esc(a.id)}" data-handle="${esc(a.handle)}">
        <span class="acct-row-main"><b>${esc(a.handle)}</b>${self ? ' <span class="muted">(you)</span>' : ''}
          ${a.disabled ? ' <span class="muted">· disabled</span>' : ''}
          <span class="acct-row-sub">${esc(seen)}</span></span>
        <select class="dlg-input type-select" data-help="admin.userType" aria-label="Account type for ${esc(a.handle)}" ${self ? 'disabled title="You can\'t change your own type"' : ''}>
          <option value="user"${a.isAdmin ? '' : ' selected'}>User</option>
          <option value="admin"${a.isAdmin ? ' selected' : ''}>Admin</option>
        </select>
        <button class="pill reset-code" type="button" data-help="admin.resetCode">Reset code</button>
      </li>`;
    }).join('') || '<li class="empty">No users yet</li>';
  }

  function renderInvites(list) {
    $('inviteList').innerHTML = list.map((i) => {
      const what = i.purpose === 'reset'
        ? `Reset code for <b>${esc(i.handle || '?')}</b>`
        : `${i.isAdmin ? 'Admin' : 'User'} invite${i.label ? ' for <b>' + esc(i.label) + '</b>' : ''}`;
      return `<li class="acct-row" data-invite="${esc(i.id)}">
        <span class="acct-row-main">${what}<span class="acct-row-sub">expires ${esc(fmtWhen(i.expiresAt))}</span></span>
        <button class="pill revoke" type="button" data-help="admin.revoke">Revoke</button>
      </li>`;
    }).join('') || '<li class="empty">No unused codes</li>';
  }

  function showIssued(what, inv) {
    $('issuedWhat').textContent = `${what} · one use · expires ${fmtWhen(inv.expiresAt)}`;
    $('issuedValue').textContent = inv.code;
    $('issuedCode').hidden = false;
    $('issuedCode').scrollIntoView({ block: 'nearest' });
  }

  function wireAdmin() {
    $('inviteForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('[type="submit"]');
      const label = $('inviteLabel').value.trim();
      const admin = $('inviteType').value === 'admin';
      btn.disabled = true;
      try {
        const inv = await call('issueInvite', { purpose: 'register', isAdmin: admin, label });
        showIssued(`${admin ? 'Admin' : 'User'} invite${label ? ' for ' + label : ''}`, inv);
        $('inviteLabel').value = ''; $('inviteType').value = 'user';
        renderInvites((await call('listInvites')).invites);
      } catch (err) { brief(err.message || 'Could not issue a code', btn); }
      finally { btn.disabled = false; }
    });

    $('issuedCopy').addEventListener('click', async (e) => {
      try { await navigator.clipboard.writeText($('issuedValue').textContent); brief('Copied', e.currentTarget); }
      catch { getSelection().selectAllChildren($('issuedValue')); }
    });

    $('userList').addEventListener('change', async (e) => {
      const sel = e.target.closest('.type-select');
      if (!sel) return;
      const row = sel.closest('.acct-row');
      const makeAdmin = sel.value === 'admin';
      sel.disabled = true;
      try {
        await call('setAccountType', { accountId: row.dataset.id, isAdmin: makeAdmin });
        brief(`${row.dataset.handle} is now ${makeAdmin ? 'an Admin' : 'a User'}`, sel);
      } catch (err) {
        sel.value = makeAdmin ? 'user' : 'admin';
        brief(err.message || 'Could not change the type', sel);
      } finally { sel.disabled = false; }
    });

    $('userList').addEventListener('click', async (e) => {
      const btn = e.target.closest('.reset-code');
      if (!btn) return;
      const row = btn.closest('.acct-row');
      btn.disabled = true;
      try {
        const inv = await call('issueInvite', { purpose: 'reset', accountId: row.dataset.id });
        showIssued('Reset code for ' + row.dataset.handle, inv);
        renderInvites((await call('listInvites')).invites);
      } catch (err) { brief(err.message || 'Could not issue a reset code', btn); }
      finally { btn.disabled = false; }
    });

    $('inviteList').addEventListener('click', async (e) => {
      const btn = e.target.closest('.revoke');
      if (!btn) return;
      btn.disabled = true;
      try {
        await call('revokeInvite', { inviteId: btn.closest('.acct-row').dataset.invite });
        btn.closest('.acct-row').remove();
        if (!$('inviteList').children.length) $('inviteList').innerHTML = '<li class="empty">No unused codes</li>';
      } catch (err) { brief(err.message || 'Could not revoke the code', btn); btn.disabled = false; }
    });
  }

  function init() {
    wireDialogs();
    refreshButton();
    restore();
  }

  return { init, token, account, isSignedIn, isAdmin, signOut, call, EVENT };
})();
