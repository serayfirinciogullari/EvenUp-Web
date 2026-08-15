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

/** Backend'deki EMAIL_PATTERN ile ayni: "bosluksuz yerel@alan.uzanti". */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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

export const hasErrors = (errors: FieldErrors): boolean => Object.keys(errors).length > 0;
