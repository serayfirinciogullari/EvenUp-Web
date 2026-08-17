import { Menu } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import Sidebar from '@/components/Sidebar';
import { AnimatedGradientText } from '@/components/ui/animated-gradient-text';
import { Button } from '@/components/ui/button';
import useSidebarCollapsed from '../hooks/useSidebarCollapsed';

/**
 * Giris yapmis kullanicilarin ortak cercevesi: **sol sidebar** + icerik.
 *
 * Onceki surumde gezinme ust yatay bardaydi. Tasima gerekcesi ve sidebar'in
 * uc hali (genis / dar / mobil katman) `Sidebar.tsx`te anlatiliyor. Burada
 * kalan is duzen ve iki durum:
 *
 *   - `collapsed`  : kullanicinin kalici tercihi (localStorage).
 *   - `mobileOpen` : yalnizca dar ekranda anlamli, gecici.
 *
 * SAYFA GENISLIGI DEGISMEDI
 * -------------------------
 * `<main>` hala `max-w-5xl` ve ortalanmis; sayfalarin hicbiri sidebar'i
 * bilmiyor. Tasima, icerik ile gezinmeyi birbirinden ayirmayi bozmadi.
 */
const Layout = () => {
  const location = useLocation();
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  const [mobileOpen, setMobileOpen] = useState(false);

  /*
    Rota degisince katman kapaniyor. Kapanma `NavLink`in `onClick`inde de var
    (`onNavigate`), ama tek basina yeterli degil: sayfa icindeki bir baglanti
    ya da geri tusu de rotayi degistirebiliyor ve katman acik kalirdi.
  */
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <div className="layout flex min-h-screen bg-cream">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        mobileOpen={mobileOpen}
        onNavigate={() => setMobileOpen(false)}
      />

      {/*
        Karartma yalnizca katman acikken ve yalnizca dar ekranda. Tiklaninca
        kapaniyor; `aria-hidden` cunku ayni isi yapan gorunur bir kapatma yolu
        (Escape / hamburger) zaten var ve ekran okuyucuya bos bir buton
        duyurmanin anlami yok.
      */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobil ust bar: yalnizca hamburger ve marka. Gezinmenin tamami
            sidebar'da; burada ikinci bir menu kurmak iki bakim yeri olurdu. */}
        <header className="layout__header sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-ink/10 bg-cream/85 px-4 backdrop-blur-md lg:hidden">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setMobileOpen(true)}
            aria-label="Menuyu ac"
            aria-expanded={mobileOpen}
            className="hover:bg-ink/5"
          >
            <Menu aria-hidden />
          </Button>

          <AnimatedGradientText
            className="font-display text-lg font-semibold tracking-tight"
            colorFrom="var(--color-rose)"
            colorTo="var(--color-lilac)"
          >
            EvenUp
          </AnimatedGradientText>
        </header>

        <main className="layout__main mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
          {/*
            Sayfa gecisi: yumusak fade + kucuk yukari kayma. Sure kisa (180ms)
            — gecis fark edilsin ama gezinmeyi yavaslatmasin. `key` olarak yol
            kullaniliyor ki her rota degisiminde yeniden oynasin.
          */}
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
};

export default Layout;
