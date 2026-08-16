import { LogOut, Settings, ShieldCheck } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { AnimatedGradientText } from '@/components/ui/animated-gradient-text';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import useAuth from '../hooks/useAuth';
import { ThemeToggle } from './ThemeToggle';

/**
 * Giris yapmis kullanicilarin ortak cercevesi: gezinme + hesap menusu.
 *
 * Admin baglantisi yalnizca admin'e gosteriliyor — bu guvenlik degil UX
 * (bkz. AdminRoute); gercek sinir backend'deki `requireAdmin`.
 *
 * MARKA ALANI
 * -----------
 * `AnimatedGradientText` yalnizca burada, logoda. Her baslikta kullanilsaydi
 * sayfa "her sey parliyor" haline gelir ve marka isareti olma ozelligini
 * kaybederdi. Sayfa basliklari duz `ink` + Fraunces.
 */

/** Ad-soyaddan iki harflik bas harf. Bos ada karsi savunmali. */
const initialsOf = (name: string | undefined): string => {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return '?';
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
};

const navLinkClass = ({ isActive }: { isActive: boolean }): string =>
  cn(
    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
    // Aktif durum rose ile isaretleniyor: "neredeyim" sorusu da etkilesim
    // kanalindan okunuyor (iki kanal kurali).
    isActive
      ? 'bg-rose/10 text-rose'
      : 'text-ink-muted hover:bg-ink/5 hover:text-ink'
  );

const Layout = () => {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="layout min-h-screen bg-cream">
      {/*
        Ust bar cream zemin uzerinde hafif saydam ve yapiskan. Blur burada
        tek bir elemanda oldugu icin (liste icinde N kez tekrarlanmiyor)
        mobilde de sorun cikarmiyor.
      */}
      <header className="layout__header sticky top-0 z-40 border-b border-ink/10 bg-cream/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 sm:gap-6 sm:px-6">
          <NavLink to="/groups" className="layout__brand shrink-0 text-lg font-semibold">
            {/*
              Renkler token uzerinden: koyu temada (2.6) `rose` acik gule
              donuyor. Sabit hex kalsaydi logonun yarisi koyu zeminde
              neredeyse gorunmez olurdu.
            */}
            <AnimatedGradientText
              className="font-display tracking-tight"
              colorFrom="var(--color-rose)"
              colorTo="var(--color-lilac)"
            >
              EvenUp
            </AnimatedGradientText>
          </NavLink>

          <nav className="layout__nav flex items-center gap-1">
            <NavLink to="/groups" className={navLinkClass}>
              Gruplar
            </NavLink>
            {isAdmin && (
              <NavLink to="/admin" className={navLinkClass}>
                Admin
              </NavLink>
            )}
            <NavLink to="/settings" className={navLinkClass}>
              Ayarlar
            </NavLink>
          </nav>

          <div className="layout__user ml-auto flex items-center gap-2">
            {/*
              Tema anahtari ust barda: bir goruntu tercihi, degistirildigi anda
              sonucu gorulen bir seydir — Ayarlar'a gomulmesi her denemede iki
              tik uzaga koyardi. Ucuncu secenek ("Sistem") yine de Ayarlar'da:
              orasi tercihe bir isim vermenin yeri (bkz. ThemeToggle.tsx).
            */}
            <ThemeToggle />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-auto gap-2 px-2 py-1.5 hover:bg-ink/5"
                  aria-label="Hesap menusu"
                >
                  <Avatar className="size-7">
                    {/* `text-white` degil `text-cream`: koyu temada rose acik
                        gule doner ve uzerindeki beyaz metin okunmaz olurdu.
                        cream iki temada da rose'un karsit tonu (>= 6.5:1). */}
                    <AvatarFallback className="bg-rose text-xs font-semibold text-cream">
                      {initialsOf(user?.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden text-sm font-medium text-ink sm:inline">
                    {user?.name}
                  </span>
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="font-normal">
                  <p className="text-sm font-medium text-ink">{user?.name}</p>
                  <p className="truncate text-xs text-ink-muted">{user?.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />

                {isAdmin && (
                  <DropdownMenuItem onSelect={() => navigate('/admin')}>
                    <ShieldCheck aria-hidden />
                    Admin paneli
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => navigate('/settings')}>
                  <Settings aria-hidden />
                  Ayarlar
                </DropdownMenuItem>

                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={handleLogout}>
                  <LogOut aria-hidden />
                  Cikis
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/*
              Menusuz de cikilabilsin: dropdown yalnizca isaretleme cihaziyla
              rahat olan bir kisayol; buton her zaman erisilebilir kaliyor ve
              mevcut testler bunu kullaniyor.
            */}
            <Button variant="outline" size="sm" onClick={handleLogout} className="hidden sm:inline-flex">
              Cikis
            </Button>
          </div>
        </div>
      </header>

      <main className="layout__main mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
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
  );
};

export default Layout;
