# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A confidential, attorney-client privileged legal evidence portfolio for a two-vehicle collision case
(Dashora v. Savala-Fitzpatrick, TxDOT Crash ID 21609720.1, collision 2026-08-28 05:00:15 CDT at SH-121 /
Bass Pro Drive, Grapevine TX). It is a static site served by a tiny Node server, hosted on Replit.
There is no build step, no bundler, no test suite, and no linter. Everything is hand-authored HTML/CSS/JS.

`REPLIT_AGENT_PROMPT.md` records the owner's standing instruction that `index.html`, `telemetry_engine.js`,
`gps_full_data.js` and the numbered evidence folders are finished work product and are not to be rewritten
or redesigned. Make targeted edits only when explicitly asked; do not restructure or "modernize".

Facts on any page shown to counsel must match the primary documents. Precedence when documents disagree:
physical evidence and third-party records (photos, insurer estimates, hospital records, the certified CR-4)
outrank the client-authored dossier markdown, which outranks the generated GPS dataset and app copy. The CR-4
itself can be wrong on details: it lists the Atlas as Silver, while the repair estimates and the 08/24/2026
photos show a black (Deep Black Pearl) vehicle. `WORK_LOG.md` records every verified fact and open issue;
read it before touching case content.

## Commands

```bash
npm install          # only dependency is express, and server.js does not actually use it
npm start            # node server.js -> http://localhost:3000  (also: npm run dev, same thing)
PORT=3999 node server.js               # run on another port
CASE_PASSCODE=secret node server.js    # enable HTTP Basic auth (any username; password OR username must equal the passcode)
GOOGLE_MAPS_API_KEY=... node server.js # enables the proxied Google satellite layer in the reconstruction
npm run build:dossier-pdf              # rebuild the dossier PDF from its Markdown (needs chromium on PATH or CHROMIUM=/path)
```

Smoke test after server changes (there are no automated tests):

```bash
for r in / /reconstruction /dossier /police-report /config.js /04_Vehicle_Records_Prior_Repairs_And_Inspection/2026-VehicleRepairs/; do curl -s -o /dev/null -w "$r %{http_code}\n" http://localhost:3000$r; done
```

Front-end changes need a browser. Headless Chromium is available in the Nix store (see WORK_LOG.md for the path) for screenshots. Open `http://localhost:3000/reconstruction` and confirm the map, HUD and
playback still work at the collision (press the red IMPACT button). `index.html` loads `styles.css` and
`telemetry_engine.js` with a `?v=...` cache-busting query string; bump it when changing either file.

## Architecture

### `server.js` (plain `http`, no framework)
Serves the repo root as static files with a MIME map. Route aliases: `/` and `/portal` ->
`00_START_HERE_EVIDENCE_PORTAL.html` (the landing page), `/reconstruction` -> `index.html`,
`/dossier` -> the dossier PDF, `/police-report` -> the CR-4 PDF. Adding a route means adding an entry
to `ROUTE_ALIASES`. A directory URL serves its `index.html` if present, otherwise a generated, themed
folder listing (so every exhibit file is reachable). Paths are normalised and confined to the repo;
dotfiles and `node_modules` are never served.

Two dynamic endpoints exist: `/config.js` emits `window.APP_CONFIG` feature flags (never secrets), and
`/gtiles/{z}/{x}/{y}` proxies Google Map Tiles API 2D satellite tiles, minting and caching the session
token server-side so `GOOGLE_MAPS_API_KEY` is never sent to the browser. Both return quietly (flag false /
HTTP 503) when the key is unset. The key is expected as a Replit Secret; it is restricted to Google Maps
Platform APIs (Maps JavaScript, Map Tiles, Static Maps, Street View, Places, Routes, Elevation, etc.).

### Reconstruction app (repo root, served at `/reconstruction`)
Three files, loaded in this order by `index.html` (after the optional `config.js`):

1. `gps_full_data.js` (1.8 MB, generated, do not hand-edit) assigns `window.GPS_TELEMATICS_DATA` with
   `summary`, `accident_event`, `stops[]`, `milestones[]` and `points[]`. `points` holds 13,285 1 Hz
   records `{t, ts, lat, lon, spd, kt, alt, hd, acc}`. The source CSV is
   `03_Sub_Second_GPS_Telematics_And_Kinematics/gps-20260828_13285_Records.csv`, which has only
   Time/Lat/Lon/Speed/Alt columns: heading and acceleration in the dataset are derived.
2. `telemetry_engine.js` is one IIFE (~1,800 lines) that reads that global, builds the Leaflet map, and
   runs a 60 FPS `requestAnimationFrame` loop. `currentIndex` is a float into `activePoints`
   (the slice for the selected preset); `getInterpolatedState()` interpolates between records and also
   synthesizes the second vehicle. `updateUI()` drives every HUD element, the signal-phase lights and the
   camera. Sections are marked with `// --- Section ---` banners; grep those to navigate.
3. `styles.css` supplies the dark glass theme via `:root` variables and the mobile breakpoints
   (1100 / 950 / 768 / 400 px and landscape < 500 px tall). Mobile has a separate drawer and HUD pill,
   so most controls exist twice (`btnX` and `btnMobileX`) and must be kept in sync.

Key facts about the engine that are not obvious from reading any single function:

- **Global record index is the timeline's unit of truth.** Index 12783 is the impact (05:00:15 AM) and is
  hardcoded as `IMPACT_GLOBAL_INDEX` and in many literals (12648 = 04:58:00 preset start, 12752 =
  end of the 26 s red-light stop, 12780-12786 = the scripted turn). Index is **not** seconds since
  log start: the log has three gaps, one of them 4,450 s long, so look indices up by their `t` string.
- **Unit 2 (the BMW sedan) has no GPS data.** Its position, heading and speed are computed in
  `getInterpolatedState()` from time-to-impact, with hand-calibrated waypoints. Likewise, Unit 1's path
  between indices 12780 and 12783 is overridden with scripted lat/lon/heading to depict the turn
  (the raw derived heading at the impact record is 69.8°; the 0.0° North figure is the dossier's position).
- **Signal phasing is index-driven.** The block under "Dynamic Texas Diamond Signal Phasing State Update"
  in `updateUI()` switches the HUD and on-map traffic lights by comparing the global index against
  fixed thresholds. Changing the timeline narrative means editing those thresholds.
- Presets (`applyPreset`) slice `allPoints` into `activePoints`; anything that maps a global index to a
  UI position must subtract `activeStartIndex`. Startup applies `accident_focus` at index 12648.
- Map tiles come from ArcGIS, CARTO and OSM with no API keys; Leaflet and Font Awesome load from CDNs.
  The `google_satellite` layer option is removed at startup unless `APP_CONFIG.googleSatelliteTiles` is true.

### Evidence portal and binders
`00_START_HERE_EVIDENCE_PORTAL.html` is the landing page linking into folders `00_` through `11_`.
There is no `01_` folder: the reconstruction app itself is "binder 01" and lives at the repo root, so
portal links for it must point at root files (`index.html`, `telemetry_engine.js`, ...). Each binder
folder has its own self-contained `index.html` (inline `<style>`, same font/icon CDN links, no JS) plus
the exhibits. The portal, the binder pages and the reconstruction app each carry their own copy of the
CSS variables; there is no shared stylesheet outside the reconstruction app.

Sub-folders of binders 04, 06 and 08 have no `index.html`; links to them rely on the server's generated
folder listing and therefore do not work when the portal is opened from disk.

### Duplicates policy
Every document lives in exactly one binder; the repo was de-duplicated on 2026-09-04 (root-level copies of the
dossier, attorney instructions and dashcam still were removed, as were the second copies of the GPS CSV and
Uber COI in binder 11 and a misnamed duplicate estimate in binder 04). The reconstruction app references
the binder 03 dashcam exhibit directly. Do not reintroduce copies; link to the binder file instead. The dossier
PDF is generated from the Markdown by `npm run build:dossier-pdf`; edit the `.md`, then rebuild.

## Replit specifics
`.replit` runs `node server.js` on port 3000 (mapped to external 80) with the `nodejs-24` module and
autoscale deployment. `replit.nix` additionally provides Python 3.11, git, curl and jq for terminal
work; `pdftotext`/`pdfinfo` are also on the PATH. Git history shows Replit Agent commits config changes
as its own author; content commits are the owner's.
