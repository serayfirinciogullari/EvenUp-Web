import { useCallback } from 'react';

import AdminGroupsTable from '@/components/AdminGroupsTable';
import AdminStatsCards from '@/components/AdminStatsCards';
import AdminUsersTable from '@/components/AdminUsersTable';
import adminApi from '../api/admin';
import useAsync from '../hooks/useAsync';
import useAuth from '../hooks/useAuth';

import type { AdminStats } from '../types/models';

/**
 * Admin paneli.
 *
 * ERISIM: rota agacinda `ProtectedRoute` -> `AdminRoute` (2.1). O kontrol
 * **UX'tir, guvenlik degil**: rol bilgisi istemcide degistirilebilir, ama o
 * durumda da bu sayfanin attigi her `/admin/*` istegi backend'de `requireAdmin`
 * tarafindan 403 ile reddedilir — ekran acilir, veri gelmez.
 *
 * SAYFANIN KAPSAMI
 * ----------------
 * Uc blok: ozet istatistikler, kullanici yonetimi (tek yazma islemi burada),
 * salt okunur grup listesi. Grup blogunda **bilincli olarak** hicbir gecis
 * yok — gerekce `AdminGroupsTable`in basinda ve docs/decisions/2.5.md icinde.
 *
 * Her blok kendi verisini cekiyor; 2.4'teki grup detayindan farkli, cunku burada
 * bloklar arasinda **tek** bagimlilik var: bir kullaniciyi devre disi birakmak
 * ozet kartlarindaki aktif/pasif sayilarini degistirir. O bag da tek bir geri
 * cagriyla kuruluyor (`stats.reload`), bloklarin tamamini sayfaya tasimadan.
 */
const AdminPage = () => {
  const { user } = useAuth();

  const fetchStats = useCallback(() => adminApi.getStats(), []);
  const stats = useAsync<AdminStats>(fetchStats, 'Istatistikler alinamadi');

  return (
    <section className="admin-page flex flex-col gap-6">
      <header>
        <h1>Admin</h1>
        <p className="mt-0.5 text-sm text-ink-muted">
          Sistem ozeti, kullanici yonetimi ve grup listesi.
        </p>
      </header>

      <AdminStatsCards stats={stats} />

      <AdminUsersTable currentUserId={user?.id ?? ''} onUserChanged={stats.reload} />

      <AdminGroupsTable />
    </section>
  );
};

export default AdminPage;
