/**
 * Grup rengi — **turetilmis**, saklanmiyor.
 *
 * NEDEN VERITABANINDAN DEGIL
 * --------------------------
 * `groups` tablosunda bir `color` sutunu **yok** (migration'lar 00-12 kontrol
 * edildi). Renk burada grubun `id`sinden deterministik olarak uretiliyor:
 * ayni grup her cihazda, her oturumda ve her yeniden yuklemede ayni rengi
 * aliyor, hicbir ek istek ya da migration gerekmeden.
 *
 * Sutun ileride eklenirse degisecek tek yer bu dosya: `colorOfGroup` once
 * `group.color`a bakar, yoksa buradaki paletten devam eder. Cagiran taraflar
 * (sidebar) hic degismez.
 *
 * NEDEN `id`, `name` DEGIL
 * ------------------------
 * Grup adi degistirilebiliyor; renk ada bagli olsaydi ad degisince renk de
 * degisir ve kullanicinin kurdugu "yesilimsi olan tatil grubu" esleşmesi
 * bozulurdu. `id` degismez.
 *
 * PALET: TEK AILE
 * ---------------
 * Alti ton da rose -> lilac yayinda; sari, yesil, mavi yok. Iki gerekce:
 *
 *   1. Marka kurali (bkz. index.css): sicaklik kanali rose ailesinden gelir.
 *      Rastgele hue'lar sidebar'i bir renk cetveline cevirirdi.
 *   2. Sinyal renkleri (yesil/kirmizi) **yalnizca** anlam tasiyan yerlerde
 *      kullanilir — bakiye, rozet. Bir grup noktasi yesil olsaydi, yanindaki
 *      bakiye yesiliyle ayni dili konusur ve "bu grup dengede" gibi okunurdu.
 *
 * Tonlar orta koyulukta secildi: hem cream (#FAF4F2) hem koyu tema zemini
 * (#1A1114) uzerinde ayirt ediliyorlar, dolayisiyla palet temaya gore
 * degismiyor. Nokta zaten dekoratif bir isaret — yanindaki grup adi bilgiyi
 * tasiyor, renk yalnizca aramayi hizlandiriyor.
 */

const PALETTE = [
  '#8b4e5c',
  '#b2707f',
  '#c99ba6',
  '#a385b5',
  '#7c6187',
  '#b98a93',
] as const;

/**
 * FNV-1a benzeri kisa bir karma.
 *
 * Kriptografik degil ve olmasi da gerekmiyor: tek istenen, ayni metnin her
 * zaman ayni sayiyi vermesi ve ardisik UUID'lerin ayni kovaya dusmemesi.
 * `id.length` gibi daha basit bir sey, benzer uzunluktaki tum grup id'lerini
 * ayni renge yollardi.
 */
const hashOf = (value: string): number => {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash);
};

export const colorOfGroup = (groupId: string): string =>
  PALETTE[hashOf(groupId) % PALETTE.length];

export default colorOfGroup;
