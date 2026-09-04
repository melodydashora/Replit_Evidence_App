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
4. **Access token (required)**: in Replit **Tools → Secrets** add `CASE_ACCESS_TOKEN=your-token` (several tokens may be comma-separated). Every page and file requires it; without the secret the server answers every request with a "not configured" page. Viewers enter the token once on the sign-in page (remembered 30 days), or open a link of the form `https://your-site/?token=your-token`. "Sign out" in the page header forgets it. `CASE_PASSCODE` is accepted as an older alias.
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
`/` and `/portal` landing page · `/reconstruction` app · `/dossier` PDF · `/police-report` CR-4 · `/property-loss` Binder 12 · `/logout` forget the token · any folder URL lists its files (`?format=json` for a machine-readable listing).

### Adding content (no HTML editing needed)
| What | Where to put it | What updates |
|---|---|---|
| A claim, adjuster contact or status change | edit `claims_status.js` (one entry per claim) | portal "Claim Files" cards; dossier §3.1 after `npm run build:dossier-pdf` |
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
