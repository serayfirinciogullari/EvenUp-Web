import { useEffect, useState } from 'react';

/**
 * Bir CSS medya sorgusunun **canli** sonucu.
 *
 * Yalnizca ilk degeri okumak yetmez, degisimi de dinliyor: kullanici isletim
 * sistemi tarafinda "hareketi azalt"i actiginda ya da tabletini klavyeye
 * taktiginda (`pointer: coarse` -> `fine`) sayfanin yenilenmesi beklenmemeli.
 *
 * Ilk render'da her zaman `false` doner, deger mount'tan sonra okunur. Bu
 * bilincli: sunucuda ya da testte `matchMedia` yoksa render patlamasin, ve
 * "henuz bilmiyorum" durumu her zaman en **guvenli** tarafa dussun — bu
 * hook'un iki kullanicisinda da (ozel imlec, tema gecis animasyonu) guvenli
 * taraf "ozel davranisi baslatma".
 *
 * jsdom'da `matchMedia` sahte ve `matches: false` donuyor (test/setup.ts).
 */
const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const list = window.matchMedia(query);

    setMatches(list.matches);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);

    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
};

/*
  Disariya yalnizca iki **adlandirilmis** sorgu aciliyor, jenerik hook degil.
  Gerekce: sorgu metni cagirma yerine dagilirsa ayni sorgunun iki farkli
  yazimi ortaya cikar (`(pointer:fine)` / `(pointer: fine)`) ve hangisinin
  nerede kullanildigi aranamaz hale gelir. Yeni bir sorgu gerekince buraya
  bir satir eklenir.
*/

/** Kullanici hareketin azaltilmasini istiyor mu? */
export const usePrefersReducedMotion = (): boolean =>
  useMediaQuery('(prefers-reduced-motion: reduce)');

/**
 * Hassas bir isaretleme cihazi var mi (fare, trackpad, kalem)?
 *
 * Dokunmatik ekranda `coarse` doner — ve dokunmatikte **imlec diye bir sey
 * yoktur**, dolayisiyla ozel imlec de olmamalidir.
 */
export const useFinePointer = (): boolean => useMediaQuery('(pointer: fine)');
