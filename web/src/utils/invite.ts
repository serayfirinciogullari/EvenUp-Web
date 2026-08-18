/**
 * Davet linki uretimi ve panoya kopyalama.
 *
 * NEDEN BACKEND'IN `join_url`i KULLANILMIYOR
 * ------------------------------------------
 * `POST /groups/:id/invite` cevabinda bir `join_url` var, ama o adres backend'in
 * `APP_URL` ayarindan uretiliyor ve varsayilani **API adresi** (`localhost:3000`).
 * Oradaki `/groups/join/:code` bir POST uc noktasi; tarayicida acilinca GET olur
 * ve 404 doner. Yani kullaniciya gonderilecek bir link degil.
 *
 * Bu yuzden link istemcinin kendi origin'inden kuruluyor: kullanicinin
 * uygulamayi actigi adres, davet ettigi kisinin de acmasi gereken adrestir.
 * Deploy'da (Vercel) dogru alan adi kendiliginden geliyor; koda gomulu bir
 * `localhost` olsaydi uretimde paylasilan her link bozuk olurdu.
 */

/**
 * Katilma sayfasinin uygulama ici yolu (rota: App.tsx `/join/:inviteCode`).
 * Hem paylasilacak linkin hem de giris sonrasi otomatik yonlendirmenin
 * (bkz. utils/afterAuth.ts) ayni yeri gostermesi icin tek kaynak.
 *
 * Kodlar base64url (`[A-Za-z0-9_-]`), yani `encodeURIComponent` bugun hicbir
 * karakteri degistirmiyor; kod alfabesi degisirse linkin sessizce bozulmamasi
 * icin yine de duruyor.
 */
export const joinPath = (code: string): string => `/join/${encodeURIComponent(code)}`;

export const buildJoinUrl = (code: string): string => `${window.location.origin}${joinPath(code)}`;

/**
 * Panoya yazar. **Basarisiz olabilir ve bu normaldir:** Clipboard API yalnizca
 * guvenli baglamda (https ya da localhost) ve kullanici etkilesimi icinde
 * calisir; tarayici izni reddedebilir.
 *
 * Bu yuzden `boolean` donuyor — cagiran taraf basarisizlikta linki ekranda
 * gosterip kullanicinin elle kopyalamasina izin vermeli. Sessizce "kopyalandi"
 * demek, kullanicinin bos bir pano ile yapistirmaya calismasi demek olurdu.
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    if (!navigator.clipboard?.writeText) {
      return false;
    }

    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};
