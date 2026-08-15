import { Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import ConfirmDialog from '@/components/ConfirmDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { getErrorMessage } from '../api/client';
import adminApi from '../api/admin';
import useAsync from '../hooks/useAsync';
import useDebouncedValue from '../hooks/useDebouncedValue';
import { formatDate } from '../utils/datetime';

import type { AdminUserListResult, User } from '../types/models';

/**
 * Kullanici yonetim tablosu — **solid** yuzey (uzerinde calisilan veri).
 *
 * ARAMA SUNUCUDA
 * --------------
 * Liste sayfalanmis; elde yalnizca 20 satir varken istemcide filtrelemek
 * "aradigin kisi 3. sayfadaysa bulunamaz" demek olurdu. Terim
 * `GET /admin/users?search=` ile gidiyor, gecikmeli (bkz. useDebouncedValue).
 *
 * TEK YAZMA ISLEMI, ONAY ARKASINDA
 * --------------------------------
 * Bu ekranin veri **degistiren** tek aksiyonu devre disi birakma/aktiflestirme
 * ve ikisi de onay modalindan geciyor. Gerekce ConfirmDialog'un basinda.
 */

const PAGE_SIZE = 20;

interface AdminUsersTableProps {
  /** Admin'in kendi ID'si: kendi satirinda kapatma butonu gosterilmez. */
  currentUserId: string;
  /** Durum degisince ozet kartlari (aktif/pasif sayilari) tazelensin diye. */
  onUserChanged: () => void;
}

type PendingAction = { user: User; action: 'disable' | 'enable' };

const AdminUsersTable = ({ currentUserId, onUserChanged }: AdminUsersTableProps) => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebouncedValue(search);

  /*
    Arama degisince sayfa basa doner. Donmezse "3. sayfadayken yeni bir terim
    yazmak" cogu zaman bos bir liste gosterirdi — sonuc 1 sayfaysa 3. sayfa
    bostur ve kullanici bunu "kayit yok" diye okur.
  */
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const fetchUsers = useCallback(
    () =>
      adminApi.listUsers({
        search: debouncedSearch.trim() || undefined,
        page,
        limit: PAGE_SIZE,
      }),
    [debouncedSearch, page]
  );

  const users = useAsync<AdminUserListResult>(fetchUsers, 'Kullanicilar yuklenemedi');

  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const closeConfirm = () => {
    setPendingAction(null);
    setActionError(null);
  };

  const runAction = () => {
    if (!pendingAction || actionPending) {
      return;
    }

    const { user, action } = pendingAction;

    setActionPending(true);
    setActionError(null);

    const request =
      action === 'disable' ? adminApi.disableUser(user.id) : adminApi.enableUser(user.id);

    void request
      .then((result) => {
        // Liste elle guncellenmiyor, yeniden isteniyor: aktif/pasif sayilari ve
        // siralamayi sunucu belirliyor (2.3'ten beri ayni desen).
        users.reload();
        onUserChanged();
        closeConfirm();

        toast.success(
          result.changed
            ? action === 'disable'
              ? 'Kullanici devre disi birakildi'
              : 'Kullanici aktiflestirildi'
            : // Islem idempotent: backend `changed: false` diyorsa satir zaten
              // istenen durumdaydi. Bunu "basarili" diye gecistirmek, listenin
              // bayat oldugunu gizlerdi.
              'Kullanici zaten bu durumdaydi',
          { description: user.email }
        );
      })
      .catch((caught: unknown) => {
        // Modal acik kalir: hata hangi satir icin alindigi belli olsun.
        setActionError(getErrorMessage(caught, 'Kullanici durumu degistirilemedi'));
      })
      .finally(() => {
        setActionPending(false);
      });
  };

  const pagination = users.data?.pagination;
  const rows = users.data?.users ?? [];

  return (
    <section className="admin-users card-solid flex flex-col gap-4 p-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg">Kullanicilar</h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            Hesaplar silinmez, devre disi birakilir: silmek gecmis harcamalari ve
            baskalarinin bakiyelerini bozardi.
          </p>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="admin-user-search">E-posta ya da isim ara</Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-muted"
              aria-hidden
            />
            <Input
              id="admin-user-search"
              className="w-full pl-8 sm:w-64"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ornek@evenup.dev"
            />
          </div>
        </div>
      </header>

      {users.loading && !users.data && <TableSkeleton />}

      {users.error && (
        <div className="state-box state-box--error p-6 text-center" role="alert">
          <p className="text-sm text-destructive">{users.error}</p>
          <Button variant="outline" className="mt-3" onClick={users.reload}>
            Tekrar dene
          </Button>
        </div>
      )}

      {!users.error && users.data && rows.length === 0 && (
        <p className="state-box placeholder p-6 text-center text-sm text-ink-muted">
          {debouncedSearch.trim()
            ? `"${debouncedSearch.trim()}" icin kullanici bulunamadi.`
            : 'Kayitli kullanici yok.'}
        </p>
      )}

      {!users.error && rows.length > 0 && (
        <div className="overflow-x-auto">
          {/* Yenileme sirasinda tablo ekranda kalir, yalnizca soluklasir:
              her tus vurusunda iskelete donmek okumayi imkansiz kilardi. */}
          <table
            className={`admin-table w-full border-collapse text-sm ${
              users.loading ? 'opacity-60' : ''
            }`}
            aria-busy={users.loading ? true : undefined}
          >
            <thead>
              <tr className="border-b border-blush/70 text-left text-ink-muted">
                <th className="py-2 pr-3 font-medium">Kullanici</th>
                <th className="py-2 pr-3 font-medium">Rol</th>
                <th className="py-2 pr-3 font-medium">Durum</th>
                <th className="py-2 pr-3 font-medium">Kayit</th>
                <th className="py-2 text-right font-medium">Islem</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  isSelf={user.id === currentUserId}
                  onAction={(action) => {
                    setActionError(null);
                    setPendingAction({ user, action });
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination && rows.length > 0 && (
        <Pagination
          page={pagination.page}
          totalPages={pagination.total_pages}
          total={pagination.total}
          label="kullanici"
          disabled={users.loading}
          onChange={setPage}
        />
      )}

      <ConfirmDialog
        open={pendingAction !== null}
        onOpenChange={(next) => (next ? undefined : closeConfirm())}
        title={
          pendingAction?.action === 'disable'
            ? 'Kullaniciyi devre disi birak'
            : 'Kullaniciyi aktiflestir'
        }
        description={
          pendingAction?.action === 'disable'
            ? `${pendingAction.user.name} (${pendingAction.user.email}) hesabini devre disi birakmak istediginize emin misiniz? Bu kisi bir daha giris yapamaz; gecmis harcamalari ve bakiyeleri oldugu gibi kalir.`
            : pendingAction
              ? `${pendingAction.user.name} (${pendingAction.user.email}) hesabini yeniden aktiflestirmek istediginize emin misiniz?`
              : ''
        }
        confirmLabel={pendingAction?.action === 'disable' ? 'Devre disi birak' : 'Aktiflestir'}
        tone={pendingAction?.action === 'disable' ? 'destructive' : 'default'}
        pending={actionPending}
        error={actionError}
        onConfirm={runAction}
      />
    </section>
  );
};

/* ------------------------------------------------------------------ satir */

const UserRow = ({
  user,
  isSelf,
  onAction,
}: {
  user: User;
  isSelf: boolean;
  onAction: (action: 'disable' | 'enable') => void;
}) => (
  <tr className="admin-table__row border-b border-blush/40 last:border-0">
    <td className="py-2.5 pr-3">
      <span className="block font-medium text-ink">{user.name}</span>
      <span className="block text-xs text-ink-muted">{user.email}</span>
    </td>

    <td className="py-2.5 pr-3">
      {user.role === 'admin' ? (
        <Badge variant="outline" className="border-rose/30 bg-rose/8 text-rose">
          Admin
        </Badge>
      ) : (
        <span className="text-ink-muted">Kullanici</span>
      )}
    </td>

    <td className="py-2.5 pr-3">
      {/* Durum yalnizca renkle degil metinle de yazili (2.3'teki kural). */}
      <Badge
        variant="outline"
        className={
          user.is_active
            ? 'border-signal-positive/30 bg-signal-positive/8 text-signal-positive'
            : 'border-destructive/30 bg-destructive/8 text-destructive'
        }
      >
        {user.is_active ? 'Aktif' : 'Pasif'}
      </Badge>
    </td>

    <td className="py-2.5 pr-3 text-ink-muted">{formatDate(user.created_at)}</td>

    <td className="py-2.5 text-right">
      {isSelf ? (
        /*
          Admin kendi hesabini kapatamaz: backend 400 doner cunku kapanan admin
          ne panele girebilir ne login olabilir. Butonu gizlemek guvenlik degil,
          calismayacak bir aksiyonu gostermemek.
        */
        <span className="text-xs text-ink-muted">Kendi hesabin</span>
      ) : user.is_active ? (
        <Button
          type="button"
          size="sm"
          variant="destructive"
          onClick={() => onAction('disable')}
          aria-label={`${user.name} hesabini devre disi birak`}
        >
          Devre Disi Birak
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onAction('enable')}
          aria-label={`${user.name} hesabini aktiflestir`}
        >
          Aktiflestir
        </Button>
      )}
    </td>
  </tr>
);

/* -------------------------------------------------------------- sayfalama */

/**
 * Sayfa numarali gezinme.
 *
 * 2.4'teki harcama listesi "daha fazla yukle" ile birikiyordu; burada bilincli
 * olarak farkli: yonetim tablosu bir **arama yuzeyi**, akis degil. Kullanici
 * "listenin devamini" degil "belirli bir kaydi" ariyor ve sayfalar arasinda
 * ileri geri gidebilmesi gerekiyor.
 */
export const Pagination = ({
  page,
  totalPages,
  total,
  label,
  disabled,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  label: string;
  disabled: boolean;
  onChange: (page: number) => void;
}) => (
  <div className="admin-pagination flex flex-wrap items-center justify-between gap-2">
    <p className="text-xs text-ink-muted" role="status">
      Sayfa {page} / {totalPages} · toplam {total} {label}
    </p>

    {/* Tek sayfalik listede gezinme butonu gosterilmiyor: ikisi de kalici
        olarak kapali duran iki buton, ekranda hicbir sey anlatmaz. */}
    {totalPages > 1 && (
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Onceki
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || page >= totalPages}
          onClick={() => onChange(page + 1)}
        >
          Sonraki
        </Button>
      </div>
    )}
  </div>
);

const TableSkeleton = () => (
  <div className="flex flex-col gap-2" aria-busy="true" aria-label="Kullanicilar yukleniyor">
    {[0, 1, 2, 3].map((index) => (
      <Skeleton className="skeleton-line h-10 w-full" key={index} />
    ))}
  </div>
);

export default AdminUsersTable;
