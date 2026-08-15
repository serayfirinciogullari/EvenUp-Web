import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

/**
 * Her testten sonra DOM ve localStorage temizlenir.
 *
 * Token `localStorage`'da tutuldugu icin (bkz. api/tokenStorage.ts) temizlik
 * sart: bir testte yazilan token sonraki testte oturumu acik gosterir ve
 * "giris yapmadan /groups" senaryosu sessizce yanlis calisirdi.
 */
beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

/*
  ============================================================================
  jsdom'da bulunmayan tarayici API'leri
  ============================================================================
  Tasarim sistemiyle birlikte gelen kutuphaneler (Radix/shadcn, sonner, motion)
  bu API'leri kullaniyor. jsdom hicbirini uygulamiyor; polyfill'siz testler
  "not a function" ile duser.

  Hepsi **sessiz/etkisiz** varsayilanlar donuyor:
    - `matches: false` -> hareket ve seffaflik tercihleri kapali kabul edilir,
      yani bilesenler tam animasyonlu yolu secer. Tersi secilseydi testler
      uygulamanin gercek varsayilan davranisini sinamamis olurdu.
*/

if (typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

if (typeof window.ResizeObserver !== 'function') {
  window.ResizeObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  } as unknown as typeof window.ResizeObserver;
}

if (typeof window.IntersectionObserver !== 'function') {
  window.IntersectionObserver = class {
    readonly root = null;
    readonly rootMargin = '';
    readonly thresholds: number[] = [];
    observe() {}
    disconnect() {}
    unobserve() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof window.IntersectionObserver;
}

// Radix, tetikleyiciyi konumlandirirken kullaniyor.
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = vi.fn();
}

// Radix DropdownMenu / Dialog, pointer olaylarini yakalamak icin cagiriyor.
if (typeof Element.prototype.hasPointerCapture !== 'function') {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
}
