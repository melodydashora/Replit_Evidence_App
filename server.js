const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool, types: pgTypes } = require('pg');

const PORT = process.env.PORT || 3000;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';

// --- Access token gate -------------------------------------------------------------------------------
// Every request needs a valid access token, and the token decides which role the holder has. Set the
// secrets below (Replit: Tools -> Secrets); each may hold one token or several separated by commas, so
// the same role can be handed different tokens to different people and one can be revoked on its own.
// CASE_ACCESS_TOKEN (alias CASE_PASSCODE) is the original single token and keeps working as the owner.
// Without any token the site fails closed. A token must not contain a comma or leading/trailing spaces
// (commas separate tokens); use a random hex string.
const TOKENS = []; // [{ token, role }]
function registerTokens(raw, role) {
  String(raw || '').split(',').map(s => s.trim()).filter(Boolean).forEach(token => TOKENS.push({ token, role }));
}
registerTokens(process.env.CASE_TOKEN_OWNER, 'owner');
registerTokens(process.env.CASE_TOKEN_COUNSEL, 'counsel');
registerTokens(process.env.CASE_TOKEN_ADJUSTER, 'adjuster');
registerTokens(process.env.CASE_TOKEN_TNC, 'tnc');
registerTokens(process.env.CASE_ACCESS_TOKEN || process.env.CASE_PASSCODE, 'owner');

// The runtime-editable panels the front end can address. Anything else is a 400 from the API.
const COMPONENTS = ['hertz', 'property-loss', 'injury-photos', 'claims', 'carrier-messages', 'counsel-documents', 'signed-documents'];

// Single source of truth for what each role may do; the front end only ever asks /api/me.
// Everyone who holds a token sees everything. Restrictions ("checkboxes") only ever limit DOWNLOADS,
// and only for the adjuster and the casualty-group (TNC) tokens. Uploads are the owner's, except that
// counsel-documents takes counsel's uploads only and signed-documents takes both.
const ROLE_PERMISSIONS = {
  owner: {
    upload: COMPONENTS.filter(k => k !== 'counsel-documents'),
    delete: COMPONENTS.filter(k => k !== 'counsel-documents'),
    editLedger: true,
    manageRestrictions: true,
    viewAccessLog: true,
    restrictedDownloads: false
  },
  counsel: {
    upload: ['counsel-documents', 'signed-documents'],
    delete: ['counsel-documents', 'signed-documents'],
    editLedger: true,
    manageRestrictions: true,
    viewAccessLog: true,
    restrictedDownloads: false
  },
  adjuster: {
    upload: [],
    delete: [],
    editLedger: false,
    manageRestrictions: false,
    viewAccessLog: false,
    restrictedDownloads: true
  },
  tnc: {
    upload: [],
    delete: [],
    editLedger: false,
    manageRestrictions: false,
    viewAccessLog: false,
    restrictedDownloads: true
  }
};

function permissionsFor(role) {
  return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.tnc;
}

const COOKIE_NAME = 'case_access';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const FAIL_LIMIT = 20;
const failures = new Map(); // ip -> { count, first }

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.htm': 'text/html; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.csv': 'text/csv; charset=UTF-8',
  '.txt': 'text/plain; charset=UTF-8',
  '.md': 'text/markdown; charset=UTF-8',
  '.sql': 'text/plain; charset=UTF-8',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};

// Friendly URLs. The evidence portal is the landing page; the reconstruction app lives at the repo root.
const ROUTE_ALIASES = {
  '/': '/00_START_HERE_EVIDENCE_PORTAL.html',
  '/portal': '/00_START_HERE_EVIDENCE_PORTAL.html',
  '/reconstruction': '/index.html',
  '/dossier': '/00_START_HERE_CASE_OVERVIEW_AND_OFFICIAL_DOSSIER/OFFICIAL_STATEMENT_OF_FACTS_AND_CASE_DOSSIER.pdf',
  '/police-report': '/02_Certified_Police_Report_And_Crash_Records/Certified_Police_Report_TxDOT_21609720_1.pdf'
};
// Shortcuts to pages inside a binder redirect to the folder, so the page's relative script and link paths resolve.
const ROUTE_REDIRECTS = {
  '/property-loss': '/12_Personal_Property_Loss_And_Vehicle_Contents/',
  '/rental-car': '/13_Rental_Car_And_Loss_Of_Use/',
  '/correspondence': '/14_Correspondence_Counsel_And_Signed_Documents/'
};

// Never serve dotfiles (.git, .env, .replit, ...) or node_modules.
function isHiddenPath(relPath) {
  return relPath.split(path.sep).some(seg => seg.startsWith('.') || seg === 'node_modules');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sendHtml(res, status, body, extraHeaders) {
  res.writeHead(status, Object.assign({ 'Content-Type': 'text/html; charset=UTF-8', 'Cache-Control': 'no-store' }, extraHeaders || {}));
  res.end(body);
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=UTF-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function notFoundPage(reqUrl) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>404 - Exhibit Not Found</title></head>
<body style="font-family:sans-serif; text-align:center; padding:50px; background:#0b0f19; color:#f8fafc;">
  <h2>404 - Exhibit Document Not Found</h2>
  <p>Path: <code>${escapeHtml(reqUrl)}</code></p>
  <p><a style="color:#38bdf8" href="/">Return to Master Evidence Portal</a> | <a style="color:#38bdf8" href="/reconstruction">Open Reconstruction</a></p>
</body></html>`;
}

// --- Access token helpers ----------------------------------------------------------------------------
// The token itself is the HMAC key, so the cookie proves possession of the token without containing it. The
// message includes a 30-day time bucket, so a cookie stops working within 30-60 days even if it is copied, and
// every server instance mints the same value without shared state.
function cookieBucket(offset) {
  return Math.floor(Date.now() / (COOKIE_MAX_AGE * 1000)) + (offset || 0);
}
function cookieValueFor(token, bucketOffset) {
  return 'v2.' + crypto.createHmac('sha256', token).update('case-access-cookie-v2|' + cookieBucket(bucketOffset)).digest('hex');
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Both return the role string of the matching token, or null. They compare against every configured token
// (no early exit) so the answer takes the same time whichever token was given.
function roleForToken(candidate) {
  if (!candidate) return null;
  let role = null;
  for (const entry of TOKENS) if (safeEqual(entry.token, candidate) && role === null) role = entry.role;
  return role;
}

function roleForCookie(value) {
  if (!value) return null;
  let role = null;
  for (const entry of TOKENS) {
    const hit = safeEqual(cookieValueFor(entry.token, 0), value) || safeEqual(cookieValueFor(entry.token, -1), value);
    if (hit && role === null) role = entry.role;
  }
  return role;
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  raw.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx > 0) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}

function isHttps(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  return proto === 'https' || Boolean(req.socket && req.socket.encrypted);
}

function setCookieHeader(req, token) {
  return `${COOKIE_NAME}=${cookieValueFor(token)}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax${isHttps(req) ? '; Secure' : ''}`;
}

function clearCookieHeader(req) {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${isHttps(req) ? '; Secure' : ''}`;
}

function clientIp(req) {
  // Behind Replit's proxy the address it appended is the last one; earlier entries can be forged by the client.
  const chain = String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
  return chain[chain.length - 1] || (req.socket && req.socket.remoteAddress) || 'unknown';
}

function tooManyFailures(ip) {
  const rec = failures.get(ip);
  if (!rec) return false;
  if (Date.now() - rec.first > FAIL_WINDOW_MS) { failures.delete(ip); return false; }
  return rec.count >= FAIL_LIMIT;
}

function recordFailure(ip) {
  const rec = failures.get(ip);
  if (!rec || Date.now() - rec.first > FAIL_WINDOW_MS) failures.set(ip, { count: 1, first: Date.now() });
  else rec.count += 1;
}

// Forget expired failure records so the map cannot grow without bound under a rotating-address attack.
setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of failures) if (now - rec.first > FAIL_WINDOW_MS) failures.delete(ip);
  if (failures.size > 10000) failures.clear();
}, 5 * 60 * 1000).unref();

// A "next" target after sign-in must stay on this site.
function safeNext(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
  if (value.startsWith('/access') || value.startsWith('/logout')) return '/';
  if (!/^[\x21-\x7e]{1,2048}$/.test(value)) return '/'; // no spaces, control characters or header-breaking bytes
  if (/^\/%2f/i.test(value) || /^\/%5c/i.test(value)) return '/';
  return value;
}

function wantsHtml(req) {
  return String(req.headers.accept || '').includes('text/html');
}

// Presented on any request that does not carry a valid token.
function gatePage(nextPath, message) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Access Token Required | Case Evidence Portal</title>
<style>
  :root { --bg:#0b0f19; --card:#131b2e; --border:rgba(255,255,255,0.08); --text:#f8fafc; --muted:#94a3b8; --accent:#38bdf8; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { min-height:100vh; display:flex; align-items:center; justify-content:center; background:radial-gradient(circle at 20% 0%, #1e293b 0%, var(--bg) 55%); color:var(--text); font-family:'Inter',-apple-system,'Segoe UI',sans-serif; padding:24px; }
  .card { width:100%; max-width:440px; background:var(--card); border:1px solid rgba(56,189,248,0.3); border-radius:14px; padding:32px 30px; box-shadow:0 20px 50px rgba(0,0,0,0.5); }
  .lock { width:44px; height:44px; border-radius:10px; background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.5); display:flex; align-items:center; justify-content:center; margin-bottom:18px; }
  .lock svg { width:22px; height:22px; fill:none; stroke:#fca5a5; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }
  .badge { font-size:10.5px; font-weight:700; letter-spacing:.8px; text-transform:uppercase; color:#fca5a5; margin-bottom:10px; }
  h1 { font-size:20px; font-weight:800; margin-bottom:6px; }
  p { color:var(--muted); font-size:13.5px; line-height:1.55; margin-bottom:18px; }
  label { display:block; font-size:12px; font-weight:700; color:#cbd5e1; margin-bottom:6px; letter-spacing:.3px; }
  input { width:100%; background:var(--bg); color:var(--text); border:1px solid rgba(255,255,255,0.16); border-radius:8px; padding:12px 14px; font-size:15px; font-family:'JetBrains Mono',Menlo,Consolas,monospace; letter-spacing:.5px; outline:none; }
  input:focus { border-color:var(--accent); box-shadow:0 0 0 3px rgba(56,189,248,0.2); }
  button { margin-top:14px; width:100%; background:linear-gradient(135deg,#0284c7 0%,#0369a1 100%); color:#fff; border:1px solid rgba(255,255,255,0.15); border-radius:8px; padding:12px; font-size:14px; font-weight:700; cursor:pointer; }
  button:hover { background:linear-gradient(135deg,#0369a1 0%,#075985 100%); }
  .err { background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.45); color:#fecaca; border-radius:8px; padding:10px 12px; font-size:13px; margin-bottom:16px; }
  .foot { margin-top:18px; font-size:11.5px; color:#64748b; line-height:1.5; }
</style></head><body>
  <form class="card" method="POST" action="/access" autocomplete="off">
    <div class="lock"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></div>
    <div class="badge">Confidential &middot; Attorney-Client Privileged</div>
    <h1>Case Evidence Portal</h1>
    <p>Dashora v. Savala-Fitzpatrick &middot; TxDOT Crash ID 21609720.1. Enter the access token you were given to open the evidence portfolio.</p>
    ${message ? `<div class="err">${escapeHtml(message)}</div>` : ''}
    <label for="token">Access token</label>
    <input id="token" name="token" type="password" inputmode="text" autocapitalize="off" spellcheck="false" autofocus required>
    <input type="hidden" name="next" value="${escapeHtml(nextPath || '/')}">
    <button type="submit">Open the portfolio</button>
    <div class="foot">The token is remembered on this browser for 30 days. Use &ldquo;Sign out&rdquo; in the page header to forget it.</div>
  </form>
</body></html>`;
}

function notConfiguredPage() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Access Token Not Configured</title>
<style>
  body { min-height:100vh; display:flex; align-items:center; justify-content:center; background:#0b0f19; color:#f8fafc; font-family:'Inter',-apple-system,'Segoe UI',sans-serif; padding:24px; margin:0; }
  .card { max-width:560px; background:#131b2e; border:1px solid rgba(245,158,11,0.5); border-radius:14px; padding:30px; }
  h1 { font-size:19px; margin:0 0 10px; color:#fbbf24; } p, li { color:#cbd5e1; font-size:13.5px; line-height:1.6; } code { font-family:Menlo,Consolas,monospace; color:#38bdf8; }
  ol { padding-left:20px; }
</style></head><body><div class="card">
  <h1>This site is locked until an access token is configured</h1>
  <p>The evidence portfolio is confidential, so the server refuses every request until <code>CASE_ACCESS_TOKEN</code> is set.</p>
  <ol>
    <li>In Replit open <strong>Tools &rarr; Secrets</strong> and add <code>CASE_ACCESS_TOKEN</code> with the token to hand out (several tokens may be separated by commas).</li>
    <li>Restart the server (Stop, then Run). For a deployment, add the same secret under the deployment&rsquo;s settings and redeploy.</li>
    <li>Locally: <code>CASE_ACCESS_TOKEN=your-token node server.js</code></li>
  </ol>
</div></body></html>`;
}

// Folder listing for exhibit folders that have no index.html, so every file in the repository is reachable.
function listDirectory(dirAbs) {
  return fs.readdirSync(dirAbs, { withFileTypes: true })
    .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules')
    .sort((a, b) => (Number(b.isDirectory()) - Number(a.isDirectory())) || a.name.localeCompare(b.name, undefined, { numeric: true }))
    .map(e => {
      const abs = path.join(dirAbs, e.name);
      const stat = fs.statSync(abs);
      return {
        name: e.name,
        type: e.isDirectory() ? 'dir' : 'file',
        ext: e.isDirectory() ? '' : path.extname(e.name).slice(1).toLowerCase(),
        size: e.isDirectory() ? fs.readdirSync(abs).filter(n => !n.startsWith('.')).length : stat.size,
        mtime: stat.mtime.toISOString()
      };
    });
}

function renderDirectory(dirAbs, urlPath) {
  const entries = listDirectory(dirAbs);

  const segments = urlPath.split('/').filter(Boolean);
  let crumbHref = '';
  const crumbs = segments.map((seg, i) => {
    crumbHref += '/' + encodeURIComponent(seg);
    const label = escapeHtml(seg.replace(/_/g, ' '));
    return i === segments.length - 1 ? `<span>${label}</span>` : `<a href="${crumbHref}/">${label}</a>`;
  });

  const rows = entries.map(e => {
    const href = encodeURIComponent(e.name) + (e.type === 'dir' ? '/' : '');
    const ext = e.type === 'dir' ? 'Folder' : (e.ext.toUpperCase() || 'File');
    const size = e.type === 'dir' ? `${e.size} items` : formatSize(e.size);
    const icon = e.type === 'dir' ? '&#128193;' : (/^(png|jpe?g|webp|gif)$/.test(e.ext) ? '&#128247;' : e.ext === 'pdf' ? '&#128196;' : '&#128462;');
    const target = e.type === 'dir' ? '' : ' target="_blank" rel="noopener"';
    return `<tr><td><a href="${href}"${target}>${icon} ${escapeHtml(e.name)}</a></td><td>${ext}</td><td class="num">${size}</td><td class="num">${e.mtime.slice(0, 10)}</td></tr>`;
  }).join('\n');

  const title = escapeHtml((segments[segments.length - 1] || 'Exhibits').replace(/_/g, ' '));
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} | Evidence Repository</title>
<style>
  :root { --bg:#0b0f19; --card:#1a233a; --border:rgba(255,255,255,0.08); --text:#f8fafc; --muted:#94a3b8; --accent:#38bdf8; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { background:var(--bg); color:var(--text); font-family:'Inter',-apple-system,'Segoe UI',sans-serif; line-height:1.5; }
  .container { max-width:1000px; margin:0 auto; padding:30px 20px 60px; }
  .crumbs { font-size:13px; color:var(--muted); margin-bottom:18px; }
  .crumbs a { color:var(--accent); text-decoration:none; }
  .crumbs span, .crumbs a { margin-right:6px; }
  .crumbs a::after { content:'/'; color:var(--muted); margin-left:6px; }
  h1 { font-size:22px; margin-bottom:6px; }
  p.note { color:var(--muted); font-size:13px; margin-bottom:20px; }
  table { width:100%; border-collapse:collapse; background:var(--card); border:1px solid var(--border); border-radius:10px; overflow:hidden; }
  th, td { text-align:left; padding:10px 14px; border-bottom:1px solid var(--border); font-size:14px; }
  th { color:var(--muted); font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:0.04em; }
  td a { color:var(--accent); text-decoration:none; word-break:break-word; }
  td a:hover { text-decoration:underline; }
  td.num, th.num { text-align:right; white-space:nowrap; color:var(--muted); font-variant-numeric:tabular-nums; }
</style></head><body>
<script src="/site_header.js"></script>
<div class="container">
  <div class="crumbs"><a href="/">Evidence Portal</a>${crumbs.join('')}</div>
  <h1>${title}</h1>
  <p class="note">${entries.length} item${entries.length === 1 ? '' : 's'} · Confidential attorney-client privileged work product</p>
  <table><thead><tr><th>Name</th><th>Type</th><th class="num">Size</th><th class="num">Modified</th></tr></thead><tbody>
${rows}
  </tbody></table>
</div></body></html>`;
}

// --- Google Map Tiles API proxy (2D satellite). The API key never leaves the server. ---
let tileSession = null; // { token, expiry (unix seconds) }

async function getTileSession(forceNew) {
  const nowSec = Date.now() / 1000;
  if (!forceNew && tileSession && tileSession.expiry - nowSec > 300) return tileSession.token;
  const resp = await fetch(`https://tile.googleapis.com/v1/createSession?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mapType: 'satellite', language: 'en-US', region: 'US' })
  });
  if (!resp.ok) throw new Error(`Map Tiles createSession failed: HTTP ${resp.status}`);
  const data = await resp.json();
  tileSession = { token: data.session, expiry: Number(data.expiry) || (nowSec + 3600) };
  return tileSession.token;
}

async function proxyGoogleTile(res, z, x, y) {
  if (!GOOGLE_MAPS_API_KEY) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=UTF-8' });
    return res.end('GOOGLE_MAPS_API_KEY is not configured on the server.');
  }
  try {
    let token = await getTileSession(false);
    let upstream = await fetch(`https://tile.googleapis.com/v1/2dtiles/${z}/${x}/${y}?session=${encodeURIComponent(token)}&key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}`);
    if (upstream.status === 400 || upstream.status === 401 || upstream.status === 403) {
      token = await getTileSession(true); // session expired or invalid: mint a new one and retry once
      upstream = await fetch(`https://tile.googleapis.com/v1/2dtiles/${z}/${x}/${y}?session=${encodeURIComponent(token)}&key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}`);
    }
    if (!upstream.ok) {
      res.writeHead(upstream.status === 404 ? 404 : 502, { 'Content-Type': 'text/plain; charset=UTF-8' });
      return res.end(`Google tile request failed: HTTP ${upstream.status}`);
    }
    const body = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(200, {
      'Content-Type': upstream.headers.get('content-type') || 'image/jpeg',
      'Content-Length': body.length,
      'Cache-Control': 'private, max-age=3600'
    });
    res.end(body);
  } catch (err) {
    console.error('Google tile proxy error:', err.message);
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=UTF-8' });
    res.end('Google tile proxy error.');
  }
}

function readBody(req, limit, cb) {
  let data = '';
  let done = false;
  req.on('data', chunk => {
    if (done) return;
    data += chunk;
    if (data.length > limit) { done = true; cb(new Error('body too large')); req.destroy(); }
  });
  req.on('end', () => { if (!done) { done = true; cb(null, data); } });
  req.on('error', err => { if (!done) { done = true; cb(err); } });
}

// Returns the caller's role string when the request may proceed; otherwise false, and the request has
// already been answered.
function enforceAccess(req, res, url) {
  if (!TOKENS.length) {
    sendHtml(res, 503, notConfiguredPage());
    return false;
  }

  const ip = clientIp(req);

  // Sign-out: forget the cookie, then show the gate.
  if (url.pathname === '/logout') {
    res.writeHead(303, { Location: '/', 'Set-Cookie': clearCookieHeader(req), 'Cache-Control': 'no-store' });
    res.end();
    return false;
  }

  // Sign-in form submission.
  if (url.pathname === '/access' && req.method === 'POST') {
    if (tooManyFailures(ip)) {
      sendHtml(res, 429, gatePage('/', 'Too many incorrect attempts. Wait 15 minutes and try again.'));
      return false;
    }
    readBody(req, 4096, (err, body) => {
      if (err) return sendHtml(res, 400, gatePage('/', 'The sign-in request could not be read.'));
      const form = new URLSearchParams(body);
      const token = (form.get('token') || '').trim();
      const next = safeNext(form.get('next'));
      const role = roleForToken(token);
      if (role) {
        failures.delete(ip);
        logAccess(req, role, '/access', 303, 'sign-in');
        res.writeHead(303, { Location: next, 'Set-Cookie': setCookieHeader(req, token), 'Cache-Control': 'no-store' });
        return res.end();
      }
      recordFailure(ip);
      logAccess(req, 'unknown', '/access', 401, 'sign-in refused');
      sendHtml(res, 401, gatePage(next, 'That access token is not recognised.'));
    });
    return false;
  }

  // A token in the URL (shareable link) becomes a cookie, and the token is removed from the address bar.
  const queryToken = url.searchParams.get('token');
  if (queryToken !== null) {
    if (tooManyFailures(ip)) {
      sendHtml(res, 429, gatePage('/', 'Too many incorrect attempts. Wait 15 minutes and try again.'));
      return false;
    }
    const linkRole = roleForToken(queryToken.trim());
    if (linkRole) {
      failures.delete(ip);
      url.searchParams.delete('token');
      const clean = safeNext(url.pathname + (url.searchParams.toString() ? '?' + url.searchParams.toString() : ''));
      logAccess(req, linkRole, url.pathname, 303, 'sign-in');
      res.writeHead(303, { Location: clean, 'Set-Cookie': setCookieHeader(req, queryToken.trim()), 'Cache-Control': 'no-store' });
      res.end();
      return false;
    }
    recordFailure(ip);
    logAccess(req, 'unknown', url.pathname, 401, 'sign-in refused');
    sendHtml(res, 401, gatePage(url.pathname, 'The access token in that link is not recognised.'));
    return false;
  }

  // Cookie set by a previous sign-in.
  const cookieRole = roleForCookie(parseCookies(req)[COOKIE_NAME]);
  if (cookieRole) return cookieRole;

  // Authorization header (curl, scripted checks, older Basic-auth bookmarks).
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const [scheme, value = ''] = authHeader.split(' ');
    if (/^bearer$/i.test(scheme)) {
      const bearerRole = roleForToken(value.trim());
      if (bearerRole) return bearerRole;
    }
    if (/^basic$/i.test(scheme)) {
      const decoded = Buffer.from(value, 'base64').toString();
      const idx = decoded.indexOf(':');
      const login = idx >= 0 ? decoded.slice(0, idx) : decoded;
      const password = idx >= 0 ? decoded.slice(idx + 1) : '';
      const basicRole = roleForToken(password) || roleForToken(login);
      if (basicRole) return basicRole;
    }
  }

  // Not authenticated. Browsers get the sign-in page; everything else gets a bare 401.
  if (url.pathname === '/access' || wantsHtml(req)) {
    const next = url.pathname === '/access' ? safeNext(url.searchParams.get('next')) : safeNext(url.pathname + url.search);
    sendHtml(res, 401, gatePage(next, ''));
  } else {
    res.writeHead(401, { 'Content-Type': 'text/plain; charset=UTF-8', 'Cache-Control': 'no-store' });
    res.end('An access token is required for this evidence portfolio.');
  }
  return false;
}

// --- Upload store (PostgreSQL) -----------------------------------------------------------------------
// The deployment target is Replit Autoscale, whose filesystem is ephemeral, so everything that can be
// edited at runtime (uploaded files, the rental ledger, download restrictions, the access log) lives in
// Postgres instead of on disk. `npm run pull:uploads` copies the files back into the binder folders.
// When DATABASE_URL is unset or unreachable the static site is unaffected: only /api/ answers 503.
const DATABASE_URL = process.env.DATABASE_URL || '';
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_JSON_BYTES = 64 * 1024;

// A DATE column is a calendar day, not an instant: keep it as the stored 'YYYY-MM-DD' text so no
// timezone can shift a receipt date by a day on the way to the browser.
pgTypes.setTypeParser(1082, v => v);

let pool = null;
let schemaReady = null;
let dbFailureLogged = false;

function noteDbFailure(err) {
  if (dbFailureLogged) return; // once, not once per request
  dbFailureLogged = true;
  console.error('Upload store unavailable; /api/ routes answer 503 while the rest of the site keeps serving. Reason:', err && err.message);
}

function getPool() {
  if (!DATABASE_URL) return null;
  if (!pool) {
    // sslmode in the connection string decides TLS (Replit sets it), so there is nothing to configure here.
    pool = new Pool({ connectionString: DATABASE_URL, max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 8000 });
    pool.on('error', err => noteDbFailure(err)); // an idle client dropping must never take the process down
  }
  return pool;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS files (
  id            serial PRIMARY KEY,
  component     text NOT NULL,
  name          text NOT NULL,
  mime          text NOT NULL,
  size          integer NOT NULL,
  sha256        text NOT NULL,
  data          bytea NOT NULL,
  caption       text NOT NULL DEFAULT '',
  doc_date      date,
  uploaded_by   text NOT NULL,
  uploaded_at   timestamptz NOT NULL DEFAULT now(),
  restricted    boolean NOT NULL DEFAULT false,
  deleted_at    timestamptz,
  deleted_by    text
);
CREATE INDEX IF NOT EXISTS files_component_idx ON files (component, deleted_at);
CREATE TABLE IF NOT EXISTS ledger_entries (
  id              serial PRIMARY KEY,
  component       text NOT NULL,
  entry_date      date,
  description     text NOT NULL DEFAULT '',
  amount          numeric(12,2) NOT NULL DEFAULT 0,
  paid_by_client  numeric(12,2) NOT NULL DEFAULT 0,
  paid_by_insurer numeric(12,2) NOT NULL DEFAULT 0,
  note            text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      text NOT NULL,
  deleted_at      timestamptz,
  deleted_by      text
);
CREATE TABLE IF NOT EXISTS restrictions (
  scope       text PRIMARY KEY,
  restricted  boolean NOT NULL DEFAULT false,
  updated_by  text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS access_log (
  id      bigserial PRIMARY KEY,
  ts      timestamptz NOT NULL DEFAULT now(),
  role    text NOT NULL,
  ip      text NOT NULL DEFAULT '',
  method  text NOT NULL,
  path    text NOT NULL,
  status  integer NOT NULL,
  note    text NOT NULL DEFAULT ''
);
`;

// Every statement goes through here, so the schema is created lazily on the first API call and a
// connection problem always surfaces as one kind of error the API router turns into a 503.
async function dbQuery(text, params) {
  const p = getPool();
  if (!p) {
    const err = new Error('DATABASE_URL is not set');
    err.dbUnavailable = true;
    throw err;
  }
  if (!schemaReady) {
    schemaReady = p.query(SCHEMA_SQL).catch(err => { schemaReady = null; throw err; }); // retry on the next call
  }
  await schemaReady;
  return p.query(text, params);
}

// Only a real connection problem should read as "not configured". A bug in a route handler must stay a 500
// and keep being logged, or the one-shot noteDbFailure() would hide it.
function isConnectionError(err) {
  if (!err) return false;
  if (err.dbUnavailable) return true;
  if (/^E[A-Z]+$/.test(String(err.code || ''))) return true; // ECONNREFUSED, ENOTFOUND, ETIMEDOUT, ECONNRESET
  return /timeout exceeded when trying to connect|Connection terminated|client password must be|no pg_hba/i.test(String(err.message || ''));
}

// Fire and forget: the access log must never delay or fail a response.
function logAccess(req, role, pathValue, status, note) {
  if (!DATABASE_URL) return;
  dbQuery(
    'INSERT INTO access_log (role, ip, method, path, status, note) VALUES ($1, $2, $3, $4, $5, $6)',
    [String(role || 'unknown'), clientIp(req), String(req.method || ''), String(pathValue || '').slice(0, 500), Number(status) || 0, String(note || '')]
  ).catch(err => noteDbFailure(err));
}

// Documents handed out from disk are logged; the pages, scripts, styles and map tiles that make up the
// site are not, or the log would be unreadable.
const LOGGED_DOCUMENT_EXTS = ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.heic', '.mp4', '.mov', '.csv', '.md', '.txt', '.docx'];

// --- API ---------------------------------------------------------------------------------------------
const UPLOAD_MIME_TYPES = [
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
  'application/pdf', 'text/plain', 'text/markdown', 'text/csv', 'message/rfc822',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'video/mp4', 'video/quicktime', 'application/octet-stream'
];
// Types a browser should not try to display inline.
const ATTACHMENT_MIME_TYPES = [
  'application/octet-stream',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'video/mp4', 'video/quicktime'
];

function apiError(res, status, message) {
  sendJson(res, status, { error: message });
}

function readRawBody(req, limit, cb) {
  const chunks = [];
  let total = 0;
  let done = false;
  req.on('data', chunk => {
    if (done) return;
    total += chunk.length;
    if (total > limit) {
      done = true;
      const err = new Error('body too large');
      err.tooLarge = true;
      return cb(err);
    }
    chunks.push(chunk);
  });
  req.on('end', () => { if (!done) { done = true; cb(null, Buffer.concat(chunks, total)); } });
  req.on('error', err => { if (!done) { done = true; cb(err); } });
}

// Answer, then stop reading: draining a rejected 25 MB upload would cost exactly what the cap saves.
function refuseTooLarge(req, res, message) {
  if (!res.headersSent) {
    res.writeHead(413, { 'Content-Type': 'application/json; charset=UTF-8', 'Cache-Control': 'no-store', 'Connection': 'close' });
    res.end(JSON.stringify({ error: message }));
  }
  req.pause();
  res.on('finish', () => { if (req.socket && !req.socket.destroyed) req.socket.destroy(); });
}

// Resolve with the parsed body, or with null when the request has already been answered.
function readJsonBody(req, res) {
  return new Promise(resolve => {
    readRawBody(req, MAX_JSON_BYTES, (err, buf) => {
      if (err && err.tooLarge) { refuseTooLarge(req, res, 'That request body is too large.'); return resolve(null); }
      if (err) { apiError(res, 400, 'The request body could not be read.'); return resolve(null); }
      if (!buf || !buf.length) return resolve({});
      let parsed;
      try {
        parsed = JSON.parse(buf.toString('utf8'));
      } catch (e) {
        apiError(res, 400, 'The request body is not valid JSON.');
        return resolve(null);
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        apiError(res, 400, 'The request body must be a JSON object.');
        return resolve(null);
      }
      resolve(parsed);
    });
  });
}

function readUploadBody(req, res) {
  return new Promise(resolve => {
    readRawBody(req, MAX_UPLOAD_BYTES, (err, buf) => {
      if (err && err.tooLarge) { refuseTooLarge(req, res, 'That file is larger than the 25 MB limit.'); return resolve(null); }
      if (err) { apiError(res, 400, 'The upload could not be read.'); return resolve(null); }
      resolve(buf);
    });
  });
}

// The stored name is only ever used as a label and as a download filename, never as a path.
function sanitiseFileName(raw) {
  let name = String(raw || '');
  try { name = decodeURIComponent(name); } catch (e) { /* not percent-encoded: take it as given */ }
  name = name.replace(/[\\/]/g, '_').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (name === '.' || name === '..') name = '';
  return name.slice(0, 200);
}

function decodeHeaderText(raw) {
  let value = String(raw || '');
  try { value = decodeURIComponent(value); } catch (e) { /* not percent-encoded: take it as given */ }
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
}

function isDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
  const d = new Date(String(value) + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === String(value);
}

// An empty <input type="date"> posts '', which means "no date", not "a bad date".
function dateOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// RFC 5987 wants these percent-encoded too; encodeURIComponent leaves them alone and an apostrophe in a
// file name would otherwise break the filename* parameter.
function rfc5987(name) {
  return encodeURIComponent(name).replace(/['()*!]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function fileRecord(row, componentRestricted, perms) {
  const restricted = Boolean(row.restricted);
  return {
    id: row.id,
    name: row.name,
    mime: row.mime,
    size: row.size,
    sha256: row.sha256,
    caption: row.caption,
    doc_date: row.doc_date || null,
    uploaded_by: row.uploaded_by,
    uploaded_at: row.uploaded_at,
    restricted: restricted,
    // Restrictions only ever limit downloads, and only for the adjuster and casualty-group tokens.
    downloadable: !(perms.restrictedDownloads && (componentRestricted || restricted))
  };
}

function ledgerRecord(row) {
  return {
    id: row.id,
    entry_date: row.entry_date || null,
    description: row.description,
    amount: Number(row.amount),
    paid_by_client: Number(row.paid_by_client),
    paid_by_insurer: Number(row.paid_by_insurer),
    note: row.note,
    updated_at: row.updated_at,
    updated_by: row.updated_by
  };
}

const FILE_COLUMNS = 'id, component, name, mime, size, sha256, caption, doc_date, uploaded_by, uploaded_at, restricted';

async function componentIsRestricted(component) {
  const r = await dbQuery('SELECT restricted FROM restrictions WHERE scope = $1', ['component:' + component]);
  return r.rows.length ? Boolean(r.rows[0].restricted) : false;
}

function handleApi(req, res, url, reqUrl, role) {
  apiRoute(req, res, url, reqUrl, role).catch(err => {
    if (isConnectionError(err)) {
      noteDbFailure(err);
      if (!res.headersSent) apiError(res, 503, 'database not configured');
      return;
    }
    console.error('API error:', err && err.message);
    if (!res.headersSent) apiError(res, 500, 'The request could not be completed.');
  });
}

async function apiRoute(req, res, url, reqUrl, role) {
  const perms = permissionsFor(role);
  const method = req.method || 'GET';
  const isMutation = method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE';

  // A mutation must come from the portal's own scripts: a plain cross-site form cannot set this header,
  // and the cookie is SameSite=Lax, so together they keep another site from acting as the signed-in user.
  if (isMutation) {
    if (String(req.headers['x-requested-with'] || '') !== 'CaseComponents') {
      return apiError(res, 403, 'This request must come from the case portal.');
    }
    const origin = req.headers.origin;
    if (origin) {
      let originHost = '';
      try { originHost = new URL(origin).host; } catch (e) { originHost = ''; }
      if (!originHost || originHost !== String(req.headers.host || '')) {
        return apiError(res, 403, 'This request came from another site.');
      }
    }
  }

  // --- /api/me: the only thing the front end asks about permissions.
  if (reqUrl === '/api/me' && method === 'GET') {
    return sendJson(res, 200, {
      role: role,
      permissions: {
        upload: perms.upload.slice(),
        delete: perms.delete.slice(),
        editLedger: perms.editLedger,
        manageRestrictions: perms.manageRestrictions,
        viewAccessLog: perms.viewAccessLog,
        restrictedDownloads: perms.restrictedDownloads
      },
      components: COMPONENTS.slice()
    });
  }

  // --- /api/files
  if (reqUrl === '/api/files' && method === 'GET') {
    const component = String(url.searchParams.get('component') || '');
    if (COMPONENTS.indexOf(component) === -1) return apiError(res, 400, 'That is not a known component.');
    const restricted = await componentIsRestricted(component);
    const r = await dbQuery(
      `SELECT ${FILE_COLUMNS} FROM files WHERE component = $1 AND deleted_at IS NULL
       ORDER BY doc_date DESC NULLS LAST, uploaded_at DESC`,
      [component]
    );
    return sendJson(res, 200, {
      component: component,
      restricted: restricted,
      files: r.rows.map(row => fileRecord(row, restricted, perms))
    });
  }

  if (reqUrl === '/api/files' && method === 'POST') {
    const component = String(url.searchParams.get('component') || '');
    if (COMPONENTS.indexOf(component) === -1) return apiError(res, 400, 'That is not a known component.');
    if (perms.upload.indexOf(component) === -1) return apiError(res, 403, 'Your access token cannot upload to this panel.');

    const mime = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (UPLOAD_MIME_TYPES.indexOf(mime) === -1) return apiError(res, 415, 'That file type is not accepted here.');

    const name = sanitiseFileName(req.headers['x-file-name']);
    if (!name) return apiError(res, 400, 'The upload needs an X-File-Name header with the file name.');

    const caption = decodeHeaderText(req.headers['x-caption']).slice(0, 2000);
    const docDateRaw = decodeHeaderText(req.headers['x-doc-date']);
    if (docDateRaw && !isDateString(docDateRaw)) return apiError(res, 400, 'The document date must be written YYYY-MM-DD.');

    const body = await readUploadBody(req, res);
    if (body === null) return; // already answered (413 or unreadable)
    if (!body.length) return apiError(res, 400, 'The uploaded file is empty.');

    const sha256 = crypto.createHash('sha256').update(body).digest('hex');
    const inserted = await dbQuery(
      `INSERT INTO files (component, name, mime, size, sha256, data, caption, doc_date, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING ${FILE_COLUMNS}`,
      [component, name, mime, body.length, sha256, body, caption, docDateRaw || null, role]
    );
    const restricted = await componentIsRestricted(component);
    logAccess(req, role, reqUrl, 201, 'upload');
    return sendJson(res, 201, fileRecord(inserted.rows[0], restricted, perms));
  }

  const fileMatch = reqUrl.match(/^\/api\/files\/(\d{1,12})$/);
  if (fileMatch) {
    const id = Number(fileMatch[1]);

    // HEAD answers with the same headers and no body (Node drops it), so a browser or a link checker can
    // ask about a file without pulling the bytes.
    if (method === 'GET' || method === 'HEAD') {
      const r = await dbQuery('SELECT id, component, name, mime, size, restricted, data FROM files WHERE id = $1 AND deleted_at IS NULL', [id]);
      if (!r.rows.length) {
        logAccess(req, role, reqUrl, 404, 'download');
        return apiError(res, 404, 'That file is not in the store.');
      }
      const row = r.rows[0];
      const compRestricted = await componentIsRestricted(row.component);
      if (perms.restrictedDownloads && (compRestricted || row.restricted)) {
        logAccess(req, role, reqUrl, 403, 'download refused (restricted)');
        return apiError(res, 403, 'This file is restricted for your access token.');
      }
      const asAttachment = url.searchParams.get('download') === '1' || ATTACHMENT_MIME_TYPES.indexOf(row.mime) !== -1;
      res.writeHead(200, {
        'Content-Type': row.mime,
        'Content-Length': row.data.length,
        'Content-Disposition': (asAttachment ? 'attachment' : 'inline') + "; filename*=UTF-8''" + rfc5987(row.name),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store'
      });
      logAccess(req, role, reqUrl, 200, 'download');
      return res.end(row.data);
    }

    if (method === 'PATCH') {
      const body = await readJsonBody(req, res);
      if (body === null) return;
      const existing = await dbQuery('SELECT id, component, uploaded_by FROM files WHERE id = $1 AND deleted_at IS NULL', [id]);
      if (!existing.rows.length) return apiError(res, 404, 'That file is not in the store.');
      const row = existing.rows[0];

      const wantsMetadata = Object.prototype.hasOwnProperty.call(body, 'caption') || Object.prototype.hasOwnProperty.call(body, 'doc_date');
      const wantsRestriction = Object.prototype.hasOwnProperty.call(body, 'restricted');
      if (!wantsMetadata && !wantsRestriction) return apiError(res, 400, 'Nothing to change in that request.');
      // The owner captions anything; counsel captions what counsel uploaded.
      if (wantsMetadata && !(role === 'owner' || (role === 'counsel' && row.uploaded_by === 'counsel'))) {
        return apiError(res, 403, 'Your access token cannot edit this file.');
      }
      if (wantsRestriction && !perms.manageRestrictions) {
        return apiError(res, 403, 'Your access token cannot change restrictions.');
      }

      const sets = [];
      const values = [];
      if (Object.prototype.hasOwnProperty.call(body, 'caption')) {
        if (typeof body.caption !== 'string') return apiError(res, 400, 'The caption must be text.');
        values.push(body.caption.slice(0, 2000));
        sets.push('caption = $' + values.length);
      }
      if (Object.prototype.hasOwnProperty.call(body, 'doc_date')) {
        const docDate = dateOrNull(body.doc_date);
        if (docDate !== null && !isDateString(docDate)) return apiError(res, 400, 'The document date must be written YYYY-MM-DD, or null.');
        values.push(docDate);
        sets.push('doc_date = $' + values.length);
      }
      if (wantsRestriction) {
        if (typeof body.restricted !== 'boolean') return apiError(res, 400, 'The restricted flag must be true or false.');
        values.push(body.restricted);
        sets.push('restricted = $' + values.length);
      }
      values.push(id);
      const updated = await dbQuery(`UPDATE files SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING ${FILE_COLUMNS}`, values);
      if (wantsRestriction) {
        // Keep /api/restrictions in step with the file row it reports on.
        await dbQuery(
          `INSERT INTO restrictions (scope, restricted, updated_by, updated_at) VALUES ($1, $2, $3, now())
           ON CONFLICT (scope) DO UPDATE SET restricted = EXCLUDED.restricted, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          ['file:' + id, body.restricted, role]
        );
      }
      const restricted = await componentIsRestricted(row.component);
      logAccess(req, role, reqUrl, 200, 'patch');
      return sendJson(res, 200, fileRecord(updated.rows[0], restricted, perms));
    }

    if (method === 'DELETE') {
      const existing = await dbQuery('SELECT id, component FROM files WHERE id = $1 AND deleted_at IS NULL', [id]);
      if (!existing.rows.length) return apiError(res, 404, 'That file is not in the store.');
      if (perms.delete.indexOf(existing.rows[0].component) === -1) {
        return apiError(res, 403, 'Your access token cannot remove files from this panel.');
      }
      // Nothing is hard-deleted: the row keeps its bytes and gains a deletion stamp.
      await dbQuery('UPDATE files SET deleted_at = now(), deleted_by = $1 WHERE id = $2', [role, id]);
      logAccess(req, role, reqUrl, 200, 'delete');
      return sendJson(res, 200, { ok: true });
    }

    return apiError(res, 400, 'That method is not supported on this file.');
  }

  // --- /api/ledger
  if (reqUrl === '/api/ledger' && method === 'GET') {
    const component = String(url.searchParams.get('component') || '');
    if (COMPONENTS.indexOf(component) === -1) return apiError(res, 400, 'That is not a known component.');
    const r = await dbQuery(
      `SELECT id, entry_date, description, amount, paid_by_client, paid_by_insurer, note, updated_at, updated_by
       FROM ledger_entries WHERE component = $1 AND deleted_at IS NULL
       ORDER BY entry_date ASC NULLS LAST, id ASC`,
      [component]
    );
    const entries = r.rows.map(ledgerRecord);
    const totals = entries.reduce((acc, e) => {
      acc.amount += e.amount;
      acc.paid_by_client += e.paid_by_client;
      acc.paid_by_insurer += e.paid_by_insurer;
      return acc;
    }, { amount: 0, paid_by_client: 0, paid_by_insurer: 0 });
    totals.amount = round2(totals.amount);
    totals.paid_by_client = round2(totals.paid_by_client);
    totals.paid_by_insurer = round2(totals.paid_by_insurer);
    totals.remaining = round2(totals.amount - totals.paid_by_client - totals.paid_by_insurer);
    return sendJson(res, 200, { component: component, entries: entries, totals: totals });
  }

  if (reqUrl === '/api/ledger' && method === 'POST') {
    const component = String(url.searchParams.get('component') || '');
    if (COMPONENTS.indexOf(component) === -1) return apiError(res, 400, 'That is not a known component.');
    if (!perms.editLedger) return apiError(res, 403, 'Your access token cannot edit the ledger.');
    const body = await readJsonBody(req, res);
    if (body === null) return;

    const entryDate = dateOrNull(body.entry_date);
    if (entryDate !== null && !isDateString(entryDate)) {
      return apiError(res, 400, 'The entry date must be written YYYY-MM-DD.');
    }
    const amounts = {};
    for (const field of ['amount', 'paid_by_client', 'paid_by_insurer']) {
      const raw = body[field] === undefined || body[field] === null || body[field] === '' ? 0 : Number(body[field]);
      if (!isFinite(raw) || raw < 0) return apiError(res, 400, 'Amounts must be numbers of zero or more.');
      amounts[field] = round2(raw);
    }
    const inserted = await dbQuery(
      `INSERT INTO ledger_entries (component, entry_date, description, amount, paid_by_client, paid_by_insurer, note, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, entry_date, description, amount, paid_by_client, paid_by_insurer, note, updated_at, updated_by`,
      [
        component,
        entryDate,
        String(body.description === undefined || body.description === null ? '' : body.description).slice(0, 2000),
        amounts.amount, amounts.paid_by_client, amounts.paid_by_insurer,
        String(body.note === undefined || body.note === null ? '' : body.note).slice(0, 2000),
        role
      ]
    );
    logAccess(req, role, reqUrl, 201, 'ledger add');
    return sendJson(res, 201, ledgerRecord(inserted.rows[0]));
  }

  const ledgerMatch = reqUrl.match(/^\/api\/ledger\/(\d{1,12})$/);
  if (ledgerMatch) {
    const id = Number(ledgerMatch[1]);
    if (!perms.editLedger) return apiError(res, 403, 'Your access token cannot edit the ledger.');

    if (method === 'PATCH') {
      const body = await readJsonBody(req, res);
      if (body === null) return;
      const existing = await dbQuery('SELECT id FROM ledger_entries WHERE id = $1 AND deleted_at IS NULL', [id]);
      if (!existing.rows.length) return apiError(res, 404, 'That ledger entry does not exist.');

      const sets = [];
      const values = [];
      if (Object.prototype.hasOwnProperty.call(body, 'entry_date')) {
        const entryDate = dateOrNull(body.entry_date);
        if (entryDate !== null && !isDateString(entryDate)) return apiError(res, 400, 'The entry date must be written YYYY-MM-DD, or null.');
        values.push(entryDate);
        sets.push('entry_date = $' + values.length);
      }
      for (const field of ['description', 'note']) {
        if (Object.prototype.hasOwnProperty.call(body, field)) {
          if (typeof body[field] !== 'string') return apiError(res, 400, 'The description and note must be text.');
          values.push(body[field].slice(0, 2000));
          sets.push(field + ' = $' + values.length);
        }
      }
      for (const field of ['amount', 'paid_by_client', 'paid_by_insurer']) {
        if (Object.prototype.hasOwnProperty.call(body, field)) {
          const raw = Number(body[field]);
          if (!isFinite(raw) || raw < 0) return apiError(res, 400, 'Amounts must be numbers of zero or more.');
          values.push(round2(raw));
          sets.push(field + ' = $' + values.length);
        }
      }
      if (!sets.length) return apiError(res, 400, 'Nothing to change in that request.');
      values.push(role);
      sets.push('updated_by = $' + values.length);
      sets.push('updated_at = now()');
      values.push(id);
      const updated = await dbQuery(
        `UPDATE ledger_entries SET ${sets.join(', ')} WHERE id = $${values.length}
         RETURNING id, entry_date, description, amount, paid_by_client, paid_by_insurer, note, updated_at, updated_by`,
        values
      );
      logAccess(req, role, reqUrl, 200, 'ledger edit');
      return sendJson(res, 200, ledgerRecord(updated.rows[0]));
    }

    if (method === 'DELETE') {
      const existing = await dbQuery('SELECT id FROM ledger_entries WHERE id = $1 AND deleted_at IS NULL', [id]);
      if (!existing.rows.length) return apiError(res, 404, 'That ledger entry does not exist.');
      await dbQuery('UPDATE ledger_entries SET deleted_at = now(), deleted_by = $1, updated_at = now(), updated_by = $1 WHERE id = $2', [role, id]);
      logAccess(req, role, reqUrl, 200, 'ledger delete');
      return sendJson(res, 200, { ok: true });
    }

    return apiError(res, 400, 'That method is not supported on this ledger entry.');
  }

  // --- /api/restrictions
  if (reqUrl === '/api/restrictions' && method === 'GET') {
    const r = await dbQuery('SELECT scope, restricted FROM restrictions', []);
    const out = {};
    r.rows.forEach(row => { out[row.scope] = Boolean(row.restricted); });
    return sendJson(res, 200, out);
  }

  if (reqUrl === '/api/restrictions' && method === 'PUT') {
    if (!perms.manageRestrictions) return apiError(res, 403, 'Your access token cannot change restrictions.');
    const body = await readJsonBody(req, res);
    if (body === null) return;
    const scope = String(body.scope || '');
    if (typeof body.restricted !== 'boolean') return apiError(res, 400, 'The restricted flag must be true or false.');

    const compScope = scope.match(/^component:(.+)$/);
    const fileScope = scope.match(/^file:(\d{1,12})$/);
    if (compScope && COMPONENTS.indexOf(compScope[1]) === -1) return apiError(res, 400, 'That is not a known component.');
    if (!compScope && !fileScope) return apiError(res, 400, 'A scope must be "component:<key>" or "file:<id>".');
    if (fileScope) {
      const existing = await dbQuery('SELECT id FROM files WHERE id = $1 AND deleted_at IS NULL', [Number(fileScope[1])]);
      if (!existing.rows.length) return apiError(res, 404, 'That file is not in the store.');
    }

    await dbQuery(
      `INSERT INTO restrictions (scope, restricted, updated_by, updated_at) VALUES ($1, $2, $3, now())
       ON CONFLICT (scope) DO UPDATE SET restricted = EXCLUDED.restricted, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [scope, body.restricted, role]
    );
    // files.restricted is what the listings read, so a file scope writes both places.
    if (fileScope) {
      await dbQuery('UPDATE files SET restricted = $1 WHERE id = $2', [body.restricted, Number(fileScope[1])]);
    }
    logAccess(req, role, reqUrl, 200, 'restriction');
    return sendJson(res, 200, { scope: scope, restricted: body.restricted });
  }

  // --- /api/access-log
  if (reqUrl === '/api/access-log' && method === 'GET') {
    if (!perms.viewAccessLog) return apiError(res, 403, 'Your access token cannot read the access log.');
    const asked = parseInt(url.searchParams.get('limit'), 10);
    const limit = Math.min(Math.max(isFinite(asked) && asked > 0 ? asked : 200, 1), 1000);
    const r = await dbQuery('SELECT id, ts, role, ip, method, path, status, note FROM access_log ORDER BY id DESC LIMIT $1', [limit]);
    // id is a bigserial, which the driver hands back as a string; the front end wants a number.
    return sendJson(res, 200, { entries: r.rows.map(row => Object.assign({}, row, { id: Number(row.id) })) });
  }

  return apiError(res, 404, 'That API route does not exist.');
}

const server = http.createServer((req, res) => {
  try {
    handleRequest(req, res);
  } catch (err) {
    console.error('request error:', err && err.message);
    if (!res.headersSent) sendHtml(res, 500, notFoundPage('internal error'));
    else res.end();
  }
});

function handleRequest(req, res) {
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
  } catch (e) {
    return sendHtml(res, 400, notFoundPage(req.url));
  }

  const role = enforceAccess(req, res, url);
  if (!role) return;
  req.caseRole = role;

  let reqUrl;
  try {
    reqUrl = decodeURIComponent(url.pathname);
  } catch (e) {
    return sendHtml(res, 400, notFoundPage(req.url));
  }

  if (reqUrl === '/access') {
    res.writeHead(303, { Location: safeNext(url.searchParams.get('next')), 'Cache-Control': 'no-store' });
    return res.end();
  }

  // Runtime configuration for the front end. Only feature flags, never secrets.
  if (reqUrl === '/config.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=UTF-8', 'Cache-Control': 'no-store' });
    return res.end(`window.APP_CONFIG = ${JSON.stringify({ googleSatelliteTiles: Boolean(GOOGLE_MAPS_API_KEY) })};\n`);
  }

  const tileMatch = reqUrl.match(/^\/gtiles\/(\d{1,2})\/(\d{1,8})\/(\d{1,8})$/);
  if (tileMatch) {
    return proxyGoogleTile(res, tileMatch[1], tileMatch[2], tileMatch[3]);
  }

  // Uploads, the rental ledger, restrictions and the access log live in Postgres, not on disk.
  if (reqUrl === '/api' || reqUrl.startsWith('/api/')) {
    return handleApi(req, res, url, reqUrl, role);
  }

  if (ROUTE_REDIRECTS[reqUrl]) {
    res.writeHead(302, { Location: ROUTE_REDIRECTS[reqUrl], 'Cache-Control': 'no-store' });
    return res.end();
  }
  if (ROUTE_ALIASES[reqUrl]) reqUrl = ROUTE_ALIASES[reqUrl];

  // Legacy links: the portal used to point at a 01_Interactive_Accident_Reconstruction/ folder that never existed.
  // The app lives at the repo root, so map that prefix onto it.
  if (reqUrl.startsWith('/01_Interactive_Accident_Reconstruction')) {
    const rest = reqUrl.slice('/01_Interactive_Accident_Reconstruction'.length);
    reqUrl = (rest === '' || rest === '/') ? '/index.html' : rest;
  }

  // Resolve inside the repository only; refuse anything that escapes it or touches hidden files.
  const filePath = path.resolve(__dirname, '.' + path.posix.normalize('/' + reqUrl));
  const relPath = path.relative(__dirname, filePath);
  if (relPath.startsWith('..') || path.isAbsolute(relPath) || (relPath && isHiddenPath(relPath))) {
    return sendHtml(res, 404, notFoundPage(reqUrl));
  }

  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (e) {
    return sendHtml(res, 404, notFoundPage(reqUrl));
  }

  if (stat.isDirectory()) {
    if (!reqUrl.endsWith('/')) {
      res.writeHead(301, { Location: encodeURI(reqUrl) + '/' + url.search });
      return res.end();
    }
    // Machine-readable listing, used by the binder galleries to discover files dropped into a folder.
    if (url.searchParams.get('format') === 'json') {
      return sendJson(res, 200, { path: reqUrl, entries: listDirectory(filePath) });
    }
    const tryIndex = path.join(filePath, 'index.html');
    if (fs.existsSync(tryIndex)) {
      stat = fs.statSync(tryIndex);
      return streamFile(res, tryIndex, stat);
    }
    return sendHtml(res, 200, renderDirectory(filePath, reqUrl));
  }

  if (LOGGED_DOCUMENT_EXTS.indexOf(path.extname(filePath).toLowerCase()) !== -1) {
    logAccess(req, role, reqUrl, 200, 'document');
  }
  return streamFile(res, filePath, stat);
}

process.on('uncaughtException', err => { console.error('uncaught exception (kept serving):', err && err.stack); });

function streamFile(res, filePath, stat) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': stat.size,
    // Private: the portfolio sits behind an access token, so shared caches must not keep copies.
    'Cache-Control': ext === '.html' ? 'private, no-cache' : 'private, max-age=86400'
  });
  fs.createReadStream(filePath).pipe(res);
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`================================================================`);
  console.log(`Master Legal Evidence Portal & Reconstruction Server Running`);
  console.log(`Port: ${PORT}`);
  console.log(`Local URL: http://localhost:${PORT}`);
  console.log(`Evidence Portal (landing): http://localhost:${PORT}/`);
  console.log(`Reconstruction: http://localhost:${PORT}/reconstruction`);
  console.log(`Official Dossier PDF: http://localhost:${PORT}/dossier`);
  if (TOKENS.length) {
    const byRole = {};
    TOKENS.forEach(t => { byRole[t.role] = (byRole[t.role] || 0) + 1; });
    const summary = Object.keys(byRole).map(r => `${r}:${byRole[r]}`).join(' ');
    console.log(`Access token gate: ON (${TOKENS.length} token${TOKENS.length === 1 ? '' : 's'} configured - ${summary})`);
  } else {
    console.log(`!! Access token gate: NOT CONFIGURED - every request is refused with a 503 page.`);
    console.log(`!! Set CASE_ACCESS_TOKEN (Replit: Tools -> Secrets) and restart.`);
  }
  console.log(`Upload store (Postgres): ${DATABASE_URL ? 'configured' : 'off (set DATABASE_URL; /api/ routes answer 503)'}`);
  console.log(`Google satellite tiles: ${GOOGLE_MAPS_API_KEY ? 'ON' : 'off (set GOOGLE_MAPS_API_KEY to enable)'}`);
  console.log(`================================================================`);
});
