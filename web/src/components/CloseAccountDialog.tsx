import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getErrorMessage } from '../api/client';
import settlementsApi from '../api/settlements';
import { centsToApiAmount, formatCentsAbsolute, parseAmountToCents } from '../utils/money';

import type { Contact, ContactGroupBalance } from '../types/models';

/**
 * "Hesabi kapat" — bu kisiyle olan TUM ortak gruplardaki bakiyeyi tek
 * tiklamayla kapatma niyeti.
 *
 * Kisiler sayfasinda dogdu (docs/decisions/kisiler-sayfasi.md), Home > "Seni
 * bekleyenler"deki BRC satirlari da **ayni bilesen ve ayni aksiyonu** kullaniyor
 * (docs/decisions/3.13-home-seni-bekleyenler.md) — orada `contact.shared_groups`
 * tek elemanli (yalnizca o satirin grubu).
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

const centsOf = (value: string): number => parseAmountToCents(value) ?? 0;

type GroupOutcome = {
  group: ContactGroupBalance;
  status: 'created' | 'pending_exists' | 'error';
  message?: string;
};

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

export default CloseAccountDialog;
