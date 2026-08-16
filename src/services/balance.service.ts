import expenseModel from '../models/expense.model';
import groupModel from '../models/group.model';
import settlementModel from '../models/settlement.model';
import { formatCents, netAmountToCents as toCents } from '../utils/money';
import { requireMembership } from './group.service';
import {
  calculateNetBalances,
  greedyNetting,
  optimalNetting,
  OPTIMAL_NETTING_LIMIT,
} from './netting.service';

import type { ExpenseInput, ExpenseShareInput } from './netting.service';

/**
 * Grup bakiyesi: 1.5'teki harcamalar + 1.7'deki **onaylanmis** odemeler ->
 * 1.6'daki netlestirme.
 *
 * ONAYLANMIS ODEME = SANAL HARCAMA
 * --------------------------------
 * Netlestirmeye odemeler icin ayri bir aritmetik yazilmadi. A'nin B'ye yaptigi
 * onaylanmis X TL'lik odeme, tam olarak su harcamaya denktir:
 *
 *     "A odedi (X TL), tamami B'nin payi"
 *
 * Ikisi de A'nin net bakiyesini +X, B'ninkini -X hareket ettirir. Bu sayede
 * para aritmetigi tek yerde (`netting.service`) kalir; bakiye servisi yalnizca
 * veriyi hazirlar. Gerekce docs/decisions/1.7.md icinde.
 *
 * KRITIK KURAL
 * ------------
 * Yalnizca `confirmed` kayitlar bu listeye girer (`listConfirmed`). `pending`
 * ve `rejected` kayitlarin bakiyeye hicbir etkisi yoktur; bekleyenler yalnizca
 * `meta.pending_settlement_count` icinde sayi olarak gorunur.
 */

export interface BalanceView {
  user_id: string;
  /** Gruptan cikarilmis ama gecmis harcamalari duran kullanicida `null` olur. */
  name: string | null;
  /** Pozitif = alacakli, negatif = borclu. NUMERIC ile ayni bicimde metin. */
  net_balance: string;
}

export interface TransferView {
  from_user: string;
  to_user: string;
  amount: string;
}

export interface BalanceResult {
  balances: BalanceView[];
  transfers: TransferView[];
  meta: {
    expense_count: number;
    confirmed_settlement_count: number;
    pending_settlement_count: number;
    rejected_settlement_count: number;
    /** Hangi netlestirme calisti: `optimal` minimum transfer sayisini garanti eder. */
    algorithm: 'optimal' | 'greedy';
  };
}

/** Netlestirmeye giren minimal odeme gorunumu (`listConfirmed` / `listConfirmedByGroups`). */
interface ConfirmedInput {
  id: string;
  from_user: string;
  to_user: string;
  amount: string;
}

/**
 * Harcamalari ve onaylanmis odemeleri netlestirmenin bekledigi tek listeye
 * cevirir — yukaridaki "onaylanmis odeme = sanal harcama" kuralinin **tek**
 * uygulamasi.
 *
 * Disari aciliyor cunku Home ozeti (`summary.service`) ayni donusumu tum
 * gruplar icin yapiyor. Iki kopya birakilsaydi 1.7'nin semantigi bir gun
 * degistiginde biri sessizce eskirdi — ve eskiyen kopyanin belirtisi "bakiye
 * yanlis" olurdu, yani en gec fark edilen hata turu.
 */
export const buildNettingInputs = (
  expenses: readonly ExpenseInput[],
  shares: readonly ExpenseShareInput[],
  confirmed: readonly ConfirmedInput[]
): { expenses: ExpenseInput[]; shares: ExpenseShareInput[] } => ({
  // Settlement ID'leri harcama ID'lerinden ayri uuid'ler oldugu icin cakisma olmaz.
  expenses: [
    ...expenses,
    ...confirmed.map((settlement) => ({
      id: settlement.id,
      paid_by: settlement.from_user,
      amount: settlement.amount,
    })),
  ],
  shares: [
    ...shares,
    ...confirmed.map((settlement) => ({
      expense_id: settlement.id,
      user_id: settlement.to_user,
      share_amount: settlement.amount,
    })),
  ],
});

/**
 * GET /groups/:id/balances
 *
 * Harcamalar sayfalanmadan **tumuyle** okunur: kismi veriyle hesaplanan bakiye
 * yanlis olur (bkz. `expenseModel.listForNetting`).
 */
const getGroupBalances = async (groupId: string, userId: string): Promise<BalanceResult> => {
  await requireMembership(groupId, userId);

  const [members, { expenses, shares }, confirmed, counts] = await Promise.all([
    // `userId` gorunum icin de gerekli: takma isimler kisiye ozel, yani
    // bakiye satirlarindaki adlar kime dondugune gore degisiyor.
    groupModel.listMembers(groupId, userId),
    expenseModel.listForNetting(groupId),
    settlementModel.listConfirmed(groupId),
    settlementModel.countByStatus(groupId),
  ]);

  const netting = buildNettingInputs(expenses, shares, confirmed);
  const netBalances = calculateNetBalances(netting.expenses, netting.shares);

  // `optimalNetting` yalnizca sifir olmayan bakiyeleri sayar; limiti de ona gore
  // kontrol etmeliyiz, yoksa dengede olan uyeler yuzunden gereksiz greedy'ye duserdik.
  const activeCount = netBalances.filter((balance) => toCents(balance.netBalance) !== 0).length;
  const algorithm = activeCount > OPTIMAL_NETTING_LIMIT ? 'greedy' : 'optimal';
  const transfers =
    algorithm === 'optimal' ? optimalNetting(netBalances) : greedyNetting(netBalances);

  /*
    Takma isim varsa o kazaniyor: kullanici birine ad verdiyse, o kisiyi
    bakiye listesinde de o adla gormek ister — takma ismin butun anlami
    "kimin kim oldugunu benim kelimemle gor". Gercek ad kaybolmuyor, uye
    listesinde (Kisiler sekmesi) yaninda duruyor.
  */
  const nameByUser = new Map(
    members.map((member) => [member.user_id, member.nickname ?? member.name])
  );
  const centsByUser = new Map(
    netBalances.map((balance) => [balance.userId, toCents(balance.netBalance)])
  );

  // Liste iki kumenin birlesimi: (a) grubun tum uyeleri — bakiyesi sifir olanlar
  // da "dengede" olarak gorunsun; (b) bakiyesi olan herkes — gruptan cikarilmis
  // ama gecmis harcamasi duran biri sessizce kaybolmasin (bkz. 1.4'teki acik madde).
  const userIds = [...new Set([...nameByUser.keys(), ...centsByUser.keys()])];

  const balances = userIds
    .map<BalanceView>((id) => ({
      user_id: id,
      name: nameByUser.get(id) ?? null,
      net_balance: formatCents(centsByUser.get(id) ?? 0),
    }))
    // Alacaklidan borcluya; esitlikte ID ile deterministik sira.
    .sort(
      (a, b) =>
        (centsByUser.get(b.user_id) ?? 0) - (centsByUser.get(a.user_id) ?? 0) ||
        (a.user_id < b.user_id ? -1 : a.user_id > b.user_id ? 1 : 0)
    );

  return {
    balances,
    transfers: transfers.map((transfer) => ({
      from_user: transfer.from,
      to_user: transfer.to,
      amount: formatCents(toCents(transfer.amount)),
    })),
    meta: {
      expense_count: expenses.length,
      confirmed_settlement_count: counts.confirmed,
      pending_settlement_count: counts.pending,
      rejected_settlement_count: counts.rejected,
      algorithm,
    },
  };
};

export default { getGroupBalances };

export { getGroupBalances };
