import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the app under /<repo>/ — set VITE_BASE=/iRoad/ there.
const base = process.env.VITE_BASE || '/';

export default defineConfig({
  base,
  resolve: {
    alias: {
      '@verification': fileURLToPath(new URL('./shared/verification/index.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Road Repair Tracker',
        short_name: 'Road Repair',
        description: 'บันทึกและตรวจสอบการซ่อมถนนด้วยภาพก่อน/หลังซ่อม',
        lang: 'th',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f8fafc',
        theme_color: '#1d4ed8',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Only the static app shell is precached. API calls (Apps Script) and
        // evidence images (fetched through the API) are NEVER cached by the SW.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: `${base}index.html`,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /(^|\.)script\.google(usercontent)?\.com$/.test(url.hostname),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  build: {
    sourcemap: true,
    chunkSizeWarningLimit: 900,
  },
});
