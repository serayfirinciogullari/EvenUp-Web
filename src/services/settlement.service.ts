import groupModel from '../models/group.model';
import settlementModel from '../models/settlement.model';
import ApiError from '../utils/ApiError';
import { parseAmountToCents } from '../utils/money';
import { buildPagination, parsePagination } from '../utils/pagination';
import { isUuid } from '../utils/uuid';
import { ACCESS_DENIED, requireMembership } from './group.service';

import type { PendingApprovalView, SettlementView } from '../models/settlement.model';
import type { SettlementRow, SettlementStatus } from '../types/models';
import type { PageQuery, Pagination } from '../utils/pagination';

/**
 * Odeme (settlement) is mantigi.
 *
 * IKI TARAFLI ONAY
 * ----------------
 * Bir odeme kaydinin iki ayri sahibi var ve **ikisi de aynisi olamaz**:
 *
 *   - kaydi yalnizca **borclu** (`from_user`) olusturabilir  -> "odedim"
 *   - kaydi yalnizca **alacakli** (`to_user`) sonuclandirir  -> "aldim" / "almadim"
 *
 * Bu yuzden create ve confirm/reject ayri yetki kontrollerinden gecer; grup
 * uyeligi (1.4) her ikisinde de on kosuldur ama tek basina yetmez.
 *
 * KRITIK KURAL
 * ------------
 * `pending` bir kayit bakiyeyi **etkilemez**. Bu kural burada degil,
 * `settlement.model.listConfirmed` ve `balance.service` icinde uygulanir:
 * bakiye hesabina yalnizca `confirmed` kayitlar girer. Gerekce
 * docs/decisions/1.7.md icinde.
 */

/** Kaydi olusturmaya calisan kisi borclu degilse donen mesaj. */
const ONLY_DEBTOR = 'Odeme kaydini yalnizca odemeyi yapan taraf olusturabilir';

/** Onay/red yetkisi olmayan uyeye donen mesaj. */
const ONLY_CREDITOR = 'Bu odemeyi yalnizca odemeyi alan taraf onaylayabilir ya da reddedebilir';

const STATUS_LABELS: Record<SettlementStatus, string> = {
  pending: 'beklemede',
  confirmed: 'onaylanmis',
  rejected: 'reddedilmis',
};

const SETTLEMENT_STATUSES = Object.keys(STATUS_LABELS) as SettlementStatus[];

/**
 * Banner'a cikan bekleyen onay sayisinin ust siniri.
 *
 * Liste sayfalanmiyor cunku pratikte cok kisa: ayni cift arasinda ayni anda tek
 * bir bekleyen kayit olabiliyor (kismi unique index). Yine de sinirsiz
 * birakilmiyor — "kisa olmali" bir varsayim, sinir ise garanti; onlarca gruba
 * uye bir kullanicida banner butun ekrani kaplayabilirdi.
 */
const MAX_PENDING_APPROVALS = 20;

/* ---------------------------------------------------------------- tipler */

export interface SettlementListQuery extends PageQuery {
  status?: unknown;
}

export interface SettlementListResult {
  settlements: SettlementView[];
  pagination: Pagination;
}

/* ---------------------------------------------------------- yardimcilar */

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

function fail(errors: Record<string, string>, message = 'Gecersiz odeme bilgileri'): never {
  throw ApiError.badRequest(message, errors);
}

/* ------------------------------------------------------------- islemler */

/**
 * POST /groups/:id/settlements
 *
 * `fromUserId` verilmezse istegi yapan kisi kabul edilir. Verilir ve baskasini
 * gosterirse 403: baskasi adina "o bana odedi" kaydi acmak, tek tarafli
 * bildirimi arka kapidan geri getirirdi.
 *
 * `status` govdede gonderilse bile yok sayilir — kayit her zaman `pending`
 * baslar (1.3'teki "role istemciden alinmaz" kuraliyla ayni gerekce).
 */
const createSettlement = async (
  groupId: string,
  userId: string,
  body: Record<string, unknown>
): Promise<SettlementRow> => {
  await requireMembership(groupId, userId);

  const fromUserId =
    body.fromUserId === undefined || body.fromUserId === null
      ? userId
      : asString(body.fromUserId).trim();

  if (fromUserId !== userId) {
    throw ApiError.forbidden(ONLY_DEBTOR);
  }

  const memberIds = new Set(await groupModel.listMemberIds(groupId));

  const errors: Record<string, string> = {};

  const toUserId = asString(body.toUserId).trim();
  if (!isUuid(toUserId)) {
    errors.toUserId = 'Gecersiz kullanici ID';
  } else if (!memberIds.has(toUserId)) {
    // Grup uyesi olmayan birine odeme kaydi acilamaz: o kisi kaydi hic goremez,
    // dolayisiyla onaylayamaz da — kalici olarak beklemede kalirdi.
    errors.toUserId = 'Odemeyi alan kisi grubun uyesi degil';
  } else if (toUserId === fromUserId) {
    errors.toUserId = 'Kendinize odeme kaydi olusturamazsiniz';
  }

  const amountCents = parseAmountToCents(body.amount);
  if (amountCents === null) {
    errors.amount = 'Tutar en fazla iki ondalikli pozitif bir sayi olmali';
  } else if (amountCents === 0) {
    errors.amount = 'Tutar sifirdan buyuk olmali';
  }

  if (Object.keys(errors).length > 0) {
    fail(errors);
  }

  // Ayni cift icin bekleyen kayit varsa yenisi acilmaz. Kismi unique index bunu
  // DB'de de garanti ediyor; buradaki kontrol 500 yerine anlamli bir 409 icin.
  const pending = await settlementModel.findPendingBetween(groupId, fromUserId, toUserId);
  if (pending) {
    throw ApiError.conflict(
      'Bu kisiye bekleyen bir odeme kaydiniz zaten var; once onun sonuclanmasi gerekiyor',
      { settlement_id: pending.id }
    );
  }

  return settlementModel.create({
    group_id: groupId,
    from_user: fromUserId,
    to_user: toUserId,
    amount_cents: amountCents as number,
  });
};

/**
 * GET /groups/:id/settlements?status=pending&page=1&limit=20
 *
 * Grubun **butun** uyeleri butun kayitlari gorur; kim onaylayabilir sorusu ayri
 * (`resolveSettlement`). Odeme kaydi zaten iki tarafli bir muhasebe olayi —
 * gruptaki herkesin bakiyesini etkileyecegi icin gizlenecek bir tarafi yok.
 *
 * Sayfalama harcama listesiyle ayni kapidan (`utils/pagination`): bu uc nokta da
 * zamanla buyuyen bir gecmis donuyor ve `limit=100000` diyen tek bir istek tum
 * tabloyu bellege alirdi.
 */
const listSettlements = async (
  groupId: string,
  userId: string,
  query: SettlementListQuery = {}
): Promise<SettlementListResult> => {
  await requireMembership(groupId, userId);

  let status: SettlementStatus | undefined;

  if (query.status !== undefined) {
    const requested = asString(query.status).trim() as SettlementStatus;

    // Bilinmeyen durumu sessizce yok saymak, arayuzun "bekleyenleri getir"
    // istegine **tum gecmisi** dondurmek olurdu.
    if (!SETTLEMENT_STATUSES.includes(requested)) {
      fail(
        { status: `status ${SETTLEMENT_STATUSES.join(' | ')} degerlerinden biri olmali` },
        'Gecersiz odeme filtresi'
      );
    }

    status = requested;
  }

  const page = parsePagination(query);
  const { settlements, total } = await settlementModel.listByGroup(groupId, {
    status,
    limit: page.limit,
    offset: page.offset,
  });

  return { settlements, pagination: buildPagination(page, total) };
};

/**
 * GET /settlements/pending
 *
 * Kullanicinin **onayini bekleyen** odemeler, tum gruplarda. Aktivite
 * ekranindaki ust banner'in tek veri kaynagi.
 *
 * NEDEN AKISIN ICINDE DEGIL, AYRI BIR UC
 * --------------------------------------
 * Banner ile akis farkli iki soru soruyor: "simdi ne yapmam gerekiyor?" ve "ne
 * oldu?". Ikisini `GET /activity` cevabinda birlestirmek, akisin ikinci ve
 * ucuncu sayfasinda da bekleyen listesini tekrar tekrar gondermek demekti —
 * "daha fazla yukle" her tiklamada degismeyecek bir veriyi yeniden tasirdi.
 * Ayri uc ayrica onaydan sonra **yalnizca banner'i** tazelemeyi mumkun kiliyor.
 *
 * Uyelik kontrolu yok ve gerekmiyor: filtre `to_user = <istek sahibi>`. Uyesi
 * olunmayan bir grupta kullaniciya odeme kaydi acilamaz (`createSettlement`
 * karsi tarafin uye olmasini sart kosuyor), dolayisiyla sonuca yabanci bir
 * grubun kaydi giremez.
 */
const listPendingApprovals = async (userId: string): Promise<PendingApprovalView[]> =>
  settlementModel.listPendingForCreditor(userId, MAX_PENDING_APPROVALS);

/**
 * Onay ve red ayni kapidan gecer; tek fark yazilan durum.
 *
 * Sirali kontrol (gruplardaki IDOR mantiginin aynisi):
 *   1. Bicimsiz ID / olmayan kayit / silinmis grubun kaydi -> 403, ayni mesaj.
 *   2. Kaydin grubuna uye olmayan                          -> ayni 403.
 *   3. Uye ama alacakli degil                              -> farkli mesajla 403.
 *   4. Kayit zaten sonuclanmis                             -> 409.
 */
const resolveSettlement = async (
  settlementId: string,
  userId: string,
  status: 'confirmed' | 'rejected'
): Promise<SettlementRow> => {
  if (!isUuid(settlementId)) {
    throw ApiError.forbidden(ACCESS_DENIED);
  }

  const settlement = await settlementModel.findById(settlementId);

  if (!settlement) {
    throw ApiError.forbidden(ACCESS_DENIED);
  }

  await requireMembership(settlement.group_id, userId);

  // Borclunun kendi kaydini onaylamasi da buraya duser: modelin butun anlami
  // odemeyi ALAN tarafin dogrulamasi.
  if (settlement.to_user !== userId) {
    throw ApiError.forbidden(ONLY_CREDITOR);
  }

  if (settlement.status !== 'pending') {
    throw ApiError.conflict(
      `Bu odeme kaydi zaten ${STATUS_LABELS[settlement.status]}; durumu tekrar degistirilemez`
    );
  }

  const updated = await settlementModel.resolve(settlementId, status);

  // Araya baska bir istek girip kaydi sonuclandirmis olabilir (yaris).
  if (!updated) {
    throw ApiError.conflict('Bu odeme kaydi baska bir istek tarafindan sonuclandirildi');
  }

  return updated;
};

/** PUT /settlements/:id/confirm */
const confirmSettlement = async (settlementId: string, userId: string): Promise<SettlementRow> =>
  resolveSettlement(settlementId, userId, 'confirmed');

/** PUT /settlements/:id/reject */
const rejectSettlement = async (settlementId: string, userId: string): Promise<SettlementRow> =>
  resolveSettlement(settlementId, userId, 'rejected');

export default {
  createSettlement,
  listSettlements,
  listPendingApprovals,
  confirmSettlement,
  rejectSettlement,
};

export {
  createSettlement,
  listSettlements,
  listPendingApprovals,
  confirmSettlement,
  rejectSettlement,
  MAX_PENDING_APPROVALS,
  ONLY_DEBTOR,
  ONLY_CREDITOR,
};
