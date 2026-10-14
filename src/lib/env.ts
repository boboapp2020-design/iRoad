/** Public runtime configuration (Vite env). Never put secrets in VITE_* variables. */
export const env = {
  apiUrl: (import.meta.env.VITE_APPS_SCRIPT_URL as string | undefined)?.trim() || '',
  mapTileUrl: (import.meta.env.VITE_MAP_TILE_URL as string | undefined) || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  mapAttribution:
    (import.meta.env.VITE_MAP_ATTRIBUTION as string | undefined) ||
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  /** Optional browser key for a commercial tile provider; must be HTTP-referrer restricted. */
  mapApiKey: (import.meta.env.VITE_MAP_API_KEY as string | undefined) || '',
  requestTimeoutMs: Number(import.meta.env.VITE_API_TIMEOUT_MS) || 60_000,
};

/**
 * Demo mode: the in-browser demo backend (data stays on this device). Used when
 * no backend is configured, or when opened with `?demo=1` (remembered on this
 * device until `?demo=0`), so the published app can be tried without accounts.
 */
function demoRequested(): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get('demo');
    const prev = localStorage.getItem('rr.demo') === '1';
    if (q === '1' || q === '0') {
      const next = q === '1';
      if (next !== prev) localStorage.removeItem('rr.session'); // never reuse a session across backends
      if (next) localStorage.setItem('rr.demo', '1');
      else localStorage.removeItem('rr.demo');
      return next;
    }
    return prev;
  } catch {
    return false;
  }
}

export const isDemo = !env.apiUrl || demoRequested();

export function tileUrl(): string {
  return env.mapTileUrl.replace('{apiKey}', encodeURIComponent(env.mapApiKey));
}
