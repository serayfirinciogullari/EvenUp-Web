import { ReceiptText, ScanLine, Wallet } from 'lucide-react';

import { formatCents, parseAmountToCents } from './money';
import { labelOfTone, toneOfCents } from './balance';

import type { BalanceTone } from './balance';
import type { HomeSummary } from '../types/models';
import type { LucideIcon } from 'lucide-react';

/**
 * Home izgarasinin icerigi — **tek kapi**.
 *
 * IZGARA, CAROUSEL DEGIL
 * ----------------------
 * Onceki surumde alti kart bir carousel icinde donusumlu siralaniyordu ve
 * siranin kendisi bir karardi. Sabit izgarada boyle bir karar yok: kutu
 * sayisi kadar icerik var, hepsi ayni anda ekranda. Bu yuzden bu modul artik
 * "sirala" degil **"ne yazacagini hesapla"** isini yapiyor; sira duzenin
 * kendisinden (HomePage) geliyor.
 *
 * NEDEN YINE DE AYRI BIR MODUL
 * ----------------------------
 * Tutar ayristirma ve ton secimi saf mantik; bilesenin icine gomulseydi testi
 * DOM uzerinden yapmak gerekirdi. Ayrica `null` ozet durumunda **hicbir
 * kisisel kart uretilmemesi** kurali burada tek satirda duruyor.
 *
 * KART SAYISI DUSTU — NEDEN
 * -------------------------
 * Carousel alti kart tasiyabiliyordu cunku ucu her zaman ekran disindaydi.
 * Izgarada hepsi ayni anda gorunur; alti kutu bir "gosterge paneli" olurdu ve
 * Home'un tek isi (kullaniciyi gruplarina yollamak) o panelin icinde kaybolurdu.
 * Kalanlar: iki kisisel deger + bir tanitim. "Aktif grup sayisi" karti CTA'nin
 * altindaki cumleye tasindi (bkz. HomePage) — veri korundu, kutu eksildi.
 */

/** Karo yuzeyi. Uc deger de ayni rose/ink ailesinden; bkz. index.css. */
export type HomeTileSurface = 'balance' | 'spend';

export interface HomeStatTile {
  id: 'net-balance' | 'monthly-spend';
  /** Karonun ustundeki kucuk etiket: "Toplam net bakiyen". */
  label: string;
  /** Buyuk deger — zaten bicimlendirilmis metin. */
  value: string;
  /** Degerin altindaki aciklama; renk tek basina birakilmasin diye her zaman var. */
  caption: string;
  /**
   * Sinyal tonu. `neutral` = parasal yonu olmayan karo (aylik harcama gibi);
   * yesil/kirmizi yalnizca gercekten alacak/borc anlatan karoda.
   *
   * Ton YALNIZCA **sayinin rengini** degistiriyor, karonun zeminini degil
   * (bkz. index.css `.home-tile--credit`).
   */
  tone: BalanceTone | 'neutral';
  surface: HomeTileSurface;
  icon: LucideIcon;
}

export interface HomeFeatureTile {
  id: string;
  title: string;
  description: string;
  /** Karonun uzerindeki eylem metni. */
  cta: string;
  /**
   * Gidilecek rota. `null` = ozellik henuz yok; karo tiklanabilir kalir ama
   * bir bildirim gosterir. Var olmayan bir adrese gonderip 404 ile
   * karsilastirmaktansa durumu acikca soylemek dogru.
   */
  to: string | null;
  icon: LucideIcon;
}

/**
 * Tam genislikteki tanitim karosu.
 *
 * Tek tanitim karosu kaldi ve o da fis tarama: uygulamanin asil vaadi bu.
 * Ikinci/ucuncu tanitim karosu (takma isimler, hatirlatma) izgarada CTA ile
 * yarisiyordu; ikisi de zaten uygulamanin icinde kesfedilebilir yerler.
 */
export const RECEIPT_TILE: HomeFeatureTile = {
  id: 'receipt-scan',
  title: 'Fisi cek, AI duzenlesin',
  description: 'Fisin fotografini yukle; kalemleri ve tutari kendisi cikarsin, sen yalnizca onayla.',
  cta: 'Fis tara',
  to: null,
  icon: ScanLine,
};

/**
 * Ozet verisinden kisisel karolari uretir.
 *
 * Tutarlar kurusa cevrilip oyle bicimlendiriliyor (`utils/money`): backend
 * metin donuyor ve `Number(...)` cevrimi yalnizca gosterim aninda yapilmali.
 * Ayristirilamayan bir deger `null` doner — sessizce 0 saymak yerine karo
 * "hesaplanamadi" diyor, cunku 0,00 ₺ gecerli ve **cok farkli** bir cevap.
 *
 * `summary` yoksa (yukleniyor / hata) **bos dizi** doner: uydurma bir sifir
 * gostermektense kisisel karolari hic cizmemek dogru. Tanitim karosu ve CTA o
 * durumda da ayakta kaliyor, yani sayfa isini yapmaya devam ediyor.
 */
export const buildHomeTiles = (summary: HomeSummary | null): HomeStatTile[] => {
  if (!summary) {
    return [];
  }

  const balanceCents = parseAmountToCents(summary.totalNetBalance);
  const spendCents = parseAmountToCents(summary.monthlySpend);

  // Isaret yonu belirler, renk yalnizca onu tekrarlar (bkz. utils/balance.ts).
  const tone = balanceCents === null ? 'neutral' : toneOfCents(balanceCents);

  return [
    {
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
      surface: 'balance',
      icon: Wallet,
    },
    {
      id: 'monthly-spend',
      label: 'Bu ay harcadigin',
      value: spendCents === null ? 'Hesaplanamadi' : formatCents(spendCents),
      caption: 'Senin odedigin harcamalar',
      // Harcama bir borc degil: kirmizi gostermek "kotu bir sey yaptin"
      // demek olurdu. Notr kaliyor.
      tone: 'neutral',
      surface: 'spend',
      icon: ReceiptText,
    },
  ];
};

/**
 * CTA'nin altindaki yardimci cumle.
 *
 * Carousel'deki "Aktif oldugun grup" karti buraya tasindi: sayi bir kutuyu
 * hak edecek kadar onemli degildi ama kullaniciyi gruplarina yollayan
 * butonun hemen altinda **baglami** kuruyor. Ozet yoksa cumle yine var,
 * yalnizca sayisiz.
 */
export const ctaHintOf = (summary: HomeSummary | null): string => {
  if (!summary) {
    return 'Kim kime ne kadar borclu, hepsi orada.';
  }

  if (summary.activeGroupsCount === 0) {
    return 'Henuz bir gruba katilmadin — ilk grubunu orada olusturabilirsin.';
  }

  return `${summary.activeGroupsCount} grupta aktifsin · kim kime ne kadar borclu, hepsi orada.`;
};
