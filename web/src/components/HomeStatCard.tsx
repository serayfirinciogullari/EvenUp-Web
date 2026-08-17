import { cn } from '@/lib/utils';

import type { HomeStatTile } from '../utils/homeCards';

/**
 * Kisisel veri karosu — koyu rose/ink gradyani.
 *
 * TEK RENK AILESI
 * ---------------
 * Karonun zemini her zaman ayni aileden: rose->ink gradyani. Karolar arasindaki
 * fark **yalnizca koyuluk ve gradyan yonu** (bkz. index.css `.home-tile--*`).
 * Farkli hue'lar (yesil/mavi/lila zemin) bilerek yok — ayrintili gerekce:
 * docs/decisions/home-ve-bos-durum-duzeltme.md.
 *
 * SINYAL RENGI YALNIZCA SAYIDA
 * ----------------------------
 * Alacak/borc rengi karonun zeminine degil **rakama** uygulaniyor
 * (`home-tile--credit` / `--debt`). Zemini yesile boyamak, bir bakiyeyi
 * "durum bildirimi"ne cevirir ve sayfadaki uc karo uc ayri renge dagilirdi.
 *
 * KART ICI BOSLUK
 * ---------------
 * `justify-between` + icerige yakin bir `min-h`: etiket tepede, rakam ortada,
 * aciklama altta ve aralarindaki bosluk dengeli. Onceki surumde karo yuksekligi
 * icerikten cok fazlaydi, rakam bosluga asili kaliyordu.
 */

const SURFACE_CLASS = {
  balance: 'home-tile--balance',
  spend: 'home-tile--spend',
} as const;

/** Ton -> yalnizca rakamin rengi. `neutral` ve `settled` icin ek sinif yok. */
const TONE_CLASS = {
  credit: 'home-tile--credit',
  debt: 'home-tile--debt',
  settled: '',
  neutral: '',
} as const;

const HomeStatCard = ({ tile }: { tile: HomeStatTile }) => {
  const { icon: Icon } = tile;

  return (
    <article
      className={cn(
        'home-tile flex min-h-36 flex-col justify-between gap-4 p-5 sm:p-6',
        SURFACE_CLASS[tile.surface],
        TONE_CLASS[tile.tone]
      )}
    >
      <header className="flex items-center gap-2">
        <span className="home-tile__icon flex size-7 shrink-0 items-center justify-center rounded-full">
          <Icon className="size-3.5" aria-hidden />
        </span>
        <p className="home-tile__label text-sm">{tile.label}</p>
      </header>

      {/*
        Deger Fraunces ile ve buyuk: karonun tasidigi asil sey bu. Sinif adi
        `home-tile__amount`, ton kurallari index.css'te ona bagli.
      */}
      <p className="home-tile__amount font-display text-3xl leading-none font-semibold sm:text-4xl">
        {tile.value}
      </p>

      {/*
        Renk bilgiyi TASIMIYOR: yon her zaman yazili. Renk korlugu olan
        kullanicida karo yine tam anlamli (bkz. utils/balance.ts).
      */}
      <p className="home-tile__caption text-xs">{tile.caption}</p>
    </article>
  );
};

export default HomeStatCard;
