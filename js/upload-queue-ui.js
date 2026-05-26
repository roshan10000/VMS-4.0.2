/* =============================================================================
 *  VMS  ·  Upload Queue UI
 *
 *  Renders three UI surfaces driven by the Uploader queue:
 *
 *    1. Top-bar badge — a small pill showing "⏫ N" while uploads are in flight.
 *       Click → toggles the dropdown panel.
 *
 *    2. Dropdown panel — a list of all jobs (queued / uploading / done /
 *       failed) with per-job actions: Retry, Download (always available),
 *       Open in Drive (when done), Dismiss.
 *
 *    3. Failure banner — a red banner across the top of the content area
 *       summarising failed uploads, with a "Retry all" button.
 *
 *  Mount once per page via UploadQueueUI.mount() — after Shell.mount().
 * ============================================================================= */

const UploadQueueUI = (() => {

  let mounted = false;

  function mount() {
    if (mounted) return;
    mounted = true;

    injectStyles();
    injectBadge();
    injectPanel();
    injectBanner();

    Uploader.subscribe(render);
    render(Uploader.getJobs());

    // Close panel on outside click
    document.addEventListener('click', (e) => {
      const panel = document.getElementById('uq-panel');
      const badge = document.getElementById('uq-badge');
      if (!panel || !badge) return;
      if (panel.classList.contains('open') &&
          !panel.contains(e.target) && !badge.contains(e.target)) {
        panel.classList.remove('open');
      }
    });
  }

  /* ---- DOM injection ---------------------------------------------------- */
  function injectBadge() {
    // Insert before the network pill in the topbar
    const topbar = document.querySelector('.topbar');
    if (!topbar) return;
    const netPill = document.getElementById('net-pill');
    const badge = document.createElement('button');
    badge.id = 'uq-badge';
    badge.className = 'uq-badge hidden';
    badge.setAttribute('aria-label', 'Upload queue');
    badge.innerHTML = `
      <span class="uq-badge-ic mono">⏫</span>
      <span class="uq-badge-count">0</span>
    `;
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      const panel = document.getElementById('uq-panel');
      panel.classList.toggle('open');
    });
    topbar.insertBefore(badge, netPill);
  }

  function injectPanel() {
    const panel = document.createElement('div');
    panel.id = 'uq-panel';
    panel.className = 'uq-panel';
    panel.innerHTML = `
      <div class="uq-panel-head">
        <b>Upload queue</b>
        <span class="dim uq-summary"></span>
      </div>
      <div class="uq-panel-body" id="uq-panel-body">
        <div class="uq-empty">No uploads yet.</div>
      </div>
    `;
    document.body.appendChild(panel);
  }

  function injectBanner() {
    const content = document.getElementById('content');
    if (!content) return;
    const banner = document.createElement('div');
    banner.id = 'uq-banner';
    banner.className = 'uq-banner hidden';
    banner.innerHTML = `
      <div>
        <b class="uq-banner-title">Upload failed</b>
        <div class="uq-banner-msg dim"></div>
      </div>
      <div class="row gap-sm">
        <button class="btn ghost" id="uq-banner-open">View queue</button>
        <button class="btn primary" id="uq-banner-retry">Retry all</button>
      </div>
    `;
    content.insertBefore(banner, content.firstChild);

    banner.querySelector('#uq-banner-open').addEventListener('click', () => {
      document.getElementById('uq-panel').classList.add('open');
    });
    banner.querySelector('#uq-banner-retry').addEventListener('click', () => {
      Uploader.getJobs()
        .filter(j => j.status === 'failed')
        .forEach(j => Uploader.retry(j.id));
    });
  }

  /* ---- render ---------------------------------------------------------- */
  function render(jobs) {
    const badge   = document.getElementById('uq-badge');
    const badgeC  = badge && badge.querySelector('.uq-badge-count');
    const panelB  = document.getElementById('uq-panel-body');
    const summary = document.querySelector('.uq-summary');
    const banner  = document.getElementById('uq-banner');
    if (!badge || !panelB) return;

    const active = jobs.filter(j => j.status === 'queued' || j.status === 'uploading').length;
    const failed = jobs.filter(j => j.status === 'failed').length;
    const done   = jobs.filter(j => j.status === 'done').length;

    // ----- badge -----
    const total = active + failed;
    badge.classList.toggle('hidden', total === 0 && done === 0);
    badge.classList.toggle('alert', failed > 0);
    badgeC.textContent = total > 0 ? total : '✓';

    // ----- summary line -----
    if (summary) {
      const parts = [];
      if (active) parts.push(active + ' uploading');
      if (failed) parts.push(failed + ' failed');
      if (done)   parts.push(done + ' done');
      summary.textContent = parts.join(' · ') || 'idle';
    }

    // ----- panel body -----
    if (!jobs.length) {
      panelB.innerHTML = '<div class="uq-empty">No uploads yet.</div>';
    } else {
      panelB.innerHTML = jobs.map(renderJob).join('');
      // wire per-job actions
      panelB.querySelectorAll('[data-act]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id   = btn.getAttribute('data-id');
          const act  = btn.getAttribute('data-act');
          const job  = Uploader.getJobs().find(j => j.id === id);
          if (!job) return;
          if (act === 'retry')    Uploader.retry(id);
          if (act === 'remove')   Uploader.remove(id);
          if (act === 'open')     window.open(job.driveUrl, '_blank');
        });
      });
    }

    // ----- failure banner -----
    if (banner) {
      banner.classList.toggle('hidden', failed === 0);
      const msg = banner.querySelector('.uq-banner-msg');
      if (msg) {
        msg.textContent = failed === 1
          ? '1 video could not be uploaded after 3 attempts. Download it locally as a backup.'
          : failed + ' videos could not be uploaded after 3 attempts. Download them locally as backup.';
      }
    }
  }

  function renderJob(j) {
    const pct = Math.round((j.progress || 0) * 100);
    const sizeKb = (j.sizeBytes / 1024 / 1024).toFixed(1) + ' MB';

    let statusTag = '';
    if (j.status === 'uploading') statusTag = `<span class="tag info">UPLOADING ${pct}%</span>`;
    else if (j.status === 'queued') statusTag = `<span class="tag">QUEUED${j.attempts > 1 ? ' · retry ' + j.attempts : ''}</span>`;
    else if (j.status === 'done')   statusTag = `<span class="tag ok">DONE</span>`;
    else if (j.status === 'failed') statusTag = `<span class="tag danger">FAILED</span>`;

    const progressBar = (j.status === 'uploading')
      ? `<div class="uq-bar"><div class="uq-bar-fill" style="width:${pct}%"></div></div>`
      : '';

    const errLine = j.error
      ? `<div class="uq-err mono">${escape(j.error)}</div>`
      : '';

    // Action buttons
    const actions = [];
    if (j.status === 'failed' || j.status === 'queued' && j.error) {
      actions.push(`<button class="btn xs" data-act="retry" data-id="${j.id}">Retry</button>`);
    }
    // Download — always available so the operator can keep a local backup.
    actions.push(`<button class="btn xs ghost" data-act="download" data-id="${j.id}" data-download-handler>Download</button>`);
    if (j.status === 'done' && j.driveUrl) {
      actions.push(`<button class="btn xs ghost" data-act="open" data-id="${j.id}">Open Drive</button>`);
    }
    if (j.status === 'done' || j.status === 'failed') {
      actions.push(`<button class="btn xs ghost" data-act="remove" data-id="${j.id}">Dismiss</button>`);
    }

    return `
      <div class="uq-job ${j.status}">
        <div class="uq-job-top">
          <div class="uq-job-name mono" title="${escape(j.fileName)}">${escape(j.fileName)}</div>
          ${statusTag}
        </div>
        <div class="uq-job-meta dim">${sizeKb}${j.meta.orderType ? ' · ' + j.meta.orderType : ''}${j.meta.marketplace ? ' · ' + j.meta.marketplace : ''}</div>
        ${progressBar}
        ${errLine}
        <div class="uq-job-actions">
          ${actions.join('')}
        </div>
      </div>
    `;
  }

  function escape(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ---- styles (single-shot injection) ---------------------------------- */
  function injectStyles() {
    if (document.getElementById('uq-styles')) return;
    const css = `
      .uq-badge {
        position: relative; display: inline-flex; align-items: center; gap: 6px;
        background: var(--surface-2); border: 1px solid var(--border);
        color: var(--text); padding: 6px 10px; border-radius: 6px;
        font-size: .85rem; cursor: pointer; transition: all .12s ease;
      }
      .uq-badge:hover { border-color: var(--accent); }
      .uq-badge.alert { border-color: var(--danger); color: var(--danger); }
      .uq-badge-ic { font-size: .9rem; }
      .uq-badge-count {
        background: var(--accent); color: #000; font-weight: 700;
        padding: 1px 7px; border-radius: 999px; font-size: .75rem;
        font-family: var(--mono);
      }
      .uq-badge.alert .uq-badge-count { background: var(--danger); color: #fff; }

      .uq-panel {
        position: fixed; top: 56px; right: 16px; z-index: 999;
        width: 380px; max-width: calc(100vw - 32px); max-height: 70vh;
        background: var(--surface); border: 1px solid var(--border);
        border-radius: 8px; box-shadow: 0 12px 40px rgba(0,0,0,.6);
        display: none; overflow: hidden;
      }
      .uq-panel.open { display: flex; flex-direction: column; }
      .uq-panel-head {
        padding: 12px 14px; border-bottom: 1px solid var(--border);
        display: flex; justify-content: space-between; align-items: baseline;
      }
      .uq-panel-body { padding: 8px; overflow-y: auto; flex: 1; }
      .uq-empty { padding: 24px; text-align: center; color: var(--text-dim); }

      .uq-job {
        padding: 10px 12px; border-radius: 6px; margin-bottom: 6px;
        background: var(--surface-2); border-left: 3px solid var(--border);
      }
      .uq-job.uploading { border-left-color: var(--info); }
      .uq-job.queued    { border-left-color: var(--text-dim); }
      .uq-job.done      { border-left-color: var(--ok); }
      .uq-job.failed    { border-left-color: var(--danger); }

      .uq-job-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
      .uq-job-name { font-size: .82rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .uq-job-meta { font-size: .75rem; margin-top: 2px; }
      .uq-bar {
        margin-top: 8px; height: 4px; background: var(--surface);
        border-radius: 2px; overflow: hidden;
      }
      .uq-bar-fill { height: 100%; background: var(--info); transition: width .2s ease; }
      .uq-err { font-size: .72rem; color: var(--danger); margin-top: 6px; word-break: break-word; }
      .uq-job-actions { margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap; }
      .btn.xs { padding: 3px 8px; font-size: .72rem; border-radius: 4px; }

      .uq-banner {
        background: rgba(248, 113, 113, .08);
        border: 1px solid var(--danger);
        border-radius: 6px; padding: 12px 14px; margin-bottom: 16px;
        display: flex; justify-content: space-between; align-items: center; gap: 12px;
      }
      .uq-banner.hidden { display: none; }
      .uq-banner-title { color: var(--danger); }
      .uq-banner-msg { font-size: .82rem; margin-top: 2px; }
    `;
    const tag = document.createElement('style');
    tag.id = 'uq-styles';
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  return { mount };
})();
