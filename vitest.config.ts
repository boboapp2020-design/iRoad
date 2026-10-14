import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: { __APP_BUILD__: JSON.stringify('test') },
  resolve: {
    alias: {
      '@verification': fileURLToPath(new URL('./shared/verification/index.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}', 'tests/apps-script/**/*.test.ts'],
    testTimeout: 20_000,
  },
});
