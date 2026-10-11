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

export function tileUrl(): string {
  return env.mapTileUrl.replace('{apiKey}', encodeURIComponent(env.mapApiKey));
}
