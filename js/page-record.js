/* =============================================================================
 *  VMS  ·  Record page
 * ============================================================================= */

(async function () {
  const sess = await Auth.guard();
  if (!sess) return;
  Shell.mount({ active: 'record', crumbs: ['Workspace', 'Record Video'] });
  if (window.UploadQueueUI) UploadQueueUI.mount();

  const cfg = window.VMS_CONFIG;
  const content = document.getElementById('content');
  content.innerHTML = template();

  // wire DOM
  const tabs       = UI.$$('.type-tabs button');
  const fieldsHost = UI.$('#dyn-fields');
  const stage      = UI.$('#cam-stage');
  const videoEl    = UI.$('#cam-video');
  const canvasEl   = UI.$('#cam-canvas');
  const emptyEl    = UI.$('#cam-empty');
  const camStart   = UI.$('#cam-start');
  const camFlip    = UI.$('#cam-flip');
  const recBtn     = UI.$('#rec-btn');
  const timer      = UI.$('#timer');
  const liveBadge  = UI.$('#live-badge');
  const recBadge   = UI.$('#rec-badge');
  const hudInfo    = UI.$('#hud-info');
  const lastBox      = UI.$('#last-recorded');
  const lastVideo    = UI.$('#last-video');
  const openDrive    = UI.$('#open-drive');
  const lastDownload = UI.$('#last-download');

  let orderType = 'Forward';
  let cameraReady = false;
  let recording = false;

  // initial render
  renderFields(orderType);
  tabs.forEach(t => t.addEventListener('click', () => {
    if (recording) {
      UI.toast('Stop the recording first', '', 'warn');
      return;
    }
    tabs.forEach(b => b.classList.remove('active'));
    t.classList.add('active');
    orderType = t.dataset.type;
    renderFields(orderType);
  }));

  camStart.addEventListener('click', async () => {
    try {
      await Recorder.start({ videoEl, canvasEl });
      cameraReady = true;
      emptyEl.classList.add('hidden');
      liveBadge.classList.remove('hidden');
      camStart.textContent = 'Camera ready';
      camStart.disabled = true;
      camFlip.disabled  = false;
      recBtn.disabled   = false;
    } catch (err) {
      UI.toast('Camera error', err.message || 'Could not start camera.', 'danger');
    }
  });

  camFlip.addEventListener('click', async () => {
    try {
      await Recorder.switchCamera({ videoEl, canvasEl });
      UI.toast('Camera switched', '', 'info', 1500);
    } catch (err) {
      UI.toast('Could not switch camera', err.message || '', 'danger');
    }
  });

  recBtn.addEventListener('click', async () => {
    if (!recording) {
      if (!cameraReady) {
        UI.toast('Start the camera first', '', 'warn');
        return;
      }
      const formData = collectForm();
      const valid = validate(orderType, formData);
      if (!valid.ok) {
        UI.toast('Missing fields', valid.message, 'danger');
        return;
      }
      // burn overlay
      Recorder.setOverlay({
        line1: `Marketplace: ${formData.marketplace || formData.brandName || '—'}`,
        line2: `${orderType === 'Return' ? 'Return ID' : 'Order ID'}: ${formData.orderId || formData.returnId || '—'}`,
      });
      hudInfo.innerHTML = `
        <span class="k">MKT</span>${Auth.escapeHTML(formData.marketplace || formData.brandName || '—')}<br>
        <span class="k">ID&nbsp;&nbsp;</span>${Auth.escapeHTML(formData.orderId || formData.returnId || '—')}
      `;

      Recorder.record({
        canvasEl,
        onTickCb: (s) => { timer.textContent = UI.fmtDuration(s); },
      });
      recording = true;
      recBtn.classList.remove('rec');
      recBtn.classList.add('stop');
      recBtn.innerHTML = '<span class="square"></span><span>Stop</span>';
      recBadge.classList.remove('hidden');
      liveBadge.classList.add('hidden');
      lockFields(true);
    } else {
      const result = await Recorder.stopRecording();
      recording = false;
      recBtn.classList.remove('stop');
      recBtn.classList.add('rec');
      recBtn.innerHTML = '<span class="ring"></span><span>Start Recording</span>';
      recBadge.classList.add('hidden');
      liveBadge.classList.remove('hidden');
      timer.textContent = '00:00';

      if (!result) return;
      enqueueRecording(result.blob, result.duration);
    }
  });

  /* ---------- form rendering ---------------------------------------- */
  function renderFields(type) {
    const M = cfg.MARKETPLACES, C = cfg.COURIERS, R = cfg.RETURN_REASONS,
          S = cfg.SHIPMENT_TYPES;

    let html = '';
    if (type === 'Forward') {
      html = `
        ${select('marketplace', 'Marketplace', M, true)}
        ${input('orderId',       'Order ID',         true)}
        ${select('courier',      'Courier partner',  C, true)}
        ${input('operator',      'Operator name',    true, sess.username)}
        ${textarea('remarks',    'Remarks')}
      `;
    } else if (type === 'Return') {
      html = `
        ${select('marketplace',  'Marketplace', M, true)}
        ${input('returnId',      'Return ID',         true)}
        ${select('courier',      'Courier partner',   C, true)}
        ${input('operator',      'Operator name',     true, sess.username)}
        ${select('returnReason', 'Return reason',     R, true)}
        ${textarea('remarks',    'Remarks')}
      `;
    }
    fieldsHost.innerHTML = html;
  }

  function input(name, label, req = false, value = '') {
    return `
      <div class="field">
        <label>${label}${req ? '<span class="req">*</span>' : ''}</label>
        <input class="input" name="${name}" data-req="${req}" value="${Auth.escapeHTML(value)}" autocomplete="off">
      </div>`;
  }
  function textarea(name, label) {
    return `
      <div class="field">
        <label>${label}</label>
        <textarea class="textarea" name="${name}" rows="2"></textarea>
      </div>`;
  }
  function select(name, label, options, req = false) {
    const opts = ['<option value="" disabled selected>— select —</option>',
      ...options.map(o => `<option value="${Auth.escapeHTML(o)}">${Auth.escapeHTML(o)}</option>`)].join('');
    return `
      <div class="field">
        <label>${label}${req ? '<span class="req">*</span>' : ''}</label>
        <select class="select" name="${name}" data-req="${req}">${opts}</select>
      </div>`;
  }

  function collectForm() {
    const data = {};
    UI.$$('#dyn-fields [name]').forEach(i => data[i.name] = i.value.trim());
    return data;
  }

  function validate(type, d) {
    const required = {
      Forward: ['marketplace', 'orderId', 'courier', 'operator'],
      Return:  ['marketplace', 'returnId', 'courier', 'operator', 'returnReason'],
    }[type];
    const missing = required.filter(k => !d[k]);
    if (missing.length) {
      return { ok: false, message: `Missing: ${missing.join(', ')}` };
    }
    return { ok: true };
  }

  function lockFields(locked) {
    UI.$$('#dyn-fields [name]').forEach(i => i.disabled = locked);
    tabs.forEach(t => t.disabled = locked);
  }

  /* ---------- enqueue (background upload) -------------------------- */
  function enqueueRecording(blob, durationSec) {
    const data = collectForm();
    const marketplace = data.marketplace || data.brandName || 'Other';
    const orderId     = data.orderId     || data.returnId  || 'NA';
    const fileName    = UI.fmtFileName(orderType, marketplace, orderId);

    const meta = {
      fileName,
      orderType,                                  // Forward | Return
      marketplace,
      orderId,
      courier:        data.courier        || data.logisticPartner || '',
      operator:       data.operator       || sess.username,
      warehouse:      data.warehouse      || '',
      remarks:        data.remarks        || '',
      returnReason:   data.returnReason   || '',
      customerName:   data.customerName   || '',
      shipmentType:   data.shipmentType   || '',
      brandName:      data.brandName      || '',
      duration:       UI.fmtDuration(durationSec),
      durationSec:    Math.round(durationSec),
      sizeBytes:      blob.size,
      user:           sess.username,
      date:           UI.fmtDate(),
      time:           UI.fmtTime(),
    };

    // Drop the recorded blob into the queue — Uploader handles it from here.
    Uploader.enqueue(blob, meta);

    UI.toast('Queued for upload', fileName + ' · uploading in background', 'info', 3500);

    // Show the just-recorded clip with a Download button so the operator can
    // keep a local backup whenever they want (per spec: always available).
    lastBox.classList.add('show');
    lastVideo.src = URL.createObjectURL(blob);
    lastDownload.onclick = () => downloadBlob(blob, fileName);
    lastDownload.classList.remove('hidden');
    openDrive.classList.add('hidden');   // no Drive URL yet — appears in queue panel later

    // Reset form-side fields for the next order so operator can continue.
    UI.$$('#dyn-fields [name]').forEach(i => {
      if (['remarks','orderId','returnId','customerName'].includes(i.name)) i.value = '';
    });
    lockFields(false);
  }

  /** Save a recorded blob to the operator's local Downloads folder. */
  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    UI.toast('Downloaded', fileName + ' saved to your Downloads', 'ok');
  }

  /* ---------- template --------------------------------------------- */
  function template() {
    return `
      <div class="row between mb-md">
        <div>
          <div class="eyebrow">Capture</div>
          <h1>Record Video</h1>
        </div>
      </div>

      <div class="record-grid">

        <!-- left: camera -->
        <div>
          <div class="cam-stage" id="cam-stage">
            <video id="cam-video" autoplay muted playsinline></video>
            <canvas id="cam-canvas"></canvas>
            <div class="cam-empty" id="cam-empty">
              <div>
                <div class="mono dim mb-sm">CAMERA · OFF</div>
                Press <span class="kbd">Enable Camera</span> to begin.
                <div class="dim mt-sm" style="font-size:.8rem;">
                  You'll be asked for permission. Choose the rear camera for packing.
                </div>
              </div>
            </div>

            <div class="hud-top">
              <span class="rec-badge live hidden" id="live-badge"><span class="dot"></span>LIVE</span>
              <span class="rec-badge recording hidden" id="rec-badge"><span class="dot"></span>REC</span>
              <span class="timer-badge" id="timer">00:00</span>
            </div>

            <div class="hud-bottom">
              <div class="hud-info" id="hud-info">
                <span class="k">MKT</span>—<br>
                <span class="k">ID&nbsp;&nbsp;</span>—
              </div>
            </div>
          </div>

          <div class="cam-controls">
            <button class="btn" id="cam-start">Enable Camera</button>
            <button class="btn ghost" id="cam-flip" disabled>↻ Flip</button>
            <div class="flex-1"></div>
            <button class="btn rec" id="rec-btn" disabled>
              <span class="ring"></span><span>Start Recording</span>
            </button>
          </div>

          <div class="last-recorded" id="last-recorded">
            <div class="row between mb-sm">
              <h3>Last recording</h3>
              <div class="row gap-sm">
                <button class="btn ghost hidden" id="last-download">💾 Download</button>
                <a class="btn ghost hidden" id="open-drive" target="_blank">Open in Drive ↗</a>
              </div>
            </div>
            <video id="last-video" controls></video>
            <div class="dim mt-sm" style="font-size:.78rem;">
              Upload runs in the background — check the queue badge in the top bar for status.
              Click <b>Download</b> any time to save a local copy.
            </div>
          </div>
        </div>

        <!-- right: form -->
        <div class="form-col">
          <div class="panel">
            <div class="type-tabs mb-md">
              <button class="active" data-type="Forward">Forward</button>
              <button             data-type="Return">Return</button>
            </div>

            <div id="dyn-fields"></div>

            <p class="dim" style="font-size:.78rem;">
              Required fields marked <span class="mono" style="color:var(--accent)">*</span> must
              be filled before recording can start. They will appear as an overlay on the video.
            </p>
          </div>
        </div>
      </div>
    `;
  }
})();
