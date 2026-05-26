/* =============================================================================
 *  VMS  ·  Apps Script · Cleanup.gs
 *
 *  Retention + storage maintenance.
 *
 *    Cleanup_run(payload, session)
 *        Deletes Drive files & Log rows older than RETENTION_DAYS.
 *        Wired to the admin "Run Cleanup" button.
 *
 *    Cleanup_storage(payload, session)
 *        Walks the /VMS Drive tree and reports total bytes / file count.
 *        Wired to the admin "Storage" card.
 *
 *    Cleanup_dailyTrigger()
 *        Time-based wrapper installed by installTrigger() in Code.gs.
 *        Runs Cleanup_run() with a service-level "session" so it skips the
 *        admin role check.
 *
 *  RETENTION_DAYS is read from Script Properties (default 90).
 * ============================================================================= */


/* ---------------------------------------------------------------------------
 *  Cleanup_run — admin-triggered retention sweep
 * ------------------------------------------------------------------------- */
function Cleanup_run(payload, session) {
  const cfg = _config();
  const days = Math.max(1, Number(cfg.retentionDays || 90));
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const sh = _sheet('Logs');
  const last = sh.getLastRow();
  if (last < 2) {
    return { deletedFiles: 0, deletedRows: 0, retentionDays: days, cutoff: cutoff.toISOString() };
  }

  // Read every row once. We need column 'CreatedAtIso' (or fallback Date) and
  // 'DriveFileId'. Header order is fixed by _bootstrapSheet, but we look it up
  // by name so manual edits don't break things.
  const width = sh.getLastColumn();
  const header = sh.getRange(1, 1, 1, width).getValues()[0];
  const colIso   = header.indexOf('CreatedAtIso');
  const colDate  = header.indexOf('Date');
  const colFid   = header.indexOf('DriveFileId');

  const data = sh.getRange(2, 1, last - 1, width).getValues();

  // Determine which sheet rows are expired. Collect Drive file IDs to delete.
  const expiredRowNumbers = [];
  const fileIds = [];
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    let ts = null;
    if (colIso >= 0 && row[colIso]) {
      ts = new Date(row[colIso]);
    } else if (colDate >= 0 && row[colDate]) {
      ts = new Date(row[colDate]);
    }
    if (!ts || isNaN(ts)) continue;     // keep rows we can't parse — safer
    if (ts >= cutoff) continue;

    expiredRowNumbers.push(i + 2);      // 1-based sheet row, +1 for header
    if (colFid >= 0 && row[colFid]) fileIds.push(String(row[colFid]));
  }

  // 1) Trash Drive files
  let deletedFiles = 0;
  fileIds.forEach(id => {
    try {
      const f = DriveApp.getFileById(id);
      f.setTrashed(true);
      deletedFiles++;
    } catch (e) {
      // file might have been removed manually — ignore
    }
  });

  // 2) Delete sheet rows bottom-up so row numbers stay valid.
  expiredRowNumbers.sort((a, b) => b - a);
  expiredRowNumbers.forEach(rn => sh.deleteRow(rn));

  return {
    deletedFiles:  deletedFiles,
    deletedRows:   expiredRowNumbers.length,
    retentionDays: days,
    cutoff:        cutoff.toISOString(),
  };
}


/* ---------------------------------------------------------------------------
 *  Cleanup_storage — recursive size + file count under the /VMS root
 * ------------------------------------------------------------------------- */
function Cleanup_storage(payload, session) {
  const cfg = _config();
  if (!cfg.driveRootId) throw new Error('DRIVE_ROOT_ID script property not set.');

  const root = DriveApp.getFolderById(cfg.driveRootId);
  const acc = { fileCount: 0, totalBytes: 0, oldestIso: null };

  // Apps Script can't recurse forever within the 6-min quota, so we cap depth
  // and breadth. For a typical /VMS/<mp>/<date>/<type>/ tree this is plenty.
  _walkFolder(root, acc, 0, 8);

  return {
    fileCount:  acc.fileCount,
    totalBytes: acc.totalBytes,
    oldest:     acc.oldestIso,
    rootName:   root.getName(),
    rootId:     root.getId(),
  };
}

function _walkFolder(folder, acc, depth, maxDepth) {
  if (depth > maxDepth) return;

  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    acc.fileCount++;
    acc.totalBytes += Number(f.getSize() || 0);
    const created = f.getDateCreated();
    if (created && (!acc.oldestIso || created.toISOString() < acc.oldestIso)) {
      acc.oldestIso = created.toISOString();
    }
  }

  const subs = folder.getFolders();
  while (subs.hasNext()) {
    _walkFolder(subs.next(), acc, depth + 1, maxDepth);
  }
}


/* ---------------------------------------------------------------------------
 *  Cleanup_dailyTrigger — entry point for the daily time-based trigger
 *
 *  Installed by installTrigger() in Code.gs. Logs result to Stackdriver so
 *  the admin can audit runs from View → Executions in the Apps Script editor.
 * ------------------------------------------------------------------------- */
function Cleanup_dailyTrigger() {
  try {
    // Fake session — this runs as the script owner, not a user. Pass `null`
    // since Cleanup_run doesn't actually read from session.
    const result = Cleanup_run({}, null);
    console.log('[VMS] daily cleanup', JSON.stringify(result));
    return result;
  } catch (err) {
    console.error('[VMS] daily cleanup failed', err && err.stack || err);
    throw err;
  }
}
