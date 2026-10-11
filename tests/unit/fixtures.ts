import type { CaptureMeasurement } from '@verification';

const BEFORE_AT = Date.parse('2026-03-12T03:24:00Z');
const AFTER_AT = Date.parse('2026-03-20T04:10:00Z');

export function baseBefore(): CaptureMeasurement & { latitude: number; longitude: number } {
  return {
    latitude: 13.764321,
    longitude: 100.538721,
    accuracyM: 2.1,
    headingDeg: 125,
    headingSource: 'android_absolute_orientation',
    headingUncertaintyDeg: 2,
    capturedAt: new Date(BEFORE_AT).toISOString(),
    locationFixAt: BEFORE_AT - 1500,
    headingMeasuredAt: BEFORE_AT - 100,
  };
}

export function baseAfter(): CaptureMeasurement & { latitude: number; longitude: number } {
  return {
    latitude: 13.764318,
    longitude: 100.538719,
    accuracyM: 2.4,
    headingDeg: 128,
    headingSource: 'android_absolute_orientation',
    headingUncertaintyDeg: 3,
    capturedAt: new Date(AFTER_AT).toISOString(),
    locationFixAt: AFTER_AT - 800,
    headingMeasuredAt: AFTER_AT - 50,
  };
}
