/* =============================================================================
 *  VMS  ·  Settings page
 *  Settings are read-only here — the source of truth is js/config.js.
 *  This page lets the operator inspect what's configured and verify that
 *  the Apps Script backend is reachable.
 * ============================================================================= */

(async function () {
  const sess = await Auth.guard();
  if (!sess) return;
  Shell.mount({ active: 'settings', crumbs: ['Settings'] });

  const cfg = window.VMS_CONFIG;
  const content = document.getElementById('content');

  content.innerHTML = `
    <div class="row between mb-md">
      <div>
        <div class="eyebrow">Configuration</div>
        <h1>Settings</h1>
      </div>
      <button class="btn primary" id="test-btn">Test backend connection</button>
    </div>

    <div class="grid cols-2 mb-md">
      <div class="card">
        <div class="card-head"><h2>Backend</h2></div>
        <div class="card-body">
          ${row('Apps Script URL', cfg.APPS_SCRIPT_URL, true)}
          ${row('Sheet ID',        cfg.SHEET_ID,        true)}
          ${row('Drive Folder ID', cfg.DRIVE_ROOT_FOLDER_ID, true)}
          <p class="dim" style="font-size:.82rem; margin-top:8px;">
            To change these, edit <span class="kbd">js/config.js</span> and refresh.
          </p>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Retention & limits</h2></div>
        <div class="card-body">
          ${row('Retention',       (cfg.RETENTION_DAYS || 90) + ' days')}
          ${row('Max recording',   (cfg.MAX_RECORDING_SECONDS || 600) + ' seconds')}
          ${row('Idle timeout',    (cfg.SESSION_TIMEOUT_MINUTES || 60) + ' minutes')}
          ${row('Video bitrate',   UI.fmtBytes(cfg.VIDEO_BITRATE || 1500000) + '/s')}
          ${row('Upload chunk',    UI.fmtBytes(cfg.UPLOAD_CHUNK_BYTES || 4194304))}
        </div>
      </div>
    </div>

    <div class="card mb-md">
      <div class="card-head"><h2>Marketplaces</h2></div>
      <div class="card-body">
        <div class="row gap-sm" style="flex-wrap:wrap;">
          ${cfg.MARKETPLACES.map(m => `<span class="tag">${Auth.escapeHTML(m)}</span>`).join('')}
        </div>
        <p class="dim mt-md" style="font-size:.82rem;">
          Edit the <span class="kbd">MARKETPLACES</span> array in
          <span class="kbd">js/config.js</span> to add or remove options.
        </p>
      </div>
    </div>

    <div class="card mb-md">
      <div class="card-head"><h2>Browser capabilities</h2></div>
      <div class="card-body" id="caps-host"></div>
    </div>

    <div class="card">
      <div class="card-head"><h2>About</h2></div>
      <div class="card-body dim" style="font-size:.9rem;">
        <p><b>${Auth.escapeHTML(cfg.APP_NAME)}</b> — ${Auth.escapeHTML(cfg.APP_TAGLINE)}</p>
        <p>HTML / CSS / vanilla JS frontend + Google Apps Script backend.
           No servers, no databases, no paid services.</p>
      </div>
    </div>
  `;

  paintCaps();

  UI.$('#test-btn').addEventListener('click', async () => {
    const btn = UI.$('#test-btn');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Testing…';
    try {
      await API.verifyToken();
      UI.toast('Backend reachable', 'Your Apps Script web app is responding.', 'ok');
    } catch (err) {
      UI.toast('Backend unreachable', err.message, 'danger', 6000);
    } finally {
      btn.disabled = false; btn.textContent = 'Test backend connection';
    }
  });

  function row(label, value, mask = false) {
    let v = value || '—';
    if (mask && v.length > 18) v = v.slice(0, 6) + '…' + v.slice(-6);
    return `
      <div class="row between" style="padding:8px 0; border-bottom:1px solid var(--line);">
        <span class="dim" style="font-size:.85rem;">${label}</span>
        <span class="mono" style="font-size:.82rem;">${Auth.escapeHTML(v)}</span>
      </div>`;
  }

  function paintCaps() {
    const caps = [
      ['MediaRecorder',          'MediaRecorder' in window],
      ['getUserMedia',           !!(navigator.mediaDevices?.getUserMedia)],
      ['Canvas captureStream',   !!HTMLCanvasElement.prototype.captureStream],
      ['VP9 codec',              MediaRecorder.isTypeSupported?.('video/webm;codecs=vp9,opus')],
      ['HTTPS or localhost',     location.protocol === 'https:' || ['localhost','127.0.0.1'].includes(location.hostname)],
      ['Online',                 navigator.onLine],
    ];
    UI.$('#caps-host').innerHTML = caps.map(([k, ok]) => `
      <div class="row between" style="padding:6px 0; border-bottom:1px solid var(--line);">
        <span>${Auth.escapeHTML(k)}</span>
        <span class="tag ${ok ? 'ok' : 'danger'}">${ok ? 'OK' : 'MISSING'}</span>
      </div>
    `).join('');
  }
})();
