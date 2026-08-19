import { Check, Link2, MoreHorizontal, Pencil, Tag, UserMinus, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { getErrorMessage } from '../api/client';
import groupsApi from '../api/groups';
import { shortLabelOfTone, toneOfCents } from '../utils/balance';
import { colorOfGroup } from '../utils/groupColor';
import { buildJoinUrl, copyToClipboard } from '../utils/invite';
import { formatCentsAbsolute, parseAmountToCents } from '../utils/money';
import ConfirmDialog from './ConfirmDialog';
import GlassCard from './GlassCard';

import type { Balance, GroupMember, GroupMemberRole } from '../types/models';

/**
 * "Kisiler" sekmesi — grubun uye yonetimi.
 *
 * IKI YUZEY, IKI IS
 * -----------------
 * Ust taraf (davet karti) **glass**: bir durum/aksiyon ozeti, veri satiri
 * degil. Alt taraf (uye listesi) **solid**: kullanicinin okudugu/duzenledigi
 * veri satirlari (bkz. index.css yuzey ayrimi, docs/decisions/2.4.md).
 *
 * TAKMA ISIM GERCEK ADIN YERINE GECMIYOR
 * --------------------------------------
 * Satirda **ikisi birden** var: buyuk olan gorunen ad (takma isim varsa o),
 * altinda gercek ad + @handle. Yalnizca takma ismi gostermek, kullanicinin
 * bir sure sonra "Kirali kimdi?" diye sormasina yol acardi.
 *
 * NEDEN "..." MENU
 * -----------------
 * Satirda iki aksiyon var (takma isim, cikar) ve ikincisi **yikici**. Ikisini
 * de her zaman gorunur butun yapmak satiri kalabaliklastirir ve "cikar"in her
 * an gorunmesi yanlislikla tiklanma riskini artirirdi. Menu ikisini toplu
 * tutuyor; yikici olan icerde de ayri renkle (kirmizi) isaretleniyor.
 *
 * NEDEN "KULLANICI ADIYLA EKLE" YOK
 * ----------------------------------
 * Uygulamanin katilma modeli **onaya dayali**: davet linkiyle gelen kisi
 * kendi rizasiyla katilir (bkz. docs/decisions/1.4.md). Dogrudan ekleme,
 * kullaniciyi rizasi olmadan bir gruba sokmak demek olurdu — ayrica sistemde
 * aranabilir bir "kullanici adi" da yok. @handle yalnizca **gorunum** icin
 * e-postadan turetiliyor, bir arama/ekleme anahtari degil.
 */

/** E-postadan gorunum icin bir @handle turetir. Gercek bir kullanici adi
 *  sistemi yok; bu yalnizca satirda kisa bir kimlik gostermek icin. */
const handleOf = (email: string): string => `@${email.split('@')[0]}`;

interface MembersTabProps {
  groupId: string;
  groupName: string;
  members: GroupMember[];
  currentUserId: string;
  /** Istekte bulunanin bu gruptaki rolu — davet karti ve "cikar" aksiyonu yalnizca owner'a gorunur. */
  viewerRole: GroupMemberRole;
  /** Satirdaki kucuk bakiye etiketi icin. Henuz yuklenmediyse bos dizi verilir; satir bakiyesiz gorunur. */
  balances: Balance[];
  /** Takma isim degisince grup detayi tazelenir; adlar her yerde guncellensin. */
  onNicknameChanged: () => void;
  /** Uye cikarilinca grup detayi ve bakiye tazelenir. */
  onMemberRemoved: () => void;
}

const MembersTab = ({
  groupId,
  groupName,
  members,
  currentUserId,
  viewerRole,
  balances,
  onNicknameChanged,
  onMemberRemoved,
}: MembersTabProps) => {
  /** Su an duzenlenen satirin kullanici ID'si. Ayni anda yalnizca bir satir. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<GroupMember | null>(null);

  if (members.length === 0) {
    return (
      <div className="state-box card-solid p-10 text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-rose/10">
          <Tag className="size-6 text-rose" aria-hidden />
        </div>
        <h2 className="text-xl">Uye listesi bos.</h2>
      </div>
    );
  }

  return (
    <div className="members-tab flex flex-col gap-4">
      {/* Davet uretmeyi yalnizca owner yapabilir; uye cagirirsa backend 403
          doner (1.4). Karti gizlemek bir guvenlik onlemi degil — calismayacak
          bir aksiyonu gostermemek. */}
      {viewerRole === 'owner' && <InviteCard groupId={groupId} groupName={groupName} />}

      <ul className="members-list flex flex-col gap-2">
        {members.map((member) => (
          <MemberRow
            key={member.user_id}
            groupId={groupId}
            member={member}
            isSelf={member.user_id === currentUserId}
            canRemove={viewerRole === 'owner' && member.user_id !== currentUserId}
            balanceCents={balanceCentsOf(balances, member.user_id)}
            editing={editingId === member.user_id}
            onEdit={() => setEditingId(member.user_id)}
            onClose={() => setEditingId(null)}
            onSaved={onNicknameChanged}
            onRequestRemove={() => setRemoveTarget(member)}
          />
        ))}
      </ul>

      <RemoveMemberDialog
        groupId={groupId}
        target={removeTarget}
        onOpenChange={(open) => {
          if (!open) {
            setRemoveTarget(null);
          }
        }}
        onRemoved={() => {
          setRemoveTarget(null);
          onMemberRemoved();
        }}
      />
    </div>
  );
};

/** Bir uyenin net bakiyesi (kurus). Bakiye listesinde yoksa (henuz hic
 *  harcamaya dahil olmamis) `0` — fiilen sifir bakiyeyle ayni sey. */
const balanceCentsOf = (balances: Balance[], userId: string): number => {
  const row = balances.find((balance) => balance.user_id === userId);
  return row ? (parseAmountToCents(row.net_balance) ?? 0) : 0;
};

/* -------------------------------------------------------------- davet karti */

type InviteState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'copied'; url: string }
  | { status: 'manual'; url: string }
  | { status: 'error'; message: string };

/**
 * Davet karti — **glass**: bir aksiyon/durum ozeti, veri satiri degil.
 * `GroupCard`daki tek-buton davetle ayni ag cagrisini yapiyor (backend
 * her zaman mevcut aktif daveti dondurur), ama burada kod da **gorunur**:
 * kullanici linki gormeden once ne paylasacagini bilmek isteyebilir.
 */
const InviteCard = ({ groupId, groupName }: { groupId: string; groupName: string }) => {
  const [invite, setInvite] = useState<InviteState>({ status: 'idle' });

  const handleInvite = async () => {
    if (invite.status === 'pending') {
      return;
    }

    setInvite({ status: 'pending' });

    try {
      const result = await groupsApi.createInvite(groupId);
      const url = buildJoinUrl(result.invite.code);
      const copied = await copyToClipboard(url);

      setInvite(copied ? { status: 'copied', url } : { status: 'manual', url });
    } catch (caught) {
      setInvite({ status: 'error', message: getErrorMessage(caught, 'Davet linki alinamadi') });
    }
  };

  const url = invite.status === 'copied' || invite.status === 'manual' ? invite.url : null;

  return (
    <GlassCard as="section" className="invite-card flex flex-col gap-3 p-5">
      <div>
        <h2 className="text-lg">Gruba davet et</h2>
        <p className="mt-0.5 text-sm text-ink-muted">
          Linki bilen herkes {groupName} grubuna katilabilir.
        </p>
      </div>

      {/* Kod uretilmeden once yer tutucu bir cizgi; uretildikten sonra gercek
          kod. Boylece kart ilk acilista da bos kalmiyor. */}
      <code
        className="invite-card__code truncate rounded-lg border border-blush/60 bg-surface/60 px-3 py-2 text-sm text-ink-muted"
        aria-live="polite"
      >
        {url ?? 'Linki almak icin asagidaki butona bas'}
      </code>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void handleInvite()}
          disabled={invite.status === 'pending'}
          className="border-rose/25 text-rose hover:bg-rose/10 hover:text-rose"
        >
          {invite.status === 'copied' ? (
            <Check className="size-4" aria-hidden />
          ) : (
            <Link2 className="size-4" aria-hidden />
          )}
          {invite.status === 'pending' ? 'Link aliniyor...' : 'Linki kopyala'}
        </Button>

        {invite.status === 'copied' && (
          <p className="text-xs text-ink-muted" role="status">
            Panoya kopyalandi.
          </p>
        )}

        {invite.status === 'manual' && (
          <p className="text-xs text-ink-muted" role="status">
            Pano kullanilamadi, kutudaki linki elle kopyala.
          </p>
        )}

        {invite.status === 'error' && (
          <p className="text-xs text-destructive" role="alert">
            {invite.message}
          </p>
        )}
      </div>
    </GlassCard>
  );
};

/* -------------------------------------------------------------------- satir */

interface MemberRowProps {
  groupId: string;
  member: GroupMember;
  isSelf: boolean;
  /** Yalnizca owner, ve yalnizca baskasi icin — bkz. group.service.removeMember. */
  canRemove: boolean;
  balanceCents: number;
  editing: boolean;
  onEdit: () => void;
  onClose: () => void;
  onSaved: () => void;
  onRequestRemove: () => void;
}

const MemberRow = ({
  groupId,
  member,
  isSelf,
  canRemove,
  balanceCents,
  editing,
  onEdit,
  onClose,
  onSaved,
  onRequestRemove,
}: MemberRowProps) => {
  const displayName = member.nickname ?? member.name;
  const tone = toneOfCents(balanceCents);
  const initial = displayName.trim().charAt(0).toUpperCase() || '?';

  return (
    <li className="member-row card-solid flex flex-wrap items-center gap-3 p-3">
      <Avatar>
        <AvatarFallback
          style={{ backgroundColor: colorOfGroup(member.user_id), color: '#fff' }}
          className="font-medium"
        >
          {initial}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <p className="member-row__name flex flex-wrap items-center gap-2 font-medium text-ink">
          <span className="truncate">{displayName}</span>

          {isSelf && (
            <Badge variant="outline" className="shrink-0 border-ink/15 text-ink-muted">
              Sen
            </Badge>
          )}

          {member.role === 'owner' && (
            <Badge variant="outline" className="shrink-0 border-rose/30 bg-rose/8 text-rose">
              Sahip
            </Badge>
          )}
        </p>

        {/*
          Takma isim varsa gercek ad **altta** kaliyor, kaybolmuyor. @handle her
          zaman gorunur — grup buyudukce kisiyi ayirt etmeye yariyor.
        */}
        <p className="member-row__meta truncate text-xs text-ink-muted">
          {member.nickname ? `${member.name} · ` : ''}
          {handleOf(member.email)}
        </p>
      </div>

      {editing ? (
        <NicknameEditor groupId={groupId} member={member} onClose={onClose} onSaved={onSaved} />
      ) : (
        <div className="flex shrink-0 items-center gap-3">
          {/* Renk bilgiyi tasimiyor: yon her zaman kelimeyle de yazili
              (bkz. utils/balance.ts). */}
          {balanceCents !== 0 && (
            <p className={`text-right text-sm balance-text--${tone}`}>
              <span className="block font-semibold">{formatCentsAbsolute(balanceCents)}</span>
              <span className="block text-xs text-ink-muted">{shortLabelOfTone(tone)}</span>
            </p>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 text-ink-muted hover:text-ink"
                aria-label={`${displayName} icin islemler`}
              >
                <MoreHorizontal className="size-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onEdit}>
                <Pencil aria-hidden />
                {member.nickname ? 'Takma adi degistir' : 'Takma isim ver'}
              </DropdownMenuItem>

              {canRemove && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={onRequestRemove}>
                    <UserMinus aria-hidden />
                    Gruptan cikar
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </li>
  );
};

/**
 * Takma isim duzenleyici — **yalnizca duzenleme acikken mount oluyor.**
 *
 * Taslak metni burada tutuluyor, satirda degil. Gerekcesi bir hata sinifini
 * kapatmak: taslak satirda dursaydi `useState(member.nickname)` yalnizca ilk
 * render'da calisirdi ve kaydettikten sonra gelen tazeleme ile prop degisse
 * bile kutu **eski** degeri gosterirdi. Duzenleyici her acilista yeniden
 * mount oldugu icin baslangic degeri her zaman guncel.
 */
const NicknameEditor = ({
  groupId,
  member,
  onClose,
  onSaved,
}: {
  groupId: string;
  member: GroupMember;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const [draft, setDraft] = useState(member.nickname ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) {
      return;
    }

    setSaving(true);

    try {
      /*
        Bos metin gonderiliyor (`''`), `null` degil: backend ikisini de
        "kaldir" olarak okuyor ve burada ayrica bir donusum yapmak, ayni
        karari iki yerde tutmak olurdu.
      */
      const result = await groupsApi.setMemberNickname(groupId, member.user_id, draft);

      toast.success(
        result.nickname ? `Takma isim kaydedildi: ${result.nickname}` : 'Takma isim kaldirildi'
      );

      onClose();
      // Elle guncelleme yerine tazeleme: takma isim bakiye satirlarindaki
      // adlari da degistiriyor (backend orada da uyguluyor), yani tek dogru
      // kaynak sunucunun cevabi.
      onSaved();
    } catch (caught) {
      toast.error(getErrorMessage(caught, 'Takma isim kaydedilemedi'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="member-row__edit flex w-full items-center gap-2 sm:w-auto">
      <Input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void save();
          }
          if (event.key === 'Escape') {
            onClose();
          }
        }}
        /* Kolon siniri 60; tarayici da ayni siniri uygulasin ki kullanici
           yazarken ogrensin, kaydettikten sonra hata almasin. */
        maxLength={60}
        placeholder="Takma isim (bos birak = kaldir)"
        aria-label={`${member.name} icin takma isim`}
        autoFocus
        className="h-9 min-w-0 flex-1 sm:w-56"
      />

      <Button
        type="button"
        size="icon"
        className="size-9 shrink-0"
        onClick={() => void save()}
        disabled={saving}
        aria-label="Takma ismi kaydet"
      >
        <Check className="size-4" aria-hidden />
      </Button>

      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-9 shrink-0"
        onClick={onClose}
        disabled={saving}
        aria-label="Vazgec"
      >
        <X className="size-4" aria-hidden />
      </Button>
    </div>
  );
};

/* --------------------------------------------------------- uye cikarma onayi */

/**
 * Uye cikarma onayi. `target` `null` iken kapali kalir; `ConfirmDialog`
 * (2.5) genel bilesenini kullaniyor — bekleyen istekte kapanmama ve hatanin
 * modal icinde gosterilmesi orada zaten cozulmus (bkz. ConfirmDialog).
 */
const RemoveMemberDialog = ({
  groupId,
  target,
  onOpenChange,
  onRemoved,
}: {
  groupId: string;
  target: GroupMember | null;
  onOpenChange: (open: boolean) => void;
  onRemoved: () => void;
}) => {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (!target || pending) {
      return;
    }

    setPending(true);
    setError(null);

    try {
      await groupsApi.removeMember(groupId, target.user_id);
      toast.success('Uye gruptan cikarildi', { description: target.name });
      onRemoved();
    } catch (caught) {
      setError(getErrorMessage(caught, 'Uye cikarilamadi'));
    } finally {
      setPending(false);
    }
  };

  return (
    <ConfirmDialog
      open={target !== null}
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) {
          setError(null);
        }
      }}
      title="Uyeyi gruptan cikar"
      description={
        target
          ? `${target.name} gruptan cikarilacak. Gecmis harcamalari ve bakiyeleri saklanir; yalnizca erisimi kesilir.`
          : ''
      }
      confirmLabel="Cikar"
      tone="destructive"
      pending={pending}
      error={error}
      onConfirm={() => void confirm()}
    />
  );
};

export default MembersTab;
