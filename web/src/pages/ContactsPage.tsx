import { Check, MoreHorizontal, Pencil, Users } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { getErrorMessage } from '../api/client';
import contactsApi from '../api/contacts';
import groupsApi from '../api/groups';
import settlementsApi from '../api/settlements';
import useAsync from '../hooks/useAsync';
import { shortLabelOfTone, toneOfCents } from '../utils/balance';
import { colorOfGroup } from '../utils/groupColor';
import { groupPath } from '../utils/groupPath';
import { centsToApiAmount, formatCentsAbsolute, parseAmountToCents } from '../utils/money';

import type { Contact, ContactGroupBalance } from '../types/models';

/**
 * Kisiler — kullanicinin ortak grubu oldugu **herkes**, tek listede.
 *
 * NEDEN GRUP BAZLI DEGIL KISI BAZLI
 * -----------------------------------
 * Grup detayindaki "Kisiler" sekmesi (`MembersTab`) her zaman **tek bir
 * grubun** uyelerini gosterir; ayni kisiyle uc ayri grupta borcun varsa ucunu
 * da ayri ayri gormek gerekir. Bu sayfa tam tersini yapiyor: kisi merkezli,
 * ortak gruplar toplaniyor. Backend tarafi docs/decisions/kisiler-sayfasi.md
 * icinde — ozetle bu bir netlestirme degil, harcama paylarindan dogrudan
 * hesaplanan kisi-bazli bir toplam.
 *
 * E-POSTA NEDEN YOK
 * ------------------
 * `MembersTab`teki `@handle` e-postadan turetiliyordu; bu sayfa **gruplar
 * arasi** oldugu icin ayni kisi baska bir grupta farkli bir baglamda
 * gorunebilir ve e-posta hicbir zaman backend'den bu uca donmuyor
 * (`ContactSummary` tipinde alan yok). Kimlik ayrimi ad + takma ad +
 * ortak gruplarla yapiliyor.
 */
const ContactsPage = () => {
  const fetchContacts = useCallback(() => contactsApi.getContacts(), []);
  const contacts = useAsync<Contact[]>(fetchContacts, 'Kisiler alinamadi');

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'balance' | 'name'>('balance');

  const visible = useMemo(() => {
    const list = contacts.data ?? [];
    const needle = query.trim().toLocaleLowerCase('tr');

    const matching = needle
      ? list.filter((contact) => {
          const haystack = `${contact.name} ${contact.nickname ?? ''}`.toLocaleLowerCase('tr');
          return haystack.includes(needle);
        })
      : list;

    return [...matching].sort((a, b) => {
      if (sort === 'name') {
        return a.name.localeCompare(b.name, 'tr');
      }

      // Borc durumu: en buyuk mutlak bakiye once — en cok dikkat gerektiren
      // en ustte. Esitlikte isme dusuyor, boylece sira kararli kalir.
      const diff = Math.abs(centsOf(b.net_balance)) - Math.abs(centsOf(a.net_balance));
      return diff !== 0 ? diff : a.name.localeCompare(b.name, 'tr');
    });
  }, [contacts.data, query, sort]);

  return (
    <section className="contacts-page flex flex-col gap-4">
      <header className="contacts-page__head">
        <h1>Tum gruplardaki kisiler</h1>
        <p className="mt-0.5 text-sm text-ink-muted">
          Tutarlar o kisiyle olan tum gruplardaki net durumunu gosterir. E-posta
          adresleri gizlidir; kisileri takma adlariyla bulabilirsin.
        </p>
      </header>

      {!contacts.loading && !contacts.error && contacts.data && contacts.data.length > 0 && (
        <div className="contacts-page__controls flex flex-wrap items-center gap-2">
          {/*
            "ARA" etiketi placeholder degil, kutunun icinde sabit bir onek —
            arama kutusunun kendisini de bir mini-baslik gibi tanitiyor.
            Shadcn `Input`in kendi border/padding'i bu ic yerlesime uymadigi
            icin burada duz bir `<input>` kullanildi (AddExpenseModal'daki
            native `<select>` tercihiyle ayni gerekce).
          */}
          <div className="contacts-page__search flex min-w-0 flex-1 items-center gap-3 rounded-full border border-ink/10 bg-surface/60 py-1.5 pr-4 pl-4 sm:max-w-sm">
            <span className="shrink-0 text-xs font-semibold tracking-[0.14em] text-ink-muted uppercase">
              Ara
            </span>
            <span className="h-4 w-px shrink-0 bg-ink/15" aria-hidden />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Isim veya takma ad"
              aria-label="Kisi ara"
              className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
            />
          </div>

          <div className="ml-auto flex items-center gap-1.5" role="radiogroup" aria-label="Siralama">
            <SortToggle label="Borc durumu" active={sort === 'balance'} onClick={() => setSort('balance')} />
            <SortToggle label="Isim" active={sort === 'name'} onClick={() => setSort('name')} />
          </div>
        </div>
      )}

      <ContactsBody
        loading={contacts.loading}
        error={contacts.error}
        total={contacts.data?.length ?? 0}
        visible={visible}
        onReload={contacts.reload}
        onChanged={contacts.reload}
      />
    </section>
  );
};

const centsOf = (value: string): number => parseAmountToCents(value) ?? 0;

/**
 * Siralama secimi — acilir kutu degil, iki haplik anahtar. `<select>`
 * secimin ne oldugunu gizler (kutu kapaliyken tek deger gorunur); burada
 * ikisi de her zaman ekranda, secili olan dolu zeminle isaretli.
 */
const SortToggle = ({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) => (
  <Button
    type="button"
    variant={active ? 'default' : 'outline'}
    size="sm"
    role="radio"
    aria-checked={active}
    onClick={onClick}
    className="rounded-full"
  >
    {label}
  </Button>
);

/**
 * Govde: yukleniyor / hata / bos (hic kisi yok) / arama sonucu bos / dolu.
 *
 * "Hic kisi yok" ile "arama hicbir sey bulamadi" ayri durumlar: birincisinde
 * arama kutusu bile gorunmuyor (yukarida `total > 0` sartina bagli), o yuzden
 * bu ikisi hicbir zaman ayni anda tetiklenmiyor ama yine de ayri mesajlari var.
 */
const ContactsBody = ({
  loading,
  error,
  total,
  visible,
  onReload,
  onChanged,
}: {
  loading: boolean;
  error: string | null;
  total: number;
  visible: Contact[];
  onReload: () => void;
  onChanged: () => void;
}) => {
  if (loading) {
    return <ContactsSkeleton />;
  }

  if (error) {
    return (
      <div className="state-box state-box--error card-solid p-8 text-center" role="alert">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" className="mt-3" onClick={onReload}>
          Tekrar dene
        </Button>
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="state-box card-solid p-10 text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-rose/10">
          <Users className="size-6 text-rose" aria-hidden />
        </div>
        <h2 className="text-xl">Henuz ortak grubun oldugu kimse yok.</h2>
        <p className="placeholder mx-auto mt-2 max-w-sm text-sm text-ink-muted">
          Bir gruba katil ya da birini davet et; ortak harcamaniz olunca burada gorunur.
        </p>
      </div>
    );
  }

  if (visible.length === 0) {
    return (
      <p className="state-box card-solid p-6 text-center text-sm text-ink-muted">
        Aramayla eslesen kisi yok.
      </p>
    );
  }

  return (
    <ul className="contacts-list flex flex-col gap-2">
      {visible.map((contact) => (
        <ContactRow key={contact.user_id} contact={contact} onChanged={onChanged} />
      ))}
    </ul>
  );
};

const ContactsSkeleton = () => (
  <div className="flex flex-col gap-2" aria-busy="true" aria-label="Kisiler yukleniyor">
    {[0, 1, 2].map((index) => (
      <div className="contact-row card-solid flex items-center gap-3 p-3" key={index}>
        <Skeleton className="size-10 shrink-0 rounded-full" />
        <div className="flex-1">
          <Skeleton className="skeleton-line h-4 w-2/5" />
          <Skeleton className="skeleton-line mt-2 h-3 w-3/5" />
        </div>
        <Skeleton className="skeleton-line h-8 w-20 shrink-0 rounded-md" />
      </div>
    ))}
  </div>
);

/* -------------------------------------------------------------------- satir */

const ContactRow = ({ contact, onChanged }: { contact: Contact; onChanged: () => void }) => {
  const [nicknameOpen, setNicknameOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);

  const cents = centsOf(contact.net_balance);
  const tone = toneOfCents(cents);
  const displayName = contact.nickname ?? contact.name;
  const initial = displayName.trim().charAt(0).toUpperCase() || '?';
  const groupNames = contact.shared_groups.map((group) => group.name).join(' · ');

  return (
    <li className="contact-row card-solid flex flex-wrap items-center gap-3 p-3">
      <Avatar>
        <AvatarFallback
          style={{ backgroundColor: colorOfGroup(contact.user_id), color: '#fff' }}
          className="font-medium"
        >
          {initial}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <p className="contact-row__name flex flex-wrap items-baseline gap-1.5 font-medium text-ink">
          <span className="truncate">{displayName}</span>
          {/* Takma isim gercek adin yerine gecmiyor — 2.9'daki kuralin aynisi. */}
          {contact.nickname && (
            <span className="shrink-0 text-xs font-normal text-ink-muted">({contact.name})</span>
          )}
        </p>
        <p className="contact-row__meta truncate text-xs text-ink-muted">{groupNames}</p>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <p
          className={`text-right text-sm ${cents !== 0 ? `balance-text--${tone}` : 'text-ink-muted'}`}
        >
          <span className="block font-semibold">{formatCentsAbsolute(cents)}</span>
          <span className="block text-xs">{shortLabelOfTone(tone)}</span>
        </p>

        {cents !== 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCloseOpen(true)}
            className="border-rose/25 text-rose hover:bg-rose/10 hover:text-rose"
          >
            Hesabi kapat
          </Button>
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
            <DropdownMenuItem onSelect={() => setNicknameOpen(true)}>
              <Pencil aria-hidden />
              Takma adi duzenle
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setGroupsOpen(true)}>
              <Users aria-hidden />
              Ortak gruplari gor
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <NicknameDialog
        open={nicknameOpen}
        onOpenChange={setNicknameOpen}
        contact={contact}
        onSaved={onChanged}
      />
      <SharedGroupsDialog open={groupsOpen} onOpenChange={setGroupsOpen} contact={contact} />
      <CloseAccountDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        contact={contact}
        onDone={onChanged}
      />
    </li>
  );
};

/* --------------------------------------------------------- takma isim duzenle */

/**
 * Takma isim **gruba ozel** (bkz. docs/decisions/2.9-takma-isimler.md), yani
 * bu kisiyle N ortak grubun varsa N ayri takma isim olabilir. Bu yuzden
 * diyalog "tek bir isim kutusu" degil, her ortak grup icin ayri bir satir —
 * her biri o grubun **kendi** mevcut degeriyle onceden dolu.
 */
const NicknameDialog = ({
  open,
  onOpenChange,
  contact,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: Contact;
  onSaved: () => void;
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="modal card-solid sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Takma adi duzenle</DialogTitle>
        <DialogDescription>
          Takma isim gruba ozeldir; {contact.name} icin her ortak grupta ayri bir ad
          verebilirsin.
        </DialogDescription>
      </DialogHeader>

      <ul className="flex flex-col gap-2">
        {contact.shared_groups.map((group) => (
          <NicknameRow
            key={group.id}
            group={group}
            contactUserId={contact.user_id}
            onSaved={onSaved}
          />
        ))}
      </ul>

      <DialogFooter className="modal__actions">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Kapat
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

const NicknameRow = ({
  group,
  contactUserId,
  onSaved,
}: {
  group: ContactGroupBalance;
  contactUserId: string;
  onSaved: () => void;
}) => {
  const [draft, setDraft] = useState(group.nickname ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) {
      return;
    }

    setSaving(true);

    try {
      const result = await groupsApi.setMemberNickname(group.id, contactUserId, draft);
      toast.success(
        result.nickname
          ? `${group.name}: takma isim kaydedildi (${result.nickname})`
          : `${group.name}: takma isim kaldirildi`
      );
      onSaved();
    } catch (caught) {
      toast.error(getErrorMessage(caught, 'Takma isim kaydedilemedi'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="flex items-center gap-2">
      <span className="w-28 shrink-0 truncate text-sm text-ink-muted" title={group.name}>
        {group.name}
      </span>
      <Input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void save();
          }
        }}
        maxLength={60}
        placeholder="Bos = kaldir"
        aria-label={`${group.name} icin takma isim`}
        disabled={saving}
        className="h-9 min-w-0 flex-1"
      />
      <Button
        type="button"
        size="icon"
        className="size-9 shrink-0"
        onClick={() => void save()}
        disabled={saving}
        aria-label={`${group.name} icin takma ismi kaydet`}
      >
        <Check className="size-4" aria-hidden />
      </Button>
    </li>
  );
};

/* ------------------------------------------------------------- ortak gruplar */

const SharedGroupsDialog = ({
  open,
  onOpenChange,
  contact,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: Contact;
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="modal card-solid sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Ortak gruplar</DialogTitle>
        <DialogDescription>
          {(contact.nickname ?? contact.name)} ile paylastigin gruplar.
        </DialogDescription>
      </DialogHeader>

      <ul className="flex flex-col gap-1.5">
        {contact.shared_groups.map((group) => {
          const groupCents = centsOf(group.net_balance);
          const groupTone = toneOfCents(groupCents);

          return (
            <li key={group.id}>
              <Link
                to={groupPath(group)}
                className="flex items-center justify-between gap-3 rounded-md px-2 py-2 text-sm hover:bg-ink/5"
              >
                <span className="truncate text-ink">{group.name}</span>
                <span
                  className={groupCents !== 0 ? `balance-text--${groupTone}` : 'text-ink-muted'}
                >
                  {formatCentsAbsolute(groupCents)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <DialogFooter className="modal__actions">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Kapat
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

/* -------------------------------------------------------------- hesabi kapat */

/**
 * "Hesabi kapat" — bu kisiyle olan TUM ortak gruplardaki bakiyeyi tek
 * tiklamayla kapatma niyeti.
 *
 * NEDEN GRUP BASINA AYRI ISTEK, TEK BIR "TOPLU KAPAT" UCU DEGIL
 * -----------------------------------------------------------------
 * Odeme kaydi (`settlements`) her zaman **tek bir gruba** ait — grup sinirini
 * asan bir odeme kaydi kavrami yok (1.6'daki "gruplar arasi mahsuplasma
 * olmaz" kuraliyla ayni gerekce). Aggregate bakiye yalnizca **gosterim**;
 * gercek islem her zaman grup+kisi ciftine ait, o yuzden burada N ayri
 * `POST /groups/:id/settlements` cagrisi var — yeni bir toplu uc yok
 * (istendigi gibi).
 *
 * NEDEN BAZI GRUPLAR ICIN HICBIR SEY YAPILAMIYOR
 * ------------------------------------------------
 * Odeme kaydini yalnizca **borclu** acabilir (`ONLY_DEBTOR`, bkz.
 * settlement.service.ts). Bu kisi bana borcluysa, ben onun adina kayit
 * acamam — sistemde bir "hatirlat" ucu da yok (docs/decisions/1.7.md bunu
 * acik bir madde olarak birakiyor: push bildirimi ayri bir gorev). Bu yuzden
 * o yondeki gruplar icin tek durust secenek, bunu **acikca soylemek** —
 * gonderilmis gibi davranan sahte bir "hatirlatildi" mesaji degil.
 */
type GroupOutcome = { group: ContactGroupBalance; status: 'created' | 'pending_exists' | 'error'; message?: string };

const CloseAccountDialog = ({
  open,
  onOpenChange,
  contact,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: Contact;
  onDone: () => void;
}) => {
  const [pending, setPending] = useState(false);

  const oweGroups = contact.shared_groups.filter((group) => centsOf(group.net_balance) < 0);
  const owedGroups = contact.shared_groups.filter((group) => centsOf(group.net_balance) > 0);
  const displayName = contact.nickname ?? contact.name;

  const confirm = async () => {
    if (pending) {
      return;
    }

    setPending(true);

    const outcomes: GroupOutcome[] = [];

    for (const group of oweGroups) {
      try {
        await settlementsApi.createSettlement(group.id, {
          toUserId: contact.user_id,
          amount: centsToApiAmount(Math.abs(centsOf(group.net_balance))),
        });
        outcomes.push({ group, status: 'created' });
      } catch (caught) {
        const message = getErrorMessage(caught, 'Odeme kaydi olusturulamadi');
        // 409 (zaten bekleyen kayit var) ayri bir uyari hak ediyor: hata degil,
        // az once baskasinin/kendinin ayni islemi zaten yaptigi anlamina gelir.
        const isConflict =
          typeof caught === 'object' && caught !== null && 'response' in caught
            ? (caught as { response?: { status?: number } }).response?.status === 409
            : false;
        outcomes.push({ group, status: isConflict ? 'pending_exists' : 'error', message });
      }
    }

    setPending(false);
    onOpenChange(false);
    reportOutcomes(displayName, outcomes, owedGroups.length);
    onDone();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) {
          onOpenChange(next);
        }
      }}
    >
      <DialogContent className="modal card-solid sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Hesabi kapat</DialogTitle>
          <DialogDescription>{displayName} ile ortak gruplardaki bakiye.</DialogDescription>
        </DialogHeader>

        <ul className="flex flex-col gap-2 text-sm">
          {oweGroups.map((group) => (
            <li key={group.id} className="rounded-md border border-ink/10 px-3 py-2">
              <span className="font-medium text-ink">{group.name}: </span>
              {displayName}&apos;e {formatCentsAbsolute(centsOf(group.net_balance))} odeyeceksin.
            </li>
          ))}

          {owedGroups.map((group) => (
            <li key={group.id} className="rounded-md border border-ink/10 px-3 py-2 text-ink-muted">
              <span className="font-medium text-ink">{group.name}: </span>
              {displayName} sana {formatCentsAbsolute(centsOf(group.net_balance))} borclu — bunu
              onlara hatirlatacak bir ozellik henuz yok, kendin ulasabilirsin.
            </li>
          ))}
        </ul>

        <DialogFooter className="modal__actions">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Vazgec
          </Button>
          {oweGroups.length > 0 ? (
            <Button type="button" onClick={() => void confirm()} disabled={pending} autoFocus>
              {pending ? 'Olusturuluyor...' : 'Odemeleri olustur'}
            </Button>
          ) : (
            <Button type="button" onClick={() => onOpenChange(false)} autoFocus>
              Tamam
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** Islem sonrasi tek/birkac toast: basarili olusturma + carpisan + hatali ayri anlatiliyor. */
const reportOutcomes = (displayName: string, outcomes: GroupOutcome[], owedGroupCount: number): void => {
  const created = outcomes.filter((outcome) => outcome.status === 'created');
  const conflicted = outcomes.filter((outcome) => outcome.status === 'pending_exists');
  const failed = outcomes.filter((outcome) => outcome.status === 'error');

  if (created.length > 0) {
    toast.success(
      created.length === 1
        ? `${displayName} icin odeme olusturuldu (${created[0].group.name})`
        : `${displayName} icin ${created.length} grupta odeme olusturuldu`
    );
  }

  if (conflicted.length > 0) {
    toast.info(
      `${conflicted.map((outcome) => outcome.group.name).join(', ')}: zaten bekleyen bir kayit var`
    );
  }

  if (failed.length > 0) {
    toast.error(`${failed.map((outcome) => outcome.group.name).join(', ')}: odeme olusturulamadi`);
  }

  if (owedGroupCount > 0 && created.length === 0 && conflicted.length === 0 && failed.length === 0) {
    toast.info(`${displayName} sana borclu — ona kendin ulasmalisin`);
  }
};

export default ContactsPage;
