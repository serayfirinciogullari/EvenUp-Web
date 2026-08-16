import { Receipt } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatExpenseDate, formatFullDate } from '../utils/datetime';
import { formatCents, parseAmountToCents } from '../utils/money';

import type { ExpenseFeed } from '../hooks/useExpenseFeed';
import type { Expense, ExpenseSplitType } from '../types/models';

/**
 * "Harcamalar" sekmesi — satirlar **solid** yuzey.
 *
 * Neden solid: bu satirlar okunan veri, ozet degil. Cam zemin uzerinde uc ayri
 * bilgiyi (kim, ne zaman, ne kadar) yan yana okumak zorlasirdi
 * (bkz. index.css yuzey ayrimi).
 *
 * Dort durum yine ayri ayri: yukleniyor / hata / bos / dolu. 2.3'teki ile ayni
 * gerekce — "harcama yok" ile "harcamalar alinamadi" ayni ekran olamaz.
 */

const SPLIT_LABELS: Record<ExpenseSplitType, string> = {
  equal: 'Esit',
  exact: 'Ozel tutar',
  percentage: 'Yuzde',
};

interface ExpensesTabProps {
  feed: ExpenseFeed;
  /** Kullanicinin kendi payini vurgulamak icin. */
  currentUserId: string;
  onAddExpense: () => void;
}

const ExpensesTab = ({ feed, currentUserId, onAddExpense }: ExpensesTabProps) => {
  if (feed.loading) {
    return <ExpenseListSkeleton />;
  }

  if (feed.error && feed.expenses.length === 0) {
    return (
      <div className="state-box state-box--error card-solid p-8 text-center" role="alert">
        <p className="text-sm text-destructive">{feed.error}</p>
        <Button variant="outline" className="mt-3" onClick={feed.reload}>
          Tekrar dene
        </Button>
      </div>
    );
  }

  if (feed.expenses.length === 0) {
    return (
      <div className="state-box card-solid p-10 text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-rose/10">
          <Receipt className="size-6 text-rose" aria-hidden />
        </div>
        <h2 className="text-xl">Bu grupta henuz harcama yok.</h2>
        <p className="placeholder mx-auto mt-2 max-w-sm text-sm text-ink-muted">
          Ilk harcamayi ekleyin; bakiyeler hemen ardindan hesaplanir.
        </p>
        <Button className="mt-5" onClick={onAddExpense}>
          Harcama ekle
        </Button>
      </div>
    );
  }

  return (
    <div className="expense-list flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {feed.expenses.map((expense) => (
          <ExpenseRow key={expense.id} expense={expense} currentUserId={currentUserId} />
        ))}
      </ul>

      {/* "Daha fazla" istegi patlarsa liste ekranda kalir, hata altta gorunur. */}
      {feed.error && (
        <p className="field-error text-sm text-destructive" role="alert">
          {feed.error}
        </p>
      )}

      <ExpenseFooter feed={feed} />
    </div>
  );
};

/**
 * Tek harcama satiri. Gorevde istenen uc bilgi her satirda yazili: **kim odedi**,
 * **ne zaman**, **ne kadar**. Dorduncu satir (senin payin) opsiyonel: kullanici
 * harcamaya dahil degilse hic gosterilmiyor — "0,00 ₺" yazmak, dahil olup sifir
 * pay almak gibi okunurdu.
 */
const ExpenseRow = ({ expense, currentUserId }: { expense: Expense; currentUserId: string }) => {
  const amountCents = parseAmountToCents(expense.amount);
  const myShare = expense.shares.find((share) => share.user_id === currentUserId);
  const myShareCents = myShare ? parseAmountToCents(myShare.share_amount) : null;
  const paidByMe = expense.paid_by === currentUserId;

  return (
    <li className="expense-row card-solid flex items-start justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="expense-row__description font-medium text-ink">{expense.description}</p>

        <p className="expense-row__meta mt-0.5 text-sm text-ink-muted">
          {paidByMe ? 'Sen odedin' : `${expense.payer_name} odedi`}
          {' · '}
          <time dateTime={expense.created_at} title={formatFullDate(expense.created_at)}>
            {formatExpenseDate(expense.created_at)}
          </time>
        </p>

        <p className="expense-row__tags mt-1.5 flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="border-blush bg-surface/60 text-ink-muted">
            {expense.category}
          </Badge>
          <Badge variant="outline" className="border-blush bg-surface/60 text-ink-muted">
            {SPLIT_LABELS[expense.split_type]}
          </Badge>
          <span className="text-xs text-ink-muted">
            {expense.shares.length} kisi arasinda bolundu
          </span>
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p className="expense-row__amount text-lg font-semibold text-ink">
          {amountCents === null ? expense.amount : formatCents(amountCents)}
        </p>
        {myShareCents !== null && (
          <p className="expense-row__share text-xs text-ink-muted">
            Senin payin {formatCents(myShareCents)}
          </p>
        )}
      </div>
    </li>
  );
};

/** Sayfalama alt bilgisi: kac satir gorunuyor + "daha fazla yukle". */
const ExpenseFooter = ({ feed }: { feed: ExpenseFeed }) => {
  const { pagination } = feed;

  if (!pagination) {
    return null;
  }

  return (
    <div className="expense-list__footer mt-1 flex flex-col items-center gap-2">
      <p className="text-xs text-ink-muted" role="status">
        {feed.expenses.length} / {pagination.total} harcama
      </p>

      {pagination.has_next && (
        <Button
          type="button"
          variant="outline"
          onClick={feed.loadMore}
          disabled={feed.loadingMore}
          className="w-full sm:w-auto"
        >
          {feed.loadingMore ? 'Yukleniyor...' : 'Daha fazla yukle'}
        </Button>
      )}
    </div>
  );
};

const ExpenseListSkeleton = () => (
  <div className="flex flex-col gap-2" aria-busy="true" aria-label="Harcamalar yukleniyor">
    {[0, 1, 2].map((index) => (
      <div className="expense-row card-solid flex justify-between gap-3 p-4" key={index}>
        <div className="flex w-full flex-col gap-2">
          <Skeleton className="skeleton-line h-4 w-2/5" />
          <Skeleton className="skeleton-line h-3 w-1/4" />
        </div>
        <Skeleton className="skeleton-line h-5 w-20 shrink-0" />
      </div>
    ))}
  </div>
);

export default ExpensesTab;
