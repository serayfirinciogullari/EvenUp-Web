import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';

import groupsApi from '../api/groups';
import { getErrorMessage } from '../api/client';
import useAsync from '../hooks/useAsync';
import { viewForUser } from '../utils/balance';
import { formatCentsAbsolute } from '../utils/money';
import { buildJoinUrl, copyToClipboard } from '../utils/invite';

import type { BalanceResult, GroupSummary } from '../types/models';

/**
 * Grup listesi karti: ad, uye sayisi, kullanicinin o gruptaki net bakiyesi ve
 * (yalnizca owner icin) hizli davet linki.
 *
 * BAKIYE NEDEN KART BASINA AYRI ISTEK
 * -----------------------------------
 * Backend'de "tum gruplarin bakiyesi" diye toplu bir uc nokta yok; bakiye
 * grup basina hesaplaniyor (`GET /groups/:id/balances`) ve hesaplamak icin
 * grubun **tum** harcamalarini okumak gerekiyor (bkz. docs/decisions/1.7.md).
 *
 * Istek kartin **kendi icinde** duruyor, sayfada toplanmis degil. Kazanci:
 * liste bakiyeler beklenmeden goruntuleniyor ve tek bir grubun bakiyesi
 * hata verirse yalnizca o kart etkileniyor — digerleri ve listenin kendisi
 * ayakta kaliyor.
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
  const fetchBalances = useCallback(
    () => groupsApi.getGroupBalances(group.id),
    [group.id]
  );

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
    <article className="group-card">
      <header className="group-card__head">
        <h2 className="group-card__title">
          <Link to={`/groups/${group.id}`}>{group.name}</Link>
        </h2>
        {group.role === 'owner' && <span className="badge">Sahip</span>}
      </header>

      <p className="group-card__meta">
        {group.member_count} uye
        {group.description ? ` · ${group.description}` : ''}
      </p>

      <BalanceCell balances={balances} currentUserId={currentUserId} />

      {/*
        Davet uretmeyi yalnizca owner yapabilir; uye cagirirsa backend 403 doner
        (bkz. docs/decisions/1.4.md). Butonu gizlemek bir guvenlik onlemi degil,
        yalnizca calismayacak bir aksiyonu gostermemek.
      */}
      {group.role === 'owner' && (
        <div className="group-card__actions">
          <button type="button" onClick={() => void handleInvite()} disabled={invite.status === 'pending'}>
            {invite.status === 'pending' ? 'Link aliniyor...' : 'Davet linkini kopyala'}
          </button>

          {invite.status === 'copied' && (
            <p className="group-card__note" role="status">
              Davet linki panoya kopyalandi.
            </p>
          )}

          {invite.status === 'manual' && (
            <p className="group-card__note" role="status">
              Pano kullanilamadi, linki elle kopyalayin:{' '}
              <code className="group-card__link">{invite.url}</code>
            </p>
          )}

          {invite.status === 'error' && (
            <p className="field-error" role="alert">
              {invite.message}
            </p>
          )}
        </div>
      )}
    </article>
  );
};

/**
 * Bakiye hucresi. Uc durumu da ayri gosteriyor; ozellikle **hata** durumunda
 * "0,00 ₺" gostermek yanlis olurdu — bilinmeyen bir bakiye ile dengede olan
 * bir bakiye ayni sey degil.
 */
const BalanceCell = ({
  balances,
  currentUserId,
}: {
  balances: ReturnType<typeof useAsync<BalanceResult>>;
  currentUserId: string;
}) => {
  if (balances.loading) {
    return <p className="group-card__balance skeleton-line" aria-label="Bakiye yukleniyor" />;
  }

  if (balances.error || !balances.data) {
    return (
      <p className="group-card__balance group-card__balance--unknown">
        Bakiye su an alinamadi
        <button type="button" className="link-button" onClick={balances.reload}>
          Tekrar dene
        </button>
      </p>
    );
  }

  const view = viewForUser(balances.data.balances, currentUserId);

  return (
    <p className={`group-card__balance balance--${view.tone}`}>
      {/*
        Renk bilgiyi TASIMIYOR, yalnizca hizlandiriyor: tutar ve aciklama metni
        her zaman yazili. Kirmizi/yesil ayrimini goremeyen kullanici icin ekran
        anlamini korumali (bkz. utils/balance.ts).
      */}
      <span className="group-card__amount">{formatCentsAbsolute(view.cents)}</span>
      <span className="group-card__tone">{view.label}</span>
    </p>
  );
};

export default GroupCard;
