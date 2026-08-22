import { Receipt } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { dayKeyOf, formatDayGroup, formatFullDate } from '../utils/datetime';
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
 *
 * GUNE GORE GRUPLANMIS LISTE
 * --------------------------
 * `groupByDay` Aktivite akisindaki `groupByDay` ile ayni ilkeyi tasiyor
 * (`dayKeyOf`/`formatDayGroup`, `utils/datetime.ts`) ama ayri bir fonksiyon:
 * burada ayrica **gun toplami** birikiyor, aktivite olaylarinin toplanacak bir
 * tutari yok. Tarih artik satirda degil, yalnizca grup basliginda yaziyor —
 * ikisi ayni bilgiyi tekrarlamasin diye (bkz. docs/decisions/3.19-grup-detay-ust-blok.md).
 */

/*
  Listede yalnizca iki etiket var cunku backend'de iki tip var. 'Kaca Bol' ile
  eklenen harcama burada 'Esit' gorunur — kaydedilen sey gercekten de esit
  bolusme; 'kaca bolundugu' girisi kolaylastiran bir form adimi, harcamanin
  kalici bir ozelligi degil (docs/decisions/bolusum-basitlestirme.md).
*/
const SPLIT_LABELS: Record<ExpenseSplitType, string> = {
  equal: 'esit',
  exact: 'ozel tutar',
};

/**
 * Kategori rozetindeki uc harf: once unsuzler ("market" -> "mrkt" -> "MRK",
 * "fatura" -> "ftr" -> "FTR"), unsuz sayisi 3'ten azsa (orn. "kira") baştan
 * ilk uc harfe duser. Kategori backend'de serbest metin oldugu icin
 * (bkz. AddExpenseModal.tsx) sabit bir esleme tablosu her zaman eksik kalirdi;
 * bu kural herhangi bir metin icin calisiyor.
 */
const categoryBadgeText = (category: string): string => {
  const trimmed = category.trim().replace(/\s+/g, '');

  if (!trimmed) {
    return '???';
  }

  const consonants = trimmed.replace(/[aeıioöuüAEIİOÖUÜ]/g, '');
  const source = consonants.length >= 3 ? consonants : trimmed;

  return source.slice(0, 3).toUpperCase();
};

interface ExpenseDayGroup {
  key: string;
  label: string;
  totalCents: number;
  expenses: Expense[];
}

/** Harcamalar zaten `created_at DESC` sirali geliyor (bkz. expense.model.ts),
 *  yani ayni gunun kayitlari her zaman ardisik — tek gecisli gruplama yeterli. */
const groupExpensesByDay = (
  expenses: readonly Expense[],
  now: Date = new Date()
): ExpenseDayGroup[] => {
  const groups: ExpenseDayGroup[] = [];

  for (const expense of expenses) {
    const key = dayKeyOf(expense.created_at);
    const cents = parseAmountToCents(expense.amount) ?? 0;
    const last = groups[groups.length - 1];

    if (last && last.key === key) {
      last.expenses.push(expense);
      last.totalCents += cents;
    } else {
      groups.push({
        key,
        label: formatDayGroup(expense.created_at, now),
        totalCents: cents,
        expenses: [expense],
      });
    }
  }

  return groups;
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

  const dayGroups = groupExpensesByDay(feed.expenses);

  return (
    <div className="expense-list flex flex-col gap-4">
      {dayGroups.map((group) => (
        <div key={group.key} className="expense-day-group flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3 px-1">
            <p className="text-xs font-medium tracking-[0.12em] text-ink-muted uppercase">
              {group.label}
            </p>
            <p className="text-xs font-medium text-ink-muted">{formatCents(group.totalCents)}</p>
          </div>

          <ul className="flex flex-col gap-2">
            {group.expenses.map((expense) => (
              <ExpenseRow key={expense.id} expense={expense} currentUserId={currentUserId} />
            ))}
          </ul>
        </div>
      ))}

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
 * Tek harcama satiri. Gorevde istenen bilgiler her satirda yazili: **kim
 * odedi**, **kac kisi arasinda ve nasil bolundugu**, **ne kadar**. Tarih artik
 * burada degil, grup basliginda (yukarida). Dorduncu satir (senin payin)
 * opsiyonel: kullanici harcamaya dahil degilse hic gosterilmiyor — "0,00 ₺"
 * yazmak, dahil olup sifir pay almak gibi okunurdu.
 */
const ExpenseRow = ({ expense, currentUserId }: { expense: Expense; currentUserId: string }) => {
  const amountCents = parseAmountToCents(expense.amount);
  const myShare = expense.shares.find((share) => share.user_id === currentUserId);
  const myShareCents = myShare ? parseAmountToCents(myShare.share_amount) : null;
  const paidByMe = expense.paid_by === currentUserId;

  return (
    <li className="expense-row card-solid flex items-start justify-between gap-3 p-4">
      <div className="flex min-w-0 items-start gap-3">
        {/* Kategori rozeti: renkli degil (kullanici avatarlariyla karismasin
            diye), notr bir kare — bilgi harfin kendisinde, renkte degil. */}
        <span
          className="expense-row__category flex size-9 shrink-0 items-center justify-center rounded-lg bg-ink/8 text-[0.6rem] font-semibold tracking-wide text-ink-muted"
          aria-hidden
        >
          {categoryBadgeText(expense.category)}
        </span>

        <div className="min-w-0">
          <p className="expense-row__description font-medium text-ink">{expense.description}</p>

          <p className="expense-row__meta mt-0.5 text-sm text-ink-muted">
            {paidByMe ? 'Sen odedin' : `${expense.payer_name} odedi`}
            {' · '}
            {expense.shares.length} kisi {SPLIT_LABELS[expense.split_type]}
          </p>

          {/* Tarih artik gun basliginda; ekran okuyucu icin tam zaman burada
              gizli kaliyor, gorsel bicim degisti diye bilgi kaybolmasin. */}
          <time dateTime={expense.created_at} className="sr-only">
            {formatFullDate(expense.created_at)}
          </time>
        </div>
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
