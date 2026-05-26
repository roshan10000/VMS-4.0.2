/* =============================================================================
 *  VMS  ·  Upload Queue UI
 *
 *  Renders the upload queue as an inline panel inside the Record page.
 *  No top-bar badge. No floating dropdown. The panel is always visible
 *  on the Record page and shows every job (queued, uploading, done, failed)
 *  with per-job actions.
 *
 *  Mount once per Record page via UploadQueueUI.mount() — after Shell.mount().
 *  On any other page, UploadQueueUI.mount() is a no-op (it requires the
 *  #uq-host container that only lives on the Record page).
 *
 *  Failure banner is also rendered in the same panel.
 * ============================================================================= */

const UploadQueueUI = (() => {

  let mounted = false;
  let host = null;

  function mount() {
    if (mounted) return;
    host = document.getElementById('uq-host');
    if (!host) return;       // not on Record page — nothing to do
    mounted = true;

    injectStyles();

    // Panel skeleton
    host.innerHTML = `
      <div class="uq-panel-inline">
        <div class="uq-panel-head">
          <div>
            <div class="eyebrow">📥 Upload queue</div>
            <h3 class="uq-title">Recordings</h3>
          </div>
          <div class="uq-summary dim mono">idle</div>
        </div>

        <div class="uq-banner hidden" id="uq-banner">
          <div>
            <b class="uq-banner-title">Upload failed</b>
            <div class="uq-banner-msg dim"></div>
          </div>
          <button class="btn primary sm" id="uq-retry-all">Retry all failed</button>
        </div>

        <div class="uq-list" id="uq-list">
          <div class="uq-empty">No uploads yet. Record a video to begin.</div>
        </div>
      </div>
    `;

    // Wire retry-all
    document.getElementById('uq-retry-all').addEventListener('click', () => {
      Uploader.getJobs()
        .filter(j => j.status === 'failed')
        .forEach(j => Uploader.retry(j.id));
    });

    // Listen to queue changes
    Uploader.subscribe(render);
    render(Uploader.getJobs());
  }

  /* ---- render ---------------------------------------------------------- */
  function render(jobs) {
    const list    = document.getElementById('uq-list');
    const summary = host.querySelector('.uq-summary');
    const banner  = document.getElementById('uq-banner');
    if (!list) return;

    const active = jobs.filter(j => j.status === 'queued' || j.status === 'uploading').length;
    const failed = jobs.filter(j => j.status === 'failed').length;
    const done   = jobs.filter(j => j.status === 'done').length;

    /* ---- summary ---- */
    if (summary) {
      const parts = [];
      if (active) parts.push(active + ' uploading');
      if (failed) parts.push(failed + ' failed');
      if (done)   parts.push(done + ' done');
      summary.textContent = parts.length ? parts.join(' · ') : 'idle';
    }

    /* ---- banner ---- */
    if (banner) {
      banner.classList.toggle('hidden', failed === 0);
      const msg = banner.querySelector('.uq-banner-msg');
      if (msg) {
        msg.textContent = failed === 1
          ? '1 video could not be uploaded after 3 attempts. Use Download as a backup.'
          : failed + ' videos could not be uploaded after 3 attempts. Use Download as a backup.';
      }
    }

    /* ---- list ---- */
    if (!jobs.length) {
      list.innerHTML = '<div class="uq-empty">No uploads yet. Record a video to begin.</div>';
      return;
    }

    list.innerHTML = jobs.map(renderJob).join('');

    // Wire actions
    list.querySelectorAll('[data-act]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id   = btn.getAttribute('data-id');
        const act  = btn.getAttribute('data-act');
        const job  = Uploader.getJobs().find(j => j.id === id);
        if (!job) return;
        if (act === 'retry')    Uploader.retry(id);
        if (act === 'remove')   Uploader.remove(id);
        if (act === 'open')     window.open(job.driveUrl, '_blank');
        if (act === 'download') triggerDownload(id);
      });
    });
  }

  /* Download the job's blob to the operator's local Downloads folder.
   * The blob is held in memory by Uploader until the job completes; once
   * uploaded successfully the blob is freed (Drive has it). For done jobs,
   * Download won't work — but the operator can use "Open Drive ↗" instead. */
  function triggerDownload(id) {
    const job = Uploader.getJobs().find(j => j.id === id);
    const blob = Uploader.getBlob(id);
    if (!blob) {
      // Done jobs free their blob — direct the operator to Drive.
      if (job && job.status === 'done' && job.driveUrl) {
        window.open(job.driveUrl, '_blank');
      } else {
        alert('Local copy is no longer available. The video has been uploaded to Drive.');
      }
      return;
    }
    const fileName = job ? job.fileName : ('video_' + Date.now() + '.webm');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function renderJob(j) {
    const pct    = Math.round((j.progress || 0) * 100);
    const sizeMb = (j.sizeBytes / 1024 / 1024).toFixed(1) + ' MB';

    let statusTag = '';
    if      (j.status === 'uploading') statusTag = `<span class="tag info">UPLOADING ${pct}%</span>`;
    else if (j.status === 'queued')    statusTag = `<span class="tag">QUEUED${j.attempts > 1 ? ' · retry ' + j.attempts : ''}</span>`;
    else if (j.status === 'done')      statusTag = `<span class="tag ok">DONE</span>`;
    else if (j.status === 'failed')    statusTag = `<span class="tag danger">FAILED</span>`;

    const progressBar = (j.status === 'uploading')
      ? `<div class="uq-bar"><div class="uq-bar-fill" style="width:${pct}%"></div></div>`
      : '';

    const errLine = j.error && j.status === 'failed'
      ? `<div class="uq-err mono">${escape(j.error)}</div>`
      : '';

    // Actions
    const actions = [];
    if (j.status === 'failed') {
      actions.push(`<button class="btn xs primary" data-act="retry" data-id="${j.id}">Retry</button>`);
    }
    if (j.status === 'done' && j.driveUrl) {
      actions.push(`<button class="btn xs" data-act="open" data-id="${j.id}">Open Drive ↗</button>`);
    }
    // Download — always offered (per spec).
    actions.push(`<button class="btn xs ghost" data-act="download" data-id="${j.id}">💾 Download</button>`);
    if (j.status === 'done' || j.status === 'failed') {
      actions.push(`<button class="btn xs ghost" data-act="remove" data-id="${j.id}">Dismiss</button>`);
    }

    const subline = [
      sizeMb,
      j.meta && j.meta.orderType,
      j.meta && j.meta.marketplace,
      j.meta && j.meta.orderId,
    ].filter(Boolean).join(' · ');

    return `
      <div class="uq-job ${j.status}">
        <div class="uq-job-top">
          <div class="uq-job-name mono" title="${escape(j.fileName)}">${escape(j.fileName)}</div>
          ${statusTag}
        </div>
        <div class="uq-job-meta dim">${escape(subline)}</div>
        ${progressBar}
        ${errLine}
        <div class="uq-job-actions">${actions.join('')}</div>
      </div>
    `;
  }

  function escape(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ---- styles ---------------------------------------------------------- */
  function injectStyles() {
    if (document.getElementById('uq-styles')) return;
    const css = `
      .uq-panel-inline {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 16px;
        margin-top: 16px;
      }
      .uq-panel-head {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 12px;
      }
      .uq-panel-head h3 { margin: 0; font-size: 1.05rem; }
      .uq-summary { font-size: .82rem; }

      .uq-list { display: flex; flex-direction: column; gap: 8px; }
      .uq-empty {
        padding: 28px; text-align: center; color: var(--text-dim);
        font-size: .88rem; border: 1px dashed var(--border); border-radius: 6px;
      }

      .uq-job {
        padding: 10px 12px; border-radius: 6px;
        background: var(--surface-2); border-left: 3px solid var(--border);
      }
      .uq-job.uploading { border-left-color: var(--info); }
      .uq-job.queued    { border-left-color: var(--text-dim); }
      .uq-job.done      { border-left-color: var(--ok); }
      .uq-job.failed    { border-left-color: var(--danger); }

      .uq-job-top  { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
      .uq-job-name { font-size: .82rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
      .uq-job-meta { font-size: .74rem; margin-top: 2px; }
      .uq-bar {
        margin-top: 8px; height: 4px; background: var(--surface);
        border-radius: 2px; overflow: hidden;
      }
      .uq-bar-fill { height: 100%; background: var(--info); transition: width .25s ease; }
      .uq-err { font-size: .72rem; color: var(--danger); margin-top: 6px; word-break: break-word; }
      .uq-job-actions { margin-top: 10px; display: flex; gap: 6px; flex-wrap: wrap; }

      .btn.xs { padding: 4px 10px; font-size: .74rem; border-radius: 4px; }
      .btn.sm { padding: 6px 12px; font-size: .82rem; }

      .uq-banner {
        background: rgba(248, 113, 113, .08);
        border: 1px solid var(--danger);
        border-radius: 6px; padding: 12px 14px; margin-bottom: 12px;
        display: flex; justify-content: space-between; align-items: center; gap: 12px;
      }
      .uq-banner.hidden { display: none; }
      .uq-banner-title  { color: var(--danger); }
      .uq-banner-msg    { font-size: .82rem; margin-top: 2px; }

      .eyebrow {
        font-size: .68rem; letter-spacing: .12em;
        text-transform: uppercase; color: var(--text-dim);
        margin-bottom: 2px;
      }
    `;
    const tag = document.createElement('style');
    tag.id = 'uq-styles';
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  return { mount };
})();
