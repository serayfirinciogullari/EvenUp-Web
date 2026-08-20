import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import config from '../config/env';
import userModel from '../models/user.model';
import ApiError from '../utils/ApiError';

import type { AuthUser, JwtPayload } from '../types/auth';
import type { PublicUser } from '../models/user.model';
import type { SignOptions } from 'jsonwebtoken';

/**
 * Kimlik dogrulama is mantigi: dogrulama, hash'leme, token uretme/cozme.
 * HTTP'den haberi yoktur; hata durumlarini ApiError olarak firlatir.
 */

export const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72; // bcrypt 72 bayttan sonrasini yok sayar
const MAX_NAME_LENGTH = 120; // users.name kolonu ile ayni
const MAX_EMAIL_LENGTH = 255; // users.email kolonu ile ayni

// Tam RFC 5322 degil (o regex pratikte okunmaz); "bosluksuz yerel@alan.uzanti" yeterli.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** `users.handle` (migration 18): kucuk harf, rakam, alt cizgi; 3-20 karakter. */
const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;

/** Yalnizca JPG/PNG kabul edilir; grup 2 base64 govdesidir. */
const AVATAR_PATTERN = /^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/]+=*)$/;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2MB — Profil sekmesindeki metinle ayni sinir

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResult {
  user: PublicUser;
  token: string;
  expiresIn: string;
}

/**
 * PUT /users/me govdesi (2.6, Ayarlar/Profil ile genisletildi). E-posta ve
 * rol bilerek yok — asagida gerekcesi.
 *
 * `handle`/`avatar` **tam durum** tasir (PUT'un anlami budur): `null` ya da
 * bos metin "kaldir" demek, `undefined` degil — takma isim ucundakiyle
 * (`PUT /groups/:id/members/:userId/nickname`) ayni sozlesme. Yani istemci
 * her zaman formun **guncel** halini gonderir, kismi bir yama degil.
 */
export interface UpdateProfileInput {
  name: string;
  /** Kendi hesap @adi. Kisi bazli takma isimlerden (member_nicknames) AYRI. */
  handle: string | null;
  /** `data:image/(png|jpeg);base64,...`; en fazla 2MB. */
  avatar: string | null;
}

/** PUT /users/me/password govdesi (2.6). */
export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

/** Secret'i koda gomme yasagi: yoksa uygulama token uretmez, 500 doner. */
const getJwtSecret = (): string => {
  if (!config.jwtSecret) {
    throw ApiError.internal('JWT_SECRET tanimli degil');
  }
  return config.jwtSecret;
};

const normalizeEmail = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

/* ------------------------------------------------------------- validasyon */

/**
 * Alan kurallari tek yerde: kayit (1.3) ve profil/sifre guncelleme (2.6) ayni
 * kurali **ayni cumleyle** uygulasin. Iki yerde ayri yazilsalardi kullanici
 * ayni kisitlama icin iki farkli metin gorurdu ve biri degistirilirken digeri
 * unutulurdu.
 *
 * `label` parametresi yalnizca metin icin: "Sifre en az 8..." / "Yeni sifre
 * en az 8...". Kural degismiyor, kuralin **hangi alana** ait oldugu degisiyor.
 */
const passwordError = (password: string, label = 'Sifre'): string | undefined => {
  if (!password) {
    return `${label} zorunlu`;
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `${label} en az ${MIN_PASSWORD_LENGTH} karakter olmali`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `${label} en fazla ${MAX_PASSWORD_LENGTH} karakter olabilir`;
  }
  return undefined;
};

const nameError = (name: string): string | undefined => {
  if (!name) {
    return 'Isim zorunlu';
  }
  if (name.length > MAX_NAME_LENGTH) {
    return `Isim en fazla ${MAX_NAME_LENGTH} karakter olabilir`;
  }
  return undefined;
};

const validateRegisterInput = (input: Partial<RegisterInput>): RegisterInput => {
  const email = normalizeEmail(input.email);
  const password = asString(input.password);
  const name = asString(input.name).trim();
  const errors: Record<string, string> = {};

  if (!email) {
    errors.email = 'E-posta zorunlu';
  } else if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    errors.email = 'Gecerli bir e-posta adresi girin';
  }

  const passwordProblem = passwordError(password);
  if (passwordProblem) {
    errors.password = passwordProblem;
  }

  const nameProblem = nameError(name);
  if (nameProblem) {
    errors.name = nameProblem;
  }

  if (Object.keys(errors).length > 0) {
    throw ApiError.badRequest('Gecersiz kayit bilgileri', errors);
  }

  return { email, password, name };
};

const validateUpdateProfileInput = (input: Partial<UpdateProfileInput>): UpdateProfileInput => {
  const name = asString(input.name).trim();
  const errors: Record<string, string> = {};

  const nameProblem = nameError(name);
  if (nameProblem) {
    errors.name = nameProblem;
  }

  // Bos/verilmemis -> kaldir (null); verilmisse bicim dogrulanir.
  const rawHandle = asString(input.handle).trim().toLowerCase();
  let handle: string | null = null;
  if (rawHandle) {
    if (!HANDLE_PATTERN.test(rawHandle)) {
      errors.handle = 'Takma ad yalnizca kucuk harf, rakam ve alt cizgi icerebilir (3-20 karakter)';
    } else {
      handle = rawHandle;
    }
  }

  const rawAvatar = asString(input.avatar);
  let avatar: string | null = null;
  if (rawAvatar) {
    const match = AVATAR_PATTERN.exec(rawAvatar);
    if (!match) {
      errors.avatar = 'Gecersiz fotograf formati (yalnizca JPG veya PNG)';
    } else if (Buffer.byteLength(match[2], 'base64') > MAX_AVATAR_BYTES) {
      errors.avatar = 'Fotograf en fazla 2MB olabilir';
    } else {
      avatar = rawAvatar;
    }
  }

  if (Object.keys(errors).length > 0) {
    throw ApiError.badRequest('Gecersiz profil bilgileri', errors);
  }

  return { name, handle, avatar };
};

const validateChangePasswordInput = (input: Partial<ChangePasswordInput>): ChangePasswordInput => {
  const currentPassword = asString(input.currentPassword);
  const newPassword = asString(input.newPassword);
  const errors: Record<string, string> = {};

  // Mevcut sifreye uzunluk kurali uygulanmiyor: kural degismis olabilir ve eski
  // kurala gore acilmis gecerli bir sifre burada elenirse kullanici sifresini
  // hic degistiremez hale gelirdi. Bos olup olmadigina bakmak yeterli; dogrulugu
  // zaten bcrypt karsilastirmasi soyleyecek. (Ayni gerekce login'de de var.)
  if (!currentPassword) {
    errors.currentPassword = 'Mevcut sifre zorunlu';
  }

  const newError = passwordError(newPassword, 'Yeni sifre');
  if (newError) {
    errors.newPassword = newError;
  } else if (newPassword === currentPassword) {
    errors.newPassword = 'Yeni sifre mevcut sifreden farkli olmali';
  }

  if (Object.keys(errors).length > 0) {
    throw ApiError.badRequest('Gecersiz sifre bilgileri', errors);
  }

  return { currentPassword, newPassword };
};

const validateLoginInput = (input: Partial<LoginInput>): LoginInput => {
  const email = normalizeEmail(input.email);
  const password = asString(input.password);

  if (!email || !password) {
    throw ApiError.badRequest('E-posta ve sifre zorunlu');
  }

  return { email, password };
};

/* ------------------------------------------------------------------ token */

const signToken = (user: AuthUser): string => {
  const payload: JwtPayload = { userId: user.id, role: user.role };
  // expiresIn'in tip tanimi '7d' gibi literal sablonlar bekliyor; deger .env'den
  // string geldigi icin SignOptions uzerinden daraltiyoruz.
  const options: SignOptions = { expiresIn: config.jwtExpiresIn as SignOptions['expiresIn'] };

  return jwt.sign(payload, getJwtSecret(), options);
};

/** Token'i cozer. Gecersiz/suresi dolmus/bicimsiz her durumda 401 firlatir. */
const verifyToken = (token: string): AuthUser => {
  let decoded: unknown;

  try {
    decoded = jwt.verify(token, getJwtSecret());
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw ApiError.unauthorized('Token suresi dolmus');
    }
    throw ApiError.unauthorized('Gecersiz token');
  }

  // jwt.verify imzayi dogrular, payload'in **icerigini** dogrulamaz:
  // baska bir sema ile imzalanmis eski bir token buraya duserse elenmeli.
  if (typeof decoded !== 'object' || decoded === null) {
    throw ApiError.unauthorized('Gecersiz token');
  }

  const { userId, role } = decoded as Partial<JwtPayload>;

  if (typeof userId !== 'string' || (role !== 'admin' && role !== 'user')) {
    throw ApiError.unauthorized('Gecersiz token');
  }

  return { id: userId, role };
};

/* ----------------------------------------------------------------- islemler */

const register = async (input: Partial<RegisterInput>): Promise<AuthResult> => {
  const { email, password, name } = validateRegisterInput(input);

  const existing = await userModel.findByEmail(email);
  if (existing) {
    throw ApiError.conflict('Bu e-posta zaten kayitli');
  }

  const passwordHash = await bcrypt.hash(password, config.bcryptSaltRounds);

  // role bilerek input'tan alinmiyor: istemcinin kendini admin yapmasini engeller.
  // Admin atamasi ayri bir yonetim akisinda yapilir.
  const user = await userModel.create({
    email,
    name,
    password_hash: passwordHash,
  });

  return {
    user,
    token: signToken({ id: user.id, role: user.role }),
    expiresIn: config.jwtExpiresIn,
  };
};

const login = async (input: Partial<LoginInput>): Promise<AuthResult> => {
  const { email, password } = validateLoginInput(input);

  const user = await userModel.findByEmail(email);

  // "Kullanici yok" ile "sifre yanlis" ayni mesaji doner: aksi halde endpoint
  // hangi e-postalarin kayitli oldugunu sizdirir.
  if (!user || !user.is_active) {
    throw ApiError.unauthorized('E-posta veya sifre hatali');
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatches) {
    throw ApiError.unauthorized('E-posta veya sifre hatali');
  }

  return {
    // password_hash'i elle ayikliyoruz: user burada tam satir (hash dahil).
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      is_active: user.is_active,
      created_at: user.created_at,
      avatar: user.avatar,
      handle: user.handle,
    },
    token: signToken({ id: user.id, role: user.role }),
    expiresIn: config.jwtExpiresIn,
  };
};

const getProfile = async (userId: string): Promise<PublicUser> => {
  const user = await userModel.findPublicById(userId);

  // Token gecerli ama kullanici silinmis olabilir.
  if (!user) {
    throw ApiError.unauthorized('Kullanici bulunamadi');
  }

  return user;
};

/**
 * PUT /users/me — kullanici **kendi** profilini gunceller (2.6).
 *
 * `userId` govdeden degil token'dan geliyor (bkz. `user.controller.ts`), yani
 * "baskasinin profilini guncelleme" diye bir durum olusamaz; yetki kontrolu
 * gerektiren bir hedef ID yok.
 *
 * DEGISTIRILEBILEN TEK ALAN: `name`
 * ---------------------------------
 * - `email` disarida: e-posta ayni zamanda **giris kimligi** ve `users.email`
 *   unique. Degistirilebilir olsaydi dogrulama (yeni adrese link gonderme),
 *   catisma yonetimi ve "eski adresle giris denemeleri" ayri bir akis olurdu.
 *   Gorev bunu istemiyor; yarim yapmak, hesabini erisilemez adrese tasiyan bir
 *   kullanici uretirdi.
 * - `role` ve `is_active` disarida: bunlar kullanicinin **kendisi hakkinda
 *   karar veremeyecegi** alanlar (1.8'deki admin akisina ait). Model katmani
 *   da ayrica koruyor (`updateName` sabit kolon yaziyor).
 */
const updateProfile = async (
  userId: string,
  input: Partial<UpdateProfileInput>
): Promise<PublicUser> => {
  const { name, handle, avatar } = validateUpdateProfileInput(input);

  const updated = await userModel.updateProfile(userId, { name, handle, avatar });

  // `handle` UNIQUE — araya baska bir istek girip ayni handle'i almis olabilir
  // (yaris); DB'nin kisiti son sozu soyluyor (bkz. user.model.ts).
  if (updated === 'handle_taken') {
    throw ApiError.conflict('Bu takma ad zaten kullaniliyor', {
      handle: 'Bu takma ad zaten kullaniliyor',
    });
  }

  // Token gecerli ama kullanici silinmis olabilir (getProfile ile ayni durum).
  if (!updated) {
    throw ApiError.unauthorized('Kullanici bulunamadi');
  }

  return updated;
};

/**
 * PUT /users/me/password — mevcut sifre dogrulanarak sifre degisikligi (2.6).
 *
 * NEDEN MEVCUT SIFRE TEKRAR SORULUYOR
 * -----------------------------------
 * Gecerli bir token bu istegi zaten "kimlik dogrulanmis" yapiyor; teknik olarak
 * mevcut sifreye ihtiyac yok. Sorulmasinin sebebi **token'in calinabilir
 * olmasi**: token localStorage'da duruyor (2.1), XSS ya da acik birakilmis bir
 * oturum onu ele gecirmis olabilir. Mevcut sifre sorulmazsa token'i eline
 * geciren biri sifreyi degistirip hesabin **kalici** sahibi olur — gercek
 * kullanici artik giremez. Mevcut sifre, token'da olmayan ve yalnizca gercek
 * kullanicinin bildigi ikinci bir kanittir.
 * Ayrintili gerekce: docs/decisions/2.6.md.
 *
 * YANLIS MEVCUT SIFRE -> 400 (401 DEGIL)
 * --------------------------------------
 * Istek kimlik dogrulamasindan gecti; basarisiz olan sey **govdedeki bir alan**.
 * 401 donseydi frontend'in merkezi interceptor'u (web/src/api/client.ts) bunu
 * "oturum dustu" sayip kullaniciyi cikartirdi: sifresini yanlis yazan kisi hata
 * mesaji yerine login ekraninda uyanirdi.
 */
const changePassword = async (
  userId: string,
  input: Partial<ChangePasswordInput>
): Promise<void> => {
  const { currentPassword, newPassword } = validateChangePasswordInput(input);

  const user = await userModel.findById(userId);

  if (!user || !user.is_active) {
    throw ApiError.unauthorized('Kullanici bulunamadi');
  }

  const currentMatches = await bcrypt.compare(currentPassword, user.password_hash);

  if (!currentMatches) {
    // Mesaj bilerek acik: burada sizacak bir bilgi yok — istegi atan kisi zaten
    // hesabin sahibi olarak dogrulanmis durumda. Login'deki muglak mesajin
    // ("E-posta veya sifre hatali") sebebi kullanici sizdirmakti; o risk burada
    // yok. `details` alani frontend'in hatayi dogru alanin altina koymasi icin.
    throw ApiError.badRequest('Mevcut sifre hatali', {
      currentPassword: 'Mevcut sifre hatali',
    });
  }

  const passwordHash = await bcrypt.hash(newPassword, config.bcryptSaltRounds);
  const changed = await userModel.updatePasswordHash(userId, passwordHash);

  if (!changed) {
    throw ApiError.unauthorized('Kullanici bulunamadi');
  }
};

/**
 * POST /users/me/activity-seen — kullanicinin Aktivite akisini en son ne
 * zaman gordugunu simdiki zamana gunceller. Govde yok, govdeye de gerek yok:
 * "simdi" tek anlamli deger. Gerekce: docs/decisions/aktivite-okunma-sayaci.md.
 */
const markActivitySeen = async (userId: string): Promise<void> => {
  const changed = await userModel.markActivitySeen(userId);

  if (!changed) {
    throw ApiError.unauthorized('Kullanici bulunamadi');
  }
};

export default {
  register,
  login,
  getProfile,
  updateProfile,
  changePassword,
  markActivitySeen,
  signToken,
  verifyToken,
};
