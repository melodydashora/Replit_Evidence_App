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
 * Four more placeholders are backed by the server API (server.js: /api/me, /api/files, /api/ledger,
 * /api/restrictions, /api/access-log) rather than by a data file. They need the site to be served and
 * signed in; opened from disk they show one quiet notice and nothing else.
 *
 *   data-component="attachments" data-key="hertz"   files uploaded on the site for that component key
 *                                   (keys: hertz, property-loss, injury-photos, claims, carrier-messages,
 *                                   counsel-documents, signed-documents). Upload form, per-file restrict
 *                                   checkbox and delete button appear only for the roles /api/me allows.
 *   data-component="hertz"          the rental ledger: totals, the policy limit, and an editable table
 *   data-component="hertz-summary"  one-line ledger summary, for the portal card
 *   data-component="access-log"     the last 200 access-log rows; empty for roles that may not see it
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
    '.cc-summary-p{font-size:13px;line-height:1.55;color:#cbd5e1;margin:10px 0 0;}',
    '.cc-memo-link{font-weight:700;color:#7dd3fc;}',
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
    // ---- uploads, rental ledger and access log (the API-backed components) ----
    '.cc-notice{padding:12px 14px;border:1px dashed rgba(255,255,255,0.15);border-radius:8px;color:#94a3b8;font-size:12.5px;background:rgba(255,255,255,0.02);}',
    '.cc-loading{font-size:12.5px;color:#64748b;padding:8px 0;}',
    '.cc-msg{font-size:12.5px;margin:0 0 10px;padding:9px 12px;border-radius:6px;line-height:1.5;}',
    '.cc-msg:empty{display:none;padding:0;margin:0;border:0;}',
    '.cc-msg.err{color:#fecaca;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.4);}',
    '.cc-check{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#cbd5e1;cursor:pointer;white-space:nowrap;}',
    '.cc-check input{accent-color:#38bdf8;}',
    '.cc-check-block{display:flex;margin:0 0 12px;padding:9px 12px;background:#131b2e;border:1px solid rgba(255,255,255,0.08);border-radius:8px;white-space:normal;}',
    '.cc-files{display:flex;flex-direction:column;gap:10px;}',
    '.cc-file{display:flex;gap:12px;align-items:flex-start;background:#131b2e;border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:10px 12px;}',
    '.cc-file.restricted{border-color:rgba(245,158,11,0.45);}',
    '.cc-file-thumb{flex:0 0 96px;width:96px;height:72px;border-radius:6px;overflow:hidden;background:#0b0f19;display:block;}',
    '.cc-file-thumb img{width:100%;height:100%;object-fit:cover;display:block;}',
    '.cc-file-icon{flex:0 0 96px;width:96px;height:72px;border-radius:6px;background:#0b0f19;display:flex;align-items:center;justify-content:center;color:#64748b;font-size:24px;}',
    '.cc-file-main{flex:1;min-width:0;}',
    '.cc-file-name{font-size:13px;font-weight:700;color:#fff;overflow-wrap:anywhere;}',
    '.cc-file-cap{font-size:12.5px;color:#cbd5e1;margin-top:2px;line-height:1.45;}',
    '.cc-file-meta{font-size:11.5px;color:#94a3b8;margin-top:4px;font-family:"JetBrains Mono",monospace;overflow-wrap:anywhere;}',
    '.cc-file-actions{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-top:8px;}',
    '.cc-lock{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:700;color:#fcd34d;background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.4);border-radius:5px;padding:3px 8px;}',
    '.cc-btn{font-family:inherit;font-size:12px;font-weight:600;color:#e2e8f0;background:#1e293b;border:1px solid rgba(255,255,255,0.14);border-radius:6px;padding:6px 11px;cursor:pointer;}',
    '.cc-btn:hover{background:#27364d;}',
    '.cc-btn:disabled{opacity:.5;cursor:default;}',
    '.cc-btn.primary{color:#08111f;background:#38bdf8;border-color:#38bdf8;}.cc-btn.primary:hover{background:#7dd3fc;}',
    '.cc-btn.danger{color:#fca5a5;border-color:rgba(239,68,68,0.45);background:rgba(239,68,68,0.1);}.cc-btn.danger:hover{background:rgba(239,68,68,0.2);}',
    '.cc-upload{margin-top:14px;padding:12px 14px;background:#131b2e;border:1px solid rgba(255,255,255,0.08);border-radius:10px;}',
    '.cc-upload-row{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;}',
    '.cc-lbl{display:flex;flex-direction:column;gap:4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#94a3b8;}',
    '.cc-lbl input{background:#0b0f19;color:#f8fafc;border:1px solid rgba(255,255,255,0.14);border-radius:6px;padding:7px 10px;font-size:13px;font-family:inherit;text-transform:none;letter-spacing:0;font-weight:400;}',
    '.cc-lbl input[type=text]{min-width:230px;}',
    '.cc-progress{font-size:12px;color:#94a3b8;margin-top:8px;}',
    '.cc-progress:empty{display:none;}',
    '.cc-limit{font-size:12.5px;color:#cbd5e1;background:rgba(56,189,248,0.06);border:1px solid rgba(56,189,248,0.25);border-radius:8px;padding:10px 12px;margin:0 0 14px;line-height:1.6;}',
    '.cc-limit b{color:#fff;font-family:"JetBrains Mono",monospace;}',
    '.cc-limit .cc-src{display:block;margin-top:4px;font-size:11.5px;color:#94a3b8;}',
    '.cc-table input{background:#0b0f19;color:#f8fafc;border:1px solid rgba(255,255,255,0.14);border-radius:5px;padding:5px 7px;font-size:12.5px;font-family:inherit;width:100%;min-width:64px;}',
    '.cc-table input.num{text-align:right;font-family:"JetBrains Mono",monospace;}',
    '.cc-table tr.cc-new td{background:rgba(56,189,248,0.05);}',
    '.cc-rowbtns{display:flex;gap:6px;}',
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
    '[data-theme="light"] .cc-summary-p{color:#2b3548;}',
    '[data-theme="light"] .cc-memo-link{color:#123f7d;}',
    '[data-theme="light"] .cc-photo{background:#fff;border-color:#d8dee8;}[data-theme="light"] .cc-photo a.cc-thumb{background:#f0f3f8;}',
    '[data-theme="light"] .cc-photo-date{color:#5c6779;}[data-theme="light"] .cc-photo-region{color:#12213d;}[data-theme="light"] .cc-photo-cap{color:#2b3548;}[data-theme="light"] .cc-photo-file{color:#6b7484;}',
    '[data-theme="light"] .cc-photo.uncaptioned{border-color:#f3d48a;}[data-theme="light"] .cc-warn{color:#8a5a00;}',
    '[data-theme="light"] .cc-summary{color:#2b3548;}[data-theme="light"] .cc-summary b{color:#12213d;}',
    // ---- light theme for the API-backed components ----
    '[data-theme="light"] .cc-notice{border-color:#c9d2df;color:#5c6779;background:#fff;}',
    '[data-theme="light"] .cc-loading{color:#6b7484;}',
    '[data-theme="light"] .cc-msg.err{color:#b42318;background:#fdecea;border-color:#f0a8a2;}',
    '[data-theme="light"] .cc-check{color:#2b3548;}[data-theme="light"] .cc-check input{accent-color:#1a5db3;}',
    '[data-theme="light"] .cc-check-block{background:#fff;border-color:#d8dee8;box-shadow:0 1px 3px rgba(16,24,40,.06);}',
    '[data-theme="light"] .cc-file{background:#fff;border-color:#d8dee8;box-shadow:0 1px 3px rgba(16,24,40,.06);}',
    '[data-theme="light"] .cc-file.restricted{border-color:#f3d48a;}',
    '[data-theme="light"] .cc-file-thumb,[data-theme="light"] .cc-file-icon{background:#f0f3f8;}',
    '[data-theme="light"] .cc-file-icon{color:#8a94a6;}',
    '[data-theme="light"] .cc-file-name{color:#12213d;}[data-theme="light"] .cc-file-cap{color:#2b3548;}[data-theme="light"] .cc-file-meta{color:#5c6779;}',
    '[data-theme="light"] .cc-lock{color:#8a5a00;background:#fff4dc;border-color:#f3d48a;}',
    '[data-theme="light"] .cc-btn{color:#1b2437;background:#fff;border-color:#c9d2df;}[data-theme="light"] .cc-btn:hover{background:#f0f3f8;}',
    '[data-theme="light"] .cc-btn.primary{color:#fff;background:#1a5db3;border-color:#1a5db3;}[data-theme="light"] .cc-btn.primary:hover{background:#154a90;}',
    '[data-theme="light"] .cc-btn.danger{color:#b42318;background:#fdecea;border-color:#f0a8a2;}[data-theme="light"] .cc-btn.danger:hover{background:#fbd9d5;}',
    '[data-theme="light"] .cc-upload{background:#fff;border-color:#d8dee8;box-shadow:0 1px 3px rgba(16,24,40,.06);}',
    '[data-theme="light"] .cc-lbl{color:#5c6779;}',
    '[data-theme="light"] .cc-lbl input{background:#fff;color:#1b2437;border-color:#c9d2df;}',
    '[data-theme="light"] .cc-progress{color:#5c6779;}',
    '[data-theme="light"] .cc-limit{background:#eaf1fb;border-color:#bcd0ee;color:#2b3548;}',
    '[data-theme="light"] .cc-limit b{color:#12213d;}[data-theme="light"] .cc-limit .cc-src{color:#5c6779;}',
    '[data-theme="light"] .cc-table input{background:#fff;color:#1b2437;border-color:#c9d2df;}',
    '[data-theme="light"] .cc-table tr.cc-new td{background:#f7faff;}'
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
      html += '<div class="cc-sub">One card per claim file: the figures and contacts recorded in <code>claims_status.js</code>, a one-paragraph summary, and the links. The full detail and its sources are in each claim\u2019s memo, the first link on the card.</div>';
    }
    if (!claims.length) {
      html += '<div class="cc-empty">No claims recorded yet.</div>';
    } else {
      html += '<div class="cc-cards">';
      claims.forEach(function (c) {
        var sc = statusClass(c.status);
        html += '<div class="cc-card ' + sc + '">';
        // The card is deliberately short: who, which claim, where it stands, one paragraph, the next
        // action, then the links. Claim type, coverage lines and the reasoning are in the claim memo,
        // which is the first link on every card; the type is kept as the carrier's tooltip.
        html += '<div class="cc-card-top"><div><div class="cc-carrier"' + (c.type ? ' title="' + esc(c.type) + '"' : '') + '>' + esc(c.carrier || 'Carrier') + '</div>';
        html += '<div class="cc-claimno">' + (c.claim_number ? 'Claim ' + esc(c.claim_number) : '<span class="cc-muted">claim number not yet assigned</span>') + '</div></div>';
        html += '<span class="cc-pill ' + sc + '">' + esc(c.status || 'Open') + '</span></div>';
        html += '<dl class="cc-kv">';
        if (c.policy_number) html += '<dt>Policy</dt><dd>' + esc(c.policy_number) + '</dd>';
        if (c.incident_date) html += '<dt>Incident date on claim</dt><dd>' + fmtDate(c.incident_date) + '</dd>';
        if (c.adjuster) html += '<dt>Adjuster</dt><dd>' + esc(c.adjuster) + '</dd>';
        if (c.phone) html += '<dt>Phone</dt><dd>' + esc(c.phone) + '</dd>';
        if (c.amount_paid != null && c.amount_paid !== '') html += '<dt>Paid to date</dt><dd>' + esc(money(c.amount_paid) || c.amount_paid) + '</dd>';
        if (c.last_update) html += '<dt>Last update</dt><dd>' + fmtDate(c.last_update) + '</dd>';
        html += '</dl>';
        if (c.summary) html += '<p class="cc-summary-p">' + esc(c.summary) + '</p>';
        if (c.next_step) html += '<div class="cc-next"><strong>Next:</strong> ' + esc(c.next_step) + '</div>';
        var links = [];
        if (c.memo) links.push(linkHtml(base, c.memo, 'Full claim memo', 'cc-link cc-memo-link'));
        if (Array.isArray(c.documents)) {
          c.documents.filter(Boolean).forEach(function (d) {
            if (typeof d === 'string') links.push(linkHtml(base, d, fileLabel(d)));
            else if (d.href) links.push(linkHtml(base, d.href, d.label || fileLabel(d.href)));
          });
        }
        if (links.length) html += '<div class="cc-links" style="margin-top:10px;">' + links.join(' ') + '</div>';
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

  // ================= API-backed components (uploads, rental ledger, restrictions, access log) =================
  //
  // Everything below talks to the routes in server.js: /api/me, /api/files, /api/ledger,
  // /api/restrictions and /api/access-log. Three rules the server enforces, so the browser has to obey them:
  //   * every mutating request carries "X-Requested-With: CaseComponents" (the server refuses one without it,
  //     which is what stops another site from posting here with the reader's cookie);
  //   * every request carries the session cookie (credentials: 'same-origin');
  //   * nothing on this side decides who may do what. /api/me is the only source of permissions; the
  //     checkboxes, delete buttons and upload form are drawn only when it says the role has them. The server
  //     checks again on every call, so a hidden control is a convenience, never the protection.

  var API_NOTICE = 'The upload store is not configured on this server.';

  // Opened from disk there is no server to ask (and no cookie), so the API-backed components say so and stop.
  function apiUsable() {
    return location.protocol !== 'file:' && typeof fetch === 'function';
  }

  function apiError(status, message) {
    var e = new Error(message || 'The request failed (HTTP ' + status + ').');
    e.status = status;
    return e;
  }

  function api(method, path, opts) {
    opts = opts || {};
    var headers = { Accept: 'application/json' };
    if (method !== 'GET' && method !== 'HEAD') headers['X-Requested-With'] = 'CaseComponents';
    var k;
    if (opts.headers) {
      for (k in opts.headers) {
        if (Object.prototype.hasOwnProperty.call(opts.headers, k)) headers[k] = opts.headers[k];
      }
    }
    var init = { method: method, credentials: 'same-origin', headers: headers };
    if (opts.json !== undefined) { headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.json); }
    else if (opts.body !== undefined) { init.body = opts.body; }
    return fetch(path, init).then(function (r) {
      return r.text().then(function (text) {
        var data = null;
        if (text) { try { data = JSON.parse(text); } catch (e) { data = null; } }
        // Errors come back as {"error": "<plain sentence>"}; show that sentence, not a status code.
        if (!r.ok) throw apiError(r.status, data && data.error ? data.error : null);
        return data;
      });
    });
  }

  // /api/me is fetched once per page and shared by every component on it.
  var mePromise = null;
  function me() {
    if (!mePromise) {
      mePromise = apiUsable() ? api('GET', '/api/me') : Promise.reject(apiError(0, API_NOTICE));
      // The cached promise is handed out repeatedly; swallow the rejection once here so a page with no
      // API (or with none of these components mounted) does not log an unhandled rejection.
      mePromise['catch'](function () {});
    }
    return mePromise;
  }

  // can(info, 'upload'|'delete', key) -> is this component key in that permission list?
  // can(info, 'editLedger'|'manageRestrictions'|'viewAccessLog') -> the plain flag.
  function can(info, what, key) {
    var p = info && info.permissions ? info.permissions : {};
    if (what === 'upload' || what === 'delete') {
      var list = p[what];
      return !!(list && list.indexOf && list.indexOf(key) !== -1);
    }
    return !!p[what];
  }

  function errText(e) {
    if (e && e.status === 503) return API_NOTICE;
    return (e && e.message) ? e.message : 'The request failed.';
  }

  var ROLE_LABELS = { owner: 'Owner', counsel: 'Counsel', adjuster: 'Adjuster', tnc: 'Casualty group' };
  function roleLabel(r) { return ROLE_LABELS[r] || String(r || ''); }

  function fmtBytes(n) {
    var b = num(n);
    if (b === null) return '';
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
  }
  // ISO timestamp -> "Sep 4, 2026 5:10 PM" in the reader's own time zone.
  function fmtStamp(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return esc(iso);
    return MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear() + ' ' +
      d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  // Only the formats every browser paints inline get a thumbnail; HEIC and the rest get an icon.
  function isViewableImage(mime) { return /^image\/(png|jpeg|webp|gif)$/i.test(String(mime || '')); }
  function fileIcon(mime, name) {
    var m = String(mime || '').toLowerCase(), n = String(name || '').toLowerCase();
    if (m === 'application/pdf' || /\.pdf$/.test(n)) return 'fa-file-pdf';
    if (m.indexOf('image/') === 0) return 'fa-file-image';
    if (m.indexOf('video/') === 0) return 'fa-file-video';
    if (m === 'message/rfc822' || /\.eml$/.test(n)) return 'fa-envelope';
    if (m.indexOf('word') !== -1 || /\.docx?$/.test(n)) return 'fa-file-word';
    if (m.indexOf('text/') === 0) return 'fa-file-lines';
    return 'fa-file';
  }
  function noticeHtml(text) {
    return '<div class="cc"><div class="cc-notice">' + esc(text) + '</div></div>';
  }

  // ---------- Attachments (data-component="attachments" data-key="<component key>") ----------
  function renderAttachments(el) {
    var key = el.getAttribute('data-key') || '';
    var title = el.getAttribute('data-title') || 'Files uploaded on the site';
    var desc = el.getAttribute('data-desc') || '';
    var info = null;     // the answer to /api/me
    var listing = null;  // the answer to /api/files?component=key
    // Upload state survives the redraws that follow each successful file, so the progress line does not vanish.
    var upload = { active: false, text: '', caption: '', docDate: '' };

    if (!key) {
      el.innerHTML = '<div class="cc"><div class="cc-empty cc-error">This attachments panel is missing its <code>data-key</code>.</div></div>';
      return;
    }
    if (!apiUsable()) { el.innerHTML = noticeHtml(API_NOTICE); return; }

    function headHtml() {
      return '<div class="cc cc-attach"><div class="cc-title">' + esc(title) + '</div>' +
        (desc ? '<div class="cc-sub">' + esc(desc) + '</div>' : '');
    }

    function showMsg(e) {
      var box = el.querySelector('.cc-msg');
      if (box) box.textContent = e ? errText(e) : '';
    }

    function setProgress(text) {
      upload.text = text || '';
      var p = el.querySelector('.cc-progress');
      if (p) p.textContent = upload.text;
    }

    function fileHtml(f, mayDelete, mayRestrict) {
      var url = '/api/files/' + encodeURIComponent(f.id);
      // downloadable is computed by the server for THIS caller: false only for the adjuster and
      // casualty-group tokens when the file or its component is restricted.
      var locked = f.downloadable === false;
      var h = '<div class="cc-file' + (f.restricted ? ' restricted' : '') + '" data-id="' + esc(f.id) + '">';
      if (!locked && isViewableImage(f.mime)) {
        h += '<a class="cc-file-thumb" href="' + esc(url) + '" target="_blank" rel="noopener">' +
          '<img loading="lazy" src="' + esc(url) + '" alt="' + esc(f.caption || f.name) + '"></a>';
      } else {
        h += '<div class="cc-file-icon"><i class="fa-solid ' + esc(fileIcon(f.mime, f.name)) + '"></i></div>';
      }
      h += '<div class="cc-file-main">';
      h += '<div class="cc-file-name">' + esc(f.name) + '</div>';
      if (f.caption) h += '<div class="cc-file-cap">' + esc(f.caption) + '</div>';
      var meta = [];
      if (f.doc_date) meta.push(fmtDate(f.doc_date));
      if (f.size != null) meta.push(fmtBytes(f.size));
      meta.push('uploaded by ' + esc(roleLabel(f.uploaded_by)) + ' ' + fmtStamp(f.uploaded_at));
      h += '<div class="cc-file-meta">' + meta.join(' &middot; ') + '</div>';
      h += '<div class="cc-file-actions">';
      if (locked) {
        h += '<span class="cc-lock"><i class="fa-solid fa-lock"></i> Download restricted</span>';
      } else {
        h += '<a class="cc-link" href="' + esc(url) + '" target="_blank" rel="noopener">Open</a>';
        h += '<a class="cc-link" href="' + esc(url + '?download=1') + '">Download</a>';
      }
      if (mayRestrict) {
        h += '<label class="cc-check"><input type="checkbox" class="cc-file-restrict"' + (f.restricted ? ' checked' : '') + '> Restrict</label>';
      }
      if (mayDelete) h += '<button type="button" class="cc-btn danger cc-file-delete">Delete</button>';
      h += '</div></div></div>';
      return h;
    }

    function draw() {
      var files = (listing && listing.files) || [];
      var compRestricted = !!(listing && listing.restricted);
      var mayUpload = can(info, 'upload', key);
      var mayDelete = can(info, 'delete', key);
      var mayRestrict = can(info, 'manageRestrictions');
      var lockedCount = 0, i;
      for (i = 0; i < files.length; i++) if (files[i].restricted) lockedCount++;

      var html = headHtml();
      html += '<div class="cc-stats">';
      html += '<div class="cc-stat"><b>' + files.length + '</b><span>File' + (files.length === 1 ? '' : 's') + '</span></div>';
      html += '<div class="cc-stat"><b>' + (compRestricted ? 'Restricted' : 'Open') + '</b><span>Downloads for adjuster / casualty group</span></div>';
      if (lockedCount) html += '<div class="cc-stat"><b>' + lockedCount + '</b><span>Single files restricted</span></div>';
      html += '</div>';
      if (mayRestrict) {
        html += '<label class="cc-check cc-check-block"><input type="checkbox" class="cc-comp-restrict"' +
          (compRestricted ? ' checked' : '') + '> Restrict downloads for the adjuster and casualty-group tokens</label>';
      }
      html += '<div class="cc-msg err"></div>';
      if (!files.length) {
        html += '<div class="cc-empty">Nothing uploaded here yet.</div>';
      } else {
        html += '<div class="cc-files">';
        for (i = 0; i < files.length; i++) html += fileHtml(files[i], mayDelete, mayRestrict);
        html += '</div>';
      }
      if (mayUpload) {
        html += '<form class="cc-upload"><div class="cc-upload-row">' +
          '<label class="cc-lbl">Files<input type="file" class="cc-up-files" multiple></label>' +
          '<label class="cc-lbl">Caption (optional)<input type="text" class="cc-up-caption" placeholder="What this shows"></label>' +
          '<label class="cc-lbl">Date of the document<input type="date" class="cc-up-date"></label>' +
          '<button type="submit" class="cc-btn primary cc-up-go">Upload</button></div>' +
          '<div class="cc-progress"></div></form>';
      }
      html += '</div>';
      el.innerHTML = html;
      wire();

      var form = el.querySelector('.cc-upload');
      if (form && upload.active) {
        // Mid-upload redraw: put the typed caption and date back and keep the form locked.
        var c = form.querySelector('.cc-up-caption'); if (c) { c.value = upload.caption; c.disabled = true; }
        var d = form.querySelector('.cc-up-date'); if (d) { d.value = upload.docDate; d.disabled = true; }
        var fi = form.querySelector('.cc-up-files'); if (fi) fi.disabled = true;
        var go = form.querySelector('.cc-up-go'); if (go) go.disabled = true;
      }
      setProgress(upload.text);
    }

    function load() {
      return Promise.all([me(), api('GET', '/api/files?component=' + encodeURIComponent(key))])
        .then(function (r) { info = r[0]; listing = r[1]; draw(); })
        .catch(function (e) {
          if (e && e.status === 503) { el.innerHTML = noticeHtml(API_NOTICE); return; }
          el.innerHTML = headHtml() + '<div class="cc-msg err">' + esc(errText(e)) + '</div></div>';
        });
    }

    function wire() {
      var compBox = el.querySelector('.cc-comp-restrict');
      if (compBox) {
        compBox.addEventListener('change', function () {
          var on = compBox.checked;
          compBox.disabled = true;
          api('PUT', '/api/restrictions', { json: { scope: 'component:' + key, restricted: on } })
            .then(function () { return load(); })
            .catch(function (e) { compBox.checked = !on; compBox.disabled = false; showMsg(e); });
        });
      }
      Array.prototype.forEach.call(el.querySelectorAll('.cc-file'), function (row) {
        var id = row.getAttribute('data-id');
        var box = row.querySelector('.cc-file-restrict');
        if (box) {
          box.addEventListener('change', function () {
            var on = box.checked;
            box.disabled = true;
            api('PATCH', '/api/files/' + encodeURIComponent(id), { json: { restricted: on } })
              .then(function () { return load(); })
              .catch(function (e) { box.checked = !on; box.disabled = false; showMsg(e); });
          });
        }
        var del = row.querySelector('.cc-file-delete');
        if (del) {
          del.addEventListener('click', function () {
            var nameEl = row.querySelector('.cc-file-name');
            var name = nameEl ? nameEl.textContent : 'this file';
            // confirm() is fine for a delete; API errors are shown inline, never in an alert box.
            if (!window.confirm('Remove "' + name + '" from this panel? The file is kept in the database (nothing is erased), but it stops being listed here.')) return;
            del.disabled = true;
            api('DELETE', '/api/files/' + encodeURIComponent(id))
              .then(function () { return load(); })
              .catch(function (e) { del.disabled = false; showMsg(e); });
          });
        }
      });
      var form = el.querySelector('.cc-upload');
      if (form) form.addEventListener('submit', function (ev) { ev.preventDefault(); startUpload(form); });
    }

    function startUpload(form) {
      var input = form.querySelector('.cc-up-files');
      var capEl = form.querySelector('.cc-up-caption');
      var dateEl = form.querySelector('.cc-up-date');
      var files = input && input.files ? Array.prototype.slice.call(input.files) : [];
      showMsg(null);
      if (!files.length) { showMsg({ message: 'Choose at least one file first.' }); return; }
      upload.caption = capEl ? capEl.value : '';
      upload.docDate = dateEl ? dateEl.value : '';
      if (upload.docDate && !/^\d{4}-\d{2}-\d{2}$/.test(upload.docDate)) {
        showMsg({ message: 'The document date must be a calendar date (YYYY-MM-DD).' });
        return;
      }
      upload.active = true;
      var i = 0, ok = 0, failed = [];
      var go = form.querySelector('.cc-up-go'); if (go) go.disabled = true;
      if (input) input.disabled = true;
      if (capEl) capEl.disabled = true;
      if (dateEl) dateEl.disabled = true;

      function finish() {
        upload.active = false;
        upload.text = ok + ' of ' + files.length + ' file' + (files.length === 1 ? '' : 's') + ' uploaded.';
        draw();                       // redraws with a fresh, enabled form
        if (failed.length) showMsg({ message: failed.join(' ') });
      }

      // One file at a time, and the listing is re-fetched after each success so the page never
      // shows a file the server did not actually store.
      function next() {
        if (i >= files.length) { finish(); return; }
        var f = files[i++];
        setProgress('Uploading ' + f.name + ' (' + i + ' of ' + files.length + ')…');
        var headers = {
          'Content-Type': f.type || 'application/octet-stream',
          'X-File-Name': encodeURIComponent(f.name)
        };
        if (upload.caption) headers['X-Caption'] = encodeURIComponent(upload.caption);
        if (upload.docDate) headers['X-Doc-Date'] = upload.docDate;
        api('POST', '/api/files?component=' + encodeURIComponent(key), { headers: headers, body: f })
          .then(function () { ok++; return load(); })
          .catch(function (e) { failed.push(f.name + ': ' + errText(e)); })
          .then(next, next);
      }
      next();
    }

    el.innerHTML = headHtml() + '<div class="cc-loading">Loading…</div></div>';
    load();
  }

  // ---------- Hertz rental ledger (data-component="hertz") ----------
  // The reimbursement limit is not a computed figure: it is what Progressive's coverage screen shows
  // for the personal policy at the time of the collision. Quoted, with its source, never re-derived.
  var HERTZ_CAP = {
    perDay: 60,
    days: 30,
    total: 1800,
    source: 'Progressive coverage-at-time-of-incident screen, claim 26-854858569 (binder 08)'
  };

  function numText(v) { var n = num(v); return n === null ? '' : String(n); }

  function renderHertz(el) {
    var title = el.getAttribute('data-title') || 'Rental charges and what has been paid';
    var desc = el.getAttribute('data-desc') || '';
    var info = null, data = null;

    if (!apiUsable()) { el.innerHTML = noticeHtml(API_NOTICE); return; }

    function headHtml() {
      return '<div class="cc cc-hertz"><div class="cc-title">' + esc(title) + '</div>' +
        (desc ? '<div class="cc-sub">' + esc(desc) + '</div>' : '');
    }
    function showMsg(e) {
      var box = el.querySelector('.cc-msg');
      if (box) box.textContent = e ? errText(e) : '';
    }

    function rowHtml(en, editable) {
      var h = '<tr data-id="' + esc(en.id) + '">';
      if (editable) {
        h += '<td><input type="date" class="cc-f-date" value="' + esc(en.entry_date || '') + '"></td>';
        h += '<td><input type="text" class="cc-f-desc" value="' + esc(en.description || '') + '"></td>';
        h += '<td class="num"><input type="number" step="0.01" min="0" class="num cc-f-amount" value="' + esc(numText(en.amount)) + '"></td>';
        h += '<td class="num"><input type="number" step="0.01" min="0" class="num cc-f-client" value="' + esc(numText(en.paid_by_client)) + '"></td>';
        h += '<td class="num"><input type="number" step="0.01" min="0" class="num cc-f-insurer" value="' + esc(numText(en.paid_by_insurer)) + '"></td>';
        h += '<td><input type="text" class="cc-f-note" value="' + esc(en.note || '') + '"></td>';
        h += '<td><div class="cc-rowbtns"><button type="button" class="cc-btn cc-row-save">Save</button>' +
          '<button type="button" class="cc-btn danger cc-row-del">Delete</button></div></td>';
      } else {
        h += '<td>' + (en.entry_date ? fmtDate(en.entry_date) : '<span class="cc-muted">no date</span>') + '</td>';
        h += '<td>' + esc(en.description || '') + '</td>';
        h += '<td class="num">' + money(en.amount) + '</td>';
        h += '<td class="num">' + money(en.paid_by_client) + '</td>';
        h += '<td class="num">' + money(en.paid_by_insurer) + '</td>';
        h += '<td>' + esc(en.note || '') + '</td>';
      }
      h += '</tr>';
      return h;
    }

    function draw() {
      var entries = (data && data.entries) || [];
      var t = (data && data.totals) || {};
      var editable = can(info, 'editLedger');
      var charges = num(t.amount) || 0;
      var over = Math.max(0, charges - HERTZ_CAP.total);
      var cols = editable ? 7 : 6;

      var html = headHtml();
      html += '<div class="cc-stats">';
      html += '<div class="cc-stat"><b>' + (money(charges) || '$0.00') + '</b><span>Total charges</span></div>';
      html += '<div class="cc-stat"><b>' + (money(t.paid_by_client) || '$0.00') + '</b><span>Paid by client</span></div>';
      html += '<div class="cc-stat"><b>' + (money(t.paid_by_insurer) || '$0.00') + '</b><span>Paid by Progressive</span></div>';
      html += '<div class="cc-stat"><b>' + (money(t.remaining) || '$0.00') + '</b><span>Remaining</span></div>';
      html += '</div>';
      html += '<div class="cc-limit">Policy rental reimbursement limit: <b>' + money(HERTZ_CAP.perDay) + '</b> per day, ' +
        HERTZ_CAP.days + ' days, <b>' + money(HERTZ_CAP.total) + '</b> in total. ' +
        'Above the limit: <b>' + money(over) + '</b>.' +
        '<span class="cc-src">Limit as shown on the ' + esc(HERTZ_CAP.source) + '.</span></div>';
      html += '<div class="cc-msg err"></div>';
      html += '<div class="cc-tablewrap"><table class="cc-table"><thead><tr>' +
        '<th>Date</th><th>Description</th><th class="num">Charge</th><th class="num">Paid by client</th>' +
        '<th class="num">Paid by Progressive</th><th>Note</th>' + (editable ? '<th>Row</th>' : '') +
        '</tr></thead><tbody>';
      if (!entries.length && !editable) {
        html += '<tr><td colspan="' + cols + '"><span class="cc-muted">No rental charges recorded yet.</span></td></tr>';
      }
      for (var i = 0; i < entries.length; i++) html += rowHtml(entries[i], editable);
      if (editable) {
        html += '<tr class="cc-new">' +
          '<td><input type="date" class="cc-n-date"></td>' +
          '<td><input type="text" class="cc-n-desc" placeholder="e.g. Hertz rental day 1"></td>' +
          '<td class="num"><input type="number" step="0.01" min="0" class="num cc-n-amount" placeholder="0.00"></td>' +
          '<td class="num"><input type="number" step="0.01" min="0" class="num cc-n-client" placeholder="0.00"></td>' +
          '<td class="num"><input type="number" step="0.01" min="0" class="num cc-n-insurer" placeholder="0.00"></td>' +
          '<td><input type="text" class="cc-n-note" placeholder="optional"></td>' +
          '<td><button type="button" class="cc-btn primary cc-row-add">Add</button></td></tr>';
      }
      html += '</tbody><tfoot><tr><td colspan="2">Total (' + entries.length + ' charge' + (entries.length === 1 ? '' : 's') + ')</td>' +
        '<td class="num">' + (money(charges) || '$0.00') + '</td>' +
        '<td class="num">' + (money(t.paid_by_client) || '$0.00') + '</td>' +
        '<td class="num">' + (money(t.paid_by_insurer) || '$0.00') + '</td>' +
        '<td' + (editable ? ' colspan="2"' : '') + '>' + (money(t.remaining) || '$0.00') + ' remaining</td></tr></tfoot></table></div>';
      html += '</div>';
      el.innerHTML = html;
      wire(editable);
    }

    function fields(scope, prefix) {
      // Reads one row of inputs. Blank amounts count as 0 so a part-filled row still adds up.
      function val(cls) { var n2 = scope.querySelector(cls); return n2 ? n2.value : ''; }
      return {
        entry_date: val('.cc-' + prefix + '-date') || null,
        description: val('.cc-' + prefix + '-desc'),
        amount: num(val('.cc-' + prefix + '-amount')) || 0,
        paid_by_client: num(val('.cc-' + prefix + '-client')) || 0,
        paid_by_insurer: num(val('.cc-' + prefix + '-insurer')) || 0,
        note: val('.cc-' + prefix + '-note')
      };
    }

    function wire(editable) {
      if (!editable) return;
      Array.prototype.forEach.call(el.querySelectorAll('tbody tr[data-id]'), function (tr) {
        var id = tr.getAttribute('data-id');
        var save = tr.querySelector('.cc-row-save');
        if (save) {
          save.addEventListener('click', function () {
            save.disabled = true;
            api('PATCH', '/api/ledger/' + encodeURIComponent(id), { json: fields(tr, 'f') })
              .then(function () { return load(); })
              .catch(function (e) { save.disabled = false; showMsg(e); });
          });
        }
        var del = tr.querySelector('.cc-row-del');
        if (del) {
          del.addEventListener('click', function () {
            if (!window.confirm('Remove this charge from the ledger? The row is kept in the database, but it stops counting towards the totals.')) return;
            del.disabled = true;
            api('DELETE', '/api/ledger/' + encodeURIComponent(id))
              .then(function () { return load(); })
              .catch(function (e) { del.disabled = false; showMsg(e); });
          });
        }
      });
      var add = el.querySelector('.cc-row-add');
      if (add) {
        add.addEventListener('click', function () {
          var tr = el.querySelector('tr.cc-new');
          var body = fields(tr, 'n');
          if (!body.description && !body.amount) { showMsg({ message: 'Give the new row a description or an amount.' }); return; }
          add.disabled = true;
          api('POST', '/api/ledger?component=hertz', { json: body })
            .then(function () { return load(); })
            .catch(function (e) { add.disabled = false; showMsg(e); });
        });
      }
    }

    function load() {
      return Promise.all([me(), api('GET', '/api/ledger?component=hertz')])
        .then(function (r) { info = r[0]; data = r[1]; draw(); })
        .catch(function (e) {
          if (e && e.status === 503) { el.innerHTML = noticeHtml(API_NOTICE); return; }
          el.innerHTML = headHtml() + '<div class="cc-msg err">' + esc(errText(e)) + '</div></div>';
        });
    }

    el.innerHTML = headHtml() + '<div class="cc-loading">Loading…</div></div>';
    load();
  }

  // ---------- One-line rental summary for the portal card (data-component="hertz-summary") ----------
  function renderHertzSummary(el) {
    if (!apiUsable()) { el.innerHTML = '<span class="cc-summary">' + esc(API_NOTICE) + '</span>'; return; }
    el.innerHTML = '<span class="cc-summary cc-muted">Loading rental ledger…</span>';
    api('GET', '/api/ledger?component=hertz')
      .then(function (d) {
        var entries = (d && d.entries) || [];
        var t = (d && d.totals) || {};
        el.innerHTML = '<span class="cc-summary"><b>' + entries.length + '</b> charge' + (entries.length === 1 ? '' : 's') +
          ' · <b>' + (money(t.amount) || '$0.00') + '</b> charged · <b>' + (money(t.remaining) || '$0.00') + '</b> outstanding</span>';
      })
      .catch(function () {
        el.innerHTML = '<span class="cc-summary cc-muted">rental ledger unavailable</span>';
      });
  }

  // ---------- Access log (data-component="access-log") ----------
  // Drawn only for the roles /api/me grants viewAccessLog; for anyone else the element stays empty,
  // so the page around it can carry the section heading without it looking broken.
  function renderAccessLog(el) {
    if (!apiUsable()) { el.innerHTML = noticeHtml(API_NOTICE); return; }
    el.innerHTML = '';
    me().then(function (info) {
      if (!can(info, 'viewAccessLog')) { el.innerHTML = ''; return; }
      el.innerHTML = '<div class="cc"><div class="cc-loading">Loading…</div></div>';
      return api('GET', '/api/access-log?limit=200').then(function (d) {
        // The route may answer with a bare array or with the rows under a key; accept either.
        var rows = Array.isArray(d) ? d : ((d && (d.entries || d.rows || d.log)) || []);
        var html = '<div class="cc cc-log">';
        html += '<div class="cc-stats"><div class="cc-stat"><b>' + rows.length + '</b><span>Most recent entries</span></div></div>';
        if (!rows.length) {
          html += '<div class="cc-empty">Nothing recorded yet.</div>';
        } else {
          html += '<div class="cc-tablewrap"><table class="cc-table"><thead><tr><th>When</th><th>Role</th><th>IP</th>' +
            '<th>Method</th><th>Path</th><th class="num">Status</th><th>Note</th></tr></thead><tbody>';
          for (var i = 0; i < rows.length; i++) {
            var r = rows[i] || {};
            html += '<tr><td class="cc-muted">' + fmtStamp(r.ts) + '</td>' +
              '<td>' + esc(roleLabel(r.role)) + '</td>' +
              '<td class="cc-muted">' + esc(r.ip || '') + '</td>' +
              '<td>' + esc(r.method || '') + '</td>' +
              '<td style="overflow-wrap:anywhere;">' + esc(r.path || '') + '</td>' +
              '<td class="num">' + esc(r.status == null ? '' : r.status) + '</td>' +
              '<td>' + esc(r.note || '') + '</td></tr>';
          }
          html += '</tbody></table></div>';
        }
        html += '</div>';
        el.innerHTML = html;
      });
    }).catch(function (e) {
      el.innerHTML = noticeHtml(errText(e));
    });
  }

  // ---------- bootstrap ----------
  var RENDERERS = {
    'claims': renderClaims,
    'property-loss': renderPropertyLoss,
    'property-loss-summary': renderPropertyLossSummary,
    'injury-photos': renderInjuryPhotos,
    'attachments': renderAttachments,
    'hertz': renderHertz,
    'hertz-summary': renderHertzSummary,
    'access-log': renderAccessLog
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

  window.CaseComponents = {
    render: renderAll,
    renderClaims: renderClaims,
    renderPropertyLoss: renderPropertyLoss,
    renderInjuryPhotos: renderInjuryPhotos,
    renderAttachments: renderAttachments,
    renderHertz: renderHertz,
    me: me,
    HERTZ_CAP: HERTZ_CAP,
    itemValue: itemValue,
    money: money
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderAll);
  else renderAll();
})();
