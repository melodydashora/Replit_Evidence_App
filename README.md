# Forensic GPS Accident Reconstruction & Master Legal Evidence Portal
### Case: Melody Dawn Dashora v. Tamika Savala-Fitzpatrick (CR-4: no proof of financial responsibility)
**TxDOT Crash ID:** 21609720.1 | **Grapevine PD Case:** 2600037671 | **Date:** August 28, 2026 (05:00:15 AM CDT)

---

## Overview
This repository contains the complete forensic engineering reconstruction, 13,285-record 1 Hz GPS telematics visualizer, and 12-binder legal evidence portfolio for the two-vehicle collision occurring at the diamond interchange of **SH-121 and Bass Pro Drive / W. Bethel Road** in Grapevine, Texas.

### Key Web Applications
1. **Interactive GPS Accident Reconstruction & Telematics Animator (`/reconstruction`)**:
   - High-resolution Leaflet satellite map with a GPS-driven marker for Unit 1 (2025 VW Atlas SE FWD, black) and a simulated, non-GPS marker for Unit 2 (2014 BMW 550).
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
4. *(Optional Privacy)*: In Replit Secrets (Environment Variables), add `CASE_PASSCODE=your_secret_password` to require password authentication for viewers.
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
Open `http://localhost:3000` in your web browser.

---

## Evidence Binder Structure
* `00_START_HERE_CASE_OVERVIEW_AND_OFFICIAL_DOSSIER/`: Master legal brief & attorney instructions.
* `02_Certified_Police_Report_And_Crash_Records/`: Certified TxDOT Form CR-4.
* `03_Sub_Second_GPS_Telematics_And_Kinematics/`: 13,285-record 1 Hz GPS CSV (three gaps; the approach and impact segment is gap-free) and an unsigned technical analysis.
* `04_Vehicle_Records_Prior_Repairs_And_Inspection/`: Prior-claim repair estimates (both recorded as left-side impacts) plus pre-accident photos and service-history screenshots.
* `05_Uber_Commercial_Dispatch_And_Coverage/`: Uber trip screenshots (Period 1 vs Period 2 undetermined), Texas COI and evidence plan.
* `06_Medical_Records_And_Clinical_Evidence/`: Baylor Grapevine ED summary, Texas Health Frisco ED records, UTSW records, and a neck-bruise photo.
* `07_Medical_Expenses_And_Billing/`: Baylor billing screenshot ($13,528.55 due).
* `08_Progressive_Policy_And_First_Party_Coverage/`: Progressive app screenshots (Ridesharing: Yes; UM/UIM and PIP limits).
* `09_Eyewitness_Perspectives_And_Site_Photos/`: Client-annotated Street View screenshots (signal heads, approach) and a post-crash dashcam still.
* `10_Spoliation_Demands_And_Subpoena_Targets/`: Draft preservation-demand letters (unsigned).
* `11_Technical_Reference_And_Dashcam_Archive/`: Third-party references (Apple Crash Detection overview, Bosch CDR lists, Vantrue manual), draft TPIA request, SQL script.

---
*Confidential Attorney-Client Privileged & Work Product Document.*
