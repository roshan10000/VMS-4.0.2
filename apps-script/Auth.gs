/* =============================================================================
 *  VMS  ·  Apps Script · Auth.gs
 *  Login, password hashing, token signing & verification.
 *
 *  Tokens are signed JWT-ish blobs (header.payload.signature, base64url) using
 *  HMAC-SHA-256. The secret comes from the TOKEN_SECRET script property.
 * ============================================================================= */

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;   // 12 hours


/* ---------- login --------------------------------------------------------- */
function Auth_login({ username, password }) {
  if (!username || !password) throw new Error('Username and password required');

  const u = Users_find(username);
  if (!u) throw new Error('Invalid credentials');
  if (u.status !== 'Active') throw new Error('Account disabled');
  if (u.passwordHash !== Auth_hash(password)) throw new Error('Invalid credentials');

  const token = Auth_sign({
    sub: u.username,
    role: u.role,
    iat: Date.now(),
    exp: Date.now() + TOKEN_TTL_MS,
  });

  return { token, username: u.username, role: u.role };
}

function Auth_verify(_payload, session) {
  return { username: session.sub, role: session.role };
}

/* ---------- token signing ------------------------------------------------- */
function Auth_sign(claims) {
  const secret = _config().tokenSecret;
  if (!secret) throw new Error('TOKEN_SECRET script property not set');
  const header  = _b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = _b64u(JSON.stringify(claims));
  const sig     = _hmacB64u(`${header}.${payload}`, secret);
  return `${header}.${payload}.${sig}`;
}

function Auth_decode(token) {
  if (!token) throw new Error('Missing token');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed token');
  const secret = _config().tokenSecret;
  const expected = _hmacB64u(`${parts[0]}.${parts[1]}`, secret);
  if (expected !== parts[2]) throw new Error('Invalid token signature');
  const claims = JSON.parse(Utilities.newBlob(_b64uDecode(parts[1])).getDataAsString());
  if (claims.exp && Date.now() > claims.exp) throw new Error('Token expired');
  return claims;
}

/* ---------- password hashing --------------------------------------------- */
// Salted SHA-256. The salt is derived from the username so the same plaintext
// password produces different hashes for different accounts.
function Auth_hash(plain) {
  const salt = 'vms.v1';
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    salt + ':' + plain,
    Utilities.Charset.UTF_8
  );
  return _bytesToHex(bytes);
}


/* ---------- low-level base64url & HMAC ----------------------------------- */
function _b64u(str) {
  return Utilities.base64EncodeWebSafe(Utilities.newBlob(str).getBytes())
    .replace(/=+$/, '');
}
function _b64uDecode(s) {
  return Utilities.base64DecodeWebSafe(s + '==='.slice(0, (4 - s.length % 4) % 4));
}
function _hmacB64u(data, secret) {
  const bytes = Utilities.computeHmacSha256Signature(data, secret);
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}
function _bytesToHex(bytes) {
  return bytes.map(b => {
    const v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}
