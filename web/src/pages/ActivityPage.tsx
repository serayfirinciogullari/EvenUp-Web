import { CalendarClock } from 'lucide-react';
import { useCallback } from 'react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import PendingApprovalBanner from '../components/PendingApprovalBanner';
import settlementsApi from '../api/settlements';
import useAsync from '../hooks/useAsync';
import useActivityFeed from '../hooks/useActivityFeed';
import useAuth from '../hooks/useAuth';
import {
  ACTIVITY_BADGES,
  ACTIVITY_BADGE_TITLES,
  activitySentence,
  groupByDay,
} from '../utils/activity';
import { formatTime } from '../utils/datetime';
import { formatCents, parseAmountToCents } from '../utils/money';

import type { ActivityEvent, ActivityKind, PendingApproval } from '../types/models';

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
 */
const ActivityPage = () => {
  const { user } = useAuth();
  const currentUserId = user?.id ?? '';

  const fetchPending = useCallback(() => settlementsApi.listPendingApprovals(), []);
  const pending = useAsync<PendingApproval[]>(fetchPending, 'Onay bekleyenler alinamadi');

  const feed = useActivityFeed();

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

/** Rozet turune gore zemin. Bilgi rengi tasimiyor — kisaltma zaten yazili,
 *  ton yalnizca goze tur farkini hizli gostermek icin (bkz. 2.3 kurali). */
const BADGE_TONE: Record<ActivityKind, string> = {
  expense_created: 'bg-ink/6 text-ink-muted',
  expense_edited: 'bg-ink/6 text-ink-muted',
  settlement_created: 'bg-amber-surface text-amber border border-amber/25',
  settlement_confirmed: 'bg-signal-positive/10 text-signal-positive',
  settlement_rejected: 'bg-signal-negative/10 text-signal-negative',
};

const ActivityRow = ({
  event,
  currentUserId,
}: {
  event: ActivityEvent;
  currentUserId: string;
}) => {
  const cents = parseAmountToCents(event.amount) ?? 0;

  return (
    <li className="activity-row card-solid flex items-start justify-between gap-3 p-3.5">
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={`activity-row__badge mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg text-[0.65rem] font-semibold tracking-wide ${BADGE_TONE[event.kind]}`}
          title={ACTIVITY_BADGE_TITLES[event.kind]}
        >
          {ACTIVITY_BADGES[event.kind]}
        </span>

        <div className="min-w-0">
          <p className="activity-row__sentence text-sm font-medium text-ink">
            {activitySentence(event, currentUserId)}
          </p>
          <p className="activity-row__meta mt-0.5 text-xs text-ink-muted">
            {event.group_name}
            {' · '}
            <time dateTime={event.occurred_at}>{formatTime(event.occurred_at)}</time>
          </p>
        </div>
      </div>

      <p className="activity-row__amount shrink-0 text-sm font-semibold text-ink">
        {formatCents(cents)}
      </p>
    </li>
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
