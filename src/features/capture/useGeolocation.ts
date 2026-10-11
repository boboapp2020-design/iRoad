import { useCallback, useEffect, useRef, useState } from 'react';

export interface GeoFix {
  latitude: number;
  longitude: number;
  accuracy: number;
  /** Epoch ms of the fix. */
  timestamp: number;
  /** 'device' = Position.timestamp; 'receipt' = callback time (device timestamp implausible). */
  timeSource: 'device' | 'receipt';
}

/** Request a fresh fix when the latest one is older than this (freshness limit is 10 s). */
const STALE_REFRESH_MS = 3000;

export type GeoStatus = 'idle' | 'waiting' | 'ok' | 'denied' | 'unavailable' | 'error';

/**
 * Continuous high-accuracy GPS. Never substitutes IP geolocation, never
 * fabricates values: if the browser provides nothing, `fix` stays null.
 */
export function useGeolocation(enabled: boolean) {
  const [status, setStatus] = useState<GeoStatus>('idle');
  const [fix, setFix] = useState<GeoFix | null>(null);
  const fixRef = useRef<GeoFix | null>(null);
  const watchId = useRef<number | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    if (!('geolocation' in navigator)) {
      setStatus('unavailable');
      return;
    }
    setStatus('waiting');
    const onPosition = (pos: GeolocationPosition) => {
      const { latitude, longitude, accuracy } = pos.coords;
      if (![latitude, longitude, accuracy].every(Number.isFinite)) return;
      const now = Date.now();
      const plausible = Number.isFinite(pos.timestamp) && Math.abs(pos.timestamp - now) < 60_000;
      const next: GeoFix = { latitude, longitude, accuracy, timestamp: plausible ? pos.timestamp : now, timeSource: plausible ? 'device' : 'receipt' };
      // Ignore an older reading arriving after a newer one.
      if (fixRef.current && next.timestamp < fixRef.current.timestamp) return;
      fixRef.current = next;
      setFix(next);
      setStatus('ok');
    };
    const onError = (err: GeolocationPositionError) => {
      if (err.code === err.PERMISSION_DENIED) setStatus('denied');
      else if (err.code === err.POSITION_UNAVAILABLE) setStatus((s) => (s === 'ok' ? s : 'unavailable'));
      else setStatus((s) => (s === 'ok' ? s : 'waiting')); // TIMEOUT: keep waiting
    };
    const options: PositionOptions = { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 };
    watchId.current = navigator.geolocation.watchPosition(onPosition, onError, options);
    // Many phones stop calling watchPosition while the user stands still, which
    // would make the last fix stale (> 10 s). Actively request a fresh fix.
    let polling = false;
    const poll = setInterval(() => {
      const last = fixRef.current;
      if (polling || (last && Date.now() - last.timestamp < STALE_REFRESH_MS)) return;
      polling = true;
      navigator.geolocation.getCurrentPosition(
        (p) => { polling = false; onPosition(p); },
        (e) => { polling = false; if (e.code === e.PERMISSION_DENIED) onError(e); },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 },
      );
    }, 2000);
    return () => {
      clearInterval(poll);
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    };
  }, [enabled, attempt]);

  const retry = useCallback(() => {
    fixRef.current = null;
    setFix(null);
    setAttempt((a) => a + 1);
  }, []);

  return { status, fix, fixRef, retry };
}
