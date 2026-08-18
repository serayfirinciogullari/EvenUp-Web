import { ReceiptText, ScanLine } from 'lucide-react';

import { formatCents, formatCentsAbsolute, parseAmountToCents } from './money';
import { toneOfCents } from './balance';

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

/**
 * "Tum gruplarda net durumun" karosunun icerigi.
 *
 * Bilerek bir "bakiye" degil bir **durum**: kullaniciya cuzdanindaki para degil,
 * borclu mu alacakli mi oldugu soyleniyor. Bu yuzden bir ikon/etiket cifti degil,
 * yonlu bir rozet (`pillLabel`) + duz bir cumle (`sentence`) tasiyor.
 * Gerekce: HomeNetStatusCard.
 */
export interface HomeNetStatus {
  /** Yon: alacakli / borclu / dengede. Rakamin ve rozetin rengini belirler. */
  tone: BalanceTone;
  /** Buyuk, **isaretli** deger: "-220,00 ₺" / "45,00 ₺" / "0,00 ₺". */
  value: string;
  /** Yon rozeti metni: "Borcun var" / "Sana borclular" / "Hesabin kapali". */
  pillLabel: string;
  /** Altta duz cumle: kac grup, ne kadar, kac islem bekliyor. */
  sentence: string;
}

export interface HomeStatTile {
  id: 'net-balance' | 'monthly-spend';
  /** Karonun ustundeki kucuk etiket: "Bu ay harcadigin". */
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

/** Yon rozetinin metni. Kisa ve chip gibi: "Sen borclusun" degil "Borcun var". */
const PILL_LABEL: Record<BalanceTone, string> = {
  credit: 'Sana borclular',
  debt: 'Borcun var',
  settled: 'Hesabin kapali',
};

/**
 * Karonun altindaki duz cumle: "3 grupta toplam 220,00 ₺ borcun var; 3 islem
 * seni bekliyor." Yonu (borc/alacak) ve baglami (kac grup, kac bekleyen) tek
 * cumlede topluyor; renk tek basina birakilmasin diye her zaman yazili.
 */
const netSentence = (
  tone: BalanceTone,
  groups: number,
  absAmount: string,
  pending: number
): string => {
  // Bekleyen odemeler ust bandaki uyaridan farkli bir kelimeyle ("islem"):
  // ayni sayiyi iki yerde birebir tekrarlamis gibi okunmasin.
  const pendingClause = pending > 0 ? `; ${pending} islem seni bekliyor.` : '.';

  if (tone === 'settled') {
    if (groups === 0) {
      return 'Henuz bir gruba katilmadin.';
    }
    return `Butun gruplarda hesabin kapali${pendingClause}`;
  }

  const direction = tone === 'debt' ? 'borcun var' : 'alacagin var';
  return `${groups} grupta toplam ${absAmount} ${direction}${pendingClause}`;
};

/**
 * "Tum gruplarda net durumun" karosunun icerigi.
 *
 * `summary` yoksa (yukleniyor / hata) `null` doner: uydurma bir sifir
 * gostermektense karoyu hic cizmemek dogru — 0,00 ₺ gecerli ve **cok farkli**
 * bir cevap. Tutar ayristirilamazsa da (beklenmeyen bicim) karo "hesaplanamadi"
 * diyor, sessizce 0 saymiyor.
 */
export const buildNetStatus = (summary: HomeSummary | null): HomeNetStatus | null => {
  if (!summary) {
    return null;
  }

  const cents = parseAmountToCents(summary.totalNetBalance);

  if (cents === null) {
    return {
      tone: 'settled',
      value: 'Hesaplanamadi',
      pillLabel: 'Ozet okunamadi',
      sentence: 'Net durumun su an okunamadi.',
    };
  }

  // Isaret yonu belirler, renk yalnizca onu tekrarlar (bkz. utils/balance.ts).
  const tone = toneOfCents(cents);

  return {
    tone,
    value: formatCents(cents),
    pillLabel: PILL_LABEL[tone],
    sentence: netSentence(
      tone,
      summary.activeGroupsCount,
      formatCentsAbsolute(cents),
      summary.pendingSettlementsCount
    ),
  };
};

/**
 * "Bu ay harcadigin" karosu.
 *
 * Harcama bir borc degil: sinyal rengi tasimiyor (`neutral`), kirmizi gostermek
 * "kotu bir sey yaptin" demek olurdu. `summary` yoksa `null` — net durum
 * karosuyla ayni gerekce, uydurma sifir gostermiyoruz.
 */
export const buildSpendTile = (summary: HomeSummary | null): HomeStatTile | null => {
  if (!summary) {
    return null;
  }

  const spendCents = parseAmountToCents(summary.monthlySpend);

  return {
    id: 'monthly-spend',
    label: 'Bu ay harcadigin',
    value: spendCents === null ? 'Hesaplanamadi' : formatCents(spendCents),
    caption: 'Senin odedigin harcamalar',
    tone: 'neutral',
    surface: 'spend',
    icon: ReceiptText,
  };
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
