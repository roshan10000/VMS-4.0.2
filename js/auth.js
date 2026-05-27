/* =============================================================================
 *  VMS  ·  Auth
 *  Session is stored in localStorage. Apps Script issues a signed token
 *  containing the username, role and expiry. We re-verify it on every page
 *  load and gate the UI on role.
 * ============================================================================= */

const Auth = (() => {

  const KEY = 'vms.session';
  let idleTimer = null;

  /* ---------- session state ---------------------------------------------- */
  const get = () => {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); }
    catch { return null; }
  };
  const set = sess => localStorage.setItem(KEY, JSON.stringify(sess));
  const clear = () => localStorage.removeItem(KEY);

  const getToken = () => (get() || {}).token || '';
  const user     = () => get() || null;
  const isAdmin  = () => (get() || {}).role === 'Admin';

  /* ---------- core actions ----------------------------------------------- */
  async function login(username, password) {
    const data = await API.login(username, password);
    set({
      token:    data.token,
      username: data.username,
      role:     data.role,
      issuedAt: Date.now(),
    });
    return data;
  }

  function logout() {
    clear();
    location.href = resolveHome();
  }

  /* ---------- route guard ------------------------------------------------ */
  // Call at the top of every protected page.
  // opts.adminOnly  — redirect non-admins to dashboard
  async function guard({ adminOnly = false } = {}) {
    const sess = get();
    if (!sess || !sess.token) {
      location.href = resolveHome();
      return null;
    }

    // expire idle sessions purely client-side as a defence-in-depth.
    const timeoutMs = (window.VMS_CONFIG.SESSION_TIMEOUT_MINUTES || 60) * 60_000;
    if (Date.now() - sess.issuedAt > timeoutMs) {
      clear();
      location.href = resolveHome() + '?expired=1';
      return null;
    }

    if (adminOnly && sess.role !== 'Admin') {
      location.href = 'dashboard.html';
      return null;
    }

    // Touch the session on each guarded page to refresh idle timer.
    sess.issuedAt = Date.now();
    set(sess);
    armIdleTimer();
    return sess;
  }

  /* ---------- idle auto-logout ------------------------------------------ */
  function armIdleTimer() {
    const timeoutMs = (window.VMS_CONFIG.SESSION_TIMEOUT_MINUTES || 60) * 60_000;
    const reset = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        UI.toast('Session expired', 'You have been logged out due to inactivity.', 'danger');
        setTimeout(logout, 1500);
      }, timeoutMs);
    };
    ['mousemove', 'keydown', 'click', 'touchstart'].forEach(ev =>
      window.addEventListener(ev, reset, { passive: true }));
    reset();
  }

  /* ---------- helpers ---------------------------------------------------- */
  // Resolve "home" depending on where we are in the folder tree, so the same
  // code works from both /index.html and /pages/*.html.
  function resolveHome() {
    return location.pathname.includes('/pages/') ? '../index.html' : 'index.html';
  }

  // Inject the brand chip + user chip into the sidebar of every shell page.
  function paintUserChip(root) {
    const sess = get(); if (!sess) return;
    const initials = sess.username.slice(0, 2).toUpperCase();
    const chip = root.querySelector('[data-user-chip]');
    if (!chip) return;
    chip.innerHTML = `
      <div class="avatar">${initials}</div>
      <div class="meta">
        <div class="name">${escapeHTML(sess.username)}</div>
        <div class="role">${escapeHTML(sess.role)}</div>
      </div>
      <button class="x-btn" title="Sign out" data-logout>⏻</button>
    `;
    chip.querySelector('[data-logout]').addEventListener('click', async () => {
      if (await UI.confirm({ title: 'Sign out?', body: 'You will need to log in again.',
                             okLabel: 'Sign out', danger: true })) {
        logout();
      }
    });
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  return {
    get, getToken, user, isAdmin,
    login, logout, guard, paintUserChip, escapeHTML
  };
})();
