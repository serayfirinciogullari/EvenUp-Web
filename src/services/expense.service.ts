import expenseModel from '../models/expense.model';
import groupModel from '../models/group.model';
import messageModel from '../models/message.model';
import ApiError from '../utils/ApiError';
import { parseAmountToCents } from '../utils/money';
import {
  buildPagination,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  parsePagination,
} from '../utils/pagination';
import { isUuid } from '../utils/uuid';
import { ACCESS_DENIED, requireMembership } from './group.service';
import { computeShares, SplitError, SPLIT_TYPES } from './split.service';

import type { ExpenseWithShares } from '../models/expense.model';
import type { GroupMemberRow } from '../types/models';
import type { PageQuery, Pagination } from '../utils/pagination';
import type { ShareAllocation, SplitInput, SplitType } from './split.service';

/**
 * Harcama is mantigi: validasyon, yetkilendirme ve bolusturme.
 *
 * YETKILENDIRME
 * -------------
 * 1.4'te kurulan kapidan gecer: grup baglami isteyen her islem once
 * `requireMembership` cagirir. Yani grubun uyesi olmayan biri harcamalari
 * ne gorebilir ne de ekleyebilir; sadece "uye degilsin" degil, harcamanin
 * varligi bile sizmaz (bkz. asagidaki `loadEditable`).
 *
 * PARA
 * ----
 * Hesaplarin tamami tam sayi kurus uzerinden yapilir; TL <-> kurus cevrimi
 * `utils/money` icinde tek noktada. Bolusturme algoritmalari saf
 * `split.service` modulunde. Gerekce: docs/decisions/1.5.md
 */

const MAX_DESCRIPTION_LENGTH = 255; // expenses.description kolonu ile ayni
const MAX_CATEGORY_LENGTH = 60; // expenses.category kolonu ile ayni
const DEFAULT_CATEGORY = 'genel';

/** Duzenleme/silme yetkisi olmayan uyeye donen mesaj. */
const NOT_EDITABLE = 'Bu harcamayi yalnizca ekleyen kisi ya da grup sahibi degistirebilir';

/* --------------------------------------------------------------- tipler */

/** Response'a konulabilecek harcama gorunumu — `deleted_at` disarida kalir. */
export type PublicExpense = Omit<ExpenseWithShares, 'deleted_at'>;

export interface ExpenseListResult {
  expenses: PublicExpense[];
  pagination: Pagination;
}

export type ListQuery = PageQuery;

/* ---------------------------------------------------------- yardimcilar */

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const toPublicExpense = (expense: ExpenseWithShares): PublicExpense => {
  const { deleted_at: _deletedAt, ...publicFields } = expense;
  return publicFields;
};

/** Toplanan alan hatalariyla 400 firlatir. Fonksiyon bildirimi olarak yazildi
 *  ki TypeScript cagriden sonrasini erisilemez kabul etsin. */
function fail(errors: Record<string, string>, message = 'Gecersiz harcama bilgileri'): never {
  throw ApiError.badRequest(message, errors);
}

/* ------------------------------------------------------------ validasyon */

const validateDescription = (value: unknown, errors: Record<string, string>): string => {
  const description = asString(value).trim();

  if (!description) {
    errors.description = 'Aciklama zorunlu';
  } else if (description.length > MAX_DESCRIPTION_LENGTH) {
    errors.description = `Aciklama en fazla ${MAX_DESCRIPTION_LENGTH} karakter olabilir`;
  }

  return description;
};

const validateCategory = (value: unknown, errors: Record<string, string>): string => {
  const category = asString(value).trim();

  if (!category) {
    // Her harcamayi siniflandirmaya zorlamak giris akisini yavaslatir.
    return DEFAULT_CATEGORY;
  }

  if (category.length > MAX_CATEGORY_LENGTH) {
    errors.category = `Kategori en fazla ${MAX_CATEGORY_LENGTH} karakter olabilir`;
  }

  return category;
};

/**
 * Tutari kurusa cevirir. `parseAmountToCents` 2 ondalikten fazlasini ve
 * float artigi tasiyan degerleri (`0.30000000000000004`) reddeder; sessizce
 * yuvarlamak, kullanicinin gordugu tutarla kaydedilen tutari ayirirdi.
 */
const validateAmount = (value: unknown, errors: Record<string, string>): number => {
  const cents = parseAmountToCents(value);

  if (cents === null) {
    errors.amount = 'Tutar en fazla iki ondalikli pozitif bir sayi olmali';
    return 0;
  }

  if (cents === 0) {
    errors.amount = 'Tutar sifirdan buyuk olmali';
  }

  return cents;
};

const validateSplitType = (value: unknown, errors: Record<string, string>): SplitType => {
  const splitType = asString(value).trim() as SplitType;

  if (!SPLIT_TYPES.includes(splitType)) {
    errors.splitType = `Bolusme tipi ${SPLIT_TYPES.join(' | ')} degerlerinden biri olmali`;
    return 'equal';
  }

  return splitType;
};

/** Katilimcinin bicimi dogru ve grubun uyesi olmasi sart. */
const validateParticipant = (
  value: unknown,
  memberIds: ReadonlySet<string>,
  errors: Record<string, string>,
  field: string
): string => {
  const userId = asString(value).trim();

  if (!isUuid(userId)) {
    errors[field] = 'Gecersiz kullanici ID';
    return userId;
  }

  // Grup uyesi olmayan birine borc yazilamaz: o kisi harcamayi hic goremez,
  // ama bakiyesinde borc birikirdi.
  if (!memberIds.has(userId)) {
    errors[field] = 'Katilimci grubun uyesi degil';
  }

  return userId;
};

/**
 * `splitDetails` govdesini `split.service`'in bekledigi girdiye cevirir.
 *
 * Beklenen bicimler:
 *   equal -> { participants: [userId, ...] }   (verilmezse tum uyeler)
 *   exact -> { shares: [{ userId, amount }] }
 *
 * Arayuzdeki "Kaca Bol" akisinin burada karsiligi yok: o da `equal` govdesi
 * gonderir, yalnizca `participants` listesini farkli bir ekranda toplar
 * (bkz. docs/decisions/bolusum-basitlestirme.md).
 */
const buildSplitInput = (
  splitType: SplitType,
  rawDetails: unknown,
  memberIds: ReadonlySet<string>
): SplitInput => {
  const details = asRecord(rawDetails);
  const errors: Record<string, string> = {};

  if (splitType === 'equal') {
    const raw = details.participants;

    // Katilimci verilmezse harcama tum gruba esit bolunur — en sik senaryo.
    if (raw === undefined) {
      return { type: 'equal', participants: [...memberIds] };
    }

    if (!Array.isArray(raw) || raw.length === 0) {
      fail({ splitDetails: 'participants bos olmayan bir dizi olmali' });
    }

    const participants = (raw as unknown[]).map((value, index) =>
      validateParticipant(value, memberIds, errors, `splitDetails.participants[${index}]`)
    );

    if (Object.keys(errors).length > 0) {
      fail(errors);
    }

    return { type: 'equal', participants };
  }

  // Geriye tek tip kaldi: exact. `shares` govdesi yalnizca onun bicimi.
  const raw = details.shares;

  if (!Array.isArray(raw) || raw.length === 0) {
    fail({ splitDetails: 'shares bos olmayan bir dizi olmali' });
  }

  const shares: ShareAllocation[] = (raw as unknown[]).map((row, index) => {
    const share = asRecord(row);
    const userId = validateParticipant(
      share.userId,
      memberIds,
      errors,
      `splitDetails.shares[${index}].userId`
    );

    const cents = parseAmountToCents(share.amount);
    if (cents === null) {
      errors[`splitDetails.shares[${index}].amount`] =
        'Pay tutari en fazla iki ondalikli, negatif olmayan bir sayi olmali';
    }

    return { userId, cents: cents ?? 0 };
  });

  if (Object.keys(errors).length > 0) {
    fail(errors);
  }

  return { type: 'exact', shares };
};

/**
 * Bolusturmeyi calistirir ve `SplitError`'i HTTP 400'e cevirir.
 * `split.service` HTTP'den bagimsiz kalsin diye cevrim burada yapilir.
 */
const runSplit = (amountCents: number, input: SplitInput): ShareAllocation[] => {
  try {
    return computeShares(amountCents, input);
  } catch (error) {
    if (error instanceof SplitError) {
      throw ApiError.badRequest(error.message, error.details);
    }
    throw error;
  }
};

/* ------------------------------------------------------- grup baglami */

/** Grup uyeligini dogrular ve uye ID kumesini doner (katilimci kontrolu icin). */
const loadGroupContext = async (
  groupId: string,
  userId: string
): Promise<{ membership: GroupMemberRow; memberIds: Set<string> }> => {
  const { membership } = await requireMembership(groupId, userId);
  const memberIds = await groupModel.listMemberIds(groupId);

  return { membership, memberIds: new Set(memberIds) };
};

/**
 * Harcamayi yukler ve **degistirme** yetkisini dogrular.
 *
 * Sirali kontrol:
 *   1. Bicimsiz ID / olmayan harcama / silinmis harcama -> 403 (grup uc
 *      noktalariyla ayni mesaj). Ayrisirsa uc nokta "bu ID'de bir harcama var
 *      mi?" sorusunu yanitlayan bir oracle olur.
 *   2. Harcamanin grubuna uye olmayan -> ayni 403.
 *   3. Uye ama ne ekleyen ne owner -> farkli mesajla 403: bu kisi harcamayi
 *      zaten gorebiliyor, sizacak bilgi yok.
 */
const loadEditable = async (
  expenseId: string,
  userId: string
): Promise<{ expense: ExpenseWithShares; membership: GroupMemberRow; memberIds: Set<string> }> => {
  if (!isUuid(expenseId)) {
    throw ApiError.forbidden(ACCESS_DENIED);
  }

  const expense = await expenseModel.findWithShares(expenseId);

  if (!expense) {
    throw ApiError.forbidden(ACCESS_DENIED);
  }

  const { membership, memberIds } = await loadGroupContext(expense.group_id, userId);

  if (expense.created_by !== userId && membership.role !== 'owner') {
    throw ApiError.forbidden(NOT_EDITABLE);
  }

  return { expense, membership, memberIds };
};

/* -------------------------------------------------------------- islemler */

/**
 * POST /groups/:id/expenses
 *
 * `paidBy` verilmezse istegi yapan kisi kabul edilir ("ben odedim" en sik
 * durum). Odeyen kisinin grup uyesi olmasi sart; ayrica odeyenin paylasima
 * dahil olmasi **zorunlu degil** — birinin baskasi adina odeme yapmasi
 * (dogum gunu hediyesi) gecerli bir senaryo.
 */
const createExpense = async (
  groupId: string,
  userId: string,
  body: Record<string, unknown>
): Promise<PublicExpense> => {
  const { memberIds } = await loadGroupContext(groupId, userId);

  const errors: Record<string, string> = {};
  const description = validateDescription(body.description, errors);
  const category = validateCategory(body.category, errors);
  const amountCents = validateAmount(body.amount, errors);
  const splitType = validateSplitType(body.splitType, errors);

  const paidBy =
    body.paidBy === undefined || body.paidBy === null
      ? userId
      : validateParticipant(body.paidBy, memberIds, errors, 'paidBy');

  if (Object.keys(errors).length > 0) {
    fail(errors);
  }

  const shares = runSplit(amountCents, buildSplitInput(splitType, body.splitDetails, memberIds));

  const expense = await expenseModel.create({
    group_id: groupId,
    paid_by: paidBy,
    created_by: userId,
    amount_cents: amountCents,
    description,
    category,
    split_type: splitType,
    shares,
  });

  // Harcama olusunca sohbet feed'ine "expense_created" satiri ekle. Bu adim
  // BILEREK createExpense icinde: hem form ucu (POST /groups/:id/expenses) hem
  // chat servisi bu fonksiyonu cagirir, dolayisiyla feed satiri tek bir yerden,
  // tek bir kod yolundan uretilir (DRY). Gerekce docs/decisions/grup-detay-sohbet.md
  await messageModel.insertExpenseCreated({
    group_id: expense.group_id,
    sender_id: userId,
    expense_id: expense.id,
  });

  return toPublicExpense(expense);
};

/**
 * GET /groups/:id/expenses?page=1&limit=20
 *
 * Sayfalama dogrulamasi 1.8'de `utils/pagination`'a tasindi: ayni mantik admin
 * listelerinde de gerekiyordu ve iki kopya, ust sinir degistiginde birinin
 * geride kalmasi demekti.
 */
const listExpenses = async (
  groupId: string,
  userId: string,
  query: ListQuery = {}
): Promise<ExpenseListResult> => {
  await requireMembership(groupId, userId);

  const page = parsePagination(query);
  const { expenses, total } = await expenseModel.listByGroup(groupId, {
    limit: page.limit,
    offset: page.offset,
  });

  return {
    expenses: expenses.map(toPublicExpense),
    pagination: buildPagination(page, total),
  };
};

/** GET /expenses/:id — grubun her uyesi gorebilir. */
const getExpense = async (expenseId: string, userId: string): Promise<PublicExpense> => {
  if (!isUuid(expenseId)) {
    throw ApiError.forbidden(ACCESS_DENIED);
  }

  const expense = await expenseModel.findWithShares(expenseId);

  if (!expense) {
    throw ApiError.forbidden(ACCESS_DENIED);
  }

  await requireMembership(expense.group_id, userId);

  return toPublicExpense(expense);
};

/**
 * PUT /expenses/:id
 *
 * Kismi guncelleme yapilabilir, tek istisna **para blogu**: `amount`,
 * `splitType`, `splitDetails` alanlarindan biri gonderildiginde `amount` ve
 * `splitType` birlikte gonderilmek zorunda (`splitDetails` yalnizca `equal`
 * icin opsiyonel). Tek basina tutari degistirmeye izin verilseydi paylar eski
 * tutara gore kalir ve "paylarin toplami = harcama" invaryanti sessizce
 * bozulurdu. Gerekce docs/decisions/1.5.md icinde.
 */
const updateExpense = async (
  expenseId: string,
  userId: string,
  body: Record<string, unknown>
): Promise<PublicExpense> => {
  const { expense, memberIds } = await loadEditable(expenseId, userId);

  const touchesMoney = ['amount', 'splitType', 'splitDetails'].some(
    (field) => body[field] !== undefined
  );

  const errors: Record<string, string> = {};

  /*
    `edited_by` bir **guncellenen alan degil**: harcama satirina yazilmiyor,
    yalnizca `expense_edits` gecmis kaydinin sahibi oluyor (bkz. expense.model).
    Bu yuzden "gonderilen alan var mi" kontrolu asagida `patch` uzerinden degil
    ayri bir bayrakla yapiliyor; `patch` her zaman en az bir anahtar tasiyor.
  */
  const patch: Parameters<typeof expenseModel.update>[1] = { edited_by: userId };
  let touchedFields = 0;

  if (body.description !== undefined) {
    patch.description = validateDescription(body.description, errors);
    touchedFields += 1;
  }

  if (body.category !== undefined) {
    patch.category = validateCategory(body.category, errors);
    touchedFields += 1;
  }

  if (body.paidBy !== undefined) {
    patch.paid_by = validateParticipant(body.paidBy, memberIds, errors, 'paidBy');
    touchedFields += 1;
  }

  if (touchesMoney) {
    if (body.amount === undefined || body.splitType === undefined) {
      const together = 'Tutar ya da bolusme degisiyorsa amount ve splitType birlikte gonderilmeli';
      fail(
        { ...errors, amount: together, splitType: together },
        'Tutar ve bolusme birlikte guncellenmeli'
      );
    }

    patch.amount_cents = validateAmount(body.amount, errors);
    patch.split_type = validateSplitType(body.splitType, errors);
    touchedFields += 1;
  }

  if (Object.keys(errors).length > 0) {
    fail(errors);
  }

  if (touchesMoney) {
    patch.shares = runSplit(
      patch.amount_cents as number,
      buildSplitInput(patch.split_type as SplitType, body.splitDetails, memberIds)
    );
  }

  if (touchedFields === 0) {
    throw ApiError.badRequest('Guncellenecek alan gonderilmedi');
  }

  const updated = await expenseModel.update(expense.id, patch);

  // Araya baska bir istek girip harcamayi silmis olabilir (yaris). Sonuc yine
  // "harcama yok" — ve o durumda ayni 403 doner.
  if (!updated) {
    throw ApiError.forbidden(ACCESS_DENIED);
  }

  return toPublicExpense(updated);
};

/**
 * DELETE /expenses/:id — soft delete.
 * `expense_shares` satirlari yerinde kalir ama harcama silindigi icin hicbir
 * sorguda gorunmez; bakiye hesabina da girmez.
 */
const deleteExpense = async (
  expenseId: string,
  userId: string
): Promise<{ id: string; deleted_at: Date }> => {
  const { expense } = await loadEditable(expenseId, userId);

  const deleted = await expenseModel.softDelete(expense.id);

  if (!deleted || !deleted.deleted_at) {
    throw ApiError.forbidden(ACCESS_DENIED);
  }

  // "Geri al": harcama silinince feed'deki expense_created karti da kalksin.
  // Ayni soft-delete deseni; harcama geri gelirse mesaj da geri getirilebilir.
  await messageModel.softDeleteByExpenseId(expense.id);

  return { id: deleted.id, deleted_at: deleted.deleted_at };
};

export default {
  createExpense,
  listExpenses,
  getExpense,
  updateExpense,
  deleteExpense,
};

export {
  createExpense,
  listExpenses,
  getExpense,
  updateExpense,
  deleteExpense,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  NOT_EDITABLE,
};
