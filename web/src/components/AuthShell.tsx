import { motion } from 'motion/react';

import { AnimatedGradientText } from '@/components/ui/animated-gradient-text';

import type { ReactNode } from 'react';

/**
 * Giris ve kayit ekranlarinin ortak cercevesi.
 *
 * Form kartlari **solid** — cam degil. Kural icerige gore: cam yuzeyler bir
 * seyin *ozetini/durumunu* gosterir, solid yuzeyler kullanicinin *doldurdugu*
 * ya da *okudugu* alanlardir. Bir giris formu tam olarak ikincisi; saydam bir
 * zemin uzerinde metin alani okumayi zorlastirmaktan baska bir sey yapmazdi.
 *
 * Arka plandaki iki yumusak renk lekesi statik (gradyan), hareketsiz: "surekli
 * hareket eden arka plan efekti yok" kuralina uyuyor.
 */
const AuthShell = ({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) => (
  <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-cream px-4 py-10">
    {/* Dekoratif zemin. `aria-hidden` — ekran okuyucu icin bir anlami yok. */}
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage:
          'radial-gradient(60rem 30rem at 15% -10%, rgba(228,210,214,0.55), transparent 60%),' +
          'radial-gradient(45rem 25rem at 100% 110%, rgba(184,160,196,0.35), transparent 60%)',
      }}
    />

    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="auth-page relative w-full max-w-sm"
    >
      <div className="mb-6 text-center">
        <AnimatedGradientText
          className="font-display text-2xl font-semibold tracking-tight"
          colorFrom="#7A4A56"
          colorTo="#B8A0C4"
        >
          EvenUp
        </AnimatedGradientText>
      </div>

      <div className="card-solid p-6 sm:p-7">
        {/* Baslik ink + Fraunces; rose burada DEGIL (iki kanal kurali). */}
        <h1 className="text-2xl">{title}</h1>
        <p className="mt-1 mb-5 text-sm text-ink-muted">{subtitle}</p>

        {children}
      </div>

      <p className="mt-5 text-center text-sm text-ink-muted">{footer}</p>
    </motion.div>
  </div>
);

export default AuthShell;
