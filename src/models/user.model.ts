import db from '../db/connection';

import type { UserInsert, UserRow } from '../types/models';

/**
 * users tablosu icin veri erisim katmani. Is mantigi yok, sadece sorgu.
 *
 * Onemli kural: `password_hash` yalnizca `findByEmail` ile doner (login'de
 * karsilastirmak icin gerekli). Disariya cikan her sorgu PUBLIC_USER_COLUMNS
 * kullanir, boylece hash'in response'a sizmasi tesadufe birakilmaz.
 */

export const PUBLIC_USER_COLUMNS = [
  'id',
  'email',
  'name',
  'role',
  'is_active',
  'created_at',
  'avatar',
  'handle',
] as const;

/** Response'a konulabilecek kullanici gorunumu — password_hash icermez. */
export type PublicUser = Pick<UserRow, (typeof PUBLIC_USER_COLUMNS)[number]>;

const publicColumns = [...PUBLIC_USER_COLUMNS];

/** Login icin: hash dahil tam satir. Sadece auth servisi cagirmali. */
const findByEmail = async (email: string): Promise<UserRow | undefined> =>
  db('users').where({ email }).first();

/**
 * Sifre degistirirken mevcut sifreyi dogrulamak icin: hash dahil tam satir.
 * `findByEmail` ile ayni kural gecerli — yalnizca auth servisi cagirmali,
 * donen satir hicbir zaman dogrudan response'a yazilmaz.
 */
const findById = async (id: string): Promise<UserRow | undefined> =>
  db('users').where({ id }).first();

const findPublicById = async (id: string): Promise<PublicUser | undefined> =>
  db('users').select(publicColumns).where({ id }).first();

const create = async (data: UserInsert): Promise<PublicUser> => {
  const [created] = await db('users').insert(data).returning(publicColumns);
  return created as PublicUser;
};

const listPublic = async (): Promise<PublicUser[]> =>
  db('users').select(publicColumns).orderBy('created_at', 'desc');

/** `updateProfile`in yazdigi alanlar — govdeden gelen nesnenin oldugu gibi
 *  `.update()`e verilmemesinin gerekcesi altta. */
export interface ProfilePatch {
  name: string;
  handle: string | null;
  avatar: string | null;
}

/**
 * Kullanicinin **kendi** guncelleyebildigi alanlar: `name`, `handle`, `avatar`
 * (2.6 + Ayarlar/Profil). `role`, `is_active` ve `password_hash` bilerek yok
 * — govdeden gelen nesne oldugu gibi `.update()`e verilseydi `PUT /users/me`
 * govdesine `{"role":"admin"}` yazan biri kendini admin yapardi. Yazilan
 * kolon adlari burada **sabit**; servis katmani ne gonderirse gondersin
 * baska bir kolon yazilamaz. Ayni gerekce 1.3'te `register`'in `role`'u yok
 * saymasinda da var.
 *
 * `'handle_taken'`: `handle` kolonu `UNIQUE` (migration 18). Baska biri ayni
 * handle'i aninda almis olabilir (yaris) — DB'nin kisiti son sozu soyluyor,
 * bu fonksiyon onceden kontrol etmiyor (TOCTOU'dan kacinmak icin, `group.model`
 * daki slug carpismasi kontroluyle ayni gerekce ama burada yeniden deneme
 * yok: kullanici baska bir handle **secmeli**, otomatik numara eklenmez).
 */
const updateProfile = async (
  userId: string,
  patch: ProfilePatch
): Promise<PublicUser | undefined | 'handle_taken'> => {
  try {
    const [updated] = await db('users')
      .where({ id: userId })
      .update({ name: patch.name, handle: patch.handle, avatar: patch.avatar })
      .returning(publicColumns);

    return updated as PublicUser | undefined;
  } catch (error) {
    const pgError = error as { code?: string } | null;

    // 23505 = unique_violation. Bu UPDATE'te yazilan tek UNIQUE kolon `handle`.
    if (pgError?.code === '23505') {
      return 'handle_taken';
    }

    throw error;
  }
};

/**
 * Sifre hash'ini degistirir. Hash'i **servis** uretir; bu katman ham sifre
 * gormez — gorseydi bcrypt cagrisi iki yere dagilirdi.
 *
 * Donen deger "satir bulundu mu": token gecerli ama kullanici silinmis olabilir.
 */
const updatePasswordHash = async (userId: string, passwordHash: string): Promise<boolean> => {
  const affected = await db('users').where({ id: userId }).update({ password_hash: passwordHash });

  return affected > 0;
};

/**
 * Kullaniciyi devre disi birakir ya da yeniden aktiflestirir (1.8).
 *
 * Kullanici **silinmez**: `expenses.paid_by` ve `settlements.from_user`
 * RESTRICT ile bagli, yani silme zaten mumkun degil — pasiflestirme bu
 * tasarimin dogal karsiligi. Pasif kullanicinin gecmisi yerinde kalir,
 * yalnizca login edemez (bkz. auth.service.login).
 *
 * Zaten istenen durumda olan bir kullanici icin de satiri doner; cagiran
 * katman "degisiklik oldu mu" bilgisini `is_active`'e bakarak verir.
 */
const setActive = async (userId: string, isActive: boolean): Promise<PublicUser | undefined> => {
  const [updated] = await db('users')
    .where({ id: userId })
    .update({ is_active: isActive })
    .returning(publicColumns);

  return updated as PublicUser | undefined;
};

/**
 * "Aktivite'yi en son ne zaman gordu" — sidebar rozetindeki okunmamis sayisi
 * bunun ustune hesaplanir (bkz. docs/decisions/aktivite-okunma-sayaci.md).
 * `undefined` yalnizca kullanici satiri hic yoksa doner (silinmis kullanici).
 */
const findActivitySeenAt = async (userId: string): Promise<Date | undefined> => {
  const row = await db('users').select('activity_seen_at').where({ id: userId }).first();

  return row?.activity_seen_at;
};

/** Simdiki zamani "gorulme ani" olarak yazar. Donen deger "satir bulundu mu". */
const markActivitySeen = async (userId: string): Promise<boolean> => {
  const affected = await db('users')
    .where({ id: userId })
    .update({ activity_seen_at: new Date() });

  return affected > 0;
};

export default {
  findByEmail,
  findById,
  findPublicById,
  create,
  listPublic,
  updateProfile,
  updatePasswordHash,
  setActive,
  findActivitySeenAt,
  markActivitySeen,
};
