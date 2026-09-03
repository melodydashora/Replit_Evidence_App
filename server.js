const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const CASE_PASSCODE = process.env.CASE_PASSCODE || '';

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
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};

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

  let reqUrl = decodeURI(req.url.split('?')[0]);

  // Route shortcuts
  if (reqUrl === '/' || reqUrl === '/reconstruction') {
    reqUrl = '/index.html';
  } else if (reqUrl === '/portal') {
    reqUrl = '/00_START_HERE_EVIDENCE_PORTAL.html';
  } else if (reqUrl === '/dossier') {
    reqUrl = '/OFFICIAL_STATEMENT_OF_FACTS_AND_CASE_DOSSIER.pdf';
  } else if (reqUrl === '/police-report') {
    reqUrl = '/02_Certified_Police_Report_And_Crash_Records/Certified_Police_Report_TxDOT_21609720_1.pdf';
  }

  let filePath = path.join(__dirname, reqUrl);

  // Check if directory -> serve index.html inside it
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    const tryIndex = path.join(filePath, 'index.html');
    if (fs.existsSync(tryIndex)) {
      filePath = tryIndex;
    }
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=UTF-8' });
    return res.end(`
      <div style="font-family:sans-serif; text-align:center; padding:50px;">
        <h2>404 - Exhibit Document Not Found</h2>
        <p>Path: <code>${reqUrl}</code></p>
        <p><a href="/portal">Return to Master Evidence Portal</a> | <a href="/">Open Reconstruction</a></p>
      </div>
    `);
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  const stat = fs.statSync(filePath);
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': stat.size,
    'Cache-Control': 'public, max-age=86400',
    'Access-Control-Allow-Origin': '*'
  });

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`================================================================`);
  console.log(`Master Legal Evidence Portal & Reconstruction Server Running`);
  console.log(`Port: ${PORT}`);
  console.log(`Local URL: http://localhost:${PORT}`);
  console.log(`Reconstruction: http://localhost:${PORT}/`);
  console.log(`Evidence Portal: http://localhost:${PORT}/portal`);
  console.log(`Official Dossier PDF: http://localhost:${PORT}/dossier`);
  console.log(`================================================================`);
});
