import { useCallback, useEffect, useRef, useState } from 'react';
import { cameraHeadingFromOrientation, circularStats } from '@verification';

export type HeadingSource = 'android_absolute_orientation' | 'absolute_device_orientation' | 'ios_webkit_compass';
export type HeadingStatus = 'idle' | 'needs-permission' | 'waiting' | 'ok' | 'vertical' | 'unavailable' | 'denied';

export interface HeadingReading {
  headingDeg: number;
  /** Circular spread of recent samples, or the platform accuracy if larger. */
  uncertaintyDeg: number;
  measuredAt: number;
  source: HeadingSource;
  sampleCount: number;
}

type IOSOrientationEvent = DeviceOrientationEvent & { webkitCompassHeading?: number; webkitCompassAccuracy?: number };
type PermissionCapable = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };

const WINDOW_MS = 1000;
const UNAVAILABLE_AFTER_MS = 4000;

/**
 * Compass heading of the rear camera. Uses ABSOLUTE orientation only; a
 * relative orientation (arbitrary reference) is treated as unavailable.
 * A missing heading is null — never 0.
 */
export function useHeading(enabled: boolean) {
  const DOE = typeof window !== 'undefined' ? (window.DeviceOrientationEvent as PermissionCapable | undefined) : undefined;
  const needsPermission = !!DOE && typeof DOE.requestPermission === 'function';
  const [permission, setPermission] = useState<'unknown' | 'granted' | 'denied'>(needsPermission ? 'unknown' : 'granted');
  const [status, setStatus] = useState<HeadingStatus>('idle');
  const [reading, setReading] = useState<HeadingReading | null>(null);
  const readingRef = useRef<HeadingReading | null>(null);
  const samples = useRef<{ t: number; h: number; acc?: number; source: HeadingSource }[]>([]);

  const requestPermission = useCallback(async () => {
    if (!DOE?.requestPermission) return;
    try {
      const r = await DOE.requestPermission();
      setPermission(r === 'granted' ? 'granted' : 'denied');
    } catch {
      setPermission('denied');
    }
  }, [DOE]);

  useEffect(() => {
    if (!enabled) return;
    if (!DOE) {
      setStatus('unavailable');
      return;
    }
    if (permission === 'unknown') {
      setStatus('needs-permission');
      return;
    }
    if (permission === 'denied') {
      setStatus('denied');
      return;
    }
    setStatus('waiting');
    let lastAny = 0;
    let lastPublish = 0;

    const push = (h: number, source: HeadingSource, acc?: number) => {
      const t = Date.now();
      lastAny = t;
      samples.current.push({ t, h, acc, source });
      samples.current = samples.current.filter((s) => t - s.t <= WINDOW_MS && s.source === source);
      if (t - lastPublish < 200) return;
      lastPublish = t;
      const stats = circularStats(samples.current.map((s) => s.h));
      if (!stats) return;
      const platformAcc = samples.current.reduce((m, s) => (s.acc !== undefined && s.acc >= 0 ? Math.max(m, s.acc) : m), 0);
      const next: HeadingReading = {
        headingDeg: stats.meanDeg,
        uncertaintyDeg: Math.max(stats.spreadDeg, platformAcc),
        measuredAt: t,
        source,
        sampleCount: samples.current.length,
      };
      readingRef.current = next;
      setReading(next);
      setStatus('ok');
    };

    const markVertical = () => {
      lastAny = Date.now();
      readingRef.current = null;
      samples.current = [];
      setReading(null);
      setStatus('vertical');
    };

    const onAbsolute = (e: DeviceOrientationEvent) => {
      if (e.alpha === null || e.beta === null || e.gamma === null) return;
      const r = cameraHeadingFromOrientation({ alpha: e.alpha, beta: e.beta, gamma: e.gamma });
      if (r.headingDeg === null) markVertical();
      else push(r.headingDeg, 'android_absolute_orientation');
    };
    const onOrientation = (e: DeviceOrientationEvent) => {
      const ios = e as IOSOrientationEvent;
      if (typeof ios.webkitCompassHeading === 'number' && Number.isFinite(ios.webkitCompassHeading)) {
        // iOS: degrees from magnetic north; negative accuracy means uncalibrated/invalid.
        if (typeof ios.webkitCompassAccuracy === 'number' && ios.webkitCompassAccuracy < 0) return;
        push(ios.webkitCompassHeading % 360, 'ios_webkit_compass', ios.webkitCompassAccuracy);
        return;
      }
      if (e.absolute && e.alpha !== null && e.beta !== null && e.gamma !== null) {
        const r = cameraHeadingFromOrientation({ alpha: e.alpha, beta: e.beta, gamma: e.gamma });
        if (r.headingDeg === null) markVertical();
        else push(r.headingDeg, 'absolute_device_orientation');
      }
    };

    const hasAbsoluteEvent = 'ondeviceorientationabsolute' in window;
    if (hasAbsoluteEvent) window.addEventListener('deviceorientationabsolute', onAbsolute as EventListener);
    else window.addEventListener('deviceorientation', onOrientation);

    const timer = setInterval(() => {
      const now = Date.now();
      if (now - lastAny > UNAVAILABLE_AFTER_MS) {
        readingRef.current = null;
        setReading(null);
        setStatus('unavailable');
      }
    }, 1000);

    return () => {
      clearInterval(timer);
      window.removeEventListener('deviceorientationabsolute', onAbsolute as EventListener);
      window.removeEventListener('deviceorientation', onOrientation);
      samples.current = [];
    };
  }, [enabled, permission, DOE]);

  return { status, reading, readingRef, requestPermission, needsPermission: permission === 'unknown' && needsPermission };
}
