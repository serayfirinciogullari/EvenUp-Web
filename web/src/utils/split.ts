import { centsToApiAmount, formatCentsAbsolute, parseInputToCents } from './money';

import type { ExpenseSplitType } from '../types/models';

/**
 * Bolusme formunun hesap ve dogrulama mantigi — **tek kapi**.
 *
 * Bilesenden ayri bir dosyada duruyor cunku burasi formun *gorunumu* degil,
 * *kurali*: "paylarin toplami harcamaya esit olmali" ve "tam olarak N kisi
 * secilmis olmali". Ayni kural backend'de `split.service` icinde yaziyor ve
 * **otorite orasi**; buradaki kopya yalnizca kullaniciya aninda cevap vermek
 * icin. Neden iki yerde birden dogrulandigi docs/decisions/2.4.md'de.
 *
 * PARA YINE TAM SAYI UZERINDEN
 * ----------------------------
 * Toplam karsilastirmasi kurus uzerinde yapiliyor. `33.33 + 33.33 + 33.34`
 * float'ta `100.00000000000001` eder; gecerli bir girdi "toplam tutmuyor" diye
 * reddedilirdi. Ayni disiplin `utils/money.ts` ve backend'de 1.5'te kurulmustu.
 *
 * UC MOD, IKI BACKEND TIPI
 * ------------------------
 * Formda uc secenek var: "Esit", "Ozel tutar", "Kaca Bol". Backend'de yalnizca
 * iki tip var (`equal`, `exact`), cunku "Kaca Bol" bir hesap yontemi degil bir
 * **secim akisi**: kullanici once "kaca bolunecek" der, sonra tam o sayida kisi
 * isaretler; tutar yine esit bolunur. Yuzdeli bolusme ise tamamen kaldirildi.
 * Ikisinin de gerekcesi: docs/decisions/bolusum-basitlestirme.md
 */

/* ------------------------------------------------------------------ tipler */

/**
 * Formdaki bolusme secenegi. `ExpenseSplitType`'tan farki `count`: o yalnizca
 * arayuzde var, istege `equal` olarak cikar (bkz. `toApiSplitType`).
 */
export type SplitMode = ExpenseSplitType | 'count';

/** Formda tek bir katilimci satiri. */
export interface SplitRow {
  userId: string;
  /** Kullanicinin yazdigi ham metin (tutar). */
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
  /** Girilen toplam: `exact` icin kurus, `count` icin secili kisi sayisi. */
  entered: number;
  /** Hedef toplam: `exact` icin harcama tutari (kurus), `count` icin bolen sayisi. */
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
 *
 * "Kaca Bol" modu da bu fonksiyonu kullanir: orada da bolusme esit, yalnizca
 * katilimci listesi farkli bir ekranda toplanir.
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

/** Hicbir katilimci secili degilse her modda ayni cevap. */
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

/* ------------------------------------------------------------- 3. kaca bol */

/** "Kaca Bol" en az iki kisilik bir bolme; 1'e bolmek zaten bolusme degil. */
export const MIN_SPLIT_COUNT = 2;

/**
 * "Kaca Bol" kurali: **tam olarak** `count` kisi secili olmali.
 *
 * Azi da fazlasi da hata, ama ikisi ayni cumleyle degil kendi cumlesiyle
 * soyleniyor ("2 kisi daha sec" / "1 kisinin isaretini kaldir"). Kullaniciya ne
 * yapmasi gerektigini soylemek, "secim gecersiz" demekten her zaman daha kisa
 * yol.
 *
 * Neden fazla secim de reddediliyor: "4'e bol" deyip 5 kisi isaretlemek iki ayri
 * niyeti ayni anda ifade ediyor ve hangisinin kazandigi belirsiz. Fazlaligi
 * sessizce kirpmak (ilk dordu almak gibi) kullanicinin gormedigi bir karar
 * olurdu; harcamanin kime yazildigi tam da gormesi gereken sey.
 */
export const validateCount = (count: number, selected: readonly string[]): SplitValidation => {
  const difference = count - selected.length;

  const base = {
    entered: selected.length,
    target: count,
    difference,
    invalidRows: [] as string[],
  };

  if (difference === 0) {
    return { ...base, valid: true, message: `${count} kisi arasinda esit bolunuyor`, tone: 'ok' };
  }

  return {
    ...base,
    valid: false,
    message:
      difference > 0
        ? `${count} kisiye bolunecek: ${difference} kisi daha sec`
        : `${count} kisiye bolunecek: ${-difference} kisinin isaretini kaldir`,
    tone: 'error',
  };
};

/** Tipe gore dogru dogrulayiciyi calistirir (`count` icin `validateCount`). */
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
  }
};

/* ------------------------------------------------------- istege cevirme */

/**
 * Form modundan backend'in `splitType` degerine. "Kaca Bol" arka planda
 * **esit bolusme**: backend'in bu akistan haberi yok, olmasina da gerek yok —
 * gonderilen sey "su kisiler arasinda esit bol"dan ibaret.
 */
export const toApiSplitType = (mode: SplitMode): ExpenseSplitType =>
  mode === 'count' ? 'equal' : mode;

/** `POST /groups/:id/expenses` govdesindeki `splitDetails` alani. */
export type SplitDetails =
  | { participants: string[] }
  | { shares: { userId: string; amount: string }[] };

/**
 * Form satirlarini backend'in bekledigi govdeye cevirir.
 *
 * Yalnizca `validateSplit`/`validateCount` gecerli dedikten sonra cagrilmali;
 * burada ikinci bir dogrulama yok cunku iki kopya kural, bir gun ayrisan iki
 * kural demek.
 */
export const toSplitDetails = (
  mode: SplitMode,
  allRows: readonly SplitRow[],
  /** Yalnizca `count` modunda kullanilir: "kaca bol" ekraninda secilen kisiler. */
  countSelection: readonly string[] = []
): SplitDetails => {
  // "Kaca Bol" govdesi esit bolusmenin govdesiyle birebir ayni; tek fark
  // listenin hangi ekrandan toplandigi.
  if (mode === 'count') {
    return { participants: [...countSelection] };
  }

  const rows = allRows.filter((row) => row.included);

  if (mode === 'equal') {
    return { participants: rows.map((row) => row.userId) };
  }

  return {
    shares: rows.map((row) => ({
      userId: row.userId,
      amount: centsToApiAmount(parseInputToCents(row.value) ?? 0),
    })),
  };
};

export default {
  equalShares,
  validateEqual,
  validateExact,
  validateCount,
  validateSplit,
  toApiSplitType,
  toSplitDetails,
};
