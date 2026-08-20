/**
 * Istemci tarafi form dogrulamasi — **tek kapi**.
 *
 * NEDEN BURADA DA VAR
 * -------------------
 * Buradaki kurallar backend'deki `src/services/auth.service.ts` kurallarinin
 * kopyasidir. Tek amaclari **hizli geri bildirim**: kullanici 7 karakterlik bir
 * sifre yazdiginda cevabi bir ag gidis-donusu beklemeden gormeli.
 *
 * NEDEN OTORITE DEGIL
 * -------------------
 * Bu dosyadaki hicbir kontrol bir guvenlik siniri degildir. Tarayici konsolu,
 * curl ya da Postman bu kodu tamamen atlayarak `/auth/register`'a istek atabilir;
 * istemcide calisan hicbir kod saldirgan icin zorunlu degildir. Asil dogrulama
 * her zaman backend'de (bkz. docs/decisions/2.2.md).
 *
 * KURALLAR NEDEN ELLE KOPYALANDI
 * ------------------------------
 * Backend ile frontend ayri projeler; paylasilan bir tip/kural paketi yok
 * (bkz. docs/decisions/2.1.md "acik kalan noktalar"). Kurallar sapabilir; bu
 * durumda **backend kazanir** ve kullanici backend'in mesajini gorur — cunku
 * istemci kontrolu gecen istek yine de sunucuda dogrulanir. Yani sapma bir
 * guvenlik acigi degil, yalnizca gec kalmis bir geri bildirimdir.
 */

/** `auth.service.ts` -> MIN_PASSWORD_LENGTH */
export const MIN_PASSWORD_LENGTH = 8;
/** `auth.service.ts` -> MAX_PASSWORD_LENGTH (bcrypt 72 bayttan sonrasini yok sayar) */
export const MAX_PASSWORD_LENGTH = 72;
/** `users.name` kolonu ile ayni */
export const MAX_NAME_LENGTH = 120;
/** `users.email` kolonu ile ayni */
export const MAX_EMAIL_LENGTH = 255;
/** `auth.service.ts` -> MAX_AVATAR_BYTES */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

/** Backend'deki EMAIL_PATTERN ile ayni: "bosluksuz yerel@alan.uzanti". */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Backend'deki HANDLE_PATTERN ile ayni: kucuk harf, rakam, alt cizgi, 3-20. */
const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;

export type FieldErrors = Record<string, string>;

/**
 * `interface` degil `type`: TypeScript yalnizca tip takma adlarina ortuk index
 * signature verir. `useAuthForm<V extends Record<string, string>>` kisitini
 * interface'ler saglamaz.
 */
export type LoginFormValues = {
  email: string;
  password: string;
};

export type RegisterFormValues = {
  email: string;
  password: string;
  name: string;
};

/** Ayarlar > profil (2.6). Yalnizca `name`: e-posta ve rol degistirilemiyor. */
export type ProfileFormValues = {
  name: string;
  /** Bos string -> takma ad yok. `@` on ekli **degil** (yalnizca gosterimde eklenir). */
  handle: string;
  /** Bos string -> fotograf yok. Doluysa `data:image/...;base64,...`. */
  avatar: string;
};

/** Ayarlar > sifre degistirme (2.6). */
export type PasswordFormValues = {
  currentPassword: string;
  newPassword: string;
  /** Yalnizca istemcide var — gerekcesi `validatePasswordForm` icinde. */
  newPasswordRepeat: string;
};

/** Backend `normalizeEmail` ile ayni: bosluk kirp + kucuk harfe cevir. */
export const normalizeEmail = (value: string): string => value.trim().toLowerCase();

/**
 * Giris formu: yalnizca **bos mu** kontrolu.
 *
 * Bilincli olarak e-posta bicimi ya da sifre uzunlugu dogrulanmiyor; backend'in
 * `validateLoginInput`'u da yalnizca bunu yapiyor. Sebep: giris, yeni bir kayit
 * uretmez, **var olan** bir kaydi eslestirir. Kurallar zamanla degisebilir
 * (bugun min 8, dun min 6); giriste yeni kurali dayatmak, eski kurallarla
 * acilmis gecerli bir hesabi arayuzden erisilemez hale getirirdi.
 *
 * Ikinci sebep: giris formunda sifre kurallarini gostermek, kural setini
 * kimlik dogrulamadan once sizdirmaktir.
 */
export const validateLoginForm = (values: LoginFormValues): FieldErrors => {
  const errors: FieldErrors = {};

  if (!values.email.trim()) {
    errors.email = 'E-posta zorunlu';
  }

  if (!values.password) {
    errors.password = 'Sifre zorunlu';
  }

  return errors;
};

/**
 * Kayit formu: backend'in `validateRegisterInput` kurallarinin aynisi.
 *
 * Mesajlar da birebir ayni metin. Farkli yazilsalardi kullanici ayni kural icin
 * iki farkli cumle gorurdu ("Sifre cok kisa" / "Sifre en az 8 karakter olmali")
 * ve hangisinin gecerli oldugu belirsiz kalirdi.
 */
export const validateRegisterForm = (values: RegisterFormValues): FieldErrors => {
  const errors: FieldErrors = {};

  const email = normalizeEmail(values.email);
  const name = values.name.trim();

  if (!email) {
    errors.email = 'E-posta zorunlu';
  } else if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    errors.email = 'Gecerli bir e-posta adresi girin';
  }

  if (!values.password) {
    errors.password = 'Sifre zorunlu';
  } else if (values.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Sifre en az ${MIN_PASSWORD_LENGTH} karakter olmali`;
  } else if (values.password.length > MAX_PASSWORD_LENGTH) {
    errors.password = `Sifre en fazla ${MAX_PASSWORD_LENGTH} karakter olabilir`;
  }

  if (!name) {
    errors.name = 'Isim zorunlu';
  } else if (name.length > MAX_NAME_LENGTH) {
    errors.name = `Isim en fazla ${MAX_NAME_LENGTH} karakter olabilir`;
  }

  return errors;
};

/**
 * Profil formu: backend'in `validateUpdateProfileInput` kurallarinin aynisi
 * ve **ayni metinler**.
 */
export const validateProfileForm = (values: ProfileFormValues): FieldErrors => {
  const errors: FieldErrors = {};
  const name = values.name.trim();

  if (!name) {
    errors.name = 'Isim zorunlu';
  } else if (name.length > MAX_NAME_LENGTH) {
    errors.name = `Isim en fazla ${MAX_NAME_LENGTH} karakter olabilir`;
  }

  // Bos -> kaldirma istegi, dogrulanmaz. Doluysa bicim kontrol edilir.
  const handle = values.handle.trim().toLowerCase();
  if (handle && !HANDLE_PATTERN.test(handle)) {
    errors.handle = 'Takma ad yalnizca kucuk harf, rakam ve alt cizgi icerebilir (3-20 karakter)';
  }

  return errors;
};

/**
 * Sifre degistirme formu.
 *
 * MEVCUT SIFREYE UZUNLUK KURALI UYGULANMIYOR
 * ------------------------------------------
 * Backend de uygulamiyor: kurallar zamanla degisebilir (bugun min 8, dun min 6)
 * ve eski kurala gore acilmis gecerli bir sifreyi burada elemek, kullaniciyi
 * sifresini **hic degistiremez** hale getirirdi. Dogrulugu bcrypt soyleyecek.
 *
 * TEKRAR ALANI NEDEN VAR (VE NEDEN YALNIZCA ISTEMCIDE)
 * ---------------------------------------------------
 * Yeni sifre maskeli bir alana yaziliyor; yazim hatasi gorulemez. Hatali yazilan
 * sifre kabul edilirse kullanici **kendi hesabina kilitlenir** — geri donusu
 * olan bir hata degil. Backend'e gonderilmiyor cunku bir guvenlik kurali degil,
 * bir yazim hatasi tuzagi; sunucunun ayni metni iki kez almasi hicbir sey
 * dogrulamaz (bkz. docs/decisions/2.6.md).
 */
export const validatePasswordForm = (values: PasswordFormValues): FieldErrors => {
  const errors: FieldErrors = {};

  if (!values.currentPassword) {
    errors.currentPassword = 'Mevcut sifre zorunlu';
  }

  if (!values.newPassword) {
    errors.newPassword = 'Yeni sifre zorunlu';
  } else if (values.newPassword.length < MIN_PASSWORD_LENGTH) {
    errors.newPassword = `Yeni sifre en az ${MIN_PASSWORD_LENGTH} karakter olmali`;
  } else if (values.newPassword.length > MAX_PASSWORD_LENGTH) {
    errors.newPassword = `Yeni sifre en fazla ${MAX_PASSWORD_LENGTH} karakter olabilir`;
  } else if (values.newPassword === values.currentPassword) {
    errors.newPassword = 'Yeni sifre mevcut sifreden farkli olmali';
  }

  if (!errors.newPassword && values.newPasswordRepeat !== values.newPassword) {
    errors.newPasswordRepeat = 'Sifreler eslesmiyor';
  }

  return errors;
};

export const hasErrors = (errors: FieldErrors): boolean => Object.keys(errors).length > 0;
