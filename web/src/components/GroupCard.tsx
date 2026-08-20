import { Check, Link2, Plus, Users } from 'lucide-react';
import { motion } from 'motion/react';
import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';

import GlassCard from '@/components/GlassCard';
import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NumberTicker } from '@/components/ui/number-ticker';
import { Skeleton } from '@/components/ui/skeleton';
import { getErrorMessage } from '../api/client';
import groupsApi from '../api/groups';
import useAsync from '../hooks/useAsync';
import { lastActivitySentence } from '../utils/activity';
import { viewForUser } from '../utils/balance';
import { formatRelativeTime } from '../utils/datetime';
import { colorOfGroup } from '../utils/groupColor';
import { groupPath } from '../utils/groupPath';
import { buildJoinUrl, copyToClipboard } from '../utils/invite';
import { formatCentsAbsolute } from '../utils/money';
import AddExpenseModal from './AddExpenseModal';

import type { MouseEvent } from 'react';
import type { BalanceResult, GroupMember, GroupSummary } from '../types/models';

/**
 * Grup listesi karti — **satir**, "kart izgarasi" degil.
 *
 * NEDEN TAM GENISLIK SATIR
 * -------------------------
 * Onceki surumde kartlar bir izgarada yan yanaydi ve her biri kendi basina bir
 * ozetti. Yeni tasarim listeyi tek bir **taranan** akis olarak kuruyor: avatar
 * yigini, ad, son hareket ve bakiye ayni goz hizasinda — kullanici gruplarini
 * yukaridan asagi okuyor, bir izgarada gezinmiyor. Gerekce:
 * docs/decisions/gruplar-kart-tasarimi.md.
 *
 * KARTIN TAMAMI NEDEN TIKLANABILIR — VE NEDEN SARMALAYICI BIR <a> DEGIL
 * ---------------------------------------------------------------------
 * Ayni "stretched link" deseni 2.3'ten korunuyor: gorunmez `::after` katmani
 * kartin tamamini kapliyor, gercek link yalnizca baslikta. Uzerinde kalmasi
 * gereken interaktif ogeler (davet butonu, "Harcama ekle", "Tekrar dene")
 * `relative z-10` tasiyor — boylece ayrica `stopPropagation` cagirmaya gerek
 * kalmiyor, z-index sirasi zaten tiklamayi dogru yere yonlendiriyor.
 *
 * BAKIYE NEDEN KART BASINA AYRI ISTEK
 * -----------------------------------
 * Degismedi: backend'de "tum gruplarin bakiyesi" diye toplu bir uc nokta yok
 * (docs/decisions/1.7.md). Istek kartin kendi icinde.
 *
 * "HARCAMA EKLE" NEDEN GRUBA GIRMEDEN CALISIYOR
 * -----------------------------------------------
 * `GET /groups` satiri yalnizca `member_count` tasiyor, tam uye listesini
 * degil (formu doldurmak icin gereken "kim odedi" secenekleri ve pay
 * satirlari icin uye kimligi/adi gerekiyor). Bu yuzden butona basildiginda
 * `GET /groups/:id` **anlik olarak** cekiliyor, sonra modal aciliyor. Bunu
 * `GET /groups`e tum uye listesini eklemek yerine yapmak bilincli: her grup
 * icin her zaman butun uye listesini tasimak, listenin ana yukunu (tek istek,
 * kucuk govde) sokup her acilista kullanilmayacak veri indirmek olurdu —
 * gerekce: docs/decisions/gruplar-kart-tasarimi.md.
 */

interface GroupCardProps {
  group: GroupSummary;
  currentUserId: string;
  /** Karttan hizli harcama eklendikten sonra listeyi tazelemek icin — son
   *  hareket satirinin ve bekleyen-onay rozetinin guncellenmesi bundan gecer. */
  onExpenseAdded: () => void;
}

type InviteState =
  | { status: 'idle' }
  | { status: 'pending' }
  /** Panoya yazildi. */
  | { status: 'copied'; url: string }
  /** Pano erisilemedi; link ekranda gosterilip elle kopyalanacak. */
  | { status: 'manual'; url: string }
  | { status: 'error'; message: string };

type ExpenseFlow =
  | { status: 'closed' }
  | { status: 'loading' }
  | { status: 'open'; members: GroupMember[] }
  | { status: 'error'; message: string };

/** MembersTab'daki ayni ifadeyle ayni: bas harf, yoksa "?". */
const initialOf = (name: string): string => name.trim().charAt(0).toUpperCase() || '?';

const GroupCard = ({ group, currentUserId, onExpenseAdded }: GroupCardProps) => {
  const fetchBalances = useCallback(() => groupsApi.getGroupBalances(group.id), [group.id]);
  const balances = useAsync<BalanceResult>(fetchBalances, 'Bakiye alinamadi');

  const [invite, setInvite] = useState<InviteState>({ status: 'idle' });
  const [expenseFlow, setExpenseFlow] = useState<ExpenseFlow>({ status: 'closed' });

  const handleInvite = async () => {
    if (invite.status === 'pending') {
      return;
    }

    setInvite({ status: 'pending' });

    try {
      const result = await groupsApi.createInvite(group.id);
      const url = buildJoinUrl(result.invite.code);
      const copied = await copyToClipboard(url);

      setInvite(copied ? { status: 'copied', url } : { status: 'manual', url });
    } catch (caught) {
      setInvite({ status: 'error', message: getErrorMessage(caught, 'Davet linki alinamadi') });
    }
  };

  const openExpenseFlow = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();

    if (expenseFlow.status === 'loading') {
      return;
    }

    setExpenseFlow({ status: 'loading' });

    try {
      const detail = await groupsApi.getGroup(group.id);
      setExpenseFlow({ status: 'open', members: detail.members });
    } catch (caught) {
      setExpenseFlow({
        status: 'error',
        message: getErrorMessage(caught, 'Grup bilgisi alinamadi'),
      });
    }
  };

  const closeExpenseFlow = () => setExpenseFlow({ status: 'closed' });

  const handleExpenseCreated = () => {
    // Bu grubun bakiyesi degisti (2.4: netlestirme istemcide tekrarlanmaz,
    // tam yeniden istek). Listenin geri kalani (son hareket, bekleyen onay
    // rozeti) `onExpenseAdded` uzerinden sayfa seviyesinde tazeleniyor.
    balances.reload();
    onExpenseAdded();
    closeExpenseFlow();
  };

  const overflowCount = group.member_count - group.member_preview.length;

  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
    >
      {/* `group` = Tailwind hover grubu: kartin herhangi bir yerinde hover,
          basligi renklendirerek nereye gidilecegini soyluyor. */}
      <GlassCard
        as="article"
        className="group group-card flex flex-col flex-wrap gap-4 p-5 sm:flex-row sm:items-center"
      >
        <AvatarGroup className="shrink-0">
          {group.member_preview.map((member) => (
            <Avatar key={member.user_id}>
              <AvatarFallback
                style={{ backgroundColor: colorOfGroup(member.user_id), color: '#fff' }}
                className="font-medium"
              >
                {initialOf(member.name)}
              </AvatarFallback>
            </Avatar>
          ))}
          {overflowCount > 0 && <AvatarGroupCount>+{overflowCount}</AvatarGroupCount>}
        </AvatarGroup>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="group-card__title text-lg leading-tight">
              <Link
                to={groupPath(group)}
                className="rounded-sm transition-colors after:absolute after:inset-0 after:rounded-[inherit] after:content-[''] group-hover:text-rose"
              >
                {group.name}
              </Link>
            </h2>

            <span className="group-card__meta flex items-center gap-1 text-sm text-ink-muted">
              <Users className="size-3.5 shrink-0" aria-hidden />
              {group.member_count} kisi
            </span>

            {group.role === 'owner' && (
              <Badge variant="outline" className="shrink-0 border-rose/30 bg-rose/8 text-rose">
                Sahip
              </Badge>
            )}

            {/* Onay bekleyen bir odeme varsa gorunur — bkz. docs/decisions/gruplar-kart-tasarimi.md. */}
            {group.has_pending_incoming && (
              <Badge
                variant="outline"
                className="group-card__pending shrink-0 border-amber/25 bg-amber-surface text-amber"
              >
                ONAY BEKLIYOR
              </Badge>
            )}
          </div>

          <p className="group-card__activity mt-1 truncate text-sm text-ink-muted">
            {group.last_activity
              ? `${formatRelativeTime(group.last_activity.occurred_at)} · ${lastActivitySentence(group.last_activity, currentUserId)}`
              : 'Henuz hareket yok'}
          </p>
        </div>

        <div className="relative z-10 flex shrink-0 flex-wrap items-center justify-end gap-3">
          <BalanceCell balances={balances} currentUserId={currentUserId} />

          <div className="flex items-center gap-2">
            {/*
              Davet uretmeyi yalnizca owner yapabilir; uye cagirirsa backend 403
              doner (1.4). Butonu gizlemek bir guvenlik onlemi degil — calismayacak
              bir aksiyonu gostermemek. Ikon-yalnizca: satirda yer dar, "Harcama
              ekle" asil eylem.
            */}
            {group.role === 'owner' && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Davet linkini kopyala"
                onClick={() => void handleInvite()}
                disabled={invite.status === 'pending'}
                className="border-rose/25 bg-surface/60 text-rose hover:bg-rose/10 hover:text-rose"
              >
                {invite.status === 'copied' ? (
                  <Check className="size-4" aria-hidden />
                ) : (
                  <Link2 className="size-4" aria-hidden />
                )}
              </Button>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={(event) => void openExpenseFlow(event)}
              disabled={expenseFlow.status === 'loading'}
              className="border-rose/25 bg-surface/60 text-rose hover:bg-rose/10 hover:text-rose"
            >
              <Plus className="size-4" aria-hidden />
              {expenseFlow.status === 'loading' ? 'Aciliyor...' : 'Harcama ekle'}
            </Button>
          </div>
        </div>

        {invite.status === 'copied' && (
          <p className="group-card__note relative z-10 basis-full text-xs text-ink-muted" role="status">
            Davet linki panoya kopyalandi.
          </p>
        )}

        {invite.status === 'manual' && (
          <p className="group-card__note relative z-10 basis-full text-xs text-ink-muted" role="status">
            Pano kullanilamadi, linki elle kopyalayin:{' '}
            <code className="group-card__link block break-all text-[11px] text-ink">{invite.url}</code>
          </p>
        )}

        {invite.status === 'error' && (
          <p className="field-error relative z-10 basis-full text-xs text-destructive" role="alert">
            {invite.message}
          </p>
        )}

        {expenseFlow.status === 'error' && (
          <p className="field-error relative z-10 basis-full text-xs text-destructive" role="alert">
            {expenseFlow.message}
          </p>
        )}
      </GlassCard>

      <AddExpenseModal
        open={expenseFlow.status === 'open'}
        onOpenChange={(open) => {
          if (!open) {
            closeExpenseFlow();
          }
        }}
        groupId={group.id}
        members={expenseFlow.status === 'open' ? expenseFlow.members : []}
        currentUserId={currentUserId}
        onCreated={handleExpenseCreated}
      />
    </motion.div>
  );
};

/**
 * Bakiye hucresi. Uc durumu ayri gosteriyor; ozellikle **hata** durumunda
 * "0,00 ₺" gostermek yanlis olurdu — bilinmeyen bakiye ile dengede olan bakiye
 * ayni sey degil.
 */
const BalanceCell = ({
  balances,
  currentUserId,
}: {
  balances: ReturnType<typeof useAsync<BalanceResult>>;
  currentUserId: string;
}) => {
  if (balances.loading) {
    return (
      <div className="group-card__balance rounded-lg border-l-4 border-ink/10 bg-ink/4 px-3 py-2.5">
        <Skeleton className="skeleton-line h-5 w-24" aria-label="Bakiye yukleniyor" />
        <Skeleton className="skeleton-line mt-1.5 h-3 w-20" />
      </div>
    );
  }

  if (balances.error || !balances.data) {
    return (
      <p className="group-card__balance group-card__balance--unknown rounded-lg border-l-4 border-ink/15 bg-ink/4 px-3 py-2.5 text-sm text-ink-muted">
        Bakiye su an alinamadi
        <button
          type="button"
          className="link-button relative z-10 ml-2 text-rose underline underline-offset-2"
          onClick={balances.reload}
        >
          Tekrar dene
        </button>
      </p>
    );
  }

  const view = viewForUser(balances.data.balances, currentUserId);

  return (
    <p
      className={`group-card__balance balance--${view.tone} flex flex-col gap-0.5 rounded-lg border-l-4 px-3 py-2.5`}
    >
      {/*
        Renk bilgiyi TASIMIYOR, yalnizca hizlandiriyor: tutar ve aciklama metni
        her zaman yazili, ayrica sol renk seridi ucuncu bir ipucu.
        Tutar isaretsiz — yon zaten metinle soyleniyor (bkz. utils/balance.ts).

        NumberTicker ilk render'da animasyon yapmaz; yalnizca deger degistiginde
        gecis yapar. Gerekcesi bileseninin basinda yazili.
      */}
      <NumberTicker
        value={view.cents}
        format={formatCentsAbsolute}
        className="group-card__amount text-xl font-semibold"
      />
      <span className="group-card__tone text-xs text-ink-muted">{view.label}</span>
    </p>
  );
};

export default GroupCard;
