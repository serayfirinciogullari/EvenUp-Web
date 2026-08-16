import { BellRing, ReceiptText, ScanLine, Tags, UsersRound, Wallet } from 'lucide-react';

import { formatCents, parseAmountToCents } from './money';
import { labelOfTone, toneOfCents } from './balance';

import type { BalanceTone } from './balance';
import type { HomeSummary } from '../types/models';
import type { LucideIcon } from 'lucide-react';

/**
 * Home carousel'inin kart listesi — **tek kapi**.
 *
 * Hem kisisel (veri) hem tanitim (statik) kartlari burada uretiliyor. Ayri bir
 * modul olmasinin sebebi: sira kurali bir **karar**, bir bilesenin icinde
 * kaybolmamali. Ustelik saf bir fonksiyon oldugu icin testi mock istemiyor.
 *
 * KART SIRASI NASIL BELIRLENDI
 * ----------------------------
 * Sira **sabit ve donusumlu** (stat, feature, stat, feature, ...):
 *
 *     1. Toplam net bakiye     (kisisel)
 *     2. Fis tarama            (tanitim)
 *     3. Bu ayki harcama       (kisisel)
 *     4. Takma isimler         (tanitim)
 *     5. Aktif grup sayisi     (kisisel)
 *     6. Hatirlatma            (tanitim)
 *
 * Uc karar var:
 *
 * 1. **Ilk kart kisisel.** Kullanici Home'a kendi durumunu ogrenmeye geliyor;
 *    ilk gordugu sey bir reklam olsaydi carousel'in tamami reklam sanilir ve
 *    kaydirilmadan gecilirdi.
 * 2. **Donusumlu, kumelenmis degil.** Uc kisisel kart art arda gelseydi
 *    tanitim kartlari "sondaki dolgu" olurdu; kullanicilarin cogu ucuncu
 *    karttan sonrasini gormez. Aralara serpistirmek her tanitim kartina bir
 *    kisisel kart kadar gorunme sansi veriyor.
 * 3. **Rastgele DEGIL.** Karistirma cazip geliyor ("her acilista taze
 *    gorunsun") ama kotu bir fikir: kullanici "bakiyem soldan ikinci karttaydi"
 *    diye hatirlayamaz, ayni kart iki farkli yerde cikar ve kas hafizasi hic
 *    olusmaz. Ayrica testler ve ekran goruntuleri belirsizlesir.
 *
 * Toplam **6 kart** — ust sinir bilincli, fazlasi dikkat dagitir.
 */

export interface StatCardModel {
  kind: 'stat';
  id: string;
  /** Kartin ustundeki kucuk etiket: "Toplam net bakiyen". */
  label: string;
  /** Buyuk deger — zaten bicimlendirilmis metin. */
  value: string;
  /** Degerin altindaki aciklama; renk tek basina birakilmasin diye her zaman var. */
  caption: string;
  /**
   * Sinyal tonu. `neutral` = parasal yonu olmayan kart (grup sayisi gibi);
   * yesil/kirmizi yalnizca gercekten alacak/borc anlatan kartlarda.
   */
  tone: BalanceTone | 'neutral';
  icon: LucideIcon;
}

export interface FeatureCardModel {
  kind: 'feature';
  id: string;
  title: string;
  description: string;
  /** Kartin uzerindeki eylem metni. */
  cta: string;
  /**
   * Gidilecek rota. `null` = ozellik henuz yok; kart tiklanabilir kalir ama
   * bir bildirim gosterir. Var olmayan bir adrese gonderip 404 ile
   * karsilastirmaktansa durumu acikca soylemek dogru.
   */
  to: string | null;
  icon: LucideIcon;
}

export type HomeCardModel = StatCardModel | FeatureCardModel;

/** Carousel'de gosterilecek en fazla kart. Fazlasi dikkat dagitir. */
const MAX_HOME_CARDS = 6;

/**
 * Tanitim kartlari — statik icerik, kodda tanimli.
 *
 * `to: null` olanlar henuz yazilmamis ozellikler. Rota geldiginde tek
 * yapilacak sey buradaki `null` yerine adresi yazmak; kart bilesenleri
 * degismiyor.
 */
const FEATURE_CARDS: readonly FeatureCardModel[] = [
  {
    kind: 'feature',
    id: 'receipt-scan',
    title: 'Fisi cek, AI duzenlesin',
    description: 'Fisin fotografini yukle; kalemleri ve tutari kendisi cikarsin.',
    cta: 'Fis tara',
    to: null,
    icon: ScanLine,
  },
  {
    kind: 'feature',
    id: 'nicknames',
    title: 'Herkese kendi takma ismini ver',
    description: 'Grup icinde kimin kim oldugunu kendi verdigin adlarla gor.',
    cta: 'Gruba git',
    /*
      2.9'da gercek bir ozellik oldu (Kisiler sekmesi). Hedef `/groups`:
      takma isim **grup basina** tanimli, dolayisiyla once bir grup secilmeli.
      Rastgele bir gruba gondermek, kullanicinin aklindaki grup olmama
      ihtimali yuksek oldugu icin daha kotu olurdu.
    */
    to: '/groups',
    icon: Tags,
  },
  {
    kind: 'feature',
    id: 'reminders',
    title: 'Borcunu unutma, hatirlat',
    description: 'Bekleyen odemeler icin kibar bir hatirlatma gonder.',
    cta: 'Hatirlatma kur',
    to: null,
    icon: BellRing,
  },
];

/**
 * Ozet verisinden kisisel kartlari uretir.
 *
 * Tutarlar kurusa cevrilip oyle bicimlendiriliyor (`utils/money`): backend
 * metin donuyor ve `Number(...)` cevrimi yalnizca gosterim aninda yapilmali.
 * Ayristirilamayan bir deger `null` doner — sessizce 0 saymak yerine kart
 * "hesaplanamadi" diyor, cunku 0,00 ₺ gecerli ve **cok farkli** bir cevap.
 */
const statCards = (summary: HomeSummary): StatCardModel[] => {
  const balanceCents = parseAmountToCents(summary.totalNetBalance);
  const spendCents = parseAmountToCents(summary.monthlySpend);

  // Isaret yonu belirler, renk yalnizca onu tekrarlar (bkz. utils/balance.ts).
  const tone = balanceCents === null ? 'neutral' : toneOfCents(balanceCents);

  return [
    {
      kind: 'stat',
      id: 'net-balance',
      label: 'Toplam net bakiyen',
      value: balanceCents === null ? 'Hesaplanamadi' : formatCents(balanceCents),
      // Ayni etiketler grup kartlarinda da kullaniliyor; "tum gruplar" eki
      // burasinin tek bir grup degil toplam oldugunu soyluyor.
      caption:
        balanceCents === null
          ? 'Ozet su an okunamadi'
          : `${labelOfTone(toneOfCents(balanceCents))} · tum gruplar`,
      tone,
      icon: Wallet,
    },
    {
      kind: 'stat',
      id: 'monthly-spend',
      label: 'Bu ay harcadigin',
      value: spendCents === null ? 'Hesaplanamadi' : formatCents(spendCents),
      caption: 'Bu ay senin odedigin harcamalar',
      // Harcama bir borc degil: kirmizi gostermek "kotu bir sey yaptin"
      // demek olurdu. Notr kaliyor.
      tone: 'neutral',
      icon: ReceiptText,
    },
    {
      kind: 'stat',
      id: 'active-groups',
      label: 'Aktif oldugun grup',
      value: String(summary.activeGroupsCount),
      caption:
        summary.activeGroupsCount === 0
          ? 'Henuz bir gruba katilmadin'
          : 'Uyesi oldugun grup sayisi',
      tone: 'neutral',
      icon: UsersRound,
    },
  ];
};

/**
 * Kisisel ve tanitim kartlarini donusumlu olarak orer.
 *
 * `summary` yoksa (yukleniyor / hata) yalnizca tanitim kartlari doner: bos bir
 * carousel gostermektense kullanicinin okuyabilecegi bir sey birakmak daha iyi,
 * ve kart sayisinin degismesi iskelet ile gercek icerik arasindaki gecisi
 * bozmuyor (iskelet zaten tek kart genisliginde).
 */
export const buildHomeCards = (summary: HomeSummary | null): HomeCardModel[] => {
  if (!summary) {
    return FEATURE_CARDS.slice(0, MAX_HOME_CARDS);
  }

  const stats = statCards(summary);
  const cards: HomeCardModel[] = [];

  // Donusumlu orgu. Iki liste esit uzunlukta (3+3) ama dongu yine de ikisinin
  // uzununa gore yaziliyor: yarin bir kart eklenirse sira kendiliginden dogru
  // kalsin, burasi yeniden yazilmasin.
  for (let index = 0; index < Math.max(stats.length, FEATURE_CARDS.length); index++) {
    if (stats[index]) {
      cards.push(stats[index]);
    }

    if (FEATURE_CARDS[index]) {
      cards.push(FEATURE_CARDS[index]);
    }
  }

  // Ust sinir burada uygulaniyor, cagiran tarafta degil: kart eklemek isteyen
  // biri once bu satiri gormek zorunda kalsin.
  return cards.slice(0, MAX_HOME_CARDS);
};
