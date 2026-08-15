/**
 * Para okuma ve gosterme — frontend tarafinin **tek kapisi**.
 *
 * Backend NUMERIC(10,2) alanlari bilerek **metin** olarak doner ("-135.00");
 * `Number(...)` denildigi anda float dunyasina gecilir ve
 * `docs/decisions/1.5.md`'de tek noktaya toplanan kurus kurali delinir.
 *
 * Bu dosya ayni disiplini istemcide surduruyor: metin dogrudan **tam sayi
 * kurusa** cevrilir, karsilastirma ve gosterim kurus uzerinden yapilir.
 * `parseFloat` ile karsilastirma yapilsaydi "0.00" ile "-0.001" gibi degerler
 * arasindaki ayrim motorun yuvarlamasina kalirdi.
 *
 * Backend'deki karsiligi: `src/utils/money.ts`
 */

/**
 * "123.45" / "-0.50" / "0.00" -> tam sayi kurus.
 *
 * `Math.round(Number(value) * 100)` **kullanilmiyor**: `Math.round(1.005 * 100)`
 * motorda 101 degil 100 verir (1.005 ikili tabanda tam degil). Onun yerine metin
 * noktadan ikiye bolunup iki tam sayi birlestiriliyor — sonuc her zaman tam.
 *
 * Ayristirilamayan deger icin `null` doner; cagiran taraf ne gosterecegine
 * kendisi karar verir (sessizce 0 saymak, bakiyeyi "kapali" gostermek olurdu).
 */
export const parseAmountToCents = (value: string): number | null => {
  const trimmed = value.trim();

  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(trimmed);

  if (!match) {
    return null;
  }

  const [, sign, whole, fraction = ''] = match;
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));

  return sign ? -cents : cents;
};

/**
 * Tam sayi kurus -> "1.234,56 ₺".
 *
 * `Intl.NumberFormat` yerine elle bicimlendiriliyor: Intl ciktisi calisma
 * ortamina gore degisir (bosluk yerine bolunmez bosluk, sembolun basa/sona
 * gecmesi) ve testler kirilgan olurdu. Girdi zaten tam sayi oldugu icin
 * bicimlendirmede hassasiyet kaybi da soz konusu degil.
 */
export const formatCents = (cents: number): string => {
  const negative = cents < 0;
  const absolute = Math.abs(cents);

  const whole = Math.floor(absolute / 100).toString();
  const fraction = (absolute % 100).toString().padStart(2, '0');

  // Binlik ayraci: sagdan uce grupla.
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  return `${negative ? '-' : ''}${grouped},${fraction} ₺`;
};

/** Isaretsiz gosterim: yon zaten metinle anlatildiginda eksi isareti gurultu olur. */
export const formatCentsAbsolute = (cents: number): string => formatCents(Math.abs(cents));

/* ------------------------------------------------------- form girdisi okuma */

/**
 * Kullanicinin form alanina yazdigi tutari kurusa cevirir.
 *
 * `parseAmountToCents`'ten iki farki var ve ikisi de girdinin **insandan**
 * gelmesinden: virgul ondalik ayraci kabul edilir (Turkce klavyede dogal olan
 * "12,50") ve negatif deger reddedilir (bir harcama payi eksi olamaz; backend
 * de reddeder). Bos metin `null` doner — "0" ile "hic yazilmamis" ayni sey
 * degil: ilki gecerli bir pay, ikincisi eksik alan.
 */
export const parseInputToCents = (value: string): number | null => {
  const normalized = value.trim().replace(',', '.');

  if (!normalized) {
    return null;
  }

  const cents = parseAmountToCents(normalized);

  return cents === null || cents < 0 ? null : cents;
};

/**
 * Yuzdeyi **baz puana** (yuzdenin yuzde biri) cevirir: "33.33" -> 3333.
 *
 * Yuzde de para gibi tam sayi uzerinden toplanir. `33.33 * 3` float'ta
 * `99.99000000000001` eder ve "toplam 100 mu?" sorusu motorun yuvarlamasina
 * kalirdi; baz puanla 3333 * 3 = 9999, kesin ve yanlis — yani hata dogru
 * yerde gorulur. Backend'deki karsiligi `parsePercentageToBasisPoints`.
 */
export const parsePercentageToBasisPoints = (value: string): number | null => {
  const normalized = value.trim().replace(',', '.');

  if (!normalized) {
    return null;
  }

  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);

  if (!match) {
    return null;
  }

  const [, whole, fraction = ''] = match;
  const basisPoints = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));

  return basisPoints > 10_000 ? null : basisPoints;
};

/* --------------------------------------------------------- API'ye yazma */

/**
 * Kurus -> backend'in bekledigi NUMERIC metni ("1234" -> "12.34").
 *
 * `(cents / 100).toFixed(2)` **kullanilmiyor**: bolme float'a gecmek demek ve
 * bu dosyanin varlik sebebi tam olarak ondan kacinmak. Tam sayi ikiye bolunup
 * metin olarak birlestiriliyor; sonuc her zaman kayipsiz.
 */
export const centsToApiAmount = (cents: number): string => {
  const negative = cents < 0;
  const absolute = Math.abs(cents);

  return `${negative ? '-' : ''}${Math.floor(absolute / 100)}.${(absolute % 100)
    .toString()
    .padStart(2, '0')}`;
};

/** Baz puan -> backend'in bekledigi yuzde metni (3333 -> "33.33"). */
export const basisPointsToApiPercentage = (basisPoints: number): string =>
  centsToApiAmount(basisPoints);

/** Baz puani ekranda gosterir: 3333 -> "%33,33". */
export const formatBasisPoints = (basisPoints: number): string => {
  const negative = basisPoints < 0;
  const absolute = Math.abs(basisPoints);

  return `${negative ? '-' : ''}%${Math.floor(absolute / 100)},${(absolute % 100)
    .toString()
    .padStart(2, '0')}`;
};
