const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const CASE_PASSCODE = process.env.CASE_PASSCODE || '';
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';

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

function sendHtml(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=UTF-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function notFoundPage(reqUrl) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>404 - Exhibit Not Found</title></head>
<body style="font-family:sans-serif; text-align:center; padding:50px; background:#0b0f19; color:#f8fafc;">
  <h2>404 - Exhibit Document Not Found</h2>
  <p>Path: <code>${escapeHtml(reqUrl)}</code></p>
  <p><a style="color:#38bdf8" href="/">Return to Master Evidence Portal</a> | <a style="color:#38bdf8" href="/reconstruction">Open Reconstruction</a></p>
</body></html>`;
}

// Folder listing for exhibit folders that have no index.html, so every file in the repository is reachable.
function renderDirectory(dirAbs, urlPath) {
  const entries = fs.readdirSync(dirAbs, { withFileTypes: true })
    .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules')
    .sort((a, b) => (Number(b.isDirectory()) - Number(a.isDirectory())) || a.name.localeCompare(b.name, undefined, { numeric: true }));

  const segments = urlPath.split('/').filter(Boolean);
  let crumbHref = '';
  const crumbs = segments.map((seg, i) => {
    crumbHref += '/' + encodeURIComponent(seg);
    const label = escapeHtml(seg.replace(/_/g, ' '));
    return i === segments.length - 1 ? `<span>${label}</span>` : `<a href="${crumbHref}/">${label}</a>`;
  });

  const rows = entries.map(e => {
    const abs = path.join(dirAbs, e.name);
    const href = encodeURIComponent(e.name) + (e.isDirectory() ? '/' : '');
    const stat = fs.statSync(abs);
    const ext = e.isDirectory() ? 'Folder' : (path.extname(e.name).slice(1).toUpperCase() || 'File');
    const size = e.isDirectory() ? `${fs.readdirSync(abs).filter(n => !n.startsWith('.')).length} items` : formatSize(stat.size);
    const icon = e.isDirectory() ? '&#128193;' : (/\.(png|jpe?g|webp|gif)$/i.test(e.name) ? '&#128247;' : /\.pdf$/i.test(e.name) ? '&#128196;' : '&#128462;');
    return `<tr><td><a href="${href}">${icon} ${escapeHtml(e.name)}</a></td><td>${ext}</td><td class="num">${size}</td><td class="num">${stat.mtime.toISOString().slice(0, 10)}</td></tr>`;
  }).join('\n');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(segments[segments.length - 1] || 'Exhibits')} | Evidence Repository</title>
<style>
  :root { --bg:#0b0f19; --card:#1a233a; --border:rgba(255,255,255,0.08); --text:#f8fafc; --muted:#94a3b8; --accent:#38bdf8; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { background:var(--bg); color:var(--text); font-family:'Inter',-apple-system,'Segoe UI',sans-serif; padding:30px 20px 60px; line-height:1.5; }
  .container { max-width:1000px; margin:0 auto; }
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
  .back { display:inline-block; margin-top:22px; color:var(--accent); text-decoration:none; font-size:14px; }
</style></head><body><div class="container">
  <div class="crumbs"><a href="/">Evidence Portal</a>${crumbs.join('')}</div>
  <h1>${escapeHtml((segments[segments.length - 1] || '').replace(/_/g, ' '))}</h1>
  <p class="note">${entries.length} item${entries.length === 1 ? '' : 's'} · Confidential attorney-client privileged work product</p>
  <table><thead><tr><th>Name</th><th>Type</th><th class="num">Size</th><th class="num">Modified</th></tr></thead><tbody>
${rows}
  </tbody></table>
  <a class="back" href="/">&larr; Return to Master Evidence Portal</a>
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

const server = http.createServer((req, res) => {
  // Passcode Protection if CASE_PASSCODE secret is set
  if (CASE_PASSCODE) {
    const authHeader = req.headers['authorization'];
    if (authHeader) {
      const b64auth = authHeader.split(' ')[1] || '';
      const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
      if (password !== CASE_PASSCODE && login !== CASE_PASSCODE) {
        res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Privileged Legal Case Evidence"' });
        return res.end('Authentication required to access privileged case evidence.');
      }
    } else {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Privileged Legal Case Evidence"' });
      return res.end('Authentication required to access privileged case evidence.');
    }
  }

  let reqUrl;
  try {
    reqUrl = decodeURIComponent(req.url.split('?')[0]);
  } catch (e) {
    return sendHtml(res, 400, notFoundPage(req.url));
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
      res.writeHead(301, { Location: encodeURI(reqUrl) + '/' });
      return res.end();
    }
    const tryIndex = path.join(filePath, 'index.html');
    if (fs.existsSync(tryIndex)) {
      stat = fs.statSync(tryIndex);
      return streamFile(res, tryIndex, stat);
    }
    return sendHtml(res, 200, renderDirectory(filePath, reqUrl));
  }

  return streamFile(res, filePath, stat);
});

function streamFile(res, filePath, stat) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': stat.size,
    'Cache-Control': 'public, max-age=86400',
    'Access-Control-Allow-Origin': '*'
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
  console.log(`Passcode protection: ${CASE_PASSCODE ? 'ON' : 'off (set CASE_PASSCODE to enable)'}`);
  console.log(`Google satellite tiles: ${GOOGLE_MAPS_API_KEY ? 'ON' : 'off (set GOOGLE_MAPS_API_KEY to enable)'}`);
  console.log(`================================================================`);
});
