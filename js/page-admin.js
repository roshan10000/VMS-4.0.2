/* =============================================================================
 *  VMS  ·  Admin Panel
 * ============================================================================= */

(async function () {
  const sess = await Auth.guard({ adminOnly: true });
  if (!sess) return;
  Shell.mount({ active: 'admin', crumbs: ['Admin', 'Users & Maintenance'] });

  const content = document.getElementById('content');
  content.innerHTML = template();

  await loadUsers();
  await loadStorage();

  UI.$('#add-user-btn').addEventListener('click', () => openUserModal());
  UI.$('#cleanup-btn').addEventListener('click', runCleanup);
  UI.$('#refresh-storage').addEventListener('click', loadStorage);

  /* ---------- users -------------------------------------------------- */
  async function loadUsers() {
    const host = UI.$('#users-host');
    host.innerHTML = '<div class="empty"><span class="spinner"></span> Loading users…</div>';
    try {
      const users = await API.listUsers();
      paintUsers(users);
    } catch (err) {
      host.innerHTML = `<div class="empty"><div class="mark">!</div>${Auth.escapeHTML(err.message)}</div>`;
    }
  }

  function paintUsers(users) {
    const host = UI.$('#users-host');
    if (!users.length) {
      host.innerHTML = `<div class="empty"><div class="mark">∅</div>No users yet.</div>`;
      return;
    }
    host.innerHTML = `
      <div class="table-wrap"><table class="table">
        <thead><tr>
          <th>Username</th><th>Role</th><th>Status</th><th>Created</th><th></th>
        </tr></thead>
        <tbody>
          ${users.map(u => `
            <tr>
              <td class="mono">${Auth.escapeHTML(u.username)}</td>
              <td><span class="tag ${u.role === 'Admin' ? 'cyan' : ''}">${Auth.escapeHTML(u.role)}</span></td>
              <td><span class="tag ${u.status === 'Active' ? 'ok' : 'danger'}">${Auth.escapeHTML(u.status)}</span></td>
              <td class="mono">${Auth.escapeHTML(u.createdAt || '')}</td>
              <td class="row gap-sm">
                <button class="btn ghost" data-edit="${Auth.escapeHTML(u.username)}">Edit</button>
                <button class="btn danger" data-del="${Auth.escapeHTML(u.username)}">Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table></div>
    `;

    UI.$$('[data-edit]').forEach(b =>
      b.addEventListener('click', () => {
        const u = users.find(x => x.username === b.dataset.edit);
        openUserModal(u);
      })
    );
    UI.$$('[data-del]').forEach(b =>
      b.addEventListener('click', async () => {
        const ok = await UI.confirm({
          title: 'Delete user?',
          body: `This will permanently remove "${b.dataset.del}".`,
          okLabel: 'Delete', danger: true
        });
        if (!ok) return;
        try {
          await API.deleteUser(b.dataset.del);
          UI.toast('User deleted', '', 'ok');
          loadUsers();
        } catch (err) {
          UI.toast('Failed', err.message, 'danger');
        }
      })
    );
  }

  function openUserModal(existing) {
    const back = UI.el('div', { class: 'modal-back open' });
    const modal = UI.el('div', { class: 'modal' });
    modal.innerHTML = `
      <div class="modal-head">
        <h2>${existing ? 'Edit user' : 'Add user'}</h2>
        <button class="x-btn" data-close>×</button>
      </div>
      <div class="modal-body">
        <div class="field">
          <label>Username<span class="req">*</span></label>
          <input class="input" name="username" value="${Auth.escapeHTML(existing?.username || '')}"
                 ${existing ? 'readonly' : ''}>
        </div>
        <div class="field">
          <label>${existing ? 'New password (leave blank to keep)' : 'Password'}<span class="req">${existing ? '' : '*'}</span></label>
          <input class="input" name="password" type="password" autocomplete="new-password">
        </div>
        <div class="field">
          <label>Role<span class="req">*</span></label>
          <select class="select" name="role">
            <option value="User"  ${existing?.role === 'User'  ? 'selected' : ''}>User</option>
            <option value="Admin" ${existing?.role === 'Admin' ? 'selected' : ''}>Admin</option>
          </select>
        </div>
        <div class="field">
          <label>Status<span class="req">*</span></label>
          <select class="select" name="status">
            <option value="Active"   ${existing?.status === 'Active'   ? 'selected' : ''}>Active</option>
            <option value="Disabled" ${existing?.status === 'Disabled' ? 'selected' : ''}>Disabled</option>
          </select>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn ghost" data-close>Cancel</button>
        <button class="btn primary" data-save>${existing ? 'Save changes' : 'Create user'}</button>
      </div>
    `;
    back.appendChild(modal);
    document.body.appendChild(back);

    modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => back.remove()));
    modal.querySelector('[data-save]').addEventListener('click', async () => {
      const data = UI.readForm(modal);
      if (!data.username) return UI.toast('Username required', '', 'danger');
      if (!existing && !data.password) return UI.toast('Password required', '', 'danger');

      try {
        await API.saveUser({
          username: data.username,
          password: data.password,    // backend ignores blank when editing
          role:     data.role,
          status:   data.status,
          isUpdate: !!existing,
        });
        back.remove();
        UI.toast(existing ? 'User updated' : 'User created', '', 'ok');
        loadUsers();
      } catch (err) {
        UI.toast('Failed', err.message, 'danger');
      }
    });
  }

  /* ---------- storage / cleanup -------------------------------------- */
  async function loadStorage() {
    const host = UI.$('#storage-host');
    host.innerHTML = '<div class="empty"><span class="spinner"></span> Reading Drive…</div>';
    try {
      const s = await API.getStorage();
      host.innerHTML = `
        <div class="grid cols-3">
          <div class="stat"><div class="label">Total files</div>
               <div class="value">${s.fileCount || 0}</div></div>
          <div class="stat"><div class="label">Total size</div>
               <div class="value">${UI.fmtBytes(s.totalBytes || 0)}</div></div>
          <div class="stat"><div class="label">Oldest file</div>
               <div class="value" style="font-size:1.1rem;">${Auth.escapeHTML(s.oldest || '—')}</div></div>
        </div>
      `;
    } catch (err) {
      host.innerHTML = `<div class="empty"><div class="mark">!</div>${Auth.escapeHTML(err.message)}</div>`;
    }
  }

  async function runCleanup() {
    const days = window.VMS_CONFIG.RETENTION_DAYS || 90;
    const ok = await UI.confirm({
      title: `Delete files older than ${days} days?`,
      body: 'This removes Drive videos and Logs sheet rows. It cannot be undone.',
      okLabel: 'Run cleanup', danger: true,
    });
    if (!ok) return;
    const btn = UI.$('#cleanup-btn');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Running…';
    try {
      const r = await API.cleanupOld();
      UI.toast('Cleanup complete', `Removed ${r.deletedFiles || 0} files and ${r.deletedRows || 0} log rows.`, 'ok', 6000);
      loadStorage();
    } catch (err) {
      UI.toast('Cleanup failed', err.message, 'danger');
    } finally {
      btn.disabled = false; btn.textContent = 'Run cleanup now';
    }
  }

  /* ---------- template ----------------------------------------------- */
  function template() {
    return `
      <div class="row between mb-md">
        <div>
          <div class="eyebrow">Administration</div>
          <h1>Admin Panel</h1>
        </div>
      </div>

      <div class="card mb-md">
        <div class="card-head">
          <h2>Users</h2>
          <button class="btn primary" id="add-user-btn">+ Add user</button>
        </div>
        <div id="users-host"></div>
      </div>

      <div class="card">
        <div class="card-head">
          <h2>Storage & Retention</h2>
          <button class="btn ghost" id="refresh-storage">↻ Refresh</button>
          <button class="btn danger" id="cleanup-btn">Run cleanup now</button>
        </div>
        <div class="card-body" id="storage-host"></div>
        <div class="card-foot dim" style="font-size:.82rem;">
          Auto-cleanup is enforced by a daily Apps Script trigger. Retention is set in
          <span class="kbd">js/config.js</span> → <span class="kbd">RETENTION_DAYS</span>
          (currently <b>${window.VMS_CONFIG.RETENTION_DAYS || 90}</b> days).
        </div>
      </div>
    `;
  }
})();
