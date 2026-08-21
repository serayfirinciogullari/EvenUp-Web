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
 * POST /users/me/delete-request — kullanicinin kendi baslattigi silme sureci
 * (bkz. docs/decisions/3.17-hesap-silme.md).
 *
 * `is_active=false` de aynen yazilir: giris denemesini reddeden zaten var olan
 * mekanizma (1.8) budur, `deleted_at` yalnizca "neden reddedildi ve ne zamana
 * kadar geri alinabilir" sorusunu cevaplamak icin ayrica tutuluyor.
 *
 * Kosulsuz UPDATE — idempotent. Kullanici (token hala geçerliyken) istegi
 * iki kez atarsa ikinci cagri `deleted_at`i "simdi"ye tazeler; bu 30 gunluk
 * pencereyi yalnizca uzatir, hicbir guvenlik riski dogurmaz.
 */
const requestDeletion = async (userId: string): Promise<boolean> => {
  const affected = await db('users')
    .where({ id: userId })
    .update({ deleted_at: new Date(), is_active: false });

  return affected > 0;
};

/**
 * POST /users/me/cancel-deletion — 30 gunluk pencere icinde geri alma.
 *
 * Cagiran (`auth.service.cancelDeletion`) `deleted_at`in dolu ve sure
 * icinde oldugunu **onceden** dogruluyor; bu fonksiyon yalnizca yazmayi
 * yapiyor. Kosul burada tekrarlanmiyor (`where deleted_at is not null` gibi)
 * cunku TOCTOU riski yok — servis katmani ayni istek icinde zaten okumus.
 */
const cancelDeletion = async (userId: string): Promise<PublicUser | undefined> => {
  const [updated] = await db('users')
    .where({ id: userId })
    .update({ deleted_at: null, is_active: true })
    .returning(publicColumns);

  return updated as PublicUser | undefined;
};

/** `anonymizeExpiredDeletions` sonrasi "Silinmis Kullanici" adi — testler ve
 *  cron gorevi ayni sabiti kullansin diye disariya aciliyor. */
export const ANONYMIZED_USER_NAME = 'Silinmis Kullanici';

/**
 * Gunluk cron gorevinin (bkz. `src/jobs/anonymizeDeletedUsers.job.ts`) yazma
 * ucu: 30 gunu asmis silme taleplerini kalici hale getirir.
 *
 * NEDEN SATIR SILINMIYOR, ANONIMLESTIRILIYOR
 * ---------------------------------------------
 * Bu dosyanin basindaki gerekce (RESTRICT kisitlari) burada da gecerli — satir
 * silinemez. Bunun yerine kimliklendirici alanlar (`name`, `email`,
 * `password_hash`) geri donusumsuz bir degerle degistiriliyor; `deleted_at`
 * DOLU KALIYOR ve artik "kalici olarak gitti" anlamina geliyor (30 gun
 * icindeki "geri alinabilir" anlamindan farkli — ikisi ayni alanla
 * ifade ediliyor cunku ikinci durum birincinin dogal devami).
 *
 * NEDEN TEK SQL UPDATE (dongu degil)
 * -----------------------------------
 * `email` satir basina benzersiz olmak zorunda (`users.email` UNIQUE);
 * `db.raw` ile `id` sutunundan turetilen bir ifade her satirda farkli bir
 * deger ureterek bunu tek bir UPDATE'te (N ayri sorgu degil) saglıyor.
 *
 * NEDEN `password_hash` PARAMETRE (servis uretiyor)
 * ---------------------------------------------------
 * `updatePasswordHash` ile ayni ilke: bcrypt cagrisi model katmaninda degil,
 * servis/gorev katmaninda kalsin diye hash disaridan geliyor. Butun
 * anonimlestirilen satirlar **ayni** hash'i paylasabilir — kimse bu degeri
 * dogru bir sifreyle eslestiremez cunku e-posta da degisti, giris zaten
 * imkansiz; paylasilan hash bir zayiflik degil.
 *
 * Idempotent: `name != ANONYMIZED_USER_NAME` kosulu, gorev bir onceki gun
 * hata alip yeniden calistiginda ayni satirlari tekrar islemez.
 */
const anonymizeExpiredDeletions = async (cutoff: Date, passwordHash: string): Promise<number> =>
  db('users')
    .whereNotNull('deleted_at')
    .andWhere('deleted_at', '<', cutoff)
    .andWhere('name', '!=', ANONYMIZED_USER_NAME)
    .update({
      name: ANONYMIZED_USER_NAME,
      // `db.raw` calisma zamaninda knex'in update govdesinde desteklenir;
      // tip tanimlari bunu bilmiyor, o yuzden burada tek satirlik bir assertion var.
      email: db.raw("'deleted-' || id || '@evenup.local'") as unknown as string,
      password_hash: passwordHash,
    });

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
  requestDeletion,
  cancelDeletion,
  anonymizeExpiredDeletions,
  findActivitySeenAt,
  markActivitySeen,
};
