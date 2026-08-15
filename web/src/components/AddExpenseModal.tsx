import { useEffect, useMemo, useRef, useState } from 'react';
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
import expensesApi from '../api/expenses';
import { centsToApiAmount, formatCents, parseInputToCents } from '../utils/money';
import { equalShares, toSplitDetails, validateSplit } from '../utils/split';

import type { ExpenseSplitType, GroupMember } from '../types/models';
import type { SplitRow } from '../utils/split';
import type { SubmitEvent } from 'react';

/**
 * "Harcama ekle" modali — **solid** yuzey (doldurma yuzeyi, ozet degil).
 *
 * FORM BOLUSME TIPINE GORE DEGISIYOR
 * ----------------------------------
 *   equal      -> yalnizca "kimler dahil" isaret kutulari + kisi basi onizleme
 *   exact      -> her katilimci icin tutar alani + ANLIK toplam karsilastirmasi
 *   percentage -> her katilimci icin yuzde alani + ANLIK %100 karsilastirmasi
 *
 * Uc tipte de katilimci secimi ayni yerde duruyor (isaret kutusu): "bu kisi
 * dahil mi" sorusu bolusme tipinden bagimsiz ve tipi degistirince secimin
 * kaybolmamasi gerekiyor.
 *
 * ANLIK DOGRULAMA NEREDE
 * ----------------------
 * Hesap ve kural `utils/split.ts` icinde, bu dosyada degil. Buradaki tek is
 * sonucu gostermek. Kuralin **otoritesi backend** (`split.service`); istemci
 * kopyasinin gerekcesi ve iki yerde birden dogrulamanin nedeni
 * docs/decisions/2.4.md icinde.
 */

const MAX_DESCRIPTION_LENGTH = 255; // expense.service.ts ile ayni
const DEFAULT_CATEGORY = 'genel'; // expense.service.ts -> DEFAULT_CATEGORY

/** Sik kullanilan kategoriler. Backend serbest metin kabul ediyor; liste yalnizca
 *  yazim birligini korumak icin ("market" / "Market" / "markt" ayrismasin). */
const CATEGORIES = ['genel', 'market', 'yemek', 'ulasim', 'fatura', 'kira', 'eglence'];

const SPLIT_OPTIONS: { value: ExpenseSplitType; label: string; hint: string }[] = [
  { value: 'equal', label: 'Esit', hint: 'Secili kisiler arasinda esit bolunur' },
  { value: 'exact', label: 'Ozel tutar', hint: 'Her kisinin tutarini sen yazarsin' },
  { value: 'percentage', label: 'Yuzde', hint: 'Her kisinin yuzdesini sen yazarsin' },
];

interface AddExpenseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  members: GroupMember[];
  currentUserId: string;
  /** Harcama eklendikten sonra listeyi **ve bakiyeleri** tazelemek icin. */
  onCreated: () => void;
}

const AddExpenseModal = ({
  open,
  onOpenChange,
  groupId,
  members,
  currentUserId,
  onCreated,
}: AddExpenseModalProps) => {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(DEFAULT_CATEGORY);
  const [paidBy, setPaidBy] = useState(currentUserId);
  const [splitType, setSplitType] = useState<ExpenseSplitType>('equal');
  const [rows, setRows] = useState<SplitRow[]>([]);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Cift gonderim korumasi: `disabled` bir sonraki render'da uygulanir, iki hizli
  // tik ayni render doneminde iki POST uretebilirdi (2.3'teki gerekcenin aynisi)
  // ve sonuc ayni tutarda iki harcama olurdu — backend bunu engellemez.
  const inFlight = useRef(false);

  const memberKey = members.map((member) => member.user_id).join(',');

  /* Modal her acilista temiz baslar: bir onceki denemenin tutari ya da secimi
     yeni harcamaya sizmamali. */
  useEffect(() => {
    if (!open) {
      return;
    }

    setAmount('');
    setDescription('');
    setCategory(DEFAULT_CATEGORY);
    setPaidBy(currentUserId);
    setSplitType('equal');
    setRows(members.map((member) => ({ userId: member.user_id, value: '', included: true })));
    setFieldErrors({});
    setFormError(null);
    // memberKey uye listesinin icerigini temsil ediyor; dizi kimligi her
    // render'da degisse bile efekt bosuna tekrar calismaz.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, memberKey, currentUserId]);

  const nameOf = useMemo(() => {
    const names = new Map(members.map((member) => [member.user_id, member.name]));
    return (userId: string) => names.get(userId) ?? 'Bilinmeyen uye';
  }, [members]);

  const amountCents = parseInputToCents(amount);

  /* ANLIK DOGRULAMA: her tusa basista yeniden hesaplanir, istek yok. */
  const validation = validateSplit(splitType, amountCents, rows);

  /** `equal` onizlemesi — backend'in kaydedecegi degerin aynisi. */
  const preview = useMemo(() => {
    if (splitType !== 'equal' || amountCents === null) {
      return null;
    }

    return equalShares(
      amountCents,
      rows.filter((row) => row.included).map((row) => row.userId)
    );
  }, [splitType, amountCents, rows]);

  const updateRow = (userId: string, patch: Partial<SplitRow>) => {
    setRows((current) =>
      current.map((row) => (row.userId === userId ? { ...row, ...patch } : row))
    );
  };

  /** Secili katilimcilara esit dagitir — "hepsini elle yaz"in kisayolu. */
  const distributeEvenly = () => {
    const included = rows.filter((row) => row.included).map((row) => row.userId);

    if (included.length === 0) {
      return;
    }

    // Yuzde de para gibi tam sayi uzerinden dagitiliyor: 10000 baz puan = %100.
    // Ayni fonksiyon, cunku problem ayni — kalan birimleri kimseye iki kez
    // vermeden dagitmak.
    const total = splitType === 'percentage' ? 10_000 : (amountCents ?? 0);
    const distribution = equalShares(total, included);

    setRows((current) =>
      current.map((row) =>
        row.included && distribution.has(row.userId)
          ? { ...row, value: centsToApiAmount(distribution.get(row.userId) as number) }
          : row
      )
    );
  };

  const close = () => {
    onOpenChange(false);
  };

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (inFlight.current) {
      return;
    }

    const errors: Record<string, string> = {};
    const trimmedDescription = description.trim();

    // Istemci kontrolu hizli geri bildirim icin; otorite yine backend
    // (`expense.service`). Mesajlar bilerek ayni cumleler.
    if (!trimmedDescription) {
      errors.description = 'Aciklama zorunlu';
    } else if (trimmedDescription.length > MAX_DESCRIPTION_LENGTH) {
      errors.description = `Aciklama en fazla ${MAX_DESCRIPTION_LENGTH} karakter olabilir`;
    }

    if (amountCents === null) {
      errors.amount = 'Tutar en fazla iki ondalikli pozitif bir sayi olmali';
    } else if (amountCents === 0) {
      errors.amount = 'Tutar sifirdan buyuk olmali';
    }

    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      setFormError(null);
      return;
    }

    // Toplam tutmuyorsa istek hic atilmiyor: backend zaten 400 dondururdu ama
    // kullaniciyi bir ag gidis-donusu bekletmenin bir faydasi yok.
    if (!validation.valid) {
      setFormError(`Bolusme tamamlanmadi: ${validation.message}`);
      return;
    }

    inFlight.current = true;
    setFormError(null);
    setPending(true);

    void expensesApi
      .createExpense(groupId, {
        amount: centsToApiAmount(amountCents as number),
        description: trimmedDescription,
        category: category.trim() || DEFAULT_CATEGORY,
        paidBy,
        splitType,
        splitDetails: toSplitDetails(splitType, rows),
      })
      .then(() => {
        onCreated();
        close();
        toast.success('Harcama eklendi', { description: trimmedDescription });
      })
      .catch((caught: unknown) => {
        setFormError(getErrorMessage(caught, 'Harcama eklenemedi'));
        setFieldErrors(getErrorDetails(caught));
      })
      .finally(() => {
        inFlight.current = false;
        setPending(false);
      });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="modal card-solid max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Harcama ekle</DialogTitle>
          <DialogDescription>
            Tutar ve bolusme kaydedildikten hemen sonra bakiyelere yansir.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="expense-description">Aciklama</Label>
            <Input
              id="expense-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              aria-invalid={fieldErrors.description ? true : undefined}
              disabled={pending}
              autoFocus
            />
            {fieldErrors.description && (
              <p className="field-error text-sm text-destructive">{fieldErrors.description}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="expense-amount">Tutar (₺)</Label>
              <Input
                id="expense-amount"
                /*
                  type="number" degil: tarayici sayi alani ondalik ayraci ve
                  kaydirma tekerlegi davranisini kendi belirler; "12,50" yazan
                  bir kullanicinin degeri sessizce bosalirdi. Metin olarak alinip
                  `utils/money` icinde ayristiriliyor.
                */
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                aria-invalid={fieldErrors.amount ? true : undefined}
                disabled={pending}
                placeholder="0,00"
              />
              {fieldErrors.amount && (
                <p className="field-error text-sm text-destructive">{fieldErrors.amount}</p>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="expense-category">Kategori</Label>
              <select
                id="expense-category"
                className="h-9 rounded-md border border-input bg-white px-3 text-sm"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                disabled={pending}
              >
                {CATEGORIES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="expense-paid-by">Kim odedi</Label>
            <select
              id="expense-paid-by"
              className="h-9 rounded-md border border-input bg-white px-3 text-sm"
              value={paidBy}
              onChange={(event) => setPaidBy(event.target.value)}
              disabled={pending}
            >
              {members.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.user_id === currentUserId ? `${member.name} (sen)` : member.name}
                </option>
              ))}
            </select>
            {fieldErrors.paidBy && (
              <p className="field-error text-sm text-destructive">{fieldErrors.paidBy}</p>
            )}
          </div>

          {/* ---------------------------------------------- bolusme tipi */}
          <fieldset className="grid gap-2" disabled={pending}>
            <legend className="mb-1 text-sm font-medium text-ink">Bolusme</legend>

            <div className="split-type flex flex-wrap gap-2" role="radiogroup" aria-label="Bolusme">
              {SPLIT_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`split-type__option flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${
                    splitType === option.value
                      ? 'border-rose bg-rose/10 text-rose'
                      : 'border-blush text-ink-muted'
                  }`}
                >
                  <input
                    type="radio"
                    name="splitType"
                    value={option.value}
                    checked={splitType === option.value}
                    onChange={() => setSplitType(option.value)}
                    className="sr-only"
                  />
                  {option.label}
                </label>
              ))}
            </div>

            <p className="text-xs text-ink-muted">
              {SPLIT_OPTIONS.find((option) => option.value === splitType)?.hint}
            </p>
          </fieldset>

          {/* -------------------------------------- katilimcilar (dinamik) */}
          <div className="split-rows flex flex-col gap-1.5">
            {rows.map((row) => (
              <div
                key={row.userId}
                className="split-row flex items-center justify-between gap-3 rounded-md border border-blush/60 px-3 py-2"
              >
                <label className="flex min-w-0 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={row.included}
                    onChange={(event) => updateRow(row.userId, { included: event.target.checked })}
                    disabled={pending}
                    aria-label={`${nameOf(row.userId)} dahil`}
                  />
                  <span className="truncate">
                    {row.userId === currentUserId ? `${nameOf(row.userId)} (sen)` : nameOf(row.userId)}
                  </span>
                </label>

                {splitType === 'equal' ? (
                  <span className="split-row__preview shrink-0 text-sm text-ink-muted">
                    {row.included && preview?.has(row.userId)
                      ? formatCents(preview.get(row.userId) as number)
                      : '—'}
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-1">
                    <Input
                      className="h-8 w-24 text-right"
                      inputMode="decimal"
                      value={row.value}
                      onChange={(event) => updateRow(row.userId, { value: event.target.value })}
                      disabled={pending || !row.included}
                      aria-label={`${nameOf(row.userId)} ${
                        splitType === 'exact' ? 'tutari' : 'yuzdesi'
                      }`}
                      aria-invalid={
                        validation.invalidRows.includes(row.userId) ? true : undefined
                      }
                      placeholder={splitType === 'exact' ? '0,00' : '0'}
                    />
                    <span className="w-3 text-sm text-ink-muted">
                      {splitType === 'exact' ? '₺' : '%'}
                    </span>
                  </span>
                )}
              </div>
            ))}

            {splitType !== 'equal' && (
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={distributeEvenly}
                  disabled={pending}
                >
                  Esit dagit
                </Button>
              </div>
            )}
          </div>

          {/*
            ANLIK TOPLAM SATIRI.
            `role="status"` + `aria-live="polite"`: ekran okuyucu kullanicisi da
            toplamin tuttugunu/tutmadigini alan degisir degismez duyar. Renk
            burada da bilgiyi tasimiyor — metin her zaman yazili (2.3'teki kural).
          */}
          <p
            className={`split-summary rounded-md px-3 py-2 text-sm ${
              validation.tone === 'ok'
                ? 'split-summary--ok bg-signal-positive/8 text-signal-positive'
                : validation.tone === 'warn'
                  ? 'split-summary--warn bg-ink/5 text-ink-muted'
                  : 'split-summary--error bg-destructive/8 text-destructive'
            }`}
            role="status"
            aria-live="polite"
          >
            {validation.message}
          </p>

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
              {pending ? 'Ekleniyor...' : 'Ekle'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddExpenseModal;
