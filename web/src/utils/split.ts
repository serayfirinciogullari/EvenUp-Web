import {
  basisPointsToApiPercentage,
  centsToApiAmount,
  formatBasisPoints,
  formatCentsAbsolute,
  parseInputToCents,
  parsePercentageToBasisPoints,
} from './money';

import type { ExpenseSplitType } from '../types/models';

/**
 * Bolusme formunun hesap ve dogrulama mantigi — **tek kapi**.
 *
 * Bilesenden ayri bir dosyada duruyor cunku burasi formun *gorunumu* degil,
 * *kurali*: "paylarin toplami harcamaya esit olmali" ve "yuzdelerin toplami
 * 100 olmali". Ayni kural backend'de `split.service` icinde yaziyor ve
 * **otorite orasi**; buradaki kopya yalnizca kullaniciya aninda cevap vermek
 * icin. Neden iki yerde birden dogrulandigi docs/decisions/2.4.md'de.
 *
 * PARA YINE TAM SAYI UZERINDEN
 * ----------------------------
 * Toplam karsilastirmasi kurus (ve yuzde icin baz puan) uzerinde yapiliyor.
 * `33.33 + 33.33 + 33.34` float'ta `100.00000000000001` eder; gecerli bir
 * girdi "toplam tutmuyor" diye reddedilirdi. Ayni disiplin `utils/money.ts`
 * ve backend'de 1.5'te kurulmustu.
 */

/* ------------------------------------------------------------------ tipler */

/** Formda tek bir katilimci satiri. */
export interface SplitRow {
  userId: string;
  /** Kullanicinin yazdigi ham metin (tutar ya da yuzde). */
  value: string;
  /** Yalnizca `equal` icin anlamli: bu kisi bolusmeye dahil mi? */
  included: boolean;
}

export type SplitTone = 'ok' | 'warn' | 'error';

/**
 * Anlik toplam dogrulamasinin sonucu. Form bu nesneden hem gonderilebilirlik
 * kararini (`valid`) hem de ekranda gosterilecek cumleyi (`message`) alir —
 * ikisinin ayrisabilecegi ikinci bir yol yok.
 */
export interface SplitValidation {
  valid: boolean;
  /** Girilen toplam: `exact` icin kurus, `percentage` icin baz puan. */
  entered: number;
  /** Hedef toplam: `exact` icin harcama tutari (kurus), `percentage` icin 10000. */
  target: number;
  /** `target - entered`. Pozitif = eksik, negatif = fazla. */
  difference: number;
  /** Ekranda gosterilen cumle ("42,00 ₺ eksik" gibi). */
  message: string;
  tone: SplitTone;
  /** Ayristirilamayan ya da eksik alanlarin `userId`leri. */
  invalidRows: string[];
}

/* ------------------------------------------------------------- 1. esit bolme */

/**
 * Esit bolmenin **onizlemesi**: 100,00 ₺ / 3 kisi -> 33,34 + 33,33 + 33,33.
 *
 * Backend'deki `distributeByWeights` ile ayni algoritma (en buyuk artik /
 * Hamilton) ve ayni tie-break (`userId` artan). Yani onizleme "yaklasik" degil,
 * kaydedilecek degerin **aynisi**.
 *
 * Neden `Math.floor(total / n)` deyip artigi anlatmakla yetinilmedi: kullanici
 * formda 33,33 gorup listede 33,34 gorseydi, bu bir kurusluk fark tam olarak
 * "uygulama yanlis hesapliyor" hissi uretirdi. Kopya olmasinin bedeli ve nasil
 * korundugu docs/decisions/2.4.md icinde.
 */
export const equalShares = (totalCents: number, userIds: readonly string[]): Map<string, number> => {
  const result = new Map<string, number>();

  if (userIds.length === 0 || totalCents <= 0) {
    for (const userId of userIds) {
      result.set(userId, 0);
    }
    return result;
  }

  const base = Math.floor(totalCents / userIds.length);
  let leftover = totalCents - base * userIds.length;

  // Artik kurus, userId sirasina gore birer birer dagitilir: ayni girdi her
  // zaman ayni sonucu verir ve kimse digerinden 1 kurustan fazla odemez.
  const order = [...userIds].sort();

  for (const userId of userIds) {
    result.set(userId, base);
  }

  for (const userId of order) {
    if (leftover <= 0) {
      break;
    }
    result.set(userId, (result.get(userId) ?? 0) + 1);
    leftover -= 1;
  }

  return result;
};

/** `equal` icin tek kural: en az bir katilimci secili olmali. */
export const validateEqual = (rows: readonly SplitRow[]): SplitValidation => {
  const included = rows.filter((row) => row.included);

  if (included.length === 0) {
    return {
      valid: false,
      entered: 0,
      target: 0,
      difference: 0,
      message: 'En az bir kisi secilmeli',
      tone: 'error',
      invalidRows: [],
    };
  }

  return {
    valid: true,
    entered: included.length,
    target: included.length,
    difference: 0,
    message: `${included.length} kisi arasinda esit bolunuyor`,
    tone: 'ok',
    invalidRows: [],
  };
};

/* ------------------------------------------------------------ 2. ozel tutar */

/** Hicbir katilimci secili degilse uc tipte de ayni cevap. */
const noParticipants = (target: number): SplitValidation => ({
  valid: false,
  entered: 0,
  target,
  difference: target,
  message: 'En az bir kisi secilmeli',
  tone: 'error',
  invalidRows: [],
});

/**
 * Girilen tutarlarin toplamini harcama tutariyla karsilastirir.
 *
 * Yalnizca **secili** katilimcilar sayilir: isareti kaldirilan kisi bolusmeye
 * hic girmez (0,00 ₺ ile girmez — o kisi listede gorunur ve "0 odedi" gibi
 * okunurdu).
 *
 * `amountCents` `null` olabilir (kullanici tutari henuz yazmadi ya da bicimi
 * bozuk). O durumda "eksik/fazla" demek anlamsiz olurdu — hedef bilinmiyor.
 */
export const validateExact = (
  amountCents: number | null,
  allRows: readonly SplitRow[]
): SplitValidation => {
  const rows = allRows.filter((row) => row.included);

  if (rows.length === 0) {
    return noParticipants(amountCents ?? 0);
  }

  const invalidRows: string[] = [];
  let entered = 0;

  for (const row of rows) {
    const cents = parseInputToCents(row.value);

    if (cents === null) {
      invalidRows.push(row.userId);
      continue;
    }

    entered += cents;
  }

  if (amountCents === null) {
    return {
      valid: false,
      entered,
      target: 0,
      difference: 0,
      message: 'Once harcama tutarini gir',
      tone: 'warn',
      invalidRows,
    };
  }

  const difference = amountCents - entered;

  if (invalidRows.length > 0) {
    return {
      valid: false,
      entered,
      target: amountCents,
      difference,
      message: 'Her katilimci icin gecerli bir tutar gir',
      tone: 'error',
      invalidRows,
    };
  }

  if (difference === 0) {
    return {
      valid: true,
      entered,
      target: amountCents,
      difference,
      message: `Toplam tutuyor: ${formatCentsAbsolute(entered)}`,
      tone: 'ok',
      invalidRows,
    };
  }

  return {
    valid: false,
    entered,
    target: amountCents,
    difference,
    // Yon her zaman yazili: "tutmuyor" demek, kullaniciya hangi yone ne kadar
    // duzeltmesi gerektigini bulma isini birakirdi.
    message:
      difference > 0
        ? `${formatCentsAbsolute(difference)} eksik`
        : `${formatCentsAbsolute(difference)} fazla`,
    tone: 'error',
    invalidRows,
  };
};

/* ---------------------------------------------------------------- 3. yuzde */

const FULL_PERCENTAGE = 10_000; // baz puan cinsinden %100

/** Yuzdelerin toplaminin tam %100 olup olmadigini kontrol eder. */
export const validatePercentage = (allRows: readonly SplitRow[]): SplitValidation => {
  const rows = allRows.filter((row) => row.included);

  if (rows.length === 0) {
    return noParticipants(FULL_PERCENTAGE);
  }

  const invalidRows: string[] = [];
  let entered = 0;

  for (const row of rows) {
    const basisPoints = parsePercentageToBasisPoints(row.value);

    // Sifir yuzde backend'de de reddediliyor ("Yuzdeler sifirdan buyuk olmali"):
    // %0 ile katilan biri, katilmayan biriyle ayni sey. Dahil olmayan kisi
    // isaretini kaldirarak listeden cikarilir.
    if (basisPoints === null || basisPoints === 0) {
      invalidRows.push(row.userId);
      continue;
    }

    entered += basisPoints;
  }

  const difference = FULL_PERCENTAGE - entered;

  if (invalidRows.length > 0) {
    return {
      valid: false,
      entered,
      target: FULL_PERCENTAGE,
      difference,
      message: "Her katilimci icin 0'dan buyuk bir yuzde gir",
      tone: 'error',
      invalidRows,
    };
  }

  if (difference === 0) {
    return {
      valid: true,
      entered,
      target: FULL_PERCENTAGE,
      difference,
      message: 'Toplam %100',
      tone: 'ok',
      invalidRows,
    };
  }

  return {
    valid: false,
    entered,
    target: FULL_PERCENTAGE,
    difference,
    message: `Toplam ${formatBasisPoints(entered)} - ${formatBasisPoints(Math.abs(difference))} ${
      difference > 0 ? 'eksik' : 'fazla'
    }`,
    tone: 'error',
    invalidRows,
  };
};

/** Tipe gore dogru dogrulayiciyi calistirir. */
export const validateSplit = (
  splitType: ExpenseSplitType,
  amountCents: number | null,
  rows: readonly SplitRow[]
): SplitValidation => {
  switch (splitType) {
    case 'equal':
      return validateEqual(rows);
    case 'exact':
      return validateExact(amountCents, rows);
    case 'percentage':
      return validatePercentage(rows);
  }
};

/* ------------------------------------------------------- istege cevirme */

/** `POST /groups/:id/expenses` govdesindeki `splitDetails` alani. */
export type SplitDetails =
  | { participants: string[] }
  | { shares: { userId: string; amount: string }[] }
  | { shares: { userId: string; percentage: string }[] };

/**
 * Form satirlarini backend'in bekledigi govdeye cevirir.
 *
 * Yalnizca `validateSplit` gecerli dedikten sonra cagrilmali; burada ikinci bir
 * dogrulama yok cunku iki kopya kural, bir gun ayrisan iki kural demek.
 */
export const toSplitDetails = (
  splitType: ExpenseSplitType,
  allRows: readonly SplitRow[]
): SplitDetails => {
  const rows = allRows.filter((row) => row.included);

  if (splitType === 'equal') {
    return { participants: rows.map((row) => row.userId) };
  }

  if (splitType === 'exact') {
    return {
      shares: rows.map((row) => ({
        userId: row.userId,
        amount: centsToApiAmount(parseInputToCents(row.value) ?? 0),
      })),
    };
  }

  return {
    shares: rows.map((row) => ({
      userId: row.userId,
      percentage: basisPointsToApiPercentage(parsePercentageToBasisPoints(row.value) ?? 0),
    })),
  };
};

export default {
  equalShares,
  validateEqual,
  validateExact,
  validatePercentage,
  validateSplit,
  toSplitDetails,
};
