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
import groupsApi from '../api/groups';
import ConfirmDialog from './ConfirmDialog';

import type { Group } from '../types/models';
import type { SubmitEvent } from 'react';

/**
 * "Grup ayarlari" modali — **solid** yuzey (doldurma, ozet degil).
 *
 * Yalnizca owner acabilir; sayfa zaten butonu owner disinda gostermiyor
 * (bkz. GroupDetailPage). Iki bolum:
 *
 *   1. Ad/aciklama formu — `NewGroupModal` ile ayni desen (istemci
 *      dogrulama yalnizca hizli geri bildirim icin, otorite backend).
 *   2. Tehlikeli bolge — grubu silme, `ConfirmDialog` ile ikinci bir onay
 *      arkasinda. Bu modaldan **ayri** bir Dialog: Radix ic ice Dialog'lari
 *      kendi portal/odak tuzagiyla dogru katmanlar, iki katmanli karartma
 *      "onay, ayarlarin ustunde" olarak okunur — bu istenen sey, cunku
 *      silme geri donusu olmayan bir islem ve ayarlar ekrani hala arkada
 *      durdugunu gostermeli.
 */

const MAX_NAME_LENGTH = 120; // group.service.ts -> MAX_NAME_LENGTH
const MAX_DESCRIPTION_LENGTH = 500; // group.service.ts -> MAX_DESCRIPTION_LENGTH

interface GroupSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: Group;
  /**
   * Ad/aciklama kaydedilince cagirilir; **guncel grubu** tasiyor.
   *
   * Bos cagri yetmiyor: ad degisince backend slug'i yeniden uretiyor, yani
   * sayfanin bulundugu adres (`/groups/eski-ad`) artik hicbir gruba
   * cozulmuyor. Cagiran taraf adresi duzeltebilsin diye yeni satir
   * gonderiliyor (bkz. pages/GroupDetailPage.tsx).
   */
  onUpdated: (group: Group) => void;
  /** Grup silinince cagirilir; sayfa /groups'a yonlendirmeli. */
  onDeleted: () => void;
}

const GroupSettingsModal = ({
  open,
  onOpenChange,
  group,
  onUpdated,
  onDeleted,
}: GroupSettingsModalProps) => {
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? '');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const inFlight = useRef(false);

  /* Modal her acilista guncel grubu yansitir: bir onceki acilistan kalan
     taslak yeni bir gruba sizmasin (kullanici baska bir grubun ayarlarini
     acabilir). */
  useEffect(() => {
    if (open) {
      setName(group.name);
      setDescription(group.description ?? '');
      setFieldErrors({});
      setFormError(null);
    }
  }, [open, group.name, group.description]);

  const close = () => {
    if (pending) {
      return;
    }
    onOpenChange(false);
  };

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (inFlight.current) {
      return;
    }

    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    const errors: Record<string, string> = {};

    if (!trimmedName) {
      errors.name = 'Grup adi zorunlu';
    } else if (trimmedName.length > MAX_NAME_LENGTH) {
      errors.name = `Grup adi en fazla ${MAX_NAME_LENGTH} karakter olabilir`;
    }

    if (trimmedDescription.length > MAX_DESCRIPTION_LENGTH) {
      errors.description = `Aciklama en fazla ${MAX_DESCRIPTION_LENGTH} karakter olabilir`;
    }

    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      setFormError(null);
      return;
    }

    inFlight.current = true;
    setFormError(null);
    setPending(true);

    void groupsApi
      .updateGroup(group.id, { name: trimmedName, description: trimmedDescription })
      .then((updated) => {
        onUpdated(updated);
        toast.success('Grup ayarlari kaydedildi');
        onOpenChange(false);
      })
      .catch((caught: unknown) => {
        setFormError(getErrorMessage(caught, 'Grup guncellenemedi'));
        setFieldErrors(getErrorDetails(caught));
      })
      .finally(() => {
        inFlight.current = false;
        setPending(false);
      });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
        <DialogContent className="modal card-solid sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Grup ayarlari</DialogTitle>
            <DialogDescription>Adi, aciklamayi degistir ya da grubu sil.</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="settings-group-name">Grup adi</Label>
              <Input
                id="settings-group-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-invalid={fieldErrors.name ? true : undefined}
                disabled={pending}
                autoFocus
              />
              {fieldErrors.name && (
                <p className="field-error text-sm text-destructive">{fieldErrors.name}</p>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="settings-group-description">Aciklama</Label>
              <Input
                id="settings-group-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                aria-invalid={fieldErrors.description ? true : undefined}
                disabled={pending}
                placeholder="Opsiyonel"
              />
              {fieldErrors.description && (
                <p className="field-error text-sm text-destructive">{fieldErrors.description}</p>
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
                {pending ? 'Kaydediliyor...' : 'Kaydet'}
              </Button>
            </DialogFooter>
          </form>

          {/*
            Tehlikeli bolge: gorsel olarak formdan ayrik, kirmizi cerceveyle
            isaretli. "Sil" burada tek tikla calismaz — ConfirmDialog ikinci
            onayi zorunlu kilar.
          */}
          <div className="danger-zone mt-2 flex items-center justify-between gap-3 rounded-lg border border-destructive/25 bg-destructive/6 p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">Grubu sil</p>
              <p className="text-xs text-ink-muted">Bu islem geri alinamaz.</p>
            </div>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setConfirmDeleteOpen(true)}
              disabled={pending}
            >
              Sil
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <DeleteGroupDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        group={group}
        onDeleted={() => {
          setConfirmDeleteOpen(false);
          onOpenChange(false);
          onDeleted();
        }}
      />
    </>
  );
};

/** Silme onayi — ayri bir bilesende: kendi `pending`/`error` durumunu tasir,
 *  form kismindaki `pending` ile karismasin diye. */
const DeleteGroupDialog = ({
  open,
  onOpenChange,
  group,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: Group;
  onDeleted: () => void;
}) => {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (pending) {
      return;
    }

    setPending(true);
    setError(null);

    try {
      await groupsApi.deleteGroup(group.id);
      toast.success('Grup silindi', { description: group.name });
      onDeleted();
    } catch (caught) {
      setError(getErrorMessage(caught, 'Grup silinemedi'));
    } finally {
      setPending(false);
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setError(null);
        }
      }}
      title="Grubu sil"
      description={`"${group.name}" grubu silinecek. Harcama ve odeme gecmisi saklanir ama grup kimseye gorunmez olur. Bu islem geri alinamaz.`}
      confirmLabel="Grubu sil"
      tone="destructive"
      pending={pending}
      error={error}
      onConfirm={() => void confirm()}
    />
  );
};

export default GroupSettingsModal;
