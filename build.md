# COC-Sync — Full Functional Prototype Spec (FINAL)
Supersedes the earlier build spec. This is the complete reference — feed this whole file to Claude Code.

---

## 1. Stack (unchanged, confirmed)
Node/Express + Socket.io · Supabase (Postgres + Storage) · React/Vite/Tailwind/Leaflet · OpenRouter vision model · Render/Railway + Vercel free tiers.

---

## 2. Concurrency & Traffic Handling

| Concern | Handling |
|---|---|
| Duplicate submits (user double-taps / network retry) | Client generates a UUID `idempotency_key` per report attempt; server `UNIQUE` constraint on `signals.idempotency_key`, duplicate insert returns the original record, not a new one |
| Complaint spam / abuse | `express-rate-limit`: 10 submissions per IP per hour on `/api/complaints` |
| AI call is slow or times out | 8s timeout on OpenRouter call. On timeout/error: still create the signal with `category=NULL, department='GVMC General', confidence=0`, flag `ai_failed=true`. **Never block or drop a citizen report because AI failed.** Retry queue processes flagged signals later. |
| Two departments/field teams try to accept the same incident at once | Optimistic locking: `UPDATE incidents SET status='assigned', assigned_team_id=$1 WHERE id=$2 AND status='reported'`. If `rowCount === 0`, return `409 Conflict — already assigned` to the loser. |
| WebSocket broadcast storm | No global broadcast. Socket rooms: `ward:<ward>`, `department:<id>`, `role:supervisor`. Each client joins only relevant rooms; incidents emit only to their ward + assigned department + supervisor room. |
| DB connection exhaustion (Supabase free tier caps ~60 connections) | Use `pg.Pool` with `max: 10` on the server, never open per-request connections |
| Field team GPS pings flooding the DB | Debounce: accept at most 1 ping per team per 15s server-side, drop the rest silently |
| Correlation engine race (two signals arriving simultaneously trying to create the same incident) | Wrap signal-insert + correlation-match + incident-insert/update in a single DB transaction (`BEGIN...COMMIT`), correlation query uses `SELECT ... FOR UPDATE` on candidate incidents to lock the row during merge decision |
| Long-running requests blocking event loop | AI calls and DB writes are all `async/await`, nothing synchronous/blocking in the request path |

---

## 3. Priority Scoring & SLA (detailed)

**Score formula:**
```
priority_score =
    category_weight[category]        // pothole=3, garbage=2, water=4, electrical=3, medical=10, crime=8
  + (occurrence_count - 1) * 2        // repeated reports of same issue = more urgent
  + sensitive_zone_bonus              // +5 if within 150m of hardcoded school/hospital list
  + urgency_weight[urgency]           // low=0, medium=2, high=5, critical=10
  + age_bonus                         // +1 per 20 minutes unresolved, capped at +10 (prevents starvation)
```

**SLA timers (by urgency), checked by a cron every 5 min:**
| Urgency | SLA | On breach |
|---|---|---|
| critical | 15 min | auto-escalate to supervisor alert + reassign to next-nearest team |
| high | 1 hr | supervisor dashboard flags in orange |
| medium | 4 hr | ages into higher priority_score, no alert |
| low | 24 hr | ages into higher priority_score, no alert |

This prevents the classic bug: a low-priority ticket sitting forever because it's always outranked by new high-priority ones. Age bonus guarantees it eventually surfaces.

---

## 4. UI Structure (every screen, every state)

### Citizen — ReportForm
- Fields: description (required, min 5 chars), photo (required, max 5MB, jpg/png only), location (GPS auto-fill; **if permission denied → fallback to manual pin-drop on a Leaflet map, required before submit**), ward (auto-derived from pin, editable dropdown as override)
- States: idle → submitting (spinner, disable button to prevent double-submit) → success (shows complaint ID + "Save this ID" prompt) → error (network/validation, retry button, form data preserved)
- Validation: reject empty description, reject non-image files, reject if no location set

### Citizen — StatusLookup
- Input: complaint ID or phone number
- States: loading → found (timeline: reported → acknowledged → assigned → in_progress → resolved, with timestamps) → not found (clear message, not a blank screen)

### Department — Login
- Fields: department code + PIN
- Session token stored client-side, 8-hour expiry, auto-logout with redirect on expiry (not a silent failure)

### Department — Queue
- List sorted by `priority_score DESC`, live-updates via socket with a highlight flash on new/changed rows
- Filter chips: status, urgency
- Empty state: "No incidents assigned" (not a blank page)
- Each row: category icon, ward, occurrence_count badge, age, urgency color tag

### Department — IncidentDetail
- Shows merged signal details, original photo(s), map pin
- Buttons: Accept / Reroute (with reason dropdown) / Resolve (opens photo upload widget)
- Resolve flow: upload photo → preview before confirm → submit → shows "Verifying..." spinner while AI check runs → shows result (Resolved-Verified / Disputed, with reason if disputed)

### Supervisor — Dashboard
- Leaflet map, marker **clustering** enabled (critical — without it, dense wards become an unreadable pile of pins)
- Pins colored by urgency, sized by priority_score
- Side panel: incident list, same filters as department view plus department filter
- Toast notification on `incident:new` with critical urgency
- Empty/loading states same pattern as above

### Supervisor — WardSummary / DepartmentLeaderboard
- Simple bar charts (recharts): open vs resolved per ward, avg resolution time per department
- Loading skeleton, not blank white space, while stats endpoint responds

**Mobile-first rule:** citizen-facing screens (ReportForm, StatusLookup) must work on a phone browser at 375px width — this is the screen judges will actually use to test your demo.

---

## 5. API Contracts (request/response, status codes)

### `POST /api/complaints`
```json
Request:
{
  "idempotency_key": "uuid",
  "description": "string",
  "photo_url": "string (uploaded to storage first)",
  "lat": 17.72, "lon": 83.30,
  "ward": "Ward 12"
}

Response 201:
{ "id": 101, "status": "reported", "category": "pothole", "department": "Roads & Engineering", "urgency": "medium" }

Response 400: { "error": "description or photo missing" }
Response 429: { "error": "rate limit exceeded, try again later" }
```

### `POST /api/incidents/:id/accept`
```
Response 200: { "id": 101, "status": "assigned", "assigned_team_id": 4 }
Response 409: { "error": "already assigned" }
Response 404: { "error": "incident not found" }
```

### `POST /api/incidents/:id/resolve`
```json
Request: { "photo_url": "string" }
Response 200: { "id": 101, "status": "resolved_verified", "ai_check_result": "resolved" }
   or       { "id": 101, "status": "disputed", "ai_check_result": "still_present" }
```

All endpoints: validate input types server-side (never trust client), return consistent `{ error: string }` shape on failure, log request id for traceability.

---

## 6. Database — Constraints & Integrity (adds to earlier schema)

```sql
ALTER TABLE signals ADD COLUMN idempotency_key TEXT UNIQUE;
ALTER TABLE signals ADD COLUMN ai_failed BOOLEAN DEFAULT false;
ALTER TABLE incidents ADD CONSTRAINT valid_status
  CHECK (status IN ('reported','acknowledged','assigned','in_progress','resolved_verified','disputed'));

-- auto-update timestamp trigger
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER incidents_updated_at BEFORE UPDATE ON incidents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```
All multi-step writes (signal insert → correlation → incident create/update) run inside one transaction — a crash mid-sequence must not leave an orphaned signal with no incident.

---

## 7. Storage (Supabase Storage)

- Bucket: `coc-sync-photos`, public read, authenticated write
- Path convention: `citizen/{signal_id}.jpg`, `resolution/{incident_id}/{timestamp}.jpg`
- Max 5MB per upload, enforced client-side and server-side
- Only `image/jpeg`, `image/png` accepted — reject everything else with a clear error, not a silent failure

---

## 8. Edge Case Checklist (test all of these before the demo)

| Scenario | Expected behavior |
|---|---|
| Citizen submits with GPS denied | Manual pin-drop required, submit blocked until set |
| Citizen double-taps submit | Idempotency key prevents duplicate incident |
| AI call fails/times out | Falls to GVMC General, still creates the record, never silently drops |
| AI confidence < 0.5 | Routes to GVMC General regardless of guessed category |
| Two departments accept same incident at once | Second gets 409, sees it's already taken, no duplicate assignment |
| No field team available | Incident stays in department queue for manual assign, doesn't error out |
| Same pothole reported 3 times | Merges into 1 incident, occurrence_count=3, does NOT create 3 separate cards |
| Two different issues within 300m (pothole + garbage) | Category mismatch check prevents wrong merge — must check category, not just distance |
| Photo upload fails mid-request (bad network) | Form preserves entered data, shows retry, doesn't force re-typing the description |
| Old low-priority ticket sits for hours | Age bonus raises priority_score, eventually surfaces on dashboard — not stuck forever |
| Supervisor dashboard with 200+ pins in one ward | Marker clustering keeps it readable, not a pile of overlapping icons |
| Department session expires mid-task | Redirect to login, no silent broken state |
| Citizen looks up wrong/nonexistent complaint ID | Clear "not found" message, not a blank page or crash |

---

## 9. Free Demo Datasets (confirmed, public)

- Kaggle: `1.2M Complaints — BMC Civic Complaint Resolution` — seed realistic descriptions/categories/wards
- Mendeley: `QR4Change Urban Civic Issues Image Dataset` (potholes + garbage, real labeled photos) — use as real `photo_url` values, not placeholders
- Janaagraha `I Change My City` (OpenCity portal) — backup seed source

Seed script: pull ~40 records, remap to pilot ward names, backdate timestamps across the last 48 hours so the dashboard shows history + live incoming on top.

---

## 10. Definition of Done (what "functional prototype" means here)

- [ ] Citizen can submit a report from a phone browser and get a complaint ID
- [ ] AI routing runs on every submission, with graceful fallback if it fails
- [ ] Correlation engine merges duplicate nearby reports, doesn't merge unrelated categories
- [ ] Department can log in, see only their queue, accept/reroute/resolve
- [ ] Resolution photo triggers AI verification and updates status accordingly
- [ ] Supervisor dashboard updates live via WebSocket, no manual refresh needed
- [ ] Priority ordering visibly changes as new/aged incidents come in
- [ ] All edge cases in section 8 tested and pass
- [ ] Seeded with real dataset records, not fake placeholder text