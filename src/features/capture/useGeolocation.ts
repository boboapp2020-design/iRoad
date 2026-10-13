import { useCallback, useEffect, useRef, useState } from 'react';

export interface GeoFix {
  latitude: number;
  longitude: number;
  accuracy: number;
  /** Epoch ms of the fix. */
  timestamp: number;
  /** 'device' = Position.timestamp; 'receipt' = callback time (device timestamp implausible). */
  timeSource: 'device' | 'receipt';
  /** How many raw GPS readings were averaged into this position (1 = a single reading). */
  sampleCount: number;
}

/** Raw readings from the last few seconds are averaged so normal GPS jitter does not make the position jump. */
const SMOOTHING_WINDOW_MS = 5000;

/**
 * Accuracy-weighted mean of recent readings. The reported accuracy is the
 * plain mean of the readings' accuracies (never smaller than the inputs
 * suggest), and the timestamp is that of the newest reading.
 */
export function smoothFixes(raw: GeoFix[]): GeoFix | null {
  if (!raw.length) return null;
  const newest = raw[raw.length - 1];
  const recent = raw.filter((f) => newest.timestamp - f.timestamp <= SMOOTHING_WINDOW_MS);
  let wSum = 0, lat = 0, lng = 0, acc = 0;
  for (const f of recent) {
    const w = 1 / Math.max(f.accuracy, 0.5) ** 2;
    wSum += w;
    lat += f.latitude * w;
    lng += f.longitude * w;
    acc += f.accuracy;
  }
  return {
    latitude: lat / wSum,
    longitude: lng / wSum,
    accuracy: acc / recent.length,
    timestamp: newest.timestamp,
    timeSource: newest.timeSource,
    sampleCount: recent.length,
  };
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
  const rawRef = useRef<GeoFix[]>([]);
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
      const reading: GeoFix = { latitude, longitude, accuracy, timestamp: plausible ? pos.timestamp : now, timeSource: plausible ? 'device' : 'receipt', sampleCount: 1 };
      const raw = rawRef.current;
      // Ignore an older or duplicate reading arriving after a newer one.
      if (raw.length && reading.timestamp <= raw[raw.length - 1].timestamp) return;
      raw.push(reading);
      rawRef.current = raw.filter((f) => reading.timestamp - f.timestamp <= SMOOTHING_WINDOW_MS);
      const next = smoothFixes(rawRef.current)!;
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
    rawRef.current = [];
    setFix(null);
    setAttempt((a) => a + 1);
  }, []);

  return { status, fix, fixRef, retry };
}
