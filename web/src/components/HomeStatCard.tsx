import GlassCard from '@/components/GlassCard';

import type { StatCardModel } from '../utils/homeCards';

/**
 * Kisisel veri karti — **glass** yuzey.
 *
 * Yuzey secimi tesaduf degil, index.css'teki kurala uyuyor: glass = ozet/durum
 * yuzeyi, yani bir seyin **sonucunu** gosteren kartlar. Grup kartindaki bakiye
 * ozeti de ayni aileden. Tanitim karti ise solid (bkz. HomeFeatureCard):
 * kullanici "bu bir istatistik mi, oneri mi?" ayrimini okumadan once
 * yuzeyden yapabilsin.
 *
 * Ayrim yalnizca yuzeyde degil, uc kanalda birden:
 *   - yuzey   -> glass (parilti var) / solid (duz)
 *   - tipografi -> buyuk rakam (Fraunces) / normal baslik
 *   - ikon    -> daire icinde, notr tonda / rose dolgulu kare
 */
const HomeStatCard = ({ card }: { card: StatCardModel }) => {
  const { icon: Icon } = card;

  return (
    <GlassCard
      as="article"
      className={`home-card home-card--stat balance--${card.tone} flex h-full flex-col gap-3 border-l-4 p-5`}
    >
      <header className="flex items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink/5">
          <Icon className="size-4 text-ink-muted" aria-hidden />
        </span>
        <p className="home-card__label text-sm text-ink-muted">{card.label}</p>
      </header>

      {/*
        Deger Fraunces ile ve buyuk: kartin tasidigi asil sey bu. `home-card__amount`
        sinifi bilerek `group-card__amount` ile ayni ton kurallarina bagli
        (index.css) — ayni bilgi iki ekranda ayni renkte gorunsun.

        `flex-1 items-center` sarmalayici: kart yuksekligi icerikten fazla
        (min-h-72) ve artan bosluk **rakamin etrafina** dagitiliyor. Aksi halde
        deger basligin hemen altina yapisir, altinda da buyuk bir bosluk
        kalirdi — kart yarim doldurulmus gibi gorunurdu. Boylece yukseklik
        degisse de duzen kendini toparliyor.
      */}
      <div className="flex flex-1 items-center">
        <p className="home-card__amount font-display text-3xl leading-none font-semibold sm:text-4xl">
          {card.value}
        </p>
      </div>

      {/*
        Renk bilgiyi TASIMIYOR: yon her zaman yazili. Renk korlugu olan
        kullanicida kart yine tam anlamli (bkz. utils/balance.ts).
      */}
      <p className="home-card__caption mt-auto text-xs text-ink-muted">{card.caption}</p>
    </GlassCard>
  );
};

export default HomeStatCard;
