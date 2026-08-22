import { ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

import GlassCard from '@/components/GlassCard';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toneOfCents } from '../utils/balance';
import colorOfGroup from '../utils/groupColor';
import { formatCents, formatCentsAbsolute, parseAmountToCents } from '../utils/money';
import { dative } from '../utils/turkish';

import type { AsyncResult } from '../hooks/useAsync';
import type { BalanceResult } from '../types/models';
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
 *   "Odedim olarak isaretle" -> yalnizca **borclu** tarafa gorunur (kaydi o acabilir)
 *   "Hatirlat"               -> yalnizca **alacakli** tarafa gorunur (gercek gonderim yok)
 *
 * Butonu gizlemek bir guvenlik onlemi degil (backend her iki kurali da 403 ile
 * uyguluyor); calismayacak bir aksiyonu gostermemek — 2.3'teki davet butonuyla
 * ayni ayrim.
 *
 * "ONAYIN BEKLENIYOR" KARTI BURADA DEGIL
 * -----------------------------------------
 * Eskiden bu sekmenin en ustundeydi; artik grup detay sayfasinin **uc sekmede
 * ortak** ust blogunda (`GroupDetailPage.tsx` -> `PendingSettlementsCard`) —
 * yalnizca bu sekmeye girildiginde degil, onay bekleyen bir kayit varken her
 * zaman gorunmeli (bkz. docs/decisions/3.19-grup-detay-ust-blok.md).
 */

interface BalancesTabProps {
  balances: AsyncResult<BalanceResult>;
  currentUserId: string;
  /** Uye adlari: bakiye satirinda `name` null olabilir (gruptan cikarilmis uye). */
  nameOf: (userId: string) => string;
  onSettle: (target: SettleTarget) => void;
}

const BalancesTab = ({ balances, currentUserId, nameOf, onSettle }: BalancesTabProps) => {
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

  return (
    <div className="balances flex flex-col gap-4">
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

/**
 * Tek harflik, renkli baslangic — `MembersTab.tsx`teki `MemberRow` ile ayni
 * desen (ayni `colorOfGroup` karma fonksiyonu, ayni tek-harf kurali).
 * Burada ve `MemberBalances`te paylasiliyor ki bir kullanicinin rengi bu
 * sekmenin her yerinde ayni kalsin.
 */
const MemberAvatar = ({
  userId,
  name,
  size = 'default',
}: {
  userId: string;
  name: string;
  size?: 'default' | 'sm';
}) => (
  <Avatar size={size} className="shrink-0">
    <AvatarFallback
      style={{ backgroundColor: colorOfGroup(userId), color: '#fff' }}
      className="font-medium"
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </AvatarFallback>
  </Avatar>
);

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

          /*
            Gorsel satir avatar + ok + isim/tutar bloguna bolunuyor; tek bir
            cumle olarak okunmuyor. Ekran okuyucu icin eskiden gorunen sey
            (tam bir Turkce cumle) `sr-only` olarak korunuyor — bilgi kaybı
            olmasin diye, gorsel bicim degisti diye erisilebilirlik dusmesin.
          */
          const sentence = iAmDebtor
            ? `Sen ${dative(toName)} ${formatCents(cents)} borclusun`
            : iAmCreditor
              ? `${fromName} sana ${formatCents(cents)} borclu`
              : `${fromName}, ${dative(toName)} ${formatCents(cents)} borclu`;

          return (
            <li
              key={`${transfer.from_user}-${transfer.to_user}`}
              className={`transfer-row balance--${
                iAmDebtor ? 'debt' : iAmCreditor ? 'credit' : 'settled'
              } flex flex-wrap items-center justify-between gap-3 rounded-lg border-l-4 px-3 py-2.5`}
            >
              <span className="sr-only">{sentence}</span>

              <div className="flex min-w-0 items-center gap-3" aria-hidden="true">
                <span className="flex shrink-0 items-center gap-1">
                  <MemberAvatar userId={transfer.from_user} name={fromName} size="sm" />
                  <ArrowRight className="size-3.5 shrink-0 text-ink-muted" />
                  <MemberAvatar userId={transfer.to_user} name={toName} size="sm" />
                </span>

                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">
                    {iAmDebtor ? 'Sen' : fromName} → {iAmCreditor ? 'Sen' : toName}
                  </span>
                  <span className="block text-sm font-semibold text-ink">
                    {formatCents(cents)}
                  </span>
                </span>
              </div>

              {/* Kaydi yalnizca borclu acabilir (backend: ONLY_DEBTOR). */}
              {iAmDebtor && (
                <Button
                  type="button"
                  size="sm"
                  className="shrink-0"
                  onClick={() =>
                    onSettle({ userId: transfer.to_user, name: toName, suggestedCents: cents })
                  }
                >
                  Odedim olarak isaretle
                </Button>
              )}

              {/*
                Alacakli tarafa "Hatirlat": gercek bir bildirim/e-posta gonderimi
                yok (1.7'nin acik biraktigi madde, bkz. CloseAccountDialog.tsx
                "sana borclu" satiri ile ayni sinir) — bu yuzden butonun tek
                islevi durumu acikca soylemek, sessizce "gonderildi" gibi
                davranmiyor.
              */}
              {iAmCreditor && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() =>
                    toast.info(
                      `${fromName} icin hatirlatma gonderme ozelligi henuz yok, kendin ulasabilirsin`
                    )
                  }
                >
                  Hatirlat
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    )}
  </GlassCard>
);

/* --------------------------------------------------------- uye bakiyeleri */

/**
 * "Kim kime odeyecek" listesinden BILEREK farkli: orasi netlestirilmis
 * transferleri (en az sayida odemeyle hesabi kapatan yol) gosterir, burasi
 * **herkesin kendi net durumunu** — netlestirme algoritmasinin transfer
 * onerisiyle karistirilmamali, ikisi ayni veriden (`BalanceResult.balances`
 * vs `.transfers`) farkli birer gorunum.
 */
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
    <p className="text-xs font-medium tracking-[0.12em] text-ink-muted uppercase">
      Kisi bazinda bakiye
    </p>

    <ul className="mt-3 flex flex-col gap-1.5">
      {result.balances.map((balance) => {
        const cents = parseAmountToCents(balance.net_balance) ?? 0;
        const tone = toneOfCents(cents);
        const isMe = balance.user_id === currentUserId;
        const name = balance.name ?? nameOf(balance.user_id);

        return (
          <li
            key={balance.user_id}
            className={`member-balance balance--${tone} flex items-center justify-between gap-3 rounded-lg border-l-4 px-3 py-2`}
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <MemberAvatar userId={balance.user_id} name={name} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-sm text-ink">{isMe ? 'Sen' : name}</span>
                {/* Renk burada da bilgiyi tasimiyor, metin her zaman yazili (2.3'teki kural). */}
                <span
                  className={`block text-xs ${
                    tone === 'credit'
                      ? 'text-signal-positive'
                      : tone === 'debt'
                        ? 'text-destructive'
                        : 'text-ink-muted'
                  }`}
                >
                  {tone === 'credit' ? 'alacakli' : tone === 'debt' ? 'borclu' : 'dengede'}
                </span>
              </span>
            </span>

            <span className="shrink-0 text-sm text-ink">
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
