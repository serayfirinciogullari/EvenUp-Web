/**
 * Para donusumlerinin **tek kapisi**.
 *
 * KURAL: uygulama icindeki her para hesabi tam sayi kurus uzerinden yapilir.
 * Float ile para toplamak (0.1 + 0.2 = 0.30000000000000004) bolusturmede
 * "paylarin toplami harcamaya esit degil" seklinde geri doner. Veritabaninda
 * tutar NUMERIC(10,2) — bu tip float degil, tam ondalik; ama pg surucusu onu
 * JS'e **string** olarak verir ve `Number(...)` ile carpip toplandigi anda
 * float dunyasina gecilir. Bu modul o gecisi tek noktada tutar:
 *
 *     DB (NUMERIC string)  ->  parseAmountToCents  ->  integer kurus
 *     integer kurus        ->  formatCents         ->  DB / JSON (string)
 *
 * Gerekce ve NUMERIC vs BIGINT karsilastirmasi: docs/decisions/1.5.md
 */

/** NUMERIC(10,2): en fazla 99.999.999,99 -> kurus cinsinden ust sinir. */
export const MAX_AMOUNT_CENTS = 9_999_999_999;

/**
 * Kabul edilen tutar bicimi: en fazla 10 hane tam kisim, en fazla 2 ondalik.
 * `12`, `12.5`, `12.34`, `'12.34'` gecerli; `12.345` degil.
 */
const AMOUNT_PATTERN = /^(\d{1,10})(?:\.(\d{1,2}))?$/;

/**
 * Kullanicidan gelen tutari kurusa cevirir. Gecersizse `null` doner —
 * hata mesajini cagiran katman (servis) uretir, boylece bu modul HTTP'den
 * bagimsiz kalir.
 *
 * Cevrim float carpimi ile **yapilmaz**: `Math.round(1.005 * 100)` motorda
 * 100 verir (1.005 ikili tabanda tam degildir). Onun yerine metin ikiye
 * bolunup iki tam sayi toplanir; sonuc her zaman tam.
 *
 * Bunun beklenen bir yan etkisi var: `0.1 + 0.2` sonucu buraya gelirse
 * metin karsiligi `0.30000000000000004` olur ve 2 ondalik kuralina takilip
 * reddedilir. Sessizce 0.30'a yuvarlamaktansa reddetmek dogru: girdi zaten
 * float aritmetiginden gelmis demektir.
 */
export const parseAmountToCents = (value: unknown): number | null => {
  if (typeof value !== 'number' && typeof value !== 'string') {
    return null;
  }

  if (typeof value === 'number' && !Number.isFinite(value)) {
    return null;
  }

  // 1e21 gibi ussel gosterimler regex'e takilir; bilerek reddedilir.
  const text = String(value).trim();
  const match = AMOUNT_PATTERN.exec(text);

  if (!match) {
    return null;
  }

  const [, whole, fraction = ''] = match;
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));

  return cents > MAX_AMOUNT_CENTS ? null : cents;
};

/**
 * Kurusu NUMERIC(10,2) kolonuna ve JSON'a yazilabilir metne cevirir.
 * Bolme yerine tam sayi aritmetigi kullanilir; float hic devreye girmez.
 */
export const formatCents = (cents: number): string => {
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(Math.trunc(cents));

  return `${sign}${Math.trunc(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`;
};

/**
 * Yuzdeyi baz puana (basis point: yuzdenin yuzde biri) cevirir.
 * 33.33% -> 3333 bp. Yuzdelerin toplaminin tam 100 oldugunu tam sayi
 * karsilastirmasiyla dogrulayabilmek icin gerekli: `33.33 * 3 === 99.99`
 * float'ta `99.99000000000001` cikar ve gecerli bir girdi reddedilirdi.
 */
export const parsePercentageToBasisPoints = (value: unknown): number | null => {
  if (typeof value !== 'number' && typeof value !== 'string') {
    return null;
  }

  if (typeof value === 'number' && !Number.isFinite(value)) {
    return null;
  }

  const text = String(value).trim();
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(text);

  if (!match) {
    return null;
  }

  const [, whole, fraction = ''] = match;
  const basisPoints = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));

  return basisPoints > 10_000 ? null : basisPoints;
};

/** Baz puani gosterilebilir yuzdeye cevirir: 3333 -> "33.33". */
export const formatBasisPoints = (basisPoints: number): string => formatCents(basisPoints);

export default {
  MAX_AMOUNT_CENTS,
  parseAmountToCents,
  formatCents,
  parsePercentageToBasisPoints,
  formatBasisPoints,
};
