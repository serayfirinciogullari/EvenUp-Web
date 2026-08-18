/**
 * Giris/kayit sirasinda **bekleyen** davet kodu.
 *
 * NEDEN VAR
 * ---------
 * Davet linkine tiklayan kisinin cogu zaman hesabi yoktur: `/join/:inviteCode`
 * onu kayit ekranina yollar. Kod bir yerde tutulmazsa kayit bittiginde
 * kullanici uygulamaya duser ve **linke ikinci kez tiklamasi** gerekir — davet
 * akisinin en cok terk edilen yeri tam olarak orasi.
 *
 * Kod ayrica `state.from` ile de tasiniyor (bkz. JoinPage). Burasi o mekanizma
 * koptugunda devreye giriyor: kullanici kayit ekraninda "zaten hesabim var"
 * baglantisina tiklarsa yeni bir gezinme baslar ve router state'i **kaybolur**.
 * Depolamadaki kod o durumda da ayakta.
 *
 * NEDEN sessionStorage — token'in aksine (`tokenStorage.ts` localStorage)
 * ----------------------------------------------------------------------
 * Oturum tarayici kapaninca ayakta kalmali; yarim kalmis bir davet akisi
 * kalmamali. Kod `localStorage`da dursaydi haftalar sonra baska bir sebeple
 * giris yapan kullanici, unuttugu bir davetin grubuna **kendiliginden**
 * katilirdi. `sessionStorage` sekmeyle birlikte olur; akis da zaten tek sekme
 * icinde geciyor.
 */

const PENDING_INVITE_KEY = 'evenup.pendingInvite';

/**
 * Gizli sekmede ya da kota dolu oldugunda depolama erisimi istisna firlatabilir.
 * Davet akisi bunun yuzunden cokmemeli: erisilemiyorsa kod `state.from`
 * uzerinden tasinmaya devam eder.
 */
const safeStorage = (): Storage | null => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

export const savePendingInvite = (code: string): void => {
  try {
    safeStorage()?.setItem(PENDING_INVITE_KEY, code);
  } catch {
    // yoksay: `state.from` hala tasiyor olabilir.
  }
};

/**
 * Kodu **okur, silmez**.
 *
 * NEDEN "OKU VE SIL" DEGIL
 * ------------------------
 * Giris sonrasi hedefi iki yer hesapliyor: form sayfasinin kendi `navigate`i
 * ve `GuestRoute` (oturum acilir acilmaz devreye giren yonlendirme). Hangisinin
 * once calisacagi React Router'in gecis onceligine bagli — yani belirsiz.
 * Okuma silseydi ilk calisan kodu tuketir, digeri **bos** okuyup kullaniciyi
 * ana ekrana birakirdi. Boyle bir hata da yalnizca ikisinin sirasi degistiginde
 * ortaya cikardi: yeniden uretilmesi zor bir davranis.
 *
 * Yan etkisi olmayan bir okuma ile ikisi de ayni cevabi goruyor. Silme tek bir
 * yerin isi: `JoinPage` istegi ustlendigi anda temizliyor.
 */
export const readPendingInvite = (): string | null => {
  try {
    return safeStorage()?.getItem(PENDING_INVITE_KEY) ?? null;
  } catch {
    return null;
  }
};

/**
 * Bekleyen daveti dusurur. Cagiran tek yer `JoinPage`: adres cubugunda kod
 * varken depoladaki kopya artik gereksiz, dahasi zararli — birakilsaydi
 * yarim kalmis bir davet sonraki, alakasiz bir girise sarkardi.
 */
export const clearPendingInvite = (): void => {
  try {
    safeStorage()?.removeItem(PENDING_INVITE_KEY);
  } catch {
    // yoksay
  }
};
