/// <reference types="vitest/config" />
import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * GERCEK BACKEND'e karsi calisan testlerin ayri yapilandirmasi.
 *
 * Neden ayri dosya: bu testler ayakta bir API ve migrate+seed edilmis bir
 * veritabani ister. Varsayilan `npm test`'e karisirlarsa backend kapaliyken
 * frontend testleri de kirmizi yanar ve "kod mu bozuldu, sunucu mu kapali?"
 * ayrimi kaybolur.
 *
 * Neden otomatik atlanmiyorlar: backend kapaliyken sessizce "skipped" gecmek,
 * calistigi sanilan ama hic calismamis bir test takimi demektir. Bu dosya
 * calistirildiginda backend yoksa **acik bir hatayla** durur.
 *
 * Calistirmak icin:  npm run test:api   (web/ klasorunde)
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.integration.test.{ts,tsx}'],
    // Ortak bir backend ve veritabani uzerinde calisiyorlar; paralel kosarlarsa
    // ayni e-posta uzerinde yarisirlar.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
