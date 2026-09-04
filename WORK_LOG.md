# WORK LOG — Claude Code session 2026-09-04

Purpose: durable record of everything done, found, decided and still open, so that no research is lost if the
session ends. Update at every milestone. Nothing here is committed to git until the owner asks.

## Owner's instructions (verbatim intent)
1. Landing page should look like the existing evidence portal, but **every file link and every fact must be correct**.
2. Google Maps key will be supplied as `GOOGLE_MAPS_API_KEY` (restricted to Maps Platform APIs: Maps JS, Map Tiles,
   Static Maps, Street View Static, Places, Routes, Roads, Elevation, Geocoding, Time Zone, etc.).
3. Reconstruction must be more user friendly and realistic: fewer "jumps", signal lights shown correctly, use the
   owner's point-of-view photos (binder 09), coordinates, speeds and documents.
4. **No duplicate data in the repo.**
5. Everything must be **legally correct**. Police narrative says she turned left on a "flashing yellow light";
   gather truthful data on the actual signal heads at SH-121 / Bass Pro Dr east ramp terminal. Report the truth
   either way; never fabricate.
6. Keep this log so research survives a session/token cut-off.

## Status board
| Item | State | Where |
|---|---|---|
| CLAUDE.md | done | `CLAUDE.md` |
| server.js: portal at `/`, app at `/reconstruction`, folder listings, traversal guard, `/config.js`, Google tile proxy `/gtiles/`, legacy `/01_Interactive_Accident_Reconstruction/*` → root | done, smoke-tested on port 3998 | `server.js` |
| Reconstruction: optional "Google Satellite (Map Tiles API)" layer (hidden without key) | done, rendered headless w/o JS errors | `index.html`, `telemetry_engine.js` (also copied to `Accident_Reconstruction_August_28_2026.html`) |
| README route notes | done | `README.md` |
| Fact-check workflow (12 cards, verify + 2 refuters per flagged claim) | verifiers DONE; refuters stopped after 16 (4 over-corrections caught and respected); run id `wf_167043a0-2fc` | journal: `~/.claude/projects/-home-runner-workspace/.../subagents/workflows/wf_167043a0-2fc/journal.jsonl` |
| Portal rewrite with verified facts/links | DONE 2026-09-04 (all links verified; "Read first" notice added; page counts removed) | `00_START_HERE_EVIDENCE_PORTAL.html` |
| Signal-head research workflow (FYA vs protected-only, night flash, TxDOT/Grapevine ownership) | RUNNING (resumed with per-source verification), run id `wf_974014c6-45b`, task wutb7pbal | memo to be saved into the repo when done |
| Repo de-duplication | DONE except `accident-grapevine-121-documentation.md` (held until research agents finish reading it) | see "Duplicates" below |
| Reconstruction truth fixes (HUD label, MMU popup, HUD narration as client's account, data-gap text, dashcam path) | DONE | `index.html`, `telemetry_engine.js` |
| Reconstruction realism / jumps / lights | NEXT | `telemetry_engine.js` |
| Binder page headers (11 pages) aligned with verified wording | DONE | `*/index.html` |
| Dossier md facts corrected (colour, Baylor $13,528.55, filenames) and PDF rebuilt (`npm run build:dossier-pdf`, 12 pp) | DONE | binder 00 |
| Memory files written (FYA finding, fact-check outcome) | DONE | `~/.claude/projects/-home-runner-workspace/memory/` |
| `.replit` | Replit auto-added a `[[ports]]` block for my test port 3998; revert with `git checkout .replit` at the end | |

## Verified facts (primary sources)
Source precedence: certified CR-4 police report > insurer declarations > hospital records > dossier markdown > generated GPS dataset/app copy.

From the **certified CR-4** (`02_Certified_Police_Report_And_Crash_Records/Certified_Police_Report_TxDOT_21609720_1.pdf`, certified by Jim Markham, TxDOT Crash Records custodian, 2 Sep 2026):
- Crash 08/28/2026 05:00, Tarrant County, Grapevine, SH 121 service/frontage road at Bass Pro Drive (2700 block), lat 32.95514411 lon -97.03802577.
- Conditions: CLEAR, **DARK, LIGHTED**, DRY, traffic control coded **"SIGNAL LIGHT"** (not a flashing code) — yet the narrative says "flashing yellow light". Intersection type: three entering roads (T), two-way divided, protected median.
- Unit 1: 2025 VOLKSWAGEN ATLAS, **SILVER**, SUV, plate WHB6147, VIN 1V2DR2CA0SC529343, Progressive policy 936659747, damage **3 O'CLOCK right front quarter, angular impact**, severity 4. Driver Melody Dawn Dashora, suspected minor injury, shoulder & lap belt, airbags deployed multiple, transported Baylor Grapevine by Grapevine EMS. Contributing factor coded: failed to yield ROW turning left.
- Unit 2: 2014 BMW 550, WHITE, 4-door, plate vdw2544, VIN WBAKN9C5XED681044, **liability insurance: NO**, damage **12 O'CLOCK front end distributed**, severity 3. Driver Tamika Savala-Fitzpatrick (owner listed as Savala, Tamika), contributing factor coded "turned when unsafe"?? — NOTE: on the report the factor list reads `1 FAILED TO YIELD ROW - TURNING LEFT` and `2 TURNED WHEN UNSAFE`; confirm which unit each row belongs to before quoting.
- Witness: Precious Kherriel Ramecia Mccall, Arlington TX. Officer: Smith, R (#14177), Grapevine PD. Tow: B&B Wrecker, Euless.
- Narrative: "Unit 1 Failed to yield right of way while turning left on a flashing yellow light. Unit 1 entered the intersection striking unit 2 causing damage to both vehicles."

Portal errors already confirmed before the workflow:
- "2025 VW Atlas SE (FWD, **Black**)" — CR-4, dossier and attorney instructions all say **Silver**. Only the generated GPS dataset title / app tooltips say "Black SUV". Trim "SE" and "FWD" still to be confirmed from repair estimates / VIN.
- "Launch Interactive **3D**/2D Accident Reconstruction" — the app is 2D (Leaflet).
- "$12.07 fare; Aloft Hotel to DFW Airport" — not found in UBER-PLAN.md; dossier says the accepted pickup was **at** Aloft Dallas DFW Airport Grapevine (1033 N Main St). Awaiting screenshot transcription.
- "hospital lien records" (binder 07) — folder holds only `Baylor_Health_Emergency_Bill.png`.
- "13,285 **continuous** 1Hz" — CSV has 13,285 rows but 3 timestamp gaps (largest 4,450 s). Gap locations still to be reported by the workflow.
- Links to `01_Interactive_Accident_Reconstruction/...` — folder never existed; app is at repo root. Server now rewrites that prefix.
- Directory links in binders 04/06/08 returned 404 — server now renders folder listings.
- Dossier PDF is 16 pages (correct). GPS: 26 s stop 04:59:18–04:59:44 (indices 12726–12752) correct; 9-second deceleration 39.1→17.2 mph over 05:00:05–05:00:14 correct; derived heading at impact record is 69.8°, the "0.0° North" figure is the dossier's position, not raw data.

## Duplicates (to resolve: keep binder copy, remove root copy unless the app needs it)
- `OFFICIAL_STATEMENT_OF_FACTS_AND_CASE_DOSSIER.md` root vs binder 00 — DIFFER (binder copy longer/newer, section 12). Keep binder copy.
- `OFFICIAL_STATEMENT_OF_FACTS_AND_CASE_DOSSIER.pdf` root vs binder 00 — identical. Keep binder copy; `/dossier` route already points there.
- `INSTRUCTIONS_FOR_ATTORNEY.txt` root vs binder 00 — identical.
- `dashcam_post_accident.png` root vs `03_.../Exhibit_A_Dashcam_Post_Accident_Photo_050543.png` — identical (root copy referenced by old portal links only; check index.html/engine before deleting).
- `03_.../gps-20260828_13285_Records.csv` vs `11_.../gps-20260828.csv` — identical.
- `05_.../Uber_Texas_Certificate_of_Insurance_COI.pdf` vs `11_.../uber_tx_coi.pdf` — identical (11's SHA256SUMS.txt lists uber_tx_coi.pdf; update sums if removed).
- `index.html` vs `Accident_Reconstruction_August_28_2026.html` — identical by design (offline double-click copy per INSTRUCTIONS_FOR_ATTORNEY.txt). Decide with owner; default keep.
- `accident-grapevine-121-documentation.md` (root, 48 KB "Case Memorandum") overlaps heavily with the dossier — compare before removing.

## Signal research (the "flashing yellow" question) — findings go here
Question: at the SH-121 east ramp terminal / Bass Pro Dr (≈32.9551, -97.0381), does the eastbound-to-northbound left turn face a 4-section flashing-yellow-arrow (FYA) head, a 3-section protected-only arrow head, or a 5-section doghouse; who owns/operates the signal (TxDOT Fort Worth vs City of Grapevine); could the interchange have been in night flash at 05:00; what does the owner's photo `09_.../2026-09-03_07-01-49 -through lights not connected to turning light.png` show.
(Workflow results will be appended below.)

## Reconstruction engine notes (for the realism pass)
- 1 Hz GPS + linear interpolation; scripted overrides at indices 12780–12786 replace GPS lat/lon/heading with hand waypoints → visible discontinuity where the override starts/ends ("jumps"). Sedan is fully synthetic (time-to-impact based).
- Signal lights driven by global index thresholds in `updateUI()` ("Dynamic Texas Diamond Signal Phasing State Update").
- Vehicle markers are fixed-pixel SVGs (11×21 px) that do not scale with zoom.
- Google 2D satellite tiles reach zoom 21 via `/gtiles/` once the key is set (ArcGIS stops at 19).

## 2026-09-04 — Fact-check workflow results (12 verifiers done; refuters still running) — KEY FINDINGS
Full machine-readable results: scratchpad `factcheck_cards.json` (session temp) and the workflow journal listed in the status board. Summary of what must change:

### Legally significant
1. **Signal head type (binder 09).** The client's own exhibit `09_.../2026-09-03_07-01-49 -through lights not connected to turning light.png` is a Google Street View screenshot (Apr 2025 imagery) of the SH-121 east ramp terminal showing the eastbound left-turn signal as a **four-section head displaying a yellow left arrow while the adjacent through heads show green balls**. A four-section arrow head is the standard flashing-yellow-arrow (FYA) permissive/protected head. Consequence: a "flashing yellow arrow" indication for that left turn is physically possible at this intersection, which is consistent with the CR-4 narrative. The dossier's "Pillar 3" MMU argument ("physically and electronically impossible") is wrong as stated: the MMU prevents conflicting greens; an FYA shown while opposing through traffic is green is the designed, non-conflicting state. **Whether the arrow was solid green (protected phase) or flashing yellow (permissive) at 05:00:11–05:00:15 is unknown from public sources; only the controller's time-of-day plan and high-resolution event logs (TPIA request already drafted in binder 11) can settle it.** The client says the arrow was solid green; that remains possible (protected phase served before or after the permissive interval) but unproven. Do not present the MMU-impossibility argument to counsel without this caveat.
2. **Vehicle colour.** CR-4 says SILVER; the Mitchell/Progressive estimates say "Exterior Color BLACK"; the 10 pre-accident iPhone photos (8/24/2026) show a black Atlas; dossier §12 says "Deep Black Pearl". Physical evidence says **black**; the CR-4 colour is wrong. Portal should say Black and note the CR-4 discrepancy; the dossier table (line 38) and INSTRUCTIONS_FOR_ATTORNEY.txt line 8 wrongly say Silver. Trim/drivetrain "SE FWD" confirmed by the estimate ("2025 Volkswagen Atlas SE 4 Door Utility 2.0L ... FWD").
3. **Uber Period 2 (binder 05).** `IMG_9364.png` = canceled UberX request, "Aug 28, 2026 • 5:05 AM", upfront fare $12.07, $0.00 collected, pickup AND dropoff both "N State Highway 121, Coppell, TX" (map pin beside Aloft Dallas DFW Airport Grapevine). Whether 5:05 AM is the request time or the cancellation time is undetermined and outcome-determinative (Period 1 vs Period 2). `IMG_9363.png` is the EARLIER completed 4:18 AM trip ($12.21) — the portal's "Active Dispatch Screenshot" pill pointed at the wrong image. "$0.00 cancellation receipt artifact" explanation exists nowhere in binder 05 (only an unsourced remark in the dossier). "Aloft Hotel to DFW Airport" is not on the receipt.
4. **Misnamed duplicate estimate (binder 04).** `RepairEstimate-RightSide-26-647168303-57.pdf` is byte-identical to `RepairEstimate-26-647168303-57-LeftSide.pdf`. There is NO right-side prior estimate. Delete the RightSide file (a reader could take the name as an admission). Estimates: The Body Shop #2 – Prosper (claim 26-647168303-01, loss 01/26/2026, POI Left Side (9)); Progressive/United Financial for Hendrick VW Frisco (claim 26-711114628-01, loss 07/23/2026, POI Left Front Corner (11)). None are "certified" (blank shop signature lines). Pre-accident folder: 10 photos + 1 screenshot, not 11 photos. Vehicle2026-History = 7 myVW app service screenshots.
5. **Misnamed medical file (binder 06).** `BaylorNotes.pdf` is the UTSW 9/2/2026 progress note (Creator UTSWMyCare), not a Baylor record. The real Baylor document is `ed after visit summary aug 28, 2026.pdf` (Baylor Scott & White Medical Center – Grapevine ED AVS). "Texas Health Presbyterian" is wrong: the 8/30 visit was **Texas Health Frisco Emergency Department** (a second ED visit, not a "follow-up"). `IMG_9304.jpeg` = selfie dated 8/29/2026 showing a linear neck bruise; no record calls it a seat-belt sign (only patient-reported neck bruising 8/30 & 9/2).
6. **Binder 07.** Only file is a MyBSWHealth portal screenshot: Baylor Scott & White Health, Guarantor #121682647, Amount Due **$13,528.55** (last statement 9/1/2026). No itemized statement, no lien record, no PIP ledger. Dossier §15.2 still says "TBD" for this amount — stale. $13,528.55 exceeds the $10,003 PIP limit.
7. **Binder 08.** No declarations page or endorsement forms; nine Progressive app/web screenshots: "Coverage at time of incident Friday August 28, 2026", UM/UIM BI $250,007/$500,007, PIP $10,003, vehicle record "Ridesharing: Yes"; policy number 936659747 appears only on the CR-4; claim 26-854858569 screenshots (payout $0.00) and a web screenshot of claim 26-343820011 dated Aug 27. No "Texas UM law analysis" in the folder (dossier §13.2 only).
8. **Binder 11.** `apple_crash_exec.pdf` is Apple's 2022 "Crash Detection Executive Overview" product brief, not a call/transcript record; the dossier's quoted 911 broadcast is Apple's generic sample script. `cdrlist.pdf` = Bosch CDR v18.0 vehicle list (2019); `cdr251.pdf` = Bosch CDR v25.1 product info. No "raw cluster forensics archive" exists. SHA256SUMS covers 7 of 10 files, all OK.
9. **Binder 00 / hero.** Statement of facts is unsigned (no signature block, jurat or 132.001 declaration). Dossier is client-authored (headless-Chrome print 9/3/2026), so "Official" is unsupported. No counsel of record in the repo → "Attorney-Client Privileged" unverifiable (dossier §16 lists retaining counsel as open). Only the CR-4 is certified. "Attorney Action Checklist" button points at a file with no checklist (dossier §16 has one). CR-4 location: "SH 121 service/frontage road at Bass Pro Drive" (no "W Bethel Rd"). "UNINSURED" = CR-4 "Proof of Financial Responsibility: NO", not an insurer finding. Reconstruction is 2D (no 3D). Unit 2 has no GPS (simulated). Log is 1 Hz, not sub-second; 3 gaps (74 min 01:21–02:35, 2 s, 78 s post-impact 05:03:43–05:05:01); the 02:56–05:03 segment is gap-free. Speed column is knots. Heading: CSV has none; Technical Statement gives rest heading 22° NNE; gps_full_data.js derived 69.8° at impact; dossier says 0.0° N.
10. **Binder 09.** Files are two client-annotated Street View screenshots (Apr 2025), one dashcam still at rest (05:09:46, no vehicles visible), one GPS route-map screenshot (IMG_9365). No eyewitness material (witness Precious Mccall has no statement in the repo).
11. **Binder 10.** Letters are unsigned drafts with no letterhead; letter 02 is a preservation/production demand, not a subpoena; letter 03 is one combined letter (Shell / Hampton Inn / Aloft). "Michael Peters, Corridor Manager" title unconfirmed by any TxDOT source.

### Decisions taken
- Portal will be rewritten to assert only what the files prove, with the CR-4 narrative disclosed rather than hidden.
- Duplicates to delete: root `OFFICIAL_STATEMENT...md/.pdf`, root `INSTRUCTIONS_FOR_ATTORNEY.txt`, `accident-grapevine-121-documentation.md` (byte-identical to binder dossier md), root `dashcam_post_accident.png` (app re-pointed to binder 03 exhibit), `11_.../gps-20260828.csv`, `11_.../uber_tx_coi.pdf`, `04_.../RepairEstimate-RightSide-26-647168303-57.pdf`, `Accident_Reconstruction_August_28_2026.html` (instructions updated to name index.html).
- Rename `06_.../BaylorNotes.pdf` → `UTSW_Progress_Note_Sep_2_2026.pdf` and update binder page + portal.
- Signal research workflow restarted with per-source verification (run wf_974014c6-45b resumed).

### Confirmed by direct inspection (Claude viewed the exhibit and a 4x crop, 2026-09-04)
`09_.../2026-09-03_07-01-49 -through lights not connected to turning light.png` (Google Street View, Bass Pro Dr looking east, imagery Apr 2025, mast arm signed "SH 121 North"): the head over the eastbound left-turn lane is a **four-section vertical arrow head** (top section dark red arrow position, second dark, **third section lit yellow left arrow**, fourth dark) with an R3-5L "left turn ONLY" sign beside it; the adjacent through heads are three-section heads showing green balls. That is the MUTCD flashing-yellow-arrow (FYA) head (red arrow / steady yellow arrow / flashing yellow arrow / green arrow). With through traffic green and the third section lit, the capture shows the permissive (flashing yellow arrow) interval in normal operation. The client's annotation on the image ("These lights and the left turning light will not be the same, meaning no blinking on left turn even with both sides green") is mistaken as a matter of signal design. A green arrow (protected phase) also exists on that head; which indication was displayed at 05:00:11–05:00:15 on 2026-08-28 cannot be determined from imagery and depends on the controller's time-of-day plan and event logs.

Fact-check workflow stopped after all 12 verifiers finished (refuters would have cost ~220 more agents); verifier evidence was spot-checked by Claude directly (CR-4 text, both Street View exhibits). Signal research workflow resumed with per-source verification.

## 2026-09-04 — Reconstruction realism pass (DONE; verified headless at indices 12762, 12781, 12783)
- Motion: Catmull-Rom position interpolation between 1 Hz fixes; headings recomputed from the position track (`motionHd`, central difference, carried through stationary samples; scripted rest heading from the impact onward) — removes the per-second jerks and the 70° heading snap at the end of the turn override. Turn rate/steering derive from the same headings. Override entry heading now equals the motion heading at index 12780 (no snap).
- Camera: Leaflet `zoomSnap: 0.05`; follow camera eases zoom fractionally instead of stepping whole levels.
- Vehicle sprites scale to true length at high zoom (Atlas 5.10 m, BMW 550 4.91 m; 1x floor, 5x cap).
- Night lighting toggle (default on; `?night=0` to disable): tile pane dimmed to 05:00 conditions.
- Signal head: East Turn head is now a four-section FYA head (red / yellow / flashing-yellow / green arrow) in the HUD and on the map. Scenario select (`?scenario=cr4`): "Client's account" (green arrow, opposing red) vs "CR-4 narrative" (flashing yellow arrow, opposing green). All HUD/map narration reworded as the client's account; MMU popup corrected; impact banner cites CR-4 damage entries and states fault is disputed.
- Deep links: `?at=<global index>` or `?at=impact` (auto-selects the preset). Secondary callout labels hidden below zoom 18.75.
- Files: `telemetry_engine.js`, `index.html`, `styles.css` (cache-busters bumped to 20260904d). Backups of the pre-realism files are in the session scratchpad only.
- Not done (needs the Google key): Street View / higher-zoom Google imagery; Roads API snapping.
