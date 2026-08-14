import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

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
