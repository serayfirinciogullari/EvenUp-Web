import { Check, Link2, Users } from 'lucide-react';
import { motion } from 'motion/react';
import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';

import GlassCard from '@/components/GlassCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NumberTicker } from '@/components/ui/number-ticker';
import { Skeleton } from '@/components/ui/skeleton';
import { getErrorMessage } from '../api/client';
import groupsApi from '../api/groups';
import useAsync from '../hooks/useAsync';
import { viewForUser } from '../utils/balance';
import { buildJoinUrl, copyToClipboard } from '../utils/invite';
import { formatCentsAbsolute } from '../utils/money';

import type { BalanceResult, GroupSummary } from '../types/models';

/**
 * Grup listesi karti — **glass** yuzey.
 *
 * Neden glass: bu kartin tasidigi asil sey net bakiye **ozeti**, yani bir
 * durumun sonucu. Yuzey ayrimi icerige gore veriliyor (bkz. index.css).
 *
 * BAKIYE NEDEN KART BASINA AYRI ISTEK
 * -----------------------------------
 * Backend'de "tum gruplarin bakiyesi" diye toplu bir uc nokta yok; bakiye grup
 * basina hesaplaniyor ve hesaplamak icin grubun **tum** harcamalarini okumak
 * gerekiyor (docs/decisions/1.7.md). Istek kartin kendi icinde: liste bakiyeler
 * beklenmeden goruntuleniyor ve tek bir grubun bakiyesi hata verirse yalnizca
 * o kart etkileniyor.
 */

interface GroupCardProps {
  group: GroupSummary;
  currentUserId: string;
}

type InviteState =
  | { status: 'idle' }
  | { status: 'pending' }
  /** Panoya yazildi. */
  | { status: 'copied'; url: string }
  /** Pano erisilemedi; link ekranda gosterilip elle kopyalanacak. */
  | { status: 'manual'; url: string }
  | { status: 'error'; message: string };

const GroupCard = ({ group, currentUserId }: GroupCardProps) => {
  const fetchBalances = useCallback(() => groupsApi.getGroupBalances(group.id), [group.id]);
  const balances = useAsync<BalanceResult>(fetchBalances, 'Bakiye alinamadi');

  const [invite, setInvite] = useState<InviteState>({ status: 'idle' });

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

  return (
    /*
      Hover'da hafif yukselme + golge. Orta yogunluk: olcek degil, 3px'lik bir
      kalkma — kart listesi icinde olcek degisimi komsu kartlarla cakisir.
    */
    <motion.div
      whileHover={{ y: -3 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      className="h-full"
    >
      <GlassCard as="article" className="group-card flex h-full flex-col gap-3 p-5">
        <header className="group-card__head flex items-start justify-between gap-2">
          <h2 className="group-card__title text-lg leading-tight">
            <Link
              to={`/groups/${group.id}`}
              className="rounded-sm transition-colors hover:text-rose"
            >
              {group.name}
            </Link>
          </h2>
          {group.role === 'owner' && (
            <Badge variant="outline" className="shrink-0 border-rose/30 bg-rose/8 text-rose">
              Sahip
            </Badge>
          )}
        </header>

        <p className="group-card__meta flex items-center gap-1.5 text-sm text-ink-muted">
          <Users className="size-3.5 shrink-0" aria-hidden />
          {group.member_count} uye
          {group.description ? ` · ${group.description}` : ''}
        </p>

        <BalanceCell balances={balances} currentUserId={currentUserId} />

        {/*
          Davet uretmeyi yalnizca owner yapabilir; uye cagirirsa backend 403
          doner (1.4). Butonu gizlemek bir guvenlik onlemi degil — calismayacak
          bir aksiyonu gostermemek.
        */}
        {group.role === 'owner' && (
          <div className="group-card__actions mt-auto pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleInvite()}
              disabled={invite.status === 'pending'}
              className="w-full border-rose/25 bg-white/60 text-rose hover:bg-rose/10 hover:text-rose"
            >
              {invite.status === 'copied' ? (
                <Check className="size-4" aria-hidden />
              ) : (
                <Link2 className="size-4" aria-hidden />
              )}
              {invite.status === 'pending' ? 'Link aliniyor...' : 'Davet linkini kopyala'}
            </Button>

            {invite.status === 'copied' && (
              <p className="group-card__note mt-2 text-xs text-ink-muted" role="status">
                Davet linki panoya kopyalandi.
              </p>
            )}

            {invite.status === 'manual' && (
              <p className="group-card__note mt-2 text-xs text-ink-muted" role="status">
                Pano kullanilamadi, linki elle kopyalayin:{' '}
                <code className="group-card__link block break-all text-[11px] text-ink">
                  {invite.url}
                </code>
              </p>
            )}

            {invite.status === 'error' && (
              <p className="field-error mt-2 text-xs text-destructive" role="alert">
                {invite.message}
              </p>
            )}
          </div>
        )}
      </GlassCard>
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
          className="link-button ml-2 text-rose underline underline-offset-2"
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
