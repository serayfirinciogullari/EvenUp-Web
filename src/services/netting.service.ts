/**
 * Borc netlestirme (debt simplification) algoritmalari.
 *
 * Bu modul tamamen SAF'tir: veritabani, knex, express veya herhangi bir I/O
 * bagimliligi yoktur. Disaridan sadece bakiye verisi alir, transfer listesi
 * dondurur. Bu sayede unit test yazmak icin mock'a gerek kalmaz.
 *
 * PARA HASSASIYETI
 * ----------------
 * Tum ic hesaplar tam sayi *kurus* uzerinden yapilir. Float ile para toplamak
 * (0.1 + 0.2 !== 0.3) netlestirmede birikimli sapmaya yol acar; kurusa cevirip
 * integer aritmetigi kullanmak bu riski tamamen ortadan kaldirir. Disariya
 * donen `amount` degerleri tekrar TL'ye cevrilir.
 */

/** Bir kullanicinin gruptaki net durumu. Pozitif = alacakli, negatif = borclu. */
export interface Balance {
  userId: string;
  netBalance: number;
}

/** `from` kullanicisinin `to` kullanicisina odeyecegi tutar. `amount` her zaman > 0. */
export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

/**
 * `calculateNetBalances` girdileri. Alan adlari bilerek snake_case: boylece
 * `ExpenseRow[]` / `ExpenseShareRow[]` satirlari donusum yapmadan dogrudan
 * gecilebilir, ama modul yine de DB tiplerine import bagimliligi kurmaz.
 */
export interface ExpenseInput {
  id: string;
  paid_by: string;
  /** NUMERIC kolonlari pg surucusunden string gelir; number da kabul edilir. */
  amount: string | number;
}

export interface ExpenseShareInput {
  expense_id: string;
  user_id: string;
  share_amount: string | number;
}

/**
 * `optimalNetting` icin ust sinir. Arama uzayi alt-kume numaralandirmasi
 * oldugu icin O(3^n); 14 kisiden sonrasi pratikte donmez. Daha buyuk gruplarda
 * `greedyNetting` kullanilmalidir (sonucu optimalden en fazla birkac transfer
 * uzun olur, karsiliginda O(n^2) calisir).
 */
export const OPTIMAL_NETTING_LIMIT = 14;

/** Normalize edilmis ic temsil: kurus cinsinden, sifir olmayan bakiye. */
interface Entry {
  userId: string;
  cents: number;
}

/* -------------------------------------------------------------- yardimcilar */

function toCents(value: string | number): number {
  const numeric = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(numeric)) {
    throw new Error(`Gecersiz para degeri: ${String(value)}`);
  }

  return Math.round(numeric * 100);
}

function fromCents(cents: number): number {
  return cents / 100;
}

/**
 * Girdiyi kurusa cevirir, dogrular ve netlestirmeye hazir hale getirir:
 *
 *  1. Ayni userId birden fazla kez gecemez (veri hatasi olur, sessizce yutmayiz).
 *  2. Toplam sifira yakin olmali. Kurusa yuvarlama yuzunden olusan artik
 *     (kisi basi en fazla 1 kurus) en buyuk mutlak bakiyeye yedirilir; bundan
 *     buyuk sapma cagiran taraftaki bir hesap hatasidir, hata firlatiriz.
 *  3. Sifir bakiyeli kisiler cikarilir (transfere katilmazlar).
 *  4. userId'ye gore siralanir; boylece ciktinin sirasi deterministik olur.
 */
function normalizeBalances(balances: readonly Balance[]): Entry[] {
  const entries: Entry[] = [];
  const seen = new Set<string>();

  for (const balance of balances) {
    if (seen.has(balance.userId)) {
      throw new Error(`Bakiye listesinde tekrar eden userId: ${balance.userId}`);
    }
    seen.add(balance.userId);
    entries.push({ userId: balance.userId, cents: toCents(balance.netBalance) });
  }

  if (entries.length === 0) {
    return [];
  }

  const residual = entries.reduce((sum, entry) => sum + entry.cents, 0);
  const tolerance = Math.max(1, entries.length);

  if (Math.abs(residual) > tolerance) {
    throw new Error(
      `Net bakiyeler sifira toplanmiyor (fark: ${fromCents(residual).toFixed(2)}). ` +
        'Girdi verisi tutarsiz.'
    );
  }

  if (residual !== 0) {
    // Yuvarlama artigini en buyuk mutlak bakiyeye yedir: goreli hatasi en kucuk olur.
    let largest = 0;
    for (let i = 1; i < entries.length; i++) {
      if (Math.abs(entries[i].cents) > Math.abs(entries[largest].cents)) {
        largest = i;
      }
    }
    entries[largest].cents -= residual;
  }

  return entries
    .filter((entry) => entry.cents !== 0)
    .sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
}

/**
 * Greedy netlestirmenin cekirdegi. `entries` yerinde degistirilir, o yuzden
 * cagiran taraf kopya gecmelidir.
 *
 * Her adimda en buyuk alacakliyi en buyuk borcluyla eslestirir ve aralarinda
 * min(alacak, borc) kadar transfer yapar. Bu transfer taraflardan en az birini
 * sifirladigi icin dongu en fazla n-1 adimda biter.
 */
function greedyCore(entries: Entry[]): Transfer[] {
  const transfers: Transfer[] = [];

  for (;;) {
    let creditor = -1;
    let debtor = -1;

    for (let i = 0; i < entries.length; i++) {
      const { cents } = entries[i];
      if (cents > 0 && (creditor === -1 || cents > entries[creditor].cents)) {
        creditor = i;
      }
      if (cents < 0 && (debtor === -1 || cents < entries[debtor].cents)) {
        debtor = i;
      }
    }

    if (creditor === -1 || debtor === -1) {
      break;
    }

    const amount = Math.min(entries[creditor].cents, -entries[debtor].cents);
    entries[creditor].cents -= amount;
    entries[debtor].cents += amount;

    transfers.push({
      from: entries[debtor].userId,
      to: entries[creditor].userId,
      amount: fromCents(amount),
    });
  }

  return transfers;
}

/* ---------------------------------------------------------------- 1. greedy */

/**
 * Greedy netlestirme: en buyuk alacakli <-> en buyuk borclu eslestirmesi.
 *
 * Karmasiklik: O(n^2) (her adimda maksimumlari lineer tarama, en fazla n adim).
 * Sonuc her zaman gecerlidir ve en fazla n-1 transfer icerir, ancak minimum
 * transfer sayisini GARANTI ETMEZ - bkz. `optimalNetting` ve testlerdeki
 * karsilastirma senaryosu.
 */
export function greedyNetting(balances: readonly Balance[]): Transfer[] {
  return greedyCore(normalizeBalances(balances));
}

/* --------------------------------------------------------------- 2. optimal */

/**
 * Minimum transfer sayisini garanti eden netlestirme.
 *
 * FIKIR
 * -----
 * Sifir olmayan bakiyeli n kisi icin minimum transfer sayisi:
 *
 *     n - (birbirinden ayrik, toplami sifir olan alt kume sayisinin maksimumu)
 *
 * Cunku toplami sifir olan k kisilik bir grup kendi icinde tam olarak k-1
 * transferle kapanir (her transfer en az bir kisiyi sifirlar, son transfer
 * ikisini birden) ve iki farkli grup arasinda transfer yapmak gereksizdir.
 * Dolayisiyla problem "bakiye kumesini en fazla kaca parcaya bolebilirim?"
 * sorusuna indirgenir.
 *
 * ARAMA
 * -----
 * Bit maskesi uzerinde backtracking + memoization. Her adimda kalan kisilerden
 * en dusuk indisliyi (anchor) sabitleyip onu iceren TUM sifir-toplamli alt
 * kumeleri dener, geri kalani icin ozyineler. Anchor sabitlemesi ayni bolumu
 * farkli siralarla tekrar tekrar denemeyi engeller. Memo sayesinde ayni kalan
 * kume ikinci kez cozulmez.
 *
 * Karmasiklik: O(3^n) alt kume numaralandirmasi, 2^n memo girdisi.
 * n <= OPTIMAL_NETTING_LIMIT sartiyla milisaniyeler mertebesinde calisir.
 *
 * Bulunan her grubun ICINDE greedy calistirilir: grup zaten daha fazla
 * bolunemedigi icin greedy orada tam k-1 transfer uretir, yani optimaldir.
 * Bunun ek faydasi, her transferin gercek bir borcludan gercek bir alacakliya
 * ve taraflarin bakiyesini asmayan bir tutarda olmasidir.
 */
export function optimalNetting(balances: readonly Balance[]): Transfer[] {
  const entries = normalizeBalances(balances);
  const n = entries.length;

  if (n === 0) {
    return [];
  }

  if (n > OPTIMAL_NETTING_LIMIT) {
    throw new Error(
      `optimalNetting en fazla ${OPTIMAL_NETTING_LIMIT} kisilik gruplarda kullanilabilir ` +
        `(gelen: ${n}). Daha buyuk gruplar icin greedyNetting kullanin.`
    );
  }

  // subsetSums[mask] = mask'teki kisilerin kurus toplami
  const subsetSums = new Int32Array(1 << n);
  for (let mask = 1; mask < 1 << n; mask++) {
    const lowestIndex = 31 - Math.clz32(mask & -mask);
    subsetSums[mask] = subsetSums[mask & (mask - 1)] + entries[lowestIndex].cents;
  }

  // maxGroups[mask]: mask -1 ise henuz hesaplanmadi. chosenSubset: cozum yeniden insasi icin.
  const maxGroups = new Int32Array(1 << n).fill(-1);
  const chosenSubset = new Int32Array(1 << n);
  maxGroups[0] = 0;

  /** `mask` (toplami sifir olmali) en fazla kac sifir-toplamli parcaya bolunebilir? */
  const solve = (mask: number): number => {
    if (maxGroups[mask] !== -1) {
      return maxGroups[mask];
    }

    const anchor = mask & -mask;
    let best = 0;
    let bestSubset = mask;

    // mask'in tum alt kumelerini gez; anchor icermeyenleri ve toplami sifir
    // olmayanlari ele. Kalan (mask ^ subset) da zorunlu olarak sifir toplamlidir.
    for (let subset = mask; subset > 0; subset = (subset - 1) & mask) {
      if ((subset & anchor) === 0 || subsetSums[subset] !== 0) {
        continue;
      }

      const groups = 1 + solve(mask ^ subset);
      if (groups > best) {
        best = groups;
        bestSubset = subset;
      }
    }

    maxGroups[mask] = best;
    chosenSubset[mask] = bestSubset;
    return best;
  };

  const full = (1 << n) - 1;
  solve(full);

  // Secilen bolumu geri sar ve her grubu kendi icinde greedy ile kapat.
  const transfers: Transfer[] = [];
  for (let mask = full; mask > 0;) {
    const subset = chosenSubset[mask];
    const group: Entry[] = [];

    for (let i = 0; i < n; i++) {
      if (subset & (1 << i)) {
        group.push({ userId: entries[i].userId, cents: entries[i].cents });
      }
    }

    transfers.push(...greedyCore(group));
    mask ^= subset;
  }

  return transfers;
}

/* ------------------------------------------------------- 3. net bakiye uretimi */

/**
 * Ham harcama + paylasim verisinden net bakiye listesi uretir.
 *
 *     net = (kisinin odedigi toplam) - (kisinin payina dusen toplam)
 *
 * Hem odeyen hem pay sahibi olan herkes sonuca dahil edilir; bakiyesi tam
 * sifir cikanlar da listede kalir (arayuzde "dengede" olarak gosterilebilsin).
 * Netlestirme fonksiyonlari bunlari zaten kendileri eler.
 *
 * Bilinmeyen bir harcamaya bagli paylasim gelirse hata firlatilir: bunu sessizce
 * atlamak butun bakiyeleri kaydiracagi icin veri hatasini gormezden gelmeyiz.
 */
export function calculateNetBalances(
  expenses: readonly ExpenseInput[],
  expenseShares: readonly ExpenseShareInput[]
): Balance[] {
  const centsByUser = new Map<string, number>();
  const knownExpenses = new Set<string>();

  const add = (userId: string, cents: number): void => {
    centsByUser.set(userId, (centsByUser.get(userId) ?? 0) + cents);
  };

  for (const expense of expenses) {
    knownExpenses.add(expense.id);
    add(expense.paid_by, toCents(expense.amount)); // odedi -> alacakli
  }

  for (const share of expenseShares) {
    if (!knownExpenses.has(share.expense_id)) {
      throw new Error(`Bilinmeyen harcamaya bagli paylasim: expense_id=${share.expense_id}`);
    }
    add(share.user_id, -toCents(share.share_amount)); // payina dustu -> borclu
  }

  return [...centsByUser.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([userId, cents]) => ({ userId, netBalance: fromCents(cents) }));
}

export default { greedyNetting, optimalNetting, calculateNetBalances, OPTIMAL_NETTING_LIMIT };
