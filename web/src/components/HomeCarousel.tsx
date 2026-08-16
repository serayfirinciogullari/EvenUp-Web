import { useEffect, useState } from 'react';

import HomeFeatureCard from '@/components/HomeFeatureCard';
import HomeStatCard from '@/components/HomeStatCard';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import type { CarouselApi } from '@/components/ui/carousel';
import type { HomeCardModel } from '../utils/homeCards';

/**
 * Home carousel'i.
 *
 * OTOMATIK KAYMIYOR — KARARIN TAMAMI KULLANICIDA
 * ----------------------------------------------
 * Bilincli olarak autoplay yok. Kartlarin yarisi **kisisel veri** tasiyor:
 * kullanici kendi bakiyesini okurken kartin altindan kayip gitmesi, okumayi
 * yarida kesmek demek. Ustelik bu ekranda okunan sey bir para tutari — yanlis
 * hatirlanmasi gercekten sorun yaratabilir. Otomatik hareket ayrica vestibuler
 * rahatsizligi olan kullanicilar icin sorunlu ve `prefers-reduced-motion`
 * altinda zaten kapatilmasi gerekirdi; hic baslatmamak daha durust bir cozum.
 *
 * Kaydirma uc yoldan yapilabiliyor: dokunmatikte **swipe**, farede **ok
 * butonlari**, klavyede **sekme + Enter**. Nerede oldugunu nokta gostergeleri
 * soyluyor.
 *
 * Ayrinti: docs/decisions/2.7-home-sayfasi.md
 */

interface HomeCarouselProps {
  cards: readonly HomeCardModel[];
  /** Ozet henuz gelmediyse kartlarin yerine iskelet gosterilir. */
  loading: boolean;
}

const HomeCarousel = ({ cards, loading }: HomeCarouselProps) => {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);

  /*
    Embla'nin secili slide'i bizim state'imize baglaniyor. Kendi `selectedScrollSnap`
    degerini okumak yerine abone olmamizin sebebi: slide yalnizca butonla degil
    swipe ile de degisiyor ve nokta gostergesi ikisinde de dogru olmali.
  */
  useEffect(() => {
    if (!api) {
      return;
    }

    const sync = () => setCurrent(api.selectedScrollSnap());

    sync();
    api.on('select', sync);
    // Kart sayisi degistiginde (iskelet -> gercek icerik) yeniden olculuyor.
    api.on('reInit', sync);

    return () => {
      api.off('select', sync);
      api.off('reInit', sync);
    };
  }, [api]);

  if (loading) {
    return <HomeCarouselSkeleton />;
  }

  return (
    /*
      Erisilebilir ad `Carousel`in **kendisine** veriliyor, disina bir
      `<section>` sarmalayarak degil: shadcn'in kokunde zaten
      `role="region"` + `aria-roledescription="carousel"` var. Disariya ikinci
      bir bolge koymak, ekran okuyucuya adsiz bir "region" daha duyurmak olurdu.
    */
    <div className="home-carousel">
      <Carousel
        setApi={setApi}
        aria-label="Ozet ve oneriler"
        opts={{
          // `align: 'start'` + `basis` ile genis ekranda birden fazla kart
          // gorunuyor; hizalama sola sabit kalinca kartlar zipzip kaymiyor.
          align: 'start',
          // Sona gelince basa donmuyor: donusluk, "hepsini gordum mu?"
          // sorusunu cevapsiz birakir. Ok butonlari uclarda pasiflesiyor.
          loop: false,
        }}
      >
        {/*
          Bosluk deseni bilesenin kendisinden geliyor: `CarouselContent` iceride
          `overflow-hidden` bir kap + `-ml-4`, item'lar da `pl-4` tasiyor.
          Negatif margin o kabin icinde kaldigi icin yatay tasma olusturmuyor.
        */}
        <CarouselContent>
          {cards.map((card) => (
            <CarouselItem
              key={card.id}
              /*
                Dar ekranda tek kart tam genislik (odak dagilmasin), tabletten
                itibaren iki, genis ekranda uc kart. `basis-*` degerleri
                CarouselItem'in varsayilan `basis-full`unu eziyor.

                `min-h-72` (288px) iskeletle **ayni** deger: ozet gelince
                kartlar yerinde doluyor, yukseklik degismedigi icin altindaki
                CTA ziplamiyor. Taban degeri, tavan degil — metin dar ekranda
                daha cok satira sararsa kart buyuyebiliyor.

                YUKSEKLIK NEDEN GENISLIKLE BIRLIKTE DUSUNULUYOR
                ----------------------------------------------
                Kart lg'de ~325px genisliginde. 192px yukseklikte oran 1.7:1
                oluyordu — kart "yatik bir seritmis" gibi duruyor ve icindeki
                buyuk rakam bosluga asili kaliyordu. 288px'te oran ~1.13:1;
                dikeye yakin bir kart, tasidigi tek bir bilgi icin dogru cerceve.
                Bu deger degistirilecekse asagidaki iskelet de birlikte
                degismeli — ikisi ayni sayiyi paylasiyor.
              */
              className="min-h-72 basis-full sm:basis-1/2 lg:basis-1/3"
            >
              {card.kind === 'stat' ? (
                <HomeStatCard card={card} />
              ) : (
                <HomeFeatureCard card={card} />
              )}
            </CarouselItem>
          ))}
        </CarouselContent>

        {/*
          Ok butonlari kartlarin **icinde** degil, altinda nokta gostergelerinin
          yaninda duruyor (asagida). shadcn'in varsayilani `-left-12/-right-12`
          ile kabin disinda; dar ekranda ekrandan tasardi.
        */}
        <div className="home-carousel__controls mt-4 flex items-center justify-center gap-3">
          <CarouselPrevious
            className="static translate-y-0 border-rose/25 text-rose hover:bg-rose/10 hover:text-rose"
            aria-label="Onceki kart"
          />

          <Dots count={cards.length} current={current} onSelect={(index) => api?.scrollTo(index)} />

          <CarouselNext
            className="static translate-y-0 border-rose/25 text-rose hover:bg-rose/10 hover:text-rose"
            aria-label="Sonraki kart"
          />
        </div>
      </Carousel>
    </div>
  );
};

/**
 * Nokta gostergeleri.
 *
 * Sadece gosterge degil, ayni zamanda **buton**: bir noktaya tiklayarak o karta
 * atlanabiliyor. Gosterge olarak birakmak, ekranda duran bir isareti
 * tiklanamaz yapmak olurdu — kullanicilar zaten deniyor.
 *
 * Aktif nokta yalnizca renkle degil **genislikle** de ayriliyor: renk korlugu
 * olan kullanicida da hangi karttayken belli olsun.
 */
const Dots = ({
  count,
  current,
  onSelect,
}: {
  count: number;
  current: number;
  onSelect: (index: number) => void;
}) => (
  <div className="home-carousel__dots flex items-center gap-1.5">
    {Array.from({ length: count }, (_, index) => {
      const active = index === current;

      return (
        <button
          key={index}
          type="button"
          onClick={() => onSelect(index)}
          aria-label={`${index + 1}. karta git`}
          aria-current={active ? 'true' : undefined}
          className={cn(
            'h-1.5 rounded-full transition-all',
            active ? 'w-5 bg-rose' : 'w-1.5 bg-ink/20 hover:bg-ink/35'
          )}
        />
      );
    })}
  </div>
);

/**
 * Yukleme iskeleti.
 *
 * Kart olculeri gercek kartlarla **ayni** (`basis` degerleri ve `min-h-72`):
 * ozet gelince sayfa ziplamiyor, kartlar yerinde doluyor. Bu ozellikle onemli
 * cunku Home dikey ortalanmis (bkz. HomePage.tsx) — yukseklik degisimi burada
 * yalnizca alti degil, sayfanin tamamini kaydirirdi.
 *
 * Kutu sayisi da ayni kalsin diye uc tane — dar ekranda zaten biri gorunuyor.
 */
const HomeCarouselSkeleton = () => (
  <div className="home-carousel" aria-busy="true" aria-label="Ozet yukleniyor">
    <div className="flex gap-4 overflow-hidden">
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="home-card card-glass flex min-h-72 shrink-0 grow-0 basis-full flex-col gap-3 p-5 sm:basis-[calc(50%-0.5rem)] lg:basis-[calc(33.333%-0.667rem)]"
        >
          <Skeleton className="skeleton-line h-8 w-8 rounded-full" />
          <Skeleton className="skeleton-line skeleton-line--title h-7 w-2/3" />
          <Skeleton className="skeleton-line skeleton-line--short mt-auto h-3 w-1/2" />
        </div>
      ))}
    </div>

    {/* Kontrol satiri da yer tutuyor; yoksa veri gelince altindaki CTA kayardi. */}
    <div className="mt-4 flex items-center justify-center gap-3">
      <Skeleton className="size-8 rounded-full" />
      <Skeleton className="h-1.5 w-16 rounded-full" />
      <Skeleton className="size-8 rounded-full" />
    </div>
  </div>
);

export default HomeCarousel;
