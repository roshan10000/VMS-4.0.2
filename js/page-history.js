/* =============================================================================
 *  VMS  ·  Video History page
 * ============================================================================= */

(async function () {
  const sess = await Auth.guard();
  if (!sess) return;
  Shell.mount({ active: 'history', crumbs: ['Workspace', 'Video History'] });
  if (window.UploadQueueUI) UploadQueueUI.mount();

  const cfg = window.VMS_CONFIG;
  const content = document.getElementById('content');
  content.innerHTML = template();

  const state = {
    rows: [],
    filtered: [],
    page: 0,
    pageSize: 25,
  };

  // wire filters
  const searchEl = UI.$('#filter-search');
  const typeEl   = UI.$('#filter-type');
  const mktEl    = UI.$('#filter-mkt');
  const userEl   = UI.$('#filter-user');
  const fromEl   = UI.$('#filter-from');
  const toEl     = UI.$('#filter-to');

  UI.fillSelect(typeEl, ['', 'Forward', 'Return'], '— any —');
  UI.fillSelect(mktEl,  cfg.MARKETPLACES, '— any —');

  [searchEl, typeEl, mktEl, userEl, fromEl, toEl].forEach(e =>
    e.addEventListener('input', () => { state.page = 0; render(); })
  );

  UI.$('#export-btn').addEventListener('click', exportCSV);
  UI.$('#refresh-btn').addEventListener('click', load);

  await load();

  async function load() {
    UI.$('#table-host').innerHTML = `
      <div class="empty"><span class="spinner"></span> Loading…</div>`;
    try {
      // Non-admins only get their own rows from the backend; admins see all.
      const logs = await API.listLogs({});
      state.rows = logs || [];
      // populate user filter
      const users = Array.from(new Set(state.rows.map(r => r.user).filter(Boolean))).sort();
      UI.fillSelect(userEl, users, '— any —');
      render();
    } catch (err) {
      UI.$('#table-host').innerHTML = `
        <div class="empty">
          <div class="mark">!</div>
          Couldn't load: <span class="dim">${Auth.escapeHTML(err.message)}</span>
        </div>`;
    }
  }

  function render() {
    const q   = searchEl.value.trim().toLowerCase();
    const t   = typeEl.value;
    const mkt = mktEl.value;
    const u   = userEl.value;
    const f   = fromEl.value;
    const to  = toEl.value;

    state.filtered = state.rows.filter(r => {
      if (t   && r.orderType   !== t)   return false;
      if (mkt && r.marketplace !== mkt) return false;
      if (u   && r.user        !== u)   return false;
      if (f   && r.date < f)            return false;
      if (to  && r.date > to)           return false;
      if (q) {
        const hay = `${r.orderId} ${r.marketplace} ${r.user} ${r.courier} ${r.warehouse} ${r.remarks}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    UI.$('#result-count').textContent =
      `${state.filtered.length} record${state.filtered.length === 1 ? '' : 's'}`;

    paintTable();
  }

  function paintTable() {
    const host = UI.$('#table-host');
    if (!state.filtered.length) {
      host.innerHTML = `<div class="empty"><div class="mark">∅</div>No results.</div>`;
      return;
    }

    const start = state.page * state.pageSize;
    const slice = state.filtered.slice(start, start + state.pageSize);
    const totalPages = Math.ceil(state.filtered.length / state.pageSize);

    host.innerHTML = `
      <div class="table-wrap">
        <table class="table">
          <thead><tr>
            <th>Date</th><th>Time</th><th>User</th><th>Type</th>
            <th>Marketplace</th><th>Order ID</th><th>Courier</th>
            <th>Duration</th><th>Size</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>
            ${slice.map(r => `
              <tr>
                <td class="mono">${Auth.escapeHTML(r.date)}</td>
                <td class="mono">${Auth.escapeHTML(r.time)}</td>
                <td>${Auth.escapeHTML(r.user)}</td>
                <td><span class="tag ${typeTag(r.orderType)}">${Auth.escapeHTML(r.orderType)}</span></td>
                <td>${Auth.escapeHTML(r.marketplace)}</td>
                <td class="mono">${Auth.escapeHTML(r.orderId)}</td>
                <td>${Auth.escapeHTML(r.courier)}</td>
                <td class="mono">${Auth.escapeHTML(r.duration)}</td>
                <td class="mono">${UI.fmtBytes(Number(r.sizeBytes) || 0)}</td>
                <td><span class="tag ${r.uploadStatus === 'OK' ? 'ok' : 'danger'}">${Auth.escapeHTML(r.uploadStatus || '—')}</span></td>
                <td class="row gap-sm">
                  ${r.driveUrl ? `
                    <a class="btn ghost" href="${Auth.escapeHTML(r.driveUrl)}" target="_blank">Open</a>
                    <button class="btn ghost" data-copy="${Auth.escapeHTML(r.driveUrl)}">Copy link</button>
                  ` : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="row between mt-md">
        <div class="dim mono" style="font-size:.78rem;">
          Page ${state.page + 1} of ${totalPages}
        </div>
        <div class="btn-group">
          <button class="btn ghost" id="prev" ${state.page === 0 ? 'disabled' : ''}>← Prev</button>
          <button class="btn ghost" id="next" ${state.page >= totalPages - 1 ? 'disabled' : ''}>Next →</button>
        </div>
      </div>
    `;

    UI.$('#prev')?.addEventListener('click', () => { state.page--; paintTable(); });
    UI.$('#next')?.addEventListener('click', () => { state.page++; paintTable(); });

    UI.$$('[data-copy]', host).forEach(b =>
      b.addEventListener('click', () => {
        navigator.clipboard.writeText(b.dataset.copy);
        UI.toast('Link copied', '', 'ok', 1500);
      })
    );
  }

  function exportCSV() {
    if (!state.filtered.length) {
      UI.toast('Nothing to export', '', 'warn');
      return;
    }
    const cols = ['date','time','user','orderType','marketplace','orderId',
                  'courier','warehouse','duration','sizeBytes','driveUrl','uploadStatus','remarks'];
    const head = cols.join(',');
    const body = state.filtered.map(r =>
      cols.map(c => csvCell(r[c])).join(',')
    ).join('\n');
    const blob = new Blob([head + '\n' + body], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `vms-history-${UI.fmtDate()}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }
  function csvCell(v) {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function typeTag(t) {
    return t === 'Return' ? 'warn' : t === 'D2C' ? 'cyan' : 'ok';
  }

  function template() {
    return `
      <div class="row between mb-md">
        <div>
          <div class="eyebrow">Records</div>
          <h1>Video History</h1>
          <div class="dim mono" id="result-count" style="font-size:.78rem;">—</div>
        </div>
        <div class="btn-group">
          <button class="btn ghost" id="refresh-btn">↻ Refresh</button>
          <button class="btn ghost" id="export-btn">↓ Export CSV</button>
        </div>
      </div>

      <div class="panel mb-md">
        <div class="grid cols-3" style="gap:12px;">
          <div class="field" style="margin:0;">
            <label>Search</label>
            <input class="input" id="filter-search" placeholder="Order ID, marketplace, user…">
          </div>
          <div class="field" style="margin:0;">
            <label>Type</label>
            <select class="select" id="filter-type"></select>
          </div>
          <div class="field" style="margin:0;">
            <label>Marketplace</label>
            <select class="select" id="filter-mkt"></select>
          </div>
          <div class="field" style="margin:0;">
            <label>User</label>
            <select class="select" id="filter-user"></select>
          </div>
          <div class="field" style="margin:0;">
            <label>From</label>
            <input class="input" id="filter-from" type="date">
          </div>
          <div class="field" style="margin:0;">
            <label>To</label>
            <input class="input" id="filter-to" type="date">
          </div>
        </div>
      </div>

      <div class="card">
        <div id="table-host"></div>
      </div>
    `;
  }
})();
