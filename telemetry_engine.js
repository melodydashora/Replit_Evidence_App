/**
 * Forensic GPS Accident Reconstruction & Black SUV Telematics Engine
 * High-performance 60 FPS interpolation, dynamic turn scaling, two-vehicle physics, and automatic collision halt
 */

(function() {
  'use strict';

  // --- Ensure Dataset is Loaded ---
  const rawData = window.GPS_TELEMATICS_DATA;
  if (!rawData || !rawData.points || rawData.points.length === 0) {
    console.error("GPS telematics dataset missing or empty!");
    return;
  }

  const allPoints = rawData.points;
  const milestones = rawData.milestones || [];
  const stops = rawData.stops || [];
  const accidentEvent = rawData.accident_event;
  const IMPACT_GLOBAL_INDEX = 12783; // 05:00:15 AM

  // --- Motion model: de-jittered path, speed-driven timing, smooth heading ---------------------------
  // The log is 1 Hz. Its speeds are smooth, but its positions carry 1-2 m of noise (worst while stopped), so
  // pacing the marker from fix to fix makes the vehicle surge every second and creep at red lights, and the
  // scripted left turn used to hand off from the raw track with a snap. Instead:
  //   1. build one path through de-jittered fixes (each stop's fixes collapse to a single point; the final
  //      left turn and the rest point are the client's-account waypoints checked against the fixes);
  //   2. move the vehicle along that path by integrating the LOGGED SPEED, with a slowly varying correction so
  //      it never drifts more than a metre or two from the fixes and is exactly on them at every stop;
  //   3. take heading from the path tangent, so it turns as smoothly as the path does.
  const MS_PER_KT = 0.514444;
  const N_PTS = allPoints.length;
  // Impact point: 0.6 m west of the first zero-speed fix (05:00:15), placed so the final metres of the turn run due
  // north as the client describes (the two fixes either side of the strike are 3.7 m apart, too close to fix a
  // bearing on their own). Rest point: where the vehicle came to rest. The phone log's position walks from the
  // impact fix to (32.955074, -97.038170) over the following minute and stays there, and the dashcam's own GPS stamp
  // at 05:09:29 reads N 32.955074 W 97.038170 (0 mph): two receivers agree, so that is the rest position, about 6 m
  // west-south-west of the strike and still inside the intersection. The phone's slow walk is its motion filter
  // converging after the sudden stop. HOW the vehicle moved between the strike and the rest point is not recorded
  // (the client was unconscious; no sensor logged it): the replay only carries it from one point to the other.
  const IMPACT_POINT = { lat: 32.955088, lon: -97.038110 }; // where the path ends (the strike)
  const REST_POINT = { lat: 32.955074, lon: -97.038170 };   // dashcam GPS stamp 05:09:29; phone log 05:01:22 onward
  const IMPACT_REST = IMPACT_POINT;                          // the path's final point; the shove to REST_POINT is applied on top
  const TURN_WAYPOINTS = { 12781: { lat: 32.955036, lon: -97.038190 }, 12782: { lat: 32.955055, lon: -97.038118 } };
  const SHOVE_DLAT = REST_POINT.lat - IMPACT_POINT.lat, SHOVE_DLON = REST_POINT.lon - IMPACT_POINT.lon; // strike -> rest
  const SHOVE_SEC = 1.2; // display duration of that move (a ~6 m slide decelerating at ~0.7 g would take about this long)

  function bearingDeg(a, b) {
    const toRad = Math.PI / 180;
    const dLon = (b.lon - a.lon) * toRad;
    const y = Math.sin(dLon) * Math.cos(b.lat * toRad);
    const x = Math.cos(a.lat * toRad) * Math.sin(b.lat * toRad) - Math.sin(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.cos(dLon);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }
  const M_PER_DEG_LAT = 111320, M_PER_DEG_LON = 111320 * Math.cos(32.955 * Math.PI / 180);
  function metresBetween(lat1, lon1, lat2, lon2) {
    return Math.hypot((lat2 - lat1) * M_PER_DEG_LAT, (lon2 - lon1) * M_PER_DEG_LON);
  }

  const secsArr = allPoints.map(p => { const t = Date.parse(p.ts); return Number.isNaN(t) ? NaN : t / 1000; });
  const dtArr = new Float64Array(N_PTS); // seconds to the next sample: 1 normally, >2 only at a log gap
  for (let i = 0; i < N_PTS - 1; i++) { const d = secsArr[i + 1] - secsArr[i]; dtArr[i] = (Number.isFinite(d) && d > 0) ? d : 1; }
  dtArr[N_PTS - 1] = 1;
  if (secsArr.some(t => !Number.isFinite(t))) console.warn('Motion model: some ts fields did not parse; log gaps may go undetected.');
  const isGapAfter = i => dtArr[i] > 2.5;
  const vMs = new Float64Array(N_PTS);
  for (let i = 0; i < N_PTS; i++) vMs[i] = (allPoints[i].kt || 0) * MS_PER_KT;

  // Stops: runs of two or more samples under 0.6 m/s (about 1.3 mph). Two runs separated by one or two
  // slow samples (a GPS speed blip while waiting) are one stop.
  const inStop = new Uint8Array(N_PTS);
  for (let i = 0; i < N_PTS;) {
    if (vMs[i] < 0.6) {
      let j = i;
      while (j + 1 < N_PTS && vMs[j + 1] < 0.6 && !isGapAfter(j)) j++;
      if (j - i + 1 >= 2) for (let k = i; k <= j; k++) inStop[k] = 1;
      i = j + 1;
    } else i++;
  }
  for (let i = 1; i < N_PTS - 1; i++) {
    if (inStop[i] || !inStop[i - 1]) continue;
    let j = i; while (j < N_PTS && !inStop[j] && j - i < 2 && vMs[j] < 2.5 && !isGapAfter(j - 1)) j++;
    if (j < N_PTS && inStop[j] && j - i <= 2) for (let k = i; k < j; k++) inStop[k] = 1;
  }

  // De-jittered positions
  const pLat = new Float64Array(N_PTS), pLon = new Float64Array(N_PTS);
  for (let i = 0; i < N_PTS; i++) { pLat[i] = allPoints[i].lat; pLon[i] = allPoints[i].lon; }
  for (let i = 0; i < N_PTS;) { // each stop -> the mean of its fixes (value 2 marks a neighbour already folded in)
    if (inStop[i] === 1) {
      let j = i;
      while (j + 1 < N_PTS && inStop[j + 1] === 1 && !isGapAfter(j)) j++;
      let sl = 0, so = 0;
      for (let k = i; k <= j; k++) { sl += allPoints[k].lat; so += allPoints[k].lon; }
      const ml = sl / (j - i + 1), mo = so / (j - i + 1);
      for (let k = i; k <= j; k++) { pLat[k] = ml; pLon[k] = mo; }
      // neighbouring fixes within 2 m of the stop point are noise at walking pace: fold them in
      for (const k of [i - 1, i - 2, j + 1, j + 2]) {
        if (k < 0 || k >= N_PTS || inStop[k]) continue;
        if ((k === i - 2 && inStop[i - 1] !== 2) || (k === j + 2 && inStop[j + 1] !== 2)) continue;
        const beyond1 = k < i ? k - 1 : k + 1, beyond2 = k < i ? k - 2 : k + 2;
        if ((beyond1 >= 0 && beyond1 < N_PTS && inStop[beyond1]) || (beyond2 >= 0 && beyond2 < N_PTS && inStop[beyond2])) continue;
        if (k < i && isGapAfter(k)) continue;
        if (k > j && isGapAfter(k - 1)) continue;
        if (metresBetween(pLat[k], pLon[k], ml, mo) < 2.0 && vMs[k] < 1.5) { pLat[k] = ml; pLon[k] = mo; inStop[k] = 2; }
      }
      i = j + 1;
    } else i++;
  }
  { // light three-point smoothing of moving fixes (takes out the metre-scale alternation); lighter when slow
    const sl = Float64Array.from(pLat), so = Float64Array.from(pLon);
    for (let i = 1; i < N_PTS - 1; i++) {
      if (inStop[i] || inStop[i - 1] || inStop[i + 1] || isGapAfter(i - 1) || isGapAfter(i)) continue;
      const w = vMs[i] > 8 ? 0.25 : 0.15;
      pLat[i] = sl[i] * (1 - 2 * w) + (sl[i - 1] + sl[i + 1]) * w;
      pLon[i] = so[i] * (1 - 2 * w) + (so[i - 1] + so[i + 1]) * w;
    }
  }
  for (const k of Object.keys(TURN_WAYPOINTS)) { const i = Number(k); if (i < N_PTS) { pLat[i] = TURN_WAYPOINTS[k].lat; pLon[i] = TURN_WAYPOINTS[k].lon; } }
  // The strike instant: the Atlas reaches IMPACT_POINT partway through the second before the first zero-speed fix.
  const STRIKE_T_IMP = (IMPACT_GLOBAL_INDEX >= 1 && vMs[IMPACT_GLOBAL_INDEX - 1] > 0)
    ? metresBetween(pLat[IMPACT_GLOBAL_INDEX - 1], pLon[IMPACT_GLOBAL_INDEX - 1], IMPACT_POINT.lat, IMPACT_POINT.lon) / vMs[IMPACT_GLOBAL_INDEX - 1] : 0;
  const STRIKE_G = IMPACT_GLOBAL_INDEX - 1 + Math.min(1, STRIKE_T_IMP); // global float index of the strike (about 12782.49)
  let IMPACT_REST_END = IMPACT_GLOBAL_INDEX; // last sample of the rest run that follows the impact (before the log gap)
  for (let k = IMPACT_GLOBAL_INDEX; k < N_PTS && inStop[k]; k++) { pLat[k] = IMPACT_POINT.lat; pLon[k] = IMPACT_POINT.lon; IMPACT_REST_END = k; if (isGapAfter(k)) break; }

  for (let i = 0; i < N_PTS; i++) if (inStop[i] === 2) inStop[i] = 1;
  // Path length and speed-integrated distance
  const segLen = new Float64Array(N_PTS), S = new Float64Array(N_PTS), Dv = new Float64Array(N_PTS);
  for (let i = 0; i < N_PTS - 1; i++) {
    segLen[i] = metresBetween(pLat[i], pLon[i], pLat[i + 1], pLon[i + 1]);
    S[i + 1] = S[i] + segLen[i];
    Dv[i + 1] = Dv[i] + (isGapAfter(i) ? segLen[i] : 0.5 * (vMs[i] + vMs[i + 1]) * dtArr[i]);
  }
  // Drift between the two (GPS position error accumulating against the speed integral): smooth it over ~15 s
  // within each gap-free block, and pin it exactly at anchors (stops, the impact, block edges).
  const eRaw = new Float64Array(N_PTS), eSmooth = new Float64Array(N_PTS), eFinal = new Float64Array(N_PTS);
  for (let i = 0; i < N_PTS; i++) eRaw[i] = S[i] - Dv[i];
  {
    const W = 7;
    for (let i = 0; i < N_PTS; i++) {
      let sum = 0, n = 0;
      for (let j = i - W; j <= i + W; j++) {
        if (j < 0 || j >= N_PTS) continue;
        let ok = true;
        for (let m = Math.min(i, j); m < Math.max(i, j); m++) if (isGapAfter(m)) { ok = false; break; }
        if (!ok) continue;
        sum += eRaw[j]; n++;
      }
      eSmooth[i] = n ? sum / n : eRaw[i];
    }
    const isAnchor = i => inStop[i] || i === IMPACT_GLOBAL_INDEX || i === IMPACT_GLOBAL_INDEX - 1 || i === 0 || i === N_PTS - 1 || (i > 0 && isGapAfter(i - 1)) || isGapAfter(i);
    const anchorDist = new Float64Array(N_PTS);
    let last = -1e9;
    for (let i = 0; i < N_PTS; i++) { if (isAnchor(i)) last = i; anchorDist[i] = i - last; }
    let next = 1e9;
    for (let i = N_PTS - 1; i >= 0; i--) { if (isAnchor(i)) next = i; anchorDist[i] = Math.min(anchorDist[i], next - i); }
    for (let i = 0; i < N_PTS; i++) {
      const x = Math.min(1, anchorDist[i] / 8);
      const taper = 1 - x * x * (3 - 2 * x);
      eFinal[i] = eSmooth[i] + (eRaw[i] - eSmooth[i]) * taper;
    }
  }

  // Reversing: where the path doubles back (direction change over 120 degrees) at low speed the vehicle is
  // backing up, so the heading is held instead of flipping with the direction of travel.
  const reverseSeg = new Uint8Array(N_PTS);
  {
    let lastDir = null;
    for (let i = 0; i < N_PTS - 1; i++) {
      if (segLen[i] < 0.3) continue;
      const dir = bearingDeg({ lat: pLat[i], lon: pLon[i] }, { lat: pLat[i + 1], lon: pLon[i + 1] });
      if (lastDir !== null) {
        const dd = Math.abs(((dir - lastDir) % 360 + 540) % 360 - 180);
        if (dd > 120 && vMs[i] < 6 && vMs[i + 1] < 6) { reverseSeg[i] = 1; continue; }
      }
      lastDir = dir;
    }
  }
  // Centripetal Catmull-Rom through the de-jittered fixes (no overshoot where spacing changes)
  function pathSegmentAt(d) {
    if (d <= 0) return 0;
    if (d >= S[N_PTS - 1]) return N_PTS - 2;
    let lo = 0, hi = N_PTS - 2;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (S[mid] <= d) lo = mid; else hi = mid - 1; }
    return lo;
  }
  function distinctBefore(k) { let j = k - 1; for (let n = 0; j > 0 && n < 400 && metresBetween(pLat[j], pLon[j], pLat[k], pLon[k]) < 0.3; n++) j--; return Math.max(0, j); }
  function distinctAfter(k) { let j = k + 1; for (let n = 0; j < N_PTS - 1 && n < 400 && metresBetween(pLat[j], pLon[j], pLat[k], pLon[k]) < 0.3; n++) j++; return Math.min(N_PTS - 1, j); }
  function pathPointOnSegment(k, u) {
    const gi = i => Math.max(0, Math.min(N_PTS - 1, i));
    const kb = distinctBefore(k), ka = distinctAfter(gi(k + 1));
    const y0 = pLat[kb], x0 = pLon[kb], y1 = pLat[gi(k)], x1 = pLon[gi(k)];
    const y2 = pLat[gi(k + 1)], x2 = pLon[gi(k + 1)], y3 = pLat[ka], x3 = pLon[ka];
    if (segLen[k] < 0.05) return [y1, x1];
    const kn = (ya, xa, yb, xb) => Math.max(1e-3, Math.sqrt(metresBetween(ya, xa, yb, xb)));
    const t0 = 0, t1 = t0 + kn(y0, x0, y1, x1), t2 = t1 + kn(y1, x1, y2, x2), t3 = t2 + kn(y2, x2, y3, x3);
    const t = t1 + (t2 - t1) * Math.max(0, Math.min(1, u));
    const mix = (a, b, ta, tb) => { const f = (t - ta) / (tb - ta); return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; };
    const P0 = [y0, x0], P1 = [y1, x1], P2 = [y2, x2], P3 = [y3, x3];
    const A1 = mix(P0, P1, t0, t1), A2 = mix(P1, P2, t1, t2), A3 = mix(P2, P3, t2, t3);
    const B1 = mix(A1, A2, t0, t2), B2 = mix(A2, A3, t1, t3);
    return mix(B1, B2, t1, t2);
  }
  function pathPointAt(d) {
    const k = pathSegmentAt(d);
    const u = segLen[k] > 0 ? (d - S[k]) / segLen[k] : 0;
    return pathPointOnSegment(k, u);
  }
  function pathHeadingAt(d) {
    const dMax = S[N_PTS - 1];
    const probe = (d0, d1) => {
      const a = pathPointAt(Math.max(0, d0)), b = pathPointAt(Math.min(dMax, d1));
      return metresBetween(a[0], a[1], b[0], b[1]) < 0.3 ? null : bearingDeg({ lat: a[0], lon: a[1] }, { lat: b[0], lon: b[1] });
    };
    return probe(d - 1.5, d + 1.5) || probe(d, d + 3.0) || probe(d - 3.0, d) || null;
  }
  // Stops: the heading while stopped is the chord across the stop (8 m before to 8 m after), which is immune to
  // the metre or so of lateral scatter in the stop fixes; the per-second heading interpolation eases into it.
  const stopHead = new Float32Array(N_PTS);
  for (let i = 0; i < N_PTS;) {
    if (!inStop[i]) { i++; continue; }
    let j = i; while (j + 1 < N_PTS && inStop[j + 1] && !isGapAfter(j)) j++;
    const dStop = S[i], dMax = S[N_PTS - 1];
    const a = pathPointAt(Math.max(0, dStop - 8)), b = pathPointAt(Math.min(dMax, dStop + 8));
    let h = metresBetween(a[0], a[1], b[0], b[1]) < 0.5 ? null : bearingDeg({ lat: a[0], lon: a[1] }, { lat: b[0], lon: b[1] });
    if (h === null) { const c = pathPointAt(Math.max(0, dStop - 8)); h = metresBetween(c[0], c[1], pLat[i], pLon[i]) < 0.5 ? (i > 0 ? (allPoints[i - 1].hd || 0) : 0) : bearingDeg({ lat: c[0], lon: c[1] }, { lat: pLat[i], lon: pLon[i] }); }
    for (let k = i; k <= j; k++) stopHead[k] = h;
    i = j + 1;
  }
  function blendHeading(from, to, w) { let dh = ((to - from) % 360 + 540) % 360 - 180; return ((from + dh * w) % 360 + 360) % 360; }
  // Heading at each sample, carried through stops. From the impact to the end of the rest run the heading is
  // IMPACT_HEADING (due north: the client's account, the dossier and the post-crash dashcam frames).
  const IMPACT_HEADING = 0.0; // client's account and the dossier: facing due north into the SH 121 ramp at impact
  const hdArr = new Float32Array(N_PTS);
  { let last = allPoints[0].hd || 0;
    for (let i = 0; i < N_PTS; i++) {
      if (i >= IMPACT_GLOBAL_INDEX && i <= IMPACT_REST_END) { hdArr[i] = IMPACT_HEADING; last = IMPACT_HEADING; continue; }
      if (inStop[i]) { hdArr[i] = stopHead[i]; last = stopHead[i]; continue; }
      if (reverseSeg[i] || (i > 0 && reverseSeg[i - 1])) { hdArr[i] = last; continue; }
      const h = pathHeadingAt(S[i]); if (h !== null) last = h; hdArr[i] = last;
    } }

  // Vehicle state along the path at a global float index
  function motionAt(g) {
    const i = Math.max(0, Math.min(N_PTS - 2, Math.floor(g)));
    const tau = Math.min(1, Math.max(0, g - i));
    let d, v;
    let shove = 0; // fraction of the sideways shove applied (0 before impact, 1 once at rest)
    if (i === IMPACT_GLOBAL_INDEX - 1) {
      // The impact second: speed held along the path to the strike point, then the move to the rest point over
      // SHOVE_SEC (how the vehicle actually moved is unrecorded), then rest.
      const v0 = vMs[i], tImp = Math.min(1, STRIKE_T_IMP);
      if (tau <= tImp) { d = S[i] + v0 * tau; v = v0; }
      else if (tau <= tImp + SHOVE_SEC) { const q = (tau - tImp) / SHOVE_SEC; d = S[i + 1]; v = 0; shove = 1 - (1 - q) * (1 - q); }
      else { d = S[i + 1]; v = 0; shove = 1; }
    } else if (g >= IMPACT_GLOBAL_INDEX && i <= IMPACT_REST_END) {
      // the move to the rest point may still be under way in the first part of the second after the strike
      const q = Math.min(1, Math.max(0, (g - STRIKE_G) / SHOVE_SEC));
      d = S[i]; v = 0; shove = 1 - (1 - q) * (1 - q);
    } else if (isGapAfter(i)) {
      d = S[i] + segLen[i] * tau; v = vMs[i] + (vMs[i + 1] - vMs[i]) * tau;
    } else if (inStop[i] && inStop[i + 1]) {
      d = S[i]; v = 0;
    } else {
      const v0 = vMs[i], v1 = vMs[i + 1];
      const dv = Dv[i] + (v0 * tau + 0.5 * (v1 - v0) * tau * tau) * dtArr[i];
      const ec = eFinal[i] + (eFinal[i + 1] - eFinal[i]) * tau;
      d = dv + ec; v = v0 + (v1 - v0) * tau;
    }
    d = Math.max(S[Math.max(0, i - 1)] - 10, Math.min(S[Math.min(N_PTS - 1, i + 2)] + 10, d)); // never wander far from the neighbouring fixes
    const pos = pathPointAt(d);
    if (shove > 0) { pos[0] += SHOVE_DLAT * shove; pos[1] += SHOVE_DLON * shove; }
    // Heading: the per-second path-tangent headings (hdArr: chord across stops, held while reversing) interpolated
    // the short way round, so the vehicle never rotates faster than the fixes say it did; over the impact second it
    // settles onto the rest heading and holds it.
    let hd;
    if (i === IMPACT_GLOBAL_INDEX - 1) {
      const w = Math.min(1, Math.max(0, tau / Math.max(0.1, Math.min(1, STRIKE_T_IMP))));
      hd = blendHeading(hdArr[i], IMPACT_HEADING, w);
    } else if (g >= IMPACT_GLOBAL_INDEX) {
      hd = IMPACT_HEADING;
    } else {
      hd = blendHeading(hdArr[i], hdArr[Math.min(N_PTS - 1, i + 1)], tau);
    }
    return { lat: pos[0], lon: pos[1], hd, vMs: v, d };
  }
  let signalScenario = 'client'; // 'client' (green arrow, opposing red) | 'cr4' (flashing yellow arrow, opposing green)
  let isNightMode = true;        // the collision happened at 05:00 in darkness (CR-4: DARK, LIGHTED)

  // --- State Variables ---
  let activePoints = [];
  let activeStartIndex = 0;
  let activeEndIndex = allPoints.length - 1;

  let currentIndex = 0; // Float index for sub-second smooth interpolation
  let isPlaying = false;
  let playbackSpeed = 1.0;
  let lastFrameTime = performance.now();
  let cameraMode = 'follow'; // 'follow' | 'impact' | 'overview'
  let speedUnit = 'mph'; // 'mph' | 'knots'
  let isDraggingScrubber = false;
  let isTurnScaleEnabled = true;
  let isSkipStopsEnabled = false;
  let isAutoStopImpactEnabled = true;

  let currentZoom = 18.0;
  let targetZoom = 18.0;
  let camLat = null, camLon = null, camLastMs = null; // eased follow-camera centre
  let camSettledMs = 0, camUnsettled = false;         // continuous-zoom bookkeeping (see settleCamera)

  // Continuous zoom without tile churn. map.setView(..., {animate:false}) resets the view, and Leaflet's GridLayer
  // discards every tile on the 'viewprereset' it fires, so calling it once per frame while the zoom glides rebuilt
  // the imagery ~60 times a second (measured 2026-09-04: about 1,000 tile adds and removes per second during the
  // final 20 s, tiles never reaching full opacity: the "flashing" at the end). The follow camera therefore moves
  // the way Leaflet's own pinch-zoom handler does (map._move with pinch data keeps the loaded tiles and only
  // scales them) and settles the view a few times a second and once more when the zoom comes to rest:
  // a plain 'zoom' event lets the tile layers load the level in view and prune the old one without discarding
  // anything, and zoomend/moveend re-project the vector layers. Leaflet 1.9.4 internals; pinned in index.html.
  function settleCamera(nowMs) {
    map.fire('zoom');
    map._moveEnd(true);
    camSettledMs = nowMs; camUnsettled = false;
  }

  // --- DOM Elements ---
  const mapElement = document.getElementById('map');
  const presetSelect = document.getElementById('presetSelect');
  const mapLayerSelect = document.getElementById('mapLayerSelect');
  const btnTurnScale = document.getElementById('btnTurnScale');
  const btnSkipStops = document.getElementById('btnSkipStops');
  const btnAutoStopImpact = document.getElementById('btnAutoStopImpact');
  const btnPlayPause = document.getElementById('btnPlayPause');
  const btnStepBack = document.getElementById('btnStepBack');
  const btnStepForward = document.getElementById('btnStepForward');
  const btnReplayApproach = document.getElementById('btnReplayApproach');
  const btnDockImpact = document.getElementById('btnDockImpact');
  const btnHeaderImpact = document.getElementById('btnHeaderImpact');
  const btnCamFollow = document.getElementById('camFollow');
  const btnCamImpact = document.getElementById('camImpact');
  const btnCamOverview = document.getElementById('camOverview');
  const speedButtons = document.querySelectorAll('.btn-speed');

  const hudTime = document.getElementById('hudTime');
  const hudSpeedNumber = document.getElementById('hudSpeedNumber');
  const hudCoords = document.getElementById('hudCoords');
  const hudAccel = document.getElementById('hudAccel');
  const hudAltitude = document.getElementById('hudAltitude');
  const hudTurnBadge = document.getElementById('hudTurnBadge');
  const hudTurnRate = document.getElementById('hudTurnRate');
  const hudSteeringAngle = document.getElementById('hudSteeringAngle');
  const hudSedanBadge = document.getElementById('hudSedanBadge');
  const hudSedanDistance = document.getElementById('hudSedanDistance');
  const hudHeadingText = document.getElementById('hudHeadingText');
  const compassNeedleSvg = document.getElementById('compassNeedleSvg');
  const gaugeProgressArc = document.getElementById('gaugeProgressArc');
  const impactAlertBanner = document.getElementById('impactAlertBanner');
  const impactAlertDesc = document.getElementById('impactAlertDesc');
  const unitToggle = document.getElementById('unitToggle');
  const unitMph = document.getElementById('unitMph');
  const unitKnots = document.getElementById('unitKnots');

  // Texas Diamond Signal Phasing Elements
  const westRedLight = document.getElementById('westRedLight');
  const westYellowLight = document.getElementById('westYellowLight');
  const westGreenLight = document.getElementById('westGreenLight');
  const westSignalLabel = document.getElementById('westSignalLabel');

  const u1RedLight = document.getElementById('u1RedLight');
  const u1YellowLight = document.getElementById('u1YellowLight');
  const u1GreenLight = document.getElementById('u1GreenLight');
  const u1SignalLabel = document.getElementById('u1SignalLabel');
  const u2RedLight = document.getElementById('u2RedLight');
  const u2YellowLight = document.getElementById('u2YellowLight');
  const u2GreenLight = document.getElementById('u2GreenLight');
  const u2SignalLabel = document.getElementById('u2SignalLabel');
  const signalPhaseBadge = document.getElementById('signalPhaseBadge');
  const interlockBadge = document.getElementById('interlockBadge');
  const signalInterlockExplain = document.getElementById('signalInterlockExplain');

  let signalMarkerWest = null;
  let signalMarkerU1 = null;
  let signalMarkerU2 = null;

  const speedChartCanvas = document.getElementById('speedChart');
  const chartCtx = speedChartCanvas ? speedChartCanvas.getContext('2d') : null;

  const scrubberTrack = document.getElementById('scrubberTrack');
  const scrubberFill = document.getElementById('scrubberFill');
  const scrubberThumb = document.getElementById('scrubberThumb');
  const milestonesTrack = document.getElementById('milestonesTrack');

  const timeWallClock = document.getElementById('timeWallClock');
  const timeRangeBounds = document.getElementById('timeRangeBounds');
  const progressPct = document.getElementById('progressPct');

  const btnEvidenceReport = document.getElementById('btnEvidenceReport');
  const evidenceModal = document.getElementById('evidenceModal');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const evidenceTableBody = document.getElementById('evidenceTableBody');

  // --- Initialize Leaflet Map ---
  const map = L.map('map', {
    zoomControl: false,
    attributionControl: false,
    zoomSnap: 0 // continuous fractional zoom so the follow camera glides instead of stepping
  }).setView([32.955086, -97.038101], 18);

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  // Map Tile Layers (100% Watermark-Free & API-Key-Free)
  const tileLayers = {
    satellite_hybrid: L.layerGroup([
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19
      }),
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19
      }),
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19
      })
    ]),
    satellite_pure: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19
    }),
    dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd'
    }),
    voyager: L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd'
    }),
    streets: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }),
    // Google Map Tiles API (2D satellite), proxied by server.js so the API key stays server-side.
    google_satellite: L.tileLayer('/gtiles/{z}/{x}/{y}', {
      maxZoom: 21,
      attribution: 'Imagery &copy; Google'
    })
  };

  // Hide secondary callout labels when zoomed out so the intersection is not buried under badges
  function updateCalloutVisibility() { mapElement.classList.toggle('low-zoom', map.getZoom() < 18.75); }
  map.on('zoom zoomend', updateCalloutVisibility);
  updateCalloutVisibility();

  tileLayers.satellite_hybrid.addTo(map);
  let currentLayer = tileLayers.satellite_hybrid;

  // The Google layer is only offered when the server reports a configured GOOGLE_MAPS_API_KEY (see /config.js).
  const googleTilesAvailable = !!(window.APP_CONFIG && window.APP_CONFIG.googleSatelliteTiles);
  if (!googleTilesAvailable) {
    document.querySelectorAll('option[value="google_satellite"]').forEach(opt => opt.remove());
    delete tileLayers.google_satellite;
  } else {
    // Prefer Google imagery when it is available: at this interchange the ArcGIS tiles sit about 2.5 m east of
    // the GPS fixes (the stopped vehicle appears inside the west crosswalk), while Google's imagery puts the same
    // fixes at the stop line. It also zooms to level 21.
    map.removeLayer(tileLayers.satellite_hybrid);
    tileLayers.google_satellite.addTo(map);
    currentLayer = tileLayers.google_satellite;
    document.querySelectorAll('#mapLayerSelect, #mobileMapLayerSelect').forEach(sel => { sel.value = 'google_satellite'; });
  }
  // Google Maps Platform terms require visible attribution while its imagery is shown.
  const googleAttribution = L.control.attribution({ position: 'bottomleft', prefix: false });
  googleAttribution.addAttribution('Imagery &copy; Google');
  map.on('layeradd', (e) => { if (tileLayers.google_satellite && e.layer === tileLayers.google_satellite) googleAttribution.addTo(map); });
  map.on('layerremove', (e) => { if (tileLayers.google_satellite && e.layer === tileLayers.google_satellite) googleAttribution.remove(); });
  if (googleTilesAvailable) googleAttribution.addTo(map);

  // Polyline Paths & Markers Layer Group
  let routePolyline = null;
  let trailPolyline = null;
  let accidentMarker = null;
  let stopMarkersGroup = L.layerGroup().addTo(map);

  // --- Ultra-Compact Precision Black SUV Marker SVG (11x21px footprint) ---
  const suvSvgHtml = `
    <div id="suvContainer" class="suv-marker-container" style="width:14px; height:24px; display:flex; align-items:center; justify-content:center; position:relative;">
      <div class="suv-headlights"></div>
      
      <!-- Amber Turn Signals -->
      <div class="suv-turn-signal left"></div>
      <div class="suv-turn-signal right"></div>

      <svg class="suv-body-svg" style="width:11px; height:21px; display:block;" viewBox="0 0 100 160">
        <!-- Chassis Shadow -->
        <rect x="15" y="10" width="70" height="140" rx="18" fill="#000000" opacity="0.6" filter="blur(3px)" />

        <!-- Front Steerable Wheels -->
        <g id="wheelFrontLeft" class="suv-wheel" style="transform-origin: 18px 30px;">
          <rect x="12" y="20" width="10" height="22" rx="3" fill="#1e293b" stroke="#0f172a" stroke-width="1.5" />
          <rect x="14" y="24" width="6" height="14" rx="2" fill="#475569" />
        </g>
        <g id="wheelFrontRight" class="suv-wheel" style="transform-origin: 82px 30px;">
          <rect x="78" y="20" width="10" height="22" rx="3" fill="#1e293b" stroke="#0f172a" stroke-width="1.5" />
          <rect x="80" y="24" width="6" height="14" rx="2" fill="#475569" />
        </g>

        <!-- Rear Fixed Wheels -->
        <g id="wheelRearLeft">
          <rect x="12" y="118" width="10" height="22" rx="3" fill="#1e293b" stroke="#0f172a" stroke-width="1.5" />
          <rect x="14" y="122" width="6" height="14" rx="2" fill="#475569" />
        </g>
        <g id="wheelRearRight">
          <rect x="78" y="118" width="10" height="22" rx="3" fill="#1e293b" stroke="#0f172a" stroke-width="1.5" />
          <rect x="80" y="122" width="6" height="14" rx="2" fill="#475569" />
        </g>
        
        <!-- SUV Outer Body (Metallic Deep Black) -->
        <rect x="18" y="12" width="64" height="136" rx="16" fill="#12151c" stroke="#2a3245" stroke-width="2" />
        
        <!-- Hood Contour & Highlights -->
        <path d="M 24 35 Q 50 20 76 35" fill="none" stroke="#3b4866" stroke-width="2" />
        <rect x="26" y="16" width="48" height="18" rx="8" fill="#181d27" />

        <!-- Front Bumper: 100% INTACT / ZERO DAMAGE Indicator (Green Highlight) -->
        <path d="M 22 13 L 78 13" stroke="#10b981" stroke-width="4" stroke-linecap="round" />

        <!-- Front Windshield (Reflective Glass) -->
        <path d="M 24 45 L 30 65 L 70 65 L 76 45 Z" fill="#2d3748" stroke="#4a5568" stroke-width="1.5" />
        <path d="M 32 48 L 35 62" stroke="rgba(255,255,255,0.35)" stroke-width="1.5" stroke-linecap="round" />

        <!-- Panoramic Roof / Sunroof -->
        <rect x="30" y="68" width="40" height="34" rx="4" fill="#0d1117" stroke="#2d3748" stroke-width="1" />
        
        <!-- Roof Rails -->
        <rect x="22" y="55" width="4" height="60" rx="2" fill="#4a5568" />
        <rect x="74" y="55" width="4" height="60" rx="2" fill="#4a5568" />

        <!-- 3 O'CLOCK: Right Middle & Rear Passenger Side Impact Zone (Red Flank Highlight) -->
        <rect id="suvRightImpactZone" x="78" y="66" width="7" height="52" rx="2" fill="#ef4444" stroke="#fca5a5" stroke-width="1" />

        <!-- Rear Windshield -->
        <path d="M 28 108 L 32 124 L 68 124 L 72 108 Z" fill="#242c3d" stroke="#374151" stroke-width="1" />

        <!-- Side Mirrors -->
        <rect x="10" y="44" width="8" height="14" rx="3" fill="#0f172a" />
        <rect x="82" y="44" width="8" height="14" rx="3" fill="#0f172a" />

        <!-- Front Headlights (LED Daytime Running Lights) -->
        <polygon points="20,16 28,14 26,22 19,20" fill="#fef08a" />
        <polygon points="80,16 72,14 74,22 81,20" fill="#fef08a" />

        <!-- Rear Tail Lights (Brake Light LEDs) -->
        <rect x="20" y="142" width="14" height="5" rx="2" fill="#dc2626" />
        <rect x="66" y="142" width="14" height="5" rx="2" fill="#dc2626" />
      </svg>
      <div class="suv-brakelights">
        <div class="suv-brakelight-beam"></div>
        <div class="suv-brakelight-beam"></div>
      </div>
    </div>
  `;

  const suvIcon = L.divIcon({
    html: suvSvgHtml,
    className: 'suv-div-icon',
    iconSize: [14, 24],
    iconAnchor: [7, 12]
  });

  let suvMarker = L.marker([32.955086, -97.038101], { icon: suvIcon, zIndexOffset: 1000 }).addTo(map);

  // --- Ultra-Compact Precision White Sedan Marker SVG (10.5x20px footprint) ---
  const sedanSvgHtml = `
    <div id="sedanContainer" class="sedan-marker-container" style="width:14px; height:24px; display:flex; align-items:center; justify-content:center; position:relative;">
      <div class="sedan-headlights"></div>
      <svg class="sedan-body-svg" style="width:10.5px; height:20px; display:block;" viewBox="0 0 100 160">
        <!-- Chassis Shadow -->
        <rect x="15" y="10" width="70" height="140" rx="18" fill="#000000" opacity="0.6" filter="blur(3px)" />

        <!-- Wheels -->
        <rect x="12" y="24" width="8" height="20" rx="3" fill="#1e293b" />
        <rect x="80" y="24" width="8" height="20" rx="3" fill="#1e293b" />
        <rect x="12" y="116" width="8" height="20" rx="3" fill="#1e293b" />
        <rect x="80" y="116" width="8" height="20" rx="3" fill="#1e293b" />

        <!-- White Sedan Outer Body -->
        <rect x="18" y="14" width="64" height="132" rx="15" fill="#f8fafc" stroke="#cbd5e1" stroke-width="2" />

        <!-- 12 O'CLOCK: Distributed Front-End Striking Nose (Red Highlight) -->
        <rect id="sedanFrontImpactZone" x="18" y="12" width="64" height="12" rx="3" fill="#ef4444" stroke="#fca5a5" stroke-width="1.5" />

        <!-- Hood Crease Lines -->
        <path d="M 26 38 Q 50 24 74 38" fill="none" stroke="#e2e8f0" stroke-width="1.5" />

        <!-- Front Windshield -->
        <path d="M 24 48 L 30 66 L 70 66 L 76 48 Z" fill="#334155" stroke="#475569" stroke-width="1.5" />
        <path d="M 32 50 L 35 63" stroke="rgba(255,255,255,0.6)" stroke-width="1.5" stroke-linecap="round" />

        <!-- Roof Panel -->
        <rect x="28" y="68" width="44" height="36" rx="4" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="1" />

        <!-- Rear Windshield -->
        <path d="M 28 106 L 32 120 L 68 120 L 72 106 Z" fill="#334155" stroke="#475569" stroke-width="1.5" />

        <!-- Side Mirrors -->
        <rect x="10" y="46" width="8" height="12" rx="3" fill="#e2e8f0" />
        <rect x="82" y="46" width="8" height="12" rx="3" fill="#e2e8f0" />

        <!-- Front Headlights (Bright Xenon Beam) -->
        <polygon points="20,18 28,16 26,24 19,22" fill="#60a5fa" />
        <polygon points="80,18 72,16 74,24 81,22" fill="#60a5fa" />

        <!-- Rear Tail Lights -->
        <rect x="20" y="138" width="14" height="5" rx="2" fill="#ef4444" />
        <rect x="66" y="138" width="14" height="5" rx="2" fill="#ef4444" />
      </svg>
    </div>
  `;

  const sedanIcon = L.divIcon({
    html: sedanSvgHtml,
    className: 'sedan-div-icon',
    iconSize: [14, 24],
    iconAnchor: [7, 12]
  });

  let sedanMarker = L.marker([32.955086, -97.038101], { icon: sedanIcon, zIndexOffset: 995, opacity: 0 }).addTo(map);

  // --- Preset Ranges Definition ---
  function applyPreset(presetKey, targetGlobalIdx) {
    presetSelect.value = presetKey;
    const mobilePresetSelect = document.getElementById('mobilePresetSelect');
    if (mobilePresetSelect) mobilePresetSelect.value = presetKey;

    if (presetKey === 'accident_focus') {
      // 04:58:00 AM (12648) to 05:02:00 AM (12888)
      activeStartIndex = 12648;
      activeEndIndex = 12888;
    } else if (presetKey === 'pre_crash_leg') {
      // 04:40:00 AM (11568) to 05:09:53 AM (13284)
      activeStartIndex = 11568;
      activeEndIndex = allPoints.length - 1;
    } else {
      // full_journey: 12:13:02 AM (0) to 05:09:53 AM (13284)
      activeStartIndex = 0;
      activeEndIndex = allPoints.length - 1;
    }

    activePoints = allPoints.slice(activeStartIndex, activeEndIndex + 1);
    
    if (typeof targetGlobalIdx === 'number') {
      currentIndex = Math.max(0, Math.min(activePoints.length - 1, targetGlobalIdx - activeStartIndex));
    } else {
      currentIndex = 0;
    }

    timeRangeBounds.textContent = `${activePoints[0].t} - ${activePoints[activePoints.length - 1].t}`;
    
    rebuildMapVisuals();
    renderMilestonePins();
    drawSpeedChart();
    updateUI(currentIndex);

    if (cameraMode === 'overview') {
      fitActiveRouteBounds();
    } else if (cameraMode === 'impact') {
      map.setView([32.955086, -97.038101], 19);
    }
  }

  // --- Build Map Paths & Markers ---
  function rebuildMapVisuals() {
    if (routePolyline) map.removeLayer(routePolyline);
    if (trailPolyline) map.removeLayer(trailPolyline);
    if (accidentMarker) map.removeLayer(accidentMarker);
    stopMarkersGroup.clearLayers();

    const latlngs = activePoints.map(p => [p.lat, p.lon]);

    // Full Route Background Path
    routePolyline = L.polyline(latlngs, {
      color: '#3b82f6',
      weight: 4,
      opacity: 0.45,
      dashArray: '4, 8'
    }).addTo(map);

    // Active Trail Polyline
    trailPolyline = L.polyline([], {
      color: '#06b6d4',
      weight: 4,
      opacity: 0.85
    }).addTo(map);

    // Collision Impact Marker with Shockwave Ring at Right-Flank Contact Interface
    const impactPoint = allPoints[IMPACT_GLOBAL_INDEX] || allPoints.find(p => p.t === '05:00:15 AM');
    if (impactPoint) {
      const impactIconHtml = `
        <div style="position:relative; display:flex; align-items:center; justify-content:center; width:36px; height:36px; margin-left:-18px; margin-top:-18px;">
          <div class="impact-shockwave-ring"></div>
          <div style="width:16px; height:16px; border-radius:50%; background:#ef4444; border:2px solid #fff; box-shadow:0 0 12px #ef4444; z-index:10;"></div>
        </div>
      `;
      const impactIcon = L.divIcon({ html: impactIconHtml, className: 'impact-custom-icon' });
      // Point of physical impact: the BMW front against the Atlas right side (CR-4: 3 o'clock angular; client: centre to rear passenger side)
      accidentMarker = L.marker([32.955086, -97.038085], { icon: impactIcon, zIndexOffset: 990 })
        .addTo(map)
        .bindPopup(`
          <div class="event-popup-content">
            <div class="event-popup-title impact"><i class="fa-solid fa-burst"></i> TWO-VEHICLE COLLISION SITE (ANGULAR, RIGHT FRONT QUARTER)</div>
            <div class="event-popup-desc">
          <strong>Timestamp:</strong> 05:00:15 AM (GPS: first zero-speed fix; impact about 0.4 s earlier)<br>
          <strong>Unit 1 (Client 2025 VW Atlas):</strong> completed the left turn on a green arrow (client's account) and was facing due north into the ramp at impact. It came to rest about 6 m west-south-west of the strike, still inside the intersection and facing north (dashcam GPS stamp 05:09:29: N 32.955074 W 97.038170, the same point the phone log settles on; the post-crash dashcam frames show the frontage road behind and the Bass Pro Dr mast arm ahead). How it moved between the strike and that point is not recorded: the client was unconscious, and the replay simply carries the vehicle from one point to the other. <strong>Front bumper undamaged.</strong> Where the strike landed: client, centre to slightly rear of the passenger side; CR-4 damage entry, <strong>3 o'clock, "right front quarter damage, angular impact"</strong>; photographs of the damage would settle it.<br>
          <strong>Unit 2 (2014 White BMW 550, TX: vdw2544, no proof of financial responsibility on the CR-4):</strong> westbound in the second lane from the median (client's account) at an estimated 45&ndash;50 mph (simulated at 45; not logged). Client's account: it did not slow; she believes the driver was trying to make the yellow. CR-4 damage entry: <strong>12 o'clock distributed front-end impact</strong>.<br>
          <strong>Accounts:</strong> the CR-4 narrative says Unit 1 struck Unit 2 while turning left on a flashing yellow light, its crash diagram draws Unit 1 mid-turn, angled north-east, with its right front corner against Unit 2's front, and its contributing-factor block (marked "investigator's opinion") lists two factors against Unit 1 and none against Unit 2; the client says she was facing north, that both vehicles reached the point at the same instant, and that she held her speed so the strike would land at the centre or rear of the passenger side rather than the front passenger door.
        </div>
          </div>
        `, { className: 'event-map-popup' });
    }

    // Significant Stops Markers inside current view
    stops.forEach((s, idx) => {
      const isInActiveSpan = activePoints.some(p => p.lat === s.lat && p.lon === s.lon);
      if (isInActiveSpan && s.duration_sec >= 20) {
        const stopHtml = `
          <div style="background:#f59e0b; color:#000; font-weight:800; font-size:9px; padding:2px 5px; border-radius:4px; border:1px solid #fff; box-shadow:0 2px 6px rgba(0,0,0,0.6); display:flex; align-items:center; gap:3px;">
            <i class="fa-solid fa-clock"></i> ${(s.duration_sec >= 60 ? (s.duration_sec/60).toFixed(1)+'m' : s.duration_sec+'s')}
          </div>
        `;
        const stopIcon = L.divIcon({ html: stopHtml, className: 'stop-badge-icon' });
        L.marker([s.lat, s.lon], { icon: stopIcon }).addTo(stopMarkersGroup)
          .bindPopup(`
            <div class="event-popup-content">
              <div class="event-popup-title" style="color:#f59e0b;"><i class="fa-solid fa-circle-stop"></i> Stop #${idx+1}</div>
              <div class="event-popup-desc">
                <strong>Duration:</strong> ${s.duration_sec}s (${(s.duration_sec/60).toFixed(1)} mins)<br>
                <strong>Time:</strong> ${s.start_time} to ${s.end_time}<br>
                <strong>Location:</strong> ${s.lat.toFixed(6)}, ${s.lon.toFixed(6)}
              </div>
            </div>
          `, { className: 'event-map-popup' });
      }
    });

    // Add TxDOT Diamond Signal Heads across the Interchange
    if (signalMarkerWest) map.removeLayer(signalMarkerWest);
    if (signalMarkerU1) map.removeLayer(signalMarkerU1);
    if (signalMarkerU2) map.removeLayer(signalMarkerU2);

    // Signal heads are drawn where a driver sees them: on the mast arm across the intersection, over the far side of
    // each approach (owner, 2026-09-04: "ahead of me on the other side"), not at the near-side stop line. Positions
    // were measured on the imagery (ArcGIS z19, shifted 2.5 m west to the GPS/Google frame): the west-terminal head
    // ~29 m east of the west stop line, past the SB frontage road; the eastbound left-turn head ~21 m east of the
    // strike point, past the NB frontage road; the westbound through head ~15 m west of the strike point, past the
    // west edge of the intersection.
    // 1. West Ramp Terminal Signal: the heads hang over the far (east) side of the SB frontage-road crossing; the stop line where the vehicle waited is on the near side
    const signalWestHtml = `
      <div class="map-signal-marker-container" id="mapSignalWestContainer">
        <div class="map-signal-head">
          <div class="map-signal-lens red on" id="mapWestRed"></div>
          <div class="map-signal-lens yellow off" id="mapWestYellow"></div>
          <div class="map-signal-lens green off" id="mapWestGreen"></div>
        </div>
        <div class="map-signal-label" id="mapWestLabel" style="color:#f87171;">WEST: 26s RED</div>
      </div>
    `;
    signalMarkerWest = L.marker([32.955052, -97.041668], {
      icon: L.divIcon({ html: signalWestHtml, className: 'map-signal-icon-west', iconSize: [44, 52], iconAnchor: [22, 26] }),
      zIndexOffset: 960
    }).addTo(map).bindPopup(`
      <div class="event-popup-content">
        <div class="event-popup-title" style="color:#38bdf8;"><i class="fa-solid fa-traffic-light"></i> 1. West Ramp Terminal Signal</div>
        <div class="event-popup-desc">
          <strong>Location:</strong> Bass Pro Dr &amp; TX-121 southbound frontage road. The signal heads hang over the far (east) side of the crossing; the vehicle waited at the near-side stop line about 29 m west of them (GPS: 32.955086, -97.041975).<br>
          <strong>04:59:18 - 04:59:44 AM:</strong> Stopped at 0.0 MPH for 26.0s on <strong>SOLID RED</strong>.<br>
          <strong>04:59:45 AM:</strong> Light turned <strong>SOLID GREEN</strong>, releasing your vehicle to cross the 1,200 ft bridge over SH 121.
        </div>
      </div>
    `, { className: 'event-map-popup' });

    // 2. East Ramp Terminal Left Turn Signal
    const signalU1Html = `
      <div class="map-signal-marker-container" id="mapSignalU1Container">
        <div class="map-signal-head">
          <div class="map-signal-lens red off" id="mapU1Red"></div>
          <div class="map-signal-lens yellow off" id="mapU1Yellow"></div>
          <div class="map-signal-lens yellow flashing off" id="mapU1Flash" title="Flashing yellow arrow section (four-section FYA head)"></div>
          <div class="map-signal-lens green on" id="mapU1Green"></div>
        </div>
        <div class="map-signal-label" id="mapU1Label" style="color:#34d399;">TURN GREEN</div>
      </div>
    `;
    signalMarkerU1 = L.marker([32.955065, -97.037891], {
      icon: L.divIcon({ html: signalU1Html, className: 'map-signal-icon-u1', iconSize: [40, 60], iconAnchor: [20, 30] }),
      zIndexOffset: 950
    }).addTo(map).bindPopup(`
      <div class="event-popup-content">
        <div class="event-popup-title" style="color:#10b981;"><i class="fa-solid fa-traffic-light"></i> Unit 1 Turn Bay Signal (TxDOT Phase 1)</div>
        <div class="event-popup-desc">
          Controls the dual left-turn lanes onto the northbound SH 121 entrance ramp. The <strong>Protected Green Arrow</strong> illuminated at 05:00:11 AM as your vehicle passed over the painted white pavement turn arrow.
        </div>
      </div>
    `, { className: 'event-map-popup' });

    // 2b. White Pavement Turn Arrow Marker (Google Street View Match)
    const arrowPavementHtml = `
      <div style="background:rgba(15,23,42,0.92); border:1.5px solid #38bdf8; border-radius:6px; padding:2px 6px; box-shadow:0 3px 8px rgba(0,0,0,0.6); display:flex; align-items:center; gap:4px; font-size:9.5px; font-weight:800; color:#38bdf8; white-space:nowrap;">
        <i class="fa-solid fa-arrow-left" style="color:#fff;"></i> White Pavement Arrow (client: green arrow at 05:00:11 AM)
      </div>
    `;
    L.marker([32.955030, -97.038380], {
      icon: L.divIcon({ html: arrowPavementHtml, className: 'pavement-arrow-marker', iconSize: [160, 22], iconAnchor: [80, 11] }),
      zIndexOffset: 940
    }).addTo(map).bindPopup(`
      <div class="event-popup-content">
        <div class="event-popup-title" style="color:#38bdf8;"><i class="fa-solid fa-road"></i> Painted Pavement Left-Turn Arrow (05:00:11 AM)</div>
        <div class="event-popup-desc">
          <strong>Street View Confirmation:</strong> Matches the white turn arrow painted on the concrete lane in your photo.<br>
          <strong>05:00:05 - 05:00:10 AM:</strong> Driver decelerated from 39.1 to 27 MPH because the through signals ahead displayed amber, then red; the left-turn arrow stayed red until they cleared (client's account).<br>
          <strong>05:00:11 AM:</strong> Right as the front tires crossed this pavement marking, the overhead <strong>Green Arrow</strong> illuminated (client's account), and the driver entered the turn without stopping at about 20 mph (GPS: 22.8 to 19.8 mph over 05:00:12&ndash;05:00:14).
        </div>
      </div>
    `, { className: 'event-map-popup' });

    // 2c. Driver's Perspective / Point of Inevitable Collision (Google Street View Match)
    const perspectiveHtml = `
      <div style="background:rgba(220,38,38,0.92); border:1.5px solid #fff; border-radius:6px; padding:2px 6px; box-shadow:0 3px 8px rgba(0,0,0,0.6); display:flex; align-items:center; gap:4px; font-size:9.5px; font-weight:800; color:#fff; white-space:nowrap;">
        <i class="fa-solid fa-eye"></i> Driver Viewpoint (client's account, 05:00:14 AM)
      </div>
    `;
    L.marker([32.955075, -97.038105], {
      icon: L.divIcon({ html: perspectiveHtml, className: 'driver-view-marker', iconSize: [210, 22], iconAnchor: [105, 11] }),
      zIndexOffset: 945
    }).addTo(map).bindPopup(`
      <div class="event-popup-content">
        <div class="event-popup-title" style="color:#ef4444;"><i class="fa-solid fa-eye"></i> Driver Viewpoint at 05:00:14 AM (client's account)</div>
        <div class="event-popup-desc">
          <strong>Orientation:</strong> Facing due north into the SH 121 ramp at impact (client's account and dossier; the post-crash dashcam frames look north at the Bass Pro Dr mast arm with the frontage road behind). The GPS fixes before and at the impact are 3.7 m apart, too close to fix a heading on their own. The vehicle came to rest about 6 m west-south-west of the strike (dashcam GPS 05:09:29 and the phone log agree); whether it spun or slid to get there is not recorded.<br>
          <strong>Eyewitness Observation:</strong> Looking east through the right window past Waffle House / Shell, the driver saw the white BMW coming on in the second westbound lane from the median at what felt like 45 to 50 mph; it was a little behind the stop line when she expected it to stop, and it did not.<br>
          <strong>What she saw (client's account):</strong> the far-side heads for the northbound frontage road ahead of her showing red, and the BMW to her right; no signal faces the ramp from the right because the frontage road is one-way. She watched the BMW, judged it had time to stop, and when she saw it was accelerating rather than stopping she knew it would hit her and braced. Committed to the turn with curbs ahead, she held her speed and carried on past its path so the strike would land at the reinforced centre or slightly rear of the passenger side rather than the front passenger door. Both vehicles reached the point at the same moment. She was unconscious from the impact and does not know how the car moved afterwards.
        </div>
      </div>
    `, { className: 'event-map-popup' });

    const signalU2Html = `
      <div class="map-signal-marker-container" id="mapSignalU2Container">
        <div class="map-signal-head">
          <div class="map-signal-lens red on" id="mapU2Red"></div>
          <div class="map-signal-lens yellow off" id="mapU2Yellow"></div>
          <div class="map-signal-lens green off" id="mapU2Green"></div>
        </div>
        <div class="map-signal-label" id="mapU2Label" style="color:#f87171;">THRU RED</div>
      </div>
    `;
    signalMarkerU2 = L.marker([32.955137, -97.038253], {
      icon: L.divIcon({ html: signalU2Html, className: 'map-signal-icon-u2', iconSize: [40, 50], iconAnchor: [20, 25] }),
      zIndexOffset: 950
    }).addTo(map).bindPopup(`
      <div class="event-popup-content">
        <div class="event-popup-title" style="color:#ef4444;"><i class="fa-solid fa-traffic-light"></i> Unit 2 Westbound Signal (TxDOT Phase 2)</div>
        <div class="event-popup-desc">
          Controls the westbound through lanes along Bass Pro Dr. Under Texas Diamond controller logic, this signal was <strong>Forced SOLID RED</strong> while Unit 1 had the protected green arrow.
        </div>
      </div>
    `, { className: 'event-map-popup' });

    // 2d. TxDOT Regional ITS Monitoring Camera ("SH121 @ Bass Pro")
    const itsCameraHtml = `
      <div style="background:rgba(15,23,42,0.92); border:1.5px solid #38bdf8; border-radius:6px; padding:2px 6px; box-shadow:0 3px 8px rgba(0,0,0,0.6); display:flex; align-items:center; gap:4px; font-size:9.5px; font-weight:800; color:#38bdf8; white-space:nowrap;">
        <i class="fa-solid fa-video" style="color:#38bdf8;"></i> TxDOT ITS Camera (SH121 @ Bass Pro)
      </div>
    `;
    L.marker([32.955520, -97.038420], {
      icon: L.divIcon({ html: itsCameraHtml, className: 'its-camera-marker', iconSize: [175, 22], iconAnchor: [87, 11] }),
      zIndexOffset: 935
    }).addTo(map).bindPopup(`
      <div class="event-popup-content">
        <div class="event-popup-title" style="color:#38bdf8;"><i class="fa-solid fa-video"></i> TxDOT ITS Monitoring Camera</div>
        <div class="event-popup-desc">
          <strong>Camera Feed:</strong> <code>SH121 @ Bass Pro</code> (<code>SH121.Bass Pro.SB</code>)<br>
          <strong>Custodian:</strong> TxDOT Fort Worth District TMC (2501 SW Loop 820 · Contact: Michael Peters 817-370-6846).<br>
          <strong>Critical Action:</strong> Formal preservation letter served to prevent standard 72h–7d loop overwrite.
        </div>
      </div>
    `, { className: 'event-map-popup' });

    // 2e. Shell Gas Station Surveillance Cameras
    const shellCameraHtml = `
      <div style="background:rgba(15,23,42,0.92); border:1.5px solid #f59e0b; border-radius:6px; padding:2px 6px; box-shadow:0 3px 8px rgba(0,0,0,0.6); display:flex; align-items:center; gap:4px; font-size:9.5px; font-weight:800; color:#f59e0b; white-space:nowrap;">
        <i class="fa-solid fa-gas-pump" style="color:#f59e0b;"></i> Shell Surveillance (2000 W Bethel)
      </div>
    `;
    L.marker([32.955220, -97.037150], {
      icon: L.divIcon({ html: shellCameraHtml, className: 'shell-camera-marker', iconSize: [165, 22], iconAnchor: [82, 11] }),
      zIndexOffset: 930
    }).addTo(map).bindPopup(`
      <div class="event-popup-content">
        <div class="event-popup-title" style="color:#f59e0b;"><i class="fa-solid fa-gas-pump"></i> Shell Gas Station Surveillance</div>
        <div class="event-popup-desc">
          <strong>Address:</strong> 2000 W Bethel Rd, Grapevine, TX · (817) 421-2295.<br>
          <strong>Coverage:</strong> Exterior canopy/pumps face west along Bass Pro Dr / Bethel Rd, capturing BMW approach and speed before impact.<br>
          <strong>Action:</strong> Certified spoliation notice delivered for 04:50–05:15 AM video.
        </div>
      </div>
    `, { className: 'event-map-popup' });

    // 2f. NEMA TS2 Master Cabinet & MMU Interlock Callout
    const mmuCabinetHtml = `
      <div style="background:rgba(15,23,42,0.92); border:1.5px solid #10b981; border-radius:6px; padding:2px 6px; box-shadow:0 3px 8px rgba(0,0,0,0.6); display:flex; align-items:center; gap:4px; font-size:9.5px; font-weight:800; color:#10b981; white-space:nowrap;">
        <i class="fa-solid fa-microchip" style="color:#10b981;"></i> NEMA TS2 Master Cabinet (MMU Interlock)
      </div>
    `;
    L.marker([32.954920, -97.038100], {
      icon: L.divIcon({ html: mmuCabinetHtml, className: 'mmu-cabinet-marker', iconSize: [195, 22], iconAnchor: [97, 11] }),
      zIndexOffset: 925
    }).addTo(map).bindPopup(`
      <div class="event-popup-content">
        <div class="event-popup-title" style="color:#10b981;"><i class="fa-solid fa-microchip"></i> NEMA TS2 Malfunction Management Unit (MMU)</div>
        <div class="event-popup-desc">
          <strong>Hardware Interlock:</strong> The cabinet's Malfunction Management Unit monitors signal-head voltages and forces all-red flash if conflicting <em>green</em> indications ever appear together (e.g. a green left arrow with an opposing green ball).<br>
          <strong>What it does not rule out:</strong> The eastbound left-turn head here is a four-section flashing-yellow-arrow (FYA) head (binder 09 Street View exhibit). A flashing yellow arrow shown while opposing through traffic is green is the designed permissive interval, not a conflict. Whether this head showed a steady green arrow or a flashing yellow arrow at 05:00:11&ndash;05:00:15 depends on the controller's time-of-day plan and event logs (TPIA request drafted, binder 11).
        </div>
      </div>
    `, { className: 'event-map-popup' });

    // 2g. Aloft Hotel Uber Pickup Route Destination Beacon
    const aloftBeaconHtml = `
      <div style="background:rgba(15,23,42,0.92); border:1.5px solid #a855f7; border-radius:6px; padding:2px 6px; box-shadow:0 3px 8px rgba(0,0,0,0.6); display:flex; align-items:center; gap:4px; font-size:9.5px; font-weight:800; color:#a855f7; white-space:nowrap;">
        <i class="fa-solid fa-hotel" style="color:#a855f7;"></i> Pickup: Aloft Hotel (client's account, Period 2)
      </div>
    `;
    L.marker([32.956600, -97.037800], {
      icon: L.divIcon({ html: aloftBeaconHtml, className: 'aloft-beacon-marker', iconSize: [185, 22], iconAnchor: [92, 11] }),
      zIndexOffset: 920
    }).addTo(map).bindPopup(`
      <div class="event-popup-content">
        <div class="event-popup-title" style="color:#a855f7;"><i class="fa-solid fa-hotel"></i> Accepted Uber Dispatch Destination</div>
        <div class="event-popup-desc">
          <strong>Pickup (client's account):</strong> an accepted reservation pickup at the Aloft Dallas DFW Airport Grapevine (1033 N Main St / N SH 121); the rider canceled after the collision.<br>
          <strong>What the receipt shows:</strong> UberX &middot; Aug 28, 2026 &middot; 5:05 AM, upfront fare $12.07, $0.00 collected, pickup and drop-off both &ldquo;N State Highway 121, Coppell&rdquo;. Accept and cancel times are not printed; Uber's trip log is needed to corroborate.
        </div>
      </div>
    `, { className: 'event-map-popup' });
  }

  // --- Render Timeline Milestone Marker Pins ---
  function renderMilestonePins() {
    milestonesTrack.innerHTML = '';
    if (activePoints.length === 0) return;

    const startTs = activeStartIndex;
    const endTs = activeEndIndex;
    const rangeLen = endTs - startTs;

    milestones.forEach(m => {
      if (m.index >= startTs && m.index <= endTs) {
        const pct = ((m.index - startTs) / rangeLen) * 100;
        const pin = document.createElement('div');
        pin.className = `milestone-pin ${m.type}`;
        pin.style.left = `${pct}%`;
        pin.title = `${m.time}: ${m.title} (${m.desc})`;
        
        const dot = document.createElement('div');
        dot.className = 'pin-dot';
        pin.appendChild(dot);

        pin.addEventListener('click', (e) => {
          e.stopPropagation();
          seekToGlobalIndex(m.index);
        });

        milestonesTrack.appendChild(pin);
      }
    });
  }

  // --- Speed Profile Chart (Canvas Rendering) ---
  function drawSpeedChart() {
    if (!speedChartCanvas || !chartCtx || activePoints.length === 0) return;
    
    const rect = speedChartCanvas.getBoundingClientRect();
    speedChartCanvas.width = rect.width * window.devicePixelRatio;
    speedChartCanvas.height = rect.height * window.devicePixelRatio;

    chartCtx.save();
    chartCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
    const w = rect.width;
    const h = rect.height;

    chartCtx.clearRect(0, 0, w, h);

    const maxSpd = Math.max(30, ...activePoints.map(p => p.spd));

    // Area gradient
    const grad = chartCtx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(59, 130, 246, 0.4)');
    grad.addColorStop(0.8, 'rgba(6, 182, 212, 0.05)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    chartCtx.beginPath();
    chartCtx.moveTo(0, h);

    const n = activePoints.length;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * w;
      const y = h - (activePoints[i].spd / maxSpd) * (h - 6);
      if (i === 0) chartCtx.lineTo(x, y);
      else chartCtx.lineTo(x, y);
    }

    chartCtx.lineTo(w, h);
    chartCtx.closePath();
    chartCtx.fillStyle = grad;
    chartCtx.fill();

    // Speed Line Stroke
    chartCtx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * w;
      const y = h - (activePoints[i].spd / maxSpd) * (h - 6);
      if (i === 0) chartCtx.moveTo(x, y);
      else chartCtx.lineTo(x, y);
    }
    chartCtx.strokeStyle = '#38bdf8';
    chartCtx.lineWidth = 1.5;
    chartCtx.stroke();

    // Mark Impact Moment if present
    const impactIdxInActive = activePoints.findIndex(p => p.t === '05:00:15 AM');
    if (impactIdxInActive !== -1) {
      const ix = (impactIdxInActive / (n - 1)) * w;
      chartCtx.strokeStyle = '#ef4444';
      chartCtx.lineWidth = 2;
      chartCtx.setLineDash([3, 3]);
      chartCtx.beginPath();
      chartCtx.moveTo(ix, 0);
      chartCtx.lineTo(ix, h);
      chartCtx.stroke();
      chartCtx.setLineDash([]);

      chartCtx.fillStyle = '#ef4444';
      chartCtx.beginPath();
      chartCtx.arc(ix, 6, 4, 0, Math.PI * 2);
      chartCtx.fill();
    }

    // Active Cursor Vertical Line
    const curX = (currentIndex / Math.max(1, n - 1)) * w;
    chartCtx.strokeStyle = '#ffffff';
    chartCtx.lineWidth = 2;
    chartCtx.beginPath();
    chartCtx.moveTo(curX, 0);
    chartCtx.lineTo(curX, h);
    chartCtx.stroke();

    chartCtx.restore();
  }

  // Speed Chart Click- & Touch-to-Seek
  if (speedChartCanvas) {
    function handleChartSeek(e) {
      const rect = speedChartCanvas.getBoundingClientRect();
      const clientX = e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX;
      const clickX = clientX - rect.left;
      const pct = Math.max(0, Math.min(1, clickX / rect.width));
      currentIndex = pct * (activePoints.length - 1);
      updateUI(currentIndex);
    }

    speedChartCanvas.addEventListener('click', handleChartSeek);
    speedChartCanvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      pausePlayback();
      handleChartSeek(e);
    }, { passive: false });
    speedChartCanvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      handleChartSeek(e);
    }, { passive: false });
  }

  // --- Sub-Second Interpolation, Turn Dynamics & Two-Vehicle Physics ---
  function getInterpolatedState(idxFloat) {
    const idx0 = Math.floor(idxFloat);
    const idx1 = Math.min(activePoints.length - 1, idx0 + 1);
    const ratio = idxFloat - idx0;

    const p0 = activePoints[idx0];
    const p1 = activePoints[idx1];

    if (!p0 || !p1) return getInterpolatedState(Math.max(0, Math.min(activePoints.length - 1, idxFloat || 0)));

    // Position, speed and heading from the motion model (see the precompute above)
    const gNow = activeStartIndex + idxFloat;
    const mo = motionAt(gNow);
    const lat = mo.lat, lon = mo.lon;
    const spd = (Math.floor(gNow) === IMPACT_GLOBAL_INDEX - 1) ? mo.vMs * 2.23694 : p0.spd + (p1.spd - p0.spd) * ratio; // logged speed; through the impact second the model's (held to the strike, then 0)
    const kt = spd / 1.15078;
    const alt = p0.alt + (p1.alt - p0.alt) * ratio;
    const acc = p0.acc + (p1.acc - p0.acc) * ratio;
    const hd = mo.hd;

    // Turn rate (deg/s) from the path heading a fifth of a second either side; steering angle follows it
    let turnRate = 0;
    if (mo.vMs > 0.3 && gNow > 0.25 && gNow < N_PTS - 1.25) {
      const hA = motionAt(gNow - 0.2).hd, hB = motionAt(gNow + 0.2).hd;
      let dh = (hB - hA) % 360;
      if (dh > 180) dh -= 360;
      if (dh < -180) dh += 360;
      turnRate = dh / 0.4;
    }
    const steeringAngle = Math.max(-32, Math.min(32, turnRate * 2.5));

    // Oncoming white BMW (Unit 2, no GPS): a straight westbound line down the centre of the second westbound lane
    // from the median (the client's account of its lane; the lane centre measured on Google zoom-21 imagery, lane
    // lines ~3.6 m apart), at a constant simulated 45 mph (the client's estimate), with no lateral drift toward the Atlas. On that line the
    // BMW's front meets the Atlas's right side about a metre behind the Atlas's centre: the client says she carried
    // on past its path so the strike would land at the reinforced centre or slightly rear of the passenger side.
    // The CR-4 codes the damage as 3 o'clock, "right front quarter damage, angular impact"; photographs of the
    // damage would settle where along the right side the strike landed.
    const currentGlobalIdx = gNow;
    const deltaTToImpact = currentGlobalIdx - STRIKE_G; // <= 0 before the strike (STRIKE_G is about 12782.49)
    const sedanImpactRestLat = 32.955080, sedanImpactRestLon = -97.038073; // front bumper against the Atlas's right side, just behind centre
    const sedanFarLat = 32.955116, sedanFarLon = -97.035397;               // 250 m east along the same lane (road bears ~1° north of east)
    const sedanLaneHeading = bearingDeg({ lat: sedanFarLat, lon: sedanFarLon }, { lat: sedanImpactRestLat, lon: sedanImpactRestLon }); // along its own line (about 269°)
    let sedanLat = sedanImpactRestLat, sedanLon = sedanImpactRestLon, sedanHeading = sedanLaneHeading;
    let sedanVisible = false, sedanDistFt = 0;
    let sedanSpeedMph = deltaTToImpact >= 0 ? 0.0 : 45.0; // simulated; speed not logged (client's estimate "45 pushing 50", did not slow)
    if (deltaTToImpact >= -25.0) {
      sedanVisible = true;
      if (deltaTToImpact < 0) {
        const distM = Math.abs(deltaTToImpact) * 45.0 * 0.44704;
        sedanDistFt = Math.round(distM * 3.28084);
        const r = distM / 250.0;
        sedanLat = sedanImpactRestLat + (sedanFarLat - sedanImpactRestLat) * r;
        sedanLon = sedanImpactRestLon + (sedanFarLon - sedanImpactRestLon) * r;
      }
    }


    return {
      lat,
      lon,
      spd,
      kt,
      alt,
      acc,
      hd,
      turnRate,
      steeringAngle,
      sedanLat,
      sedanLon,
      sedanHeading,
      sedanVisible,
      sedanDistFt,
      sedanSpeedMph,
      deltaTToImpact,
      t: p0.t,
      ts: p0.ts,
      isImpact: (Math.abs(deltaTToImpact) < 0.5 || p0.t === '05:00:15 AM'),
      isBraking: (acc < -1.5 || (spd < 0.5 && idx0 > 0 && activePoints[idx0-1].spd > 0.5)),
      isTurningLeft: (turnRate < -3.5),
      isTurningRight: (turnRate > 3.5),
      isHardTurn: (Math.abs(turnRate) > 8.0)
    };
  }

  // --- Convert Heading to Cardinal String ---
  function getCardinalDirection(angle) {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const idx = Math.round((angle % 360) / 22.5) % 16;
    return directions[idx];
  }

  // --- True-scale vehicle sprites: grow the 24 px sprites to the vehicle's real length at high zoom ---
  function metersPerPixel() {
    return 40075016.686 * Math.abs(Math.cos(map.getCenter().lat * Math.PI / 180)) / (256 * Math.pow(2, map.getZoom()));
  }
  function spriteScale(lengthMeters) {
    const px = lengthMeters / metersPerPixel();
    return Math.max(1, Math.min(5, px / 24)).toFixed(3);
  }

  // --- Signal scenario overlay ---
  // The lights render the client's account by default. The CR-4 narrative (left turn on a flashing yellow
  // arrow while westbound through traffic had green) can be shown instead; neither is controller data.
  function setLens(el, cls) { if (el) el.className = cls; }
  function applySignalScenarioOverlay(gIdx) {
    const u1Flash = document.getElementById('u1FlashLight');
    const mapU1Flash = document.getElementById('mapU1Flash');
    if (signalScenario !== 'cr4' || gIdx < 12773) {
      setLens(u1Flash, 'signal-lens yellow flashing off');
      setLens(mapU1Flash, 'map-signal-lens yellow flashing off');
      return;
    }
    const beforeImpact = gIdx < 12782.8;
    setLens(u1RedLight, 'signal-lens red off');
    setLens(u1YellowLight, 'signal-lens yellow off');
    setLens(u1Flash, 'signal-lens yellow flashing on');
    setLens(u1GreenLight, 'signal-lens green off');
    u1SignalLabel.className = 'signal-state-label yellow';
    u1SignalLabel.textContent = 'FLASHING YELLOW ARROW';
    setLens(u2RedLight, 'signal-lens red off');
    setLens(u2YellowLight, 'signal-lens yellow off');
    setLens(u2GreenLight, 'signal-lens green on');
    u2SignalLabel.className = 'signal-state-label green';
    u2SignalLabel.textContent = 'THROUGH GREEN';
    signalPhaseBadge.className = 'badge-tag signal-badge yellow';
    signalPhaseBadge.textContent = beforeImpact ? 'Permissive FYA (CR-4 narrative)' : 'Collision (CR-4 narrative)';
    interlockBadge.textContent = 'NO CONFLICT';
    interlockBadge.style.color = '#fbbf24';
    signalInterlockExplain.innerHTML = beforeImpact
      ? '<strong>CR-4 narrative:</strong> the left-turn head showed a flashing yellow arrow (permissive turn, yield to oncoming traffic) while westbound through traffic had green. This is the officer\'s account; it is not established by controller data either.'
      : '<strong>CR-4 narrative:</strong> Unit 1 turned on a flashing yellow arrow and failed to yield to Unit 2, which had a green through indication. Which account is right depends on the controller\'s time-of-day plan and event logs.';
    const mapU1Red = document.getElementById('mapU1Red'), mapU1Yellow = document.getElementById('mapU1Yellow'), mapU1Green = document.getElementById('mapU1Green'), mapU1Label = document.getElementById('mapU1Label');
    const mapU2Red = document.getElementById('mapU2Red'), mapU2Yellow = document.getElementById('mapU2Yellow'), mapU2Green = document.getElementById('mapU2Green'), mapU2Label = document.getElementById('mapU2Label');
    setLens(mapU1Red, 'map-signal-lens red off'); setLens(mapU1Yellow, 'map-signal-lens yellow off'); setLens(mapU1Flash, 'map-signal-lens yellow flashing on'); setLens(mapU1Green, 'map-signal-lens green off');
    if (mapU1Label) { mapU1Label.textContent = 'FYA (CR-4)'; mapU1Label.style.color = '#fbbf24'; }
    setLens(mapU2Red, 'map-signal-lens red off'); setLens(mapU2Yellow, 'map-signal-lens yellow off'); setLens(mapU2Green, 'map-signal-lens green on');
    if (mapU2Label) { mapU2Label.textContent = 'THROUGH GREEN'; mapU2Label.style.color = '#34d399'; }
  }

  // --- Update HUD, Animated Vehicles & Camera Scaling ---
  function updateUI(idxFloat) {
    if (activePoints.length === 0) return;

    const state = getInterpolatedState(idxFloat);

    // 1. Black SUV Position & Heading
    suvMarker.setLatLng([state.lat, state.lon]);
    const suvElem = document.getElementById('suvContainer');
    if (suvElem) {
      suvElem.style.transform = `rotate(${state.hd}deg) scale(${spriteScale(5.10)})`; // 2025 Atlas: 5.10 m long
      
      if (state.isBraking) suvElem.classList.add('braking');
      else suvElem.classList.remove('braking');

      const wheelLeft = document.getElementById('wheelFrontLeft');
      const wheelRight = document.getElementById('wheelFrontRight');
      if (wheelLeft && wheelRight) {
        wheelLeft.style.transform = `rotate(${state.steeringAngle}deg)`;
        wheelRight.style.transform = `rotate(${state.steeringAngle}deg)`;
      }

      if (state.isTurningLeft) {
        suvElem.classList.add('blinking-left');
        suvElem.classList.remove('blinking-right');
      } else if (state.isTurningRight) {
        suvElem.classList.add('blinking-right');
        suvElem.classList.remove('blinking-left');
      } else {
        suvElem.classList.remove('blinking-left');
        suvElem.classList.remove('blinking-right');
      }
    }

    // 2. Oncoming White Sedan Position & Rotation
    if (state.sedanVisible) {
      sedanMarker.setLatLng([state.sedanLat, state.sedanLon]);
      sedanMarker.setOpacity(1.0);
      const sedanElem = document.getElementById('sedanContainer');
      if (sedanElem) {
        sedanElem.style.transform = `rotate(${state.sedanHeading}deg) scale(${spriteScale(4.91)})`; // BMW 550 (F10): 4.91 m long
      }
    } else {
      sedanMarker.setOpacity(0.0);
    }

    // 3. Trail Polyline Update
    const currentIntIdx = Math.floor(idxFloat);
    const trailCoords = activePoints.slice(0, currentIntIdx + 1).map(p => [p.lat, p.lon]);
    trailCoords.push([state.lat, state.lon]);
    trailPolyline.setLatLngs(trailCoords);

    // 4. Dynamic Camera Tracking & Turn Scaling
    if (cameraMode === 'follow') {
      // Continuous camera: zoom is a smooth function of speed (closer when slow), with a steady zoom-in over the
      // last 20 s before impact; the centre leads the vehicle a little and both ease in simulation time, so the
      // view never steps when speed crosses a threshold. Snaps only when the vehicle is far away (a seek).
      const gCam = activeStartIndex + idxFloat;
      const nowMs = performance.now();
      const dtReal = camLastMs === null ? 0.016 : Math.min(0.1, (nowMs - camLastMs) / 1000);
      camLastMs = nowMs;
      const dtSim = dtReal * Math.max(1, playbackSpeed);
      const lookaheadMeters = isTurnScaleEnabled ? Math.min(40, Math.max(6, state.spd * 0.6)) : 0;
      const headingRad = (state.hd * Math.PI) / 180;
      const targetLat = state.lat + (lookaheadMeters * Math.cos(headingRad)) / 111320;
      const targetLon = state.lon + (lookaheadMeters * Math.sin(headingRad)) / (111320 * Math.cos((state.lat * Math.PI) / 180));
      let zTarget = map.getZoom();
      if (isTurnScaleEnabled) {
        zTarget = Math.max(17.2, Math.min(19.6, 19.6 - 0.05 * state.spd));
        const toImpact = IMPACT_GLOBAL_INDEX - gCam;
        if (toImpact <= 20) {
          const x = Math.min(1, Math.max(0, (20 - toImpact) / 20));
          const ease = x * x * (3 - 2 * x);
          zTarget = zTarget + (19.9 - zTarget) * ease;
        }
      }
      if (camLat === null || metresBetween(camLat, camLon, targetLat, targetLon) > 250) {
        camLat = targetLat; camLon = targetLon; currentZoom = zTarget;
      } else {
        const kC = 1 - Math.exp(-dtSim / 0.35);
        camLat += (targetLat - camLat) * kC;
        camLon += (targetLon - camLon) * kC;
        const kZ = 1 - Math.exp(-dtSim / 1.5);
        currentZoom += (zTarget - currentZoom) * kZ;
      }
      // The tile layers cap the usable zoom (ArcGIS 19, Google 21); setView used to clamp silently, _move does not.
      const zApply = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), currentZoom));
      if (isTurnScaleEnabled && Math.abs(map.getZoom() - zApply) > 0.002) {
        map._move(L.latLng(camLat, camLon), zApply, { pinch: true, round: false });
        camUnsettled = true;
        if (nowMs - camSettledMs > 250) settleCamera(nowMs);
      } else {
        if (camUnsettled) settleCamera(nowMs);
        map.panTo([camLat, camLon], { animate: false });
      }
    }

    // 5. Telematics HUD Updates
    hudTime.textContent = state.t;
    timeWallClock.textContent = state.t;

    // Speedometer Digital + Gauge Arc
    const displaySpd = speedUnit === 'mph' ? state.spd : state.kt;
    hudSpeedNumber.textContent = displaySpd.toFixed(1);

    const arcCircumference = 251.3;
    const speedRatio = Math.min(1.0, state.spd / 80.0);
    gaugeProgressArc.style.strokeDashoffset = (arcCircumference * (1 - speedRatio)).toString();

    // Coordinates Readout
    hudCoords.textContent = `${state.lat.toFixed(6)}° N, ${Math.abs(state.lon).toFixed(6)}° W`;

    // Acceleration / Decel Readout
    const accSign = state.acc > 0 ? '+' : '';
    hudAccel.textContent = `${accSign}${state.acc.toFixed(1)} mph/s`;
    if (state.acc <= -5.0) {
      hudAccel.style.color = '#ef4444';
    } else if (state.acc >= 3.0) {
      hudAccel.style.color = '#10b981';
    } else {
      hudAccel.style.color = '#e2e8f0';
    }

    // Altitude Readout
    const altFeet = (state.alt * 3.28084).toFixed(0);
    hudAltitude.textContent = `${state.alt.toFixed(1)} m (${altFeet} ft)`;

    // Turn Dynamics Badge in HUD
    if (state.isHardTurn) {
      hudTurnBadge.className = 'badge-turn hard-turn';
      hudTurnBadge.textContent = state.turnRate > 0 ? 'Sharp Right' : 'Sharp Left';
    } else if (state.isTurningRight) {
      hudTurnBadge.className = 'badge-turn turning-right';
      hudTurnBadge.textContent = 'Turning Right';
    } else if (state.isTurningLeft) {
      hudTurnBadge.className = 'badge-turn turning-left';
      hudTurnBadge.textContent = 'Turning Left';
    } else {
      hudTurnBadge.className = 'badge-turn straight';
      hudTurnBadge.textContent = 'Straight';
    }

    const turnSign = state.turnRate > 0 ? '+' : '';
    hudTurnRate.textContent = `${turnSign}${state.turnRate.toFixed(1)}°/s`;
    hudSteeringAngle.textContent = `${Math.abs(state.steeringAngle).toFixed(0)}° ${state.steeringAngle > 1 ? 'R' : state.steeringAngle < -1 ? 'L' : ''} Steering`;

    // Oncoming 2014 White BMW 550 HUD Card
    if (state.sedanVisible) {
      if (state.deltaTToImpact <= 0) {
        if (state.deltaTToImpact < -1.5) {
          hudSedanBadge.textContent = '45.0 MPH';
          hudSedanBadge.style.background = 'rgba(245,158,11,0.25)';
          hudSedanBadge.style.color = '#fbbf24';
          hudSedanDistance.textContent = `Simulated at 45 MPH in the second westbound lane from the median (client's account; speed not logged, client estimate 45-50) | ${state.sedanDistFt} ft to impact`;
        } else {
          hudSedanBadge.textContent = 'IMPACT (DISPUTED)';
          hudSedanBadge.style.background = 'rgba(239,68,68,0.45)';
          hudSedanBadge.style.color = '#fff';
          hudSedanDistance.textContent = `Client's account: the BMW stayed in its lane and did not slow; she held her speed so the strike would not land on the front passenger door. Unit 2 path is simulated.`;
        }
      } else {
        hudSedanBadge.textContent = "12 O'CLOCK IMPACT";
        hudSedanBadge.style.background = 'rgba(239,68,68,0.4)';
        hudSedanBadge.style.color = '#fff';
        hudSedanDistance.textContent = "2014 BMW 550 12 o'clock front against 2025 Atlas right side, 3 o'clock (client: centre to rear passenger side; CR-4: 'right front quarter, angular') | Atlas front bumper undamaged";
      }
    } else {
      hudSedanBadge.textContent = 'Not In Range';
      hudSedanBadge.style.background = 'rgba(148,163,184,0.15)';
      hudSedanBadge.style.color = '#94a3b8';
      hudSedanDistance.textContent = '45.0 MPH (simulated; client estimate 45-50)';
    }

    // --- Dynamic Texas Diamond Signal Phasing State Update ---
    if (u1RedLight && u2RedLight) {
      const gIdx = activeStartIndex + idxFloat;
      
      const mapWestRed = document.getElementById('mapWestRed');
      const mapWestYellow = document.getElementById('mapWestYellow');
      const mapWestGreen = document.getElementById('mapWestGreen');
      const mapWestLabel = document.getElementById('mapWestLabel');

      const mapU1Red = document.getElementById('mapU1Red');
      const mapU1Yellow = document.getElementById('mapU1Yellow');
      const mapU1Green = document.getElementById('mapU1Green');
      const mapU1Label = document.getElementById('mapU1Label');

      const mapU2Red = document.getElementById('mapU2Red');
      const mapU2Yellow = document.getElementById('mapU2Yellow');
      const mapU2Green = document.getElementById('mapU2Green');
      const mapU2Label = document.getElementById('mapU2Label');

      if (gIdx < 12752) {
        // Stage 1: Stopped at West Ramp Terminal on Solid Red (04:59:18 - 04:59:44 AM)
        signalPhaseBadge.className = 'badge-tag signal-badge red';
        signalPhaseBadge.textContent = 'West Light: 26s Stop';
        
        // West Light: Solid Red
        if (westRedLight) {
          westRedLight.className = 'signal-lens red on';
          westYellowLight.className = 'signal-lens yellow off';
          westGreenLight.className = 'signal-lens green off';
          westSignalLabel.className = 'signal-state-label red';
          westSignalLabel.textContent = 'RED (26s STOP)';
        }

        // East Light: Cycle wait
        u1RedLight.className = 'signal-lens red on';
        u1YellowLight.className = 'signal-lens yellow off';
        u1GreenLight.className = 'signal-lens green off';
        u1SignalLabel.className = 'signal-state-label red';
        u1SignalLabel.textContent = 'AWAITING CALL';

        // BMW Westbound: Through movement
        u2RedLight.className = 'signal-lens red off';
        u2YellowLight.className = 'signal-lens yellow off';
        u2GreenLight.className = 'signal-lens green on';
        u2SignalLabel.className = 'signal-state-label green';
        u2SignalLabel.textContent = 'CROSS TRAFFIC';

        interlockBadge.textContent = 'DETECTOR ACTIVE';
        interlockBadge.style.color = '#38bdf8';
        signalInterlockExplain.innerHTML = '<strong>West Stop Bar (GPS):</strong> Unit 1 at 0 mph for 26 s at the west ramp terminal (04:59:18&ndash;04:59:43). Client\'s account: stopped on red; detection then called the controller.';

        if (mapWestRed) { mapWestRed.className = 'map-signal-lens red on'; mapWestYellow.className = 'map-signal-lens yellow off'; mapWestGreen.className = 'map-signal-lens green off'; if (mapWestLabel) { mapWestLabel.textContent = 'WEST: 26s RED'; mapWestLabel.style.color = '#f87171'; } }
        if (mapU1Red) { mapU1Red.className = 'map-signal-lens red on'; mapU1Yellow.className = 'map-signal-lens yellow off'; mapU1Green.className = 'map-signal-lens green off'; if (mapU1Label) { mapU1Label.textContent = 'EAST: RED'; mapU1Label.style.color = '#f87171'; } }
        if (mapU2Red) { mapU2Red.className = 'map-signal-lens red off'; mapU2Yellow.className = 'map-signal-lens yellow off'; mapU2Green.className = 'map-signal-lens green on'; if (mapU2Label) { mapU2Label.textContent = 'FLOW GREEN'; mapU2Label.style.color = '#34d399'; } }

      } else if (gIdx >= 12752 && gIdx < 12773.5) {
        // Stage 2: West Light Turns Green & Acceleration Across Bridge (04:59:45 - 05:00:05 AM)
        signalPhaseBadge.className = 'badge-tag signal-badge green';
        signalPhaseBadge.textContent = 'West Green & Bridge Travel';

        // West Light: Solid Green (Departed)
        if (westRedLight) {
          westRedLight.className = 'signal-lens red off';
          westYellowLight.className = 'signal-lens yellow off';
          westGreenLight.className = 'signal-lens green on';
          westSignalLabel.className = 'signal-state-label green';
          westSignalLabel.textContent = 'TURNED GREEN';
        }

        // East Turn Light: Red/Awaiting Call (Holding queue, through signals green)
        u1RedLight.className = 'signal-lens red on';
        u1YellowLight.className = 'signal-lens yellow off';
        u1GreenLight.className = 'signal-lens green off';
        u1SignalLabel.className = 'signal-state-label red';
        u1SignalLabel.textContent = 'AWAITING ARROW';

        // BMW: Through flow
        u2RedLight.className = 'signal-lens red off';
        u2YellowLight.className = 'signal-lens yellow off';
        u2GreenLight.className = 'signal-lens green on';
        u2SignalLabel.className = 'signal-state-label green';
        u2SignalLabel.textContent = 'CROSS TRAFFIC';

        interlockBadge.textContent = 'BRIDGE CRUISE';
        interlockBadge.style.color = '#38bdf8';
        signalInterlockExplain.innerHTML = '<strong>Eastbound run (GPS):</strong> speed rises to 39 mph over ~362 m toward the east terminal. Client\'s account: west light green; the left-turn arrow ahead not yet green.';

        if (mapWestRed) { mapWestRed.className = 'map-signal-lens red off'; mapWestYellow.className = 'map-signal-lens yellow off'; mapWestGreen.className = 'map-signal-lens green on'; if (mapWestLabel) { mapWestLabel.textContent = 'WEST: GREEN'; mapWestLabel.style.color = '#34d399'; } }
        if (mapU1Red) { mapU1Red.className = 'map-signal-lens red on'; mapU1Yellow.className = 'map-signal-lens yellow off'; mapU1Green.className = 'map-signal-lens green off'; if (mapU1Label) { mapU1Label.textContent = 'TURN: RED'; mapU1Label.style.color = '#f87171'; } }
        if (mapU2Red) { mapU2Red.className = 'map-signal-lens red off'; mapU2Yellow.className = 'map-signal-lens yellow off'; mapU2Green.className = 'map-signal-lens green on'; if (mapU2Label) { mapU2Label.textContent = 'FLOW GREEN'; mapU2Label.style.color = '#34d399'; } }

      } else if (gIdx >= 12773.5 && gIdx < 12778.5) {
        // Stage 3 (client's account): the THROUGH heads for both directions turn yellow as Unit 1 nears the east
        // terminal (05:00:05-05:00:10), then all-red for ~1 s; the left-turn arrow stays red until the through
        // movements have cleared and only then turns green (Stage 4 at 05:00:11). The westbound head is the one
        // the BMW faced; the eastbound through head (not drawn) changes with it.
        const allRed = gIdx >= 12777.5;
        signalPhaseBadge.className = allRed ? 'badge-tag signal-badge red' : 'badge-tag signal-badge yellow';
        signalPhaseBadge.textContent = allRed ? 'All Red: Arrow Next' : 'Through Heads Amber';

        if (westRedLight) {
          westRedLight.className = 'signal-lens red off';
          westYellowLight.className = 'signal-lens yellow off';
          westGreenLight.className = 'signal-lens green on';
          westSignalLabel.className = 'signal-state-label green';
          westSignalLabel.textContent = 'FLOW GREEN';
        }

        // East Turn head: red arrow held until the through phases end
        u1RedLight.className = 'signal-lens red on';
        u1YellowLight.className = 'signal-lens yellow off';
        u1GreenLight.className = 'signal-lens green off';
        u1SignalLabel.className = 'signal-state-label red';
        u1SignalLabel.textContent = allRed ? 'RED (ARROW NEXT)' : 'RED (ARROW PENDING)';

        // BMW westbound through head: yellow clearance, then red
        u2RedLight.className = allRed ? 'signal-lens red on' : 'signal-lens red off';
        u2YellowLight.className = allRed ? 'signal-lens yellow off' : 'signal-lens yellow on';
        u2GreenLight.className = 'signal-lens green off';
        u2SignalLabel.className = allRed ? 'signal-state-label red' : 'signal-state-label yellow';
        u2SignalLabel.textContent = allRed ? 'RED (ALL-RED)' : 'AMBER (CLEARANCE)';

        interlockBadge.textContent = allRed ? 'ALL-RED INTERVAL' : 'THROUGH CLEARANCE';
        interlockBadge.style.color = allRed ? '#ef4444' : '#fbbf24';
        signalInterlockExplain.innerHTML = allRed
          ? '<strong>All-red (client\'s account):</strong> both through heads red for about a second before the left-turn arrow turns green at 05:00:11. The westbound BMW should already be stopping. Signal state here is the client\'s account, not controller data.'
          : '<strong>Deceleration (GPS):</strong> 39 to 17 mph over 9 s (05:00:05&ndash;05:00:14). Client\'s account: the eastbound and westbound <em>through</em> heads went yellow as she approached, so she slowed to meet the left-turn arrow, which stayed red until they cleared. At 45 mph the BMW was about 600 ft before its stop line when the amber began (the onset time is a modelling choice; client\'s account: 400&ndash;600 ft). Signal state here is the client\'s account, not controller data.';

        if (mapWestRed) { mapWestRed.className = 'map-signal-lens red off'; mapWestYellow.className = 'map-signal-lens yellow off'; mapWestGreen.className = 'map-signal-lens green on'; if (mapWestLabel) { mapWestLabel.textContent = 'WEST: GREEN'; mapWestLabel.style.color = '#34d399'; } }
        if (mapU1Red) { mapU1Red.className = 'map-signal-lens red on'; mapU1Yellow.className = 'map-signal-lens yellow off'; mapU1Green.className = 'map-signal-lens green off'; if (mapU1Label) { mapU1Label.textContent = allRed ? 'TURN: RED (ARROW NEXT)' : 'TURN: RED'; mapU1Label.style.color = '#f87171'; } }
        if (mapU2Red) { mapU2Red.className = allRed ? 'map-signal-lens red on' : 'map-signal-lens red off'; mapU2Yellow.className = allRed ? 'map-signal-lens yellow off' : 'map-signal-lens yellow on'; mapU2Green.className = 'map-signal-lens green off'; if (mapU2Label) { mapU2Label.textContent = allRed ? 'THROUGH: RED' : 'THROUGH: AMBER'; mapU2Label.style.color = allRed ? '#f87171' : '#fbbf24'; } }

      } else if (gIdx >= 12778.5 && gIdx < 12782.8) {
        // Stage 4: Passing White Pavement Arrow & Protected Green Arrow Active (05:00:11 - 05:00:14 AM)
        signalPhaseBadge.className = 'badge-tag signal-badge green';
        signalPhaseBadge.textContent = 'Protected Green Arrow';

        if (westRedLight) {
          westRedLight.className = 'signal-lens red off';
          westYellowLight.className = 'signal-lens yellow off';
          westGreenLight.className = 'signal-lens green on';
          westSignalLabel.className = 'signal-state-label green';
          westSignalLabel.textContent = 'FLOW GREEN';
        }

        // East Turn Light: Protected Green Arrow illuminated over pavement marking
        u1RedLight.className = 'signal-lens red off';
        u1YellowLight.className = 'signal-lens yellow off';
        u1GreenLight.className = 'signal-lens green on';
        u1SignalLabel.className = 'signal-state-label green';
        u1SignalLabel.textContent = 'GREEN ARROW';

        // BMW Westbound: 100% Solid Red Lockout
        u2RedLight.className = 'signal-lens red on';
        u2YellowLight.className = 'signal-lens yellow off';
        u2GreenLight.className = 'signal-lens green off';
        u2SignalLabel.className = 'signal-state-label red';
        u2SignalLabel.textContent = 'RED (CLIENT\'S ACCOUNT)';

        interlockBadge.textContent = 'PROTECTED (CLIENT)';
        interlockBadge.style.color = '#10b981';
        if (gIdx < 12781.5) {
          signalInterlockExplain.innerHTML = '<strong>Turn initiation (client\'s account):</strong> the left-turn arrow showed steady green as the vehicle reached the painted pavement arrow. The CR-4 narrative says a flashing yellow arrow; this head is a four-section FYA head, so both indications are possible and controller logs are needed to settle it.';
        } else {
          signalInterlockExplain.innerHTML = '<strong>05:00:14 (client\'s account):</strong> vehicle turning north into the ramp; looking east the driver saw the BMW coming on in its lane without slowing. She judged it had time to stop and held her speed rather than brake, so the strike would not land on the front passenger door. Positions and speed of Unit 2 are simulated, not logged.';
        }

        if (mapWestRed) { mapWestRed.className = 'map-signal-lens red off'; mapWestYellow.className = 'map-signal-lens yellow off'; mapWestGreen.className = 'map-signal-lens green on'; if (mapWestLabel) { mapWestLabel.textContent = 'WEST: GREEN'; mapWestLabel.style.color = '#34d399'; } }
        if (mapU1Red) { mapU1Red.className = 'map-signal-lens red off'; mapU1Yellow.className = 'map-signal-lens yellow off'; mapU1Green.className = 'map-signal-lens green on'; if (mapU1Label) { mapU1Label.textContent = 'GREEN ARROW'; mapU1Label.style.color = '#34d399'; } }
        if (mapU2Red) { mapU2Red.className = 'map-signal-lens red on'; mapU2Yellow.className = 'map-signal-lens yellow off'; mapU2Green.className = 'map-signal-lens green off'; if (mapU2Label) { mapU2Label.textContent = 'LOCKED RED'; mapU2Label.style.color = '#f87171'; } }

      } else {
        // Stage 4: Collision Impact (05:00:15 AM onward)
        signalPhaseBadge.className = 'badge-tag signal-badge red';
        signalPhaseBadge.textContent = 'Collision (client\'s account)';

        if (westRedLight) {
          westRedLight.className = 'signal-lens red off';
          westYellowLight.className = 'signal-lens yellow off';
          westGreenLight.className = 'signal-lens green on';
          westSignalLabel.className = 'signal-state-label green';
          westSignalLabel.textContent = 'FLOW GREEN';
        }

        u1RedLight.className = 'signal-lens red off';
        u1YellowLight.className = 'signal-lens yellow off';
        u1GreenLight.className = 'signal-lens green on';
        u1SignalLabel.className = 'signal-state-label green';
        u1SignalLabel.textContent = 'GREEN ARROW (CLIENT)';

        u2RedLight.className = 'signal-lens red on';
        u2YellowLight.className = 'signal-lens yellow off';
        u2GreenLight.className = 'signal-lens green off';
        u2SignalLabel.className = 'signal-state-label red';
        u2SignalLabel.textContent = 'RED (CLIENT\'S ACCOUNT)';

        interlockBadge.textContent = 'DISPUTED';
        interlockBadge.style.color = '#ef4444';
        signalInterlockExplain.innerHTML = '<strong style="color:#ef4444;">Impact (client\'s account):</strong> both vehicles reached the same point at the same instant: the BMW\'s front (12 o\'clock) met the Atlas\'s right side at 3 o\'clock (client: centre to slightly rear of the passenger side; CR-4 damage code: right front quarter, angular). The CR-4 narrative describes Unit 1 striking Unit 2 while turning left. Whether Unit 2 faced red is unproven; the CR-4 attributes fault to Unit 1.';

        if (mapWestRed) { mapWestRed.className = 'map-signal-lens red off'; mapWestYellow.className = 'map-signal-lens yellow off'; mapWestGreen.className = 'map-signal-lens green on'; if (mapWestLabel) { mapWestLabel.textContent = 'WEST: GREEN'; mapWestLabel.style.color = '#34d399'; } }
        if (mapU1Red) { mapU1Red.className = 'map-signal-lens red off'; mapU1Yellow.className = 'map-signal-lens yellow off'; mapU1Green.className = 'map-signal-lens green on'; if (mapU1Label) { mapU1Label.textContent = 'GREEN ARROW'; mapU1Label.style.color = '#34d399'; } }
        if (mapU2Red) { mapU2Red.className = 'map-signal-lens red on'; mapU2Yellow.className = 'map-signal-lens yellow off'; mapU2Green.className = 'map-signal-lens green off'; if (mapU2Label) { mapU2Label.textContent = 'RED (CLIENT)'; mapU2Label.style.color = '#ef4444'; } }
      }
    }

    applySignalScenarioOverlay(activeStartIndex + idxFloat);

    // Compass
    const cardinal = getCardinalDirection(state.hd);
    hudHeadingText.textContent = `${state.hd.toFixed(1)}° ${cardinal}`;
    compassNeedleSvg.style.transform = `rotate(${state.hd}deg)`;

    // Mobile HUD Mini-Pill Update
    const mobilePillTime = document.getElementById('mobilePillTime');
    const mobilePillSpeed = document.getElementById('mobilePillSpeed');
    const mobilePillHeading = document.getElementById('mobilePillHeading');
    if (mobilePillTime) mobilePillTime.textContent = state.t || '05:00:15 AM';
    if (mobilePillSpeed) mobilePillSpeed.textContent = `${displaySpd.toFixed(1)} ${speedUnit.toUpperCase()}`;
    if (mobilePillHeading) mobilePillHeading.textContent = `${state.hd.toFixed(0)}° ${cardinal}`;

    // Collision / Impact Alert Banner
    if (state.isImpact || state.t === '05:00:15 AM') {
      impactAlertBanner.classList.add('active');
    } else {
      impactAlertBanner.classList.remove('active');
    }

    // 6. Scrubber & Progress Updates
    const pct = (idxFloat / Math.max(1, activePoints.length - 1)) * 100;
    scrubberFill.style.width = `${pct}%`;
    scrubberThumb.style.left = `${pct}%`;
    progressPct.textContent = `${pct.toFixed(1)}%`;

    // 7. Refresh Canvas Chart Cursor
    drawSpeedChart();
  }

  // --- Main Animation Loop (60 FPS) with Robust Impact Halt & Resume ---
  function animationLoop(currentTime) {
    if (isPlaying) {
      const deltaTimeSec = (currentTime - lastFrameTime) / 1000;
      lastFrameTime = currentTime;

      let effectiveSpeed = playbackSpeed;
      const currentInt = Math.floor(currentIndex);
      if (isSkipStopsEnabled && activePoints[currentInt] && activePoints[currentInt].spd === 0) {
        effectiveSpeed = Math.max(playbackSpeed, 25.0);
      }

      const prevIdx = currentIndex;
      currentIndex = Math.max(0, currentIndex + effectiveSpeed * Math.max(0, deltaTimeSec));

      // Check Automatic Stop at the strike instant (about 05:00:14.5; the first zero-speed fix is index 12783)
      const impactLocalIdx = STRIKE_G - activeStartIndex;
      if (isAutoStopImpactEnabled && prevIdx < impactLocalIdx && currentIndex >= impactLocalIdx) {
        currentIndex = impactLocalIdx;
        pausePlayback();
        updateUI(currentIndex);
        if (accidentMarker) accidentMarker.openPopup();
      } else if (currentIndex >= activePoints.length - 1) {
        currentIndex = activePoints.length - 1;
        pausePlayback();
        updateUI(currentIndex);
      } else {
        updateUI(currentIndex);
      }
    } else {
      lastFrameTime = currentTime;
    }

    requestAnimationFrame(animationLoop);
  }

  // --- Playback Controls ---
  function startPlayback() {
    const impactLocalIdx = IMPACT_GLOBAL_INDEX - activeStartIndex;
    
    // If at the end of the timeline, restart from beginning
    if (currentIndex >= activePoints.length - 1) {
      currentIndex = 0;
    }
    
    // If currently stopped at impact and user clicks play, step slightly forward to allow watching post-crash scene
    if (isAutoStopImpactEnabled && Math.abs(currentIndex - impactLocalIdx) < 0.2) {
      currentIndex = impactLocalIdx + 0.15;
    }

    isPlaying = true;
    lastFrameTime = performance.now();
    btnPlayPause.innerHTML = '<i class="fa-solid fa-pause"></i>';
    btnPlayPause.classList.add('playing');
  }

  function pausePlayback() {
    isPlaying = false;
    btnPlayPause.innerHTML = '<i class="fa-solid fa-play"></i>';
    btnPlayPause.classList.remove('playing');
  }

  function togglePlayPause() {
    if (isPlaying) {
      pausePlayback();
    } else {
      startPlayback();
    }
  }

  function stepFrames(deltaSec) {
    pausePlayback();
    currentIndex = Math.max(0, Math.min(activePoints.length - 1, currentIndex + deltaSec));
    updateUI(currentIndex);
  }

  function seekToGlobalIndex(globalIdx) {
    pausePlayback();
    if (globalIdx < activeStartIndex || globalIdx > activeEndIndex) {
      if (globalIdx >= 12648 && globalIdx <= 12888) {
        presetSelect.value = 'accident_focus';
        applyPreset('accident_focus', globalIdx);
      } else {
        presetSelect.value = 'full_journey';
        applyPreset('full_journey', globalIdx);
      }
      return;
    }

    const localIdx = Math.max(0, Math.min(activePoints.length - 1, globalIdx - activeStartIndex));
    currentIndex = localIdx;
    updateUI(currentIndex);

    if (cameraMode === 'impact') {
      map.setView([32.955086, -97.038101], 19);
    }
  }

  function jumpToImpact() {
    pausePlayback();
    presetSelect.value = 'accident_focus';
    applyPreset('accident_focus', IMPACT_GLOBAL_INDEX);
    map.setView([32.955086, -97.038101], 19.5, { animate: true });
    if (accidentMarker) {
      accidentMarker.openPopup();
    }
  }

  // Replay 10-second collision approach sequence
  function replayApproach() {
    pausePlayback();
    presetSelect.value = 'accident_focus';
    // Seek to 10 seconds before impact (04:59:55 AM, index ~12773)
    const approachStartGlobal = Math.max(12648, IMPACT_GLOBAL_INDEX - 10);
    applyPreset('accident_focus', approachStartGlobal);
    map.setView([32.955086, -97.038101], 19, { animate: true });
    setTimeout(() => {
      startPlayback();
    }, 150);
  }

  function fitActiveRouteBounds() {
    if (activePoints.length > 0) {
      const bounds = L.latLngBounds(activePoints.map(p => [p.lat, p.lon]));
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }

  // --- Scrubber Dragging Interactions ---
  function handleScrubberInput(e) {
    const rect = scrubberTrack.getBoundingClientRect();
    const clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    currentIndex = pct * (activePoints.length - 1);
    updateUI(currentIndex);
  }

  scrubberTrack.addEventListener('mousedown', (e) => {
    isDraggingScrubber = true;
    pausePlayback();
    handleScrubberInput(e);
  });

  window.addEventListener('mousemove', (e) => {
    if (isDraggingScrubber) handleScrubberInput(e);
  });

  window.addEventListener('mouseup', () => {
    if (isDraggingScrubber) isDraggingScrubber = false;
  });

  // Touch Support with smooth scroll prevention
  scrubberTrack.addEventListener('touchstart', (e) => {
    isDraggingScrubber = true;
    pausePlayback();
    handleScrubberInput(e);
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (isDraggingScrubber) {
      if (e.cancelable) e.preventDefault();
      handleScrubberInput(e);
    }
  }, { passive: false });

  window.addEventListener('touchend', () => {
    if (isDraggingScrubber) isDraggingScrubber = false;
  });

  // --- UI Event Listeners ---
  presetSelect.addEventListener('change', (e) => applyPreset(e.target.value));

  mapLayerSelect.addEventListener('change', (e) => {
    const layer = tileLayers[e.target.value];
    if (layer && layer !== currentLayer) {
      map.removeLayer(currentLayer);
      layer.addTo(map);
      currentLayer = layer;
    }
  });

  btnTurnScale.addEventListener('click', () => {
    isTurnScaleEnabled = !isTurnScaleEnabled;
    btnTurnScale.classList.toggle('active', isTurnScaleEnabled);
  });

  btnSkipStops.addEventListener('click', () => {
    isSkipStopsEnabled = !isSkipStopsEnabled;
    btnSkipStops.classList.toggle('active', isSkipStopsEnabled);
  });

  btnAutoStopImpact.addEventListener('click', () => {
    isAutoStopImpactEnabled = !isAutoStopImpactEnabled;
    btnAutoStopImpact.classList.toggle('active', isAutoStopImpactEnabled);
  });

  const btnPlay2Min = document.getElementById('btnPlay2Min');
  if (btnPlay2Min) {
    btnPlay2Min.addEventListener('click', () => {
      pausePlayback();
      presetSelect.value = 'accident_focus';
      applyPreset('accident_focus', 12648);
      playbackSpeed = 1.0;
      speedButtons.forEach(b => b.classList.toggle('active', b.dataset.speed === '1.0'));
      isAutoStopImpactEnabled = true;
      btnAutoStopImpact.classList.add('active');
      setTimeout(() => {
        startPlayback();
      }, 150);
    });
  }

  btnPlayPause.addEventListener('click', togglePlayPause);
  btnStepBack.addEventListener('click', () => stepFrames(-1));
  btnStepForward.addEventListener('click', () => stepFrames(1));
  btnReplayApproach.addEventListener('click', replayApproach);
  btnDockImpact.addEventListener('click', jumpToImpact);
  btnHeaderImpact.addEventListener('click', jumpToImpact);

  // Playback Speeds
  speedButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      speedButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      playbackSpeed = parseFloat(btn.dataset.speed);
    });
  });

  // Speed Unit Toggle
  unitToggle.addEventListener('click', () => {
    if (speedUnit === 'mph') {
      speedUnit = 'knots';
      unitMph.classList.remove('active');
      unitKnots.classList.add('active');
    } else {
      speedUnit = 'mph';
      unitMph.classList.add('active');
      unitKnots.classList.remove('active');
    }
    updateUI(currentIndex);
  });

  // Camera Mode Controls
  function setCameraMode(mode) {
    cameraMode = mode;
    btnCamFollow.classList.toggle('active', mode === 'follow');
    btnCamImpact.classList.toggle('active', mode === 'impact');
    btnCamOverview.classList.toggle('active', mode === 'overview');

    if (mode === 'impact') {
      map.setView([32.955086, -97.038101], 19.5, { animate: true });
    } else if (mode === 'overview') {
      fitActiveRouteBounds();
    }
  }

  btnCamFollow.addEventListener('click', () => setCameraMode('follow'));
  btnCamImpact.addEventListener('click', () => setCameraMode('impact'));
  btnCamOverview.addEventListener('click', () => setCameraMode('overview'));

  // Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    if (e.code === 'Space') {
      e.preventDefault();
      togglePlayPause();
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault();
      stepFrames(-1);
    } else if (e.code === 'ArrowRight') {
      e.preventDefault();
      stepFrames(1);
    } else if (e.key === 'i' || e.key === 'I') {
      jumpToImpact();
    } else if (e.key === 'r' || e.key === 'R') {
      replayApproach();
    }
  });

  // Modal Evidence Table Population
  function populateEvidenceTable() {
    evidenceTableBody.innerHTML = '';
    
    milestones.forEach(m => {
      const isImpact = m.type === 'impact';
      const row = document.createElement('tr');
      if (isImpact) row.className = 'highlight-row';

      row.innerHTML = `
        <td><strong>${m.title}</strong></td>
        <td style="font-family:var(--font-mono);">${m.time}</td>
        <td>${isImpact ? '17.2 &rarr; 0.0 MPH (SUV) vs ~45 MPH (Sedan, simulated; client estimate 45-50)' : '-'}</td>
        <td style="font-family:var(--font-mono);">${m.lat ? `${m.lat.toFixed(6)}, ${m.lon.toFixed(6)}` : '-'}</td>
        <td>${m.desc}</td>
      `;

      row.style.cursor = 'pointer';
      row.addEventListener('click', () => {
        evidenceModal.classList.remove('active');
        seekToGlobalIndex(m.index);
      });

      evidenceTableBody.appendChild(row);
    });
  }

  btnEvidenceReport.addEventListener('click', () => {
    populateEvidenceTable();
    evidenceModal.classList.add('active');
  });

  btnCloseModal.addEventListener('click', () => {
    evidenceModal.classList.remove('active');
  });

  evidenceModal.addEventListener('click', (e) => {
    if (e.target === evidenceModal) evidenceModal.classList.remove('active');
  });

  // --- Night lighting & signal scenario controls ---
  function applyNightMode() {
    document.body.classList.toggle('night-mode', isNightMode);
    const btn = document.getElementById('btnNightMode');
    const mbtn = document.getElementById('btnMobileNightMode');
    if (btn) btn.classList.toggle('active', isNightMode);
    if (mbtn) mbtn.classList.toggle('active', isNightMode);
  }
  ['btnNightMode', 'btnMobileNightMode'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', () => { isNightMode = !isNightMode; applyNightMode(); });
  });
  const signalScenarioSelect = document.getElementById('signalScenarioSelect');
  if (signalScenarioSelect) {
    signalScenarioSelect.addEventListener('change', (e) => {
      signalScenario = e.target.value === 'cr4' ? 'cr4' : 'client';
      updateUI(currentIndex);
    });
  }

  // --- Mobile Controls & Drawer Integration ---
  const btnMobileImpact = document.getElementById('btnMobileImpact');
  if (btnMobileImpact) {
    btnMobileImpact.addEventListener('click', jumpToImpact);
  }

  const btnMobileMenu = document.getElementById('btnMobileMenu');
  const mobileDrawerOverlay = document.getElementById('mobileDrawerOverlay');
  const btnCloseDrawer = document.getElementById('btnCloseDrawer');

  if (btnMobileMenu && mobileDrawerOverlay) {
    btnMobileMenu.addEventListener('click', () => {
      mobileDrawerOverlay.classList.add('active');
    });
  }
  if (btnCloseDrawer && mobileDrawerOverlay) {
    btnCloseDrawer.addEventListener('click', () => {
      mobileDrawerOverlay.classList.remove('active');
    });
  }
  if (mobileDrawerOverlay) {
    mobileDrawerOverlay.addEventListener('click', (e) => {
      if (e.target === mobileDrawerOverlay) {
        mobileDrawerOverlay.classList.remove('active');
      }
    });
  }

  // Sync Mobile Drawer Presets & Layers
  const mobilePresetSelect = document.getElementById('mobilePresetSelect');
  if (mobilePresetSelect) {
    mobilePresetSelect.addEventListener('change', (e) => {
      presetSelect.value = e.target.value;
      applyPreset(e.target.value);
      if (mobileDrawerOverlay) mobileDrawerOverlay.classList.remove('active');
    });
  }

  const mobileMapLayerSelect = document.getElementById('mobileMapLayerSelect');
  if (mobileMapLayerSelect) {
    mobileMapLayerSelect.addEventListener('change', (e) => {
      mapLayerSelect.value = e.target.value;
      const layer = tileLayers[e.target.value];
      if (layer && layer !== currentLayer) {
        map.removeLayer(currentLayer);
        layer.addTo(map);
        currentLayer = layer;
      }
      if (mobileDrawerOverlay) mobileDrawerOverlay.classList.remove('active');
    });
  }

  const btnMobileTurnScale = document.getElementById('btnMobileTurnScale');
  if (btnMobileTurnScale) {
    btnMobileTurnScale.addEventListener('click', () => {
      isTurnScaleEnabled = !isTurnScaleEnabled;
      btnTurnScale.classList.toggle('active', isTurnScaleEnabled);
      btnMobileTurnScale.classList.toggle('active', isTurnScaleEnabled);
    });
  }

  const btnMobileSkipStops = document.getElementById('btnMobileSkipStops');
  if (btnMobileSkipStops) {
    btnMobileSkipStops.addEventListener('click', () => {
      isSkipStopsEnabled = !isSkipStopsEnabled;
      btnSkipStops.classList.toggle('active', isSkipStopsEnabled);
      btnMobileSkipStops.classList.toggle('active', isSkipStopsEnabled);
    });
  }

  const btnMobileAutoStopImpact = document.getElementById('btnMobileAutoStopImpact');
  if (btnMobileAutoStopImpact) {
    btnMobileAutoStopImpact.addEventListener('click', () => {
      isAutoStopImpactEnabled = !isAutoStopImpactEnabled;
      btnAutoStopImpact.classList.toggle('active', isAutoStopImpactEnabled);
      btnMobileAutoStopImpact.classList.toggle('active', isAutoStopImpactEnabled);
    });
  }

  const btnMobileEvidenceReport = document.getElementById('btnMobileEvidenceReport');
  if (btnMobileEvidenceReport) {
    btnMobileEvidenceReport.addEventListener('click', () => {
      if (mobileDrawerOverlay) mobileDrawerOverlay.classList.remove('active');
      populateEvidenceTable();
      evidenceModal.classList.add('active');
    });
  }

  const btnMobilePlay2Min = document.getElementById('btnMobilePlay2Min');
  if (btnMobilePlay2Min) {
    btnMobilePlay2Min.addEventListener('click', () => {
      if (mobileDrawerOverlay) mobileDrawerOverlay.classList.remove('active');
      if (btnPlay2Min) btnPlay2Min.click();
    });
  }

  // --- Mobile Collapsible Telematics Sheet ---
  const mobileHudPill = document.getElementById('mobileHudPill');
  const btnToggleHud = document.getElementById('btnToggleHud');
  const hudPanel = document.getElementById('hudPanel');
  const btnCloseHud = document.getElementById('btnCloseHud');
  const hudToggleLabel = document.getElementById('hudToggleLabel');
  const hudToggleIcon = document.getElementById('hudToggleIcon');

  function toggleMobileHud(e) {
    if (!hudPanel) return;
    if (e) e.stopPropagation();
    const isExpanded = hudPanel.classList.toggle('mobile-expanded');
    if (hudToggleLabel) hudToggleLabel.textContent = isExpanded ? 'Hide' : 'Telemetry';
    if (hudToggleIcon) {
      hudToggleIcon.className = isExpanded ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down';
    }
  }

  function closeMobileHud() {
    if (!hudPanel) return;
    hudPanel.classList.remove('mobile-expanded');
    if (hudToggleLabel) hudToggleLabel.textContent = 'Telemetry';
    if (hudToggleIcon) hudToggleIcon.className = 'fa-solid fa-chevron-down';
  }

  if (mobileHudPill) mobileHudPill.addEventListener('click', toggleMobileHud);
  if (btnToggleHud) btnToggleHud.addEventListener('click', toggleMobileHud);
  if (btnCloseHud) {
    btnCloseHud.addEventListener('click', (e) => {
      e.stopPropagation();
      closeMobileHud();
    });
  }

  // Window Resize & Orientation Change
  window.addEventListener('resize', () => {
    map.invalidateSize();
    drawSpeedChart();
  });

  window.addEventListener('orientationchange', () => {
    setTimeout(() => {
      map.invalidateSize();
      drawSpeedChart();
    }, 200);
  });

  // --- Initial Startup: 2-Minute Approach & Crash (04:58:00 AM - 05:02:00 AM) ---
  isSkipStopsEnabled = false;
  if (btnSkipStops) btnSkipStops.classList.remove('active');
  if (btnMobileSkipStops) btnMobileSkipStops.classList.remove('active');
  isAutoStopImpactEnabled = true;
  if (btnAutoStopImpact) btnAutoStopImpact.classList.add('active');
  if (btnMobileAutoStopImpact) btnMobileAutoStopImpact.classList.add('active');
  // Deep links: ?at=<global record index | impact>  ?scenario=client|cr4  ?night=0|1
  const params = new URLSearchParams(window.location.search);
  if (params.get('scenario') === 'cr4') { signalScenario = 'cr4'; if (signalScenarioSelect) signalScenarioSelect.value = 'cr4'; }
  if (params.get('debug') === '1') { window.__recon = { motionAt, state: g => getInterpolatedState(g - activeStartIndex), impact: IMPACT_GLOBAL_INDEX, strike: STRIKE_G, impactHeading: IMPACT_HEADING, activeStart: () => activeStartIndex, activeLength: () => activePoints.length, seek: g => { currentIndex = g - activeStartIndex; updateUI(currentIndex); }, camera: () => ({ zoom: map.getZoom(), center: map.getCenter() }), setView: (lat, lon, z) => { cameraMode = 'overview'; map.setView([lat, lon], z, { animate: false }); }, preset: name => { presetSelect.value = name; presetSelect.dispatchEvent(new Event('change')); }, play: spd => { playbackSpeed = spd || 1; startPlayback(); }, pause: () => pausePlayback(), index: () => activeStartIndex + currentIndex }; }
  if (params.get('night') === '0') isNightMode = false;
  let startIdx = 12648;
  const atParam = params.get('at');
  if (atParam === 'impact') startIdx = STRIKE_G;
  else if (atParam && !isNaN(parseInt(atParam, 10))) startIdx = Math.max(0, Math.min(allPoints.length - 1, parseInt(atParam, 10)));
  const startPreset = (startIdx >= 12648 && startIdx <= 12888) ? 'accident_focus' : (startIdx >= 11568 ? 'pre_crash_leg' : 'full_journey');
  presetSelect.value = startPreset;
  if (mobilePresetSelect) mobilePresetSelect.value = startPreset;
  applyNightMode();
  applyPreset(startPreset, startIdx);
  requestAnimationFrame(animationLoop);

})();
