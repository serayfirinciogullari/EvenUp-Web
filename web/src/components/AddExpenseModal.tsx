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
import {
  equalShares,
  MIN_SPLIT_COUNT,
  toApiSplitType,
  toSplitDetails,
  validateCount,
  validateSplit,
} from '../utils/split';

import type { GroupMember } from '../types/models';
import type { SplitMode, SplitRow } from '../utils/split';
import type { SubmitEvent } from 'react';

/**
 * "Harcama ekle" modali — **solid** yuzey (doldurma yuzeyi, ozet degil).
 *
 * FORM BOLUSME MODUNA GORE DEGISIYOR
 * ----------------------------------
 *   equal -> yalnizca "kimler dahil" isaret kutulari + kisi basi onizleme
 *   exact -> her katilimci icin tutar alani + ANLIK toplam karsilastirmasi
 *   count -> once "kaca bolunsun?", sonra tam o sayida kisi isaretlenmesi
 *
 * "Kaca Bol" (`count`) ayri bir **bolusme tipi degil**: backend'e `equal`
 * olarak, secilen kisilerin listesiyle gider. Yani yeni bir hesap yolu yok,
 * yalnizca yeni bir secim akisi. Gerekce ve yuzdeli bolusmenin neden
 * kaldirildigi: docs/decisions/bolusum-basitlestirme.md
 *
 * IKI AYRI SECIM DURUMU — BILEREK
 * -------------------------------
 * `rows[].included` (equal/exact) ile `countSelection` (kaca bol) ayri
 * tutuluyor. Ayni duruma baglansalardi mod degistiren kullanicinin secimi
 * digerine sizardi: "Esit"te hepsi isaretli oldugu icin "Kaca Bol"e gecen
 * kullanici formu daha ilk anda hatali bulurdu ("2'ye bolunecek, 4 kisi
 * secildi"). Iki listenin isaret kutulari ayni gorunuyor ama ayni soruyu
 * sormuyor: biri "bu kisi dahil mi", digeri "bu kisi o N kisiden biri mi".
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

const SPLIT_OPTIONS: { value: SplitMode; label: string; hint: string }[] = [
  { value: 'equal', label: 'Esit', hint: 'Secili kisiler arasinda esit bolunur' },
  { value: 'exact', label: 'Ozel tutar', hint: 'Her kisinin tutarini sen yazarsin' },
  {
    value: 'count',
    label: 'Kaca Bol',
    hint: 'Once kaca bolunecegini sec, sonra tam o kadar kisi isaretle',
  },
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
  const [splitMode, setSplitMode] = useState<SplitMode>('equal');
  const [rows, setRows] = useState<SplitRow[]>([]);

  /** "Kaca Bol": bolen sayisi ve o sayida olmasi gereken secim. */
  const [splitCount, setSplitCount] = useState(MIN_SPLIT_COUNT);
  const [countSelection, setCountSelection] = useState<string[]>([]);

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
    setSplitMode('equal');
    setRows(members.map((member) => ({ userId: member.user_id, value: '', included: true })));
    setSplitCount(MIN_SPLIT_COUNT);
    setCountSelection([]);
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

  /*
    Iki kisiden az uyesi olan grupta "kaca bol" sorusunun cevabi yok; secenek
    hic gosterilmiyor. Gosterip devre disi birakmak, cozumu olmayan bir engeli
    ekranda tutmak olurdu.
  */
  const countAvailable = members.length >= MIN_SPLIT_COUNT;
  const splitOptions = SPLIT_OPTIONS.filter(
    (option) => option.value !== 'count' || countAvailable
  );

  /*
    Secim listesi her zaman uye sirasinda: `countSelection` tiklama sirasini
    tutuyor, istege ve onizlemeye giden liste ise ekranda gorunen sirayla
    gitsin — ayni secim her zaman ayni govdeyi uretsin.
  */
  const selectedForCount = useMemo(
    () => rows.filter((row) => countSelection.includes(row.userId)).map((row) => row.userId),
    [rows, countSelection]
  );

  /* ANLIK DOGRULAMA: her tusa basista yeniden hesaplanir, istek yok. */
  const validation =
    splitMode === 'count'
      ? validateCount(splitCount, selectedForCount)
      : validateSplit(splitMode, amountCents, rows);

  /**
   * Kisi basi onizleme — backend'in kaydedecegi degerin aynisi.
   *
   * `count` modunda yalnizca secim tamamlaninca gosteriliyor: 3'e bolunecek bir
   * harcamada 2 kisi isaretliyken "50,00 ₺" yazmak, kaydedilmeyecek bir tutari
   * kaydedilecekmis gibi gosterirdi.
   */
  const preview = useMemo(() => {
    if (amountCents === null) {
      return null;
    }

    if (splitMode === 'equal') {
      return equalShares(
        amountCents,
        rows.filter((row) => row.included).map((row) => row.userId)
      );
    }

    if (splitMode === 'count' && selectedForCount.length === splitCount) {
      return equalShares(amountCents, selectedForCount);
    }

    return null;
  }, [splitMode, amountCents, rows, selectedForCount, splitCount]);

  const updateRow = (userId: string, patch: Partial<SplitRow>) => {
    setRows((current) =>
      current.map((row) => (row.userId === userId ? { ...row, ...patch } : row))
    );
  };

  const toggleCountSelection = (userId: string) => {
    setCountSelection((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]
    );
  };

  /** Secili katilimcilara esit dagitir — "hepsini elle yaz"in kisayolu. */
  const distributeEvenly = () => {
    const included = rows.filter((row) => row.included).map((row) => row.userId);

    if (included.length === 0) {
      return;
    }

    const distribution = equalShares(amountCents ?? 0, included);

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
        splitType: toApiSplitType(splitMode),
        splitDetails: toSplitDetails(splitMode, rows, selectedForCount),
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
                className="h-9 rounded-md border border-input bg-surface px-3 text-sm"
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
              className="h-9 rounded-md border border-input bg-surface px-3 text-sm"
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
              {splitOptions.map((option) => (
                <label
                  key={option.value}
                  className={`split-type__option flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${
                    splitMode === option.value
                      ? 'border-rose bg-rose/10 text-rose'
                      : 'border-blush text-ink-muted'
                  }`}
                >
                  <input
                    type="radio"
                    name="splitType"
                    value={option.value}
                    checked={splitMode === option.value}
                    onChange={() => setSplitMode(option.value)}
                    className="sr-only"
                  />
                  {option.label}
                </label>
              ))}
            </div>

            <p className="text-xs text-ink-muted">
              {splitOptions.find((option) => option.value === splitMode)?.hint}
            </p>
          </fieldset>

          {/*
            "KACA BOL" — ONCE SAYI, SONRA KISILER.
            Sayi secimi listenin ustunde duruyor cunku altindaki isaret
            kutularinin kac tane isaretlenecegini o belirliyor; tersi sirada
            kullanici once secip sonra "yanlis sayida secmisim" derdi.
          */}
          {splitMode === 'count' && (
            <div className="split-count grid gap-1.5">
              <Label htmlFor="expense-split-count">Kaca bolunsun?</Label>
              <select
                id="expense-split-count"
                className="h-9 w-28 rounded-md border border-input bg-surface px-3 text-sm"
                value={splitCount}
                onChange={(event) => setSplitCount(Number(event.target.value))}
                disabled={pending}
              >
                {Array.from(
                  { length: members.length - MIN_SPLIT_COUNT + 1 },
                  (_, index) => index + MIN_SPLIT_COUNT
                ).map((option) => (
                  <option key={option} value={option}>
                    {option} kisi
                  </option>
                ))}
              </select>
              <p className="text-xs text-ink-muted">
                Tutar, isaretledigin {splitCount} kisi arasinda esit bolunur.
              </p>
            </div>
          )}

          {/* -------------------------------------- katilimcilar (dinamik) */}
          <div className="split-rows flex flex-col gap-1.5">
            {rows.map((row) => {
              const selected =
                splitMode === 'count' ? countSelection.includes(row.userId) : row.included;
              const name = nameOf(row.userId);

              return (
                <div
                  key={row.userId}
                  className="split-row flex items-center justify-between gap-3 rounded-md border border-blush/60 px-3 py-2"
                >
                  <label className="flex min-w-0 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(event) =>
                        splitMode === 'count'
                          ? toggleCountSelection(row.userId)
                          : updateRow(row.userId, { included: event.target.checked })
                      }
                      disabled={pending}
                      /*
                        Iki liste ayni gorunuyor ama ayni soruyu sormuyor;
                        ekran okuyucu icin de ayri okunmalari gerekiyor.
                      */
                      aria-label={`${name} ${splitMode === 'count' ? 'secili' : 'dahil'}`}
                    />
                    <span className="truncate">
                      {row.userId === currentUserId ? `${name} (sen)` : name}
                    </span>
                  </label>

                  {splitMode === 'exact' ? (
                    <span className="flex shrink-0 items-center gap-1">
                      <Input
                        className="h-8 w-24 text-right"
                        inputMode="decimal"
                        value={row.value}
                        onChange={(event) => updateRow(row.userId, { value: event.target.value })}
                        disabled={pending || !row.included}
                        aria-label={`${name} tutari`}
                        aria-invalid={
                          validation.invalidRows.includes(row.userId) ? true : undefined
                        }
                        placeholder="0,00"
                      />
                      <span className="w-3 text-sm text-ink-muted">₺</span>
                    </span>
                  ) : (
                    <span className="split-row__preview shrink-0 text-sm text-ink-muted">
                      {selected && preview?.has(row.userId)
                        ? formatCents(preview.get(row.userId) as number)
                        : '—'}
                    </span>
                  )}
                </div>
              );
            })}

            {splitMode === 'exact' && (
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
