/// <reference types="vitest/config" />
import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // shadcn/ui bilesenleri `@/lib/utils` gibi yollar kullaniyor.
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Gercek backend isteyen testler burada calismaz; ayri komutu var
    // (`npm run test:api`, vitest.api.config.ts). Gerekcesi o dosyada.
    exclude: ['node_modules/**', 'dist/**', 'src/**/*.integration.test.{ts,tsx}'],
    /*
      Varsayilan 5sn, `findBy*` beklemesi de 5sn (src/test/setup.ts). Ikisi ayni
      olunca yavas bir makinede test, beklemesi daha bitmeden **zaman asimina**
      dusuyordu — hata mesaji da "eleman bulunamadi" degil "test timed out"
      oluyor, yani teshis edilemez hale geliyor. Test suresi bekleme suresinin
      belirgin uzerinde olmali.
    */
    testTimeout: 20000,
  },
});
