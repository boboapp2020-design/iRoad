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
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        if (![latitude, longitude, accuracy].every(Number.isFinite)) return;
        const now = Date.now();
        const plausible = Number.isFinite(pos.timestamp) && Math.abs(pos.timestamp - now) < 60_000;
        const next: GeoFix = { latitude, longitude, accuracy, timestamp: plausible ? pos.timestamp : now, timeSource: plausible ? 'device' : 'receipt' };
        fixRef.current = next;
        setFix(next);
        setStatus('ok');
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setStatus('denied');
        else if (err.code === err.POSITION_UNAVAILABLE) setStatus('unavailable');
        else setStatus((s) => (s === 'ok' ? s : 'waiting')); // TIMEOUT: keep waiting
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
    );
    return () => {
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
