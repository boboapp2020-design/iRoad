# Known limitations and future improvements

## Evidence and measurements

1. **Location and heading cannot be proven genuine.** GPS, compass and timestamps come from the client. A modified
   browser, a GPS-spoofing app or a script can submit plausible values. The server checks consistency (ranges,
   freshness, hash, MIME, live-capture method declaration) but cannot attest that a physical sensor produced them.
   Possible future work: Android Play Integrity / iOS App Attest in a native wrapper, server-side image forensics,
   cross-checks with the cell or Wi-Fi network.
2. **"Live camera only" is enforced by the UI, not cryptographically.** The app has no gallery upload, and the server
   requires `capture_method` ∈ live methods, but a crafted request could still upload an arbitrary JPEG.
3. **The original file**: on Android Chrome the photo comes from `ImageCapture.takePhoto()` (the camera's own JPEG).
   On iOS Safari (no ImageCapture) it is a full-resolution frame of the camera video track, encoded once as JPEG
   at quality 0.95. That encoded file is the stored original (never resized or recompressed afterwards), but it is
   not the sensor's native photo.
4. **GPS accuracy is an estimate**, not a guarantee (about a 68% radius on Android). A 3 m threshold may often be
   unattainable in urban canyons. The thresholds are never relaxed silently.
5. **Heading** is the device back-axis direction from fused sensors. It is affected by magnetic interference and
   calibration, and is magnetic rather than true north. Its relation to the lens optical axis is approximate.
   Behaviour of `webkitCompassHeading` in landscape on iOS must be confirmed on devices.
6. **Capture timestamps** use the device clock. The server rejects anything more than 2 minutes in the future or
   more than 15 minutes old on arrival, so clocks must be roughly correct.

## Google Sheets / Apps Script backend

7. **No real transactions.** All writes are serialized by `LockService`, and every validation runs before the first
   write. If Apps Script hits its execution time limit or an outage mid-write, a partial write is possible (for
   example a photo row without its verification). Writes run in a fixed order (Drive file → photo row →
   verification row → job status) so that such a state can be detected.
8. **The spreadsheet owner can edit anything.** Record hashes and the audit hash chain *detect* direct edits, and
   approval is blocked, but they cannot prevent them. An owner who recomputes every hash could forge the chain.
   Keep the owner account protected with 2-Step Verification, and never share the sheet or folder.
9. **Throughput and size**: every request reads whole sheets, and writes are serialized. This is suitable for small
   teams and thousands of jobs, not for tens of thousands. Apps Script quotas apply (execution time per request,
   simultaneous executions, MailApp daily quota for reset emails, Drive storage of the owner account). Uploads are
   base64, which adds about 33%. Images are limited to 20 MB.
10. **Password hashing** uses PBKDF2-SHA256 with 10,000 iterations, below current OWASP guidance (600,000), because
    of Apps Script CPU limits. Mitigations: lockout, throttling, a 10-character minimum, and an owner-only sheet.
11. **Session tokens live in `localStorage`**, which is readable by any script running on the origin (XSS). Mitigate
    with the CSP in DEPLOYMENT.md. The Supabase migration should move to httpOnly cookies or Supabase Auth.
12. **The web app must be deployed with "Anyone" access**, so the endpoint is public. All protection relies on
    application-level authentication. Rate limiting is basic (CacheService counters).
13. Thumbnails come from Drive and may not exist right after upload. The app then falls back to the original image.

## Not implemented in v1

- Offline capture queue. Captures must be uploaded while online; an unsent capture stays in memory only and is
  labelled as not yet verified.
- AI / computer-vision image alignment or comparison. A placeholder is shown on the comparison page, and
  `failure_reasons` and `rules_version` leave room for new checks.
- Lao localisation. Add `src/lib/i18n/lo.ts` with the same keys.
- Server-generated PDF. Reports are printed or saved as PDF from the browser; CSV export is available.

## Migrating to Supabase (planned)

The frontend talks to one `call(action, payload)` client. To migrate:

1. Create Postgres tables mirroring the sheets, with RLS policies equivalent to `canViewJob` / `canWorkOnJob`,
   immutability triggers, and a private Storage bucket.
2. Implement `submitCapture` as an Edge Function that imports `shared/verification` (Deno can import the TS files).
3. Replace `src/lib/api/client.ts` with Supabase calls that use the same action names, and move auth to Supabase Auth.
4. Export the sheets to CSV, copy the Drive files to Storage (paths are already `<job_id>/<TYPE>/<photo_id>.<ext>`),
   and verify the SHA-256 values after import.
