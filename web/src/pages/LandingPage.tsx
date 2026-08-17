import { ArrowRight, Receipt, ScanLine, Sparkles, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';

import GlassCard from '@/components/GlassCard';
import LandingChatPreview from '@/components/LandingChatPreview';
import LandingNetting from '@/components/LandingNetting';
import LandingReveal from '@/components/LandingReveal';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AnimatedGradientText } from '@/components/ui/animated-gradient-text';
import { Button } from '@/components/ui/button';
import { ShineBorder } from '@/components/ui/shine-border';
import useAuth from '../hooks/useAuth';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Landing — **halka acik** tanitim sayfasi (`/`).
 *
 * NEDEN GUARD YOK
 * ---------------
 * Ne `ProtectedRoute` ne `GuestRoute`. Ikincisi cazip gorunuyor ("girisi olan
 * neden tanitim gorsun?") ama `GuestRoute` bu sayfayi oturumu acik olan herkes
 * icin **yonlendirmeye** cevirirdi: paylasilan bir kok adres linki, giris yapmis
 * bir kullanicida hic acilmadan /home'a duserdi. Halka acik bir adresin herkese
 * ayni sayfayi acmasi gerekiyor. Oturumu olan kullaniciya fark, yalnizca ust
 * bardaki butonda: "Giris yap / Hemen basla" yerine "Uygulamaya don".
 *
 * HAREKET BUTCESI
 * ---------------
 * Sayfada tek bir "gosteri" var: hero'daki netlestirme animasyonu, bir kere
 * oynar (bkz. LandingNetting). Geri kalan her sey scroll'da bir kez beliren
 * yumusak bir giris (bkz. LandingReveal) ve "Neden EvenUp" bolumunde o bile
 * kisilmis durumda. Gerekce: docs/decisions/landing-page.md.
 *
 * `prefers-reduced-motion` tek noktadan yonetiliyor: her hareketli parca
 * `usePrefersReducedMotion` okuyup animasyonun **sonucunu** ciziyor.
 */

/** Bolum kabi: sayfadaki tum bolumler ayni genislik ve dikey ritimde. */
const Section = ({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) => (
  <section className={`mx-auto w-full max-w-5xl px-4 py-16 sm:px-6 sm:py-20 ${className}`}>
    {children}
  </section>
);

const LandingPage = () => {
  const { status } = useAuth();
  const authenticated = status === 'authenticated';

  return (
    <div className="landing min-h-screen bg-cream">
      <LandingHeader authenticated={authenticated} />

      <main>
        <Hero authenticated={authenticated} />
        <HowItWorks />
        <AiPreview />
        <WhyEvenUp />
        <FinalCta authenticated={authenticated} />
      </main>

      <footer className="border-t border-ink/10">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 px-4 py-8 text-center sm:px-6">
          <p className="font-display text-sm font-semibold text-ink">EvenUp</p>
          <p className="text-xs text-ink-muted">
            Arkadas hesaplarini fis fotografindan kapatan uygulama.
          </p>
        </div>
      </footer>
    </div>
  );
};

/**
 * Halka acik ust bar.
 *
 * `Layout`in ust bari kullanilamaz: orasi oturum bilgisi, cikis ve gezinme
 * tasiyor ve `ProtectedRoute` altinda yasiyor. Buradaki bar bilerek cok daha
 * sade — ziyaretcinin verecegi tek karar var, gezinmesi gereken bir yer yok.
 */
const LandingHeader = ({ authenticated }: { authenticated: boolean }) => (
  <header className="landing__header sticky top-0 z-40 border-b border-ink/10 bg-cream/85 backdrop-blur-md">
    <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
      <Link to="/" className="shrink-0 text-lg font-semibold">
        <AnimatedGradientText
          className="font-display tracking-tight"
          colorFrom="var(--color-rose)"
          colorTo="var(--color-lilac)"
        >
          EvenUp
        </AnimatedGradientText>
      </Link>

      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />

        {authenticated ? (
          <Button asChild size="lg">
            <Link to="/home">Uygulamaya don</Link>
          </Button>
        ) : (
          <>
            <Button asChild variant="ghost" size="lg">
              <Link to="/login">Giris yap</Link>
            </Button>
            <Button asChild size="lg">
              <Link to="/register">Hemen basla</Link>
            </Button>
          </>
        )}
      </div>
    </div>
  </header>
);

/**
 * Hero.
 *
 * Sol tarafta soz, sagda kanit: baslik urunun vaadini yaziyor, animasyon ayni
 * cumleyi gosteriyor. Genis ekranda yan yana; dar ekranda animasyon **metnin
 * altina** duser, cunku telefonda ilk ekranda gorunmesi gereken sey CTA.
 */
const Hero = ({ authenticated }: { authenticated: boolean }) => (
  <div className="relative overflow-hidden">
    {/* Dekoratif zemin — AuthShell ile ayni desen: statik, hareketsiz. */}
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage:
          'radial-gradient(55rem 28rem at 12% -15%, color-mix(in srgb, var(--color-blush) 55%, transparent), transparent 60%),' +
          'radial-gradient(40rem 22rem at 95% 10%, color-mix(in srgb, var(--color-lilac) 30%, transparent), transparent 60%)',
      }}
    />

    <Section className="relative">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
        <LandingReveal>
          <h1 className="max-w-xl text-balance">Arkadas hesabi, tartismaya donusmesin.</h1>

          <p className="mt-4 max-w-xl text-base text-ink-muted sm:text-lg">
            Fisin fotografini cek; kalemleri EvenUp ayirsin, borclari netlestirsin. Yedi ayri
            borc, uc odemeye insin — kim kime ne kadar verecek, tek bakista belli olsun.
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            {authenticated ? (
              <Button asChild size="lg" className="h-11 px-6 text-base">
                <Link to="/home">
                  Uygulamaya don
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild size="lg" className="h-11 px-6 text-base">
                  <Link to="/register">
                    Hemen basla
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="h-11 px-6 text-base">
                  <Link to="/login">Giris yap</Link>
                </Button>
              </>
            )}
          </div>
        </LandingReveal>

        {/*
          Animasyon **glass** yuzeyde: bir hesabin sonucunu gosteriyor, yani
          index.css'teki yuzey kuralina gore ozet/durum yuzeyi. Imza cerceve de
          (ShineBorder) bu yuzden burada dogru yerde.
        */}
        <LandingReveal delay={0.1}>
          <GlassCard className="p-4 sm:p-6">
            <LandingNetting />
            <p className="mt-2 text-center text-xs text-ink-muted">
              7 ayri borc · 3 odemeye indi
            </p>
          </GlassCard>
        </LandingReveal>
      </div>
    </Section>
  </div>
);

interface Step {
  title: string;
  description: string;
  icon: LucideIcon;
}

const STEPS: readonly Step[] = [
  {
    title: 'Fisi cek',
    description: 'Market fisini ya da adisyonu fotografla, gruba birak. Elle kalem girmek yok.',
    icon: ScanLine,
  },
  {
    title: 'AI duzenlesin',
    description:
      'Kalemler, tutarlar ve kimin ne aldigi otomatik cikarilsin. Yanlissa tek cumleyle duzelt.',
    icon: Sparkles,
  },
  {
    title: 'Hesap kapansin',
    description:
      'Borclar netlessin, odemeyi isaretle, karsi taraf onaylasin. Grup dengede kalsin.',
    icon: Wallet,
  },
];

/**
 * Nasil calisir — uc adim.
 *
 * Kartlar sirayla beliriyor (`delay` kademeli): sira bir bilgi tasiyor, cunku
 * bunlar birbirinin yerine gecebilecek uc ozellik degil, birbirini takip eden
 * uc adim. Hover'da hafif kalkma CSS gecisiyle; `prefers-reduced-motion`
 * altinda index.css'teki global kural onu zaten durduruyor.
 */
const HowItWorks = () => (
  <Section>
    <LandingReveal className="text-center">
      <h2>Nasil calisir</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm text-ink-muted">
        Uc adim. Ilk ikisi otuz saniye, ucuncusu zaten kendiliginden oluyor.
      </p>
    </LandingReveal>

    <div className="mt-10 grid gap-4 sm:grid-cols-3">
      {STEPS.map((step, index) => (
        <LandingReveal key={step.title} delay={index * 0.12}>
          <article className="card-solid h-full p-5 transition-transform duration-200 hover:-translate-y-1">
            <span className="flex size-10 items-center justify-center rounded-xl bg-rose/10">
              <step.icon className="size-5 text-rose" aria-hidden />
            </span>

            {/* Adim numarasi metinde: sira yalnizca konumdan okunmasin. */}
            <p className="mt-4 text-xs font-medium tracking-[0.14em] text-ink-muted uppercase">
              {index + 1}. adim
            </p>
            <h3 className="mt-1 text-base font-semibold text-ink">{step.title}</h3>
            <p className="mt-2 text-sm text-ink-muted">{step.description}</p>
          </article>
        </LandingReveal>
      ))}
    </div>
  </Section>
);

/** AI onizlemesi — statik mockup, isleyen bir demo degil (bkz. bilesen). */
const AiPreview = () => (
  <Section>
    <div className="grid items-center gap-10 lg:grid-cols-2">
      <LandingReveal>
        <h2>Fisi anlayan bir sohbet</h2>
        <p className="mt-3 max-w-md text-sm text-ink-muted">
          Harcamayi forma doldurmuyorsun, anlatiyorsun. "Temizlik benim degil, sil" demek
          yetiyor; paylar aninda yeniden hesaplaniyor ve grup herkesin gozu onunde guncelleniyor.
        </p>
        <p className="mt-4 max-w-md text-xs text-ink-muted">
          Asagidaki gorunum bir ornek. Sohbet arayuzu henuz yayinda degil — bugun harcamalari
          elle ekleyip esit ya da ozel bolusebiliyorsun.
        </p>
      </LandingReveal>

      <LandingReveal delay={0.1}>
        <LandingChatPreview />
      </LandingReveal>
    </div>
  </Section>
);

const REASONS: readonly { title: string; description: string; icon: LucideIcon }[] = [
  {
    title: 'Fis okuyan bir asistan',
    description:
      'Diger uygulamalarda her kalemi elle girersin. Burada fisi biraktigin yerde kaliyorsun; kalemler oradan cikiyor.',
    icon: Receipt,
  },
  {
    title: 'En az sayida odeme',
    description:
      'Diger uygulamalar "kim kime borclu" listesini oldugu gibi onune koyar. EvenUp borclari netlestirip odeme sayisini en aza indirir.',
    icon: Wallet,
  },
  {
    title: 'Odeme, onaylanana kadar kapanmaz',
    description:
      '"Gonderdim" demek yetmiyor. Karsi taraf onaylayana kadar odeme bekliyor gorunuyor, hesap da oyle.',
    icon: Sparkles,
  },
];

/**
 * Neden EvenUp — bilerek **sakin** bolum.
 *
 * Sayfadaki tek is bu bolumde degisiyor: buraya kadar amac ilgi cekmekti,
 * burada amac **guven**. Bu yuzden kademeli giris, hover kalkmasi ve ikon
 * animasyonu yok; blok tek parca halinde bir kez beliriyor ve oyle duruyor.
 * Gerekce: docs/decisions/landing-page.md.
 *
 * Rakip ismi gecmiyor ("diger uygulamalar"): isim vermek karsilastirmayi
 * dogrulanmasi gereken bir iddiaya cevirir ve sayfanin isi o degil.
 */
const WhyEvenUp = () => (
  <Section>
    <LandingReveal>
      <div className="mx-auto max-w-3xl">
        <h2 className="text-center">Neden EvenUp</h2>

        <ul className="mt-8 flex flex-col gap-5">
          {REASONS.map((reason) => (
            <li key={reason.title} className="flex gap-4">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-rose/10">
                <reason.icon className="size-4 text-rose" aria-hidden />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-ink">{reason.title}</h3>
                <p className="mt-1 text-sm text-ink-muted">{reason.description}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </LandingReveal>
  </Section>
);

/**
 * Son CTA.
 *
 * ShineBorder burada **dogrudan** kullaniliyor — GlassCard disinda tek yer.
 * Kural ("parilti = glass") bilerek bir kez esneyecek: bu, sayfanin son ve tek
 * amaci olan butonu; hover'da cerceve canlaniyor ve altina sicak bir hale
 * dusuyor. Kuralin amaci pariltinin her yere yayilmasini onlemekti, burada
 * yayilma yok — sayfada tek bir buton var. Karar docs/decisions/landing-page.md
 * icinde kayitli.
 */
const FinalCta = ({ authenticated }: { authenticated: boolean }) => (
  <Section className="pb-24 text-center">
    <LandingReveal>
      <h2>Bir sonraki hesabi kimse hesaplamasin.</h2>
      <p className="mx-auto mt-3 max-w-md text-sm text-ink-muted">
        Grubu kur, fisi at, gerisini birak. Kayit birkac saniye.
      </p>

      <div className="landing-cta group relative mx-auto mt-8 inline-block rounded-xl">
        {/* Hover/odakta beliriyor; sabit degil — sayfa yuklendiginde parlamiyor. */}
        <ShineBorder
          borderWidth={2}
          duration={8}
          shineColor={['var(--color-blush)', 'var(--color-lilac)', 'var(--color-rose)']}
          className="rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100"
        />

        <Button asChild size="lg" className="h-13 rounded-xl px-8 text-base">
          <Link to={authenticated ? '/home' : '/register'}>
            {authenticated ? 'Uygulamaya don' : 'Hemen basla'}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </Button>
      </div>

      {!authenticated && (
        <p className="mt-4 text-sm text-ink-muted">
          Hesabin var mi?{' '}
          <Link to="/login" className="font-medium text-rose underline-offset-4 hover:underline">
            Giris yap
          </Link>
        </p>
      )}
    </LandingReveal>
  </Section>
);

export default LandingPage;
