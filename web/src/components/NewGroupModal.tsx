import { useRef, useState } from 'react';
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
import groupsApi from '../api/groups';

import type { SubmitEvent } from 'react';

/**
 * "Yeni grup" modali — **solid** yuzey.
 *
 * Neden solid: modal bir *doldurma* yuzeyi, ozet degil. Cam zemin uzerinde
 * metin alani okumayi zorlastirirdi; imza parilti burada yok.
 *
 * Kayit/giris formlarindaki `useAuthForm` burada kullanilmiyor: o hook sayfa
 * formlarina ozgu (yonlendirme, alan kilitleme). Modal'in ihtiyaci daha dar —
 * tek alan, bir istek, kapanma.
 *
 * Cift gonderim korumasi yine `useRef` ile: `disabled` bir sonraki render'da
 * uygulanir, iki hizli tik ayni render doneminde iki `POST /groups` uretebilirdi
 * ve sonuc ayni isimde iki grup olurdu — backend bunu engellemez (grup adi
 * unique degil, olmasi da gerekmiyor).
 */

const MAX_NAME_LENGTH = 120; // group.service.ts -> MAX_NAME_LENGTH

interface NewGroupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Grup olustuktan sonra listeyi tazelemek icin. */
  onCreated: () => void;
}

const NewGroupModal = ({ open, onOpenChange, onCreated }: NewGroupModalProps) => {
  const [name, setName] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const inFlight = useRef(false);

  const close = () => {
    onOpenChange(false);
    setName('');
    setFieldError(null);
    setFormError(null);
  };

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (inFlight.current) {
      return;
    }

    const trimmed = name.trim();

    // Istemci kontrolu yine yalnizca hizli geri bildirim icin; otorite backend
    // (`validateCreateInput`). Bkz. docs/decisions/2.2.md.
    if (!trimmed) {
      setFieldError('Grup adi zorunlu');
      return;
    }

    if (trimmed.length > MAX_NAME_LENGTH) {
      setFieldError(`Grup adi en fazla ${MAX_NAME_LENGTH} karakter olabilir`);
      return;
    }

    inFlight.current = true;
    setFieldError(null);
    setFormError(null);
    setPending(true);

    void groupsApi
      .createGroup({ name: trimmed })
      .then(() => {
        onCreated();
        close();
        // Modal kapandigi icin mesaji gosterecek bir yer kalmiyor; toast tam
        // olarak bu bosluk icin. Kart ici aksiyonlarda (davet kopyalama) ise
        // yerinde `role="status"` metni kullaniliyor — orada gorunur bir slot var.
        toast.success('Grup olusturuldu', { description: trimmed });
      })
      .catch((caught: unknown) => {
        setFormError(getErrorMessage(caught, 'Grup olusturulamadi'));
        setFieldError(getErrorDetails(caught).name ?? null);
      })
      .finally(() => {
        inFlight.current = false;
        setPending(false);
      });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      {/* `modal` sinifi 2.3'ten korunuyor: stil disi kancalarin adi degismesin. */}
      <DialogContent className="modal card-solid sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Yeni grup</DialogTitle>
          <DialogDescription>
            Ev, tatil ya da proje — harcamalari birlikte takip edeceginiz bir alan.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="group-name">Grup adi</Label>
            <Input
              id="group-name"
              name="name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setFieldError(null);
              }}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? 'group-name-error' : undefined}
              disabled={pending}
              autoFocus
            />
            {fieldError && (
              <p className="field-error text-sm text-destructive" id="group-name-error">
                {fieldError}
              </p>
            )}
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
            <Button type="submit" disabled={pending}>
              {pending ? 'Olusturuluyor...' : 'Olustur'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default NewGroupModal;
