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
  /** Maximum reported horizontal GPS accuracy (meters), inclusive. Applies to the After capture. */
  readonly maxGpsAccuracyM: number;
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

export const CURRENT_RULES: VerificationRules = RULES_V2;

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
  };
}
