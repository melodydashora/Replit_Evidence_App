-- Vecto-Pilot READ-ONLY evidence queries for the 2026-08-28 collision window.
-- Window: 2026-08-28 07:00:00Z .. 2026-08-28 11:00:00Z  (= 02:00-06:00 CDT).  Impact 05:00:15 CDT = 10:00:15Z.
-- Run against the PRODUCTION DATABASE_URL first (Replit -> Database tool -> Settings -> connection string;
-- 'published deployment: Neon serverless Postgres (SSL required)' per drizzle.config.js), then the DEV (Helium) one.
-- Every statement is SELECT-only. Wrap in a READ ONLY transaction so nothing can write by accident:
BEGIN READ ONLY;
SET TIME ZONE 'America/Chicago';

-- 0. Sanity: what is this database, and what is the newest row in each key table?
SELECT current_database(), inet_server_addr(), now();
SELECT 'snapshots' t, count(*), min(created_at), max(created_at) FROM snapshots
UNION ALL SELECT 'offer_intelligence', count(*), min(created_at), max(created_at) FROM offer_intelligence
UNION ALL SELECT 'rankings', count(*), min(created_at), max(created_at) FROM rankings
UNION ALL SELECT 'strategies', count(*), min(created_at), max(created_at) FROM strategies
UNION ALL SELECT 'briefings', count(*), min(created_at), max(created_at) FROM briefings
UNION ALL SELECT 'coach_conversations', count(*), min(created_at), max(created_at) FROM coach_conversations
UNION ALL SELECT 'actions', count(*), min(created_at), max(created_at) FROM actions
UNION ALL SELECT 'connection_audit', count(*), min(occurred_at), max(occurred_at) FROM connection_audit;

-- 1. GPS snapshots (one per app-open / manual GPS refresh; lat/lng only, no speed/heading).
SELECT snapshot_id, created_at AT TIME ZONE 'UTC' AS created_utc, created_at AS created_cdt, local_iso, date,
       lat, lng, coord_key, h3_r8, city, formatted_address, timezone, status, user_id, session_id, permissions
FROM snapshots
WHERE created_at BETWEEN '2026-08-28 07:00:00+00' AND '2026-08-28 11:00:00+00'
ORDER BY created_at;

-- 1b. Wider bracket (whole night) in case the app was opened before 02:00 or after 06:00.
SELECT snapshot_id, created_at, lat, lng, formatted_address
FROM snapshots
WHERE created_at BETWEEN '2026-08-27 22:00:00+00' AND '2026-08-28 18:00:00+00'
ORDER BY created_at;

-- 2. Uber/Lyft offers captured by the Siri Shortcut hook (driver_lat/lng = phone GPS at offer time;
--    pickup/dropoff coords; created_at = server receipt time; offer_session_id / offer_sequence_num / seconds_since_last).
SELECT id, created_at, local_date, local_hour, device_id, source, input_mode, platform, product_type,
       driver_lat, driver_lng, coord_key, h3_index,
       pickup_address, pickup_lat, pickup_lng, pickup_miles, pickup_minutes,
       dropoff_address, dropoff_lat, dropoff_lng, ride_miles, ride_minutes,
       price, per_mile, surge, decision, user_override,
       offer_session_id, offer_sequence_num, seconds_since_last, raw_text
FROM offer_intelligence
WHERE created_at BETWEEN '2026-08-28 04:00:00+00' AND '2026-08-28 12:00:00+00'
ORDER BY created_at;

-- 3. Coach decisions on offers (may record the ACCEPTED request -> proves TNC period 2 'en route to pickup').
SELECT id, created_at, snapshot_id, offer_intelligence_id, platform, pickup_location, dropoff_location,
       ai_recommendation, user_decision, user_reasoning, screenshot_url
FROM coach_offer_decisions
WHERE created_at BETWEEN '2026-08-28 04:00:00+00' AND '2026-08-28 12:00:00+00'
ORDER BY created_at;

-- 4. Coach chat (voice/text) — timestamps + location_context/time_context JSON.
SELECT id, created_at, snapshot_id, role, left(content, 300) AS content, location_context, time_context, model_used
FROM coach_conversations
WHERE created_at BETWEEN '2026-08-28 04:00:00+00' AND '2026-08-28 12:00:00+00'
ORDER BY created_at;

-- 5. Waterfall artefacts tied to those snapshots (each row = the app was in use at that instant).
SELECT s.id, s.snapshot_id, s.status, s.phase, s.phase_started_at, s.created_at, s.updated_at
FROM strategies s WHERE s.created_at BETWEEN '2026-08-28 04:00:00+00' AND '2026-08-28 12:00:00+00' ORDER BY s.created_at;
SELECT ranking_id, created_at, snapshot_id, formatted_address, path_taken, total_ms
FROM rankings WHERE created_at BETWEEN '2026-08-28 04:00:00+00' AND '2026-08-28 12:00:00+00' ORDER BY created_at;
SELECT * FROM briefings WHERE created_at BETWEEN '2026-08-28 04:00:00+00' AND '2026-08-28 12:00:00+00' ORDER BY created_at;

-- 6. User activity pointers and UI actions (tap/dwell events carry venue lat/lng, not driver position).
SELECT user_id, session_start_at, last_active_at, current_snapshot_id, updated_at FROM users
WHERE last_active_at BETWEEN '2026-08-27 22:00:00+00' AND '2026-08-28 18:00:00+00';
SELECT action_id, created_at, snapshot_id, action, block_id, dwell_ms, lat, lng
FROM actions WHERE created_at BETWEEN '2026-08-28 04:00:00+00' AND '2026-08-28 12:00:00+00' ORDER BY created_at;

-- 7. Server-side connection audit (proves the gateway was up / restarted that night).
SELECT occurred_at, event, application_name, deploy_mode, reason FROM connection_audit
WHERE occurred_at BETWEEN '2026-08-28 04:00:00+00' AND '2026-08-28 12:00:00+00' ORDER BY occurred_at;

-- 8. Idempotency cache (created_at only; proves POST /api/blocks-fast calls).
SELECT key, status, created_at FROM http_idem
WHERE created_at BETWEEN '2026-08-28 04:00:00+00' AND '2026-08-28 12:00:00+00' ORDER BY created_at;

-- 9. Intercepted signals (legacy offer table) — same window.
SELECT id, created_at, device_id, latitude, longitude, platform, source, left(raw_text,200) raw_text, decision
FROM intercepted_signals
WHERE created_at BETWEEN '2026-08-28 04:00:00+00' AND '2026-08-28 12:00:00+00' ORDER BY created_at;

COMMIT;

-- Export (psql): \copy (SELECT ... ) TO 'C:/Users/melod/AppData/Local/Temp/claude/C--Users-melod/d0c11db9-35ff-4e08-a0de-88d4a2978b28/scratchpad/vp-0828-<table>.csv' CSV HEADER
-- Then: Get-FileHash -Algorithm SHA256 <csv>
