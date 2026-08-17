import '@testing-library/jest-dom/vitest';

import { cleanup, configure } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, vi } from 'vitest';

/**
 * Her testten sonra DOM, localStorage, tema sinifi ve bildirimler temizlenir.
 *
 * Token `localStorage`'da tutuldugu icin (bkz. api/tokenStorage.ts) temizlik
 * sart: bir testte yazilan token sonraki testte oturumu acik gosterir ve
 * "giris yapmadan /groups" senaryosu sessizce yanlis calisirdi.
 *
 * `toast` ve tema, React agacinin **disinda** durum tutan iki sey (2.6):
 *   - sonner'in bildirim listesi modul seviyesinde; `cleanup()` DOM'u kaldirsa
 *     da liste kaliyor ve bir sonraki testte Toaster mount olunca eski
 *     bildirim yeniden ciziliyor. Belirtisi: "basari mesaji gorunmemeli"
 *     diyen bir test, kendi tetiklemedigi bir mesaj yuzunden kirmizi yaniyor.
 *   - tema sinifi `<html>` uzerinde; `cleanup()` oraya dokunmaz.
 */
/*
  `findBy*` bekleme suresi 1sn'den 5sn'ye cikariliyor.

  Sebep: korunan her sayfa artik sidebar ile birlikte cizilyor ve sidebar iki
  ayri istegi (grup listesi + ozet) bekleyen bir saglayicinin altinda. Sekiz
  test dosyasi paralel kosarken bu agac 1sn'ye sigmayabiliyordu ve testler
  **kod bozuk oldugu icin degil, makine mesgul oldugu icin** kirmizi yaniyordu.

  Sure uzatmak yavas testi gizlemiyor: gecen bir test yine ilk firsatta geciyor,
  yalnizca basarisiz sayilmadan once daha uzun bekliyor.
*/
configure({ asyncUtilTimeout: 5000 });

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  toast.dismiss();
  cleanup();
  window.localStorage.clear();
  document.documentElement.className = '';
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
