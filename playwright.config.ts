import { existsSync, readdirSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Prefer a pre-installed Chromium (CHROMIUM_PATH or /opt/pw-browsers) over downloading one.
function chromiumPath(): string | undefined {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = '/opt/pw-browsers';
  if (!existsSync(base)) return undefined;
  const dir = readdirSync(base).find((d) => /^chromium-\d+$/.test(d));
  const candidate = dir ? `${base}/${dir}/chrome-linux/chrome` : '';
  return candidate && existsSync(candidate) ? candidate : undefined;
}

export const E2E_API_URL = 'https://e2e.invalid/macros/s/test/exec';

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5199',
    trace: 'retain-on-failure',
    ...devices['Pixel 7'],
    launchOptions: {
      executablePath: chromiumPath(),
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    },
  },
  webServer: {
    command: `npx vite --port 5199 --strictPort`,
    url: 'http://localhost:5199',
    reuseExistingServer: false,
    env: { VITE_APPS_SCRIPT_URL: E2E_API_URL, VITE_MAP_TILE_URL: 'https://tiles.e2e.invalid/{z}/{x}/{y}.png' },
    timeout: 60_000,
  },
});
