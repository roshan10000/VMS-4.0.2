/* =============================================================================
 *  VMS  ·  Apps Script · Code.gs   (main entry)
 *
 *  Deploy this whole project as a Web App:
 *    1. Open https://script.google.com
 *    2. Create a new project
 *    3. Add all .gs files from /apps-script into your project (matching names)
 *    4. Set the Script Properties (Project Settings → Script Properties):
 *         SHEET_ID            – the spreadsheet ID
 *         DRIVE_ROOT_ID       – the Drive folder ID where the /VMS tree lives
 *         TOKEN_SECRET        – any long random string (used to sign tokens)
 *         RETENTION_DAYS      – e.g. 90
 *    5. Deploy → New deployment → type: "Web app"
 *         Execute as:  Me
 *         Who has access:  Anyone   (the script itself authenticates users)
 *    6. Copy the resulting URL into js/config.js → APPS_SCRIPT_URL
 *
 *  After your first deploy, also run installTrigger() once from the editor to
 *  install the daily auto-cleanup trigger.
 * ============================================================================= */

// All actions the frontend can call. Each maps to a function in one of the
// other .gs files. Anything not listed here is rejected.
const ACTIONS = {
  // ---- auth ----
  login:        Auth_login,
  verifyToken:  Auth_verify,

  // ---- users (admin) ----
  listUsers:    Users_list,
  saveUser:     Users_save,
  deleteUser:   Users_delete,

  // ---- logs ----
  listLogs:     Logs_list,
  getStats:     Logs_stats,

  // ---- upload pipeline ----
  startUpload:  Upload_start,
  uploadChunk:  Upload_chunk,
  finishUpload: Upload_finish,

  // ---- maintenance ----
  cleanupOld:   Cleanup_run,
  getStorage:   Cleanup_storage,
};

// Actions that don't require a valid session token.
const PUBLIC_ACTIONS = new Set(['login']);

// Actions that require Admin role.
const ADMIN_ACTIONS = new Set([
  'listUsers', 'saveUser', 'deleteUser', 'cleanupOld', 'getStorage'
]);


/* ---------------------------------------------------------------------------
 *  HTTP handlers
 * ------------------------------------------------------------------------- */

function doGet(e) {
  // Simple liveness check so you can verify the deployment URL in a browser.
  return _json({
    ok: true,
    data: { service: 'VMS', version: '1.0', time: new Date().toISOString() }
  });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents || '{}');
  } catch (err) {
    return _json({ ok: false, error: 'Invalid JSON body' });
  }

  const { action, payload, token } = body || {};

  if (!action || typeof ACTIONS[action] !== 'function') {
    return _json({ ok: false, error: 'Unknown action: ' + action });
  }

  // session check
  let session = null;
  if (!PUBLIC_ACTIONS.has(action)) {
    try {
      session = Auth_decode(token);
    } catch (err) {
      return _json({ ok: false, error: 'Auth required' });
    }
    if (ADMIN_ACTIONS.has(action) && session.role !== 'Admin') {
      return _json({ ok: false, error: 'Admin only' });
    }
  }

  // execute
  try {
    const data = ACTIONS[action](payload || {}, session);
    return _json({ ok: true, data });
  } catch (err) {
    return _json({ ok: false, error: err.message || String(err) });
  }
}


/* ---------------------------------------------------------------------------
 *  helpers
 * ------------------------------------------------------------------------- */

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function _props() {
  return PropertiesService.getScriptProperties();
}

function _config() {
  const p = _props();
  return {
    sheetId:        p.getProperty('SHEET_ID'),
    driveRootId:    p.getProperty('DRIVE_ROOT_ID'),
    tokenSecret:    p.getProperty('TOKEN_SECRET'),
    retentionDays:  Number(p.getProperty('RETENTION_DAYS') || 90),
  };
}

function _sheet(name) {
  const id = _config().sheetId;
  if (!id) throw new Error('SHEET_ID script property not set.');
  const ss = SpreadsheetApp.openById(id);
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    _bootstrapSheet(sh, name);
  }
  return sh;
}

function _bootstrapSheet(sh, name) {
  const headers = {
    Users: ['Username', 'PasswordHash', 'Role', 'Status', 'CreatedAt'],
    Logs:  ['Date','Time','User','OrderType','Marketplace','OrderId',
            'Courier','Warehouse','Operator','ReturnReason','CustomerName',
            'ShipmentType','BrandName','Remarks','FileName','DriveUrl',
            'DriveFileId','Duration','SizeBytes','UploadStatus','CreatedAtIso'],
    Settings: ['Key','Value'],
  }[name];
  if (headers) sh.appendRow(headers);
}


/* ---------------------------------------------------------------------------
 *  One-time setup helpers — run these from the Apps Script editor.
 * ------------------------------------------------------------------------- */

/**
 * Run once after first deploy to install the daily auto-cleanup trigger.
 */
function installTrigger() {
  // remove old triggers for this handler to avoid duplicates
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'Cleanup_dailyTrigger') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('Cleanup_dailyTrigger')
    .timeBased()
    .everyDays(1)
    .atHour(3)            // 3 AM in the project's timezone
    .create();
  return 'Trigger installed.';
}

/**
 * Bootstrap the Users sheet with a default admin account if it's empty.
 * Username:  admin
 * Password:  admin123   (CHANGE IT after first login!)
 */
function seedDefaultAdmin() {
  const sh = _sheet('Users');
  if (sh.getLastRow() > 1) return 'Users sheet already has data.';
  const hash = Auth_hash('admin123');
  sh.appendRow(['admin', hash, 'Admin', 'Active', new Date().toISOString()]);
  return 'Default admin created → username: admin · password: admin123 (change it!)';
}

/**
 * Convenience: prints what's configured so you can sanity-check.
 */
function debugConfig() {
  Logger.log(JSON.stringify(_config(), null, 2));
}
