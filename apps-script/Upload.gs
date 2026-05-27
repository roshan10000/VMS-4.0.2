/* =============================================================================
 *  VMS  ·  Apps Script · Upload.gs
 *
 *  Three-step chunked upload pipeline:
 *
 *    Upload_start({...meta}, session)
 *        → creates a temp blob entry in CacheService, returns { uploadId }
 *
 *    Upload_chunk({ uploadId, index, total, chunkBase64 })
 *        → appends one base64 chunk to the in-flight upload
 *
 *    Upload_finish({ uploadId, meta })
 *        → decodes the concatenated base64, saves into the right Drive folder,
 *          logs a row in the Logs sheet, returns the Drive URL.
 *
 *  Why CacheService and not DriveApp directly?  Each /v1/messages → Apps Script
 *  request has a payload ceiling and a 6-minute runtime limit. Splitting the
 *  file across calls keeps every request well under those limits.
 * ============================================================================= */

const UPLOAD_CACHE_TTL_SEC = 60 * 30;   // 30 minutes max time to assemble one file


/* ---------- start --------------------------------------------------------- */
function Upload_start({ totalChunks, totalBytes, fileName }, session) {
  if (!fileName) throw new Error('fileName required');
  if (!totalChunks) throw new Error('totalChunks required');

  const uploadId = Utilities.getUuid();
  const cache = CacheService.getScriptCache();
  cache.put(_uploadKey(uploadId, 'meta'), JSON.stringify({
    fileName, totalChunks, totalBytes,
    user: session.sub,
    started: Date.now(),
  }), UPLOAD_CACHE_TTL_SEC);
  return { uploadId };
}

/* ---------- chunk --------------------------------------------------------- */
function Upload_chunk({ uploadId, index, total, chunkBase64 }, session) {
  const cache = CacheService.getScriptCache();
  const metaRaw = cache.get(_uploadKey(uploadId, 'meta'));
  if (!metaRaw) throw new Error('Upload session expired; please retry from start.');
  const meta = JSON.parse(metaRaw);
  if (meta.user !== session.sub) throw new Error('Upload owner mismatch.');
  if (index < 0 || index >= total) throw new Error('Bad chunk index.');

  // store chunk as-is (still base64). We'll concat later.
  cache.put(_uploadKey(uploadId, 'c' + index), chunkBase64, UPLOAD_CACHE_TTL_SEC);
  return { stored: index };
}

/* ---------- finish -------------------------------------------------------- */
function Upload_finish({ uploadId, meta }, session) {
  const cache = CacheService.getScriptCache();
  const sessRaw = cache.get(_uploadKey(uploadId, 'meta'));
  if (!sessRaw) throw new Error('Upload session expired; please retry.');
  const upload = JSON.parse(sessRaw);
  if (upload.user !== session.sub) throw new Error('Upload owner mismatch.');

  // re-assemble all chunks
  const keys = [];
  for (let i = 0; i < upload.totalChunks; i++) keys.push(_uploadKey(uploadId, 'c' + i));
  const all = cache.getAll(keys);
  let b64 = '';
  for (let i = 0; i < upload.totalChunks; i++) {
    const part = all[_uploadKey(uploadId, 'c' + i)];
    if (part == null) throw new Error('Missing chunk ' + i + '; please retry the upload.');
    b64 += part;
  }

  // decode → Drive
  const bytes = Utilities.base64Decode(b64);
  const blob = Utilities.newBlob(bytes, 'video/webm', meta.fileName || upload.fileName);

  const folder = _resolveDestFolder(meta);
  const file = folder.createFile(blob);

  // make file viewable by anyone with the link (link is private to your sheet)
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    // some workspace policies forbid this — silently fall back to default sharing.
  }

  const url    = file.getUrl();
  const fileId = file.getId();

  // log row
  Logs_append({
    date:         meta.date         || _today(),
    time:         meta.time         || _now(),
    user:         session.sub,
    orderType:    meta.orderType    || '',
    marketplace:  meta.marketplace  || '',
    orderId:      meta.orderId      || '',
    courier:      meta.courier      || '',
    warehouse:    meta.warehouse    || '',
    operator:     meta.operator     || session.sub,
    returnReason: meta.returnReason || '',
    customerName: meta.customerName || '',
    shipmentType: meta.shipmentType || '',
    brandName:    meta.brandName    || '',
    remarks:      meta.remarks      || '',
    fileName:     meta.fileName     || upload.fileName,
    driveUrl:     url,
    driveFileId:  fileId,
    duration:     meta.duration     || '',
    sizeBytes:    meta.sizeBytes    || 0,
    uploadStatus: 'OK',
    createdAtIso: new Date().toISOString(),
  });

  // free cache
  cache.removeAll([_uploadKey(uploadId, 'meta'), ...keys]);

  return { driveUrl: url, fileId: fileId };
}


/* ---------- oneshot ------------------------------------------------------- *
 * Single-POST upload — bypasses CacheService entirely.
 * Apps Script doPost handles ~50 MB request body. Base64 inflates binary by
 * 33%, so the safe binary cap is ~30 MB — way more than a typical 30–90 sec
 * packing video. Use this path for all normal recordings.
 * --------------------------------------------------------------------------- */
function Upload_oneshot({ fileBase64, meta }, session) {
  if (!fileBase64)             throw new Error('fileBase64 required');
  if (!meta || !meta.fileName) throw new Error('fileName required');

  const bytes = Utilities.base64Decode(fileBase64);
  const blob  = Utilities.newBlob(bytes, 'video/webm', meta.fileName);

  const folder = _resolveDestFolder(meta);
  const file   = folder.createFile(blob);

  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) { /* workspace policy may forbid — ignore */ }

  const url    = file.getUrl();
  const fileId = file.getId();

  Logs_append({
    date:         meta.date         || _today(),
    time:         meta.time         || _now(),
    user:         session.sub,
    orderType:    meta.orderType    || '',
    marketplace:  meta.marketplace  || '',
    orderId:      meta.orderId      || '',
    courier:      meta.courier      || '',
    warehouse:    meta.warehouse    || '',
    operator:     meta.operator     || session.sub,
    returnReason: meta.returnReason || '',
    customerName: meta.customerName || '',
    shipmentType: meta.shipmentType || '',
    brandName:    meta.brandName    || '',
    remarks:      meta.remarks      || '',
    fileName:     meta.fileName,
    driveUrl:     url,
    driveFileId:  fileId,
    duration:     meta.duration     || '',
    sizeBytes:    meta.sizeBytes    || 0,
    uploadStatus: 'OK',
    createdAtIso: new Date().toISOString(),
  });

  return { driveUrl: url, fileId: fileId };
}


/* ---------- folder resolution --------------------------------------------
 * Layout:
 *   /VMS_root_folder
 *      /<Marketplace>
 *          /<YYYY-MM-DD>
 *              /<OrderType>      (Forward | Return | D2C)
 *                  fileName.webm
 * ----------------------------------------------------------------------- */
function _resolveDestFolder(meta) {
  const cfg = _config();
  if (!cfg.driveRootId) throw new Error('DRIVE_ROOT_ID script property not set.');
  const root = DriveApp.getFolderById(cfg.driveRootId);

  const marketplace = _sanitize(meta.marketplace || meta.brandName || 'Other');
  const date        = _sanitize(meta.date || _today());
  const orderType   = _sanitize(meta.orderType || 'Forward');

  const lvl1 = _getOrCreateChild(root, marketplace);
  const lvl2 = _getOrCreateChild(lvl1, date);
  const lvl3 = _getOrCreateChild(lvl2, orderType);
  return lvl3;
}

function _getOrCreateChild(parent, name) {
  const it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parent.createFolder(name);
}

function _sanitize(s) {
  return String(s).replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
}

function _uploadKey(id, suffix) { return 'up.' + id + '.' + suffix; }
function _today() {
  const d = new Date();
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}
function _now() {
  const d = new Date();
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'hh:mm a');
}
