import activityModel from '../models/activity.model';
import expenseModel from '../models/expense.model';
import groupModel from '../models/group.model';
import settlementModel from '../models/settlement.model';
import userModel from '../models/user.model';
import { formatCents, netAmountToCents, parseAmountToCents } from '../utils/money';
import { buildNettingInputs } from './balance.service';
import {
  calculateNetBalances,
  greedyNetting,
  optimalNetting,
  OPTIMAL_NETTING_LIMIT,
} from './netting.service';
import settlementService from './settlement.service';

import type { GroupedNettingData } from '../models/expense.model';
import type { ContactRow } from '../models/group.model';
import type { ConfirmedSettlementOfGroup, PendingApprovalView } from '../models/settlement.model';
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

/**
 * "Seni bekleyenler" -> BRC satiri: benim odemem gereken, **netlesmis** bir
 * transfer. `docs/decisions/3.13-home-seni-bekleyenler.md` bunun neden
 * `contacts.service`teki ikili (pairwise) toplam degil, grup-bazli
 * `optimalNetting`/`greedyNetting` transferi oldugunu anlatiyor.
 */
export interface PendingDebtView {
  group_id: string;
  group_name: string;
  to_user: string;
  to_user_name: string;
  amount: string;
}

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
  /** "Seni bekleyenler" -> ONY satirlari: onayimi bekleyen odemeler, tum gruplarda. */
  pendingApprovals: PendingApprovalView[];
  /** "Seni bekleyenler" -> BRC satirlari: odemem gereken netlesmis transferler. */
  pendingDebts: PendingDebtView[];
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
 *
 * `expense.service.ts`teki grup-bazli "Bu ay" ozeti (`getMonthlySummary`) de
 * ayni araligi kullaniyor — "ay" tanimi tek yerde kalsin diye disariya aciliyor.
 */
export const currentMonthRange = (now: Date = new Date()): { from: Date; to: Date } => ({
  from: new Date(now.getFullYear(), now.getMonth(), 1),
  // Ay 11 iken 12 vermek Date icinde dogru sekilde sonraki yilin Ocak'ina tasar.
  to: new Date(now.getFullYear(), now.getMonth() + 1, 1),
});

/**
 * GET /users/me/home-summary
 *
 * Sorgu sayisi **sabit**: kullanicinin kac grubu olursa olsun sabit sayida
 * sorgu — gruplar, aktivite-gorulme zamani, harcamalar, paylar, onayli
 * odemeler, aylik toplam, bekleyen sayi, okunmamis aktivite sayisi, kisi
 * listesi (isim eslemesi icin), onayimi bekleyen odemeler. Gruplarin
 * bakiyesi ve "Seni bekleyenler" transferleri bellekte hesaplaniyor, grup
 * basina sorgu atilmiyor.
 *
 * `activitySeenAt` neden Promise.all'in DISINDA: alttaki sorgulardan hicbiri
 * ona bagimli degil ama `countUnseenForGroups` bagimli — o yuzden once
 * cekiliyor, sonra geri kalanla birlikte paralel calisiyor.
 */
const getHomeSummary = async (userId: string): Promise<HomeSummary> => {
  const groups = await groupModel.listForUser(userId);
  const groupIds = groups.map((group) => group.id);
  const { from, to } = currentMonthRange();
  const activitySeenAt = await userModel.findActivitySeenAt(userId);

  // Hepsi birbirinden bagimsiz: sirayla beklemek icin sebep yok.
  const [
    netting,
    confirmed,
    monthlyTotal,
    pendingSettlementsCount,
    unseenActivityCount,
    contacts,
    pendingApprovals,
  ] = await Promise.all([
    expenseModel.listForNettingByGroups(groupIds),
    settlementModel.listConfirmedByGroups(groupIds),
    expenseModel.sumPaidByUserBetween(userId, from, to),
    settlementModel.countPendingForUser(userId),
    // `activitySeenAt` yalnizca kullanici satiri hic yoksa (silinmis) tanimsiz;
    // o durumda 0 gostermek, hata firlatmaktan daha az zararli.
    activitySeenAt
      ? activityModel.countUnseenForGroups(groupIds, userId, activitySeenAt)
      : Promise.resolve(0),
    // "Seni bekleyenler"in BRC satirlari icin isim eslemesi (bkz. `namesByGroup`).
    groupModel.listContactsForUser(userId),
    // Ayni ONY listesi Aktivite sayfasinin banner'iyla birebir ayni sorgu
    // (`settlementService.listPendingApprovals`) — ikinci bir kopyasi yok.
    settlementService.listPendingApprovals(userId),
  ]);

  /*
    `?? 0` savunma amacli: `parseAmountToCents` yalnizca bicim bozuksa ya da
    deger NUMERIC(10,2) ust sinirini asarsa null doner. SQL'den gelen SUM'da
    ikisi de pratikte imkansiz (tek kullanicinin bir aylik odemesi 100 milyon
    TL'yi asmaz). Yine de sessizce 0 gostermek yerine burasi degisirse, dogru
    davranis hatayi yukari tasimaktir — bu satir o zaman gozden gecirilmeli.
  */
  const monthlyCents = parseAmountToCents(monthlyTotal) ?? 0;

  const namesByGroup = namesByGroupFromContacts(contacts);
  const { totalCents, debts } = computeGroupResults(
    userId,
    groups,
    netting,
    confirmed,
    namesByGroup
  );

  return {
    totalNetBalance: formatCents(totalCents),
    monthlySpend: formatCents(monthlyCents),
    activeGroupsCount: groups.length,
    pendingSettlementsCount,
    unseenActivityCount,
    pendingApprovals,
    pendingDebts: debts,
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
 * `listContactsForUser`in (kisi -> ortak gruplar) satirlarini
 * (grup -> kisi -> gosterilecek ad) seklinde ters cevirir.
 *
 * "Seni bekleyenler"deki bir BRC satiri "{isim}'a borcun var" diyebilmek icin
 * transferin `to` alanindaki uuid'e karsilik gelen bir ada ihtiyac duyuyor;
 * `calculateNetBalances`/`optimalNetting` (netting.service) tamamen saf oldugu
 * icin ad tasimiyor, yalnizca uuid. Takma isim varsa o kazaniyor —
 * `balance.service.ts`teki `nameByUser` kuraliyla ayni ilke: kullanici birine
 * ad verdiyse bu listede de o adi gormeli.
 */
const namesByGroupFromContacts = (
  contacts: readonly ContactRow[]
): Map<string, Map<string, string>> => {
  const namesByGroup = new Map<string, Map<string, string>>();

  for (const contact of contacts) {
    for (const group of contact.shared_groups) {
      const byUser = namesByGroup.get(group.id) ?? new Map<string, string>();
      byUser.set(contact.user_id, group.nickname ?? contact.name);
      namesByGroup.set(group.id, byUser);
    }
  }

  return namesByGroup;
};

interface GroupResults {
  /** Tum gruplardaki net bakiyelerin toplami, kurus. */
  totalCents: number;
  /** "Seni bekleyenler" -> BRC satirlari. */
  debts: PendingDebtView[];
}

/**
 * Toplu okunan satirlari gruplara dagitir, her grup icin 1.6'daki
 * `calculateNetBalances`i calistirir; iki seyi birden uretir: kullanicinin
 * **kurus** cinsinden toplam net bakiyesi ve odemesi gereken gruplardaki
 * **netlesmis** transferler (BRC satirlari).
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
 *
 * NEDEN TRANSFERLER YALNIZCA BEN NET BORCLUYKEN HESAPLANIYOR
 * -------------------------------------------------------------
 * `optimalNetting`/`greedyNetting` yalnizca borclulardan alacaklilara transfer
 * uretir — net bakiyem sifir ya da pozitifse hicbir transferde `from` olarak
 * cikamam. Bu kisayol her grupta netlestirmeyi calistirmayi (goreceli pahali
 * bir islem, bkz. `OPTIMAL_NETTING_LIMIT`) yalnizca gercekten gerektigi
 * gruplara indiriyor.
 */
const computeGroupResults = (
  userId: string,
  groups: readonly { id: string; name: string }[],
  netting: GroupedNettingData,
  confirmed: readonly ConfirmedSettlementOfGroup[],
  namesByGroup: ReadonlyMap<string, ReadonlyMap<string, string>>
): GroupResults => {
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
  const debts: PendingDebtView[] = [];

  for (const group of groups) {
    const inputs = buildNettingInputs(
      expensesByGroup.get(group.id),
      sharesByGroup.get(group.id),
      confirmedByGroup.get(group.id)
    );

    const balances = calculateNetBalances(inputs.expenses, inputs.shares);
    const mine = balances.find((balance) => balance.userId === userId);

    // Hicbir harcamasi/payi olmayan uye listede hic gorunmez: bakiyesi sifir.
    if (!mine) {
      continue;
    }

    const mineCents = netAmountToCents(mine.netBalance);
    totalCents += mineCents;

    if (mineCents >= 0) {
      continue;
    }

    // `getGroupBalances` (balance.service.ts) ile ayni algoritma secimi:
    // `optimalNetting` yalnizca kucuk gruplarda kullanilabilir.
    const activeCount = balances.filter(
      (balance) => netAmountToCents(balance.netBalance) !== 0
    ).length;
    const transfers =
      activeCount > OPTIMAL_NETTING_LIMIT ? greedyNetting(balances) : optimalNetting(balances);
    const names = namesByGroup.get(group.id);

    for (const transfer of transfers) {
      if (transfer.from !== userId) {
        continue;
      }

      // Karsi taraf gruptan cikarilmis olabilir (bkz. balance.service.ts'teki
      // ayni durum) — `listContactsForUser` artik onu donmez. Adi
      // gosterilemeyen bir satir icin "Hesabi kapat" de anlamsiz olurdu,
      // o yuzden bu nadir durumda satir hic uretilmiyor.
      const toName = names?.get(transfer.to);
      if (!toName) {
        continue;
      }

      debts.push({
        group_id: group.id,
        group_name: group.name,
        to_user: transfer.to,
        to_user_name: toName,
        amount: formatCents(netAmountToCents(transfer.amount)),
      });
    }
  }

  return { totalCents, debts };
};

export default { getHomeSummary };

export { getHomeSummary };
