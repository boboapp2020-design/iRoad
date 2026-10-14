# Verification rules (current: `rr-verify-v5`)

> **v5 (current), decided by the project owner:** GPS drifts too much on phones to decide alone, so the After photo
> passes on a **weighted match score (0–100)**:
>
> | Part | Points | Full when | Zero when |
> |---|---|---|---|
> | View similarity (top 40% of the frame) | 50 | similarity ≥ 70 | ≤ 30 |
> | Heading closeness | 30 | ≤ 3° | 40% of the points remain at the 10° limit |
> | GPS distance | 20 | ≤ 5 m | 30 m |
>
> **Hard limits** (fail regardless of score): heading ±10°, distance ≤ 30 m, fresh readings, camera capture, After
> later than Before. **Score ≥ 70 → PASS; 55–69 → PASS with `MATCH_SCORE_BORDERLINE` (reviewer must look); < 55 →
> FAIL `MATCH_SCORE_LOW`.** From the 3rd attempt the inspector may attach a reason; a low score then becomes PASS with
> `MANUAL_REVIEW_REQUESTED` so the reviewer decides by eye (hard limits still apply).
>
> **View similarity** (`src/features/capture/imageSimilarity.ts`): both photos are reduced to a 64×48 grid of
> Sobel edge strength; only the top 40% of the frame is compared (the repaired surface, passing cars and the
> date/name stamp sit lower), small shifts (±6%) and a small zoom (8%) are searched, and the best normalised
> correlation is the score. It is measured on the device, stored in the photo metadata and the verification, and
> **recomputed from the stored photos when the reviewer opens the comparison**; a difference over 10 points is flagged.
>
> **Calibration** (`e2e/similarity.spec.ts`, road photos from the client mockup, real browser): the same spot re-shot
> with shifts, zoom, 3° tilt, another day's light, glare, tree shadows, cars, pedestrians and blur scored 74–100; the
> same road before vs after repair 81–83; other roads 0–31. The thresholds are starting values to be re-tuned with
> field data under a new rules version. Every photo also carries a burned-in stamp (job, date/time, inspector,
> coordinates, heading) in the bottom band.

> **v4, decided by the project owner:** same as v3, but the After photo must be **≤ 5 m** from the Before
> position (was 1 m). Field tests showed that a phone standing on the same spot drifts 3–5 m, so 1 m failed correct
> photos. Heading stays **±10°**. To get the exact framing the camera shows the Before photo as a semi-transparent
> overlay, and the app stores an image-similarity score (0–100) in the After photo's device metadata. The score is a
> client-side aid for the reviewer, **not** a pass/fail criterion and not tamper-proof.

> **v3, decided by the project owner:** GPS accuracy is **not a criterion** for either photo. It is
> still recorded and shown. The Before photo can be taken anywhere. The After photo must be **≤ 1 m** from the
> Before position and its heading must be within **±10°** of the Before heading. Both photos still need coordinates,
> a reliable heading and readings no older than 10 s.
>
> **Important limitation:** phone GPS typically reports a horizontal accuracy of 3–5 m (68% radius). Two readings
> taken at the exact same spot can differ by more than 1 m, so a correctly positioned After photo may fail, and a
> nearby one may pass by chance. The UI shows the recorded accuracy so reviewers can judge it.

> **v2:** the **Before photo can be taken anywhere**. Its position, GPS
> accuracy and heading are recorded as the *reference point*. Accuracy is **not** a pass/fail criterion for Before.
> When it is worse than 3 m, a `REFERENCE_ACCURACY_LOW` **warning** is stored and shown. The Before photo still needs
> coordinates, an accuracy value, a reliable heading and fresh readings, because the After photo is matched
> against them. The **After photo is unchanged**: accuracy ≤ 3 m, ≤ 3 m from the Before position, heading
> difference ≤ 10°.
>
> **v1** (kept so older records stay interpretable) also required Before accuracy ≤ 3 m. Each verification stores its
> `rules_version`, plus a threshold snapshot that includes `max_before_gps_accuracy_m` (null = reference only).
>
> **Trade-off:** with an imprecise Before reference, "≤ 3 m from the Before position" is measured against a point that
> may itself be off by the Before accuracy. A PASS then gives weaker evidence of the same location. The warning stays
> visible on the result.

Source: `shared/verification/`. The browser (live gate) and the server (authoritative result) run the **same** code.

| Rule | Threshold | Comparison |
|---|---|---|
| Reported GPS horizontal accuracy — **After** | 3 m | `≤` |
| Reported GPS horizontal accuracy — **Before** | v2: not required (warning above 3 m); v1: 3 m | — |
| Distance Before ↔ After (Haversine, R = 6 371 008.8 m) | 3 m | `≤` |
| Circular heading difference | 10° | `≤` |
| GPS fix age relative to capture time | 10 s | `≤` (1 s tolerance for a fix stamped slightly after the capture) |
| Heading sample age relative to capture time | 10 s | `≤` |
| Heading uncertainty (platform accuracy or circular spread of 1 s of samples) | 15° | `≤`; above this the heading is unreliable |

Values are compared **unrounded**. The UI rounds only for display.

## Validation sequence

1. Both evidence records exist.
2. Capture timestamp present; coordinates present and in range; accuracy finite and > 0.
3. Freshness of the GPS fix and of the heading sample.
4. Before accuracy (v2: recorded, warning only), then 5. After accuracy (≤ 3 m).
6. Distance, computed only from fresh, valid coordinates. 7. Distance threshold.
8. Both headings valid, with a known source, fresh and reliable. 9. Circular difference:
   `abs(((after − before + 180) mod 360) − 180)` using a non-negative modulo
   (359° vs 1° → 2°, 90° vs 100° → 10°, 90° vs 101° → 11°).
10. Status: see below. 11. Saved with every reason, the rules version and a threshold snapshot.

## Status

| Status | Meaning |
|---|---|
| **PASS** | Every mandatory check is `true` and there is no FAIL or INSUFFICIENT reason. |
| **FAIL** | At least one *valid* measurement violates a threshold. |
| **INSUFFICIENT_DATA** | Nothing failed definitively, but some required value is missing, invalid, stale or unreliable. |
| **PENDING** | UI state: no authoritative server result yet (for example while uploading, or offline). Never stored as a verification. |

**Design decision: both missing and out of tolerance.** If, for example, the heading is missing *and* the distance
is 50 m, the result is **FAIL**. The definitive violation is reported first, and all reasons, including the
INSUFFICIENT ones, are stored. Neither status can be approved. Missing values are never treated as 0.

A different heading source between Before and After (for example Android vs iOS) adds a **WARNING** only.

## Heading: what is actually measured

- **Android Chrome**: `deviceorientationabsolute` gives the device rotation relative to the Earth frame. The app
  computes the compass direction of the device's **back axis (−Z)**, i.e. where the rear camera faces:
  `v = −R·ẑ`, `heading = atan2(vx, vy)`. This direction does not change with screen orientation, so portrait and
  landscape give the same value. If the camera points within about 15° of straight up or down, the horizontal
  component is too small and the heading is reported as unavailable.
- **iOS Safari**: needs `DeviceOrientationEvent.requestPermission()` from a tap. Uses `webkitCompassHeading`
  (degrees from magnetic north) and `webkitCompassAccuracy`. Apple documents this value for the device's
  orientation, not explicitly for the rear-camera axis. **Verify on real devices** (see DEVICE_TESTING.md).
- A relative `deviceorientation` (absolute = false) is treated as **unavailable**. An unsupported device cannot
  capture, so it cannot bypass the requirement.
- The heading is an approximation of the camera's optical axis, not a measurement of it. Magnetic interference
  (vehicles, rebar, steel poles) can shift it by tens of degrees. The app shows a figure-8 calibration tip.

## GPS: what "accuracy ≤ 3 m" means

`coords.accuracy` is the device's **estimate** of horizontal accuracy (Android reports a 68% confidence radius).
The true position may lie outside that radius. Many phones rarely report below 3–4 m, especially near
buildings or trees. The threshold is **not** relaxed automatically. If it is often unattainable, change it with a
new rules version (an explicit, audited code change).

## Changing rules

1. Add `RULES_V2` in `rules.ts` and point `CURRENT_RULES` to it. Never edit `RULES_V1`.
2. Update the tests, rebuild `Code.gs` (`npm run build:gas`), redeploy Apps Script and the frontend together.
3. Old verifications keep their `rules_version` and `thresholds` snapshot.
