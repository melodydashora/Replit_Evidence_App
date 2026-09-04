#!/usr/bin/env node
// Regenerates the data-driven tables inside the dossier Markdown from the same files the web pages use,
// so a claim, a lost item or an injury photo is entered once and appears in the binder page, the portal
// and the dossier PDF. Blocks are delimited in the Markdown by
//     <!-- BEGIN GENERATED: claims -->  ...  <!-- END GENERATED: claims -->
// (also "property-loss" and "injury-photos"). Text outside the markers is never touched.
// Usage: node scripts/sync-dossier-tables.js   (npm run build:dossier-pdf runs it first)
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const MD = path.join(ROOT, '00_START_HERE_CASE_OVERVIEW_AND_OFFICIAL_DOSSIER', 'OFFICIAL_STATEMENT_OF_FACTS_AND_CASE_DOSSIER.md');
const DATA_FILES = {
  claims: 'claims_status.js',
  property: '12_Personal_Property_Loss_And_Vehicle_Contents/property_loss_items.js',
  photos: '06_Medical_Records_And_Clinical_Evidence/injury_photos.js'
};

function loadWindowGlobal(relFile, globalName) {
  const abs = path.join(ROOT, relFile);
  if (!fs.existsSync(abs)) return null;
  const sandbox = { window: {} };
  try {
    vm.runInNewContext(fs.readFileSync(abs, 'utf8'), sandbox, { filename: relFile });
  } catch (err) {
    const where = (err && err.stack || '').split('\n').find(l => l.includes(relFile)) || '';
    console.error(`\nCould not read ${relFile}: ${err.message}\n${where}\nThis is almost always a missing quote, comma or bracket in that file. Fix it and run the command again; the dossier was not changed.\n`);
    process.exit(1);
  }
  return sandbox.window[globalName];
}

function cell(s) {
  // Escape pipes, HTML and Markdown emphasis so a value never breaks the table or injects markup into the PDF
  return String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
    .replace(/\|/g, '\\|').replace(/([*_`])/g, '\\$1').replace(/\r?\n/g, ' ').trim();
}
function num(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  const n = Number(String(v).replace(/[^0-9.+-]/g, ''));
  return isNaN(n) ? null : n;
}
function money(n) {
  const x = num(n);
  if (x === null) return '';
  return (x < 0 ? '-$' : '$') + Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  return (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : String(s == null ? '' : s);
}
function itemValue(it) {
  const cv = num(it.claimed_value);
  if (cv !== null) return cv;
  const qty = it.qty == null || it.qty === '' ? 1 : (num(it.qty) === null ? 1 : num(it.qty));
  return (num(it.purchase_price) || 0) * qty;
}
function table(headers, rows) {
  // rows contain already-escaped cells (see cell()); formatting such as **bold** is added by the caller after escaping
  return [
    '| ' + headers.join(' | ') + ' |',
    '|' + headers.map(() => '---').join('|') + '|',
    ...rows.map(r => '| ' + r.map(v => String(v == null ? '' : v)).join(' | ') + ' |')
  ].join('\n');
}

function claimsBlock() {
  const claims = (loadWindowGlobal(DATA_FILES.claims, 'CLAIMS_STATUS') || []).filter(c => c && typeof c === 'object');
  if (!claims.length) return '_No claims recorded in `claims_status.js` yet._';
  const rows = claims.map(c => [
    cell(c.carrier || ''),
    c.claim_number ? `**${cell(c.claim_number)}**` : '_not yet assigned_',
    cell([c.type, c.coverage].filter(Boolean).join(' — ')),
    cell(c.status || 'Open'),
    cell([c.adjuster, c.phone, c.email].filter(Boolean).join(' · ')),
    cell([c.incident_date ? 'Incident date on claim ' + fmtDate(c.incident_date) : '', c.opened ? 'Opened ' + fmtDate(c.opened) : '', c.last_update ? 'Checked ' + fmtDate(c.last_update) : ''].filter(Boolean).join('; ')),
    cell([c.next_step, c.notes].filter(Boolean).join(' '))
  ]);
  return table(['Carrier', 'Claim number', 'Type / coverage', 'Status', 'Adjuster & contact', 'Dates', 'Next step / notes'], rows) +
    `\n\n_Source: \`claims_status.js\` (${claims.length} claim${claims.length === 1 ? '' : 's'}); the same list drives the portal's claims cards._`;
}

function propertyBlock() {
  const items = (loadWindowGlobal(DATA_FILES.property, 'PROPERTY_LOSS_ITEMS') || []).filter(it => it && typeof it === 'object');
  if (!items.length) return '_No items recorded in Binder 12 (`property_loss_items.js`) yet._';
  const total = items.reduce((s, it) => s + itemValue(it), 0);
  const rows = items.map((it, i) => [
    String(i + 1),
    cell([it.item, [it.brand, it.model].filter(Boolean).join(' ')].filter(Boolean).join(' — ')),
    cell(it.category || ''),
    cell(it.qty != null ? it.qty : 1),
    cell(money(it.purchase_price)),
    cell(money(itemValue(it))),
    cell(it.condition || ''),
    cell(Array.isArray(it.proof) && it.proof.length ? it.proof.map(p => path.basename(p)).join(', ') : 'none yet'),
    cell([it.location_in_vehicle ? 'Location: ' + it.location_in_vehicle : '', it.status, it.notes].filter(Boolean).join('. '))
  ]);
  rows.push(['', `**Total (${items.length} item${items.length === 1 ? '' : 's'})**`, '', '', '', `**${cell(money(total))}**`, '', '', '']);
  return table(['#', 'Item', 'Category', 'Qty', 'Unit price', 'Claimed', 'Condition', 'Proof on file', 'Notes'], rows) +
    '\n\n_Source: Binder 12, `property_loss_items.js`. Values are the client\'s stated purchase or replacement cost; receipts and photos are in `Receipts_And_Photos/`._';
}

function photosBlock() {
  const data = loadWindowGlobal(DATA_FILES.photos, 'INJURY_PHOTOS') || {};
  const folderAbs = path.join(ROOT, '06_Medical_Records_And_Clinical_Evidence', data.folder || 'Pictures_Of_Bruises');
  const listed = (Array.isArray(data.photos) ? data.photos : []).filter(p => p && typeof p === 'object' && p.file);
  const byFile = new Map(listed.map(p => [p.file, p]));
  let onDisk = [];
  try { onDisk = fs.readdirSync(folderAbs).filter(n => /\.(png|jpe?g|webp|gif)$/i.test(n)); } catch (e) { /* folder missing */ }
  const names = Array.from(new Set([...listed.map(p => p.file), ...onDisk]));
  if (!names.length) return '_No injury photographs in Binder 06 yet._';
  names.sort((a, b) => {
    const da = (byFile.get(a) || {}).date || '9999', db = (byFile.get(b) || {}).date || '9999';
    return da < db ? -1 : da > db ? 1 : a.localeCompare(b, undefined, { numeric: true });
  });
  const rows = names.map(n => {
    const p = byFile.get(n) || {};
    return [p.date ? cell(fmtDate(p.date) + (p.time ? ' ' + p.time : '')) : '_date not recorded_', p.region ? cell(p.region) : '_caption pending_', cell(p.caption || ''), cell(p.source || ''), cell(n)];
  });
  return table(['Date', 'Body region', 'Description (client)', 'Source', 'File'], rows) +
    `\n\n_Source: Binder 06, \`${data.folder || 'Pictures_Of_Bruises'}/\` (${names.length} photo${names.length === 1 ? '' : 's'}) with captions from \`injury_photos.js\`._`;
}

const GENERATORS = { 'claims': claimsBlock, 'property-loss': propertyBlock, 'injury-photos': photosBlock };

let md = fs.readFileSync(MD, 'utf8');
const before = md;
let found = 0;
for (const [key, gen] of Object.entries(GENERATORS)) {
  const re = new RegExp(`(<!-- BEGIN GENERATED: ${key} -->)[\\s\\S]*?(<!-- END GENERATED: ${key} -->)`);
  if (!re.test(md)) { console.warn(`marker block "${key}" not found in dossier; skipped`); continue; }
  found += 1;
  md = md.replace(re, (_, open, close) => `${open}\n${gen()}\n${close}`);
}
if (md !== before) {
  fs.writeFileSync(MD, md);
  console.log(`dossier tables updated (${found} block${found === 1 ? '' : 's'}) in ${path.relative(ROOT, MD)}`);
} else {
  console.log(`dossier tables already current (${found} block${found === 1 ? '' : 's'})`);
}
