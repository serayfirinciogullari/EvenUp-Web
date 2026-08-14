/**
 * Token saklamanin **tek kapisi**.
 *
 * Uygulamanin baska hicbir yeri `localStorage`'a dogrudan dokunmaz. Sebep,
 * backend'deki `PUBLIC_USER_COLUMNS` ve `money.ts` ile ayni: saklama karari
 * degistiginde (ornegin memory + refresh token'a gecildiginde) degistirilecek
 * tek dosya burasi olsun.
 *
 * NEDEN localStorage — ozet
 * -------------------------
 * Backend tek ve uzun omurlu (7 gun) bir JWT uretiyor; refresh token akisi
 * bilincli olarak yok (bkz. docs/decisions/1.3.md). Token'i yalnizca bellekte
 * tutsaydik her sayfa yenilemesinde oturum kaybolurdu ve geri kazanmanin yolu
 * olmazdi — kullanici gunde defalarca login ekranina duserdi.
 *
 * XSS riski ve neden httpOnly cookie secilmedigi: docs/decisions/2.1.md
 */

const TOKEN_KEY = 'evenup.token';

/**
 * `localStorage` gizli sekmede ya da depolama kotasi dolu oldugunda
 * erisilemez olabilir; erisim denemesi istisna firlatir. Uygulamanin bu
 * yuzden acilmamasi kabul edilemez, o yuzden her erisim korunur.
 */
const safeStorage = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const readToken = (): string | null => {
  try {
    return safeStorage()?.getItem(TOKEN_KEY) ?? null;
  } catch {
    return null;
  }
};

export const writeToken = (token: string): void => {
  try {
    safeStorage()?.setItem(TOKEN_KEY, token);
  } catch {
    // Yazilamadiysa oturum yalnizca bu sekme icin gecerli olur; uygulama
    // calismaya devam etmeli.
  }
};

export const clearToken = (): void => {
  try {
    safeStorage()?.removeItem(TOKEN_KEY);
  } catch {
    // yoksay
  }
};

export default { readToken, writeToken, clearToken };
