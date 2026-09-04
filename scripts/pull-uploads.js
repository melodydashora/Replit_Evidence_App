#!/usr/bin/env node
'use strict';

// Copy everything uploaded through the site out of Postgres and into the binder folders.
//
// The deployment runs on Replit Autoscale, whose filesystem is ephemeral, so uploads live as bytea rows
// in the database rather than on disk. This script is how they become part of the repository: run it
// (npm run pull:uploads) against the deployed database and commit what it writes, and the evidence
// portfolio on disk once again contains every exhibit.
//
//   PROD_DATABASE_URL=... npm run pull:uploads     # the deployment's database
//   npm run pull:uploads                           # falls back to DATABASE_URL (the workspace database)
//
// It never deletes anything: files that were soft-deleted in the app stay on disk if they were pulled
// before, and are recorded as deleted in uploads_manifest.json.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client, types: pgTypes } = require('pg');

// A DATE column is a calendar day: keep it as the stored 'YYYY-MM-DD' text so no timezone shifts a
// receipt date, and therefore a file name, by one day. (server.js does the same.)
pgTypes.setTypeParser(1082, v => v);

const REPO_ROOT = path.resolve(__dirname, '..');

// Where each component's uploads belong on disk.
const COMPONENT_FOLDERS = {
  'hertz': '13_Rental_Car_And_Loss_Of_Use/Hertz_Receipts_And_Screenshots',
  'property-loss': '12_Personal_Property_Loss_And_Vehicle_Contents/Receipts_And_Photos/Uploaded',
  'injury-photos': '06_Medical_Records_And_Clinical_Evidence/Uploaded_Injury_Photos',
  'claims': '08_Progressive_Policy_And_First_Party_Coverage/Uploaded_Claim_Documents',
  'carrier-messages': '14_Correspondence_Counsel_And_Signed_Documents/Carrier_Messages',
  'counsel-documents': '14_Correspondence_Counsel_And_Signed_Documents/Counsel_Documents',
  'signed-documents': '14_Correspondence_Counsel_And_Signed_Documents/Signed_Documents'
};

const LEDGER_JSON = '13_Rental_Car_And_Loss_Of_Use/rental_ledger.json';
const MANIFEST_JSON = 'uploads_manifest.json';

function round2(n) {
  return Math.round(n * 100) / 100;
}

// The stored name is already sanitised by the server; belt and braces before it becomes a path.
function safeName(name) {
  return String(name || 'file')
    .replace(/[\\/]/g, '_')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 200) || 'file';
}

function dateFor(row) {
  if (row.doc_date) return String(row.doc_date);
  const at = row.uploaded_at instanceof Date ? row.uploaded_at : new Date(row.uploaded_at);
  return isNaN(at.getTime()) ? 'undated' : at.toISOString().slice(0, 10);
}

function sha256File(absPath) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(absPath)).digest('hex');
  } catch (e) {
    return null;
  }
}

async function main() {
  const connectionString = process.env.PROD_DATABASE_URL || process.env.DATABASE_URL || '';
  if (!connectionString) {
    console.error('No database configured. Set PROD_DATABASE_URL (the deployment) or DATABASE_URL and try again.');
    process.exit(1);
  }

  const client = new Client({ connectionString });
  await client.connect();

  let rows;
  try {
    // Never select the bytea column in the listing pass: the file bodies are fetched one at a time,
    // and only for the ones that are actually missing or changed on disk.
    const res = await client.query(
      `SELECT id, component, name, mime, size, sha256, caption, doc_date, uploaded_by, uploaded_at,
              restricted, deleted_at, deleted_by
       FROM files ORDER BY id ASC`
    );
    rows = res.rows;
  } catch (err) {
    if (err && err.code === '42P01') { // undefined_table: nobody has used the site yet
      console.log('No uploads yet: the files table does not exist in this database.');
      await client.end();
      return;
    }
    throw err;
  }

  let written = 0;
  let skipped = 0;
  const perComponent = {};

  for (const row of rows) {
    if (row.deleted_at) continue; // soft-deleted in the app: not pulled, but kept in the manifest
    const folder = COMPONENT_FOLDERS[row.component];
    if (!folder) {
      console.warn(`  ! file ${row.id} has unknown component "${row.component}" - skipped`);
      continue;
    }
    const dirAbs = path.join(REPO_ROOT, folder);
    const fileName = `${dateFor(row)}_${row.id}_${safeName(row.name)}`;
    const absPath = path.join(dirAbs, fileName);

    if (fs.existsSync(absPath) && sha256File(absPath) === row.sha256) {
      skipped++;
      continue;
    }

    const body = await client.query('SELECT data FROM files WHERE id = $1', [row.id]);
    if (!body.rows.length) continue;
    fs.mkdirSync(dirAbs, { recursive: true }); // binders 13 and 14 may not exist yet on a fresh checkout
    fs.writeFileSync(absPath, body.rows[0].data);
    written++;
    perComponent[row.component] = (perComponent[row.component] || 0) + 1;
    console.log(`  + ${folder}/${fileName} (${row.size} bytes)`);
  }

  // The rental ledger, so the numbers are in the repository as well as in the database.
  let ledgerWritten = false;
  try {
    const led = await client.query(
      `SELECT id, entry_date, description, amount, paid_by_client, paid_by_insurer, note, updated_at, updated_by
       FROM ledger_entries WHERE component = 'hertz' AND deleted_at IS NULL
       ORDER BY entry_date ASC NULLS LAST, id ASC`
    );
    const entries = led.rows.map(r => ({
      id: r.id,
      entry_date: r.entry_date || null,
      description: r.description,
      amount: Number(r.amount),
      paid_by_client: Number(r.paid_by_client),
      paid_by_insurer: Number(r.paid_by_insurer),
      note: r.note,
      updated_at: r.updated_at,
      updated_by: r.updated_by
    }));
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

    const ledgerAbs = path.join(REPO_ROOT, LEDGER_JSON);
    fs.mkdirSync(path.dirname(ledgerAbs), { recursive: true });
    fs.writeFileSync(ledgerAbs, JSON.stringify({ component: 'hertz', pulled_at: new Date().toISOString(), entries, totals }, null, 2) + '\n');
    ledgerWritten = true;
    console.log(`  + ${LEDGER_JSON} (${entries.length} entr${entries.length === 1 ? 'y' : 'ies'})`);
  } catch (err) {
    if (!err || err.code !== '42P01') throw err;
  }

  // The manifest lists every row, deleted ones included, so the repository records what was removed.
  const manifest = {
    pulled_at: new Date().toISOString(),
    files: rows.map(r => ({
      id: r.id,
      component: r.component,
      name: r.name,
      mime: r.mime,
      size: r.size,
      sha256: r.sha256,
      caption: r.caption,
      doc_date: r.doc_date || null,
      uploaded_by: r.uploaded_by,
      uploaded_at: r.uploaded_at,
      restricted: r.restricted,
      deleted_at: r.deleted_at,
      deleted_by: r.deleted_by,
      pulled_to: r.deleted_at || !COMPONENT_FOLDERS[r.component]
        ? null
        : `${COMPONENT_FOLDERS[r.component]}/${dateFor(r)}_${r.id}_${safeName(r.name)}`
    }))
  };
  fs.writeFileSync(path.join(REPO_ROOT, MANIFEST_JSON), JSON.stringify(manifest, null, 2) + '\n');

  await client.end();

  const deletedCount = rows.filter(r => r.deleted_at).length;
  console.log('');
  console.log(`Pulled ${written} new file${written === 1 ? '' : 's'}, ${skipped} already on disk, ${deletedCount} soft-deleted (left alone).`);
  Object.keys(perComponent).sort().forEach(k => console.log(`  ${k}: ${perComponent[k]}`));
  console.log(`Wrote ${MANIFEST_JSON}${ledgerWritten ? ' and ' + LEDGER_JSON : ''}. Nothing on disk was deleted.`);
}

main().catch(err => {
  console.error('pull:uploads failed:', err && err.message);
  process.exit(1);
});
