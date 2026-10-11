# Deployment

## Frontend (static PWA)

```bash
cp .env.example .env.local      # set VITE_APPS_SCRIPT_URL
npm ci
npm test                        # unit + backend tests (also rebuilds apps-script/dist/Code.gs)
npm run build                   # → dist/
```

Host `dist/` on any static host with **HTTPS**, and add an SPA fallback that rewrites unknown paths to `/index.html`:

| Host | SPA fallback |
|---|---|
| Netlify | `public/_redirects` containing `/* /index.html 200` |
| Vercel | `vercel.json` with `{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }` |
| Cloudflare Pages | Automatic for SPAs |
| Firebase Hosting | `"rewrites": [{ "source": "**", "destination": "/index.html" }]` |

Recommended response headers:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' blob: data: https://*.tile.openstreetmap.org; connect-src https://script.google.com https://script.googleusercontent.com; frame-ancestors 'none'
Permissions-Policy: camera=(self), geolocation=(self), accelerometer=(self), gyroscope=(self), magnetometer=(self)
Referrer-Policy: strict-origin-when-cross-origin
X-Content-Type-Options: nosniff
Cache-Control: no-cache            (for /index.html and /sw.js)
```

Adjust `img-src` if you use another tile provider.

## Backend (Apps Script)

See [SETUP_APPS_SCRIPT.md](SETUP_APPS_SCRIPT.md). After every backend change: `npm run build:gas`, paste
`Code.gs`, then **Manage deployments → New version**. The web app URL stays the same.

Deploy the backend and the frontend together whenever `shared/verification` changes, so the live gate and the
server use the same rules version.

## What has / has not been verified

- ✅ `npm test`: unit tests and backend tests in a fake Apps Script runtime.
- ✅ `npm run test:e2e`: browser workflow in headless Chromium against the generated `Code.gs` (with a fake Sheets/Drive).
- ❌ Not yet deployed to a real Apps Script project, and not yet tested on real phones (see DEVICE_TESTING.md).
