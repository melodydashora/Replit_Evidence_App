const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';

// --- Access token gate -------------------------------------------------------------------------------
// Every request needs a valid access token. Set CASE_ACCESS_TOKEN (Replit: Tools -> Secrets) to one
// token, or to several separated by commas if different people should get different tokens later.
// CASE_PASSCODE is accepted as an alias for older deployments. Without a token the site fails closed.
// A token must not contain a comma or leading/trailing spaces (commas separate tokens); use a random hex string.
const ACCESS_TOKENS = String(process.env.CASE_ACCESS_TOKEN || process.env.CASE_PASSCODE || '')
  .split(',').map(s => s.trim()).filter(Boolean);
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
  '/property-loss': '/12_Personal_Property_Loss_And_Vehicle_Contents/'
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

function tokenIsValid(candidate) {
  if (!candidate) return false;
  return ACCESS_TOKENS.some(t => safeEqual(t, candidate));
}

function cookieIsValid(value) {
  if (!value) return false;
  return ACCESS_TOKENS.some(t => safeEqual(cookieValueFor(t, 0), value) || safeEqual(cookieValueFor(t, -1), value));
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

// Returns true when the request may proceed; otherwise it has already been answered.
function enforceAccess(req, res, url) {
  if (!ACCESS_TOKENS.length) {
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
      if (tokenIsValid(token)) {
        failures.delete(ip);
        res.writeHead(303, { Location: next, 'Set-Cookie': setCookieHeader(req, token), 'Cache-Control': 'no-store' });
        return res.end();
      }
      recordFailure(ip);
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
    if (tokenIsValid(queryToken.trim())) {
      failures.delete(ip);
      url.searchParams.delete('token');
      const clean = safeNext(url.pathname + (url.searchParams.toString() ? '?' + url.searchParams.toString() : ''));
      res.writeHead(303, { Location: clean, 'Set-Cookie': setCookieHeader(req, queryToken.trim()), 'Cache-Control': 'no-store' });
      res.end();
      return false;
    }
    recordFailure(ip);
    sendHtml(res, 401, gatePage(url.pathname, 'The access token in that link is not recognised.'));
    return false;
  }

  // Cookie set by a previous sign-in.
  if (cookieIsValid(parseCookies(req)[COOKIE_NAME])) return true;

  // Authorization header (curl, scripted checks, older Basic-auth bookmarks).
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const [scheme, value = ''] = authHeader.split(' ');
    if (/^bearer$/i.test(scheme) && tokenIsValid(value.trim())) return true;
    if (/^basic$/i.test(scheme)) {
      const decoded = Buffer.from(value, 'base64').toString();
      const idx = decoded.indexOf(':');
      const login = idx >= 0 ? decoded.slice(0, idx) : decoded;
      const password = idx >= 0 ? decoded.slice(idx + 1) : '';
      if (tokenIsValid(password) || tokenIsValid(login)) return true;
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

  if (!enforceAccess(req, res, url)) return;

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
  if (ACCESS_TOKENS.length) {
    console.log(`Access token gate: ON (${ACCESS_TOKENS.length} token${ACCESS_TOKENS.length === 1 ? '' : 's'} configured)`);
  } else {
    console.log(`!! Access token gate: NOT CONFIGURED - every request is refused with a 503 page.`);
    console.log(`!! Set CASE_ACCESS_TOKEN (Replit: Tools -> Secrets) and restart.`);
  }
  console.log(`Google satellite tiles: ${GOOGLE_MAPS_API_KEY ? 'ON' : 'off (set GOOGLE_MAPS_API_KEY to enable)'}`);
  console.log(`================================================================`);
});
