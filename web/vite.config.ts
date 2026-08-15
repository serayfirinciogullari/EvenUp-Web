/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Gercek backend isteyen testler burada calismaz; ayri komutu var
    // (`npm run test:api`, vitest.api.config.ts). Gerekcesi o dosyada.
    exclude: ['node_modules/**', 'dist/**', 'src/**/*.integration.test.{ts,tsx}'],
  },
});
