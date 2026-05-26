/* =============================================================================
 *  VMS  ·  Uploader  (background queue edition)
 *
 *  Design goals:
 *    1. Operator never waits for an upload — enqueue and continue.
 *    2. Two uploads run in parallel.
 *    3. Failed uploads retry 3× with exponential backoff, then surface a banner.
 *    4. Queue metadata (NOT blobs) survives page reloads via localStorage.
 *    5. Subscribers (the queue badge, the failure banner) get notified of every
 *       state change so the UI re-renders without polling.
 *
 *  Public API (all on window.Uploader):
 *    enqueue(blob, meta)            → returns jobId, starts upload in background
 *    retry(jobId)                   → resets a failed job's retry counter
 *    remove(jobId)                  → drops a job from the queue
 *    getJobs()                      → snapshot of all jobs
 *    subscribe(fn)                  → fn(jobs) called on every change
 *    hasPending()                   → boolean, used by the close-tab warning
 *
 *  Upload transport:
 *    Uses the one-shot Apps Script path (Upload_oneshot / uploadOneshot action)
 *    via XHR so we get real upload progress.
 * ============================================================================= */

const Uploader = (() => {

  // 30 MB binary safety cap (~40 MB base64). Apps Script doPost limit is ~50 MB.
  const ONESHOT_MAX_BYTES = 30 * 1024 * 1024;

  const PARALLEL       = 2;     // concurrent uploads
  const MAX_RETRIES    = 3;
  const RETRY_BASE_MS  = 1500;
  const LS_KEY         = 'vms.upload.queue';

  /* ---- in-memory queue --------------------------------------------------
   * jobs is keyed by jobId; each job:
   *   { id, fileName, meta, sizeBytes, blob, status, progress, attempts,
   *     error, createdAt, completedAt, driveUrl }
   * status ∈ 'queued' | 'uploading' | 'done' | 'failed'
   * blob is kept only in memory — it can't be persisted to localStorage.
   * ----------------------------------------------------------------------- */
  const jobs = new Map();
  const subscribers = new Set();
  let activeCount = 0;

  /* ---- persistence ------------------------------------------------------ */
  function persist() {
    try {
      // Only persist metadata, not the blob (too large for localStorage).
      const snap = Array.from(jobs.values()).map(j => ({
        id:          j.id,
        fileName:    j.fileName,
        meta:        j.meta,
        sizeBytes:   j.sizeBytes,
        status:      j.status === 'uploading' ? 'queued' : j.status,
        attempts:    j.attempts,
        error:       j.error || null,
        createdAt:   j.createdAt,
        completedAt: j.completedAt || null,
        driveUrl:    j.driveUrl || null,
        hasBlob:     !!j.blob,
      }));
      localStorage.setItem(LS_KEY, JSON.stringify(snap));
    } catch (e) { /* quota or private-mode — ignore */ }
  }

  function restore() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const list = JSON.parse(raw);
      list.forEach(j => {
        // Restored jobs have NO blob — they can only be re-tried by re-recording.
        // We keep them in the list as 'failed (lost on refresh)' so the operator
        // sees what was lost. Successful jobs are pruned.
        if (j.status === 'done') return;
        jobs.set(j.id, Object.assign(j, {
          blob: null,
          status: 'failed',
          progress: 0,
          error: j.hasBlob && j.status !== 'failed'
                 ? 'Video data lost on page reload. Please re-record.'
                 : (j.error || 'Upload interrupted'),
        }));
      });
    } catch (e) { /* corrupt store — ignore */ }
  }

  /* ---- subscriber pump -------------------------------------------------- */
  function notify() {
    persist();
    const snap = getJobs();
    subscribers.forEach(fn => { try { fn(snap); } catch (e) { /* ignore */ } });
  }

  function subscribe(fn) {
    subscribers.add(fn);
    try { fn(getJobs()); } catch (e) {}
    return () => subscribers.delete(fn);
  }

  /* ---- public state queries -------------------------------------------- */
  function getJobs() {
    return Array.from(jobs.values())
      .map(j => ({ ...j, blob: undefined }))  // strip blob from snapshot
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  function hasPending() {
    for (const j of jobs.values()) {
      if (j.status === 'queued' || j.status === 'uploading') return true;
    }
    return false;
  }

  /* ---- enqueue --------------------------------------------------------- */
  function enqueue(blob, meta) {
    const id = 'job_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const job = {
      id,
      fileName:    meta.fileName,
      meta,
      sizeBytes:   blob.size,
      blob,
      status:      'queued',
      progress:    0,
      attempts:    0,
      error:       null,
      createdAt:   Date.now(),
      completedAt: null,
      driveUrl:    null,
    };
    jobs.set(id, job);
    notify();
    pump();
    return id;
  }

  /* ---- retry / remove -------------------------------------------------- */
  function retry(id) {
    const job = jobs.get(id);
    if (!job) return;
    if (!job.blob) {
      // Blob was lost (e.g. after refresh) — can't retry.
      job.error = 'Video data lost on page reload. Please re-record.';
      notify();
      return;
    }
    job.status   = 'queued';
    job.attempts = 0;
    job.error    = null;
    job.progress = 0;
    notify();
    pump();
  }

  function remove(id) {
    jobs.delete(id);
    notify();
  }

  /* ---- pump: start more uploads if slots are free --------------------- */
  function pump() {
    if (activeCount >= PARALLEL) return;
    for (const job of jobs.values()) {
      if (activeCount >= PARALLEL) break;
      if (job.status === 'queued' && job.blob) {
        runJob(job);
      }
    }
  }

  async function runJob(job) {
    activeCount++;
    job.status   = 'uploading';
    job.progress = 0;
    job.attempts++;
    notify();

    try {
      const result = await uploadOnce(job);
      job.status      = 'done';
      job.progress    = 1;
      job.driveUrl    = result && result.driveUrl ? result.driveUrl : null;
      job.completedAt = Date.now();
      // Free the blob — Drive has it now.
      job.blob = null;
      notify();
    } catch (err) {
      if (job.attempts < MAX_RETRIES) {
        const delay = RETRY_BASE_MS * Math.pow(2, job.attempts - 1);
        job.status   = 'queued';
        job.error    = 'Retrying… (' + job.attempts + '/' + MAX_RETRIES + ')';
        job.progress = 0;
        notify();
        setTimeout(() => pump(), delay);
      } else {
        job.status      = 'failed';
        job.error       = (err && err.message) || String(err);
        job.progress    = 0;
        notify();
        // Tell the page so it can show the banner
        try { document.dispatchEvent(new CustomEvent('vms:upload-failed',
                                       { detail: { job: { ...job, blob: undefined } } })); }
        catch (e) {}
      }
    } finally {
      activeCount--;
      // Continue draining the queue
      setTimeout(pump, 0);
    }
  }

  /* ---- the actual upload over XHR -------------------------------------- */
  async function uploadOnce(job) {
    const blob = job.blob;
    if (!blob) throw new Error('Video data not available');
    if (blob.size > ONESHOT_MAX_BYTES) {
      const mb  = (blob.size / 1024 / 1024).toFixed(1);
      const cap = (ONESHOT_MAX_BYTES / 1024 / 1024).toFixed(0);
      throw new Error('Video is ' + mb + ' MB — exceeds ' + cap + ' MB cap.');
    }

    const fileBase64 = await blobToBase64(blob);

    const cfg = window.VMS_CONFIG;
    const session = (window.Auth && Auth.getSession) ? Auth.getSession() : null;

    const body = JSON.stringify({
      action: 'uploadOneshot',
      payload: {
        fileBase64: fileBase64,
        meta: Object.assign({}, job.meta, { sizeBytes: blob.size }),
      },
      token: session ? session.token : null,
    });

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', cfg.APPS_SCRIPT_URL, true);
      xhr.setRequestHeader('Content-Type', 'text/plain;charset=utf-8');

      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) {
          // Reserve final 5% for server-side Drive write + Sheet append.
          job.progress = (ev.loaded / ev.total) * 0.95;
          notify();
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const json = JSON.parse(xhr.responseText);
            if (json && json.ok) resolve(json.data);
            else reject(new Error((json && json.error) || 'Upload rejected'));
          } catch (e) {
            reject(new Error('Malformed server response'));
          }
        } else {
          reject(new Error('HTTP ' + xhr.status));
        }
      };
      xhr.onerror   = () => reject(new Error('Network error'));
      xhr.ontimeout = () => reject(new Error('Upload timeout'));
      xhr.send(body);
    });
  }

  /* ---- helpers --------------------------------------------------------- */
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload  = () => resolve(String(r.result).split(',')[1] || '');
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  /* ---- close-tab guard ------------------------------------------------- */
  window.addEventListener('beforeunload', (e) => {
    if (hasPending()) {
      // Modern browsers ignore custom text but still show the prompt.
      e.preventDefault();
      e.returnValue = 'Uploads are still in progress. Closing now will lose those videos.';
      return e.returnValue;
    }
  });

  /* ---- restore queue metadata on script load -------------------------- */
  restore();

  return {
    enqueue, retry, remove,
    getJobs, hasPending, subscribe,
    ONESHOT_MAX_BYTES,
  };
})();
