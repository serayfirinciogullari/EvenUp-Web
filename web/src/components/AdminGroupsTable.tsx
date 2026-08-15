import { Lock, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Pagination } from '@/components/AdminUsersTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import adminApi from '../api/admin';
import useAsync from '../hooks/useAsync';
import useDebouncedValue from '../hooks/useDebouncedValue';
import { formatDate } from '../utils/datetime';

import type { AdminGroupListResult } from '../types/models';

/**
 * Grup listesi — **SALT OKUNUR**.
 *
 * BU BILESENDE OLMAYAN SEYLER BILINCLI
 * ------------------------------------
 * Grup adi bir link degil. Satirda "harcamalari gor" butonu yok. Silme,
 * yeniden adlandirma, uye cikarma yok. Sebep tek cumle: **admin harcama/grup
 * icerigine mudahale etmez** (planlama dokumaninin ilkesi; uygulanisi
 * docs/decisions/1.8.md, arayuz tarafi docs/decisions/2.5.md).
 *
 * Bu yalnizca bir arayuz tercihi de degil: backend zaten gidilecek bir yer
 * dondurmuyor. `GET /admin/groups` sorgusu `expenses` tablosuna hic dokunmaz ve
 * grup icerigine giden tek uc nokta (`GET /groups/:id/expenses`) **uyelik**
 * ister — admin rolu oraya kapi acmaz. Yani buraya bir link koysaydik, tikladigi
 * anda 403 alan bir baglanti koymus olurduk.
 *
 * Niyeti gorunur kilmak icin listenin basinda kalici bir not, satirlarda ise
 * ayni cumleyi tekrarlayan bir ipucu (`title`) var: kural kodu okumayan biri
 * icin de ekranda yazili.
 */

const PAGE_SIZE = 20;

/** Notun ve satir ipucunun **tek** kaynagi: iki yerde farkli cumle olmasin. */
export const PRIVACY_NOTE =
  'Grup icerigi admin icin gizlidir: harcamalar, aciklamalar ve uye listesi bu panele hic gelmez.';

const AdminGroupsTable = () => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebouncedValue(search);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const fetchGroups = useCallback(
    () =>
      adminApi.listGroups({
        search: debouncedSearch.trim() || undefined,
        page,
        limit: PAGE_SIZE,
      }),
    [debouncedSearch, page]
  );

  const groups = useAsync<AdminGroupListResult>(fetchGroups, 'Gruplar yuklenemedi');

  const rows = groups.data?.groups ?? [];
  const pagination = groups.data?.pagination;

  return (
    <section className="admin-groups card-solid flex flex-col gap-4 p-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg">Gruplar</h2>
          <p className="mt-0.5 text-sm text-ink-muted">Salt okunur liste.</p>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="admin-group-search">Grup adi ara</Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-muted"
              aria-hidden
            />
            <Input
              id="admin-group-search"
              className="w-full pl-8 sm:w-64"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Ev Arkadaslari"
            />
          </div>
        </div>
      </header>

      {/* Kalici not — kapatilamaz, cunku bir bildirim degil, panelin kurali. */}
      <p className="admin-groups__note flex items-start gap-2 rounded-md bg-ink/4 px-3 py-2.5 text-sm text-ink-muted">
        <Lock className="mt-0.5 size-4 shrink-0 text-rose" aria-hidden />
        <span>{PRIVACY_NOTE}</span>
      </p>

      {groups.loading && !groups.data && <TableSkeleton />}

      {groups.error && (
        <div className="state-box state-box--error p-6 text-center" role="alert">
          <p className="text-sm text-destructive">{groups.error}</p>
          <Button variant="outline" className="mt-3" onClick={groups.reload}>
            Tekrar dene
          </Button>
        </div>
      )}

      {!groups.error && groups.data && rows.length === 0 && (
        <p className="state-box placeholder p-6 text-center text-sm text-ink-muted">
          {debouncedSearch.trim()
            ? `"${debouncedSearch.trim()}" icin grup bulunamadi.`
            : 'Kayitli grup yok.'}
        </p>
      )}

      {!groups.error && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table
            className={`admin-table w-full border-collapse text-sm ${
              groups.loading ? 'opacity-60' : ''
            }`}
            aria-busy={groups.loading ? true : undefined}
          >
            <thead>
              <tr className="border-b border-blush/70 text-left text-ink-muted">
                <th className="py-2 pr-3 font-medium">Grup adi</th>
                <th className="py-2 pr-3 font-medium">Uye sayisi</th>
                <th className="py-2 font-medium">Olusturulma</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((group) => (
                /*
                  Satirin tamami `title` tasiyor: fareyle uzerine gelen biri
                  neden tiklanacak bir sey olmadigini goruyor. Ad bilincli olarak
                  duz metin — `<Link>` degil.
                */
                <tr
                  key={group.id}
                  className="admin-table__row border-b border-blush/40 last:border-0"
                  title={PRIVACY_NOTE}
                >
                  <td className="py-2.5 pr-3 font-medium text-ink">{group.name}</td>
                  <td className="py-2.5 pr-3 text-ink-muted">{group.member_count} uye</td>
                  <td className="py-2.5 text-ink-muted">{formatDate(group.created_at)}</td>
                </tr>
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
          label="grup"
          disabled={groups.loading}
          onChange={setPage}
        />
      )}
    </section>
  );
};

const TableSkeleton = () => (
  <div className="flex flex-col gap-2" aria-busy="true" aria-label="Gruplar yukleniyor">
    {[0, 1, 2].map((index) => (
      <Skeleton className="skeleton-line h-10 w-full" key={index} />
    ))}
  </div>
);

export default AdminGroupsTable;
