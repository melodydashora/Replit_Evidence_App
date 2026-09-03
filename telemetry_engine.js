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
    attributionControl: false
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
    })
  };

  tileLayers.satellite_hybrid.addTo(map);
  let currentLayer = tileLayers.satellite_hybrid;

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
      // Point of physical impact on the right middle/rear flank of the Atlas
      accidentMarker = L.marker([32.955086, -97.038085], { icon: impactIcon, zIndexOffset: 990 })
        .addTo(map)
        .bindPopup(`
          <div class="event-popup-content">
            <div class="event-popup-title impact"><i class="fa-solid fa-burst"></i> TWO-VEHICLE COLLISION SITE (T-BONE)</div>
            <div class="event-popup-desc">
              <strong>Timestamp:</strong> 05:00:15 AM<br>
              <strong>Unit 1 (Client 2025 VW Atlas):</strong> Completed left turn under green arrow; oriented straight North (0.0° N) towards SH 121 entrance ramp. <span style="color:#10b981; font-weight:700;">Front 100% Undamaged.</span> Sustained <strong>3 O'CLOCK angular impact to right middle/rear side</strong>.<br>
              <strong>Unit 2 (2014 White BMW 550, TX: vdw2544, Uninsured):</strong> Westbound at 42 MPH trying to beat yellow light; crossed intersection line as Unit 1 was already through turn. Sustained <strong>12 O'CLOCK distributed front-end impact</strong> against the right flank of the Atlas.
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

    // 1. West Ramp Terminal Signal (Where You Stopped at 04:59:18 AM)
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
    signalMarkerWest = L.marker([32.955082, -97.041977], {
      icon: L.divIcon({ html: signalWestHtml, className: 'map-signal-icon-west', iconSize: [44, 52], iconAnchor: [22, 26] }),
      zIndexOffset: 960
    }).addTo(map).bindPopup(`
      <div class="event-popup-content">
        <div class="event-popup-title" style="color:#38bdf8;"><i class="fa-solid fa-traffic-light"></i> 1. West Ramp Terminal Signal (Where You Stopped)</div>
        <div class="event-popup-desc">
          <strong>Location:</strong> Bass Pro Dr & TX-121 Southbound Ramp (Coordinates: 32.955082, -97.041977)<br>
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
          <div class="map-signal-lens green on" id="mapU1Green"></div>
        </div>
        <div class="map-signal-label" id="mapU1Label" style="color:#34d399;">TURN GREEN</div>
      </div>
    `;
    signalMarkerU1 = L.marker([32.955030, -97.038190], {
      icon: L.divIcon({ html: signalU1Html, className: 'map-signal-icon-u1', iconSize: [40, 50], iconAnchor: [20, 25] }),
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
        <i class="fa-solid fa-arrow-left" style="color:#fff;"></i> White Pavement Arrow (Green Arrow Trigger @ 05:00:11 AM)
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
          <strong>05:00:05 - 05:00:10 AM:</strong> Driver decelerated from 39.1 to 23 MPH because ahead signals displayed amber/orange, waiting for the turn arrow.<br>
          <strong>05:00:11 AM:</strong> Right as the front tires crossed this pavement marking, the overhead <strong>Green Arrow</strong> illuminated, and driver accelerated through the turn.
        </div>
      </div>
    `, { className: 'event-map-popup' });

    // 2c. Driver's Perspective / Point of Inevitable Collision (Google Street View Match)
    const perspectiveHtml = `
      <div style="background:rgba(220,38,38,0.92); border:1.5px solid #fff; border-radius:6px; padding:2px 6px; box-shadow:0 3px 8px rgba(0,0,0,0.6); display:flex; align-items:center; gap:4px; font-size:9.5px; font-weight:800; color:#fff; white-space:nowrap;">
        <i class="fa-solid fa-eye"></i> Driver Viewpoint: Point of Inevitable Impact (05:00:14 AM)
      </div>
    `;
    L.marker([32.955075, -97.038105], {
      icon: L.divIcon({ html: perspectiveHtml, className: 'driver-view-marker', iconSize: [210, 22], iconAnchor: [105, 11] }),
      zIndexOffset: 945
    }).addTo(map).bindPopup(`
      <div class="event-popup-content">
        <div class="event-popup-title" style="color:#ef4444;"><i class="fa-solid fa-eye"></i> Driver Eyewitness Viewpoint & Point of Inevitable Collision (05:00:14 AM)</div>
        <div class="event-popup-desc">
          <strong>Orientation:</strong> Facing 0.0° Straight North into Frontage Rd / SH 121 Ramp (exact perspective of Google Street View photo).<br>
          <strong>Eyewitness Observation:</strong> Looking east through right window past Waffle House / Shell, driver observed the white BMW approaching the crosswalk at 42 MPH without slowing.<br>
          <strong>Point of No Escape:</strong> Unit 1 was fully committed and aligned north. Realizing the BMW would violate the signal, collision was physically unavoidable with nowhere to steer.
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
    signalMarkerU2 = L.marker([32.955130, -97.037980], {
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
          <strong>Hardware Interlock:</strong> Physical MMU unit in cabinet monitors circuit voltages.<br>
          <strong>Scientific Proof:</strong> It is <em>physically and electronically impossible</em> for opposing through traffic to receive a yellow or green signal while the protected left-turn green arrow is illuminated. Any conflict forces 4-way emergency flashing red.
        </div>
      </div>
    `, { className: 'event-map-popup' });

    // 2g. Aloft Hotel Uber Pickup Route Destination Beacon
    const aloftBeaconHtml = `
      <div style="background:rgba(15,23,42,0.92); border:1.5px solid #a855f7; border-radius:6px; padding:2px 6px; box-shadow:0 3px 8px rgba(0,0,0,0.6); display:flex; align-items:center; gap:4px; font-size:9.5px; font-weight:800; color:#a855f7; white-space:nowrap;">
        <i class="fa-solid fa-hotel" style="color:#a855f7;"></i> Destination: Aloft Hotel (Uber Period 2)
      </div>
    `;
    L.marker([32.956600, -97.037800], {
      icon: L.divIcon({ html: aloftBeaconHtml, className: 'aloft-beacon-marker', iconSize: [185, 22], iconAnchor: [92, 11] }),
      zIndexOffset: 920
    }).addTo(map).bindPopup(`
      <div class="event-popup-content">
        <div class="event-popup-title" style="color:#a855f7;"><i class="fa-solid fa-hotel"></i> Accepted Uber Dispatch Destination</div>
        <div class="event-popup-desc">
          <strong>Destination:</strong> Aloft Dallas DFW Airport Grapevine (1033 N Main St / N SH 121) en route to DFW Airport.<br>
          <strong>Status:</strong> Active Period 2 commercial dispatch accepted at 04:59 AM ($12.07 upfront fare). Rider canceled post-crash at 05:05 AM.
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

    if (!p0 || !p1) return p0 || { lat: 0, lon: 0, spd: 0, hd: 0, alt: 0, acc: 0, turnRate: 0, steeringAngle: 0, t: '' };

    // Linear interpolation for SUV
    let lat = p0.lat + (p1.lat - p0.lat) * ratio;
    let lon = p0.lon + (p1.lon - p0.lon) * ratio;
    const spd = p0.spd + (p1.spd - p0.spd) * ratio;
    const kt = p0.kt + (p1.kt - p0.kt) * ratio;
    const alt = p0.alt + (p1.alt - p0.alt) * ratio;
    const acc = p0.acc + (p1.acc - p0.acc) * ratio;

    // Angle interpolation for heading
    let dAngle = (p1.hd - p0.hd) % 360;
    if (dAngle > 180) dAngle -= 360;
    if (dAngle < -180) dAngle += 360;
    let hd = (p0.hd + dAngle * ratio + 360) % 360;

    // Accurate Northward Turn Progression towards 121 Frontage Rd (5:00:12 - 5:00:15 AM)
    const curGlobal = activeStartIndex + idxFloat;
    if (curGlobal >= 12780 && curGlobal <= 12786) {
      if (curGlobal >= 12780 && curGlobal < 12781) {
        const turnProgress = (curGlobal - 12780);
        hd = 75.0 - (75.0 - 45.0) * turnProgress;
        lat = 32.955021 + (32.955038 - 32.955021) * turnProgress;
        lon = -97.038284 + (-97.038185 - (-97.038284)) * turnProgress;
      } else if (curGlobal >= 12781 && curGlobal < 12782) {
        const turnProgress = (curGlobal - 12781);
        hd = 45.0 - (45.0 - 15.0) * turnProgress;
        lat = 32.955038 + (32.955075 - 32.955038) * turnProgress;
        lon = -97.038185 + (-97.038105 - (-97.038185)) * turnProgress;
      } else if (curGlobal >= 12782 && curGlobal < 12782.8) {
        // Driving straight North into 121 northbound lanes prior to strike (Front 100% clear of turn)
        const turnProgress = (curGlobal - 12782) / 0.8;
        hd = 15.0 - 15.0 * turnProgress; // Straightens to 0.0° North
        lat = 32.955075 + (32.955095 - 32.955075) * turnProgress;
        lon = -97.038105 + (-97.038090 - (-97.038105)) * turnProgress;
      } else if (curGlobal >= 12782.8 && curGlobal < 12783) {
        // Impact moment: struck squarely on 3 O'CLOCK right middle/rear passenger side and pushed westward into final resting position
        const pushProgress = (curGlobal - 12782.8) / 0.2;
        hd = 0.0;
        lat = 32.955095 + (32.955086 - 32.955095) * pushProgress;
        lon = -97.038090 + (-97.038101 - (-97.038090)) * pushProgress;
      } else {
        hd = 0.0; // Stationary resting heading facing Straight North along 121 Frontage Rd
        lat = 32.955086;
        lon = -97.038101;
      }
    }

    // Calculate Turn Rate (deg/s) and Steering Angle
    const prevIdx = Math.max(0, idx0 - 1);
    const nextIdx = Math.min(activePoints.length - 1, idx1 + 1);
    let windowDelta = (activePoints[nextIdx].hd - activePoints[prevIdx].hd) % 360;
    if (windowDelta > 180) windowDelta -= 360;
    if (windowDelta < -180) windowDelta += 360;
    
    const turnRate = windowDelta / Math.max(1, nextIdx - prevIdx);
    const steeringAngle = Math.max(-32, Math.min(32, turnRate * 2.5));

    // Calculate Oncoming White Sedan Position (Westbound at 50 MPH trying to beat yellow light)
    const currentGlobalIdx = activeStartIndex + idxFloat;
    const deltaTToImpact = currentGlobalIdx - IMPACT_GLOBAL_INDEX; // <= 0 before impact
    
    // Target Rest Point: BMW front nose resting directly against the right middle/rear flank of the Atlas
    // Atlas resting coordinates: [32.955086, -97.038101] facing North (0.0° N)
    // Atlas right middle side: [32.955086, -97.038085]
    // BMW resting coordinates: [32.955086, -97.038075] facing West (270.0° W)
    const sedanImpactRestLat = 32.955086;
    const sedanImpactRestLon = -97.038075;
    let sedanLat = sedanImpactRestLat;
    let sedanLon = sedanImpactRestLon;
    let sedanHeading = 270.0;
    let sedanVisible = false;
    let sedanDistFt = 0;
    
    // Cruise Speed: Steady 42.0 MPH cruising speed (posted limit 45 mph) from Waffle House / Bethel Rd approach
    // Driver thought they were clearing a late yellow light (no intentional acceleration or speeding into the SUV)
    let sedanSpeedMph = 42.0;
    if (deltaTToImpact >= 0) {
      sedanSpeedMph = 0.0; // Rest post-impact
    }

    if (deltaTToImpact >= -25.0) {
      sedanVisible = true;
      if (deltaTToImpact <= 0) {
        const speedMs = sedanSpeedMph * 0.44704; // 18.776 m/s
        sedanDistFt = Math.round(Math.abs(deltaTToImpact) * speedMs * 3.28084);

        // Calibrate trajectory: BMW does not pass the intersection stop bar (-97.03785)
        // until deltaTToImpact >= -1.05s, when the Atlas is already oriented North and through the turn.
        if (deltaTToImpact >= -1.05) {
          // Inside intersection box traveling straight west towards Atlas right flank
          const r = deltaTToImpact / -1.05; // 1.0 at stop bar, 0.0 at impact
          sedanLat = sedanImpactRestLat + (32.955095 - sedanImpactRestLat) * r;
          sedanLon = sedanImpactRestLon + (-97.037850 - sedanImpactRestLon) * r;
          sedanHeading = 270.0;
        } else if (deltaTToImpact >= -3.5) {
          // Approaching stop bar along Bass Pro Dr (outside intersection)
          const r = (deltaTToImpact - (-1.05)) / (-3.5 - (-1.05));
          sedanLat = 32.955095 + (32.955115 - 32.955095) * r;
          sedanLon = -97.037850 + (-97.037300 - (-97.037850)) * r;
          sedanHeading = 270.0;
        } else {
          // Cruising westbound from east of Bethel Rd / Waffle House commercial drive
          const timePast = deltaTToImpact - (-3.5); // negative
          sedanLat = 32.955115;
          const dlon = (timePast * speedMs) / (111320.0 * Math.cos(32.955115 * Math.PI / 180));
          sedanLon = -97.037300 - dlon;
          sedanHeading = 270.0;
        }
      } else {
        // T-Bone Impact Rest Position: 2014 BMW 550 front bumper against 2025 Atlas right middle flank
        sedanLat = sedanImpactRestLat;
        sedanLon = sedanImpactRestLon;
        sedanHeading = 270.0;
        sedanDistFt = 0;
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

  // --- Update HUD, Animated Vehicles & Camera Scaling ---
  function updateUI(idxFloat) {
    if (activePoints.length === 0) return;

    const state = getInterpolatedState(idxFloat);

    // 1. Black SUV Position & Heading
    suvMarker.setLatLng([state.lat, state.lon]);
    const suvElem = document.getElementById('suvContainer');
    if (suvElem) {
      suvElem.style.transform = `rotate(${state.hd}deg)`;
      
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
        sedanElem.style.transform = `rotate(${state.sedanHeading}deg)`;
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
      let centerLat = state.lat;
      let centerLon = state.lon;

      if (isTurnScaleEnabled) {
        // Lookahead camera offset
        const lookaheadMeters = Math.min(45, Math.max(15, state.spd * 0.7));
        const headingRad = (state.hd * Math.PI) / 180;
        
        const dLat = (lookaheadMeters * Math.cos(headingRad)) / 111320;
        const dLon = (lookaheadMeters * Math.sin(headingRad)) / (111320 * Math.cos((state.lat * Math.PI) / 180));
        
        centerLat += dLat;
        centerLon += dLon;

        // Dynamic Turn Adaptive Zoom
        if (state.isHardTurn || (state.spd < 20 && Math.abs(state.turnRate) > 3) || state.isImpact) {
          targetZoom = 19.5;
        } else if (state.spd > 55) {
          targetZoom = 17.0;
        } else if (state.spd > 35) {
          targetZoom = 17.5;
        } else {
          targetZoom = 18.5;
        }

        currentZoom = currentZoom + (targetZoom - currentZoom) * 0.06;
        
        if (Math.abs(map.getZoom() - Math.round(currentZoom)) >= 1) {
          map.setView([centerLat, centerLon], Math.round(currentZoom), { animate: false });
        } else {
          map.panTo([centerLat, centerLon], { animate: false });
        }
      } else {
        map.panTo([centerLat, centerLon], { animate: false });
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
          hudSedanBadge.textContent = '42.0 MPH';
          hudSedanBadge.style.background = 'rgba(245,158,11,0.25)';
          hudSedanBadge.style.color = '#fbbf24';
          hudSedanDistance.textContent = `Cruising @ 42.0 MPH (late yellow attempt) | Approaching stop bar | Dist: ${state.sedanDistFt} ft`;
        } else {
          hudSedanBadge.textContent = 'INEVITABLE IMPACT';
          hudSedanBadge.style.background = 'rgba(239,68,68,0.45)';
          hudSedanBadge.style.color = '#fff';
          hudSedanDistance.textContent = `BMW continuing through light without slowing | Driver viewpoint: No avenue of escape`;
        }
      } else {
        hudSedanBadge.textContent = "12 O'CLOCK IMPACT";
        hudSedanBadge.style.background = 'rgba(239,68,68,0.4)';
        hudSedanBadge.style.color = '#fff';
        hudSedanDistance.textContent = "2014 BMW 550 12 O'Clock front against 2025 Atlas 3 O'Clock right flank | Atlas front undamaged";
      }
    } else {
      hudSedanBadge.textContent = 'Not In Range';
      hudSedanBadge.style.background = 'rgba(148,163,184,0.15)';
      hudSedanBadge.style.color = '#94a3b8';
      hudSedanDistance.textContent = '42.0 MPH Steady Cruise';
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
        signalInterlockExplain.innerHTML = '<strong>West Stop Bar:</strong> Unit 1 stopped at West Terminal stop line for 26.0s on Red. In-pavement loop detector calls TxDOT master controller.';

        if (mapWestRed) { mapWestRed.className = 'map-signal-lens red on'; mapWestYellow.className = 'map-signal-lens yellow off'; mapWestGreen.className = 'map-signal-lens green off'; if (mapWestLabel) { mapWestLabel.textContent = 'WEST: 26s RED'; mapWestLabel.style.color = '#f87171'; } }
        if (mapU1Red) { mapU1Red.className = 'map-signal-lens red on'; mapU1Yellow.className = 'map-signal-lens yellow off'; mapU1Green.className = 'map-signal-lens green off'; if (mapU1Label) { mapU1Label.textContent = 'EAST: RED'; mapU1Label.style.color = '#f87171'; } }
        if (mapU2Red) { mapU2Red.className = 'map-signal-lens red off'; mapU2Yellow.className = 'map-signal-lens yellow off'; mapU2Green.className = 'map-signal-lens green on'; if (mapU2Label) { mapU2Label.textContent = 'FLOW GREEN'; mapU2Label.style.color = '#34d399'; } }

      } else if (gIdx >= 12752 && gIdx < 12773) {
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
        signalInterlockExplain.innerHTML = '<strong>Bridge Acceleration (39 MPH):</strong> West light turned Green. Driver accelerated across bridge. Ahead left-turn arrow is not yet green, holding queue.';

        if (mapWestRed) { mapWestRed.className = 'map-signal-lens red off'; mapWestYellow.className = 'map-signal-lens yellow off'; mapWestGreen.className = 'map-signal-lens green on'; if (mapWestLabel) { mapWestLabel.textContent = 'WEST: GREEN'; mapWestLabel.style.color = '#34d399'; } }
        if (mapU1Red) { mapU1Red.className = 'map-signal-lens red on'; mapU1Yellow.className = 'map-signal-lens yellow off'; mapU1Green.className = 'map-signal-lens green off'; if (mapU1Label) { mapU1Label.textContent = 'TURN: RED'; mapU1Label.style.color = '#f87171'; } }
        if (mapU2Red) { mapU2Red.className = 'map-signal-lens red off'; mapU2Yellow.className = 'map-signal-lens yellow off'; mapU2Green.className = 'map-signal-lens green on'; if (mapU2Label) { mapU2Label.textContent = 'FLOW GREEN'; mapU2Label.style.color = '#34d399'; } }

      } else if (gIdx >= 12773 && gIdx < 12778.5) {
        // Stage 3: Deceleration on Amber/Orange Ahead (05:00:06 - 05:00:10 AM)
        signalPhaseBadge.className = 'badge-tag signal-badge yellow';
        signalPhaseBadge.textContent = 'Amber Ahead: Slowing for Arrow';

        if (westRedLight) {
          westRedLight.className = 'signal-lens red off';
          westYellowLight.className = 'signal-lens yellow off';
          westGreenLight.className = 'signal-lens green on';
          westSignalLabel.className = 'signal-state-label green';
          westSignalLabel.textContent = 'FLOW GREEN';
        }

        // East Turn Light: Amber clearance change / awaiting protected arrow
        u1RedLight.className = 'signal-lens red off';
        u1YellowLight.className = 'signal-lens yellow on';
        u1GreenLight.className = 'signal-lens green off';
        u1SignalLabel.className = 'signal-state-label yellow';
        u1SignalLabel.textContent = 'AMBER (SLOWING)';

        // BMW: Amber clearance
        u2RedLight.className = 'signal-lens red off';
        u2YellowLight.className = 'signal-lens yellow on';
        u2GreenLight.className = 'signal-lens green off';
        u2SignalLabel.className = 'signal-state-label yellow';
        u2SignalLabel.textContent = 'AMBER 3s';

        interlockBadge.textContent = 'AMBER CLEARANCE';
        interlockBadge.style.color = '#fbbf24';
        signalInterlockExplain.innerHTML = '<strong>Why You Slowed Down:</strong> Ahead lights displayed amber/orange. Driver decelerated from 39 to 23 MPH entering turn bay, waiting for the arrow to turn green.';

        if (mapWestRed) { mapWestRed.className = 'map-signal-lens red off'; mapWestYellow.className = 'map-signal-lens yellow off'; mapWestGreen.className = 'map-signal-lens green on'; if (mapWestLabel) { mapWestLabel.textContent = 'WEST: GREEN'; mapWestLabel.style.color = '#34d399'; } }
        if (mapU1Red) { mapU1Red.className = 'map-signal-lens red off'; mapU1Yellow.className = 'map-signal-lens yellow on'; mapU1Green.className = 'map-signal-lens green off'; if (mapU1Label) { mapU1Label.textContent = 'TURN: AMBER'; mapU1Label.style.color = '#fbbf24'; } }
        if (mapU2Red) { mapU2Red.className = 'map-signal-lens red off'; mapU2Yellow.className = 'map-signal-lens yellow on'; mapU2Green.className = 'map-signal-lens green off'; if (mapU2Label) { mapU2Label.textContent = 'AMBER 3s'; mapU2Label.style.color = '#fbbf24'; } }

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
        u2SignalLabel.textContent = 'SOLID RED (LOCKED)';

        interlockBadge.textContent = '100% PROTECTED';
        interlockBadge.style.color = '#10b981';
        if (gIdx < 12781.5) {
          signalInterlockExplain.innerHTML = '<strong>White Pavement Arrow:</strong> As your vehicle reached the painted pavement arrow, the Left-Turn Green Arrow illuminated! Driver initiated turn legally on green arrow.';
        } else {
          signalInterlockExplain.innerHTML = '<strong>Point of Inevitable Collision (Street View Match):</strong> Vehicle is aligned North into ramp. Looking east, driver saw BMW continuing through the light without braking, realizing impact was unavoidable.';
        }

        if (mapWestRed) { mapWestRed.className = 'map-signal-lens red off'; mapWestYellow.className = 'map-signal-lens yellow off'; mapWestGreen.className = 'map-signal-lens green on'; if (mapWestLabel) { mapWestLabel.textContent = 'WEST: GREEN'; mapWestLabel.style.color = '#34d399'; } }
        if (mapU1Red) { mapU1Red.className = 'map-signal-lens red off'; mapU1Yellow.className = 'map-signal-lens yellow off'; mapU1Green.className = 'map-signal-lens green on'; if (mapU1Label) { mapU1Label.textContent = 'GREEN ARROW'; mapU1Label.style.color = '#34d399'; } }
        if (mapU2Red) { mapU2Red.className = 'map-signal-lens red on'; mapU2Yellow.className = 'map-signal-lens yellow off'; mapU2Green.className = 'map-signal-lens green off'; if (mapU2Label) { mapU2Label.textContent = 'LOCKED RED'; mapU2Label.style.color = '#f87171'; } }

      } else {
        // Stage 4: Collision Impact (05:00:15 AM onward)
        signalPhaseBadge.className = 'badge-tag signal-badge red';
        signalPhaseBadge.textContent = 'RED LIGHT VIOLATION';

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
        u1SignalLabel.textContent = 'GREEN ARROW (VIOLATED)';

        u2RedLight.className = 'signal-lens red on';
        u2YellowLight.className = 'signal-lens yellow off';
        u2GreenLight.className = 'signal-lens green off';
        u2SignalLabel.className = 'signal-state-label red';
        u2SignalLabel.textContent = 'ILLEGAL RED RUNNING';

        interlockBadge.textContent = 'SIGNAL VIOLATION';
        interlockBadge.style.color = '#ef4444';
        signalInterlockExplain.innerHTML = '<strong style="color:#ef4444;">Violation Confirmed:</strong> Unit 2 entered intersection at 50 MPH against Solid Red, T-boning Unit 1 under active green arrow.';

        if (mapWestRed) { mapWestRed.className = 'map-signal-lens red off'; mapWestYellow.className = 'map-signal-lens yellow off'; mapWestGreen.className = 'map-signal-lens green on'; if (mapWestLabel) { mapWestLabel.textContent = 'WEST: GREEN'; mapWestLabel.style.color = '#34d399'; } }
        if (mapU1Red) { mapU1Red.className = 'map-signal-lens red off'; mapU1Yellow.className = 'map-signal-lens yellow off'; mapU1Green.className = 'map-signal-lens green on'; if (mapU1Label) { mapU1Label.textContent = 'GREEN ARROW'; mapU1Label.style.color = '#34d399'; } }
        if (mapU2Red) { mapU2Red.className = 'map-signal-lens red on'; mapU2Yellow.className = 'map-signal-lens yellow off'; mapU2Green.className = 'map-signal-lens green off'; if (mapU2Label) { mapU2Label.textContent = 'VIOLATED RED'; mapU2Label.style.color = '#ef4444'; } }
      }
    }

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
      currentIndex += effectiveSpeed * deltaTimeSec;

      // Check Automatic Stop at Impact (05:00:15 AM = index 12783)
      const impactLocalIdx = IMPACT_GLOBAL_INDEX - activeStartIndex;
      if (isAutoStopImpactEnabled && prevIdx < impactLocalIdx && currentIndex >= impactLocalIdx) {
        currentIndex = impactLocalIdx;
        pausePlayback();
        updateUI(currentIndex);
        map.setView([32.955086, -97.038101], 19.5, { animate: true });
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
        <td>${isImpact ? '17.2 &rarr; 0.0 MPH (SUV) vs 50 MPH (Sedan)' : '-'}</td>
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
  presetSelect.value = 'accident_focus';
  if (mobilePresetSelect) mobilePresetSelect.value = 'accident_focus';
  applyPreset('accident_focus', 12648);
  requestAnimationFrame(animationLoop);

})();
