import { ArrowRight, TriangleAlert } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import HomeFeatureCard from '@/components/HomeFeatureCard';
import HomeNetStatusCard from '@/components/HomeNetStatusCard';
import HomeStatCard from '@/components/HomeStatCard';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useSummaryData } from '../hooks/useAppData';
import useAuth from '../hooks/useAuth';
import { RECEIPT_TILE, buildNetStatus, buildSpendTile, ctaHintOf } from '../utils/homeCards';

import type { HomeNetStatus, HomeStatTile } from '../utils/homeCards';

/**
 * Home — giris sonrasi ilk ekran.
 *
 * SAYFANIN AMACI: TUTMAK DEGIL, YONLENDIRMEK
 * ------------------------------------------
 * Home bir vitrin degil bir **giris holu**. Kullanici bu uygulamaya borcunu
 * gormeye geliyor; Home'un isi o yolu kisaltmak, uzatmak degil. Bu yuzden
 * izgaranin altinda tek ve buyuk bir CTA var ("Gruplarini Gor") ve sayfada
 * onunla yarisan ikinci bir birincil eylem yok.
 *
 * CAROUSEL KALDIRILDI
 * -------------------
 * Onceki surumde ayni icerik bir carousel icindeydi: ok butonlari, nokta
 * gostergeleri, swipe. Uc kutuluk bir icerik icin bunlarin hepsi **gereksiz
 * mekanikti** — kullanici okumadan once "kac kart var, hepsini gordum mu?"
 * sorusuna takiliyordu ve kartlarin yarisi her zaman ekran disindaydi. Sabit
 * izgarada her sey ilk bakista gorunuyor, tiklanacak hicbir gezinme ogesi yok.
 * Ayrintili gerekce: docs/decisions/home-ve-bos-durum-duzeltme.md.
 *
 * HATA DURUMU SAYFAYI DUSURMUYOR
 * ------------------------------
 * Ozet cekilemezse sayfa hata ekranina donmuyor: karsilama, tanitim karosu ve
 * CTA ayakta kaliyor, yalnizca kisisel karolarin yerinde kucuk bir uyari
 * cikiyor. Gerekce — Home'un asil isi (kullaniciyi gruplarina yonlendirmek)
 * ozet olmadan da yapilabilir.
 */
const HomePage = () => {
  const { user } = useAuth();

  /*
    Ozet artik sayfaya degil `AppDataProvider`a ait: ayni veriyi sidebar'daki
    bekleyen odeme rozeti de okuyor. Sayfa kendi istegini atsaydi Home her
    acildiginda ayni uc noktaya ikinci bir istek gitmis olurdu.
  */
  const summary = useSummaryData();

  const netStatus = useMemo(() => buildNetStatus(summary.data), [summary.data]);
  const spendTile = useMemo(() => buildSpendTile(summary.data), [summary.data]);

  const pending = summary.data?.pendingSettlementsCount ?? 0;

  return (
    /*
      Sayfa artik dikey olarak ortalanmiyor. Onceki surumde carousel tek satir
      oldugu icin ekranin alt yarisi bos kaliyordu ve `min-h` + `justify-center`
      ile bu bosluk kapatiliyordu. Izgara ekranin dogal akisini zaten dolduruyor;
      ortalama burada icerigi yukaridan koparmaktan baska bir sey yapmazdi ve
      diger uc ekranin (Gruplar, Ayarlar, Admin) ustten baslama davranisiyla da
      celisirdi.
    */
    <section className="home-page flex flex-col gap-6">
      <header className="home-page__head">
        {/*
          Ad gelmeden once iskelet: "Merhaba, undefined" ya da bir kare
          boyunca bos bir baslik gostermektense yer tutmak dogru. `user`
          `/auth/me` cevabindan gelir ve genelde sayfadan once hazirdir.
        */}
        {user ? (
          <h1 className="home-page__greeting">Merhaba, {user.name}</h1>
        ) : (
          <Skeleton className="skeleton-line skeleton-line--title h-8 w-52" />
        )}
        <p className="mt-1 text-sm text-ink-muted">
          Ozetine goz at, sonra gruplarindaki hesaplara don.
        </p>
      </header>

      {/* Uyari basligin hemen altinda: bir bildirim orada beklenir. */}
      {pending > 0 && <PendingBanner count={pending} />}

      {/*
        Ozet okunamadiysa izgara yine ciziliyor — yalnizca kisisel karolar
        eksik — ama neden eksik olduklari soyleniyor. Sessizce iki karo
        gostermemek "ozetin yok" izlenimi verirdi.
      */}
      {!summary.loading && summary.error && (
        <div
          className="state-box state-box--error card-solid border-destructive/30 p-4 text-sm"
          role="alert"
        >
          <p className="text-destructive">{summary.error}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={summary.reload}>
            Tekrar dene
          </Button>
        </div>
      )}

      {summary.loading ? (
        <HomeGridSkeleton />
      ) : (
        <HomeGrid netStatus={netStatus} spendTile={spendTile} />
      )}

      <PrimaryCta hint={ctaHintOf(summary.data)} />
    </section>
  );
};

/**
 * Sabit izgara.
 *
 * DUZEN
 * -----
 *   ust satir : genis karo (net durum) + dar karo (bu ay harcanan)
 *   alt satir : tam genislikte tanitim karosu
 *
 * Genislik farki `sm:grid-cols-3` + `col-span-2` ile: net durum sayfanin
 * tasidigi **asil** sayi, dolayisiyla daha genis kutuyu o aliyor. Esit iki
 * kutu olsaydi ikisi de "esit onemde" okunurdu.
 *
 * Dar ekranda tek sutuna dusuyor ve sira aynen korunuyor.
 *
 * Kisisel karolar yoksa (ozet okunamadi) izgara tek elemanli kaliyor: tanitim
 * karosu tam genislikte, tek basina. Yer tutan bos kutu birakilmiyor.
 */
const HomeGrid = ({
  netStatus,
  spendTile,
}: {
  netStatus: HomeNetStatus | null;
  spendTile: HomeStatTile | null;
}) => (
  <div
    className="home-grid grid gap-4 sm:grid-cols-3"
    role="region"
    aria-label="Ozetin ve oneriler"
  >
    {netStatus && (
      <div className="sm:col-span-2">
        <HomeNetStatusCard status={netStatus} />
      </div>
    )}

    {spendTile && (
      <div>
        <HomeStatCard tile={spendTile} />
      </div>
    )}

    <div className="sm:col-span-3">
      <HomeFeatureCard tile={RECEIPT_TILE} />
    </div>
  </div>
);

/**
 * Yukleme iskeleti.
 *
 * Kutu olculeri gercek izgarayla **ayni** (`sm:col-span-*`, `min-h-36`): ozet
 * gelince sayfa ziplamiyor, karolar yerinde doluyor.
 */
const HomeGridSkeleton = () => (
  <div className="home-grid grid gap-4 sm:grid-cols-3" aria-busy="true" aria-label="Ozet yukleniyor">
    <Skeleton className="min-h-36 rounded-xl sm:col-span-2" />
    <Skeleton className="min-h-36 rounded-xl" />
    <Skeleton className="min-h-24 rounded-xl sm:col-span-3" />
  </div>
);

/**
 * Bekleyen odeme uyarisi.
 *
 * Hangi gruba gidecegini **bilmiyoruz**: ozet ucu yalnizca sayi donuyor, grup
 * kirilimi yok. Bu yuzden hedef `/groups` — kullanici hangi grupta oldugunu
 * orada bir bakista goruyor. Rastgele bir gruba gondermek, yanlis gruba
 * goturmenin yarisindan fazla ihtimalle mumkun oldugu icin daha kotu olurdu.
 */
const PendingBanner = ({ count }: { count: number }) => (
  <Link
    to="/groups"
    className="home-banner card-solid flex items-center gap-3 border-rose/25 bg-rose/6 p-3 text-sm transition-colors hover:bg-rose/10"
  >
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-rose/12">
      <TriangleAlert className="size-4 text-rose" aria-hidden />
    </span>

    <span className="min-w-0 flex-1 text-ink">
      <strong className="font-semibold">{count} bekleyen odemen var.</strong>{' '}
      <span className="text-ink-muted">Onay bekleyenleri gruplarindan gorebilirsin.</span>
    </span>

    <ArrowRight className="size-4 shrink-0 text-rose" aria-hidden />
  </Link>
);

/**
 * Sayfanin tek birincil eylemi.
 *
 * Buton `asChild` ile gercek bir `<a>`: sag tikla "yeni sekmede ac" calissin
 * ve ekran okuyucu bunu link olarak duyursun. `onClick` + `navigate` ile
 * yapilsaydi ikisi de kaybolurdu.
 *
 * Tam genislikte ve izgaranin altinda: uc karo "durum", bu satir "eylem".
 * Gradyani (`home-cta`) izgaranin ailesinden ama daha acik — sayfadaki tek
 * aydinlik yuzey, dolayisiyla goz once oraya gidiyor.
 */
const PrimaryCta = ({ hint }: { hint: string }) => (
  <div className="home-page__cta flex flex-col items-center gap-2 text-center">
    <Button asChild size="lg" className="home-cta h-12 w-full text-base">
      <Link to="/groups">
        Gruplarini Gor
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </Button>

    <p className="text-xs text-ink-muted">{hint}</p>
  </div>
);

export default HomePage;
