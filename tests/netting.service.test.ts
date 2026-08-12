import {
  calculateNetBalances,
  greedyNetting,
  optimalNetting,
  OPTIMAL_NETTING_LIMIT,
} from '../src/services/netting.service';

import type { Balance, Transfer } from '../src/services/netting.service';

/* ------------------------------------------------------------- yardimcilar */

const cents = (value: number): number => Math.round(value * 100);

/** Transfer listesini bakiyelere uygular ve herkesin kalan bakiyesini kurus olarak dondurur. */
function applyTransfers(balances: readonly Balance[], transfers: readonly Transfer[]) {
  const remaining = new Map<string, number>();

  for (const balance of balances) {
    remaining.set(balance.userId, cents(balance.netBalance));
  }
  for (const transfer of transfers) {
    // Borclu odedigi kadar sifira yaklasir, alacakli aldigi kadar.
    remaining.set(transfer.from, (remaining.get(transfer.from) ?? 0) + cents(transfer.amount));
    remaining.set(transfer.to, (remaining.get(transfer.to) ?? 0) - cents(transfer.amount));
  }

  return remaining;
}

/**
 * Bir transfer listesinin "gecerli" olmasinin kosullari:
 *  - tutar pozitif, kendine transfer yok
 *  - transferler uygulandiginda herkesin bakiyesi sifirlanir (yuvarlama toleransi disinda)
 *  - toplam odenen = toplam alinan (para yaratilmamis/yok edilmemis)
 */
function expectSettles(
  balances: readonly Balance[],
  transfers: readonly Transfer[],
  toleranceCents = 0
): void {
  for (const transfer of transfers) {
    expect(transfer.amount).toBeGreaterThan(0);
    expect(transfer.from).not.toBe(transfer.to);
  }

  for (const [userId, leftover] of applyTransfers(balances, transfers)) {
    expect(Math.abs(leftover)).toBeLessThanOrEqual(toleranceCents);
    expect(userId).toBeTruthy();
  }
}

const balancesOf = (record: Record<string, number>): Balance[] =>
  Object.entries(record).map(([userId, netBalance]) => ({ userId, netBalance }));

/** Karsilastirma icin: "borclu -> alacakli: tutar" seklinde okunabilir ozet. */
const format = (transfers: readonly Transfer[]): string =>
  transfers.map((t) => `${t.from} -> ${t.to}: ${t.amount.toFixed(2)}`).join(' | ');

/* ======================================================= calculateNetBalances */

describe('calculateNetBalances', () => {
  it('odenen tutari alacak, paya duseni borc olarak isler', () => {
    const balances = calculateNetBalances(
      [{ id: 'e1', paid_by: 'ali', amount: '300.00' }],
      [
        { expense_id: 'e1', user_id: 'ali', share_amount: '100.00' },
        { expense_id: 'e1', user_id: 'burak', share_amount: '100.00' },
        { expense_id: 'e1', user_id: 'ceren', share_amount: '100.00' },
      ]
    );

    expect(balances).toEqual([
      { userId: 'ali', netBalance: 200 },
      { userId: 'burak', netBalance: -100 },
      { userId: 'ceren', netBalance: -100 },
    ]);
  });

  it('NUMERIC kolonlarindan gelen string tutarlari da sayilari da kabul eder', () => {
    const fromStrings = calculateNetBalances(
      [{ id: 'e1', paid_by: 'ali', amount: '240.00' }],
      [
        { expense_id: 'e1', user_id: 'ali', share_amount: '120.00' },
        { expense_id: 'e1', user_id: 'burak', share_amount: '120.00' },
      ]
    );
    const fromNumbers = calculateNetBalances(
      [{ id: 'e1', paid_by: 'ali', amount: 240 }],
      [
        { expense_id: 'e1', user_id: 'ali', share_amount: 120 },
        { expense_id: 'e1', user_id: 'burak', share_amount: 120 },
      ]
    );

    expect(fromStrings).toEqual(fromNumbers);
  });

  it('birden fazla harcamayi toplar ve dengedeki kisiyi sifir bakiye ile listeler', () => {
    // Ali 100 odeyip 50 pay aliyor, Burak 50 odeyip 100 pay aliyor -> Ali +50, Burak -50.
    // Ceren hem 60 odeyip hem 60 pay aliyor: net sifir ama listede kalmali.
    const balances = calculateNetBalances(
      [
        { id: 'e1', paid_by: 'ali', amount: 100 },
        { id: 'e2', paid_by: 'burak', amount: 50 },
        { id: 'e3', paid_by: 'ceren', amount: 60 },
      ],
      [
        { expense_id: 'e1', user_id: 'ali', share_amount: 50 },
        { expense_id: 'e1', user_id: 'burak', share_amount: 50 },
        { expense_id: 'e2', user_id: 'burak', share_amount: 50 },
        { expense_id: 'e3', user_id: 'ceren', share_amount: 60 },
      ]
    );

    expect(balances).toEqual([
      { userId: 'ali', netBalance: 50 },
      { userId: 'burak', netBalance: -50 },
      { userId: 'ceren', netBalance: 0 },
    ]);
  });

  it('bilinmeyen bir harcamaya bagli paylasim gelirse hata firlatir', () => {
    expect(() =>
      calculateNetBalances(
        [{ id: 'e1', paid_by: 'ali', amount: 100 }],
        [{ expense_id: 'YOK', user_id: 'burak', share_amount: 100 }]
      )
    ).toThrow(/Bilinmeyen harcamaya bagli paylasim/);
  });
});

/* ================================================== 1) Basit iki kisilik borc */

describe('senaryo: basit iki kisilik borc', () => {
  const balances = balancesOf({ ayse: -50, burak: 50 });

  it.each([
    ['greedy', greedyNetting],
    ['optimal', optimalNetting],
  ])('%s: tek transferle kapanir (ayse -> burak 50)', (_name, netting) => {
    const transfers = netting(balances);

    expect(transfers).toEqual([{ from: 'ayse', to: 'burak', amount: 50 }]);
    expectSettles(balances, transfers);
  });
});

/* ================================================ 2) Uc kisilik dongusel borc */

describe('senaryo: uc kisilik dongusel borc', () => {
  it('tam dongu (A->B->C->A, hepsi 100) netlesince hic transfer gerekmez', () => {
    // Uc ayri harcama var ama zincir kapali: kimse kimseye net borclu degil.
    const balances = calculateNetBalances(
      [
        { id: 'e1', paid_by: 'ali', amount: 100 },
        { id: 'e2', paid_by: 'burak', amount: 100 },
        { id: 'e3', paid_by: 'ceren', amount: 100 },
      ],
      [
        { expense_id: 'e1', user_id: 'burak', share_amount: 100 },
        { expense_id: 'e2', user_id: 'ceren', share_amount: 100 },
        { expense_id: 'e3', user_id: 'ali', share_amount: 100 },
      ]
    );

    expect(balances).toEqual([
      { userId: 'ali', netBalance: 0 },
      { userId: 'burak', netBalance: 0 },
      { userId: 'ceren', netBalance: 0 },
    ]);
    expect(greedyNetting(balances)).toEqual([]);
    expect(optimalNetting(balances)).toEqual([]);
  });

  it('kismi dongu (100 / 60 / 40): 3 ham borc, 2 transfere iner', () => {
    const balances = calculateNetBalances(
      [
        { id: 'e1', paid_by: 'ali', amount: 100 },
        { id: 'e2', paid_by: 'burak', amount: 60 },
        { id: 'e3', paid_by: 'ceren', amount: 40 },
      ],
      [
        { expense_id: 'e1', user_id: 'burak', share_amount: 100 },
        { expense_id: 'e2', user_id: 'ceren', share_amount: 60 },
        { expense_id: 'e3', user_id: 'ali', share_amount: 40 },
      ]
    );

    expect(balances).toEqual([
      { userId: 'ali', netBalance: 60 },
      { userId: 'burak', netBalance: -40 },
      { userId: 'ceren', netBalance: -20 },
    ]);

    for (const transfers of [greedyNetting(balances), optimalNetting(balances)]) {
      // 3 ham borc iliskisi vardi, netlesince 2 odeme kaldi.
      expect(transfers).toHaveLength(2);
      expect(transfers.every((t) => t.to === 'ali')).toBe(true);
      expectSettles(balances, transfers);
    }
  });
});

/* ==================================== 3) Dengeli grup ve yuvarlama farklari */

describe('senaryo: dengeli grup / yuvarlama farklari', () => {
  it('herkes tam dengedeyse hic transfer uretmez', () => {
    const balances = balancesOf({ ali: 0, burak: 0, ceren: 0 });

    expect(greedyNetting(balances)).toEqual([]);
    expect(optimalNetting(balances)).toEqual([]);
  });

  it('kurusun altindaki bakiyeler sifir sayilir', () => {
    const balances = balancesOf({ ali: 0.004, burak: -0.004 });

    expect(greedyNetting(balances)).toEqual([]);
    expect(optimalNetting(balances)).toEqual([]);
  });

  it('100 TL uc kisiye bolununce (33.33 / 33.33 / 33.34) kurus kaybi olmaz', () => {
    const balances = calculateNetBalances(
      [{ id: 'e1', paid_by: 'ali', amount: '100.00' }],
      [
        { expense_id: 'e1', user_id: 'ali', share_amount: '33.33' },
        { expense_id: 'e1', user_id: 'burak', share_amount: '33.33' },
        { expense_id: 'e1', user_id: 'ceren', share_amount: '33.34' },
      ]
    );

    expect(balances).toEqual([
      { userId: 'ali', netBalance: 66.67 },
      { userId: 'burak', netBalance: -33.33 },
      { userId: 'ceren', netBalance: -33.34 },
    ]);

    const transfers = optimalNetting(balances);
    const total = transfers.reduce((sum, t) => sum + cents(t.amount), 0);

    expect(transfers).toHaveLength(2);
    expect(total).toBe(cents(66.67));
    expectSettles(balances, transfers);
  });

  it('toplam tam sifir degilse (kurus artigi) artigi yedirir, hata vermez', () => {
    // 33.34 + 33.33 - 66.66 = +0.01 -> kisi basi 1 kurusluk yuvarlama toleransi icinde.
    const balances = balancesOf({ ali: 33.34, burak: 33.33, ceren: -66.66 });

    for (const transfers of [greedyNetting(balances), optimalNetting(balances)]) {
      expect(transfers).toHaveLength(2);
      // Artik en buyuk mutlak bakiyeye yedirildigi icin en fazla 1 kurus sapma kalir.
      expectSettles(balances, transfers, 1);
    }
  });

  it('toplam gercekten tutmuyorsa hata firlatir (sessizce yanlis sonuc uretmez)', () => {
    const bozuk = balancesOf({ ali: 100, burak: -50 });

    expect(() => greedyNetting(bozuk)).toThrow(/sifira toplanmiyor/);
    expect(() => optimalNetting(bozuk)).toThrow(/sifira toplanmiyor/);
  });

  it('ayni userId iki kez gecerse hata firlatir', () => {
    const tekrarli: Balance[] = [
      { userId: 'ali', netBalance: 50 },
      { userId: 'ali', netBalance: -50 },
    ];

    expect(() => greedyNetting(tekrarli)).toThrow(/tekrar eden userId/);
  });
});

/* ============================ 4) Tek kisi <-> tum grup (yildiz topolojisi) */

describe('senaryo: tek kisi ile tum grup arasinda borc', () => {
  it('tek kisi tum gruba borclu: n-1 transfer, hepsi ondan cikar', () => {
    const balances = balancesOf({ ali: -300, burak: 100, ceren: 100, deniz: 100 });

    for (const transfers of [greedyNetting(balances), optimalNetting(balances)]) {
      expect(transfers).toHaveLength(3);
      expect(transfers.every((t) => t.from === 'ali')).toBe(true);
      expect(transfers.map((t) => t.amount)).toEqual([100, 100, 100]);
      expectSettles(balances, transfers);
    }
  });

  it('tum grup tek kisiye borclu: n-1 transfer, hepsi ona gider', () => {
    const balances = balancesOf({ ali: 300, burak: -100, ceren: -100, deniz: -100 });

    for (const transfers of [greedyNetting(balances), optimalNetting(balances)]) {
      expect(transfers).toHaveLength(3);
      expect(transfers.every((t) => t.to === 'ali')).toBe(true);
      expectSettles(balances, transfers);
    }
  });

  it('esit olmayan yildiz dagilimi da tek turda kapanir', () => {
    const balances = balancesOf({ ali: 275.5, burak: -100.25, ceren: -75.25, deniz: -100 });

    for (const transfers of [greedyNetting(balances), optimalNetting(balances)]) {
      expect(transfers).toHaveLength(3);
      expectSettles(balances, transfers);
    }
  });
});

/* ============================= 5) GREEDY'NIN OPTIMAL OLMADIGI SENARYO ======= */

describe('senaryo: greedy optimal degildir (kanit)', () => {
  /**
   * NEDEN GREEDY BURADA KAYBEDIYOR?
   * --------------------------------
   * Bakiyeler:
   *
   *     ali   +10.00      ceren  -6.00
   *     burak  +8.00      deniz  -4.00
   *                       elif   -8.00
   *
   * Bu kume tam olarak IKI bagimsiz sifir-toplamli gruba ayrilir:
   *
   *     { ali +10, ceren -6, deniz -4 }   ve   { burak +8, elif -8 }
   *
   * Minimum transfer sayisi = n - (ayrik sifir-toplamli grup sayisi) = 5 - 2 = 3.
   *
   * Greedy ise ilk adimda "en buyuk alacakli" (ali, +10) ile "en buyuk borclu"
   * (elif, -8) esler. Oysa bu ikisi FARKLI gruplara aittir. Bu esleme dogal
   * bolunmeyi bozar: elif'in borcu kapanir ama ali'de 2.00 artik kalir ve
   * bu artik, ikinci grubun icine sizar. Sonucta deniz iki ayri odeme yapmak
   * zorunda kalir (ali'ye 2.00 + burak'a 2.00) ve toplam 4 transfer olusur.
   *
   * Yani greedy'nin hatasi lokal olarak en buyuk tutari kapatmasi, ama global
   * olarak var olan grup yapisini gormemesidir. optimalNetting once bolunmeyi
   * bulur (backtracking), sonra her grubu kendi icinde greedy ile kapatir.
   */
  const balances = balancesOf({ ali: 10, burak: 8, ceren: -6, deniz: -4, elif: -8 });

  it('greedy 4 transfer uretir, optimal 3 - fark ispatlanir', () => {
    const greedy = greedyNetting(balances);
    const optimal = optimalNetting(balances);

    // Mulakat icin gorunur cikti: `npm test` ciktisinda iki liste yan yana durur.
    console.info('\n  GREEDY  (%d transfer): %s', greedy.length, format(greedy));
    console.info('  OPTIMAL (%d transfer): %s\n', optimal.length, format(optimal));

    // Asil iddia: greedy KESINLIKLE daha fazla transfer uretiyor.
    expect(greedy.length).toBeGreaterThan(optimal.length);

    // Beklenen kesin degerler (regresyon korumasi).
    expect(greedy).toHaveLength(4);
    expect(optimal).toHaveLength(3);

    // Her iki sonuc da DOGRU; fark sadece verimlilikte.
    expectSettles(balances, greedy);
    expectSettles(balances, optimal);
  });

  it('greedy, deniz i iki ayri odeme yapmaya zorlar; optimal zorlamaz', () => {
    const paymentCount = (transfers: Transfer[], userId: string): number =>
      transfers.filter((t) => t.from === userId).length;

    expect(paymentCount(greedyNetting(balances), 'deniz')).toBe(2);
    expect(paymentCount(optimalNetting(balances), 'deniz')).toBe(1);
  });

  it('optimal cozum dogal grup bolunmesini bulur', () => {
    const optimal = optimalNetting(balances);
    const pairs = optimal.map((t) => `${t.from}->${t.to}`).sort();

    // { ali, ceren, deniz } grubu ve { burak, elif } grubu ayri ayri kapanir;
    // gruplar arasinda hicbir transfer yoktur.
    expect(pairs).toEqual(['ceren->ali', 'deniz->ali', 'elif->burak']);
  });
});

/* ===================================================== genel gecerlilik / sinir */

describe('genel ozellikler', () => {
  it('bos girdi bos sonuc dondurur', () => {
    expect(greedyNetting([])).toEqual([]);
    expect(optimalNetting([])).toEqual([]);
  });

  it('optimalNetting kisi sinirini asinca acik hata verir', () => {
    // Toplami sifir olan, sinirin bir uzerinde bir grup uret.
    const tooMany: Balance[] = Array.from({ length: OPTIMAL_NETTING_LIMIT + 1 }, (_, i) => ({
      userId: `u${i}`,
      netBalance: i === 0 ? OPTIMAL_NETTING_LIMIT : -1,
    }));

    expect(() => optimalNetting(tooMany)).toThrow(/en fazla 14 kisilik/);
    // Greedy ayni girdide sorunsuz calisir - buyuk gruplarda onerilen yol budur.
    expect(greedyNetting(tooMany)).toHaveLength(OPTIMAL_NETTING_LIMIT);
  });

  /**
   * Rastgele ama deterministik (sabit tohumlu LCG) 300 senaryo. Iki iddia:
   *   1. Her iki algoritma da her zaman GECERLI bir cozum uretir (herkes sifirlanir).
   *   2. optimal <= greedy her zaman gecerlidir; asla tersi olmaz.
   */
  it('rastgele 300 senaryoda: ikisi de dogru cozer ve optimal asla greedy den kotu degildir', () => {
    let seed = 20260808;
    const nextInt = (bound: number): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % bound;
    };

    let strictlyBetterCount = 0;

    for (let round = 0; round < 300; round++) {
      const people = 2 + nextInt(6); // 2..7 kisi
      const amounts: number[] = [];
      // Turlarin yarisinda kaba (tam TL) tutar uretiyoruz: boylece tesadufi
      // sifir-toplamli alt gruplar olusur ve greedy'nin geriledigi durumlar
      // gercekten yakalanir. Diger yari kurus hassasiyetini test eder.
      const coarse = round % 2 === 0;

      for (let i = 0; i < people - 1; i++) {
        amounts.push(coarse ? nextInt(21) - 10 : (nextInt(10000) - 5000) / 100);
      }
      amounts.push(-amounts.reduce((sum, value) => sum + value, 0));

      const balances = amounts.map((netBalance, i) => ({ userId: `u${i}`, netBalance }));
      const greedy = greedyNetting(balances);
      const optimal = optimalNetting(balances);

      expectSettles(balances, greedy);
      expectSettles(balances, optimal);
      expect(optimal.length).toBeLessThanOrEqual(greedy.length);

      if (optimal.length < greedy.length) {
        strictlyBetterCount++;
      }
    }

    // Rastgele veride de greedy'nin gerilediği durumlar gercekten olusuyor.
    expect(strictlyBetterCount).toBeGreaterThan(0);
  });
});
