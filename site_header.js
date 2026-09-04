/*
 * site_header.js — global "Return to Evidence Portal" header.
 *
 * Include it once, right after <body>, on every STATIC page except the landing page:
 *     <script src="/site_header.js"></script>          (pages served by server.js)
 *     <script src="../site_header.js"></script>        (also works when the folder is opened from disk)
 *
 * It is NOT used on the landing page (00_START_HERE_EVIDENCE_PORTAL.html), on the reconstruction app
 * (index.html, which opens in its own tab), or on documents (PDF, images, Markdown) that open in a new tab.
 * The server adds it to its generated folder listings automatically.
 *
 * Optional per-page settings, set before the script tag:
 *     <script>window.SITE_HEADER = { section: 'Binder 06 · Medical Records' };</script>
 * When `section` is omitted the page <title> (text before the first "|") is used.
 */
(function () {
  'use strict';
  if (window.__siteHeaderInstalled) return;
  window.__siteHeaderInstalled = true;

  var cfg = window.SITE_HEADER || {};
  var isFile = location.protocol === 'file:';

  // Resolve the portal URL. Served: always "/". From disk: walk up to the repo root by counting the
  // directory depth of this script's own path (site_header.js lives at the repo root).
  function homeHref() {
    if (!isFile) return '/';
    var script = document.currentScript || document.querySelector('script[src*="site_header.js"]');
    var src = script ? script.getAttribute('src') : 'site_header.js';
    return src.replace(/site_header\.js(\?.*)?$/, '') + '00_START_HERE_EVIDENCE_PORTAL.html';
  }

  function sectionLabel() {
    if (cfg.section) return cfg.section;
    var t = (document.title || '').split('|')[0].trim();
    return t;
  }

  var css = [
    '#siteHeader{position:fixed;top:0;left:0;right:0;z-index:2000;background:rgba(11,15,25,0.92);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);',
    'border-bottom:1px solid rgba(56,189,248,0.25);box-shadow:0 4px 18px rgba(0,0,0,0.45);font-family:"Inter",-apple-system,"Segoe UI",sans-serif;color:#f8fafc;}',
    '#siteHeader .sh-inner{max-width:1200px;margin:0 auto;display:flex;align-items:center;gap:14px;padding:9px 20px;min-height:48px;}',
    '#siteHeader .sh-home{display:inline-flex;align-items:center;gap:8px;color:#38bdf8;text-decoration:none;font-weight:700;font-size:13.5px;',
    'padding:7px 13px;border:1px solid rgba(56,189,248,0.35);border-radius:7px;background:rgba(56,189,248,0.08);white-space:nowrap;transition:background .15s ease;}',
    '#siteHeader .sh-home:hover{background:rgba(56,189,248,0.2);}',
    '#siteHeader .sh-home svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;}',
    '#siteHeader .sh-case{display:flex;flex-direction:column;min-width:0;line-height:1.25;}',
    '#siteHeader .sh-case-title{font-size:13px;font-weight:700;color:#ffffff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '#siteHeader .sh-case-meta{font-size:11.5px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '#siteHeader .sh-section{margin-left:auto;font-size:12px;color:#cbd5e1;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:40%;}',
    '#siteHeader .sh-badge{font-size:10.5px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:#fca5a5;border:1px solid rgba(239,68,68,0.6);',
    'background:rgba(239,68,68,0.12);padding:3px 8px;border-radius:5px;white-space:nowrap;}',
    '#siteHeader .sh-logout{color:#94a3b8;text-decoration:none;font-size:12px;white-space:nowrap;padding:6px 8px;border-radius:6px;}',
    '#siteHeader .sh-logout:hover{color:#f8fafc;background:rgba(255,255,255,0.06);}',
    '@media (max-width:760px){#siteHeader .sh-case-meta,#siteHeader .sh-badge{display:none;}#siteHeader .sh-inner{padding:8px 12px;gap:10px;}',
    '#siteHeader .sh-section{max-width:50%;font-size:11.5px;}}',
    '@media (max-width:480px){#siteHeader .sh-home span{display:none;}#siteHeader .sh-home{padding:7px 10px;}}',
    // Binder pages carry their own inline "Return to Master Evidence Portal" link; the bar replaces it.
    'body > .container > .nav-bar{display:none;}',
    // Light variant for pages that set <html data-theme="light">
    'html[data-theme="light"] #siteHeader{background:rgba(255,255,255,0.97);border-bottom:1px solid #d8dee8;box-shadow:0 2px 10px rgba(16,24,40,0.08);color:#12213d;}',
    'html[data-theme="light"] #siteHeader .sh-home{color:#1a5db3;border-color:#bcd0ee;background:#eef4fc;}',
    'html[data-theme="light"] #siteHeader .sh-home:hover{background:#dbe7f9;}',
    'html[data-theme="light"] #siteHeader .sh-case-title{color:#12213d;}html[data-theme="light"] #siteHeader .sh-case-meta{color:#5c6779;}',
    'html[data-theme="light"] #siteHeader .sh-section{color:#2b3548;}',
    'html[data-theme="light"] #siteHeader .sh-badge{color:#b42318;border-color:#f0a8a2;background:#fdecea;}',
    'html[data-theme="light"] #siteHeader .sh-logout{color:#5c6779;}html[data-theme="light"] #siteHeader .sh-logout:hover{color:#12213d;background:#f0f3f8;}'
  ].join('');

  var style = document.createElement('style');
  style.id = 'siteHeaderStyle';
  style.textContent = css;

  var header = document.createElement('header');
  header.id = 'siteHeader';
  header.setAttribute('role', 'banner');

  var inner = document.createElement('div');
  inner.className = 'sh-inner';

  var home = document.createElement('a');
  home.className = 'sh-home';
  home.href = homeHref();
  home.title = 'Return to the Master Evidence Portal (home screen)';
  home.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h5v-6h4v6h5V10"/></svg><span>Evidence Portal</span>';

  var caseBox = document.createElement('div');
  caseBox.className = 'sh-case';
  caseBox.innerHTML = '<div class="sh-case-title">Dashora v. Savala-Fitzpatrick</div>' +
    '<div class="sh-case-meta">TxDOT Crash ID 21609720.1 · Grapevine PD 2600037671 · August 28, 2026</div>';

  var section = document.createElement('div');
  section.className = 'sh-section';
  section.textContent = sectionLabel();

  var badge = document.createElement('span');
  badge.className = 'sh-badge';
  badge.textContent = 'Confidential';

  inner.appendChild(home);
  inner.appendChild(caseBox);
  inner.appendChild(section);
  inner.appendChild(badge);

  // "Sign out" only makes sense when the site is served behind the access-token gate.
  if (!isFile) {
    var logout = document.createElement('a');
    logout.className = 'sh-logout';
    logout.href = '/logout';
    logout.textContent = 'Sign out';
    logout.title = 'Forget the access token on this browser';
    inner.appendChild(logout);
  }

  header.appendChild(inner);

  function reserveSpace() {
    // The bar is fixed, so push the page content down by the bar's height on top of the page's own padding
    // (measured with our override removed, so responsive padding rules keep working after a resize).
    document.body.style.paddingTop = '';
    var base = parseFloat(getComputedStyle(document.body).paddingTop) || 0;
    document.body.style.paddingTop = (base + header.offsetHeight) + 'px';
  }

  function install() {
    document.head.appendChild(style);
    document.body.insertBefore(header, document.body.firstChild);
    reserveSpace();
    window.addEventListener('resize', reserveSpace);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(reserveSpace);
  }

  if (document.body) install();
  else document.addEventListener('DOMContentLoaded', install);
})();
