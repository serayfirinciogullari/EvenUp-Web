import activityModel from '../models/activity.model';
import expenseModel from '../models/expense.model';
import groupModel from '../models/group.model';
import settlementModel from '../models/settlement.model';
import userModel from '../models/user.model';
import { formatCents, netAmountToCents, parseAmountToCents } from '../utils/money';
import { buildNettingInputs } from './balance.service';
import { calculateNetBalances } from './netting.service';

import type { GroupedNettingData } from '../models/expense.model';
import type { ConfirmedSettlementOfGroup } from '../models/settlement.model';
import type { ExpenseInput, ExpenseShareInput } from './netting.service';

/**
 * Home ekraninin ozet ucu — projedeki **ilk toplu (aggregate) uc nokta**.
 *
 * Simdiye kadarki her sey tek bir grubun icindeydi: harcamalar, bakiye,
 * odemeler. Burasi tersi yonde bakiyor — "bu kullanicinin tum gruplari birlikte
 * ne durumda?". Neden mevcut uclara eklenmeyip ayri tutuldugu ve N+1'in nasil
 * onlendigi: docs/decisions/home-summary.md
 *
 * PARA
 * ----
 * Toplama tam sayi kurus uzerinden yapiliyor; hicbir yerde float toplanmiyor.
 * Disariya cikan tutarlar NUMERIC ile ayni bicimde **metin** (`formatCents`) —
 * projedeki her para alaninda oldugu gibi (1.5).
 */

export interface HomeSummary {
  /** Tum gruplardaki net bakiyelerin toplami. Pozitif = alacakli. Metin. */
  totalNetBalance: string;
  /** Bu ay kullanicinin odedigi harcamalarin toplami. Metin. */
  monthlySpend: string;
  activeGroupsCount: number;
  pendingSettlementsCount: number;
  /**
   * Onay bekleyenler DISINDA, kullanicinin henuz Aktivite sayfasinda
   * gormedigi olay sayisi (harcama eklendi/duzenlendi, odeme onaylandi/
   * reddedildi). `settlement_created` burada yok — o zaten
   * `pendingSettlementsCount`in kapsaminda (bkz. docs/decisions/aktivite-okunma-sayaci.md).
   */
  unseenActivityCount: number;
}

/**
 * Icinde bulunulan ayin `[baslangic, sonraki ay)` araligi.
 *
 * SUNUCU SAAT DILIMI
 * ------------------
 * Sinirlar sunucunun yerel saatine gore uretiliyor (`created_at` timestamptz).
 * Kullanicinin saat dilimi baska ise ay basindaki birkac saatlik kayma "bu ay"
 * tanimini kaydirabilir. Bilincli sadelik: istemciden saat dilimi almak
 * ucu parametreli hale getirir ve ozet degeri **onbelleklenemez** kilardi.
 * Gercekten gerekirse dogru cozum, kullanicinin saat dilimini profilde tutup
 * araligi ona gore uretmek — o zaman tek yerde, burada degisir.
 */
const currentMonthRange = (now: Date = new Date()): { from: Date; to: Date } => ({
  from: new Date(now.getFullYear(), now.getMonth(), 1),
  // Ay 11 iken 12 vermek Date icinde dogru sekilde sonraki yilin Ocak'ina tasar.
  to: new Date(now.getFullYear(), now.getMonth() + 1, 1),
});

/**
 * GET /users/me/home-summary
 *
 * Sorgu sayisi **sabit**: kullanicinin kac grubu olursa olsun 7 sorgu —
 * gruplar, aktivite-gorulme zamani, harcamalar, paylar, onayli odemeler,
 * aylik toplam, bekleyen sayi, okunmamis aktivite sayisi. Gruplarin bakiyesi
 * bellekte hesaplaniyor, grup basina sorgu atilmiyor.
 *
 * `activitySeenAt` neden Promise.all'in DISINDA: alttaki bes sorgudan hicbiri
 * ona bagimli degil ama `countUnseenForGroups` bagimli — o yuzden once
 * cekiliyor, sonra geri kalanla birlikte paralel calisiyor.
 */
const getHomeSummary = async (userId: string): Promise<HomeSummary> => {
  const groups = await groupModel.listForUser(userId);
  const groupIds = groups.map((group) => group.id);
  const { from, to } = currentMonthRange();
  const activitySeenAt = await userModel.findActivitySeenAt(userId);

  // Besi de birbirinden bagimsiz: sirayla beklemek icin sebep yok.
  const [netting, confirmed, monthlyTotal, pendingSettlementsCount, unseenActivityCount] =
    await Promise.all([
      expenseModel.listForNettingByGroups(groupIds),
      settlementModel.listConfirmedByGroups(groupIds),
      expenseModel.sumPaidByUserBetween(userId, from, to),
      settlementModel.countPendingForUser(userId),
      // `activitySeenAt` yalnizca kullanici satiri hic yoksa (silinmis) tanimsiz;
      // o durumda 0 gostermek, hata firlatmaktan daha az zararli.
      activitySeenAt
        ? activityModel.countUnseenForGroups(groupIds, userId, activitySeenAt)
        : Promise.resolve(0),
    ]);

  /*
    `?? 0` savunma amacli: `parseAmountToCents` yalnizca bicim bozuksa ya da
    deger NUMERIC(10,2) ust sinirini asarsa null doner. SQL'den gelen SUM'da
    ikisi de pratikte imkansiz (tek kullanicinin bir aylik odemesi 100 milyon
    TL'yi asmaz). Yine de sessizce 0 gostermek yerine burasi degisirse, dogru
    davranis hatayi yukari tasimaktir — bu satir o zaman gozden gecirilmeli.
  */
  const monthlyCents = parseAmountToCents(monthlyTotal) ?? 0;

  return {
    totalNetBalance: formatCents(sumNetBalanceCents(userId, groupIds, netting, confirmed)),
    monthlySpend: formatCents(monthlyCents),
    activeGroupsCount: groups.length,
    pendingSettlementsCount,
    unseenActivityCount,
  };
};

/**
 * `groupId -> satirlar` kovasi. Uc yerde ayni sey yapiliyordu; okunmayan bir
 * anahtar icin bos dizi donmesi cagiran tarafi `?? []` tekrarindan kurtariyor.
 *
 * Gruplama neden **tek gecis**: her grup icin listeyi bastan filtrelemek
 * (grup x satir) sorgu sayisini dusurup ayni maliyeti bellege tasimak olurdu.
 */
const bucket = <T>() => {
  const map = new Map<string, T[]>();

  return {
    add: (key: string, value: T): void => {
      const list = map.get(key);
      if (list) {
        list.push(value);
      } else {
        map.set(key, [value]);
      }
    },
    get: (key: string): T[] => map.get(key) ?? [],
  };
};

/**
 * Toplu okunan satirlari gruplara dagitir, her grup icin 1.6'daki
 * `calculateNetBalances`i calistirir ve kullanicinin net bakiyelerini
 * **kurus** olarak toplar.
 *
 * NEDEN GRUP BASINA AYRI HESAP — HEPSI TEK SEFERDE DEGIL
 * -------------------------------------------------------
 * Butun harcamalari tek bir listeye atip bir kez netlestirmek daha kisa olurdu
 * ama **yanlis** sonuc verirdi degil, farkli bir sey hesaplardi: netlestirme
 * kisiler arasi mahsuplasma yapar ve gruplar arasinda mahsuplasma diye bir sey
 * yoktur. A grubunda Ali'ye 100 borclu olmak, B grubunda Ali'nin bana 100
 * borclu olmasiyla kapanmaz — iki ayri hesap. Kullanicinin kendi net toplami
 * bu ozel durumda ayni ciksa da, dogru olan grup sinirina saygi duymak.
 *
 * Paylar `expense_id -> group_id` esleme uzerinden dagitiliyor: pay satirinda
 * `group_id` yok ve olmasi da gerekmiyor, harcamasi zaten tek bir gruba ait.
 */
const sumNetBalanceCents = (
  userId: string,
  groupIds: readonly string[],
  netting: GroupedNettingData,
  confirmed: readonly ConfirmedSettlementOfGroup[]
): number => {
  const expensesByGroup = bucket<ExpenseInput>();
  const sharesByGroup = bucket<ExpenseShareInput>();
  const confirmedByGroup = bucket<ConfirmedSettlementOfGroup>();
  const groupOfExpense = new Map<string, string>();

  for (const { group_id: groupId, ...expense } of netting.expenses) {
    groupOfExpense.set(expense.id, groupId);
    expensesByGroup.add(groupId, expense);
  }

  for (const share of netting.shares) {
    const groupId = groupOfExpense.get(share.expense_id);

    // Harcamasi listede olmayan bir pay: silinmis harcamanin payi olabilir
    // (soft delete'te pay satirlari yerinde kalir, bkz. expense.model).
    // `calculateNetBalances` bunu hata sayar — hakli olarak, ama burada
    // beklenen bir durum, o yuzden netlestirmeye hic verilmiyor.
    if (groupId) {
      sharesByGroup.add(groupId, share);
    }
  }

  for (const settlement of confirmed) {
    confirmedByGroup.add(settlement.group_id, settlement);
  }

  let totalCents = 0;

  for (const groupId of groupIds) {
    const inputs = buildNettingInputs(
      expensesByGroup.get(groupId),
      sharesByGroup.get(groupId),
      confirmedByGroup.get(groupId)
    );

    const balances = calculateNetBalances(inputs.expenses, inputs.shares);
    const mine = balances.find((balance) => balance.userId === userId);

    // Hicbir harcamasi/payi olmayan uye listede hic gorunmez: bakiyesi sifir.
    if (mine) {
      totalCents += netAmountToCents(mine.netBalance);
    }
  }

  return totalCents;
};

export default { getHomeSummary };

export { getHomeSummary };
