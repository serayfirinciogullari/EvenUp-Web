import { Layers, Users, Wallet } from 'lucide-react';

import GlassCard from '@/components/GlassCard';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCents, parseAmountToCents } from '../utils/money';

import type { AsyncResult } from '../hooks/useAsync';
import type { AdminStats } from '../types/models';
import type { ReactNode } from 'react';

/**
 * Ozet istatistik kartlari — **glass** yuzey.
 *
 * Yuzey secimi kural geregi: bu kartlar bir seyin **sonucunu** tasiyor, uzerinde
 * calisilan veriyi degil (bkz. index.css yuzey ayrimi). Alttaki tablolar solid.
 *
 * UC KART, UC SORU
 * ----------------
 * Gorevin istedigi uc deger: toplam kullanici, aktif grup, toplam islem hacmi.
 * `GET /admin/stats` bundan fazlasini doniyor (pasif kullanici, silinmis grup,
 * onaylanmis odeme hacmi, 7/30 gun trendi) ve bunlar karta **ikincil satir**
 * olarak giriyor — ayri birer kart yapmak, uc sorunun cevabini alti kutunun
 * icinde kaybederdi.
 *
 * Hicbir deger grup ya da kullanici bazinda kirilmiyor; backend zaten oyle bir
 * kirilim donmuyor (`GROUP BY` bilincli olarak yok, bkz. docs/decisions/1.8.md).
 */

interface AdminStatsCardsProps {
  stats: AsyncResult<AdminStats>;
}

/** NUMERIC metnini gosterime cevirir; bozuk bicimde sessizce 0 yazmaz. */
const formatVolume = (amount: string): string => {
  const cents = parseAmountToCents(amount);

  return cents === null ? 'Bilinmiyor' : formatCents(cents);
};

/**
 * Sayac bicimlendirmesi: 1234 -> "1.234".
 *
 * `toLocaleString('tr-TR')` yerine elle: `utils/money.ts` ile ayni gerekce —
 * Intl ciktisi calisma ortamina gore degisir (ICU derlemesine bagli olarak
 * ayrac degisebilir) ve ekrandaki sayi ile testteki beklenti ayrisirdi.
 */
const formatCount = (value: number): string =>
  value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');

const AdminStatsCards = ({ stats }: AdminStatsCardsProps) => {
  if (stats.loading && !stats.data) {
    return <StatsSkeleton />;
  }

  if (stats.error || !stats.data) {
    return (
      <div className="state-box state-box--error card-solid p-6 text-center" role="alert">
        <p className="text-sm text-destructive">{stats.error ?? 'Istatistikler alinamadi'}</p>
        <Button variant="outline" className="mt-3" onClick={stats.reload}>
          Tekrar dene
        </Button>
      </div>
    );
  }

  const { users, groups, expenses, settlements, trends } = stats.data;

  return (
    <div className="admin-stats grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard
        icon={<Users className="size-5 text-rose" aria-hidden />}
        label="Toplam kullanici"
        value={formatCount(users.total)}
        detail={`${users.active} aktif · ${users.inactive} pasif`}
        trend={`Son 7 gunde +${trends.last_7_days.new_users}`}
      />

      <StatCard
        icon={<Layers className="size-5 text-rose" aria-hidden />}
        label="Aktif grup"
        value={formatCount(groups.active)}
        /* Silinmis gruplar ayri gosteriliyor: "aktif" sayisinin neyi disarida
           biraktigi yazmazsa sayi eksik gorunur. */
        detail={`${groups.deleted} silinmis grup haric`}
        trend={`Son 7 gunde +${trends.last_7_days.new_groups}`}
      />

      <StatCard
        icon={<Wallet className="size-5 text-rose" aria-hidden />}
        label="Toplam islem hacmi"
        value={formatVolume(expenses.volume)}
        detail={`${formatCount(expenses.count)} harcama`}
        trend={`Onaylanmis odeme: ${formatVolume(settlements.confirmed_volume)}`}
      />
    </div>
  );
};

const StatCard = ({
  icon,
  label,
  value,
  detail,
  trend,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  trend: string;
}) => (
  <GlassCard as="article" className="stat-card flex flex-col gap-1 p-5">
    <p className="stat-card__label flex items-center gap-2 text-sm text-ink-muted">
      {icon}
      {label}
    </p>
    <p className="stat-card__value text-2xl font-semibold text-ink">{value}</p>
    <p className="stat-card__detail text-xs text-ink-muted">{detail}</p>
    <p className="stat-card__trend text-xs text-ink-muted">{trend}</p>
  </GlassCard>
);

const StatsSkeleton = () => (
  <div
    className="admin-stats grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
    aria-busy="true"
    aria-label="Istatistikler yukleniyor"
  >
    {[0, 1, 2].map((index) => (
      <div className="stat-card card-glass flex flex-col gap-2 p-5" key={index}>
        <Skeleton className="skeleton-line h-3 w-24" />
        <Skeleton className="skeleton-line skeleton-line--title h-7 w-20" />
        <Skeleton className="skeleton-line skeleton-line--short h-3 w-28" />
      </div>
    ))}
  </div>
);

export default AdminStatsCards;
