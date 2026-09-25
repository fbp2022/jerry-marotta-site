// Cloudflare Access verification for admin routes.
// Every admin request must carry a valid Access JWT for this application's
// audience, issued by this team, for an email on the ADMIN_EMAILS allowlist.
// If any of ACCESS_TEAM_DOMAIN, ACCESS_AUD or ADMIN_EMAILS is missing the
// check fails closed.

let cachedCerts = null;
let cachedCertsAt = 0;

function b64urlToBytes(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeJson(segment) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(segment)));
}

async function getCerts(teamDomain) {
  if (cachedCerts && Date.now() - cachedCertsAt < 10 * 60 * 1000) return cachedCerts;
  const response = await fetch('https://' + teamDomain + '/cdn-cgi/access/certs');
  if (!response.ok) throw new Error('Could not load Access signing keys');
  cachedCerts = await response.json();
  cachedCertsAt = Date.now();
  return cachedCerts;
}

function allowedEmails(env) {
  return String(env.ADMIN_EMAILS || '')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);
}

export async function verifyAccess(request, env) {
  const teamDomain = String(env.ACCESS_TEAM_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const audience = String(env.ACCESS_AUD || '');
  const allowlist = allowedEmails(env);
  if (!teamDomain || !audience || !allowlist.length) return {ok: false, reason: 'not_configured'};

  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return {ok: false, reason: 'missing_token'};

  const parts = token.split('.');
  if (parts.length !== 3) return {ok: false, reason: 'malformed_token'};

  let header;
  let payload;
  try {
    header = decodeJson(parts[0]);
    payload = decodeJson(parts[1]);
  } catch {
    return {ok: false, reason: 'malformed_token'};
  }
  if (header.alg !== 'RS256') return {ok: false, reason: 'bad_algorithm'};

  const certs = await getCerts(teamDomain);
  const jwk = (certs.keys || []).find(key => key.kid === header.kid);
  if (!jwk) {
    cachedCerts = null;
    return {ok: false, reason: 'unknown_key'};
  }

  const key = await crypto.subtle.importKey('jwk', jwk, {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'}, false, ['verify']);
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlToBytes(parts[2]),
    new TextEncoder().encode(parts[0] + '.' + parts[1])
  );
  if (!valid) return {ok: false, reason: 'bad_signature'};

  const now = Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(audience)) return {ok: false, reason: 'bad_audience'};
  if (payload.iss !== 'https://' + teamDomain) return {ok: false, reason: 'bad_issuer'};
  if (typeof payload.exp !== 'number' || payload.exp < now) return {ok: false, reason: 'expired'};
  if (typeof payload.nbf === 'number' && payload.nbf > now + 60) return {ok: false, reason: 'not_yet_valid'};

  const email = String(payload.email || '').toLowerCase();
  if (!email || !allowlist.includes(email)) return {ok: false, reason: 'not_allowed'};

  return {ok: true, email};
}
