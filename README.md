# Forensic GPS Accident Reconstruction & Master Legal Evidence Portal
### Case: Melody Dawn Dashora v. Tamika Savala-Fitzpatrick (CR-4: no proof of financial responsibility)
**TxDOT Crash ID:** 21609720.1 | **Grapevine PD Case:** 2600037671 | **Date:** August 28, 2026 (05:00:15 AM CDT)

---

## Overview
This repository contains the complete forensic engineering reconstruction, 13,285-record 1 Hz GPS telematics visualizer, and 12-binder legal evidence portfolio for the two-vehicle collision occurring at the diamond interchange of **SH-121 and Bass Pro Drive / W. Bethel Road** in Grapevine, Texas.

### Key Web Applications
1. **Interactive GPS Accident Reconstruction & Telematics Animator (`/reconstruction`)**:
   - High-resolution Leaflet satellite map with a GPS-driven marker for Unit 1 (2025 VW Atlas SE FWD, black; motion follows the logged speed profile along a de-jittered path) and a simulated, non-GPS marker for Unit 2 (2014 BMW 550, straight line in the second westbound lane from the median at a constant 42 mph, per the client's account).
   - Real-time HUD tracking speed, heading, deceleration (G-forces), altitude, and coordinate telemetry.
   - Signal-phase illustration with a scenario toggle: the client's account (steady green arrow, opposing red) or the CR-4 narrative (flashing yellow arrow, opposing green). The left-turn head is a four-section FYA head; neither scenario is derived from controller logs.
   - Hardware callout markers for TxDOT ITS camera (`SH121 @ Bass Pro`), Shell Gas Station surveillance, and NEMA TS2 MMU hardware interlocks.
2. **Master Legal Evidence Portal (`/`, also `/portal`)**:
   - Executive dashboard organizing 12 categorized evidence binders (certified police report, medical records, prior repairs segregation, Uber dispatch verification, spoliation demand letters).
3. **Case Dossier (`/dossier`)**:
   - Client-prepared statement of facts (unsigned), rebuttal of the CR-4 narrative, medical summary, and Progressive UM/PIP coverage analysis; rebuilt from Markdown with `npm run build:dossier-pdf`.

---

## Deployment & Running

### Option A: 1-Click Run on Replit
1. Import this repository into Replit as a **Private Repl**.
2. Click **Run**. Replit will install Express and launch `server.js` on port 3000.
3. The web view will automatically open with the Master Legal Evidence Portal (landing page); the reconstruction is at `/reconstruction`.
4. **Access tokens (required)**: in Replit **Tools → Secrets** add one secret per role: `CASE_TOKEN_OWNER` (the client: sees everything, uploads on every panel, edits the rental ledger, sets download restrictions), `CASE_TOKEN_COUNSEL` (the lawyer: uploads to the counsel and signed-documents panels, edits the ledger, sets restrictions), `CASE_TOKEN_ADJUSTER` and `CASE_TOKEN_TNC` (the Progressive claim rep and the United Financial Casualty / Uber claim: see everything, download unless a panel or file is restricted). Each may hold several tokens separated by commas. The older `CASE_ACCESS_TOKEN` still works and counts as an owner token. Every page and file requires a token; without any the server answers every request with a "not configured" page. Never put a token in a page or a log.
4a. **Database and uploads**: files uploaded on the site, the Hertz rental ledger, the restriction checkboxes and the access log are stored in the Replit PostgreSQL database (`DATABASE_URL`, provisioned with the Repl). Without it the pages still work and the upload panels show "The upload store is not configured on this server." Run `npm run pull:uploads` in the workspace to copy uploaded files into the binder folders (set `PROD_DATABASE_URL` to the deployment's database if Replit gives it a separate one).
5. *(Optional Google imagery)*: add `GOOGLE_MAPS_API_KEY=...` in Replit Secrets to enable the "Google Satellite (Map Tiles API)" layer in the reconstruction. The key stays on the server; tiles are proxied through `/gtiles/`.

### Option B: Local Node.js Execution
```bash
# Clone private repo
git clone https://github.com/your-username/your-private-repo.git
cd your-private-repo

# Install dependencies
npm install

# Start server
npm start
```
Open `http://localhost:3000` in your web browser (start with `CASE_ACCESS_TOKEN=your-token npm start`, then enter the token).

### Routes
`/` and `/portal` landing page · `/reconstruction` app · `/dossier` PDF · `/police-report` CR-4 · `/property-loss` Binder 12 · `/rental-car` Binder 13 · `/correspondence` Binder 14 · `/logout` forget the token · `/api/me` the signed-in role and its permissions · any folder URL lists its files (`?format=json` for a machine-readable listing).

### Adding content (no HTML editing needed)
| What | Where to put it | What updates |
|---|---|---|
| A claim, adjuster contact or status change | edit `claims_status.js` (one entry per claim: a one-paragraph `summary`, a one-sentence `next_step`, and the path of the claim's memo document, which holds the full detail) | portal "Claim Files" cards; dossier §3.1 after `npm run build:dossier-pdf` |
| Hertz rental charges and payments | on the site, Binder 13 (`/rental-car`): add a row per charge with what the client and Progressive paid; attach the day's screenshot and the final receipt | totals, the $60/day 30-day ($1,800) limit and the amount above it, on the binder page and the portal card |
| Screenshots, receipts, messages, signed papers | the upload panel on the relevant binder page (property loss, injury photos, claims, carrier messages, counsel documents, signed documents); owner uploads everywhere except the counsel panel, counsel uploads to its own and the signed-documents panels | the panel lists the file at once; `npm run pull:uploads` copies it into the binder folder for the git record |
| An item lost or destroyed in the vehicle | add an entry to `12_Personal_Property_Loss_And_Vehicle_Contents/property_loss_items.js`; drop receipts/photos into `Receipts_And_Photos/` and list them under `proof` | Binder 12 table and totals; portal card summary; dossier §12.4 after the rebuild |
| An injury photograph | copy the image into `06_Medical_Records_And_Clinical_Evidence/Pictures_Of_Bruises/`; add its date, body region and caption to `injury_photos.js` | Binder 06 gallery (the photo appears even before it has a caption); dossier §9.4 after the rebuild |
| Any other fact | edit the dossier Markdown in binder 00, then `npm run build:dossier-pdf` | dossier PDF (the three generated tables are refreshed automatically by `npm run sync:dossier`) |

A global "Evidence Portal" header (`site_header.js`) sits on every static page except the landing page, the reconstruction app and documents that open in their own tab. New pages get it by adding `<script src="../site_header.js"></script>` right after `<body>`.

---

## Evidence Binder Structure
* `00_START_HERE_CASE_OVERVIEW_AND_OFFICIAL_DOSSIER/`: Master legal brief & attorney instructions.
* `02_Certified_Police_Report_And_Crash_Records/`: Certified TxDOT Form CR-4.
* `03_Sub_Second_GPS_Telematics_And_Kinematics/`: 13,285-record 1 Hz GPS CSV (three gaps; the approach and impact segment is gap-free) and an unsigned technical analysis.
* `04_Vehicle_Records_Prior_Repairs_And_Inspection/`: Prior-claim repair estimates (both recorded as left-side impacts) plus pre-accident photos and service-history screenshots.
* `05_Uber_Commercial_Dispatch_And_Coverage/`: Uber trip screenshots (Period 2 per the client: accepted reservation pickup, canceled after the crash), Texas COI (United Financial Casualty; UM/UIM not included) and evidence plan.
* `06_Medical_Records_And_Clinical_Evidence/`: Baylor Grapevine ED summary, Texas Health Frisco ED records, UTSW records, and a neck-bruise photo.
* `07_Medical_Expenses_And_Billing/`: Baylor billing screenshot ($13,528.55 due).
* `08_Progressive_Policy_And_First_Party_Coverage/`: Progressive app screenshots (Ridesharing: Yes; UM/UIM and PIP limits; claims 26-854858569 and 26-343820011).
* `09_Eyewitness_Perspectives_And_Site_Photos/`: Client-annotated Street View screenshots (signal heads, approach) and a post-crash dashcam still.
* `10_Spoliation_Demands_And_Subpoena_Targets/`: Draft preservation-demand letters (unsigned).
* `11_Technical_Reference_And_Dashcam_Archive/`: Third-party references (Apple Crash Detection overview, Bosch CDR lists, Vantrue manual), draft TPIA request.
* `12_Personal_Property_Loss_And_Vehicle_Contents/`: Itemized personal property lost in the vehicle (`property_loss_items.js`) with receipts and photos.

---
*Confidential Attorney-Client Privileged & Work Product Document.*
