import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
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
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f8fafc',
        theme_color: '#1d4ed8',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Only the static app shell is precached. Supabase API, Auth, Storage
        // (signed evidence URLs) and Edge Functions are NEVER cached.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/auth\//, /^\/rest\//, /^\/storage\//, /^\/functions\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /supabase\.(co|in)$/.test(url.hostname) || url.pathname.startsWith('/storage/v1/'),
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
