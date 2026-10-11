# Architecture

## Overview

```
 Phone browser (PWA, React + TS + Vite)
   ├─ camera (getUserMedia, rear) ── ImageCapture.takePhoto / full-res video frame
   ├─ GPS (watchPosition, high accuracy) ── never IP geolocation
   ├─ compass (deviceorientationabsolute / iOS webkitCompassHeading)
   ├─ shared/verification  ◄── same code ──►  bundled into Code.gs
   └─ fetch POST text/plain {action, token, payload}
                │
                ▼
 Google Apps Script web app (executes as sheet owner, container-bound)
   ├─ auth (PBKDF2 passwords, session tokens, lockout, reset codes by email)
   ├─ RBAC + job-scoped access checks on EVERY action
   ├─ submitCapture: base64 → bytes → magic-byte MIME → server SHA-256
   │     → freshness/skew checks → authoritative verification → Drive + rows
   ├─ LockService script lock serializes all writes
   └─ hash-chained audit log, per-record hashes
                │
     ┌──────────┴──────────┐
     ▼                     ▼
 Google Sheet "Iroad"   Google Drive private folder
 (one tab per table)    Road Repair Evidence (private)/<job_id>/<BEFORE|AFTER>_<photo_id>.jpg
```

The data layer of the frontend is a thin `call(action, payload)` client (`src/lib/api`). Moving to Supabase later
means re-implementing the same actions (SQL + RLS + an Edge Function using the same `shared/verification`
module); UI code does not change.

## Why Google Sheets / Apps Script (and its trade-offs)

Chosen by the project owner as the initial backend. Compared with the Supabase design in the original brief:

| Requirement | Supabase design | This implementation |
|---|---|---|
| Row-level security | Postgres RLS | Every action checks the session's role and job access in code. Sheet is owner-only. |
| Private evidence storage | Private bucket + signed URLs | Private Drive folder. Images are streamed through the API to authorised users (no Drive links are ever shared). |
| Transactions | SQL transactions | Script lock + "validate everything, then write" ordering. Not truly atomic (see LIMITATIONS). |
| Immutable evidence | Triggers / revoked UPDATE | No API can edit or delete evidence. Direct sheet edits are **detected** via record hashes and the audit hash chain, and approval is blocked. |
| Server-side verification | Edge Function | Same TypeScript module bundled into Apps Script. |

## Sheets (tables)

Column lists live in `apps-script/src/00_Config.js` (`SCHEMA`). Highlights and deviations from the brief:

- **users**: profile and credentials together, because the sheet is private to the owner and credential columns
  are never returned by the API. `role ∈ {admin, inspector, reviewer}`, plus `active` and `must_change_password`.
- **repair_jobs**: brief columns plus `notes`, `cancel_reason`, `current_before_photo_id`,
  `current_after_photo_id`, `current_verification_id`, `after_attempts`, and an optional *planned* location
  (reference only, never evidence). `job_code` = `RR-<UTC year>-<6 digits>`, issued from the `counters` sheet
  under the lock.
- **repair_photos**: brief columns plus `attempt_number`, `status` (`ACTIVE | SUPERSEDED | INVALIDATED`),
  `status_reason`, `drive_file_id`, `location_fix_at`, `heading_measured_at`, `heading_uncertainty_deg`,
  `capture_method`, `received_at`, `record_hash`. *Why:* freshness has to be re-checkable on the server, attempts
  must stay as history, and an explicit status replaces deleting or overwriting. Only `status`/`status_reason` ever
  change after insert.
- **verification_results**: brief columns plus `attempt_number`, `thresholds` (a JSON snapshot) and
  `record_hash`. The pass flags may be **empty (null)**, meaning "could not be evaluated". `overall_status` is
  only PASS / FAIL / INSUFFICIENT_DATA. "PENDING" is shown in the UI when no verification row exists.
  One verification per After photo; the photo id is the idempotency key.
- **repair_reviews** (new): human decision (APPROVED / REJECTED / NEEDS_RECAPTURE) with a mandatory reason. Kept
  separate from the technical verification.
- **evidence_corrections** (new): the explicit correction process. An admin can INVALIDATE a photo with a reason.
  Nothing is deleted.
- **audit_logs**: `prev_hash` / `row_hash` form a SHA-256 chain.
- **sessions**, **password_resets**: only token and code hashes are stored.

Constraints enforced in code (`07_Capture.js`, `06_Jobs.js`): coordinate, accuracy and heading ranges; one ACTIVE
Before per job; an After needs an ACTIVE Before; a verification always references the job's current ACTIVE Before
and the new After; status changes only through `transitionJob` with the transition table below.

## Job status workflow

```
DRAFT ──Before saved──► AWAITING_REPAIR ──mark repaired──► AWAITING_AFTER_PHOTO
                                                     │
                       After saved, verification PASS │ verification FAIL / INSUFFICIENT_DATA
                                   ▼                  ▼
                            PENDING_REVIEW      NEEDS_RECAPTURE ──new After──► …
                         ┌───────┼───────────┐
                   approve│  reject│   request│recapture
                         ▼       ▼           ▼
                     APPROVED  REJECTED  NEEDS_RECAPTURE
                               └──new After──► PENDING_REVIEW / NEEDS_RECAPTURE
Any non-closed state ──cancel (reason)──► CANCELLED
Admin invalidates Before ──► DRAFT;  admin invalidates current After ──► NEEDS_RECAPTURE
```

- Only a PASS verification moves a job to PENDING_REVIEW, and APPROVED requires that the current
  verification is PASS and that its records are intact.
- Self-approval (the reviewer captured the evidence or is the assignee) is refused unless an admin enables
  `allow_self_approval`.
- Uploading an After photo never completes a job. Only a reviewer's APPROVE sets `completed_at`.

## Security model

- **Authentication**: email + password. PBKDF2-HMAC-SHA256 with a per-user salt, 10,000 iterations
  (limited by Apps Script CPU). After 5 failed attempts the account locks for 15 minutes, with an extra
  per-email throttle. Login errors are generic. Session tokens are 256-bit random values stored as SHA-256,
  last 12 hours by default, and can be revoked. Reset codes are 6 digits, expire after 30 minutes, are
  single-use, and are burned after repeated wrong guesses.
- **Authorisation**: decided only on the server from the stored role. Client role values are never trusted.
  Inspectors see only jobs assigned to them or created by them. A job someone cannot access returns NOT_FOUND,
  so job ids cannot be probed.
- **Evidence**: the server recomputes SHA-256 from the uploaded bytes and rejects a mismatch. MIME type comes from
  magic bytes. The capture method must be a live-camera method. Timestamps more than 2 minutes in the future or
  older than 15 minutes are rejected. Original bytes are stored unmodified. Thumbnails, when used, come from Drive
  and are for display only.
- **Spreadsheet injection**: values starting with `= + - @` are stored with a leading apostrophe. CSV export
  neutralises formulas.
- **PWA cache**: Workbox precaches only the app shell. Apps Script calls are `NetworkOnly`, and evidence images
  live only as in-memory object URLs.
- **No secrets in the frontend**: the only `VITE_*` values are the public web app URL and the map settings.
