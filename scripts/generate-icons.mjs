// Renders public/favicon.svg into the PNG icons referenced by the web manifest.
// Uses Playwright's Chromium; set CHROMIUM_PATH to use a specific binary.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const svg = readFileSync('public/favicon.svg', 'utf8');
const targets = [
  { file: 'public/icons/icon-192.png', size: 192, pad: 0 },
  { file: 'public/icons/icon-512.png', size: 512, pad: 0 },
  { file: 'public/icons/icon-maskable-512.png', size: 512, pad: 0.12, bg: '#1d4ed8' },
  { file: 'public/icons/apple-touch-icon.png', size: 180, pad: 0, bg: '#1d4ed8' },
];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
for (const t of targets) {
  const inner = Math.round(t.size * (1 - 2 * t.pad));
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(`<html><body style="margin:0;display:flex;align-items:center;justify-content:center;width:${t.size}px;height:${t.size}px;background:${t.bg ?? 'transparent'}">
    <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`);
  await page.screenshot({ path: t.file, omitBackground: !t.bg });
  console.log('wrote', t.file);
}
await browser.close();
