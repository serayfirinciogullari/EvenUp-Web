/**
 * Tema tercihi icin depolama anahtari (2.6).
 *
 * `evenup.` oneki `api/tokenStorage.ts` ile ayni: ayni origin'de calisan baska
 * bir uygulamanin anahtarlariyla karismasin.
 *
 * DIKKAT — bu deger `web/index.html` icindeki acilis script'inde **elle
 * tekrarlaniyor**. Orasi bir modul degil (henuz hicbir JS yuklenmemis olmali),
 * yani import edemez. Anahtar degistirilirse iki yerde birden degismeli; aksi
 * halde tema calisir ama sayfa acilisinda bir kare beyaz parlar.
 */
export const THEME_STORAGE_KEY = 'evenup.theme';
