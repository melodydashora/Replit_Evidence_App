/*
 * case_components.js — small data-driven components for the evidence binders and the portal.
 *
 * Nothing here is hand-edited to add content. Content lives in three plain-JS data files:
 *
 *   claims_status.js                                  -> window.CLAIMS_STATUS     (array of claims)
 *   12_Personal_Property_Loss_And_Vehicle_Contents/
 *       property_loss_items.js                        -> window.PROPERTY_LOSS_ITEMS (array of items)
 *   06_Medical_Records_And_Clinical_Evidence/
 *       injury_photos.js                              -> window.INJURY_PHOTOS     ({ folder, photos[] })
 *
 * A page shows a component by including the data file, this file, and an empty placeholder:
 *
 *   <script src="../claims_status.js"></script>
 *   <script src="../case_components.js"></script>
 *   <div data-component="claims" data-base="../"></div>
 *
 * Placeholders:
 *   data-component="claims"         renders every claim in window.CLAIMS_STATUS as a card
 *   data-component="property-loss"  renders window.PROPERTY_LOSS_ITEMS as a filterable table with totals
 *   data-component="injury-photos"  renders window.INJURY_PHOTOS as a gallery; when the page is served by
 *                                   server.js it also lists every image found in the folder, so a photo dropped
 *                                   into the folder appears even before it has a caption in injury_photos.js
 *   data-component="property-loss-summary"  one-line count and total, for the portal card
 *
 * Attributes:
 *   data-base="../"   prefix for document links that are written relative to the repository root
 *   data-hint="off"   hide the small "to add more, edit …" note under the component
 */
(function () {
  'use strict';

  // ---------- helpers ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // Accepts 1199.99, "1199.99", "$1,199.99" or "1,199" (anything that is not a digit, sign or point is ignored)
  function num(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isNaN(v) ? null : v;
    var n = Number(String(v).replace(/[^0-9.+-]/g, ''));
    return isNaN(n) ? null : n;
  }
  function money(n) {
    var x = num(n);
    if (x === null) return '';
    var abs = Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (x < 0 ? '-$' : '$') + abs;
  }
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDate(s) {
    if (!s) return '';
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
    if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return esc(s);
    return MONTHS[Number(m[2]) - 1] + ' ' + Number(m[3]) + ', ' + m[1];
  }
  function encodePath(p) {
    return String(p).split('/').map(encodeURIComponent).join('/');
  }
  function linkHtml(base, href, label, cls) {
    var url = /^(https?:)?\/\//.test(href) ? href : (base || '') + encodePath(href);
    return '<a class="' + (cls || 'cc-link') + '" href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(label || href.split('/').pop()) + '</a>';
  }
  function fileLabel(p) { return String(p).split('/').pop(); }
  function isImage(name) { return /\.(png|jpe?g|webp|gif)$/i.test(name); }
  function isHeic(name) { return /\.heic$/i.test(name); }
  function statusClass(s) {
    s = String(s || '').toLowerCase();
    if (/closed|denied|paid|settled/.test(s)) return 'closed';
    if (/pending|await|review|submitted|not yet|unconfirmed|to confirm|potential|outstanding/.test(s)) return 'pending';
    return 'open';
  }
  function loadError(fileName, globalName) {
    return '<div class="cc-empty cc-error"><strong>' + esc(fileName) + ' could not be read.</strong> ' +
      'The page loaded but <code>window.' + esc(globalName) + '</code> was never set, which almost always means a missing quote, comma or bracket in that file. ' +
      'Open the browser console (F12) for the line number, fix it, and reload. Nothing else on this page is affected.</div>';
  }
  function hint(el, text) {
    if (el.getAttribute('data-hint') === 'off') return '';
    return '<div class="cc-hint">' + text + '</div>';
  }

  // ---------- styles (injected once) ----------
  var CSS = [
    '.cc{font-family:"Inter",-apple-system,"Segoe UI",sans-serif;color:#f8fafc;margin:0 0 24px;}',
    '.cc *{box-sizing:border-box;}',
    '.cc-title{font-size:16px;font-weight:700;color:#e2e8f0;margin:0 0 4px;display:flex;align-items:center;gap:8px;}',
    '.cc-sub{font-size:12.5px;color:#94a3b8;margin:0 0 14px;line-height:1.5;}',
    '.cc-stats{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 14px;}',
    '.cc-stat{background:#131b2e;border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:10px 14px;min-width:130px;}',
    '.cc-stat b{display:block;font-size:18px;font-weight:800;color:#fff;font-family:"JetBrains Mono",monospace;}',
    '.cc-stat span{font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;font-weight:600;}',
    '.cc-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 10px;}',
    '.cc-toolbar select,.cc-toolbar input{background:#0b0f19;color:#f8fafc;border:1px solid rgba(255,255,255,0.14);border-radius:6px;padding:7px 10px;font-size:13px;font-family:inherit;}',
    '.cc-toolbar input{flex:1;min-width:160px;}',
    '.cc-tablewrap{overflow-x:auto;border:1px solid rgba(255,255,255,0.08);border-radius:8px;background:#131b2e;}',
    '.cc-table{width:100%;border-collapse:collapse;min-width:720px;}',
    '.cc-table th{background:rgba(255,255,255,0.03);color:#cbd5e1;font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;text-align:left;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,0.08);white-space:nowrap;}',
    '.cc-table td{padding:10px 12px;border-bottom:1px solid rgba(255,255,255,0.06);font-size:13px;vertical-align:top;}',
    '.cc-table tr:last-child td{border-bottom:none;}',
    '.cc-table td.num,.cc-table th.num{text-align:right;font-family:"JetBrains Mono",monospace;white-space:nowrap;}',
    '.cc-table tfoot td{font-weight:700;background:rgba(56,189,248,0.06);color:#fff;}',
    '.cc-item{font-weight:600;color:#fff;}',
    '.cc-muted{color:#94a3b8;font-size:12px;}',
    '.cc-cat{display:inline-block;font-size:11px;font-weight:600;color:#93c5fd;background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.35);border-radius:4px;padding:2px 7px;white-space:nowrap;}',
    '.cc-pill{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;border-radius:5px;padding:3px 8px;white-space:nowrap;}',
    '.cc-pill.open{color:#6ee7b7;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.4);}',
    '.cc-pill.pending{color:#fcd34d;background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.4);}',
    '.cc-pill.closed{color:#cbd5e1;background:rgba(148,163,184,0.15);border:1px solid rgba(148,163,184,0.4);}',
    '.cc-cond{font-size:12px;font-weight:600;}',
    '.cc-cond.destroyed{color:#fca5a5;}.cc-cond.damaged{color:#fcd34d;}.cc-cond.lost{color:#c4b5fd;}',
    '.cc-link{color:#38bdf8;text-decoration:none;font-size:12.5px;}.cc-link:hover{text-decoration:underline;}',
    '.cc-links a{margin-right:8px;overflow-wrap:anywhere;}',
    '.cc-hint{font-size:11.5px;color:#64748b;margin-top:8px;}',
    '.cc-hint code{font-family:"JetBrains Mono",monospace;color:#94a3b8;}',
    '.cc-empty{padding:18px;border:1px dashed rgba(255,255,255,0.15);border-radius:8px;color:#94a3b8;font-size:13px;}',
    // claims
    '.cc-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px;}',
    '.cc-card{background:#131b2e;border:1px solid rgba(255,255,255,0.08);border-left:4px solid #38bdf8;border-radius:10px;padding:16px 18px;}',
    '.cc-card.pending{border-left-color:#f59e0b;}.cc-card.closed{border-left-color:#64748b;}',
    '.cc-card-top{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:8px 10px;margin-bottom:8px;}',
    '.cc-card-top > div{flex:1 1 180px;min-width:0;}',
    '.cc-carrier{font-size:15px;font-weight:700;color:#fff;}',
    '.cc-claimno{font-family:"JetBrains Mono",monospace;font-size:13px;color:#38bdf8;margin-top:2px;}',
    '.cc-kv{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:12.5px;margin-top:8px;}',
    '.cc-kv dt{color:#94a3b8;font-weight:600;white-space:nowrap;}.cc-kv dd{margin:0;color:#e2e8f0;}',
    '.cc-next{margin-top:10px;padding:8px 10px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);border-radius:6px;font-size:12.5px;color:#fde68a;}',
    '.cc-notes{margin-top:8px;font-size:12.5px;color:#cbd5e1;line-height:1.5;}',
    // gallery
    '.cc-gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;}',
    '.cc-photo{background:#131b2e;border:1px solid rgba(255,255,255,0.08);border-radius:10px;overflow:hidden;display:flex;flex-direction:column;}',
    '.cc-photo a.cc-thumb{display:block;background:#0b0f19;aspect-ratio:4/3;overflow:hidden;}',
    '.cc-photo img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .2s ease;}',
    '.cc-photo:hover img{transform:scale(1.03);}',
    '.cc-photo-body{padding:10px 12px;}',
    '.cc-photo-date{font-size:11px;color:#94a3b8;font-family:"JetBrains Mono",monospace;}',
    '.cc-photo-region{font-size:13px;font-weight:700;color:#fff;margin:2px 0;}',
    '.cc-photo-cap{font-size:12px;color:#cbd5e1;line-height:1.45;}',
    '.cc-photo-file{font-size:11px;color:#64748b;margin-top:6px;word-break:break-all;font-family:"JetBrains Mono",monospace;}',
    '.cc-photo.uncaptioned{border-color:rgba(245,158,11,0.4);}',
    '.cc-warn{font-size:12px;color:#fcd34d;margin:0 0 10px;}',
    '.cc-summary{font-size:12.5px;color:#cbd5e1;}.cc-summary b{color:#fff;font-family:"JetBrains Mono",monospace;}',
    '.cc-error{border-color:rgba(239,68,68,0.5);color:#fecaca;}.cc-error-inline{color:#fecaca;}',
    // ---- light theme: any page with <html data-theme="light"> (insurer-style white cards, navy text, blue accent) ----
    '[data-theme="light"] .cc{color:#1b2437;}',
    '[data-theme="light"] .cc-title{color:#12213d;}[data-theme="light"] .cc-sub{color:#5c6779;}',
    '[data-theme="light"] .cc-stat{background:#fff;border-color:#d8dee8;box-shadow:0 1px 3px rgba(16,24,40,.06);}',
    '[data-theme="light"] .cc-stat b{color:#12213d;}[data-theme="light"] .cc-stat span{color:#5c6779;}',
    '[data-theme="light"] .cc-toolbar select,[data-theme="light"] .cc-toolbar input{background:#fff;color:#1b2437;border-color:#c9d2df;}',
    '[data-theme="light"] .cc-tablewrap{background:#fff;border-color:#d8dee8;box-shadow:0 1px 3px rgba(16,24,40,.06);}',
    '[data-theme="light"] .cc-table th{background:#f0f3f8;color:#3b475c;border-bottom-color:#d8dee8;}',
    '[data-theme="light"] .cc-table td{border-bottom-color:#e6eaf0;color:#1b2437;}',
    '[data-theme="light"] .cc-table tfoot td{background:#eaf1fb;color:#12213d;}',
    '[data-theme="light"] .cc-item{color:#12213d;}[data-theme="light"] .cc-muted{color:#5c6779;}',
    '[data-theme="light"] .cc-cat{color:#1a5db3;background:#eaf1fb;border-color:#bcd0ee;}',
    '[data-theme="light"] .cc-pill.open{color:#0f7a4a;background:#e6f6ee;border-color:#a9dfc2;}',
    '[data-theme="light"] .cc-pill.pending{color:#8a5a00;background:#fff4dc;border-color:#f3d48a;}',
    '[data-theme="light"] .cc-pill.closed{color:#4b5563;background:#eef1f5;border-color:#d0d6de;}',
    '[data-theme="light"] .cc-cond.destroyed{color:#b42318;}[data-theme="light"] .cc-cond.damaged{color:#8a5a00;}[data-theme="light"] .cc-cond.lost{color:#5b3fbf;}',
    '[data-theme="light"] .cc-link{color:#1a5db3;}',
    '[data-theme="light"] .cc-hint{color:#6b7484;}[data-theme="light"] .cc-hint code{color:#3b475c;background:#f0f3f8;padding:1px 4px;border-radius:3px;}',
    '[data-theme="light"] .cc-empty{border-color:#c9d2df;color:#5c6779;background:#fff;}',
    '[data-theme="light"] .cc-error{border-color:#f0a8a2;color:#b42318;background:#fdecea;}[data-theme="light"] .cc-error-inline{color:#b42318;}',
    '[data-theme="light"] .cc-card{background:#fff;border-color:#d8dee8;border-left-color:#1a5db3;box-shadow:0 1px 3px rgba(16,24,40,.06);}',
    '[data-theme="light"] .cc-card.pending{border-left-color:#d98e04;}[data-theme="light"] .cc-card.closed{border-left-color:#8a94a6;}',
    '[data-theme="light"] .cc-carrier{color:#12213d;}[data-theme="light"] .cc-claimno{color:#1a5db3;}',
    '[data-theme="light"] .cc-kv dt{color:#5c6779;}[data-theme="light"] .cc-kv dd{color:#1b2437;}',
    '[data-theme="light"] .cc-next{background:#fff8e6;border-color:#f3d48a;color:#6b4700;}',
    '[data-theme="light"] .cc-notes{color:#2b3548;}',
    '[data-theme="light"] .cc-photo{background:#fff;border-color:#d8dee8;}[data-theme="light"] .cc-photo a.cc-thumb{background:#f0f3f8;}',
    '[data-theme="light"] .cc-photo-date{color:#5c6779;}[data-theme="light"] .cc-photo-region{color:#12213d;}[data-theme="light"] .cc-photo-cap{color:#2b3548;}[data-theme="light"] .cc-photo-file{color:#6b7484;}',
    '[data-theme="light"] .cc-photo.uncaptioned{border-color:#f3d48a;}[data-theme="light"] .cc-warn{color:#8a5a00;}',
    '[data-theme="light"] .cc-summary{color:#2b3548;}[data-theme="light"] .cc-summary b{color:#12213d;}'
  ].join('');

  function ensureStyle() {
    if (document.getElementById('ccStyle')) return;
    var s = document.createElement('style');
    s.id = 'ccStyle';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // ---------- Claims ----------
  function renderClaims(el) {
    var base = el.getAttribute('data-base') || '';
    if (typeof window.CLAIMS_STATUS === 'undefined') { el.innerHTML = '<div class="cc">' + loadError('claims_status.js', 'CLAIMS_STATUS') + '</div>'; return; }
    var claims = (Array.isArray(window.CLAIMS_STATUS) ? window.CLAIMS_STATUS : []).filter(function (c) { return c && typeof c === 'object'; });
    var html = '<div class="cc cc-claims">';
    if (el.getAttribute('data-title') !== 'off') {
      html += '<div class="cc-title">Open Claims &amp; Coverage Files</div>';
      html += '<div class="cc-sub">One card per claim file. Figures and contacts are as recorded in <code>claims_status.js</code>; documents link into the binders.</div>';
    }
    if (!claims.length) {
      html += '<div class="cc-empty">No claims recorded yet.</div>';
    } else {
      html += '<div class="cc-cards">';
      claims.forEach(function (c) {
        var sc = statusClass(c.status);
        html += '<div class="cc-card ' + sc + '">';
        html += '<div class="cc-card-top"><div><div class="cc-carrier">' + esc(c.carrier || 'Carrier') + '</div>';
        html += '<div class="cc-claimno">' + (c.claim_number ? 'Claim ' + esc(c.claim_number) : '<span class="cc-muted">claim number not yet assigned</span>') + '</div></div>';
        html += '<span class="cc-pill ' + sc + '">' + esc(c.status || 'Open') + '</span></div>';
        html += '<dl class="cc-kv">';
        if (c.type) html += '<dt>Claim type</dt><dd>' + esc(c.type) + '</dd>';
        if (c.policy_number) html += '<dt>Policy</dt><dd>' + esc(c.policy_number) + '</dd>';
        if (c.insured || c.claimant) html += '<dt>Insured / claimant</dt><dd>' + esc(c.insured || c.claimant) + '</dd>';
        if (c.incident_date) html += '<dt>Incident date on claim</dt><dd>' + fmtDate(c.incident_date) + '</dd>';
        if (c.opened) html += '<dt>Opened</dt><dd>' + fmtDate(c.opened) + '</dd>';
        if (c.adjuster) html += '<dt>Adjuster</dt><dd>' + esc(c.adjuster) + '</dd>';
        if (c.phone) html += '<dt>Phone</dt><dd>' + esc(c.phone) + '</dd>';
        if (c.email) html += '<dt>Email</dt><dd>' + esc(c.email) + '</dd>';
        if (c.coverage) html += '<dt>Coverage</dt><dd>' + esc(c.coverage) + '</dd>';
        if (c.amount_paid != null && c.amount_paid !== '') html += '<dt>Paid to date</dt><dd>' + esc(money(c.amount_paid) || c.amount_paid) + '</dd>';
        if (c.last_update) html += '<dt>Last update</dt><dd>' + fmtDate(c.last_update) + '</dd>';
        html += '</dl>';
        if (c.next_step) html += '<div class="cc-next"><strong>Next:</strong> ' + esc(c.next_step) + '</div>';
        if (c.notes) html += '<div class="cc-notes">' + esc(c.notes) + '</div>';
        if (Array.isArray(c.documents) && c.documents.length) {
          html += '<div class="cc-links" style="margin-top:10px;">' + c.documents.filter(Boolean).map(function (d) {
            if (typeof d === 'string') return linkHtml(base, d, fileLabel(d));
            return d && d.href ? linkHtml(base, d.href, d.label || fileLabel(d.href)) : '';
          }).join(' ') + '</div>';
        }
        html += '</div>';
      });
      html += '</div>';
    }
    html += hint(el, 'To add or update a claim, edit <code>claims_status.js</code> (one entry per claim). It shows here and in the dossier after <code>npm run build:dossier-pdf</code>.');
    html += '</div>';
    el.innerHTML = html;
  }

  // ---------- Property loss ----------
  function itemValue(it) {
    if (!it) return 0;
    var cv = num(it.claimed_value);
    if (cv !== null) return cv;
    var qty = it.qty == null || it.qty === '' ? 1 : (num(it.qty) === null ? 1 : num(it.qty));
    return (num(it.purchase_price) || 0) * qty;
  }

  function renderPropertyLoss(el) {
    var base = el.getAttribute('data-base') || '';
    if (typeof window.PROPERTY_LOSS_ITEMS === 'undefined') { el.innerHTML = '<div class="cc">' + loadError('property_loss_items.js', 'PROPERTY_LOSS_ITEMS') + '</div>'; return; }
    var items = (Array.isArray(window.PROPERTY_LOSS_ITEMS) ? window.PROPERTY_LOSS_ITEMS : []).filter(function (it) { return it && typeof it === 'object'; });
    var cats = {};
    items.forEach(function (it) { if (it.category) cats[it.category] = true; });
    var catList = Object.keys(cats).sort();
    var total = items.reduce(function (s, it) { return s + itemValue(it); }, 0);
    var withProof = items.filter(function (it) { return Array.isArray(it.proof) && it.proof.length; }).length;

    var html = '<div class="cc cc-property">';
    html += '<div class="cc-title">Personal Property Lost or Destroyed in the Vehicle</div>';
    html += '<div class="cc-sub">Contents of the 2025 Atlas at the time of the collision. Values are the client’s stated purchase price or replacement cost; supporting receipts and photos are linked where on file.</div>';
    html += '<div class="cc-stats"><div class="cc-stat"><b>' + items.length + '</b><span>Items</span></div>';
    html += '<div class="cc-stat"><b>' + (money(total) || '$0.00') + '</b><span>Total claimed</span></div>';
    html += '<div class="cc-stat"><b>' + withProof + '</b><span>With receipt / photo</span></div></div>';
    if (!items.length) {
      html += '<div class="cc-empty">No items recorded yet.</div>';
    } else {
      html += '<div class="cc-toolbar"><select class="cc-filter-cat"><option value="">All categories</option>' +
        catList.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + '</option>'; }).join('') + '</select>';
      html += '<input class="cc-filter-text" type="search" placeholder="Search items…" aria-label="Search items"></div>';
      html += '<div class="cc-tablewrap"><table class="cc-table"><thead><tr><th>#</th><th>Item</th><th>Category</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Claimed</th><th>Condition</th><th>Where in vehicle</th><th>Proof</th><th>Status / notes</th></tr></thead><tbody>';
      items.forEach(function (it, i) {
        var cond = String(it.condition || '').toLowerCase();
        var proof = Array.isArray(it.proof) ? it.proof : (it.proof ? [it.proof] : []);
        html += '<tr data-cat="' + esc(it.category || '') + '" data-text="' + esc([it.item, it.category, it.notes, it.status, it.location_in_vehicle, it.brand, it.model].filter(Boolean).join(' ').toLowerCase()) + '">';
        html += '<td class="num cc-muted">' + (i + 1) + '</td>';
        html += '<td><div class="cc-item">' + esc(it.item || '(unnamed item)') + '</div>' + ((it.brand || it.model || it.serial) ? '<div class="cc-muted">' + esc([it.brand, it.model, it.serial ? 'S/N ' + it.serial : ''].filter(Boolean).join(' · ')) + '</div>' : '') + (it.purchase_date ? '<div class="cc-muted">Purchased ' + fmtDate(it.purchase_date) + (it.purchased_from ? ' · ' + esc(it.purchased_from) : '') + '</div>' : '') + '</td>';
        html += '<td>' + (it.category ? '<span class="cc-cat">' + esc(it.category) + '</span>' : '') + '</td>';
        html += '<td class="num">' + esc(it.qty != null ? it.qty : 1) + '</td>';
        html += '<td class="num">' + money(it.purchase_price) + '</td>';
        html += '<td class="num">' + money(itemValue(it)) + '</td>';
        html += '<td><span class="cc-cond ' + esc(cond) + '">' + esc(it.condition || '') + '</span></td>';
        html += '<td>' + esc(it.location_in_vehicle || '') + '</td>';
        html += '<td class="cc-links">' + (proof.length ? proof.map(function (p) { return linkHtml(base, p, fileLabel(p)); }).join('') : '<span class="cc-muted">none yet</span>') + '</td>';
        html += '<td>' + (it.status ? '<div>' + esc(it.status) + '</div>' : '') + (it.notes ? '<div class="cc-muted">' + esc(it.notes) + '</div>' : '') + '</td>';
        html += '</tr>';
      });
      html += '</tbody><tfoot><tr><td></td><td colspan="4">Total (' + items.length + ' item' + (items.length === 1 ? '' : 's') + ')</td><td class="num cc-total">' + money(total) + '</td><td colspan="4"></td></tr></tfoot></table></div>';
    }
    html += hint(el, 'To add an item, edit <code>property_loss_items.js</code> in this binder (copy any entry). Put receipts or photos in <code>Receipts_And_Photos/</code> and list them under <code>proof</code>.');
    html += '</div>';
    el.innerHTML = html;

    var sel = el.querySelector('.cc-filter-cat');
    var txt = el.querySelector('.cc-filter-text');
    function applyFilter() {
      var cat = sel ? sel.value : '';
      var q = txt ? txt.value.trim().toLowerCase() : '';
      var shown = 0, sum = 0;
      Array.prototype.forEach.call(el.querySelectorAll('tbody tr'), function (tr, i) {
        var ok = (!cat || tr.getAttribute('data-cat') === cat) && (!q || tr.getAttribute('data-text').indexOf(q) !== -1);
        tr.style.display = ok ? '' : 'none';
        if (ok) { shown++; sum += itemValue(items[i]); }
      });
      var tot = el.querySelector('.cc-total');
      var lab = el.querySelector('tfoot td[colspan="4"]');
      if (tot) tot.textContent = money(sum);
      if (lab) lab.textContent = (shown === items.length ? 'Total (' : 'Filtered total (') + shown + ' item' + (shown === 1 ? '' : 's') + ')';
    }
    if (sel) sel.addEventListener('change', applyFilter);
    if (txt) txt.addEventListener('input', applyFilter);
  }

  function renderPropertyLossSummary(el) {
    if (typeof window.PROPERTY_LOSS_ITEMS === 'undefined') { el.innerHTML = '<span class="cc-summary cc-error-inline">property_loss_items.js could not be read (syntax error?)</span>'; return; }
    var items = (Array.isArray(window.PROPERTY_LOSS_ITEMS) ? window.PROPERTY_LOSS_ITEMS : []).filter(function (it) { return it && typeof it === 'object'; });
    var total = items.reduce(function (s, it) { return s + itemValue(it); }, 0);
    el.innerHTML = '<span class="cc-summary"><b>' + items.length + '</b> item' + (items.length === 1 ? '' : 's') + ' listed · <b>' + (money(total) || '$0.00') + '</b> claimed</span>';
  }

  // ---------- Injury photos ----------
  function renderInjuryPhotos(el) {
    if (typeof window.INJURY_PHOTOS === 'undefined') { el.innerHTML = '<div class="cc">' + loadError('injury_photos.js', 'INJURY_PHOTOS') + '</div>'; return; }
    var data = window.INJURY_PHOTOS || {};
    var folder = (el.getAttribute('data-folder') || data.folder || 'Pictures_Of_Bruises').replace(/\/+$/, '');
    var manifest = (Array.isArray(data.photos) ? data.photos : []).filter(function (p) { return p && typeof p === 'object' && p.file; });
    var byFile = {};
    manifest.forEach(function (p) { if (p && p.file) byFile[p.file] = p; });

    function draw(discovered, discoveryFailed) {
      var files = {};
      manifest.forEach(function (p) { if (p && p.file) files[p.file] = true; });
      (discovered || []).forEach(function (n) { if (isImage(n)) files[n] = true; });
      var names = Object.keys(files);
      var heic = (discovered || []).filter(isHeic);
      var missing = discovered ? manifest.filter(function (p) { return p.file && discovered.indexOf(p.file) === -1; }) : [];
      names.sort(function (a, b) {
        var da = (byFile[a] && byFile[a].date) || '9999', db = (byFile[b] && byFile[b].date) || '9999';
        return da < db ? -1 : da > db ? 1 : a.localeCompare(b, undefined, { numeric: true });
      });
      var uncaptioned = names.filter(function (n) { return !byFile[n]; }).length;

      var html = '<div class="cc cc-photos">';
      html += '<div class="cc-title">Injury Photographs</div>';
      html += '<div class="cc-sub">Client photographs of bruising and other visible injuries, in date order. Each opens at full size in a new tab. Descriptions are the client’s; no record has characterised these marks except where a caption says so.</div>';
      html += '<div class="cc-stats"><div class="cc-stat"><b>' + names.length + '</b><span>Photos</span></div>';
      if (uncaptioned) html += '<div class="cc-stat"><b>' + uncaptioned + '</b><span>Awaiting caption</span></div>';
      html += '</div>';
      if (missing.length) html += '<div class="cc-warn">Listed in injury_photos.js but not found in ' + esc(folder) + '/: ' + missing.map(function (p) { return esc(p.file); }).join(', ') + '</div>';
      if (heic.length) html += '<div class="cc-warn">' + heic.length + ' HEIC file' + (heic.length === 1 ? '' : 's') + ' in the folder cannot be shown by most browsers (' + heic.map(esc).join(', ') + '). Export them from the phone as JPEG and add the JPEG instead.</div>';
      if (!names.length) {
        html += '<div class="cc-empty">No photographs yet. Drop image files into <code>' + esc(folder) + '/</code>.</div>';
      } else {
        html += '<div class="cc-gallery">';
        names.forEach(function (n) {
          var p = byFile[n] || {};
          var href = folder + '/' + encodeURIComponent(n);
          html += '<figure class="cc-photo' + (byFile[n] ? '' : ' uncaptioned') + '">';
          html += '<a class="cc-thumb" href="' + esc(href) + '" target="_blank" rel="noopener"><img loading="lazy" src="' + esc(href) + '" alt="' + esc(p.region || n) + '"></a>';
          html += '<figcaption class="cc-photo-body">';
          if (p.date) html += '<div class="cc-photo-date">' + fmtDate(p.date) + (p.time ? ' ' + esc(p.time) : '') + '</div>';
          html += '<div class="cc-photo-region">' + esc(p.region || 'Caption pending') + '</div>';
          if (p.caption) html += '<div class="cc-photo-cap">' + esc(p.caption) + '</div>';
          if (p.source) html += '<div class="cc-muted">' + esc(p.source) + '</div>';
          html += '<div class="cc-photo-file">' + esc(n) + '</div>';
          html += '</figcaption></figure>';
        });
        html += '</div>';
      }
      if (discoveryFailed) html += '<div class="cc-hint">' + (location.protocol === 'file:' ? 'Page opened from disk, so the folder could not be scanned; ' : 'The folder listing could not be fetched (are you signed in?); ') + 'showing only photos listed in injury_photos.js.</div>';
      html += hint(el, 'To add a photo, copy the image into <code>' + esc(folder) + '/</code>. It appears here automatically; add its date, body region and caption in <code>injury_photos.js</code>.');
      html += '</div>';
      el.innerHTML = html;
    }

    if (location.protocol === 'file:' || typeof fetch !== 'function') { draw(null, true); return; }
    draw(null, false);
    fetch(folder + '/?format=json', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) {
        var names = (j.entries || []).filter(function (e) { return e.type === 'file'; }).map(function (e) { return e.name; });
        draw(names, false);
      })
      .catch(function () { draw(null, true); });
  }

  // ---------- bootstrap ----------
  var RENDERERS = {
    'claims': renderClaims,
    'property-loss': renderPropertyLoss,
    'property-loss-summary': renderPropertyLossSummary,
    'injury-photos': renderInjuryPhotos
  };

  function renderAll() {
    ensureStyle();
    Array.prototype.forEach.call(document.querySelectorAll('[data-component]'), function (el) {
      var fn = RENDERERS[el.getAttribute('data-component')];
      if (fn) {
        try { fn(el); } catch (e) { el.innerHTML = '<div class="cc-empty">Component error: ' + esc(e.message) + '</div>'; }
      }
    });
  }

  window.CaseComponents = { render: renderAll, renderClaims: renderClaims, renderPropertyLoss: renderPropertyLoss, renderInjuryPhotos: renderInjuryPhotos, itemValue: itemValue, money: money };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderAll);
  else renderAll();
})();
