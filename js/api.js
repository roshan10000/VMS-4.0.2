/* =============================================================================
 *  VMS  ·  API client
 *  All backend traffic goes through the Apps Script Web App URL.
 *
 *  Apps Script Web Apps don't support custom request headers from the browser,
 *  so we POST with content-type "text/plain" (a "simple" CORS request that
 *  avoids the pre-flight) and send everything as JSON in the body.
 * ============================================================================= */

const API = (() => {

  const url = () => {
    const u = (window.VMS_CONFIG || {}).APPS_SCRIPT_URL;
    if (!u || u.startsWith('PASTE')) {
      throw new Error('VMS not configured — set APPS_SCRIPT_URL in js/config.js');
    }
    return u;
  };

  /* ---------- low-level call --------------------------------------------- */
  async function call(action, payload = {}) {
    const body = JSON.stringify({ action, payload, token: Auth.getToken() });
    let res;
    try {
      res = await fetch(url(), {
        method: 'POST',
        // text/plain keeps this a "simple" request – no preflight, works
        // against Apps Script doPost without CORS gymnastics.
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body,
        redirect: 'follow',
      });
    } catch (e) {
      throw new Error('Network error — check your connection.');
    }
    let json;
    try {
      json = await res.json();
    } catch (e) {
      throw new Error('Server returned a malformed response.');
    }
    if (!json.ok) {
      throw new Error(json.error || 'Unknown server error');
    }
    return json.data;
  }

  /* ---------- public actions --------------------------------------------- */

  // auth
  const login        = (username, password) => call('login',        { username, password });
  const verifyToken  = ()                   => call('verifyToken',  {});

  // users (admin only)
  const listUsers    = ()                   => call('listUsers',    {});
  const saveUser     = (user)               => call('saveUser',     { user });
  const deleteUser   = (username)           => call('deleteUser',   { username });

  // logs
  const listLogs     = (filters = {})       => call('listLogs',     { filters });
  const getStats     = ()                   => call('getStats',     {});

  // recording upload — supports chunked upload for large files
  const oneshotUpload = (payload)           => call('uploadOneshot', payload);
  const startUpload  = (meta)               => call('startUpload',  meta);
  const uploadChunk  = (uploadId, index, total, chunkBase64) =>
                       call('uploadChunk',  { uploadId, index, total, chunkBase64 });
  const finishUpload = (uploadId, meta)     => call('finishUpload', { uploadId, meta });

  // maintenance
  const cleanupOld   = ()                   => call('cleanupOld',   {});
  const getStorage   = ()                   => call('getStorage',   {});

  return {
    call,
    login, verifyToken,
    listUsers, saveUser, deleteUser,
    listLogs, getStats,
    startUpload, uploadChunk, finishUpload, oneshotUpload,
    cleanupOld, getStorage,
  };
})();
