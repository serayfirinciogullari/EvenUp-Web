import { HeartHandshake, MessagesSquare, Plus, ReceiptText, Scale, UsersRound } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import type { LucideIcon } from 'lucide-react';

/**
 * Gruplar — **hic grup yokken** gosterilen ekran.
 *
 * NEDEN BIR CUMLE YETMIYOR
 * ------------------------
 * Onceki bos durum tek satirdi: "Henuz bir grubun yok." Dogru ama ise
 * yaramaz — kullanici o an uygulamayi ilk kez goruyor ve "grup" kelimesinin
 * bu uygulamada ne anlama geldigini bilmiyor. Bos ekran, uygulamanin en cok
 * **anlatmasi gereken** ani; bir hata mesaji gibi davranmasi icin sebep yok.
 *
 * UC BLOK
 * -------
 *   1. Karsilama karti  -> tek eylem: ilk grubu olustur.
 *   2. "Grup nedir?"    -> iki cumlelik tanim.
 *   3. 2x2 ozellik izgarasi -> grubun icinde ne var.
 *
 * Sira bilincli: once eylem, sonra aciklama. Kullanicinin cogu zaten ne
 * yapacagini biliyor ve aciklamayi okumadan butona basar; aciklamayi tepeye
 * koymak onlari bekletmek olurdu.
 *
 * "YAKINDA" ROZETLERI
 * -------------------
 * Izgaradaki dort kutunun ikisi bugun calisan ozellikler (bakiyeler, grup
 * yonetimi), ikisi henuz yok (sohbet, AI'in kalemlere ayirmasi). Olmayanlar
 * rozetle isaretli — bos bir ekranda var olmayan ozellikleri varmis gibi
 * anlatmak, kullanicinin ilk dakikada karsilasacagi ilk yalan olurdu.
 */

interface FeatureNote {
  title: string;
  description: string;
  icon: LucideIcon;
  /** `false` -> "Yakinda" rozeti. */
  available: boolean;
}

const FEATURES: readonly FeatureNote[] = [
  {
    title: 'Sohbet & fisler',
    description: 'Fisin fotografini dogrudan grup sohbetine at; konusma ve harcama ayni yerde kalsin.',
    icon: MessagesSquare,
    available: false,
  },
  {
    title: 'Harcama kalemleri',
    description:
      'AI fisi kalemlere ayirsin. Bugun harcamalari elle ekleyip esit ya da ozel bolusebiliyorsun.',
    icon: ReceiptText,
    available: false,
  },
  {
    title: 'Bakiyeler',
    description: 'Kim kime ne kadar borclu tek listede. Odemeyi isaretle, karsi taraf onaylasin.',
    icon: Scale,
    available: true,
  },
  {
    title: 'Grup ayarlari',
    description: 'Davet linkini paylas, uyeleri gor, herkese kendi verdigin takma ismi ver.',
    icon: UsersRound,
    available: true,
  },
];

/**
 * @param onCreate Grup olusturma akisini acar (`NewGroupModal`). Modali burada
 *   tutmuyoruz: sayfada zaten bir tane var ve "Yeni Grup" butonu da onu
 *   aciyor. Ikinci bir kopya, iki ayri acik/kapali durumu demek olurdu.
 */
const GroupsEmptyState = ({ onCreate }: { onCreate: () => void }) => (
  <div className="groups-empty mt-6 flex flex-col gap-10">
    {/*
      Karsilama karti. Dar ekranda dikey, genis ekranda yatay: ikon rozeti
      solda kalinca baslik ve buton tek bir okuma hattinda diziliyor.
    */}
    <section className="welcome-card flex flex-col items-start gap-5 p-6 sm:flex-row sm:items-center sm:p-8">
      <span className="welcome-card__badge flex size-14 shrink-0 items-center justify-center rounded-full">
        <HeartHandshake className="size-7" aria-hidden />
      </span>

      <div className="min-w-0 flex-1">
        <h2>EvenUp'a hos geldin</h2>
        <p className="welcome-card__text mt-1.5 text-sm">
          Fisi cek, AI duzenlesin, arkadaslarinla saniyeler icinde bolus.
        </p>
      </div>

      <Button className="welcome-card__cta w-full shrink-0 sm:w-auto" onClick={onCreate}>
        <Plus className="size-4" aria-hidden />
        Ilk grubunu olustur
      </Button>
    </section>

    <section className="groups-empty__explainer">
      {/*
        `h2` degil `h3`: sayfanin ikinci basligi karsilama kartinda. Fraunces
        ve buyuk punto yerine kucuk/aralikli/gri — bu bir baslik degil, bir
        **bolum ayraci**. Utility siniflari base katmanini eziyor.
      */}
      <h3 className="text-center text-xs font-medium tracking-[0.18em] text-ink-muted uppercase">
        Grup nedir?
      </h3>

      <p className="mx-auto mt-3 max-w-lg text-center text-sm text-ink-muted">
        Grup, harcamalari birlikte takip ettiginiz bir alan: ev arkadaslarin, tatil ekibin ya da
        bir proje. Kim ne odedi, kim kime ne kadar borclu — hepsi grubun icinde tutuluyor.
      </p>

      <div className="groups-empty__grid mt-6 grid gap-4 sm:grid-cols-2">
        {FEATURES.map((feature) => (
          <FeatureNoteCard key={feature.title} feature={feature} />
        ))}
      </div>
    </section>
  </div>
);

/**
 * Tek bir ozellik notu — **solid** yuzey.
 *
 * Glass degil: bunlar bir ozet/durum tasimiyor, okunacak bir aciklama
 * tasiyorlar (index.css'teki yuzey kurali). Parilti burada olsaydi imza oge
 * bir tanitim listesinde harcanmis olurdu.
 */
const FeatureNoteCard = ({ feature }: { feature: FeatureNote }) => {
  const { icon: Icon } = feature;

  return (
    <article className="card-solid flex gap-3 p-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-rose/10">
        <Icon className="size-4 text-rose" aria-hidden />
      </span>

      <div className="min-w-0">
        <h4 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
          {feature.title}
          {!feature.available && (
            <Badge variant="outline" className="border-ink/15 text-[0.7rem] text-ink-muted">
              Yakinda
            </Badge>
          )}
        </h4>
        <p className="mt-1 text-sm text-ink-muted">{feature.description}</p>
      </div>
    </article>
  );
};

export default GroupsEmptyState;
