# Dashcam SD Card — Acquisition & Chain of Custody

**Incident:** Motor vehicle collision, Grapevine TX, 2026-08-28 ~05:00 CDT
**Subject media:** SD card from in-vehicle dashcam (4-channel), read via SanDisk SDDR-409 USB reader
**Reported capacity:** 1,023,871,549,440 bytes (953.6 GB), MBR, single FAT32 partition at offset 67,108,864
**Filesystem:** FAT32, 512-byte sectors, 64 KB clusters, 2 FATs, data region begins at byte 192,937,984
**Acquisition date:** 2026-08-29
**Acquired by:** Melody Dashora (card owner/operator), assisted by Claude Code on her laptop

---

## 1. Pre-existing writes — disclosed

The card was **not** write-protected between the collision and this acquisition. The following
non-camera writes were present on the card before any action described in Section 3, and are
disclosed here rather than omitted:

| Artifact | Timestamp | Source |
|---|---|---|
| `.Spotlight-V100/` | 2026-08-28 10:17:06 | macOS Spotlight indexing |
| `.Trashes/` | 2026-08-28 10:22:00 | macOS |
| `._*` AppleDouble stubs (4,096 bytes each) | 2026-08-28 10:23–10:33 | macOS |
| `System Volume Information/` | 2026-08-28 09:15:50 | Windows |

These are small metadata writes made when the card was mounted read-write on a Mac and a Windows
machine roughly 4–5 hours after the collision. They consumed free clusters at approximately the
362 GB mark. They did not modify any camera-written file. Their existence is a limitation on this
acquisition and is stated plainly.

**No writes were made to the card by the process described in Section 3.** All access was read-only.

## 2. Camera write history around the collision

Clip filenames encode start time and a monotonic sequence number. The relevant sequence:

| Seq | Folder | Clip start | File closed | Note |
|---|---|---|---|---|
| 01754 | Normal | 02:41:04 | 02:41:20 | last clip before the vehicle was parked |
| **—** | **—** | **~04:45–05:00** | **never** | **no directory entry — power lost at impact** |
| 01755 | Normal | 05:04:43 | 05:05:14 | camera rebooted, resumed recording |
| 01756 | Normal | 05:05:19 | 05:05:34 | ~15 s |
| 01757 | Normal | 05:05:40 | 05:06:40 | full 60 s |
| 01758 | Normal | 05:06:40 | 05:07:40 | full 60 s |
| 01759 | Normal | 05:07:40 | 05:08:18 | partial |
| 01760 | **Event** | 05:08:24 | 05:09:24 | G-sensor triggered |
| 01761 | **Event** | 05:09:24 | 05:09:54 | G-sensor triggered — final write to card |

Also written: `Photo/20260828_050930_00001_N_{A,B,C,D}.JPG` at 05:09:30, and `GPS/20260828.dat`
(721,674 bytes) last written 05:09:52.

> **Superseded (note added 2026-09-01).** The interpretation below was the working theory on 2026-08-29. It was disproved the same day: GPS logging continued through the collision until 05:03:43, so the camera did not lose power at impact, and no unclosed pre-impact clip exists anywhere on the card (FINDINGS.md §2, §10, §11). The paragraph is retained unaltered for the record.

**Interpretation (2026-08-29, superseded).** The sequence numbers 01754 → 01755 are consecutive, with a ~2h23m wall-clock gap.
The camera lost 12 V at the moment of impact while a clip was being written. Because an MP4's index
(`moov` atom) is written only when a file is closed, that clip never received a valid directory entry
and is invisible to the filesystem. Its data blocks are expected to remain in unallocated space near
the allocation frontier (~355–362 GB), which is the target of the recovery described below.

## 3. Acquisition method

All source access was **read-only**. The card was never formatted, repaired, defragmented, or written to.
No "repair this drive?" prompt was accepted.

1. **Triage copy (2026-08-29 ~14:45).** 117 intact files spanning the crash window (Normal seq 01740–01759,
   all Event clips, the 05:09:30 photos, and GPS logs for 08-26/27/28) were copied to
   `C:\evidence\dashcam\priority\`. Each file's SHA-256 recorded in `MANIFEST-sha256.csv`.
   Duplicate placed in OneDrive (`Desktop\crash-evidence\`) for off-machine retention.
2. **Capacity verification.** 477 blocks of 1 MB sampled across the full device: 477 distinct, zero
   duplicates → reported capacity is genuine, not a counterfeit card that wraps writes.
3. **Forensic image (2026-08-29 15:24 onward).** Bytes 0 → 450,971,566,080 (0–420 GB) of
   `\\.\PhysicalDrive1` copied block-for-block to `card-0-420GB.img`. This range covers the entire
   written region of the card, including all current files and the allocation frontier.
   Unreadable sectors, if any, are zero-filled and logged rather than silently skipped.
   SHA-256 of the completed image recorded in `image-sha256.txt`; full run log in `image.log`.

**Scope limitation.** Bytes 420 GB → 953.6 GB were not imaged, because the destination volume had
768 GB free and could not hold a full 953.6 GB raw image. That region was sampled and contains data
from earlier loop-recording generations, all predating the incident. The original card is preserved
unaltered, so a complete image remains obtainable at any time.

4. **Final signature scan (2026-09-01 15:13–15:57).** Bytes 793,817,497,600 → 1,023,871,549,440 (739.30–953.55 GB) of
   `\\.\PhysicalDrive1` read directly, read-only, for MP4 `mvhd` headers (`scan-mvhd.ps1`, output `mvhd-739-end.csv`).
   Before the read, the disk was flagged read-only in Windows (`Set-Disk -Number 1 -IsReadOnly $true`). 3,225 headers
   found, all dated 2026-04-13 → 2026-07-03 (plus four from 2025-07-02); none from August 2026. With this, 100% of the
   card has been signature-scanned. Zero read errors.

5. **Foreign write on 2026-09-01 (disclosed).** Between 18:37 and 18:46 (Central Time, the writing device's clock)
   the card was inserted in an Android phone (Samsung camera-app temp-file naming) while readers/adapters were being
   swapped. **Confirmed by Melody Dashora on 2026-09-04: it was her own Samsung phone; she inserted the card to see
   whether the phone could show anything the laptop had not. No files were opened or saved intentionally; the
   folders and temp file were created automatically by Android.** It created `LOST.DIR`, `DCIM` and `DCIM\Camera\.temp-20260901_184625308_BACK_SEAMLESS_ZOOM.mp4`
   (0 bytes), allocating three previously free clusters at 142.92 GB (2,338,653 / 654 / 656), and updated FSInfo.
   The 08-29 image shows those three clusters held mid-clip pre-format video residue with no header or keyframe; the
   image preserves them. No camera file, directory entry (other than access dates), FAT chain or size changed —
   verified entry-by-entry in FINDINGS.md §12a (`fat-diff2.ps1`, `dir-entry-diff.ps1`, reports in
   `Recovery_Artifacts\recovered\cardhalf-2026-09-01\fat-diff\`).
6. **Verification pass, 2026-09-02 → 09-04.** Full card-half classification and dating completed (FINDINGS §12);
   FAT #1/#2, FSInfo, root and all camera-folder directory clusters compared with the image (only the item-5 write
   and last-access-date stamps differ); image SHA-256 re-verified identical after relocation.

**Relocation note.** On 2026-09-01 (~21:00–22:20) the evidence root was moved from `C:\evidence\` to
`C:\Users\melod\OneDrive\App Data\Evidence\` (dashcam material under `dashcam\` and
`dashcam\Recovery_Artifacts\`). OneDrive "Files On-Demand" has since made most files online-only placeholders on the
laptop (the 420 GB image stayed local); the hash re-verification above confirms the image survived the move intact.
Recommended: mark `Evidence\dashcam` "Always keep on this device".


## 4. Limitations — stated plainly

- This acquisition was performed by the card's owner on her own laptop, **not** by a certified forensic
  examiner, and no hardware write-blocker was used.
- The laptop used has a **known RAM/mainboard fault**. This is why the image is hash-verified: the
  recorded SHA-256 allows any corruption introduced during acquisition to be detected and the run repeated.
- The card was mounted read-write by third-party operating systems before acquisition (Section 1).
- **The original card is unaltered and preserved.** Nothing done here prevents a professional forensic
  examiner from performing an independent acquisition and recovery. If the recovered pre-impact clip
  becomes material to the claim, that independent examination is the recommended course.

## 5. Handling from here

- The card should be **write-protected** (physical lock switch) and stored unused.
- Do not return this card to the camera. Buy a replacement card for the vehicle.
- Do not re-encode, trim, or edit any recovered clip. Preserve originals byte-identical; make copies
  for viewing.
