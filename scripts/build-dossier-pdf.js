#!/usr/bin/env node
// Rebuilds the 16-page case dossier PDF from its Markdown source with headless Chromium.
// Usage: node scripts/build-dossier-pdf.js  (set CHROMIUM=/path/to/chromium if it is not on PATH)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { marked } = require('marked');

const DIR = path.join(__dirname, '..', '00_START_HERE_CASE_OVERVIEW_AND_OFFICIAL_DOSSIER');
const MD = path.join(DIR, 'OFFICIAL_STATEMENT_OF_FACTS_AND_CASE_DOSSIER.md');
const PDF = path.join(DIR, 'OFFICIAL_STATEMENT_OF_FACTS_AND_CASE_DOSSIER.pdf');
const HTML = path.join(require('os').tmpdir(), 'dossier-build.html');

const md = fs.readFileSync(MD, 'utf8');
const title = (md.match(/^#\s+(.+)$/m) || [, 'Case Dossier'])[1].replace(/[*_`]/g, '');
const body = marked.parse(md, { gfm: true });
const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${title}</title>
<style>
  @page { size: Letter; margin: 0.6in 0.65in; }
  body { font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; font-size: 10.5pt; line-height: 1.42; color: #111; }
  h1 { font-size: 18pt; margin: 0 0 6pt; } h2 { font-size: 13.5pt; margin: 16pt 0 6pt; border-bottom: 1px solid #999; padding-bottom: 2pt; }
  h3 { font-size: 11.5pt; margin: 12pt 0 4pt; } h4 { font-size: 10.5pt; margin: 10pt 0 3pt; }
  p, li { margin: 0 0 5pt; } blockquote { margin: 6pt 0 6pt 12pt; padding-left: 10pt; border-left: 3px solid #bbb; color: #222; }
  table { border-collapse: collapse; width: 100%; margin: 6pt 0 10pt; font-size: 9pt; page-break-inside: auto; }
  th, td { border: 1px solid #999; padding: 3pt 5pt; vertical-align: top; text-align: left; }
  th { background: #eee; } code { font-family: Menlo, Consolas, monospace; font-size: 9pt; }
  hr { border: 0; border-top: 1px solid #bbb; margin: 10pt 0; }
</style></head><body>${body}</body></html>`;
fs.writeFileSync(HTML, html);

const chromium = process.env.CHROMIUM || 'chromium';
execFileSync(chromium, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-pdf-header-footer', `--print-to-pdf=${PDF}`, 'file://' + HTML], { stdio: ['ignore', 'ignore', 'ignore'] });
console.log('wrote', PDF, fs.statSync(PDF).size, 'bytes');
