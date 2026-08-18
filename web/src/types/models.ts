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

/** Backend'in tanidigi iki tip. Formdaki 'Kaca Bol' secenegi ayri bir tip degil:
 *  istege `equal` olarak cikar (bkz. utils/split.ts -> SplitMode). */
export type ExpenseSplitType = 'equal' | 'exact';

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
  /**
   * **Istekte bulunanin** bu uyeye verdigi takma isim; yoksa `null`.
   *
   * Kisiye ozel: ayni satiri baska bir uye okudugunda burasi bos gelir.
   * Gercek `name` her zaman yaninda duruyor ve asla yerine gecmiyor — takma
   * isim bir etiket, kimligin kendisi degil (bkz. docs/decisions/2.9-takma-isimler.md).
   */
  nickname: string | null;
}

/** `PUT /groups/:id/members/:userId/nickname` cevabi. */
export interface NicknameResult {
  user_id: string;
  /** `null` = takma isim kaldirildi. */
  nickname: string | null;
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

/** `POST /groups/join/:inviteCode` cevabi. */
export interface JoinResult {
  group: Group;
  /**
   * true ise kullanici zaten uyeydi ve davet kotasindan dusulmedi. Hata degil:
   * ayni linke ikinci kez tiklamak beklenen bir durum.
   */
  already_member: boolean;
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

/** Backend'in `utils/pagination.ts` ciktisi — liste uc noktalarinin tamaminda ayni. */
export interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
  has_next: boolean;
  has_previous: boolean;
}

/** `GET /groups/:id/expenses` cevabi. */
export interface ExpenseListResult {
  expenses: Expense[];
  pagination: Pagination;
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

/**
 * `GET /groups/:id/settlements` satiri: kayit + iki tarafin adi.
 *
 * Adlar backend'de join'leniyor, istemcide uye listesinden eslestirilmiyor:
 * gruptan cikarilmis bir uyenin kaydi o listede bulunmaz ve cumle
 * "undefined sana ... odedi" olurdu (bkz. `settlement.model.ts`).
 */
export interface SettlementView extends Settlement {
  from_name: string;
  to_name: string;
}

export interface SettlementListResult {
  settlements: SettlementView[];
  pagination: Pagination;
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

/**
 * `GET /users/me/home-summary` cevabinin `summary` alani.
 *
 * ALAN ADLARI NEDEN camelCase
 * ---------------------------
 * Bu dosyadaki diger tipler snake_case, cunku onlar DB satirlarinin seklini
 * tasiyor. Home ozeti hicbir tabloyu yansitmiyor — dort alanin dordu de
 * hesaplanmis. Backend'de de camelCase donuyor; burasi onu aynen yaziyor.
 *
 * Iki tutar yine **metin**: hesaplanmis olmalari onlari para olmaktan
 * cikarmiyor, `Number(...)` cevrimi yalnizca gosterim aninda yapilmali.
 */
export interface HomeSummary {
  /** Tum gruplardaki net bakiyelerin toplami. Pozitif = alacakli. */
  totalNetBalance: string;
  /** Bu ay kullanicinin odedigi harcamalarin toplami. */
  monthlySpend: string;
  activeGroupsCount: number;
  /** Kullaniciyi ilgilendiren (odedigi ya da onayini bekleyen) bekleyen odemeler. */
  pendingSettlementsCount: number;
}

/* ------------------------------------------------------------------ admin */

/**
 * Admin grup listesi satiri — bilerek yalnizca **ust veri**.
 *
 * Bu tipin dar olusu bir eksiklik degil, backend'in sozlesmesi: `admin.model`
 * icindeki `listGroupMeta` sorgusu `expenses` ve `expense_shares` tablolarina
 * hic dokunmaz, `description` bile secmez. Yani buraya bir alan eklemek
 * (`expense_count`, `description`, `members`) tipi degil **kurali** bozardi;
 * backend o alani zaten donmuyor (bkz. docs/decisions/1.8.md ve 2.5.md).
 */
export interface GroupMeta {
  id: string;
  name: string;
  created_at: string;
  member_count: number;
}

/** `GET /admin/groups` cevabi. */
export interface AdminGroupListResult {
  groups: GroupMeta[];
  pagination: Pagination;
}

/** `GET /admin/users` cevabi — satirlar `PublicUser`, yani `password_hash` yok. */
export interface AdminUserListResult {
  users: User[];
  pagination: Pagination;
}

/**
 * `PUT /admin/users/:id/disable|enable` cevabi.
 *
 * `changed: false` = kullanici zaten istenen durumdaydi. Islem idempotent
 * oldugu icin bu bir hata degil; arayuz "zaten pasifti" diyebilsin diye
 * backend bunu ayrica bildiriyor.
 */
export interface SetUserActiveResult {
  user: User;
  changed: boolean;
}

/** `GET /admin/stats` icindeki donem ozeti (son 7 / son 30 gun). */
export interface PeriodStats {
  new_users: number;
  new_groups: number;
  expense_count: number;
  /** NUMERIC -> metin; kayit yokken "0" degil "0.00" gelir (cast'li). */
  expense_volume: string;
}

/**
 * `GET /admin/stats` cevabi — **tamami toplam**, hicbir alan satir bazli degil.
 *
 * `expenses.volume` ve `settlements.confirmed_volume` NUMERIC oldugu icin metin
 * geliyor; gosterim aninda `utils/money` ile kurusa cevrilir.
 */
export interface AdminStats {
  users: { total: number; active: number; inactive: number };
  groups: { active: number; deleted: number };
  expenses: { count: number; volume: string };
  settlements: { confirmed_count: number; confirmed_volume: string };
  trends: { last_7_days: PeriodStats; last_30_days: PeriodStats };
}
