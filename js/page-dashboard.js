/* =============================================================================
 *  VMS  ·  Dashboard page
 * ============================================================================= */

(async function () {
  const sess = await Auth.guard();
  if (!sess) return;
  Shell.mount({ active: 'dashboard', crumbs: ['Dashboard'] });

  const content = document.getElementById('content');
  content.innerHTML = skeleton();

  try {
    const stats = await API.getStats();
    paintStats(stats);
    paintRecent(stats.recent || []);
    paintBreakdown(stats);
  } catch (err) {
    content.innerHTML = errorState(err.message);
  }

  /* ---------- HTML --------------------------------------------------- */
  function skeleton() {
    return `
      <div class="row between mb-md">
        <div>
          <div class="eyebrow">Hello, ${Auth.escapeHTML(sess.username)}</div>
          <h1>Operations Overview</h1>
        </div>
        <div class="btn-group">
          <a class="btn primary" href="record.html"><span class="mono">●</span> Start Recording</a>
          <a class="btn ghost"   href="history.html">View History</a>
        </div>
      </div>

      <div class="grid cols-4 mb-md" id="stats-grid">
        ${[1,2,3,4].map(() => `<div class="stat"><div class="label">Loading…</div><div class="value">—</div></div>`).join('')}
      </div>

      <div class="grid cols-2 mb-md">
        <div class="card">
          <div class="card-head"><h2>Recordings · last 7 days</h2></div>
          <div class="card-body"><div id="spark-host"></div></div>
        </div>
        <div class="card">
          <div class="card-head"><h2>By marketplace</h2></div>
          <div class="card-body"><div id="bars-host"></div></div>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <h2>Recent uploads</h2>
          <a class="btn ghost" href="history.html">All →</a>
        </div>
        <div class="table-wrap" id="recent-host">
          <table class="table">
            <thead><tr>
              <th>Date</th><th>Time</th><th>User</th><th>Type</th>
              <th>Marketplace</th><th>Order ID</th><th>Duration</th><th></th>
            </tr></thead>
            <tbody><tr><td colspan="8" class="dim text-c" style="padding:30px;">
              <span class="spinner"></span> Loading…
            </td></tr></tbody>
          </table>
        </div>
      </div>
    `;
  }

  function paintStats(s) {
    const host = document.getElementById('stats-grid');
    const cards = [
      { label: 'Total recordings', value: s.totalCount || 0, delta: '' },
      { label: 'Today',            value: s.todayCount || 0, delta: '' },
      { label: 'This week',        value: s.weekCount  || 0, delta: '' },
      { label: 'Storage used',     value: UI.fmtBytes(s.storageBytes || 0), delta: '' },
    ];
    host.innerHTML = cards.map(c => `
      <div class="stat">
        <div class="label">${c.label}</div>
        <div class="value">${c.value}</div>
        <div class="delta">${c.delta || '&nbsp;'}</div>
      </div>
    `).join('');
  }

  function paintRecent(recent) {
    const host = document.getElementById('recent-host');
    if (!recent.length) {
      host.innerHTML = `
        <div class="empty">
          <div class="mark">—</div>
          <div>No recordings yet.</div>
          <div class="mt-sm"><a class="btn primary mt-sm" href="record.html">Make your first recording</a></div>
        </div>`;
      return;
    }
    host.innerHTML = `
      <table class="table">
        <thead><tr>
          <th>Date</th><th>Time</th><th>User</th><th>Type</th>
          <th>Marketplace</th><th>Order ID</th><th>Duration</th><th></th>
        </tr></thead>
        <tbody>
          ${recent.slice(0, 10).map(r => `
            <tr>
              <td class="mono">${Auth.escapeHTML(r.date || '')}</td>
              <td class="mono">${Auth.escapeHTML(r.time || '')}</td>
              <td>${Auth.escapeHTML(r.user || '')}</td>
              <td><span class="tag ${typeTag(r.orderType)}">${Auth.escapeHTML(r.orderType || '')}</span></td>
              <td>${Auth.escapeHTML(r.marketplace || '')}</td>
              <td class="mono">${Auth.escapeHTML(r.orderId || '')}</td>
              <td class="mono">${Auth.escapeHTML(r.duration || '')}</td>
              <td>${r.driveUrl ? `<a class="btn ghost" target="_blank" href="${Auth.escapeHTML(r.driveUrl)}">Open</a>` : ''}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    `;
  }

  function paintBreakdown(s) {
    paintSpark(s.last7Days || []);
    paintBars(s.byMarketplace || []);
  }

  /* ---------- tiny inline SVG charts (no library) --------------------- */
  function paintSpark(series) {
    const host = document.getElementById('spark-host');
    if (!series.length) { host.innerHTML = '<div class="empty dim">No data.</div>'; return; }
    const max = Math.max(1, ...series.map(d => d.count));
    const W = 600, H = 160, P = 24;
    const bw = (W - P*2) / series.length;
    host.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;">
        ${series.map((d, i) => {
          const h = (d.count / max) * (H - P*2);
          const x = P + i * bw + bw*0.15;
          const y = H - P - h;
          return `
            <rect x="${x}" y="${y}" width="${bw*0.7}" height="${h}"
                  rx="3" fill="var(--accent)" opacity="${0.5 + 0.5*(d.count/max)}"/>
            <text x="${x + bw*0.35}" y="${H - 6}" text-anchor="middle"
                  font-family="JetBrains Mono" font-size="10" fill="var(--text-mute)">${d.label}</text>
            <text x="${x + bw*0.35}" y="${y - 4}" text-anchor="middle"
                  font-family="JetBrains Mono" font-size="11" fill="var(--text)">${d.count || ''}</text>
          `;
        }).join('')}
      </svg>
    `;
  }

  function paintBars(items) {
    const host = document.getElementById('bars-host');
    if (!items.length) { host.innerHTML = '<div class="empty dim">No data.</div>'; return; }
    const max = Math.max(1, ...items.map(d => d.count));
    host.innerHTML = items.slice(0, 6).map(d => `
      <div style="margin-bottom:10px;">
        <div class="row between" style="margin-bottom:4px;">
          <span style="font-size:.85rem;">${Auth.escapeHTML(d.label)}</span>
          <span class="mono dim" style="font-size:.78rem;">${d.count}</span>
        </div>
        <div class="progress"><div class="bar" style="width:${(d.count/max)*100}%;"></div></div>
      </div>
    `).join('');
  }

  function typeTag(t) {
    return t === 'Return' ? 'warn' : t === 'D2C' ? 'cyan' : 'ok';
  }

  function errorState(msg) {
    return `<div class="card"><div class="card-body">
      <h2>Couldn't load dashboard</h2>
      <p class="dim">${Auth.escapeHTML(msg)}</p>
      <p class="dim mt-sm">If this is your first time setting up, see <a href="../docs/SETUP.md">SETUP.md</a>.</p>
    </div></div>`;
  }
})();
