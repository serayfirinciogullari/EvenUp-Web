import { ArrowRight, TriangleAlert } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';

import HomeCarousel from '@/components/HomeCarousel';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import summaryApi from '../api/summary';
import useAsync from '../hooks/useAsync';
import useAuth from '../hooks/useAuth';
import { buildHomeCards } from '../utils/homeCards';

import type { HomeSummary } from '../types/models';

/**
 * Home — giris sonrasi ilk ekran.
 *
 * SAYFANIN AMACI: TUTMAK DEGIL, YONLENDIRMEK
 * ------------------------------------------
 * Home bir vitrin degil bir **giris holu**. Kullanici bu uygulamaya borcunu
 * gormeye geliyor; Home'un isi o yolu kisaltmak, uzatmak degil. Bu yuzden
 * carousel'in hemen altinda tek ve buyuk bir CTA var ("Gruplarini Gor") ve
 * sayfada onunla yarisan ikinci bir birincil eylem yok.
 *
 * Ayni sebeple Home bir **gecit** de degil: ust bardaki "Gruplar" baglantisi
 * yerinde duruyor, kullanici Home'a hic ugramadan da isine gidebiliyor ve
 * geri donebiliyor (bkz. Layout.tsx).
 *
 * HATA DURUMU SAYFAYI DUSURMUYOR
 * ------------------------------
 * Ozet cekilemezse sayfa hata ekranina donmuyor: karsilama, tanitim kartlari
 * ve CTA ayakta kaliyor, yalnizca kisisel kartlarin yerinde kucuk bir uyari
 * cikiyor. Gerekce — Home'un asil isi (kullaniciyi gruplarina yonlendirmek)
 * ozet olmadan da yapilabilir; tamamini bir istegin basarisina baglamak
 * kullaniciyi hicbir sey yapamaz halde birakirdi.
 */
const HomePage = () => {
  const { user } = useAuth();

  const fetchSummary = useCallback(() => summaryApi.getHomeSummary(), []);
  const summary = useAsync<HomeSummary>(fetchSummary, 'Ozet yuklenemedi');

  const cards = useMemo(() => buildHomeCards(summary.data), [summary.data]);

  const pending = summary.data?.pendingSettlementsCount ?? 0;

  return (
    /*
      SAYFA IKI BLOKTAN OLUSUYOR
      --------------------------
      Ust blok (karsilama + bekleyen odeme uyarisi) sayfanin **tepesine
      sabit**; orta blok (carousel + CTA) kalan alanda ortalaniyor.

      Neden ikisi ayri: karsilama bir baslik, yani sayfanin kim icin oldugunu
      soyleyen sabit bir isaret. Kartlarla birlikte ortalansaydi ekranin
      ortasinda asili durur ve baslik gibi degil, kartlarin bir parcasi gibi
      okunurdu. Diger sayfalarda da (Gruplar, Ayarlar, Admin) baslik hep
      tepede — Home'un farkli davranmasi icin bir sebep yok.

      DIKEY ORTALAMA — YALNIZCA BU SAYFADA
      ------------------------------------
      Home'un icerigi kisa; carousel sayfanin tepesine yapisik durunca ekranin
      alt yarisi bos kaliyordu. Ortalama Layout'un `<main>`ine degil buraya
      konuyor: diger uc ekran uzun listeler ve onlarin ustten baslamasi dogru.

      Yukseklik hesabi: ekran - (ust bar ~59px) - (main'in dikey dolgusu).
      Cikarilan deger bilerek birkac piksel **fazla**: eksik cikarmak sayfaya
      gereksiz bir kaydirma cubugu ekler, fazla cikarmak yalnizca birkac piksel
      daha yukari alir.

      `dvh` (`vh` degil): mobilde adres cubugu acilip kapandikca gercek gorunur
      yukseklik degisir; `vh` en buyuk hali sabitler ve icerik ekranin altina
      tasar.

      Icerik bu yuksekligi asarsa (dar ekran + hata kutusu + banner birlikte)
      kap kendiliginden buyuyor ve `justify-center` etkisiz kaliyor — yani
      hicbir sey kirpilmiyor.
    */
    <section className="home-page flex min-h-[calc(100dvh-7rem)] flex-col gap-6 sm:min-h-[calc(100dvh-8rem)]">
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

      {/* Uyari da ust blokta: bir bildirim, basligin hemen altinda beklenir. */}
      {pending > 0 && <PendingBanner count={pending} />}

      {/*
        Orta blok. `flex-1` kalan yuksekligi aliyor, `justify-center` icerigi
        o alanin ortasina koyuyor. Hata kutusu de burada: kartlarla ilgili
        oldugu icin onlarla birlikte hareket etmeli.
      */}
      <div className="home-page__body flex flex-1 flex-col justify-center gap-6">
        {/*
          Ozet okunamadiysa carousel yine ciziliyor — `buildHomeCards(null)`
          yalnizca tanitim kartlarini dondurur — ama neden eksik olduklari
          soyleniyor. Sessizce uc kart gostermek "ozetin yok" izlenimi verirdi.
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

        <HomeCarousel cards={cards} loading={summary.loading} />

        <PrimaryCta />
      </div>
    </section>
  );
};

/**
 * Bekleyen odeme uyarisi.
 *
 * Hangi gruba gidecegini **bilmiyoruz**: ozet ucu yalnizca sayi donuyor, grup
 * kirilimi yok. Bu yuzden hedef `/groups` — kullanici hangi grupta oldugunu
 * orada bir bakista goruyor. Rastgele bir gruba gondermek, yanlis gruba
 * goturmenin yarisindan fazla ihtimalle mumkun oldugu icin daha kotu olurdu.
 *
 * `role="status"` degil duz bir link: bu bir bildirim degil, sayfanin kalici
 * bir parcasi. Ekran okuyucuya kendini tekrar tekrar duyurmasi gerekmiyor.
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
 */
const PrimaryCta = () => (
  <div className="home-page__cta flex flex-col items-center gap-2 pt-2 text-center">
    <Button asChild size="lg" className="w-full sm:w-auto sm:min-w-64">
      <Link to="/groups">
        Gruplarini Gor
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </Button>

    <p className="text-xs text-ink-muted">Kim kime ne kadar borclu, hepsi orada.</p>
  </div>
);

export default HomePage;
