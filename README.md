# Forensic GPS Accident Reconstruction & Master Legal Evidence Portal
### Case: Melody Dawn Dashora v. Tamika Savala-Fitzpatrick (Uninsured)
**TxDOT Crash ID:** 21609720.1 | **Grapevine PD Case:** 2600037671 | **Date:** August 28, 2026 (05:00:15 AM CDT)

---

## Overview
This repository contains the complete forensic engineering reconstruction, 13,285-record sub-second GPS telematics visualizer, and 12-binder legal evidence portfolio for the two-vehicle collision occurring at the diamond interchange of **SH-121 and Bass Pro Drive / W. Bethel Road** in Grapevine, Texas.

### Key Web Applications
1. **Interactive GPS Accident Reconstruction & Telematics Animator (`/`)**:
   - High-resolution Leaflet satellite map with dynamic vehicle markers for Unit 1 (2025 VW Atlas SE FWD) and Unit 2 (2014 BMW 550i).
   - Real-time HUD tracking speed, heading, deceleration (G-forces), altitude, and coordinate telemetry.
   - Interactive NEMA TS2 diamond interchange signal coordinator visualizer demonstrating that opposing westbound traffic was held in Solid Red while Unit 1 turned on a protected green arrow.
   - Hardware callout markers for TxDOT ITS camera (`SH121 @ Bass Pro`), Shell Gas Station surveillance, and NEMA TS2 MMU hardware interlocks.
2. **Master Legal Evidence Portal (`/portal`)**:
   - Executive dashboard organizing 12 categorized evidence binders (certified police report, medical records, prior repairs segregation, Uber dispatch verification, spoliation demand letters).
3. **Official 16-Page Case Dossier (`/dossier`)**:
   - Formal Statement of Facts, 5-Pillar Rebuttal, medical evaluation, and $250k/$500k Progressive UM insurance strategy.

---

## Deployment & Running

### Option A: 1-Click Run on Replit
1. Import this repository into Replit as a **Private Repl**.
2. Click **Run**. Replit will install Express and launch `server.js` on port 3000.
3. The web view will automatically open with the Interactive Accident Reconstruction.
4. *(Optional Privacy)*: In Replit Secrets (Environment Variables), add `CASE_PASSCODE=your_secret_password` to require password authentication for viewers.

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
* `03_Sub_Second_GPS_Telematics_And_Kinematics/`: 13,285-record continuous 1Hz GPS CSV and technical analysis.
* `04_Vehicle_Records_Prior_Repairs_And_Inspection/`: Repair estimates proving prior damage was strictly left-side.
* `05_Uber_Commercial_Dispatch_And_Coverage/`: Active Period 2 commercial dispatch verification & Texas COI.
* `06_Medical_Records_And_Clinical_Evidence/`: Baylor Scott & White ER notes, follow-up records, and bruise photos.
* `07_Medical_Expenses_And_Billing/`: Itemized hospital bills and PIP reimbursement ledger.
* `08_Progressive_Policy_And_First_Party_Coverage/`: Progressive policy declarations (Rideshare: Yes) & UM coverage.
* `09_Eyewitness_Perspectives_And_Site_Photos/`: Viewpoint sightline alignment photos.
* `10_Spoliation_Demands_And_Subpoena_Targets/`: Ready-to-sign formal preservation letters.
* `11_Technical_Reference_And_Dashcam_Archive/`: Apple Crash Detection transcripts and equipment manuals.

---
*Confidential Attorney-Client Privileged & Work Product Document.*
