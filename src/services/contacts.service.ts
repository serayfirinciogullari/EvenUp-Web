import expenseModel from '../models/expense.model';
import groupModel from '../models/group.model';
import settlementModel from '../models/settlement.model';
import { formatCents, parseAmountToCents } from '../utils/money';

import type { ContactGroupRef } from '../models/group.model';

/**
 * "Kisiler" sayfasi is mantigi: kullanicinin ortak grubu oldugu her kisi +
 * o kisiyle **tum ortak gruplardaki toplam** net bakiye + grup basina kirilim.
 *
 * NEDEN BU BIR NETLESTIRME DEGIL (netting.service'in TEKRARI DEGIL)
 * -------------------------------------------------------------------
 * `calculateNetBalances`/`optimalNetting` bir grubun icindeki herkesin **grup
 * karsisindaki** net durumunu ve o durumu kapatan **minimize edilmis** transfer
 * setini hesaplar — iki kisi arasindaki dogrudan borcu degil. 3+ kisilik bir
 * grupta minimize edilmis transfer listesi, aramizda gercek bir bakiye olsa
 * bile beni ve bu kisiyi **dogrudan** birbirine baglamayabilir (borc ucuncu
 * biri uzerinden kapanabilir). Bu sayfanin sordugu soru farkli: "bu kisiyle
 * benim aramda ne kadar var" — bu, harcama paylarindan ve onaylanmis
 * odemelerden **dogrudan** okunan, netlestirmeden bagimsiz bir sayi.
 *
 * TEK GECISTE HESAPLAMA (N+1 YOK)
 * ---------------------------------
 * Kullanicinin kac kisiyle kac grubu olursa olsun sabit sayida sorgu:
 * `listForUser`, `listContactsForUser`, `listForNettingByGroups`,
 * `listConfirmedByGroups`. Pay/odeme listesi bir kez taranip her satir ilgili
 * (kisi, grup) cifti icin bir kurus deltasi biriktiriyor — kisi basina ayri
 * bir tarama yok. Gerekce: docs/decisions/kisiler-sayfasi.md.
 */

export interface ContactGroupBalance extends ContactGroupRef {
  /** Bu grupta, yalnizca bu kisiyle olan net bakiye. Pozitif = kisi borclu. */
  net_balance: string;
}

export interface ContactSummary {
  user_id: string;
  name: string;
  nickname: string | null;
  shared_groups: ContactGroupBalance[];
  /** Tum ortak gruplardaki toplam. Pozitif = kisi sana borclu, negatif = sen borclusun. */
  net_balance: string;
}

/**
 * `(kisi, grup) -> kurus` birikimi. `Map<Map>` yerine bilesik anahtar da
 * kullanilabilirdi ama iki seviyeli yapi, bir kisinin butun gruplarini tek
 * `.get`le okuyabilmeyi (asagida, sonuc kurarken) daha basit kiliyor.
 */
type OwedByGroup = Map<string, Map<string, number>>;

const addOwed = (owed: OwedByGroup, contactId: string, groupId: string, cents: number): void => {
  const byGroup = owed.get(contactId) ?? new Map<string, number>();
  byGroup.set(groupId, (byGroup.get(groupId) ?? 0) + cents);
  owed.set(contactId, byGroup);
};

/** DB'den gelen NUMERIC metni kurusa cevirir. Bicimsiz gelmesi beklenmez
 *  (yazilirken zaten dogrulanmis); yine de sessizce 0 sayip hata firlatmiyor. */
const toCents = (value: string): number => parseAmountToCents(value) ?? 0;

/**
 * GET /users/me/contacts
 */
const getContacts = async (userId: string): Promise<ContactSummary[]> => {
  const groups = await groupModel.listForUser(userId);
  const groupIds = groups.map((group) => group.id);

  const [contactRows, { expenses, shares }, confirmed] = await Promise.all([
    groupModel.listContactsForUser(userId),
    expenseModel.listForNettingByGroups(groupIds),
    settlementModel.listConfirmedByGroups(groupIds),
  ]);

  const sharesByExpense = new Map<string, typeof shares>();
  for (const share of shares) {
    const list = sharesByExpense.get(share.expense_id) ?? [];
    list.push(share);
    sharesByExpense.set(share.expense_id, list);
  }

  const owed: OwedByGroup = new Map();

  /*
    Harcamalar: odeyen kim, kimin payi var. Kendi payim kendime borc uretmez
    (bkz. `share.user_id === userId` atlamasi). Ucuncu bir kisinin payi da bu
    kisiyi ilgilendirmiyor — yalnizca odeyen VEYA pay sahibi bu kisi ile ben
    isem bir satir uretiyor.
  */
  for (const expense of expenses) {
    const expenseShares = sharesByExpense.get(expense.id) ?? [];

    if (expense.paid_by === userId) {
      for (const share of expenseShares) {
        if (share.user_id === userId) {
          continue;
        }
        addOwed(owed, share.user_id, expense.group_id, toCents(share.share_amount));
      }
    } else {
      const mine = expenseShares.find((share) => share.user_id === userId);
      if (mine) {
        addOwed(owed, expense.paid_by, expense.group_id, -toCents(mine.share_amount));
      }
    }
  }

  /*
    Onaylanmis odemeler: "sanal harcama" kurali burada da gecerli
    (docs/decisions/1.7.md) ama yalnizca IKI TARAF arasindaki odemeler bu
    kisinin bakiyesini etkiler — baskasina yapilan bir odeme bu kisiyi
    ilgilendirmiyor.
  */
  for (const settlement of confirmed) {
    if (settlement.from_user === userId) {
      addOwed(owed, settlement.to_user, settlement.group_id, toCents(settlement.amount));
    } else if (settlement.to_user === userId) {
      addOwed(owed, settlement.from_user, settlement.group_id, -toCents(settlement.amount));
    }
  }

  return contactRows.map((contact) => {
    const byGroup = owed.get(contact.user_id) ?? new Map<string, number>();
    let totalCents = 0;

    const sharedGroups = contact.shared_groups.map((group) => {
      const groupCents = byGroup.get(group.id) ?? 0;
      totalCents += groupCents;
      return { ...group, net_balance: formatCents(groupCents) };
    });

    return {
      user_id: contact.user_id,
      name: contact.name,
      nickname: contact.nickname,
      shared_groups: sharedGroups,
      net_balance: formatCents(totalCents),
    };
  });
};

export default { getContacts };

export { getContacts };
