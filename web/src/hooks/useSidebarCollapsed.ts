import { useCallback, useEffect, useState } from 'react';

/**
 * Sidebar'in daraltilmis/genisletilmis tercihi — **kalici**.
 *
 * `evenup.` oneki `api/tokenStorage.ts` ve `lib/theme.ts` ile ayni: ayni
 * origin'de calisan baska bir uygulamanin anahtarlariyla karismasin.
 */
export const SIDEBAR_STORAGE_KEY = 'evenup.sidebar';

const COLLAPSED = 'collapsed';

/**
 * Ilk deger `useState` **baslatici fonksiyonunda** okunuyor, `useEffect`te
 * degil: efektte okunsaydi sayfa bir kare genis sidebar ile cizilir, sonra
 * daralirdi — her sayfa aciliminda gorunur bir sicrama.
 *
 * `try/catch`: gizli sekmede ya da depolama kapaliyken `localStorage` erisimi
 * istisna atabiliyor. Tercih okunamiyorsa varsayilan (genis) ile devam etmek,
 * sayfayi hic acmamaktan iyi.
 */
const readPreference = (): boolean => {
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === COLLAPSED;
  } catch {
    return false;
  }
};

export const useSidebarCollapsed = (): [boolean, () => void] => {
  const [collapsed, setCollapsed] = useState(readPreference);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? COLLAPSED : 'expanded');
    } catch {
      // Yazilamiyorsa tercih yalnizca bu oturumda yasar; ekran yine calisir.
    }
  }, [collapsed]);

  const toggle = useCallback(() => setCollapsed((current) => !current), []);

  return [collapsed, toggle];
};

export default useSidebarCollapsed;
