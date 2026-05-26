/* =============================================================================
 *  VMS  ·  Apps Script · Logs.gs
 *
 *  Read & write operations on the "Logs" sheet.
 *
 *  Sheet layout (21 columns, bootstrapped in Code.gs → _bootstrapSheet):
 *    Date | Time | User | OrderType | Marketplace | OrderId | Courier |
 *    Warehouse | Operator | ReturnReason | CustomerName | ShipmentType |
 *    BrandName | Remarks | FileName | DriveUrl | DriveFileId | Duration |
 *    SizeBytes | UploadStatus | CreatedAtIso
 *
 *  Public functions used by the action router (Code.gs):
 *    Logs_append(row)         – write a single log row (called from Upload.gs)
 *    Logs_list(payload, sess) – paginated/filterable list (frontend → history)
 *    Logs_stats(payload, sess)– aggregated stats (frontend → dashboard)
 * ============================================================================= */

/** Column order — must match _bootstrapSheet in Code.gs. */
const LOGS_COLUMNS = [
  'date', 'time', 'user', 'orderType', 'marketplace', 'orderId',
  'courier', 'warehouse', 'operator', 'returnReason', 'customerName',
  'shipmentType', 'brandName', 'remarks', 'fileName', 'driveUrl',
  'driveFileId', 'duration', 'sizeBytes', 'uploadStatus', 'createdAtIso',
];


/* ---------------------------------------------------------------------------
 *  Logs_append
 *  Appends a new row to the Logs sheet. `row` is a plain object whose keys
 *  match LOGS_COLUMNS (any missing key is written as an empty string).
 * ------------------------------------------------------------------------- */
function Logs_append(row) {
  const sh = _sheet('Logs');
  const values = LOGS_COLUMNS.map(k => row[k] == null ? '' : row[k]);
  sh.appendRow(values);
  return { appended: true };
}


/* ---------------------------------------------------------------------------
 *  Logs_list
 *  Returns rows as an array of camelCase objects, newest first.
 *  payload:
 *    { q, orderType, marketplace, user, dateFrom, dateTo, limit, offset }
 *  Role rules:
 *    - Admins can list any user's rows.
 *    - Regular users only see their own (session.sub) rows.
 * ------------------------------------------------------------------------- */
function Logs_list(payload, session) {
  payload = payload || {};
  const sh = _sheet('Logs');
  const last = sh.getLastRow();
  if (last < 2) return { rows: [], total: 0 };

  // Read header row to be resilient if columns ever get reordered manually.
  const width = Math.max(sh.getLastColumn(), LOGS_COLUMNS.length);
  const header = sh.getRange(1, 1, 1, width).getValues()[0];
  const headerMap = {}; // camelCase → 0-based column index
  header.forEach((h, i) => {
    const key = _headerToKey(String(h));
    if (key) headerMap[key] = i;
  });

  // Read all data rows in one shot — much faster than per-row reads.
  const data = sh.getRange(2, 1, last - 1, width).getValues();

  // Build row objects
  const all = [];
  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    const obj = {};
    LOGS_COLUMNS.forEach(k => {
      const idx = headerMap[k];
      obj[k] = idx == null ? '' : _formatCell(r[idx], k);
    });
    obj._rowNumber = i + 2; // sheet row number (useful for admin operations)
    all.push(obj);
  }

  // ---------- filtering ----------
  const isAdmin = session && session.role === 'Admin';
  const me = session ? session.sub : null;

  const q            = (payload.q || '').toString().trim().toLowerCase();
  const orderType    = (payload.orderType   || '').toString().trim();
  const marketplace  = (payload.marketplace || '').toString().trim();
  const userFilter   = (payload.user        || '').toString().trim();
  const dateFrom     = (payload.dateFrom    || '').toString().trim();
  const dateTo       = (payload.dateTo      || '').toString().trim();

  let filtered = all.filter(row => {
    if (!isAdmin && row.user !== me)                              return false;
    if (orderType   && row.orderType   !== orderType)             return false;
    if (marketplace && row.marketplace !== marketplace)           return false;
    if (userFilter  && row.user        !== userFilter)            return false;
    if (dateFrom    && String(row.date) <  dateFrom)              return false;
    if (dateTo      && String(row.date) >  dateTo)                return false;
    if (q) {
      const hay = (
        row.orderId + ' ' + row.marketplace + ' ' + row.user + ' ' +
        row.courier + ' ' + row.brandName + ' ' + row.customerName + ' ' +
        row.fileName + ' ' + row.remarks
      ).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });

  // Newest first — rows lower in the sheet are more recent.
  filtered.reverse();

  const total = filtered.length;

  // ---------- pagination ----------
  const limit  = Math.max(0, Math.min(500, Number(payload.limit  || 200)));
  const offset = Math.max(0, Number(payload.offset || 0));
  if (limit > 0) filtered = filtered.slice(offset, offset + limit);

  return { rows: filtered, total: total, limit: limit, offset: offset };
}


/* ---------------------------------------------------------------------------
 *  Logs_stats
 *  Aggregates the data the dashboard needs:
 *    { totalCount, todayCount, weekCount, storageBytes,
 *      recent: [...10 newest rows],
 *      last7Days: [{label:'Mon 20', count:N}, ...],   // oldest→newest
 *      byMarketplace: [{label, count}, ...]            // top 8 }
 *
 *  Non-admins only see stats for their own rows.
 * ------------------------------------------------------------------------- */
function Logs_stats(payload, session) {
  // Re-use Logs_list to honour role filtering + uniform shape.
  const { rows } = Logs_list({ limit: 5000 }, session);

  const today = _today();
  const now   = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  let todayCount = 0;
  let weekCount  = 0;
  let bytes      = 0;
  const byMp     = {};
  const byDay    = {}; // 'yyyy-MM-dd' → count, last 7 days

  // Pre-seed last 7 days in chronological order so the chart never has holes.
  const last7Keys = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    last7Keys.push(key);
    byDay[key] = 0;
  }

  rows.forEach(r => {
    if (r.date === today) todayCount++;

    // weekCount: rows with createdAtIso within the past 7 days
    const ts = r.createdAtIso ? new Date(r.createdAtIso) : null;
    if (ts && !isNaN(ts) && ts >= weekAgo) weekCount++;

    const size = Number(r.sizeBytes || 0);
    if (size > 0) bytes += size;

    if (r.marketplace) {
      byMp[r.marketplace] = (byMp[r.marketplace] || 0) + 1;
    }

    if (byDay[r.date] != null) byDay[r.date]++;
  });

  const last7Days = last7Keys.map(k => ({
    label: _shortDayLabel(k),
    count: byDay[k] || 0,
  }));

  const byMarketplace = Object.keys(byMp)
    .map(k => ({ label: k, count: byMp[k] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return {
    totalCount:    rows.length,
    todayCount:    todayCount,
    weekCount:     weekCount,
    storageBytes:  bytes,
    recent:        rows.slice(0, 10),
    last7Days:     last7Days,
    byMarketplace: byMarketplace,
  };
}


/* ---------------------------------------------------------------------------
 *  helpers
 * ------------------------------------------------------------------------- */

/** Convert "OrderId" → "orderId", "CreatedAtIso" → "createdAtIso". */
function _headerToKey(h) {
  if (!h) return null;
  const s = String(h).replace(/[^A-Za-z0-9]/g, '');
  if (!s) return null;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** Format a cell for JSON output (Dates → ISO strings, etc.). */
function _formatCell(v, key) {
  if (v instanceof Date) {
    // 'date' / 'time' columns are stored as strings, but defensively convert
    // any stray Date cell using the script timezone.
    if (key === 'date') return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    if (key === 'time') return Utilities.formatDate(v, Session.getScriptTimeZone(), 'hh:mm a');
    return v.toISOString();
  }
  if (key === 'sizeBytes') return Number(v) || 0;
  return v == null ? '' : v;
}

/** 'yyyy-MM-dd' → 'Mon 20' style short label. */
function _shortDayLabel(ymd) {
  const parts = String(ymd).split('-');
  if (parts.length !== 3) return ymd;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (isNaN(d)) return ymd;
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'EEE d');
}
