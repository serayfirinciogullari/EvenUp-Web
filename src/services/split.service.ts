/**
 * Harcama bolusturme algoritmalari.
 *
 * `netting.service` gibi bu modul de SAF'tir: DB, express, HTTP yok. Girdi
 * olarak tam sayi kurus ve katilimci listesi alir, kurus cinsinden pay listesi
 * doner. Bu sayede "paylarin toplami her zaman harcamaya esittir" invaryanti
 * mock'suz test edilebilir.
 *
 * DEGISMEZ KURAL
 * --------------
 * Uc bolusme tipinde de:
 *
 *     sum(paylar) === toplam tutar        (tam esitlik, tolerans yok)
 *
 * Kurus artiklari nasil dagitiliyor? Uc tip de tek bir fonksiyona,
 * `distributeByWeights`'e indirgenir:
 *
 *   - equal      -> herkesin agirligi 1
 *   - percentage -> agirlik = baz puan (33.33% -> 3333)
 *   - exact      -> dagitim yok, tutarlar zaten verilmis; sadece toplam dogrulanir
 *
 * `distributeByWeights` **en buyuk artik (largest remainder / Hamilton)**
 * yontemini kullanir: once herkese tam bolunen kisim (floor) verilir, artan
 * kuruslar en buyuk ondalik artigi olan katilimcilara birer birer dagitilir.
 * Boylece kimse digerinden 1 kurustan fazla farkli odemez.
 *
 * "Artan her seyi son kisiye ekle" alternatifi de invaryanti saglardi ama
 * 10 kisilik bir grupta 9 kurusun tamami tek kisiye yazilirdi; ayrica "son
 * kisi" istemcinin gonderdigi dizinin sirasina bagli olurdu. Detay:
 * docs/decisions/1.5.md
 */

export type SplitType = 'equal' | 'exact' | 'percentage';

export const SPLIT_TYPES: readonly SplitType[] = ['equal', 'exact', 'percentage'];

/** Hesaplanmis tek bir pay. `cents` her zaman tam sayi ve >= 0'dir. */
export interface ShareAllocation {
  userId: string;
  cents: number;
}

export interface EqualSplitInput {
  type: 'equal';
  /** Aralarinda esit bolunecek kullanicilar. Bos olamaz. */
  participants: readonly string[];
}

export interface ExactSplitInput {
  type: 'exact';
  /** Her katilimcinin kurus cinsinden tam payi. Toplami tutara esit olmali. */
  shares: readonly ShareAllocation[];
}

export interface PercentageSplitInput {
  type: 'percentage';
  /** Baz puan (yuzdenin yuzde biri). Toplami tam 10000 (=%100) olmali. */
  shares: readonly { userId: string; basisPoints: number }[];
}

export type SplitInput = EqualSplitInput | ExactSplitInput | PercentageSplitInput;

/**
 * Bolusturme kurallarina uymayan girdi. Servis katmani bunu 400'e cevirir;
 * modul HTTP'den haberi olmasin diye ApiError kullanmaz.
 */
export class SplitError extends Error {
  public readonly details: Record<string, string>;

  constructor(message: string, details: Record<string, string> = {}) {
    super(message);
    this.name = 'SplitError';
    this.details = details;
  }
}

/* -------------------------------------------------------------- yardimcilar */

const assertParticipants = (userIds: readonly string[]): void => {
  if (userIds.length === 0) {
    throw new SplitError('Harcamanin en az bir katilimcisi olmali', {
      splitDetails: 'Katilimci listesi bos',
    });
  }

  const seen = new Set<string>();
  for (const userId of userIds) {
    if (seen.has(userId)) {
      throw new SplitError('Ayni kullanici birden fazla kez katilimci olamaz', {
        splitDetails: `Tekrar eden kullanici: ${userId}`,
      });
    }
    seen.add(userId);
  }
};

/**
 * `totalCents`'i agirliklara gore dagitir. Donen paylarin toplami **her zaman**
 * `totalCents`'e esittir.
 *
 * Adimlar:
 *  1. Herkes icin `floor(total * weight / totalWeight)` hesaplanir.
 *  2. Dagitilamayan artik = total - sum(floor). Bu deger her zaman
 *     0 <= artik < katilimci sayisi araligindadir (her floor en fazla 1 birim
 *     eksik kalir), yani kimseye 1 kurustan fazla eklenmez.
 *  3. Artik, bolme isleminden kalan `total * weight % totalWeight` degeri en
 *     buyuk olanlardan baslayarak birer kurus dagitilir. Esitlikte userId'ye
 *     gore siralanir: ayni girdi her zaman ayni sonucu verir (deterministik).
 */
export function distributeByWeights(
  totalCents: number,
  participants: readonly { userId: string; weight: number }[]
): ShareAllocation[] {
  assertParticipants(participants.map((participant) => participant.userId));

  const totalWeight = participants.reduce((sum, participant) => sum + participant.weight, 0);

  if (totalWeight <= 0) {
    throw new SplitError('Bolusturme agirliklarinin toplami sifir olamaz', {
      splitDetails: 'Agirlik toplami pozitif olmali',
    });
  }

  const computed = participants.map((participant) => {
    const exact = totalCents * participant.weight;
    return {
      userId: participant.userId,
      cents: Math.floor(exact / totalWeight),
      remainder: exact % totalWeight,
    };
  });

  let leftover = totalCents - computed.reduce((sum, entry) => sum + entry.cents, 0);

  // Artigi en buyuk ondalik parcaya sahip olanlara dagit; esitlikte userId sirasi.
  const order = [...computed].sort(
    (a, b) => b.remainder - a.remainder || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0)
  );

  for (const entry of order) {
    if (leftover <= 0) {
      break;
    }
    entry.cents += 1;
    leftover -= 1;
  }

  return computed.map(({ userId, cents }) => ({ userId, cents }));
}

/* ------------------------------------------------------------- 1. esit bolme */

/**
 * Esit bolme. 100.00 TL / 3 kisi -> 33.34 + 33.33 + 33.33 = 100.00.
 * Fazla kurusu alan kisi userId sirasina gore secilir (bkz. distributeByWeights).
 */
export function splitEqual(totalCents: number, participants: readonly string[]): ShareAllocation[] {
  return distributeByWeights(
    totalCents,
    participants.map((userId) => ({ userId, weight: 1 }))
  );
}

/* ------------------------------------------------------------ 2. tam tutar */

/**
 * Tam tutarli bolme: paylar zaten verilmis, hesaplanacak bir sey yok —
 * yapilan tek is **dogrulama**.
 *
 * Karsilastirma tam sayi kurus uzerinde: `33.33 + 33.33 + 33.34` float olarak
 * `100.00000000000001` eder ve gecerli bir girdi "toplam tutmuyor" diye
 * reddedilirdi. Kurusa cevrilince 3333 + 3333 + 3334 = 10000, tam esitlik.
 */
export function splitExact(
  totalCents: number,
  shares: readonly ShareAllocation[]
): ShareAllocation[] {
  assertParticipants(shares.map((share) => share.userId));

  for (const share of shares) {
    if (!Number.isInteger(share.cents) || share.cents < 0) {
      throw new SplitError('Pay tutarlari negatif olamaz', {
        splitDetails: `Gecersiz pay: ${share.userId}`,
      });
    }
  }

  const sum = shares.reduce((total, share) => total + share.cents, 0);

  if (sum !== totalCents) {
    throw new SplitError('Paylarin toplami harcama tutarina esit olmali', {
      splitDetails: `Paylarin toplami ${sum / 100}, harcama ${totalCents / 100}`,
    });
  }

  return shares.map(({ userId, cents }) => ({ userId, cents }));
}

/* --------------------------------------------------------------- 3. yuzde */

/**
 * Yuzdeye gore bolme. Yuzdelerin toplami tam %100 (10000 baz puan) olmali.
 * Tutarlar yuzdelere gore dagitilir; kurus artigi yine en buyuk artik
 * yontemiyle paylastirilir, boylece toplam tam tutar.
 */
export function splitByPercentage(
  totalCents: number,
  shares: readonly { userId: string; basisPoints: number }[]
): ShareAllocation[] {
  assertParticipants(shares.map((share) => share.userId));

  for (const share of shares) {
    if (!Number.isInteger(share.basisPoints) || share.basisPoints <= 0) {
      throw new SplitError('Yuzdeler sifirdan buyuk olmali', {
        splitDetails: `Gecersiz yuzde: ${share.userId}`,
      });
    }
  }

  const total = shares.reduce((sum, share) => sum + share.basisPoints, 0);

  if (total !== 10_000) {
    throw new SplitError('Yuzdelerin toplami 100 olmali', {
      splitDetails: `Gonderilen toplam: %${total / 100}`,
    });
  }

  return distributeByWeights(
    totalCents,
    shares.map((share) => ({ userId: share.userId, weight: share.basisPoints }))
  );
}

/* ---------------------------------------------------------------- giris */

/**
 * Bolusme tipine gore dogru algoritmayi calistirir ve sonucu son bir kez
 * dogrular. Son kontrol savunma amacli: uc tipten biri ileride degistirilirse
 * invaryant sessizce bozulmasin, burada patlasin.
 */
export function computeShares(totalCents: number, input: SplitInput): ShareAllocation[] {
  if (!Number.isInteger(totalCents) || totalCents <= 0) {
    throw new SplitError('Harcama tutari sifirdan buyuk olmali', {
      amount: 'Tutar pozitif olmali',
    });
  }

  let shares: ShareAllocation[];

  switch (input.type) {
    case 'equal':
      shares = splitEqual(totalCents, input.participants);
      break;
    case 'exact':
      shares = splitExact(totalCents, input.shares);
      break;
    case 'percentage':
      shares = splitByPercentage(totalCents, input.shares);
      break;
    default: {
      // Tip sistemi buraya dusmeyi engeller; yine de calisma zamaninda koruma.
      const unknownType: never = input;
      throw new SplitError(`Bilinmeyen bolusme tipi: ${JSON.stringify(unknownType)}`);
    }
  }

  const sum = shares.reduce((total, share) => total + share.cents, 0);

  if (sum !== totalCents) {
    throw new Error(
      `Bolusturme invaryanti bozuldu: paylarin toplami ${sum}, harcama ${totalCents} kurus`
    );
  }

  return shares;
}

export default {
  SPLIT_TYPES,
  SplitError,
  computeShares,
  distributeByWeights,
  splitEqual,
  splitExact,
  splitByPercentage,
};
