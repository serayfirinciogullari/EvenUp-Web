/**
 * Backend veri tiplerinin frontend karsiliklari.
 *
 * KAYNAK: `src/types/models.ts` ve servis katmanindaki `Public*` gorunumleri.
 * Buradaki tipler backend'in **JSON cikitisini** tanimlar, DB satirini degil.
 * Iki fark bilincli:
 *
 *  1. `Date` alanlari burada `string`. JSON'da tarih ISO 8601 metnine donusur
 *     (`2026-08-14T10:12:33.000Z`); `Date` yazmak tip sistemini yalan soyletirdi.
 *  2. `NUMERIC` para alanlari burada da `string`. Backend bunlari bilerek metin
 *     olarak doner (bkz. docs/decisions/1.5.md — float ile para toplanmaz).
 *     `Number(...)` cevrimi yalnizca gosterim aninda yapilmali.
 *
 * Backend'de bir alan degistiginde burasi da guncellenmeli; ikisini birbirine
 * baglayan otomatik bir uretim yok (bkz. docs/decisions/2.1.md).
 */

/** Uygulama rolu. Grup ici rol (`GroupMemberRole`) ile karistirilmamali. */
export type UserRole = 'admin' | 'user';

/** Grup **ici** rol. Bir kullanici A grubunda owner, B grubunda member olabilir. */
export type GroupMemberRole = 'owner' | 'member';

export type ExpenseSplitType = 'equal' | 'exact' | 'percentage';

export type SettlementStatus = 'pending' | 'confirmed' | 'rejected';

/** `PublicUser` — `password_hash` backend'de zaten hicbir cevaba girmez. */
export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

/** `PublicGroup` — `deleted_at` disarida (soft delete ic detay). */
export interface Group {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
}

/** `GET /groups` satiri: grup + istekte bulunanin rolu + uye sayisi. */
export interface GroupSummary {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
  role: GroupMemberRole;
  joined_at: string;
  member_count: number;
}

export interface GroupMember {
  user_id: string;
  name: string;
  email: string;
  role: GroupMemberRole;
  joined_at: string;
}

/** `GET /groups/:id` cevabi. */
export interface GroupDetail {
  group: Group;
  role: GroupMemberRole;
  members: GroupMember[];
}

/** `PublicInvite` — kodun kendisi duz metin doner (bkz. docs/decisions/1.4.md). */
export interface Invite {
  code: string;
  /** Backend'in `APP_URL`inden uretilir; su an API adresini gosteriyor. */
  join_url: string;
  expires_at: string;
  /** `null` = sinirsiz kullanim. */
  max_uses: number | null;
  use_count: number;
}

/** `POST /groups/:id/invite` cevabi. */
export interface InviteResult {
  invite: Invite;
  /** false ise mevcut aktif davet aynen dondu, yeni kod uretilmedi. */
  rotated: boolean;
}

export interface ExpenseShare {
  user_id: string;
  name: string;
  /** NUMERIC(10,2) -> metin. */
  share_amount: string;
}

/** `PublicExpense` — `deleted_at` disarida. */
export interface Expense {
  id: string;
  group_id: string;
  /** Parayi **odeyen**. */
  paid_by: string;
  /** Harcamayi **giren**; duzenleme yetkisi buna bakar. */
  created_by: string;
  amount: string;
  description: string;
  category: string;
  split_type: ExpenseSplitType;
  created_at: string;
  updated_at: string;
  payer_name: string;
  creator_name: string;
  shares: ExpenseShare[];
}

export interface Settlement {
  id: string;
  group_id: string;
  /** Odemeyi yapan (borclu) — kaydi yalnizca bu kisi olusturabilir. */
  from_user: string;
  /** Odemeyi alan (alacakli) — onay/red yalnizca bu kisiye ait. */
  to_user: string;
  amount: string;
  status: SettlementStatus;
  created_at: string;
  confirmed_at: string | null;
  rejected_at: string | null;
}

export interface Balance {
  user_id: string;
  /** Gruptan cikarilmis ama gecmis harcamasi duran kullanicida `null`. */
  name: string | null;
  /** Pozitif = alacakli, negatif = borclu. */
  net_balance: string;
}

export interface Transfer {
  from_user: string;
  to_user: string;
  amount: string;
}

/** `GET /groups/:id/balances` cevabi. */
export interface BalanceResult {
  balances: Balance[];
  transfers: Transfer[];
  meta: {
    expense_count: number;
    confirmed_settlement_count: number;
    /** Bakiyeye **dahil degil**: bekleyen odemeler onaylanana kadar sayilmaz. */
    pending_settlement_count: number;
    rejected_settlement_count: number;
    algorithm: 'optimal' | 'greedy';
  };
}

/** Admin grup listesi — bilerek yalnizca ust veri (bkz. docs/decisions/1.8.md). */
export interface GroupMeta {
  id: string;
  name: string;
  created_at: string;
  member_count: number;
}
