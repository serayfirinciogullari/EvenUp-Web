import { useEffect, useRef, useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getErrorDetails, getErrorMessage } from '../api/client';
import settlementsApi from '../api/settlements';
import { centsToApiAmount, formatCents, parseInputToCents } from '../utils/money';
import { dative } from '../utils/turkish';

import type { Settlement } from '../types/models';
import type { SubmitEvent } from 'react';

/**
 * "Ode" modali — **solid** yuzey (doldurma yuzeyi).
 *
 * Ne yapiyor: borclu tarafin "su kisiye su kadar odedim" **bildirimini** acar.
 * Bu bir tahsilat degil bir beyan: kayit `pending` baslar ve bakiyeye hicbir
 * etkisi olmaz. Bakiye ancak alacakli onaylayinca degisir (docs/decisions/1.7.md).
 *
 * Metinler bunu bilerek soyluyor ("odedigini bildir", "onay bekleyecek");
 * "Odendi" gibi bir cumle, karsi taraf onaylamadan hesabin kapandigi izlenimi
 * verirdi.
 */

export interface SettleTarget {
  /** Alacakli — odemeyi alacak kisi. */
  userId: string;
  name: string;
  /** Netlestirmenin onerdigi tutar (kurus). Kullanici degistirebilir. */
  suggestedCents: number;
}

interface SettleUpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  target: SettleTarget | null;
  /**
   * Kayit olusunca sunucunun donduru **gercek** satirla cagrilir.
   *
   * Bos bir bildirim degil, tam nesne: cagiran taraf (GroupDetailPage) bunu
   * bekleyen odemeler listesine iyimser olarak ekleyebiliyor — ikinci bir
   * `GET` beklemeden. Gerekce: docs/decisions/optimistic-ui-duzeltme.md.
   */
  onCreated: (settlement: Settlement) => void;
}

const SettleUpModal = ({ open, onOpenChange, groupId, target, onCreated }: SettleUpModalProps) => {
  const [amount, setAmount] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const inFlight = useRef(false);

  /*
    Tutar onerilen degerle dolu aciliyor ama **kilitli degil**: kismi odeme
    gercek bir senaryo ("300'un 100'unu simdi verdim") ve backend de kismi
    tutari kabul edip bakiyeye kismi yansitiyor.
  */
  useEffect(() => {
    if (!open || !target) {
      return;
    }

    setAmount(centsToApiAmount(target.suggestedCents));
    setFieldError(null);
    setFormError(null);
  }, [open, target]);

  const close = () => {
    onOpenChange(false);
  };

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (inFlight.current || !target) {
      return;
    }

    const cents = parseInputToCents(amount);

    if (cents === null) {
      setFieldError('Tutar en fazla iki ondalikli pozitif bir sayi olmali');
      return;
    }

    if (cents === 0) {
      setFieldError('Tutar sifirdan buyuk olmali');
      return;
    }

    inFlight.current = true;
    setFieldError(null);
    setFormError(null);
    setPending(true);

    void settlementsApi
      .createSettlement(groupId, { toUserId: target.userId, amount: centsToApiAmount(cents) })
      .then((settlement) => {
        onCreated(settlement);
        close();
        toast.success('Odeme bildirildi', {
          description: `${target.name} onaylayinca bakiyeye islenecek.`,
        });
      })
      .catch((caught: unknown) => {
        // 409: bu kisiye zaten bekleyen bir kayit var. Mesaj backend'den geliyor
        // ve zaten "once onun sonuclanmasi gerekiyor" diyor.
        setFormError(getErrorMessage(caught, 'Odeme kaydi olusturulamadi'));
        setFieldError(getErrorDetails(caught).amount ?? null);
      })
      .finally(() => {
        inFlight.current = false;
        setPending(false);
      });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="modal card-solid sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Odemeyi bildir</DialogTitle>
          <DialogDescription>
            {target
              ? `${dative(target.name)} odedigini bildiriyorsun. Kayit, ${target.name} onaylayana kadar bakiyeyi degistirmez.`
              : 'Odeme yapilacak kisi secilmedi.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="settle-amount">Tutar (₺)</Label>
            <Input
              id="settle-amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                setFieldError(null);
              }}
              aria-invalid={fieldError ? true : undefined}
              disabled={pending}
              autoFocus
            />
            {target && (
              <p className="text-xs text-ink-muted">
                Onerilen tutar {formatCents(target.suggestedCents)} — kismi odeme icin
                degistirebilirsin.
              </p>
            )}
            {fieldError && <p className="field-error text-sm text-destructive">{fieldError}</p>}
          </div>

          {formError && (
            <p
              className="form-error rounded-md border border-destructive/25 bg-destructive/8 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {formError}
            </p>
          )}

          <DialogFooter className="modal__actions">
            <Button type="button" variant="ghost" onClick={close} disabled={pending}>
              Vazgec
            </Button>
            <Button type="submit" disabled={pending || !target}>
              {pending ? 'Gonderiliyor...' : 'Odedim'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default SettleUpModal;
