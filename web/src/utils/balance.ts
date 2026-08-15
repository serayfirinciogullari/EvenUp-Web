import { parseAmountToCents } from './money';

import type { Balance } from '../types/models';

/**
 * Bakiye renklendirme kurali — **tek kapi**.
 *
 * Kural tek cumle: **isaret yonu belirler, renk yalnizca onu tekrarlar.**
 *
 *   net > 0  -> alacakli  -> yesil  -> "sana borclular"
 *   net < 0  -> borclu    -> kirmizi -> "sen borclusun"
 *   net == 0 -> dengede   -> notr   -> "hesap kapali"
 *
 * Isaretin anlami backend'den geliyor ve orada da ayni: `calculateNetBalances`
 * icinde `net = odedigi - payina dusen`. Yani pozitif deger "fazla odemis,
 * alacakli" demek (bkz. docs/decisions/1.6).
 *
 * NEDEN KARSILASTIRMA KURUS UZERINDEN
 * -----------------------------------
 * `Number("-0.004") < 0` true doner ve kullaniciya kirmizi bir "0,00 ₺
 * borcun var" gosterirdik — yani yuvarlanmis gosterim ile renk celisirdi.
 * Kurusa cevirip karsilastirmak ikisini ayni kaynaga baglar: ekranda 0,00
 * gorunen her deger `settled` sayilir.
 *
 * NEDEN RENK TEK BASINA YETMEZ
 * ----------------------------
 * Her tonun bir de metni var ve metin her zaman gosteriliyor. Renk korlugu
 * (erkeklerin ~%8'i) kirmizi/yesil ayrimini en cok etkileyen turdur; bilgi
 * yalnizca renge yuklenirse o kullanicilar icin ekran anlamsizlasir.
 * Renk burada bilgiyi **tasimiyor**, yalnizca hizlandiriyor.
 */

export type BalanceTone = 'credit' | 'debt' | 'settled';

export interface BalanceView {
  tone: BalanceTone;
  cents: number;
  label: string;
}

const LABELS: Record<BalanceTone, string> = {
  credit: 'Sana borclular',
  debt: 'Sen borclusun',
  settled: 'Hesap kapali',
};

export const toneOfCents = (cents: number): BalanceTone => {
  if (cents > 0) {
    return 'credit';
  }

  if (cents < 0) {
    return 'debt';
  }

  return 'settled';
};

export const labelOfTone = (tone: BalanceTone): string => LABELS[tone];

/**
 * Bakiye listesinden **istekte bulunan kullanicinin** satirini secer.
 *
 * Kullanici listede hic bulunmayabilir: gruba yeni katilmis ve henuz hicbir
 * harcamaya dahil olmamis biri backend'in birlesim kumesine girer ama
 * "0.00" ile gelir; yine de savunmaci davraniyoruz. Bulunamazsa `settled`
 * kabul ediliyor cunku hicbir harcamaya dokunmamis olmak fiilen sifir
 * bakiyedir.
 */
export const viewForUser = (balances: Balance[], userId: string): BalanceView => {
  const row = balances.find((balance) => balance.user_id === userId);
  const cents = row ? parseAmountToCents(row.net_balance) : 0;

  // Ayristirilamayan deger = beklenmeyen bir bicim. Sessizce 0 saymak yerine
  // dengede gosteriyoruz ama bunu ayirt edebilmek icin cents'i 0'a sabitliyoruz;
  // ekranda yanlis bir tutar cikmasindansa notr bir hucre daha az zararli.
  const safeCents = cents ?? 0;

  return { tone: toneOfCents(safeCents), cents: safeCents, label: labelOfTone(toneOfCents(safeCents)) };
};
