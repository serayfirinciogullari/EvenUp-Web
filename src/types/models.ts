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
 *  saklar — sonuc satirlarindan yontem geri okunamaz. */
export type ExpenseSplitType = 'equal' | 'exact' | 'percentage';
/** Odeme kaydinin durumu. `pending` **bakiyeyi etkilemez**; yalnizca alacaklinin
 *  onayladigi (`confirmed`) kayitlar netlestirmeye girer (bkz. docs/decisions/1.7.md). */
export type SettlementStatus = 'pending' | 'confirmed' | 'rejected';

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
}

export type UserUpdate = Partial<Omit<UserInsert, 'id'>>;

/* ----------------------------------------------------------------- groups */

export interface GroupRow {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  /** Soft delete: dolu ise grup silinmis sayilir ve hicbir sorguda gorunmez. */
  deleted_at: Date | null;
  created_at: Date;
}

export interface GroupInsert {
  id?: string;
  name: string;
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
    settlements: Knex.CompositeTableType<SettlementRow, SettlementInsert, SettlementUpdate>;
  }
}
