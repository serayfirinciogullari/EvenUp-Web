import { ArrowDown, ArrowUp, Check } from 'lucide-react';

import { cn } from '@/lib/utils';

import type { HomeNetStatus } from '../utils/homeCards';
import type { LucideIcon } from 'lucide-react';

/**
 * "Tum gruplarda net durumun" karosu — sayfanin tasidigi **asil** sayi.
 *
 * NEDEN CUZDAN DEGIL, DURUM
 * -------------------------
 * Onceki surumde bu karo bir cuzdan ikonu + "Toplam net bakiyen" etiketi
 * tasiyordu ve bir **hesap bakiyesi** gibi okunuyordu. Oysa buradaki sayi bir
 * bakiye degil, bir **yon**: ya borclusun ya alacaklisin. Cuzdan cagrisimi bu
 * yonu siliyor, "param ne kadar" gibi notr bir sayiya ceviriyordu.
 *
 * Bu yuzden karo yeniden kurgulandi:
 *   - Ikon yok; etiket "Tum gruplarda net durumun" (bakiye degil, durum).
 *   - Buyuk sayinin yaninda **yonlu bir rozet**: "Borcun var" / "Sana borclular"
 *     / "Hesabin kapali" — yon tek bakista ve **yazili** okunuyor.
 *   - Altta duz cumle: kac grup, ne kadar, kac islem bekliyor.
 *
 * SINYAL MARKA PALETINDEN AYRI (2.3)
 * ----------------------------------
 * Borc/alacak rengi rose'dan degil sinyal ailesinden geliyor; hem rakama hem
 * rozete o uygulaniyor (index.css `.home-tile--debt/--credit`, `.home-net__pill--*`).
 * Renk bilgiyi TASIMIYOR: yon rozette ve cumlede zaten yazili, renk yalnizca
 * hizlandiriyor (renk korlugu olan kullanicida karo yine tam anlamli).
 */

interface ToneConfig {
  /** Rakamin rengini veren ton sinifi (index.css). `settled`te yok — notr ink. */
  tile: string;
  pill: string;
  icon: LucideIcon;
}

const TONE: Record<HomeNetStatus['tone'], ToneConfig> = {
  // Alacak: para sana dogru -> yukari ok.
  credit: { tile: 'home-tile--credit', pill: 'home-net__pill--credit', icon: ArrowUp },
  // Borc: para senden cikiyor -> asagi ok.
  debt: { tile: 'home-tile--debt', pill: 'home-net__pill--debt', icon: ArrowDown },
  settled: { tile: '', pill: 'home-net__pill--settled', icon: Check },
};

const HomeNetStatusCard = ({ status }: { status: HomeNetStatus }) => {
  const tone = TONE[status.tone];
  const PillIcon = tone.icon;

  return (
    <article
      className={cn(
        'home-tile home-tile--balance flex min-h-36 flex-col justify-between gap-3 p-5 sm:p-6',
        tone.tile
      )}
    >
      {/* uppercase + harf araligi: sol taraftaki referans format ("TUM
          GRUPLARDA NET DURUMUN") — etiket bir baslik degil, ust bilgi. */}
      <p className="home-tile__label text-xs font-medium tracking-[0.14em] uppercase">
        Tum gruplarda net durumun
      </p>

      <div className="flex flex-wrap items-center gap-3">
        {/* Buyuk, isaretli deger: borcta eksi isareti yonu ayrica pekistiriyor. */}
        <p className="home-tile__amount font-display text-4xl leading-none font-semibold sm:text-5xl">
          {status.value}
        </p>

        <span
          className={cn(
            'home-net__pill inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
            tone.pill
          )}
        >
          <PillIcon className="size-3.5" aria-hidden />
          {status.pillLabel}
        </span>
      </div>

      <p className="home-tile__caption text-xs">{status.sentence}</p>
    </article>
  );
};

export default HomeNetStatusCard;
