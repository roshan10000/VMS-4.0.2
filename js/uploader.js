/* =============================================================================
 *  VMS  ·  Uploader
 *
 *  Pushes a video blob to Apps Script in base64 chunks. Apps Script has a hard
 *  ~50 MB payload ceiling and a 6-minute execution limit per request, so we:
 *
 *    1. startUpload → backend allocates a temporary file and returns uploadId
 *    2. uploadChunk × N → each call appends one base64 chunk to that file
 *    3. finishUpload → backend moves the file into the correct dated folder
 *       and writes the metadata row into the Logs sheet
 *
 *  Each step has a small exponential-backoff retry to survive flaky networks.
 * ============================================================================= */

const Uploader = (() => {

  const MAX_RETRIES = 3;
  const RETRY_BASE_MS = 800;

  async function retry(fn, label = 'request') {
    let last;
    for (let i = 0; i < MAX_RETRIES; i++) {
      try { return await fn(); }
      catch (e) {
        last = e;
        await new Promise(r => setTimeout(r, RETRY_BASE_MS * Math.pow(2, i)));
      }
    }
    throw new Error(`${label} failed after ${MAX_RETRIES} attempts: ${last?.message || last}`);
  }

  // blob → base64 (no data: prefix)
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload  = () => resolve(String(r.result).split(',')[1] || '');
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  /**
   * Upload a video blob.
   *
   * @param {Blob}   blob
   * @param {Object} meta  — fileName, marketplace, orderId, orderType, etc.
   * @param {(p:number)=>void} onProgress — receives 0..1
   * @returns {Promise<{driveUrl, fileId, logRow}>}
   */
  async function upload(blob, meta, onProgress = () => {}) {
    const chunkBytes = window.VMS_CONFIG.UPLOAD_CHUNK_BYTES || (4 * 1024 * 1024);
    const total = Math.max(1, Math.ceil(blob.size / chunkBytes));

    // 1. start
    const { uploadId } = await retry(
      () => API.startUpload({ ...meta, totalChunks: total, totalBytes: blob.size }),
      'startUpload'
    );

    // 2. chunks
    for (let i = 0; i < total; i++) {
      const slice = blob.slice(i * chunkBytes, (i + 1) * chunkBytes);
      const b64   = await blobToBase64(slice);
      await retry(
        () => API.uploadChunk(uploadId, i, total, b64),
        `chunk ${i+1}/${total}`
      );
      onProgress((i + 1) / (total + 1));   // leave 1/N for finish step
    }

    // 3. finish
    const result = await retry(
      () => API.finishUpload(uploadId, meta),
      'finishUpload'
    );
    onProgress(1);
    return result;
  }

  return { upload };
})();
