/**
 * Verification rules. The SAME module is imported by the browser (live
 * guidance) and by the server backend (authoritative result), so the
 * client can never be configured with looser thresholds than the server.
 * (Bundled into the Apps Script backend by scripts/build-apps-script.mjs.)
 *
 * Changing any value requires a NEW rules version. Every stored verification
 * records `rulesVersion` and a copy of the thresholds it was evaluated with.
 * Thresholds are never lowered at runtime.
 */
export interface VerificationRules {
  readonly version: string;
  /**
   * Maximum reported horizontal GPS accuracy (meters), inclusive, for the After
   * capture — or null when accuracy is recorded but not a criterion.
   */
  readonly maxGpsAccuracyM: number | null;
  /**
   * Maximum GPS accuracy for the Before capture, or null when the Before photo
   * may be taken anywhere with any accuracy (its position is only recorded as
   * the reference point).
   */
  readonly maxBeforeGpsAccuracyM: number | null;
  /** Maximum distance between Before and After coordinates (meters), inclusive. */
  readonly maxDistanceM: number;
  /** Maximum circular heading difference (degrees), inclusive. */
  readonly maxHeadingDifferenceDeg: number;
  /** Maximum age of a GPS fix relative to the photo capture time (ms). */
  readonly maxLocationAgeMs: number;
  /** Maximum age of a heading sample relative to the photo capture time (ms). */
  readonly maxHeadingAgeMs: number;
  /** A heading whose estimated uncertainty exceeds this is unreliable (degrees). */
  readonly maxHeadingUncertaintyDeg: number;
  /** Tolerated clock jitter where a sample appears slightly after capture (ms). */
  readonly futureToleranceMs: number;
  /**
   * v5+: weighted match score for the After photo. When set, distance and
   * heading above are hard limits, and passing also needs a high enough score
   * built from image similarity, heading closeness and GPS distance.
   */
  readonly scoring?: MatchScoring | null;
}

export interface MatchScoring {
  /** Points per component; they add up to 100. */
  readonly weights: { readonly image: number; readonly heading: number; readonly gps: number };
  /** Image similarity (0–100) at or above which the image points are full. */
  readonly imageFull: number;
  /** Image similarity at or below which the image points are zero. */
  readonly imageZero: number;
  /** Heading difference (degrees) at or below which the heading points are full. */
  readonly headingFullDeg: number;
  /** Share of heading points still given at the hard heading limit. */
  readonly headingAtLimit: number;
  /** Distance (m) at or below which the GPS points are full; zero at maxDistanceM. */
  readonly gpsFullM: number;
  /** Score at or above which the After photo passes. */
  readonly passScore: number;
  /** Score at or above which it passes but is flagged for the reviewer. */
  readonly reviewScore: number;
  /** After this many attempts the inspector may send a low score for human review, with a reason. */
  readonly manualReviewAfterAttempts: number;
}

export const RULES_V1: VerificationRules = Object.freeze({
  version: 'rr-verify-v1',
  maxGpsAccuracyM: 3,
  maxBeforeGpsAccuracyM: 3,
  maxDistanceM: 3,
  maxHeadingDifferenceDeg: 10,
  maxLocationAgeMs: 10_000,
  maxHeadingAgeMs: 10_000,
  maxHeadingUncertaintyDeg: 15,
  futureToleranceMs: 1_000,
});

/**
 * v2: the Before photo can be taken anywhere — its GPS accuracy is recorded
 * (with a warning above 3 m) but is not a pass/fail criterion. The After photo
 * must still be within 3 m (accuracy ≤ 3 m) and 10° of the Before reference.
 */
export const RULES_V2: VerificationRules = Object.freeze({
  ...RULES_V1,
  version: 'rr-verify-v2',
  maxBeforeGpsAccuracyM: null,
});

/**
 * v3 (project owner): GPS accuracy is no longer a criterion for either photo
 * (it is still recorded). The After photo must be within 1 m of the Before
 * position and within ±10° of the Before heading.
 */
export const RULES_V3: VerificationRules = Object.freeze({
  ...RULES_V2,
  version: 'rr-verify-v3',
  maxGpsAccuracyM: null,
  maxBeforeGpsAccuracyM: null,
  maxDistanceM: 1,
});

/**
 * v4 (project owner): phone GPS drifts 3–5 m even when standing on the same
 * spot, so 1 m could not be met in the field. The After photo must be within
 * 5 m of the Before position; heading stays ±10°. Accuracy is still recorded
 * only. Exact framing is checked by eye with the Before-photo overlay.
 */
export const RULES_V4: VerificationRules = Object.freeze({
  ...RULES_V3,
  version: 'rr-verify-v4',
  maxDistanceM: 5,
});

/**
 * v5 (project owner): GPS drifts too much to decide alone. The After photo
 * passes on a weighted score: image similarity of the surroundings 50, heading
 * closeness 30, GPS distance 20 (the owner's "GPS 20%"). Hard limits stay:
 * heading ±10° and at most 30 m away. Score ≥ 70 passes, 55–69 passes with a
 * reviewer flag, lower must be retaken; after 3 attempts the inspector may
 * send it for human review with a reason. Starting values, to be tuned from
 * field data under a new version.
 */
export const RULES_V5: VerificationRules = Object.freeze({
  ...RULES_V4,
  version: 'rr-verify-v5',
  maxDistanceM: 30,
  scoring: Object.freeze({
    weights: Object.freeze({ image: 50, heading: 30, gps: 20 }),
    imageFull: 70,
    imageZero: 30,
    headingFullDeg: 3,
    headingAtLimit: 0.4,
    gpsFullM: 5,
    passScore: 70,
    reviewScore: 55,
    manualReviewAfterAttempts: 3,
  }),
});

export const CURRENT_RULES: VerificationRules = RULES_V5;

/** Server-side submission limits (not part of the pass/fail verification). */
export const SUBMISSION_LIMITS = Object.freeze({
  /** Captures older than this when they reach the server are rejected (ms). */
  maxSubmissionDelayMs: 15 * 60_000,
  /** Captures timestamped further than this in the future are rejected (ms). */
  maxClockSkewMs: 2 * 60_000,
  maxFileSizeBytes: 25 * 1024 * 1024,
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'] as readonly string[],
});

export function thresholdsSnapshot(rules: VerificationRules) {
  return {
    max_gps_accuracy_m: rules.maxGpsAccuracyM,
    max_before_gps_accuracy_m: rules.maxBeforeGpsAccuracyM,
    max_distance_m: rules.maxDistanceM,
    max_heading_difference_deg: rules.maxHeadingDifferenceDeg,
    max_location_age_ms: rules.maxLocationAgeMs,
    max_heading_age_ms: rules.maxHeadingAgeMs,
    max_heading_uncertainty_deg: rules.maxHeadingUncertaintyDeg,
    ...(rules.scoring ? { scoring: rules.scoring } : {}),
  };
}
