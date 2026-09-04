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
CASE_ACCESS_TOKEN=secret npm start     # node server.js -> http://localhost:3000  (also: npm run dev, same thing)
PORT=3999 CASE_ACCESS_TOKEN=secret node server.js   # run on another port
GOOGLE_MAPS_API_KEY=... node server.js # enables the proxied Google satellite layer in the reconstruction
npm run sync:dossier                   # regenerate the claims / property / photo tables inside the dossier Markdown
npm run build:dossier-pdf              # sync, then rebuild the dossier PDF (needs chromium on PATH or CHROMIUM=/path)
```

**The site fails closed.** Without `CASE_ACCESS_TOKEN` (alias `CASE_PASSCODE`; comma-separate several tokens) every
request gets a 503 "not configured" page. On Replit the token is a Secret (Tools -> Secrets) and must also be present
on the deployment. Browsers get a sign-in page and a 30-day HttpOnly cookie; `?token=...` on any URL signs in and
redirects to the clean URL; `Authorization: Bearer <token>` and Basic auth (password or username = token) also work,
which is what scripted checks should use. `/logout` clears the cookie. Do not print tokens into pages or logs.

Smoke test after server changes (there are no automated tests):

```bash
T=secret; for r in / /reconstruction /dossier /police-report /property-loss /config.js "/06_Medical_Records_And_Clinical_Evidence/Pictures_Of_Bruises/?format=json" /04_Vehicle_Records_Prior_Repairs_And_Inspection/2026-VehicleRepairs/; do curl -s -o /dev/null -w "$r %{http_code}\n" -H "Authorization: Bearer $T" "http://localhost:3000$r"; done
curl -s -o /dev/null -w "unauthenticated %{http_code}\n" -H 'Accept: text/html' http://localhost:3000/   # expect 401 (sign-in page)
```

Front-end changes need a browser. Headless Chromium is at `/repl/tools/bin/chromium` (on PATH as `chromium`) for screenshots; sign in with `?token=...` on the URL. Open `http://localhost:3000/reconstruction` and confirm the map, HUD and
playback still work at the collision (press the red IMPACT button). `index.html` loads `styles.css` and
`telemetry_engine.js` with a `?v=...` cache-busting query string; bump it when changing either file.

## Architecture

### `server.js` (plain `http`, no framework)
Serves the repo root as static files with a MIME map, behind the access-token gate described above
(`enforceAccess()` runs before anything else; `/access` and `/logout` are its own routes). Route aliases: `/` and
`/portal` -> `00_START_HERE_EVIDENCE_PORTAL.html` (the landing page), `/reconstruction` -> `index.html`,
`/dossier` -> the dossier PDF, `/police-report` -> the CR-4 PDF, `/property-loss` -> binder 12. Adding a route
means adding an entry to `ROUTE_ALIASES`. A directory URL serves its `index.html` if present, otherwise a generated,
themed folder listing (so every exhibit file is reachable) which carries the global header; `?format=json` on a
directory URL returns `{path, entries:[{name,type,ext,size,mtime}]}` and is what the binder 06 gallery uses to find
photos. Paths are normalised and confined to the repo; dotfiles and `node_modules` are never served. Responses are
`Cache-Control: private`.

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
- **Motion is a model, not raw fixes.** A precompute block (`// --- Motion model`) builds a de-jittered path
  through the fixes (stops collapse to one point; the last left turn uses client's-account waypoints
  `TURN_WAYPOINTS` at 12781/12782 and the rest point `IMPACT_REST`), then `motionAt(g)` moves the vehicle along it
  by integrating the logged speed with a smoothed drift correction, and takes heading from the path tangent
  (chord heading across stops, `IMPACT_HEADING` = 0 from the impact on). The strike is at `IMPACT_POINT`; the
  vehicle is then carried to `REST_POINT` (32.955074, -97.038170: the dashcam's own GPS stamp at 05:09:29 and
  the phone log's settled position agree) over `SHOVE_SEC`. How it moved between those points is unrecorded (the
  client was unconscious); never narrate a spin or a straight push. Do not reintroduce per-fix interpolation.
  `?debug=1` exposes `window.__recon` for tests (`scratchpad/motion_harness.js` samples the model in Node).
- **Unit 2 (the BMW sedan) has no GPS data.** It is simulated as a straight line at 271° down the centre of the
  second westbound lane from the median (the owner's account of its lane) at a constant 42 mph, meeting the
  Atlas's right side just behind its centre at the strike point (the owner says she carried on past its path so
  the strike would land at the centre or slightly rear of the passenger side; the CR-4 damage code says
  "3 o'clock, right front quarter, angular"; both are printed in the narration; damage photographs would settle
  it). Rest heading is due north (owner's account, dossier, and the post-crash dashcam frames); the raw bearing
  between the two fixes around the strike is not reliable at that scale.
- **Camera:** continuous zoom from speed plus a zoom-in over the last 20 s to impact, eased in simulation time;
  no threshold switching (those steps were the "jumps" the owner saw).
  The follow camera must not call `map.setView(..., {animate:false})` per frame: Leaflet 1.9 fires `viewprereset` and
  its tile layers discard every tile, which was the "flashing" at the end. It moves with `map._move(..., {pinch:true})`
  and settles (`settleCamera`) a few times a second, the way Leaflet's own pinch-zoom handler works.
- **Signal heads on the map** are drawn on the far side of each approach (where the mast arm is), not at the stop line:
  the west head past the SB frontage road, the eastbound left-turn head past the NB frontage road, the westbound through
  head past the west edge of the intersection (owner, 2026-09-04).
- **Signal phasing is index-driven.** The block under "Dynamic Texas Diamond Signal Phasing State Update"
  in `updateUI()` switches the HUD and on-map traffic lights by comparing the global index against
  fixed thresholds. Changing the timeline narrative means editing those thresholds. Client's account (owner,
  2026-09-04): both through heads go amber as she nears the east terminal (12773), all-red at 12777.5, her
  left arrow green at 12778.5; her arrow is never amber before green. The west signal marker sits on the far
  side of the SB frontage-road crossing, not at the stop line.
- Presets (`applyPreset`) slice `allPoints` into `activePoints`; anything that maps a global index to a
  UI position must subtract `activeStartIndex`. Startup applies `accident_focus` at index 12648.
- Map tiles come from ArcGIS, CARTO and OSM with no API keys; Leaflet and Font Awesome load from CDNs.
  The `google_satellite` layer option is removed at startup unless `APP_CONFIG.googleSatelliteTiles` is true;
  when it is true the Google layer is the DEFAULT, because at this interchange the ArcGIS World Imagery tiles sit
  about 2.5 m east of the GPS fixes (a vehicle stopped at the west stop line appears inside the crosswalk on
  ArcGIS but at the line on Google). Keep that default unless the key goes away.

### Shared front-end pieces (repo root)
- `site_header.js`: the global "Evidence Portal" header (fixed bar with home link, case caption, page section, Sign out).
  Rule: it goes on every **static page** except the landing page; not on the reconstruction app (it opens in its own
  tab) and not on documents. Every binder `index.html` includes `<script src="../site_header.js"></script>` right after
  `<body>`; the server adds it to generated folder listings. It hides the binder pages' old inline back link.
- `case_components.js`: renders `[data-component]` placeholders from three data files that the owner edits directly:
  `claims_status.js` (root; `window.CLAIMS_STATUS`), `12_.../property_loss_items.js` (`window.PROPERTY_LOSS_ITEMS`) and
  `06_.../injury_photos.js` (`window.INJURY_PHOTOS`). Components: `claims` (portal), `property-loss` and
  `property-loss-summary` (binder 12 page and its portal card), `injury-photos` (binder 06; merges the manifest with
  the served folder listing so a photo dropped into `Pictures_Of_Bruises/` shows up before it has a caption).
- Theme: pages are dark by default. A page that sets `<html data-theme="light">` (binder 12 does) gets the light,
  insurer-style variant of both the header and the components; add new light pages the same way rather than
  restyling the scripts.
- `scripts/sync-dossier-tables.js` regenerates the Markdown tables between `<!-- BEGIN GENERATED: … -->` markers in the
  dossier (§3.1 claims, §9.4 injury photos, §12.4 property) from the same data files; `npm run build:dossier-pdf` runs it
  first. Never hand-edit inside the markers.

### Evidence portal and binders
`00_START_HERE_EVIDENCE_PORTAL.html` is the landing page linking into folders `00_` through `12_`; it also renders
the claims cards and the binder 12 summary, so it loads the three scripts above at the end of `<body>`.
There is no `01_` folder: the reconstruction app itself is "binder 01" and lives at the repo root, so
portal links for it must point at root files (`index.html`, `telemetry_engine.js`, ...). Each binder
folder has its own self-contained `index.html` (inline `<style>`, same font/icon CDN links) plus the exhibits;
the only scripts they load are `../site_header.js` and, on binders 06 and 12, their data file plus
`../case_components.js`. The portal, the binder pages and the reconstruction app each carry their own copy of the
CSS variables; there is no shared stylesheet outside the reconstruction app.

Sub-folders of binders 04, 06, 08 and 12 have no `index.html`; links to them rely on the server's generated
folder listing and therefore do not work when the portal is opened from disk.

### Owner decisions that override document ambiguity
- **Uber period (2026-09-04):** the owner has settled that she was in Period 2 (an accepted reservation pickup at the
  Aloft, en route; the rider canceled after the collision) and that this is why two claims are open. Present it as the
  client's account with Uber's trip log as corroboration to obtain, not as an open question. The two claims are
  Progressive 26-854858569 (personal policy) and 26-343820011 (non-owned coverage lines matching the Uber/Rasier
  United Financial Casualty TNC policy; its incident date is printed as August 27 and needs correcting).
- Uber's Texas COI states UM/UIM is not included on either TNC policy; do not describe Uber UM/UIM as active.

### Duplicates policy
Every document lives in exactly one binder; the repo was de-duplicated on 2026-09-04 (root-level copies of the
dossier, attorney instructions and dashcam still were removed, as were the second copies of the GPS CSV and
Uber COI in binder 11, a misnamed duplicate estimate in binder 04, and the stale root `accident-grapevine-121-documentation.md`). The reconstruction app references
the binder 03 dashcam exhibit directly. Do not reintroduce copies; link to the binder file instead. The dossier
PDF is generated from the Markdown by `npm run build:dossier-pdf`; edit the `.md`, then rebuild.

## Replit specifics
`.replit` runs `node server.js` on port 3000 (mapped to external 80) with the `nodejs-24` module and
autoscale deployment. `replit.nix` additionally provides Python 3.11, git, curl and jq for terminal
work; `pdftotext`/`pdfinfo` are also on the PATH. Git history shows Replit Agent commits config changes
as its own author; content commits are the owner's.
