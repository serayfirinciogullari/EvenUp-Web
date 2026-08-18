import { Check, HandCoins, X } from 'lucide-react';
import { useState } from 'react';

import GlassCard from '@/components/GlassCard';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getErrorMessage } from '../api/client';
import settlementsApi from '../api/settlements';
import { toneOfCents } from '../utils/balance';
import { formatExpenseDate } from '../utils/datetime';
import { formatCents, formatCentsAbsolute, parseAmountToCents } from '../utils/money';
import { dative } from '../utils/turkish';

import type { AsyncResult } from '../hooks/useAsync';
import type { BalanceResult, SettlementListResult, SettlementView } from '../types/models';
import type { SettleTarget } from './SettleUpModal';

/**
 * "Odemeler" sekmesi — **glass** yuzey (ozet/durum).
 *
 * Ekranin isi netlestirme ciktisini **cumleye** cevirmek. `from_user`,
 * `to_user`, `amount` ucluleri dogru ama okunmaz; kullanicinin sordugu soru
 * "kime ne kadar vereceğim". Bu yuzden her satir tam bir cumle:
 *
 *     Sen Deniz'e 30,00 ₺ borclusun.
 *     Ece sana 45,50 ₺ borclu.
 *     Ali, Deniz'e 12,00 ₺ borclu.
 *
 * Turkce ek (`'e` / `'a` / `'ye`) `utils/turkish.ts` icinde uretiliyor;
 * gerekcesi orada.
 *
 * AKSIYONLAR TARAFA GORE
 * ----------------------
 *   "Ode"             -> yalnizca **borclu** tarafa gorunur (kaydi o acabilir)
 *   "Onayla / Reddet" -> yalnizca **alacakli** tarafa gorunur (kaydi o kapatir)
 *
 * Butonu gizlemek bir guvenlik onlemi degil (backend her iki kurali da 403 ile
 * uyguluyor); calismayacak bir aksiyonu gostermemek — 2.3'teki davet butonuyla
 * ayni ayrim.
 */

interface BalancesTabProps {
  balances: AsyncResult<BalanceResult>;
  settlements: AsyncResult<SettlementListResult>;
  currentUserId: string;
  /** Uye adlari: bakiye satirinda `name` null olabilir (gruptan cikarilmis uye). */
  nameOf: (userId: string) => string;
  onSettle: (target: SettleTarget) => void;
  /** Onay/red sonrasi bakiyeleri ve listeyi tazelemek icin. */
  onResolved: () => void;
}

const BalancesTab = ({
  balances,
  settlements,
  currentUserId,
  nameOf,
  onSettle,
  onResolved,
}: BalancesTabProps) => {
  if (balances.loading) {
    return <BalancesSkeleton />;
  }

  if (balances.error || !balances.data) {
    return (
      <div className="state-box state-box--error card-solid p-8 text-center" role="alert">
        <p className="text-sm text-destructive">{balances.error ?? 'Bakiye alinamadi'}</p>
        <Button variant="outline" className="mt-3" onClick={balances.reload}>
          Tekrar dene
        </Button>
      </div>
    );
  }

  const pending = (settlements.data?.settlements ?? []).filter(
    (settlement) => settlement.status === 'pending'
  );

  return (
    <div className="balances flex flex-col gap-4">
      <PendingSettlements
        settlements={pending}
        currentUserId={currentUserId}
        error={settlements.error}
        onResolved={onResolved}
      />

      <Transfers
        result={balances.data}
        currentUserId={currentUserId}
        nameOf={nameOf}
        onSettle={onSettle}
      />

      <MemberBalances result={balances.data} currentUserId={currentUserId} nameOf={nameOf} />
    </div>
  );
};

/* ------------------------------------------------------------- transferler */

const Transfers = ({
  result,
  currentUserId,
  nameOf,
  onSettle,
}: {
  result: BalanceResult;
  currentUserId: string;
  nameOf: (userId: string) => string;
  onSettle: (target: SettleTarget) => void;
}) => (
  <GlassCard as="section" className="balances__transfers p-5">
    <h2 className="text-lg">Kim kime odeyecek</h2>
    <p className="mt-0.5 text-sm text-ink-muted">
      {/* Netlestirme sonucu: herkesin herkese borcu degil, en az sayida transfer. */}
      En az sayida transferle hesabi kapatan liste (bkz. netlestirme).
    </p>

    {result.transfers.length === 0 ? (
      <p className="balances__empty mt-4 rounded-md bg-ink/4 px-3 py-3 text-sm text-ink-muted">
        Tum hesaplar kapali — kimsenin kimseye borcu yok.
      </p>
    ) : (
      <ul className="mt-4 flex flex-col gap-2">
        {result.transfers.map((transfer) => {
          const cents = parseAmountToCents(transfer.amount) ?? 0;
          const iAmDebtor = transfer.from_user === currentUserId;
          const iAmCreditor = transfer.to_user === currentUserId;
          const fromName = nameOf(transfer.from_user);
          const toName = nameOf(transfer.to_user);

          return (
            <li
              key={`${transfer.from_user}-${transfer.to_user}`}
              className={`transfer-row balance--${
                iAmDebtor ? 'debt' : iAmCreditor ? 'credit' : 'settled'
              } flex flex-wrap items-center justify-between gap-2 rounded-lg border-l-4 px-3 py-2.5`}
            >
              <p className="transfer-row__sentence text-sm">
                {iAmDebtor
                  ? `Sen ${dative(toName)} ${formatCents(cents)} borclusun`
                  : iAmCreditor
                    ? `${fromName} sana ${formatCents(cents)} borclu`
                    : `${fromName}, ${dative(toName)} ${formatCents(cents)} borclu`}
              </p>

              {/* Kaydi yalnizca borclu acabilir (backend: ONLY_DEBTOR). */}
              {iAmDebtor && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    onSettle({ userId: transfer.to_user, name: toName, suggestedCents: cents })
                  }
                >
                  <HandCoins className="size-4" aria-hidden />
                  Ode
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    )}
  </GlassCard>
);

/* -------------------------------------------------------- bekleyen odemeler */

const PendingSettlements = ({
  settlements,
  currentUserId,
  error,
  onResolved,
}: {
  settlements: SettlementView[];
  currentUserId: string;
  error: string | null;
  onResolved: () => void;
}) => {
  if (error) {
    return (
      <p className="field-error card-solid p-4 text-sm text-destructive" role="alert">
        Bekleyen odemeler alinamadi: {error}
      </p>
    );
  }

  if (settlements.length === 0) {
    return null;
  }

  return (
    <section className="balances__pending card-solid p-5">
      <h2 className="text-lg">Bekleyen odemeler</h2>
      <p className="mt-0.5 text-sm text-ink-muted">
        {/* 1.7'nin kurali burada gorunur hale geliyor. */}
        Onaylanana kadar bakiyeye islenmez.
      </p>

      <ul className="mt-4 flex flex-col gap-2">
        {settlements.map((settlement) => (
          <PendingRow
            key={settlement.id}
            settlement={settlement}
            currentUserId={currentUserId}
            onResolved={onResolved}
          />
        ))}
      </ul>
    </section>
  );
};

const PendingRow = ({
  settlement,
  currentUserId,
  onResolved,
}: {
  settlement: SettlementView;
  currentUserId: string;
  onResolved: () => void;
}) => {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cents = parseAmountToCents(settlement.amount) ?? 0;
  const iAmCreditor = settlement.to_user === currentUserId;
  const iAmDebtor = settlement.from_user === currentUserId;

  const resolve = (action: 'confirm' | 'reject') => {
    if (pending) {
      return;
    }

    setPending(true);
    setError(null);

    const request =
      action === 'confirm'
        ? settlementsApi.confirmSettlement(settlement.id)
        : settlementsApi.rejectSettlement(settlement.id);

    void request
      .then(() => {
        // Bakiye ve liste yeniden isteniyor: onaydan sonra net bakiye degisir ve
        // elde guncellemek, "sunucuda ne oldu" ile "ekranda ne yaziyor" ayrisma
        // riskini acardi.
        onResolved();
      })
      .catch((caught: unknown) => {
        setError(getErrorMessage(caught, 'Odeme guncellenemedi'));
        setPending(false);
      });
  };

  return (
    <li className="pending-row rounded-lg border border-blush/70 px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="pending-row__sentence text-sm">
          {iAmCreditor
            ? `${settlement.from_name} sana ${formatCents(cents)} odedigini bildirdi`
            : iAmDebtor
              ? `${dative(settlement.to_name)} ${formatCents(cents)} odedigini bildirdin`
              : `${settlement.from_name} ${dative(settlement.to_name)} ${formatCents(cents)} odedigini bildirdi`}
          <span className="ml-1 text-xs text-ink-muted">
            · {formatExpenseDate(settlement.created_at)}
          </span>
        </p>

        {/* Onay/red yalnizca alacakliya ait (backend: ONLY_CREDITOR). */}
        {iAmCreditor ? (
          <span className="flex shrink-0 gap-2">
            <Button type="button" size="sm" disabled={pending} onClick={() => resolve('confirm')}>
              <Check className="size-4" aria-hidden />
              Onayla
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => resolve('reject')}
            >
              <X className="size-4" aria-hidden />
              Reddet
            </Button>
          </span>
        ) : (
          <span className="shrink-0 text-xs text-ink-muted" role="status">
            Onay bekleniyor
          </span>
        )}
      </div>

      {error && (
        <p className="field-error mt-1.5 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </li>
  );
};

/* --------------------------------------------------------- uye bakiyeleri */

const MemberBalances = ({
  result,
  currentUserId,
  nameOf,
}: {
  result: BalanceResult;
  currentUserId: string;
  nameOf: (userId: string) => string;
}) => (
  <section className="balances__members card-solid p-5">
    <h2 className="text-lg">Uye bakiyeleri</h2>

    <ul className="mt-3 flex flex-col gap-1.5">
      {result.balances.map((balance) => {
        const cents = parseAmountToCents(balance.net_balance) ?? 0;
        const tone = toneOfCents(cents);
        const isMe = balance.user_id === currentUserId;

        return (
          <li
            key={balance.user_id}
            className={`member-balance balance--${tone} flex items-center justify-between gap-3 rounded-lg border-l-4 px-3 py-2`}
          >
            <span className="text-sm">
              {isMe ? 'Sen' : (balance.name ?? nameOf(balance.user_id))}
            </span>
            <span className="text-sm">
              {/* Yon metinle yaziliyor, tutar isaretsiz (2.3'teki kural). */}
              <span className="text-ink-muted">
                {tone === 'credit' ? 'alacakli ' : tone === 'debt' ? 'borclu ' : 'dengede '}
              </span>
              {tone === 'settled' ? '' : formatCentsAbsolute(cents)}
            </span>
          </li>
        );
      })}
    </ul>
  </section>
);

const BalancesSkeleton = () => (
  <div className="flex flex-col gap-3" aria-busy="true" aria-label="Odemeler yukleniyor">
    <div className="card-glass flex flex-col gap-2 p-5">
      <Skeleton className="skeleton-line h-5 w-40" />
      <Skeleton className="skeleton-line h-10 w-full" />
      <Skeleton className="skeleton-line h-10 w-full" />
    </div>
  </div>
);

export default BalancesTab;
