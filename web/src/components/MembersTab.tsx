import { Check, Pencil, Tag, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getErrorMessage } from '../api/client';
import groupsApi from '../api/groups';

import type { GroupMember } from '../types/models';

/**
 * "Kisiler" sekmesi — satirlar **solid** yuzey.
 *
 * Neden solid: bu bir liste, ozet degil. Kullanici burada okuyor ve
 * duzenliyor; glass yuzeyler durum/sonuc kartlarina ayrilmis
 * (bkz. index.css yuzey ayrimi).
 *
 * TAKMA ISIM GERCEK ADIN YERINE GECMIYOR
 * --------------------------------------
 * Satirda **ikisi birden** var: buyuk olan gorunen ad (takma isim varsa o),
 * altinda gercek ad. Yalnizca takma ismi gostermek, kullanicinin bir sure
 * sonra "Kirali kimdi?" diye sormasina yol acardi — ozellikle grup buyudukce.
 * Odemeler ve ozet ekranlarinda yer dar oldugu icin orada yalnizca gorunen ad
 * var; burasi ikisinin birlikte durdugu tek yer, yani sozlugun kendisi.
 *
 * NEDEN SATIR ICI DUZENLEME, MODAL DEGIL
 * --------------------------------------
 * Takma isim tek bir kisa metin. Modal acmak, tek alanli bir form icin ekrani
 * kaplayip odagi tasimak olurdu; ustelik kullanici genelde **birkac kisiye
 * arka arkaya** ad verir ve her seferinde modal acip kapatmak bunu yorucu
 * yapardi. Satir ici duzenlemede bir satiri bitirip digerine gecmek tek tik.
 */

interface MembersTabProps {
  groupId: string;
  members: GroupMember[];
  currentUserId: string;
  /** Takma isim degisince grup detayi tazelenir; adlar her yerde guncellensin. */
  onNicknameChanged: () => void;
}

const MembersTab = ({ groupId, members, currentUserId, onNicknameChanged }: MembersTabProps) => {
  /** Su an duzenlenen satirin kullanici ID'si. Ayni anda yalnizca bir satir. */
  const [editingId, setEditingId] = useState<string | null>(null);

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
    <ul className="members-list flex flex-col gap-2">
      {members.map((member) => (
        <MemberRow
          key={member.user_id}
          groupId={groupId}
          member={member}
          isSelf={member.user_id === currentUserId}
          editing={editingId === member.user_id}
          onEdit={() => setEditingId(member.user_id)}
          onClose={() => setEditingId(null)}
          onSaved={onNicknameChanged}
        />
      ))}
    </ul>
  );
};

interface MemberRowProps {
  groupId: string;
  member: GroupMember;
  isSelf: boolean;
  editing: boolean;
  onEdit: () => void;
  onClose: () => void;
  onSaved: () => void;
}

const MemberRow = ({
  groupId,
  member,
  isSelf,
  editing,
  onEdit,
  onClose,
  onSaved,
}: MemberRowProps) => {
  const displayName = member.nickname ?? member.name;

  return (
    <li className="member-row card-solid flex flex-wrap items-center gap-3 p-3">
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
          Takma isim varsa gercek ad **altta** kaliyor, kaybolmuyor. Yoksa
          e-posta gosteriliyor — o da kisiyi ayirt etmeye yarayan bilgi.
        */}
        <p className="member-row__meta truncate text-xs text-ink-muted">
          {member.nickname ? `${member.name} · ${member.email}` : member.email}
        </p>
      </div>

      {editing ? (
        <NicknameEditor
          groupId={groupId}
          member={member}
          onClose={onClose}
          onSaved={onSaved}
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onEdit}
          className="shrink-0 border-rose/25 text-rose hover:bg-rose/10 hover:text-rose"
        >
          <Pencil className="size-3.5" aria-hidden />
          {member.nickname ? 'Takma ismi degistir' : 'Takma isim ver'}
        </Button>
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

export default MembersTab;
