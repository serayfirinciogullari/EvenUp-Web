import { NavLink, Outlet } from 'react-router-dom';

import { cn } from '@/lib/utils';

/**
 * Ayarlar kabugu (2.6, yeniden tasarim -> docs/decisions/ayarlar-sayfasi.md).
 *
 * DORT SEKME, DORT ROUTE
 * -----------------------
 * `/settings/profile`, `/settings/security`, `/settings/preferences`,
 * `/settings/account` — Radix `Tabs` (durum-tabanli, GroupDetailPage'deki
 * gibi) yerine gercek nested route'lar kullanildi: sekme durumu adres
 * cubugunda kalicilasin ve dogrudan bir sekmeye baglanti verilebilsin diye.
 * Bu kabuk yalnizca sol menuyu ve `<Outlet />`u ciziyor; her sekmenin kendi
 * govdesi kendi bilesininde (bkz. components/ProfileTab.tsx vb.).
 */

const SETTINGS_TABS = [
  { to: '/settings/profile', label: 'Profil' },
  { to: '/settings/security', label: 'Guvenlik' },
  { to: '/settings/preferences', label: 'Tercihler' },
  { to: '/settings/account', label: 'Hesap' },
] as const;

const SettingsPage = () => (
  <section className="settings-page flex flex-col gap-4">
    <header className="settings-page__head">
      <p className="settings-page__eyebrow text-xs font-medium tracking-[0.14em] text-ink-muted">
        AYARLAR
      </p>
      <h1>Hesabin ve tercihlerin</h1>
    </header>

    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <nav
        aria-label="Ayarlar sekmeleri"
        className="settings-page__nav flex shrink-0 flex-row gap-1 overflow-x-auto lg:w-56 lg:flex-col lg:overflow-visible"
      >
        {SETTINGS_TABS.map((tab, index) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors',
                isActive
                  ? 'bg-rose/10 text-rose'
                  : 'text-ink-muted hover:bg-ink/5 hover:text-ink'
              )
            }
          >
            <span className="font-mono text-xs tabular-nums opacity-60" aria-hidden>
              {String(index + 1).padStart(2, '0')}
            </span>
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  </section>
);

export default SettingsPage;
