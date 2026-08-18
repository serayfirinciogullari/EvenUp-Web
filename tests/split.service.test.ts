import {
  computeShares,
  splitEqual,
  splitExact,
  SplitError,
  SPLIT_TYPES,
} from '../src/services/split.service';
import { formatCents, parseAmountToCents } from '../src/utils/money';

import type { ShareAllocation } from '../src/services/split.service';

/**
 * Bolusturme algoritmalarinin testleri.
 *
 * Modul saf oldugu icin (DB/HTTP yok) mock'a gerek yok. Dosyanin asil derdi
 * tek bir invaryant:
 *
 *     her bolusme tipinde  sum(paylar) === harcama tutari
 *
 * Ozellikle 3'e bolunmeyen tutarlarda (100/3) — kurus artigi kaybolmamali ya
 * da fazladan uretilmemeli.
 */

const sum = (shares: readonly ShareAllocation[]): number =>
  shares.reduce((total, share) => total + share.cents, 0);

const centsOf = (shares: readonly ShareAllocation[], userId: string): number =>
  shares.find((share) => share.userId === userId)?.cents ?? 0;

// Siralamaya bagimli olmayan karsilastirma icin.
const asMap = (shares: readonly ShareAllocation[]): Record<string, number> =>
  Object.fromEntries(shares.map((share) => [share.userId, share.cents]));

const ALI = 'a0000000-0000-4000-8000-000000000001';
const BURAK = 'b0000000-0000-4000-8000-000000000002';
const CEM = 'c0000000-0000-4000-8000-000000000003';
const DENIZ = 'd0000000-0000-4000-8000-000000000004';

/* ============================================================ esit bolme */

describe('splitEqual', () => {
  it('100.00 TL uc kisiye bolununce toplam yine 100.00 eder (33.34 + 33.33 + 33.33)', () => {
    const shares = splitEqual(10_000, [ALI, BURAK, CEM]);

    expect(sum(shares)).toBe(10_000);
    expect(asMap(shares)).toEqual({ [ALI]: 3334, [BURAK]: 3333, [CEM]: 3333 });
  });

  it('kimse digerinden 1 kurustan fazla farkli odemez', () => {
    const shares = splitEqual(10_000, [ALI, BURAK, CEM]);
    const values = shares.map((share) => share.cents);

    expect(Math.max(...values) - Math.min(...values)).toBe(1);
  });

  it('artan kuruslar tek kisiye yiginmaz, ayri ayri dagitilir', () => {
    // 10.00 TL / 3 = 3.33 + artan 1 kurus degil; 0.10 / 4 gibi buyuk artikta
    // fark daha net: 0.10 -> 10 kurus, 4 kisi -> 3,3,2,2
    const shares = splitEqual(10, [ALI, BURAK, CEM, DENIZ]);

    expect(sum(shares)).toBe(10);
    expect(shares.filter((share) => share.cents === 3)).toHaveLength(2);
    expect(shares.filter((share) => share.cents === 2)).toHaveLength(2);
  });

  it('1 kurus uc kisiye bolununce toplam 1 kurus kalir', () => {
    const shares = splitEqual(1, [ALI, BURAK, CEM]);

    expect(sum(shares)).toBe(1);
    expect(shares.filter((share) => share.cents === 0)).toHaveLength(2);
  });

  it('katilimci sirasi degisse de sonuc degismez (deterministik)', () => {
    const forward = splitEqual(10_000, [ALI, BURAK, CEM]);
    const reversed = splitEqual(10_000, [CEM, BURAK, ALI]);

    expect(asMap(reversed)).toEqual(asMap(forward));
  });

  it('1 kurustan 500.00 TL\'ye kadar her tutarda ve 1-12 kiside toplam korunur', () => {
    const participants = [ALI, BURAK, CEM, DENIZ, 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'];

    for (let cents = 1; cents <= 50_000; cents += 7) {
      for (let people = 1; people <= participants.length; people++) {
        const shares = splitEqual(cents, participants.slice(0, people));
        const values = shares.map((share) => share.cents);

        expect(sum(shares)).toBe(cents);
        expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
        expect(values.every((value) => Number.isInteger(value) && value >= 0)).toBe(true);
      }
    }
  });

  it('katilimci listesi bos olamaz', () => {
    expect(() => splitEqual(10_000, [])).toThrow(SplitError);
  });

  it('ayni kullanici iki kez katilimci olamaz', () => {
    expect(() => splitEqual(10_000, [ALI, ALI])).toThrow(/birden fazla/i);
  });
});

/* =========================================================== tam tutar */

describe('splitExact', () => {
  it('paylarin toplami tutara esitse kabul eder', () => {
    const shares = splitExact(10_000, [
      { userId: ALI, cents: 3334 },
      { userId: BURAK, cents: 3333 },
      { userId: CEM, cents: 3333 },
    ]);

    expect(sum(shares)).toBe(10_000);
  });

  it('float toplama hatasi yuzunden gecerli girdiyi reddetmez', () => {
    // 0.01 + 64.04 + 35.95 float'ta tam 100 etmez (100.00000000000001);
    // TL uzerinden naif bir karsilastirma bu gecerli girdiyi "toplam tutmuyor"
    // diye reddederdi. Kurusa cevrilince 1 + 6404 + 3595 = 10000, tam esitlik.
    expect(0.01 + 64.04 + 35.95).not.toBe(100);

    const cents = [0.01, 64.04, 35.95].map((value) => parseAmountToCents(value) as number);
    const shares = splitExact(10_000, [
      { userId: ALI, cents: cents[0] },
      { userId: BURAK, cents: cents[1] },
      { userId: CEM, cents: cents[2] },
    ]);

    expect(sum(shares)).toBe(10_000);
    expect(cents).toEqual([1, 6404, 3595]);
  });

  it('1 kurus eksik toplami reddeder', () => {
    expect(() =>
      splitExact(10_000, [
        { userId: ALI, cents: 3333 },
        { userId: BURAK, cents: 3333 },
        { userId: CEM, cents: 3333 },
      ])
    ).toThrow(/toplami harcama tutarina esit olmali/i);
  });

  it('negatif pay kabul etmez', () => {
    expect(() =>
      splitExact(10_000, [
        { userId: ALI, cents: 11_000 },
        { userId: BURAK, cents: -1000 },
      ])
    ).toThrow(/negatif/i);
  });

  it('sifir pay gecerlidir (kisi gruba dahil ama borcu yok)', () => {
    const shares = splitExact(10_000, [
      { userId: ALI, cents: 10_000 },
      { userId: BURAK, cents: 0 },
    ]);

    expect(sum(shares)).toBe(10_000);
    expect(centsOf(shares, BURAK)).toBe(0);
  });
});

/* ============================================================ computeShares */

describe('computeShares', () => {
  it('iki bolusme tipinde de toplam her zaman harcama tutarina esittir', () => {
    const total = 10_000;

    const cases = [
      computeShares(total, { type: 'equal', participants: [ALI, BURAK, CEM] }),
      computeShares(total, {
        type: 'exact',
        shares: [
          { userId: ALI, cents: 5000 },
          { userId: BURAK, cents: 3000 },
          { userId: CEM, cents: 2000 },
        ],
      }),
    ];

    for (const shares of cases) {
      expect(sum(shares)).toBe(total);
    }
  });

  it('yuzde tipi artik taninmiyor', () => {
    // Arayuzdeki "Kaca Bol" akisi da buraya `equal` olarak duser; uc numarali
    // bir tip yok (docs/decisions/bolusum-basitlestirme.md).
    expect(SPLIT_TYPES).toEqual(['equal', 'exact']);

    expect(() =>
      computeShares(10_000, {
        // Eski istemcilerden gelebilecek govde: tip sistemi disindan zorlaniyor.
        type: 'percentage',
        shares: [{ userId: ALI, basisPoints: 10_000 }],
      } as unknown as Parameters<typeof computeShares>[1])
    ).toThrow(SplitError);
  });

  it('"Kaca Bol" bir tip degil: N kisilik liste ile esit bolusme', () => {
    // Dort kisilik grupta "3'e bol" -> secilen uc kisiyle equal.
    const shares = computeShares(10_000, { type: 'equal', participants: [ALI, BURAK, CEM] });

    expect(asMap(shares)).toEqual({ [ALI]: 3334, [BURAK]: 3333, [CEM]: 3333 });
    expect(sum(shares)).toBe(10_000);
  });

  it('sifir ya da negatif tutari reddeder', () => {
    expect(() => computeShares(0, { type: 'equal', participants: [ALI] })).toThrow(SplitError);
    expect(() => computeShares(-100, { type: 'equal', participants: [ALI] })).toThrow(SplitError);
  });
});

/* ========================================================== para cevrimi */

describe('money', () => {
  it('metin ve sayi girdileri ayni kurus degerini verir', () => {
    expect(parseAmountToCents('12.34')).toBe(1234);
    expect(parseAmountToCents(12.34)).toBe(1234);
    expect(parseAmountToCents(12.3)).toBe(1230);
    expect(parseAmountToCents(12)).toBe(1200);
    expect(parseAmountToCents('0.05')).toBe(5);
  });

  it('float carpimi kullanmadigi icin 1.005 dogru cevrilir', () => {
    // Math.round(1.005 * 100) motorda 100 verir; metin uzerinden 100 degil 101 olmali.
    expect(Math.round(1.005 * 100)).toBe(100);
    // 1.005 iki ondaliktan fazla oldugu icin zaten reddedilir - sessizce
    // yuvarlanmaz, kullaniciya hata doner.
    expect(parseAmountToCents(1.005)).toBeNull();
  });

  it('float aritmetiginden gelen degeri sessizce yuvarlamaz, reddeder', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(parseAmountToCents(0.1 + 0.2)).toBeNull();
    expect(parseAmountToCents(0.3)).toBe(30);
  });

  it('gecersiz girdileri reddeder', () => {
    expect(parseAmountToCents('abc')).toBeNull();
    expect(parseAmountToCents('-5.00')).toBeNull();
    expect(parseAmountToCents('12.345')).toBeNull();
    expect(parseAmountToCents(Number.NaN)).toBeNull();
    expect(parseAmountToCents(Number.POSITIVE_INFINITY)).toBeNull();
    expect(parseAmountToCents(null)).toBeNull();
    expect(parseAmountToCents(1e21)).toBeNull();
    // NUMERIC(10,2) ust siniri
    expect(parseAmountToCents('99999999.99')).toBe(9_999_999_999);
    expect(parseAmountToCents('100000000.00')).toBeNull();
  });

  it('kurus -> metin cevrimi her zaman iki ondalikli', () => {
    expect(formatCents(10_000)).toBe('100.00');
    expect(formatCents(3334)).toBe('33.34');
    expect(formatCents(5)).toBe('0.05');
    expect(formatCents(0)).toBe('0.00');
    expect(formatCents(-1)).toBe('-0.01');
  });

  it('cevrim ileri-geri kayipsizdir', () => {
    for (let cents = 0; cents <= 5000; cents++) {
      expect(parseAmountToCents(formatCents(cents))).toBe(cents);
    }
  });
});
