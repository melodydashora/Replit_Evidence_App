# Dashcam Forensic Findings — Collision of 2026-08-28

**Prepared:** 2026-08-29. **Updated:** 2026-09-01 (card scan completed to 100%).
**Subject media:** VANTRUE N5 dashcam microSD (1 TB), read via SanDisk SDDR-409. Card mounted read-only
throughout; never written to.
**Camera:** VANTRUE N5, 4 channels. Ch A 2560×1440 HEVC; Ch B/C/D 1920×1080 HEVC. 30 fps, 60 s clips.

---

## 1. Headline conclusions

1. **No dashcam video of the collision exists, and none was ever recorded.** This is not a recovery
   failure. The camera was not writing video at the time of impact.
2. **The GPS track does cover the collision, second by second**, and is intact and preserved.
3. **Collision at 05:00:15** (GPS clock), at **32.955086, −97.038101**.
4. Vehicle was travelling **east**, decelerating, and **initiating a left turn to the north** when struck.
5. Impact speed approximately **15–17 mph**, after nine seconds of continuous braking.

---

## 2. Why no video exists — three independent proofs

### Proof A — the camera's write pointer never moved

MP4 file headers recovered from the raw image give each clip's exact physical position on the card:

| Position on card | Clip closed at | Clip |
|---|---|---|
| 336.5154 GB | 2026-08-28 **02:41:16** | 01754 — last before the gap |
| 336.5376 GB | 2026-08-28 **05:05:06** | 01755 — first after the reboot |

The camera advanced **22 MB** between 02:41 and 05:05 — exactly the size of clip 01754 itself. Every other
consecutive clip-set on this card sits at a regular **0.25 GB stride**.

Two hours nineteen minutes of four-channel video would occupy approximately **35 GB**. There is no
physical room for it between those two clips. This argument relies on no timestamp interpretation and no
sampling — the camera simply never advanced.

### Proof B — the clip counter did not increment

Last clip before the gap is `01754`; first after is `01755`. Consecutive. Had ~140 one-minute clips been
recorded across the drive, the counter would read approximately `01897`.

### Proof C — no August footage anywhere on the card

**The entire 953.55 GB card** has now been examined by direct signature scanning (see §5). **Every August 28
header found on the entire card lies within 334.19–337.54 GB** — a 3.35 GB band that is exactly the 22 clip-sets
already preserved. No twenty-third clip exists.

### Supporting — no event lock at impact

The camera locks files on G-sensor trigger (57 event clip-sets on this card; 2–9 on a typical day). A
0.78 g impact is far above any pothole threshold. **There is no event lock at 05:00:15.** The two event
clips that day (`01760_E` 05:08:24, `01761_E` 05:09:24) post-date the collision by eight minutes and
follow the camera's reboot. A recording camera cannot miss an impact that hard; one whose encoder has
stopped has nothing to lock.

### Supporting — it was not a power loss

GPS logged continuously **through** the collision and for 3½ minutes after (impact 05:00:15; still
logging at 05:03:43). The camera had power the entire time. It then power-cycled (78-second gap) and
resumed recording at 05:04:43. The missing video is not attributable to power loss, the card, or the
reader.

---

## 3. Device behaviour — chronic under-recording since 2026-07-09

The camera logs GPS whenever powered but records video only intermittently. Comparing powered minutes
(GPS records) against video minutes for **every day on the card**:

| Day | Powered (min) | Video (min) | Ratio |
|---|---|---|---|
| 2026-07-09 | 236 | 89 | 38% |
| 2026-07-13 | 499 | 127 | 25% |
| 2026-07-16 | 537 | 65 | 12% |
| 2026-07-18 | 650 | 135 | 21% |
| 2026-07-23 | 158 | 35 | 22% |
| 2026-08-25 | 745 | 92 | 12% |
| 2026-08-26 | 377 | 34 | 9% |
| 2026-08-27 | 219 | 44 | 20% |
| **2026-08-28** | **221** | **22** | **10%** |

Across all 21 days the camera recorded only **9–52%** of powered time, median ≈22%. This behaviour
predates the collision by seven weeks. August 28 was an ordinary day for this device; the collision simply
fell in one of the many windows in which it was not recording.

The camera was **unplugged from 2026-07-23 to 2026-08-24** (31 days with no footage and no GPS log),
which the card confirms exactly. The under-recording occurs both before and after that gap.

> **Correction to an earlier working note:** this was initially characterised as a "5-minute burst fault"
> that began in August. That was wrong. Recording bursts run 7–18 minutes (longest 41 min in July), and
> the under-recording is present from 2026-07-09 onward.

### August 28 recording windows
- 00:12:21 – 00:17:12
- 02:35:32 – 02:41:20  ← ends 2 h 19 m before impact
- *(no video 02:41:20 → 05:04:43)*
- 05:04:43 – 05:09:24  ← begins 4½ min after impact

GPS shows the vehicle stationary from 02:35:45 to 02:54 and driving 02:55 → 05:00:15. The camera's final
pre-crash recording window was spent entirely on a **parked** vehicle and ended **14 minutes before the
drive began**.

---

## 4. The collision, from the GPS track

Source: `D:\GPS\20260828.dat` → parsed to `gps-20260828.csv` (13,285 records, 1 Hz).
Format `YYYYMMDDHHMMSS,lat,N,lon,W,speed,altitude`. **Speed is in knots** — verified against position
deltas (0.000130° latitude in 1 s = 14.47 m/s = 28.1 kn vs. logged 27.874).

| Time | Speed | Heading | Event |
|---|---|---|---|
| 04:58:40–04:59:10 | 23 → 40.7 mph | 92° ESE | travelling east |
| **04:59:18–04:59:43** | **0 mph, 25 s** | — | **full stop at 32.955082, −97.041977 — 362 m WEST of impact.** A preceding intersection, not the turn. |
| 04:59:44 → 05:00:05 | 3 → 39.1 mph | 90° E | pulling away |
| 05:00:05 → 05:00:14 | **39.1 → 17.2 mph** | 90° → 70° | **nine seconds of continuous braking** |
| 05:00:13 | 18.0 mph | 84° | heading begins swinging left |
| 05:00:14 | 17.2 mph | 70° E | turn in progress |
| **05:00:15** | **0 mph** | 22° NNE | **impact.** Vehicle never moves again. |

- **Impact speed ≈ 15–17 mph.** The 17.2 mph reading is one second *before* contact, with deceleration
  still running at 1–2 mph/s. GPS samples at 1 Hz and cannot resolve the final fraction of a second.
  The driver's recollection of "10–15 mph" is within instrument error and is **corroborated**.
- **The driver did not stop before turning.** She decelerated into a rolling left turn. The 25-second
  stop was a separate event 362 m earlier.
- After 05:00:15 the vehicle is stationary permanently.

### Direction of travel — confirmed eastbound

The driver's account is **eastbound on Bass Pro Drive, turning left (north) onto SH-121**, and the GPS
confirms it independently: constant ~90° heading at latitude 32.9551 with longitude increasing
(−97.0476 → −97.0381), then the heading swinging to 22° NNE as the turn begins. A left turn onto a
northbound road is only geometrically possible from an eastbound approach. The other vehicle was
therefore **westbound**.

---

## 5. Search coverage

| Region | Method | Result |
|---|---|---|
| 0–32 GB | mvhd signature scan | 564 headers — all July |
| 32–185 GB | mvhd signature scan | 2,868 headers — all July |
| 185–320 GB | mvhd signature scan | 2,722 headers — July, plus live Aug 24/25/26 |
| 320–420 GB | ftyp + mvhd + HEVC content scan | Aug 26–28 live at 334.19–337.54 GB; **all free space above the 337.67 GB frontier is April–July** |
| 420–602 GB | mvhd scan, raw device | 2,625 headers — all April–July, **zero August** |
| 600–739.34 GB | mvhd scan, raw device | 1,994 headers — all April–July, **zero August** (`mvhd-600-end.csv`; that run was interrupted at 739.34 GB) |
| 739.30–953.55 GB | mvhd scan, raw device | 3,225 headers — 2026-04-13 → 2026-07-03 (+4 from 2025-07-02), **zero August** (`mvhd-739-end.csv`, 2026-09-01) |

**Coverage is now complete: 0 → 953.55 GB, 100% of the card.** No August 2026 header exists anywhere outside the
334.19–337.54 GB band of preserved live clips.

Additional checks:
- **FAT accounting balances.** Allocated clusters 5,529,142 vs. 5,529,129 referenced by 7,117 live files —
  a 13-cluster (~1 MB) difference. No orphaned cluster chain of any meaningful size exists.
- **Only three unclosed clips** exist in the scanned free space, at ~366.42 GB — the B/C/D channels of a
  single clip surrounded by April–July footage.
- **Frame-level verification:** video decoded directly from unallocated space at the frontier
  (337.6715 GB) renders **06/07/2026 21:11:59, N 32.943817 W 96.929070, 72 MPH** burned into the image —
  confirming the free-space region is June footage, independent of all metadata.

---

## 6. Recovery capability developed (available if needed)

The camera writes HEVC parameter sets (VPS/SPS/PPS) **in-band**, repeated ~123 times per 60-second clip.
Consequently a clip with no `moov`, no directory entry and no file header can still be decoded: convert
the length-prefixed NAL units to Annex-B and decode directly.

**`untrunc`, WSL and a reference file are not required for this camera.** Scripts: `carve-hevc.ps1`,
`extract-orphan.ps1`. This makes all deleted April–July footage on the card recoverable on request.

---

## 7. Evidence preserved

| Artifact | Description |
|---|---|
| `priority\` | 108 files, 3.98 GB — all 08-28 clips (01740–01761), 05:09:30 photos, GPS logs 08-26/27/28 |
| `MANIFEST-sha256.csv` | SHA-256 of every preserved file |
| `card-0-420GB.img` | **Complete** forensic image, bytes 0–420 GB |
| `image-sha256.txt` | SHA-256 of the image |
| `gps-20260828.csv` | Parsed GPS track, 13,285 records |
| `gps-20260828-full.gpx`, `gps-20260828-precrash.gpx` | Same track as GPX (Google Earth / My Maps); pre-crash file covers 02:41 → 05:09:53 with impact waypoint |
| `candidates-full.csv`, `mvhd-*.csv` | All recovered headers with decoded timestamps |
| `frontier.log` | FAT32 geometry and allocation analysis |
| `CHAIN-OF-CUSTODY.md`, `PRESERVATION-REQUESTS.md` | Acquisition record; evidence-preservation templates |

**Card integrity:** 605 GB read across the acquisition with **zero bad blocks, zero read retries, and zero
handle reopens**. Capacity verified genuine (953.55 GB). Card never written to.

---

## 8. Recommended next steps

1. **Traffic signal controller logs** — City of Grapevine **and** TxDOT Dallas District (SH-121 is a state
   highway), intersection 32.955086 −97.038101, window **04:45–05:30** on 2026-08-28. Texas Public
   Information Act request. This is the best available source for the left-turn signal indication.
2. **Private security footage** — Bass Pro Shops, Grapevine Mills, adjacent hotels. **Retention is
   typically 14–30 days**; preservation requests are time-critical.
3. **The other vehicle's dashcam**, via discovery.
4. Provide `gps-20260828.csv` to any accident reconstructionist.

Templates for items 1 and 2 are in `PRESERVATION-REQUESTS.md`.

### Note on what the GPS does and does not establish
It does **not** establish the signal indication. It does establish that the vehicle decelerated from
39 mph to ~15–17 mph over nine seconds and turned without stopping — behaviour consistent with acting on a
protected green arrow rather than waiting for a gap on a permissive green. Consistent with, not proof of.

---

## 9. Corrections to the earlier working record

- `CHAIN-OF-CUSTODY.md` records the incident as "~05:00 CDT"; the logged time is **05:00:15**.
- The earlier hypothesis that the camera lost power at impact, leaving an unclosed clip to be carved, is
  **disproved** — the camera retained power and logged GPS for 3½ minutes after impact.
- Event clips `01760_E` / `01761_E` are **not** the collision; they post-date it by eight minutes.
- An earlier "mdat without moov" detection reported by a prior session was a false positive and was
  retracted by that session; it did not identify recoverable footage.

---

## 10. Independent re-examination of the first session's "headers" (2026-09-01)

**Why.** The very first session's frontier probe (`probe.log`, 348–368 GB, 16 MB chunks) flagged ten chunks as
"mdat WITHOUT moov". A later session retracted them as false positives. Because that retraction was never
verified at the content level, the ten hits were re-tested from scratch on 2026-09-01 directly against the raw
image, without relying on the earlier interpretation. Scripts and outputs: `recovered\reexam-2026-09-01\`.

**Method.**
1. From the exact atom map of 337–392 GB (`atoms-full.csv`, 2,594 boxes), every one of the 868 `mdat` boxes was
   tested for the camera's closed-clip layout (`ftyp` at file start, `moov` at +64, `mdat` at +65,528).
   **847 are closed clips.** 21 are not.
2. Of those 21: **three are genuine unclosed clips** (`ftyp` immediately followed by a zero-length `mdat`
   placeholder, at 366.4217 / 366.4256 / 366.4276 GB — three channels of one clip). The other **18 are the four
   ASCII bytes "mdat" occurring by chance inside compressed video**: none is cluster-aligned (offsets within
   their 64 KB cluster range 5,907–62,622 bytes) and none has a `ftyp` in front of it. For 55 GB of
   near-random data the expected number of chance 4-byte matches is ≈13, so 18 is unremarkable.
3. **Content test, independent of every header and timestamp:** at each of the 21 positions the nearest in-band
   HEVC parameter set was located, one frame was decoded with ffmpeg, and the date/time/GPS/speed the camera
   burns into the picture was read. Where the first frame's bottom strip was unreadable, neighbouring frames
   were decoded instead.

**Result.** Every readable frame carries a date between **27 April and 2 July 2026**. Nothing is from August.

| Position | Probe chunk | Kind | Burned-in date in decoded frame |
|---|---|---|---|
| 343.726 GB | — | chance bytes | 06/28/2026 23:39:24 (neighbours; 05/24/2026 residue also present) |
| 347.850 GB | — | chance bytes | 06/12/2026 22:25:57 |
| 349.185 GB | 349.172 | chance bytes | 06/25/2026 11:34:23 · 05/27/2026 07:34:37 · 06/24/2026 16:25:38 (neighbours) |
| 349.990 GB | 349.984 | chance bytes | 06/02/2026 08:38:50 |
| 350.021 GB | 350.016 | chance bytes | 06/02/2026 08:38:55 |
| 359.533 GB | 359.531 | chance bytes | 06/28/2026 14:20:24 |
| 360.086 GB | 360.078 | chance bytes | 06/13/2026 00:56:40 |
| 361.012 GB | 361.000 | chance bytes | 06/24/2026 16:26:06 |
| 364.004 GB | 364.000 | chance bytes | 04/27/2026 05:40:03 |
| 364.167 GB | — | chance bytes | 06/29/2026 20:02:34 |
| 364.216 GB | 364.203 | chance bytes | 06/26/2026 10:47:50 |
| 366.422 GB | 366.406 | **unclosed clip, ch. 1** | daylight cabin frame (strip unreadable); neighbours 05/21/2026 19:04:58 and 06/25/2026 |
| 366.426 GB | 366.422 | **unclosed clip, ch. 2** | 06/25/2026 10:43:27 |
| 366.428 GB | 366.422 | **unclosed clip, ch. 3** | 06/25/2026 10:43:27 |
| 366.519 GB | — | chance bytes | 06/25/2026 10:43:34 |
| 368.041 GB | — | chance bytes | 06/28/2026 22:11:26 |
| 371.259 GB | — | chance bytes | 06/28/2026 14:21:28 |
| 372.626 GB | — | chance bytes | 06/25/2026 10:45:01 |
| 375.105 GB | — | chance bytes | 06/28/2026 22:53:46 |
| 385.130 GB | — | chance bytes | 06/26/2026 09:18:26 |
| 389.891 GB | — | chance bytes | 07/02/2026 10:13:31 |

The only unclosed clip in the band is a **25 June 2026, 10:43** clip (parked, 0 mph, at N 33.15257 W 96.86214).
The collision happened at 05:00 in darkness; every frame decoded here that is not explicitly time-stamped is
a daylight scene. The retraction stands, now on content evidence rather than on interpretation.

Images: `recovered\reexam-2026-09-01\montage-strips.png` (the 21 burned-in strips, in table order),
`montage-neighbours.png` (neighbouring frames for the three unreadable strips), `sheet-frames.png` (all 21 frames).

---

## 11. Additional file-system checks (2026-09-01, independent examiner pass, read-only on the image)

Scripts and reports: `recovered\reexam-2026-09-01\agent-forensics\` (FatTool.cs, task1-fatcmp.ps1, task2-dirwalk.ps1,
task3c-gps-clusters.ps1, task7-*.ps1, dir-all-slots.csv, *-report.txt, SHA256SUMS.txt).

1. **FAT #1 and FAT #2 are byte-identical** (SHA-256 35710D2F…8EDD1C for both; 0 of 15,620,224 entries differ).
   There is no stale second allocation history to mine.
2. **Full directory walk, every 32-byte slot including deleted (0xE5) and orphan long-name slots:** Normal 6,637 live /
   0 deleted; Event 228 / 0; Photo 167 / 0; GPS 21 / 0. The only deleted entries on the whole card are two Mac
   Spotlight temp files. **Deleted entries dated 2026-08-28 in camera folders: zero.** Serials 01740–01761 are each
   present exactly once per channel, all live. Cluster accounting closes exactly: 7,117 files own 5,529,120 clusters
   + 22 directory clusters = 5,529,142 = FAT allocated; unexplained 0; allocated-but-unowned 0.
   *(Correction to §5: the "13-cluster (~1 MB) difference" was the Normal directory's own 13 clusters, not orphaned data.)*
3. **Time-resolved proof from the GPS log's own clusters.** `GPS\20260828.DAT` grows by one 64 KB cluster roughly
   every 20 minutes, taking whatever cluster is at the write pointer at that moment. Its clusters [4]–[10]
   (first records 02:48:06, 03:08:17, 03:28:15, 03:48:13, 04:08:14, 04:28:14, 04:48:18) are **physically consecutive**
   at clusters 5,510,883–5,510,889, sandwiched between clip 01754_D and clip 01755_A with **no free cluster anywhere in
   5,510,075–5,529,115**. Any video cluster allocated at any moment between 02:48 and 05:04, deleted later or not, would
   sit between two of those GPS clusters. None does. (On 08-27 the same file's 11 clusters are scattered from 327.85 to
   334.19 GB between clips, because video was being written between them.) The allocator is empirically next-fit and
   never reuses lower free space: an aborted July clip left a one-cluster hole at cluster 688,667 (42.21 GB) that has
   never been reused.
4. **All 312 free clusters below the frontier** (27 ranges, 19.5 MB) were signature-scanned: 0 ftyp/moov/mvhd,
   0 "20260828" GPS strings; the only video markers are pre-format June residue.
5. **Spotlight index:** references exactly the 7,015 camera-file stems that are live today; nothing more.
6. **GPS log integrity:** 419,730 records across the card, strictly monotonic; 08-28 continuous 02:41→05:05 except a
   2-s hiccup at 02:55:58 and the 78-s reboot gap 05:03:43→05:05:01.
7. **Recording-burst census (173 bursts, 21 days, 170 power sessions):** 166 of 173 bursts start at a camera boot;
   median burst 7.8 min, max 20.8 min, flat across the day (heat is not the driver); zero parking-mode files (the
   miswired-ACC/parking hypothesis is refuted); only one burst in seven weeks restarted on a G-sensor event without
   a power cycle. On 08-28 the camera booted ~02:35:30 while parked, recorded 02:35:32–02:42:04 (last two clips are
   12-s stutter clips), logged GPS for 8,545 s through the drive and the crash with no video, rebooted at 05:03:43.
8. **Firmware:** the "VANTRUE N5" watermark in frames requires firmware EEH141 (2025-08-18) or later; the 5-digit
   serials require at least EDC271 (2024-04-03, the release that added 1 TB support). Card formatted in-camera
   2026-07-08 22:25 as FAT32/64 KB ("mkdosfs"). Read the exact version from the unit's System Info before any update.
9. **Airbags deployed:** the cabin channel at 05:05:45 shows the driver front and side-curtain airbags deployed, so
   the vehicle's airbag control module holds a locked pre-crash record (see `C:\evidence\OTHER-ROUTES-PLAN.md`, item 4).

**Notes on the record.** "Software write-protected" means a `Set-Disk` read-only flag on this laptop, not a property
of the card; a microSD has no lock switch (the SD adapter does). The 0–420 GB image was made without a hardware
write-blocker on a laptop with a known RAM fault (disclosed in CHAIN-OF-CUSTODY.md); 420–953.55 GB has been scanned
but never imaged. Those are the practical reasons to commission an independent full acquisition if the absence of
video is ever contested.

### 11a. Full-card in-band video-marker scan (VPS carve), image half 0–420 GB (2026-09-01 16:37–16:57)

Independent of any MP4 header, every occurrence of the HEVC parameter-set start marker the camera writes at the head
of each payload (and at the head of every 2 MiB write run) was located: **667,776 hits in 0–420 GB.** 7,782 are
cluster-aligned. Each was classified by reading the 64 KB in front of it:
- **1,861 are closed clip starts** (`ftyp` + `moov` header) — already timestamped by the header scans;
- **3 are unclosed clip starts** (`ftyp` with the zero-length `mdat` placeholder): the June 25 2026 10:43 clip at
  366.42 GB already decoded in §10;
- **5,907 are 2 MiB write-run boundaries inside files** (the camera begins a fresh keyframe at every 2 MiB flush;
  the nearest `ftyp` lies exactly 32 or 64 clusters behind each);
- **11 are a firmware quirk**: an `ftyp`/`mdat` header template sitting at cluster #928 (58 MiB) inside eleven
  full-length live clips dated 2026-07-10 → 2026-08-26 (owners identified by walking every live file's FAT chain).
No marker in the live region lies outside a live file; every marker in free space is in the April–July residue.
Scripts/outputs: `recovered\reexam-2026-09-01\agent-forensics\` (classify-vps.ps1, clipstarts-0-420.csv,
owners-of-clusters.ps1). The card half (420–953.55 GB) ran 17:32–19:35 via the laptop's internal reader in two pieces (a Windows "bad block" event on that reader killed the first run at 471 GB; the retry-tolerant `carve-hevc-resilient.ps1` resumed from 470.19 GB): **697,894 hits, zero unreadable ranges** (`hevc-420-end.csv` to 471.31 GB, `hevc-470-end.csv` to the end). Whole card: 100 % read for headers AND for raw video markers. Classification and dating of the card-half hits are recorded by the parallel session in `recovered\cardhalf-2026-09-01\` (its first tranche, 420–471 GB: 156 closed clips dated 2026-04-20 → 07-02, 3 unclosed decoding to 06/28 and 06/30/2026, remainder mid-file run boundaries).

## 12. Card half (420–953.55 GB): every raw video marker classified and dated — COMPLETE (2026-09-02, finalised 2026-09-04)

Scope: the 697,894 in-band HEVC parameter-set (VPS) hits found by the full-card carve of the never-imaged half
(`hevc-420-end.csv`, `hevc-470-end.csv`), read directly from the card (`\\.\PhysicalDrive1`, Windows read-only
flag set). Working files: `Recovery_Artifacts\recovered\cardhalf-2026-09-01\` (hashes in its `SHA256SUMS.txt`).

**Classification** (`classify-vps2.ps1` → `clipstarts-420-end.csv`): 7,810 cluster-aligned candidate clip starts —
1,695 **closed** clips (`ftyp` + `moov`), 5 **unclosed** (`ftyp`, no `moov`), 4,456 **headerless** fragments (header
cluster overwritten), 1,654 **2 MiB write-run boundaries** inside files (a `ftyp` exactly 32 or 64 clusters behind).

**Dating — three independent routes, all read-only:**
1. Closed clips: `mvhd` creation time joined to the clip start (`closed-clip-dates.csv`): all 1,695 matched,
   **2026-04-13 17:52 → 2026-07-08 23:05** (Apr 62 · May 187 · Jun 1,224 · Jul 222).
2. Unclosed + headerless (4,461): the first frame of each was decoded from the card (`batch-decode.ps1`, 4,293; the
   168 that would not decode were decoded from the next keyframe of the same write run, `decode-neighbours.ps1`) and
   the burned-in `MM/DD/YYYY HH:MM:SS` strip read **two independent ways**: Windows OCR (`ocr-strips.ps1` →
   `ocr\ocr-dates.csv`) and vision readers over 224 contact sheets (`sheets\`, `sheets-neighbour\`), with two further
   readers for any row flagged illegible, malformed or out-of-window (workflow `wf_0917e88a-d39`; `vision-rows.csv`,
   `vision-results-by-label.json`, `vision-workflow-journal.jsonl`). Where both could read a stamp they **never
   disagreed** (0 conflicts in 4,345 readings).
3. Unreadable stamps (116: decoder-corrupted, glare, or blank strips): bracketed by the nearest dated starts on
   either side (`final-join.py`). Every bracket lies inside **2026-04-17 … 2026-07-03**; none touches August and none
   is open-ended.

**Result** (`cardhalf-dates-final.csv`): 6,040 of 6,156 clip starts dated — **all 2026-04-13 → 2026-07-08 23:05**,
except four fragments at 927.03 GB that both readers stamp **07/02/2025** (older residue; the same date as the four
2025-07-02 `mvhd` headers found by the 09-01 header scan). Month tally: Apr 236 · May 657 · Jun 4,435 · Jul 708
(+4 × Jul 2025). **Last 300 GB (653.55–953.55 GB): 3,548 clip starts, 3,474 dated, all April–July 2026 (+ the four
from July 2025), 74 unreadable-but-bracketed inside the same window. Nothing from 2026-07-09 or later exists anywhere
in 420–953.55 GB.**

Together with §11a, **every raw video marker on the whole card is now accounted for**: inside a live file
(2026-07-10 → 08-28) or in pre-format residue (2026-04-13 → 07-08, plus 2025-07-02). There is no August 28 video
outside the 22 preserved clip-sets, and no candidate location remains unexamined.

### 12a. Card state re-verified against the 08-29 image (2026-09-02 / 09-04) — one foreign write found and disclosed

`fat-diff2.ps1`, `dir-clusters-card-vs-image.ps1`, `dir-entry-diff.ps1` (all read-only; reports in `fat-diff\`):

- **FAT #1 and FAT #2 vs the image: exactly 3 entries differ** — clusters 2,338,653 / 2,338,654 / 2,338,656
  (142.92 GB), free on 08-29, end-of-chain now. FSInfo free count 10,090,954 → 10,090,951. Card FAT#1 = FAT#2 still.
- **Root directory: two new entries** — `LOST.DIR` (written 2026-09-01 18:37:54) and `DCIM` (18:46:24), with
  `DCIM\Camera\.temp-20260901_184625308_BACK_SEAMLESS_ZOOM.mp4` (0 bytes, no clusters). These are **Android
  artifacts** (Samsung camera-app temp-file naming): the card was in an Android phone on **2026-09-01 between 18:37
  and 18:46 by the phone's clock (Central Time)** — i.e. 16:37–16:46 laptop time, exactly the window in which
  RESUME-HERE records the reader "disappearing" while readers/adapters were being swapped. The three overwritten
  clusters (192 KB) held, per the image, **mid-clip pre-format residue with no header, no `mvhd` and no keyframe**
  (0 VPS hits in them in the 09-01 carve). The image preserves their prior content. **No camera file was touched.**
- **Every directory cluster of the camera folders compared byte-for-byte:** 1,088 entries differ **only in the FAT
  last-access date** (966 stamped 2026-08-29 — acquisition day, files opened before any read-only flag existed;
  122 stamped 2026-09-01) plus the access dates of `System Volume Information\WPSettings.dat` / `IndexerVolumeGuid`
  (2026-09-01). **Zero changes to write times, sizes, first clusters or attributes** (Windows' FAT driver stamps the
  access date on read; the card was never hardware write-blocked).
- `card-0-420GB.img` **SHA-256 re-verified 2026-09-02 18:26** after the evidence folder moved to OneDrive:
  `2653706C…A3B347`, identical (`image-sha256-reverify-2026-09-02.txt`).

Net: apart from three 64 KB clusters at 142.92 GB rewritten by an Android phone on 09-01 and access-date stamps, the
card is byte-identical in every metadata structure to the 08-29 image. Nothing about the collision window changed.
