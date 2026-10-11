# Manual test checklist for real devices

> **Status:** these tests have **not yet been run on a real device**. The automated tests run in desktop Chromium
> with a fake camera, emulated GPS and synthetic orientation events. Record results in the table at the end.

## Prerequisites

- The app is served over **HTTPS**. The camera, GPS and orientation APIs need a secure context.
  `http://localhost` works only on the same computer.
- Apps Script is deployed and `VITE_APPS_SCRIPT_URL` is set. Test accounts exist for inspector, reviewer and admin.
- Go outdoors with an open view of the sky. Wait 1–2 minutes for the GPS to settle. Stay away from cars and metal
  structures.

## A. Android (Chrome, latest)

| # | Step | Expected |
|---|---|---|
| A1 | Open the site and install it (⋮ → Install app / Add to Home screen) | The icon appears and the app opens standalone |
| A2 | Sign in as the inspector and create a job | Current coordinates and accuracy are shown (reference only) |
| A3 | Press "Allow camera, location and compass" | The browser asks for camera and location; the **rear** camera opens |
| A4 | Deny camera permission (Settings → Site settings) and reopen | "Camera permission denied", the shutter is disabled |
| A5 | Deny location permission | "Location permission denied", the shutter is disabled |
| A6 | Indoors or under a roof | Accuracy > 3 m → red badge, shutter disabled, guidance shown |
| A7 | Outdoors, accuracy ≤ 3 m | Green badge "GPS accuracy: x.x m — acceptable." |
| A8 | Hold upright, rotate slowly through 360° | Compass and heading change smoothly, matching a reference compass app (±10°) |
| A9 | Point the camera straight at the ground | "Camera points too far up/down", shutter disabled |
| A10 | Rotate to **landscape** while pointing the same way | Heading changes by no more than ~3° |
| A11 | Capture → review → Save | "Before evidence saved". In Drive: the file exists; its size and SHA-256 match the row in `repair_photos` |
| A12 | Mark repaired → Navigate | Map shows the target and your position; distance updates; "Open in Google Maps" launches the Maps app; returning brings you back to the job |
| A13 | After capture 5 m away | "You are 5.x m from the original location. Move closer.", shutter disabled |
| A14 | After capture 20° rotated | "Heading differs by 20°…", shutter disabled |
| A15 | Within 3 m and 10° → capture → save | The result appears **only after** the server responds. Expect PASS |
| A16 | Turn on airplane mode, then press Save | "Not sure the server received it…", no PASS. Turn airplane mode off → Retry → saved once only (check the sheet) |
| A17 | Tap Save repeatedly | Only one row is added to `repair_photos` |
| A18 | Leave the app (home button) during capture, then return | The camera restarts or shows "Camera stopped. Tap to restart." |
| A19 | Calibration: wave the phone in a figure-8 near a car | Heading jitter or a ±° warning appears; capture is blocked if the heading is unstable |

## B. iPhone (Safari, iOS 16+)

| # | Step | Expected |
|---|---|---|
| B1 | Share → Add to Home Screen, then open | Standalone app |
| B2 | Press "Allow camera, location and compass" | **Three** prompts: motion & orientation (tap required), camera, location |
| B3 | Deny "Motion & Orientation" | "Heading sensor unavailable…", shutter disabled |
| B4 | Settings → Privacy → Location Services → Safari Websites → "Precise Location" **ON** | Without Precise Location, accuracy stays above 3 m: capture is blocked (correct behaviour) |
| B5 | Hold portrait, rotate 360°, compare with the Compass app | `webkitCompassHeading` follows the direction the rear camera faces (±10°). **Record the result: the key iOS assumption** |
| B6 | Rotate to landscape while pointing the same way | Record whether the heading stays the same. If it jumps by 90°, report it: iOS needs an orientation correction |
| B7 | Tilt so the camera points at the road (~45° down) | Heading stays stable |
| B8 | Repeat A11–A18 | Same expectations. The capture method will be `video_frame_canvas` (Safari has no ImageCapture) |
| B9 | Lock the screen during upload, then unlock | Upload shows unknown/failed and can be retried without creating a duplicate |

## C. Cross-checks (admin)

- Run "Verify audit log chain" → intact.
- In the sheet, change one `latitude` cell in `repair_photos`. The job page shows "Evidence record was modified
  outside the app", and approval is refused with EVIDENCE_TAMPERED. Undo the change afterwards.
- In Drive, replace an image file. "Check file integrity" reports a SHA-256 failure.
- An inspector account cannot open another inspector's job URL (it shows "not found").
- A reviewer cannot approve a FAIL or INSUFFICIENT_DATA job, and cannot approve their own captures unless the
  setting allows it.

## Results log

| Date | Device / OS / browser | Tests | Pass/Fail | Notes (accuracy reached, heading error vs reference) |
|---|---|---|---|---|
| | | | | |
