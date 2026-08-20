import { CalendarClock } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import ActivityRow from '../components/ActivityRow';
import PendingApprovalBanner from '../components/PendingApprovalBanner';
import activityApi from '../api/activity';
import settlementsApi from '../api/settlements';
import useAsync from '../hooks/useAsync';
import useActivityFeed from '../hooks/useActivityFeed';
import { useSummaryData } from '../hooks/useAppData';
import useAuth from '../hooks/useAuth';
import { groupByDay } from '../utils/activity';

import type { PendingApproval } from '../types/models';

/**
 * Aktivite — kullanicinin **tum** gruplarindaki olaylarin birlesik akisi.
 *
 * IKI AYRI VERI KAYNAGI, IKI AYRI SORU
 * -------------------------------------
 * Sayfa iki bagimsiz istek atiyor ve bilerek birlestirmiyor:
 *   - `listPendingApprovals` -> "simdi benden ne bekleniyor?" (banner, sabit)
 *   - `useActivityFeed`      -> "ne oldu?" (akis, sayfalanmis, gecmis)
 * Ayrimin gerekcesi docs/decisions/aktivite-akisi.md icinde. Onaydan sonra
 * ikisi de tazeleniyor: onaylanan kayit hem banner'dan dusuyor hem de akista
 * yeni bir ONY satiri olarak beliriyor.
 *
 * OKUNMAMIS ROZETI — SAYFA ACILINCA SIFIRLANIR
 * ----------------------------------------------
 * Bu, `PendingApprovalBanner`deki rozet kuralinin (yalnizca Onayla/Reddet'e
 * basinca azalir) **bilerek tersi**: burasi "ne oldu" akisi, orasi "benden ne
 * bekleniyor" is listesi — ikisi ayni bildirim degil, ayri kurallar tasiyorlar.
 * Feed ilk yuklendiginde sunucuya "gordum" bildirilir ve sidebar rozetindeki
 * okunmamis kismi yerelde sifirlanir; `summary.reload()` YOK, aynen
 * optimistic-ui-duzeltme.md'deki gerekce: `reload()` `loading`i tetikler,
 * rozet bir an kaybolup geri gelirdi. Gerekce: docs/decisions/aktivite-okunma-sayaci.md.
 */
const ActivityPage = () => {
  const { user } = useAuth();
  const currentUserId = user?.id ?? '';

  const fetchPending = useCallback(() => settlementsApi.listPendingApprovals(), []);
  const pending = useAsync<PendingApproval[]>(fetchPending, 'Onay bekleyenler alinamadi');

  const feed = useActivityFeed();
  const summary = useSummaryData();

  /*
    `seenSent` bir kereden fazla tetiklenmeyi engelliyor: onay/red sonrasi
    `feed.reload()` ya da "daha fazla yukle" ayni isareti tekrar tekrar
    atmamali — sayfa basina bir kez, ilk yukleme bitince yeterli.
  */
  const seenSent = useRef(false);
  useEffect(() => {
    if (feed.loading || seenSent.current) {
      return;
    }

    seenSent.current = true;
    void activityApi.markActivitySeen().then(() => {
      summary.mutate((current) =>
        current ? { ...current, unseenActivityCount: 0 } : current
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed.loading]);

  const handleResolved = () => {
    pending.reload();
    feed.reload();
  };

  const groups = groupByDay(feed.events);

  return (
    <section className="activity-page flex flex-col gap-4">
      <header className="activity-page__head">
        <h1>Aktivite</h1>
        <p className="mt-0.5 text-sm text-ink-muted">
          Butun gruplarindaki harcama ve odeme gecmisi, tek akista.
        </p>
      </header>

      {/* Bos halde hicbir sey cizmiyor: bkz. PendingApprovalBanner. */}
      {!pending.loading && pending.data && pending.data.length > 0 && (
        <PendingApprovalBanner approvals={pending.data} onResolved={handleResolved} />
      )}

      {pending.error && (
        <p className="field-error text-sm text-destructive" role="alert">
          {pending.error}
        </p>
      )}

      <ActivityFeedBody
        loading={feed.loading}
        error={feed.error}
        groups={groups}
        currentUserId={currentUserId}
        onReload={feed.reload}
      />

      {!feed.loading && feed.events.length > 0 && (
        <ActivityFooter
          count={feed.events.length}
          total={feed.pagination?.total ?? feed.events.length}
          hasNext={feed.pagination?.has_next ?? false}
          loadingMore={feed.loadingMore}
          onLoadMore={feed.loadMore}
        />
      )}

      {feed.error && feed.events.length > 0 && (
        <p className="field-error text-sm text-destructive" role="alert">
          {feed.error}
        </p>
      )}
    </section>
  );
};

/**
 * Akisin govdesi: yukleniyor / hata (bos akista) / bos / dolu.
 *
 * Dorduncu durum yok — 2.3'ten beri projede tekrar eden kural: "hic olay yok"
 * ile "olaylar alinamadi" ayni ekran olamaz, biri sessiz biri aksiyon gerektirir.
 */
const ActivityFeedBody = ({
  loading,
  error,
  groups,
  currentUserId,
  onReload,
}: {
  loading: boolean;
  error: string | null;
  groups: ReturnType<typeof groupByDay>;
  currentUserId: string;
  onReload: () => void;
}) => {
  if (loading) {
    return <ActivitySkeleton />;
  }

  if (error && groups.length === 0) {
    return (
      <div className="state-box state-box--error card-solid p-8 text-center" role="alert">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" className="mt-3" onClick={onReload}>
          Tekrar dene
        </Button>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="state-box card-solid p-10 text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-rose/10">
          <CalendarClock className="size-6 text-rose" aria-hidden />
        </div>
        <h2 className="text-xl">Henuz bir aktivite yok.</h2>
        <p className="placeholder mx-auto mt-2 max-w-sm text-sm text-ink-muted">
          Bir gruba harcama ya da odeme ekledikce burada birikir.
        </p>
      </div>
    );
  }

  return (
    <div className="activity-feed flex flex-col gap-5">
      {groups.map((group) => (
        <div key={group.key} className="activity-day flex flex-col gap-2">
          <h2 className="activity-day__label text-xs font-semibold tracking-[0.12em] text-ink-muted">
            {group.label}
          </h2>

          <ul className="flex flex-col gap-2">
            {group.events.map((event) => (
              <ActivityRow key={event.id} event={event} currentUserId={currentUserId} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};

const ActivityFooter = ({
  count,
  total,
  hasNext,
  loadingMore,
  onLoadMore,
}: {
  count: number;
  total: number;
  hasNext: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) => (
  <div className="activity-feed__footer mt-1 flex flex-col items-center gap-2">
    <p className="text-xs text-ink-muted" role="status">
      {count} / {total} aktivite
    </p>

    {hasNext && (
      <Button
        type="button"
        variant="outline"
        onClick={onLoadMore}
        disabled={loadingMore}
        className="w-full sm:w-auto"
      >
        {loadingMore ? 'Yukleniyor...' : 'Daha fazla yukle'}
      </Button>
    )}
  </div>
);

const ActivitySkeleton = () => (
  <div className="flex flex-col gap-2" aria-busy="true" aria-label="Aktivite yukleniyor">
    <Skeleton className="skeleton-line h-3 w-16" />
    {[0, 1, 2].map((index) => (
      <div className="activity-row card-solid flex justify-between gap-3 p-3.5" key={index}>
        <div className="flex w-full items-center gap-3">
          <Skeleton className="size-9 shrink-0 rounded-lg" />
          <div className="flex w-full flex-col gap-2">
            <Skeleton className="skeleton-line h-4 w-3/5" />
            <Skeleton className="skeleton-line h-3 w-1/4" />
          </div>
        </div>
        <Skeleton className="skeleton-line h-5 w-16 shrink-0" />
      </div>
    ))}
  </div>
);

export default ActivityPage;
