import { useEffect, useRef, useState } from 'react';

import { getErrorDetails, getErrorMessage } from '../api/client';
import groupsApi from '../api/groups';

import type { SubmitEvent } from 'react';

/**
 * "Yeni grup" modali.
 *
 * Kayit/giris formlarindaki `useAuthForm` burada **kullanilmiyor**: o hook
 * sayfa formlarina ozgu (yonlendirme, alan kilitleme). Modal'in ihtiyaci daha
 * dar — tek alan, bir istek, kapanma. Ortak bir soyutlamaya zorlamak iki
 * kullanimin da isini zorlastirirdi.
 *
 * Cift gonderim korumasi ayni gerekceyle burada da `useRef` ile: `disabled`
 * bir sonraki render'da uygulanir, iki hizli tik ayni render doneminde iki
 * `POST /groups` uretebilirdi — sonuc ayni isimde iki grup olurdu ve backend
 * bunu engellemez (grup adi unique degil, olmasi da gerekmiyor).
 */

const MAX_NAME_LENGTH = 120; // group.service.ts -> MAX_NAME_LENGTH

interface NewGroupModalProps {
  onClose: () => void;
  /** Grup olustuktan sonra listeyi tazelemek icin. */
  onCreated: () => void;
}

const NewGroupModal = ({ onClose, onCreated }: NewGroupModalProps) => {
  const [name, setName] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const inFlight = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Modal acilinca odak alana gitsin: klavye kullanicisi Tab'a basarak
  // arkadaki sayfayi dolasmak zorunda kalmasin.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Escape ile kapanma. Modal'in disina tiklamak da kapatiyor (overlay).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

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
        onClose();
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
    // Overlay'e tiklamak kapatir. Bu bir **kolaylik**; klavye yolu Escape ile
    // ayrica saglaniyor, yani tiklamayi kullanamayan biri kapali kalmiyor.
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-group-title"
        // Icerige tiklamak kapatmamali; olay overlay'e cikmadan durur.
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="new-group-title">Yeni grup</h2>

        <form onSubmit={handleSubmit} noValidate>
          <label htmlFor="group-name">Grup adi</label>
          <input
            id="group-name"
            name="name"
            ref={inputRef}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setFieldError(null);
            }}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? 'group-name-error' : undefined}
            disabled={pending}
          />
          {fieldError && (
            <p className="field-error" id="group-name-error">
              {fieldError}
            </p>
          )}

          {formError && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}

          <div className="modal__actions">
            <button type="button" className="button--ghost" onClick={onClose} disabled={pending}>
              Vazgec
            </button>
            <button type="submit" disabled={pending}>
              {pending ? 'Olusturuluyor...' : 'Olustur'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewGroupModal;
