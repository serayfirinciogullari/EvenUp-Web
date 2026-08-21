import type { Knex } from 'knex';

/**
 * Veritabani satir tipleri.
 *
 * Isimlendirme: `XRow` = tablodan OKUNAN satir (tum kolonlar dolu),
 * `XInsert` = INSERT gövdesi (DB default'u olan kolonlar opsiyonel),
 * `XUpdate` = kismi guncelleme.
 *
 * Kolon adlari migration'lardaki gibi snake_case birakildi; boylece
 * `knex<UserRow>('users').where({ is_active: true })` derleme zamaninda dogrulanir.
 */

/** PostgreSQL NUMERIC/DECIMAL kolonlari pg surucusunden **string** olarak doner.
 *  Float'a cevirmek para hesabinda hassasiyet kaybettirdigi icin string olarak tutuyoruz. */
export type Decimal = string;

/** INSERT'te sayi da kabul edilir; pg tarafi NUMERIC'e cevirir. */
export type MoneyInput = Decimal | number;

export type UserRole = 'admin' | 'user';
/** Grup **ici** rol. `UserRole` (uygulama rolu) ile karistirilmamali:
 *  bir kullanici A grubunda owner, B grubunda member olabilir. */
export type GroupMemberRole = 'owner' | 'member';
/** Harcamanin nasil bolundugu. Paylar `expense_shares`'te; bu kolon **yontemi**
 *  saklar — sonuc satirlarindan yontem geri okunamaz. Arayuzdeki "Kaca Bol"
 *  akisi burada `equal` olarak gorunur (docs/decisions/bolusum-basitlestirme.md). */
export type ExpenseSplitType = 'equal' | 'exact';
/** Odeme kaydinin durumu. `pending` **bakiyeyi etkilemez**; yalnizca alacaklinin
 *  onayladigi (`confirmed`) kayitlar netlestirmeye girer (bkz. docs/decisions/1.7.md). */
export type SettlementStatus = 'pending' | 'confirmed' | 'rejected';
/** Grup sohbetindeki bir satirin turu. Hangi kolonun dolu oldugunu belirler
 *  (bkz. migration 13, `group_messages_shape_check`):
 *    user_text / ai_clarification -> content dolu
 *    expense_created              -> expense_id dolu
 *    receipt_draft_ref            -> receipt_draft_id dolu (3.5.2 ile aktiflesir) */
export type GroupMessageType =
  'user_text' | 'ai_clarification' | 'expense_created' | 'receipt_draft_ref';

/* ------------------------------------------------------------------ users */

export interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: UserRole;
  fcm_token: string | null;
  is_active: boolean;
  created_at: Date;
  /** Aktivite akisini en son gordugu an; DB varsayilani `now()` (migration 16). */
  activity_seen_at: Date;
  /** Profil fotografi, `data:image/...;base64,...` metni (migration 18). */
  avatar: string | null;
  /** Kendi hesap @adi — kucuk harf, benzersiz. Kisi bazli takma isimlerden
   *  (member_nicknames) AYRI bir kavram (migration 18). */
  handle: string | null;
  /** Kullanicinin kendi baslattigi silme sureci — dolu = 30 gunluk geri alma
   *  penceresi baslamis (migration 19, bkz. docs/decisions/3.17-hesap-silme.md). */
  deleted_at: Date | null;
}

export interface UserInsert {
  id?: string;
  email: string;
  name: string;
  password_hash: string;
  role?: UserRole;
  fcm_token?: string | null;
  is_active?: boolean;
  created_at?: Date;
  activity_seen_at?: Date;
  avatar?: string | null;
  handle?: string | null;
  deleted_at?: Date | null;
}

export type UserUpdate = Partial<Omit<UserInsert, 'id'>>;

/* ----------------------------------------------------------------- groups */

export interface GroupRow {
  id: string;
  name: string;
  /**
   * Adres cubugundaki okunabilir kimlik (`/groups/ev-arkadaslari`). Addan
   * uretilir, yasayan gruplar arasinda tekildir ve ad degisince yeniden
   * uretilir (bkz. models/group.model -> resolveSlug).
   */
  slug: string;
  description: string | null;
  created_by: string;
  /** Soft delete: dolu ise grup silinmis sayilir ve hicbir sorguda gorunmez. */
  deleted_at: Date | null;
  created_at: Date;
}

export interface GroupInsert {
  id?: string;
  name: string;
  slug?: string;
  description?: string | null;
  created_by: string;
  deleted_at?: Date | null;
  created_at?: Date;
}

export type GroupUpdate = Partial<Omit<GroupInsert, 'id'>>;

/* ---------------------------------------------------------- group_members */

export interface GroupMemberRow {
  id: string;
  group_id: string;
  user_id: string;
  role: GroupMemberRole;
  joined_at: Date;
}

export interface GroupMemberInsert {
  id?: string;
  group_id: string;
  user_id: string;
  role?: GroupMemberRole;
  joined_at?: Date;
}

export type GroupMemberUpdate = Partial<Omit<GroupMemberInsert, 'id'>>;

/* ---------------------------------------------------------- group_invites */

export interface GroupInviteRow {
  id: string;
  group_id: string;
  created_by: string;
  /** crypto.randomBytes(16) -> base64url. Sirali ID degil. */
  code: string;
  expires_at: Date;
  /** NULL = sinirsiz kullanim; 1 = tek kullanimlik davet. */
  max_uses: number | null;
  use_count: number;
  revoked_at: Date | null;
  created_at: Date;
}

export interface GroupInviteInsert {
  id?: string;
  group_id: string;
  created_by: string;
  code: string;
  expires_at: Date;
  max_uses?: number | null;
  use_count?: number;
  revoked_at?: Date | null;
  created_at?: Date;
}

export type GroupInviteUpdate = Partial<Omit<GroupInviteInsert, 'id'>>;

/* --------------------------------------------------------------- expenses */

export interface ExpenseRow {
  id: string;
  group_id: string;
  /** Parayi **odeyen** kisi. */
  paid_by: string;
  /** Harcamayi **giren** kisi. Odeyenden farkli olabilir; duzenleme yetkisi
   *  buna bakar (bkz. docs/decisions/1.5.md). */
  created_by: string;
  amount: Decimal;
  description: string;
  category: string;
  split_type: ExpenseSplitType;
  created_at: Date;
  updated_at: Date;
  /** Soft delete: dolu ise harcama silinmis sayilir ve hicbir sorguda gorunmez. */
  deleted_at: Date | null;
}

export interface ExpenseInsert {
  id?: string;
  group_id: string;
  paid_by: string;
  created_by: string;
  amount: MoneyInput;
  description: string;
  category?: string;
  split_type?: ExpenseSplitType;
  created_at?: Date;
  updated_at?: Date;
  deleted_at?: Date | null;
}

export type ExpenseUpdate = Partial<Omit<ExpenseInsert, 'id'>>;

/* --------------------------------------------------------- expense_shares */

export interface ExpenseShareRow {
  id: string;
  expense_id: string;
  user_id: string;
  share_amount: Decimal;
}

export interface ExpenseShareInsert {
  id?: string;
  expense_id: string;
  user_id: string;
  share_amount: MoneyInput;
}

export type ExpenseShareUpdate = Partial<Omit<ExpenseShareInsert, 'id'>>;

/* ----------------------------------------------------------- expense_edits */

/**
 * Bir harcama duzenlemesinin gecmis kaydi (bkz. migration 15).
 *
 * Her basarili UPDATE icin bir satir. `previous_*` alanlari UPDATE'ten **once**
 * okunan degerler; `expenses.updated_at` yalnizca "degisti" derken bu tablo
 * "neyden neye" sorusunu cevapliyor. Aktivite akisindaki DUZ olayinin kaynagi.
 */
export interface ExpenseEditRow {
  id: string;
  expense_id: string;
  /** Duzenlemeyi yapan. Harcamayi **giren** kisi (`created_by`) ile ayni olmak
   *  zorunda degil: grup sahibi de duzenleyebilir. */
  edited_by: string;
  previous_amount: Decimal;
  new_amount: Decimal;
  previous_description: string;
  new_description: string;
  created_at: Date;
}

export interface ExpenseEditInsert {
  id?: string;
  expense_id: string;
  edited_by: string;
  previous_amount: MoneyInput;
  new_amount: MoneyInput;
  previous_description: string;
  new_description: string;
  created_at?: Date;
}

export type ExpenseEditUpdate = Partial<Omit<ExpenseEditInsert, 'id'>>;

/* ------------------------------------------------------------ settlements */

export interface SettlementRow {
  id: string;
  group_id: string;
  /** Odemeyi **yapan** (borclu) taraf. Kaydi yalnizca bu kisi olusturabilir. */
  from_user: string;
  /** Odemeyi **alan** (alacakli) taraf. Onay/red yalnizca bu kisiye ait. */
  to_user: string;
  amount: Decimal;
  status: SettlementStatus;
  created_at: Date;
  confirmed_at: Date | null;
  rejected_at: Date | null;
}

export interface SettlementInsert {
  id?: string;
  group_id: string;
  from_user: string;
  to_user: string;
  amount: MoneyInput;
  status?: SettlementStatus;
  created_at?: Date;
  confirmed_at?: Date | null;
  rejected_at?: Date | null;
}

export type SettlementUpdate = Partial<Omit<SettlementInsert, 'id'>>;

/* ------------------------------------------------------------------------ */

/**
 * Tablo adi -> tip eslesmesi. Bu sayede generic yazmadan da tip guvenligi olur:
 *
 *   db('users').where({ is_active: true });        // UserRow[] doner
 *   db<UserRow>('users').select('*');              // acik generic de calisir
 *
 * `CompositeTableType` okuma / insert / update icin ayri tipler tanimlamayi saglar.
 */
/* ------------------------------------------------------- member_nicknames */

/**
 * Bir kullanicinin, bir grupta, baska bir kullaniciya verdigi takma isim.
 *
 * **Kisiye ozel**: (group_id, owner_user_id, target_user_id) uclusu tekil.
 * `owner` adi koyan, `target` adi konan. Ayni kisiye iki farkli uyenin verdigi
 * adlar birbirini gormez (bkz. migration 12).
 */
export interface MemberNicknameRow {
  id: string;
  group_id: string;
  owner_user_id: string;
  target_user_id: string;
  nickname: string;
  created_at: Date;
  updated_at: Date;
}

export interface MemberNicknameInsert {
  id?: string;
  group_id: string;
  owner_user_id: string;
  target_user_id: string;
  nickname: string;
  created_at?: Date;
  updated_at?: Date;
}

export type MemberNicknameUpdate = Partial<Omit<MemberNicknameInsert, 'id'>>;

/* --------------------------------------------------------- group_messages */

/**
 * Grup sohbetindeki tek bir olay. `type` hangi kolonun dolu oldugunu belirler
 * (bkz. migration 13). `sender_id` sistem/AI mesajlarinda `null`; `content`
 * yalnizca metin turlerinde, `expense_id`/`receipt_draft_id` yalnizca kendi
 * referans turlerinde dolu. `deleted_at` "geri al" icin soft delete.
 */
export interface GroupMessageRow {
  id: string;
  group_id: string;
  sender_id: string | null;
  type: GroupMessageType;
  content: string | null;
  expense_id: string | null;
  receipt_draft_id: string | null;
  created_at: Date;
  deleted_at: Date | null;
}

export interface GroupMessageInsert {
  id?: string;
  group_id: string;
  sender_id?: string | null;
  type: GroupMessageType;
  content?: string | null;
  expense_id?: string | null;
  receipt_draft_id?: string | null;
  created_at?: Date;
  deleted_at?: Date | null;
}

export type GroupMessageUpdate = Partial<Omit<GroupMessageInsert, 'id'>>;

declare module 'knex/types/tables' {
  interface Tables {
    users: Knex.CompositeTableType<UserRow, UserInsert, UserUpdate>;
    groups: Knex.CompositeTableType<GroupRow, GroupInsert, GroupUpdate>;
    group_members: Knex.CompositeTableType<GroupMemberRow, GroupMemberInsert, GroupMemberUpdate>;
    group_invites: Knex.CompositeTableType<GroupInviteRow, GroupInviteInsert, GroupInviteUpdate>;
    expenses: Knex.CompositeTableType<ExpenseRow, ExpenseInsert, ExpenseUpdate>;
    expense_shares: Knex.CompositeTableType<
      ExpenseShareRow,
      ExpenseShareInsert,
      ExpenseShareUpdate
    >;
    expense_edits: Knex.CompositeTableType<ExpenseEditRow, ExpenseEditInsert, ExpenseEditUpdate>;
    settlements: Knex.CompositeTableType<SettlementRow, SettlementInsert, SettlementUpdate>;
    member_nicknames: Knex.CompositeTableType<
      MemberNicknameRow,
      MemberNicknameInsert,
      MemberNicknameUpdate
    >;
    group_messages: Knex.CompositeTableType<
      GroupMessageRow,
      GroupMessageInsert,
      GroupMessageUpdate
    >;
  }
}
