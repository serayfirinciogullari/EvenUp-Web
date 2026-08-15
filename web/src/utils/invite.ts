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
 *
 * ACIK MADDE: frontend'de `/groups/join/:code` rotasi **henuz yok** (App.tsx).
 * Link dogru adresi gosteriyor ama o sayfa sonraki gorevde yazilacak.
 * Backend tarafinda da `APP_URL`in frontend origin'ine cekilmesi gerekir ki
 * `join_url` anlamli hale gelsin.
 */

export const buildJoinUrl = (code: string): string =>
  `${window.location.origin}/groups/join/${code}`;

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
