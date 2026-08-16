import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ThemeChoice } from '@/components/ThemeToggle';
import usersApi from '../api/users';
import useAuth from '../hooks/useAuth';
import useAuthForm from '../hooks/useAuthForm';
import { validatePasswordForm, validateProfileForm } from '../utils/validation';

import type { PasswordFormValues, ProfileFormValues } from '../utils/validation';
import type { ReactNode } from 'react';

/**
 * Ayarlar (2.6): profil duzenleme, sifre degistirme, tema.
 *
 * Uc blok ayri `<section>` ve ilk ikisi ayri `<form>`. Tek forma sigdirilmasi
 * teknik olarak mumkundu ama yanlis olurdu: "Kaydet"e basan biri ismini
 * degistirmek isterken sifre alanlarini da doldurmak zorunda kalirdi ve tek bir
 * hata iki islemi birden bloklardi. Ayri formlar, ayri uc noktalar
 * (`PUT /users/me`, `PUT /users/me/password`) — sinir backend'dekiyle ayni.
 *
 * BASARININ KANITI: STATE DEGIL, SUNUCUDAN GERI OKUMA
 * ---------------------------------------------------
 * Profil kaydedildikten sonra `refreshUser()` cagriliyor; yani ekranda (ve ust
 * bardaki isimde) gorunen deger `GET /auth/me`den **geri okunan** degerdir.
 * Yerel state'i guncelleyip "kaydedildi" demek, istegin yalnizca hata
 * vermedigini gosterirdi — F5'ten sonra ne gorulecegini degil.
 */

/** Formlarin ortak kabugu: baslik + aciklama + govde. */
const SettingsCard = ({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}) => (
  // Solid: kullanicinin okudugu/doldurdugu yuzey. Glass ozet icin (gorsel kimlik).
  <section aria-labelledby={id} className="card-solid p-5 sm:p-6">
    <h2 id={id}>{title}</h2>
    <p className="mt-1 mb-5 text-sm text-ink-muted">{description}</p>
    {children}
  </section>
);

/** Alan altindaki hata satiri — LoginPage/RegisterPage ile ayni bicim. */
const FieldError = ({ id, message }: { id: string; message?: string }) =>
  message ? (
    <p className="field-error text-sm text-destructive" id={id}>
      {message}
    </p>
  ) : null;

const FormError = ({ message }: { message: string | null }) =>
  message ? (
    <p
      className="form-error rounded-md border border-destructive/25 bg-destructive/8 px-3 py-2 text-sm text-destructive"
      role="alert"
    >
      {message}
    </p>
  ) : null;

const SettingsPage = () => {
  const { user, refreshUser } = useAuth();

  /**
   * Sifre degistikten sonra alanlar temizleniyor; ekranda hicbir iz kalmiyor.
   * Bos bir formun yaninda gorunur bir cumle olmazsa kullanici "gonderildi mi,
   * sifirlandi mi?" diye kalir — toast o ana kadar sonmus olabilir.
   */
  const [passwordChanged, setPasswordChanged] = useState(false);

  /* ------------------------------------------------------------------ profil */

  const handleProfileSubmit = useCallback(
    async (values: ProfileFormValues) => {
      await usersApi.updateProfile({ name: values.name.trim() });
      // Cevaptaki `user`i dogrudan kullanmak yerine sunucudan geri okuyoruz;
      // gerekcesi dosyanin basinda.
      await refreshUser();
      toast.success('Profil guncellendi');
    },
    [refreshUser]
  );

  const profileForm = useAuthForm<ProfileFormValues>({
    // ProtectedRoute altindayiz: buraya gelindiginde `user` yuklenmis durumda.
    initialValues: { name: user?.name ?? '' },
    validate: validateProfileForm,
    onSubmit: handleProfileSubmit,
    fallbackMessage: 'Profil guncellenemedi',
  });

  // Degismemis bir ismi kaydetmek bosuna bir istek; buton da bunu soyluyor.
  const nameUnchanged = profileForm.values.name.trim() === (user?.name ?? '');

  /* ------------------------------------------------------------------ sifre */

  /**
   * `onSubmit` basarili olunca formu temizlemesi gerekiyor ama `reset` o
   * fonksiyon yazilirken henuz yok (hook'un donusunde). Ref uzerinden gec
   * baglaniyor; `reset` zaten kimligi degismeyen bir fonksiyon.
   */
  const resetPasswordForm = useRef<() => void>(() => {});

  const passwordForm = useAuthForm<PasswordFormValues>({
    initialValues: { currentPassword: '', newPassword: '', newPasswordRepeat: '' },
    validate: validatePasswordForm,
    onSubmit: async (values) => {
      await usersApi.changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });

      // Sirasi onemli: once alanlari temizle, sonra basariyi duyur.
      resetPasswordForm.current();
      setPasswordChanged(true);
      toast.success('Sifreniz degistirildi');
    },
    fallbackMessage: 'Sifre degistirilemedi',
  });

  resetPasswordForm.current = passwordForm.reset;

  return (
    <section className="flex flex-col gap-4">
      <h1>Ayarlar</h1>

      {/* ================================================================ profil */}
      <SettingsCard
        id="settings-profile"
        title="Profil"
        description="Adiniz gruplarda ve harcama listelerinde bu sekilde gorunur."
      >
        <form onSubmit={profileForm.handleSubmit} noValidate className="flex flex-col gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="name">Ad</Label>
            <Input
              id="name"
              name="name"
              value={profileForm.values.name}
              onChange={(event) => profileForm.setField('name', event.target.value)}
              autoComplete="name"
              aria-invalid={profileForm.fieldErrors.name ? true : undefined}
              aria-describedby={profileForm.fieldErrors.name ? 'name-error' : undefined}
              disabled={profileForm.pending}
            />
            <FieldError id="name-error" message={profileForm.fieldErrors.name} />
          </div>

          {/*
            E-posta ve rol **gosteriliyor ama duzenlenemiyor.** Ikisi de bilincli:
            e-posta ayni zamanda giris kimligi (degistirmek dogrulama akisi ister),
            rol ise kullanicinin kendisi hakkinda karar veremeyecegi bir alan
            (1.8'deki admin akisina ait). Backend her ikisini de yok sayiyor;
            ekran bunu bir yasak gibi degil, bir **durum** gibi gosteriyor.
          */}
          <dl className="grid gap-3 rounded-lg border border-ink/10 px-4 py-3 text-sm sm:grid-cols-2">
            <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-start sm:gap-1">
              <dt className="text-ink-muted">E-posta</dt>
              <dd className="truncate font-medium text-ink">{user?.email}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-start sm:gap-1">
              <dt className="text-ink-muted">Rol</dt>
              <dd>
                <Badge variant="outline" className="border-rose/30 bg-rose/8 text-rose">
                  {user?.role}
                </Badge>
              </dd>
            </div>
          </dl>
          <p className="text-xs text-ink-muted">
            E-posta adresi ve rol bu ekrandan degistirilemez.
          </p>

          <FormError message={profileForm.formError} />

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={profileForm.pending || nameUnchanged}>
              {profileForm.pending ? 'Kaydediliyor...' : 'Kaydet'}
            </Button>
            {nameUnchanged && !profileForm.pending && (
              <span className="text-sm text-ink-muted">Kaydedilmemis degisiklik yok.</span>
            )}
          </div>
        </form>
      </SettingsCard>

      {/* ================================================================= sifre */}
      <SettingsCard
        id="settings-password"
        title="Sifre degistir"
        description="Guvenlik icin once mevcut sifrenizi dogrulamaniz gerekiyor."
      >
        <form
          onSubmit={passwordForm.handleSubmit}
          noValidate
          className="flex flex-col gap-4"
          // Alanlar temizlendiginde eski basari mesaji ekranda kalmasin.
          onChange={() => setPasswordChanged(false)}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="currentPassword">Mevcut sifre</Label>
            <Input
              id="currentPassword"
              name="currentPassword"
              type="password"
              value={passwordForm.values.currentPassword}
              onChange={(event) => passwordForm.setField('currentPassword', event.target.value)}
              autoComplete="current-password"
              aria-invalid={passwordForm.fieldErrors.currentPassword ? true : undefined}
              aria-describedby={
                passwordForm.fieldErrors.currentPassword ? 'currentPassword-error' : undefined
              }
              disabled={passwordForm.pending}
            />
            <FieldError
              id="currentPassword-error"
              message={passwordForm.fieldErrors.currentPassword}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="newPassword">Yeni sifre</Label>
            <Input
              id="newPassword"
              name="newPassword"
              type="password"
              value={passwordForm.values.newPassword}
              onChange={(event) => passwordForm.setField('newPassword', event.target.value)}
              autoComplete="new-password"
              aria-invalid={passwordForm.fieldErrors.newPassword ? true : undefined}
              aria-describedby={
                passwordForm.fieldErrors.newPassword ? 'newPassword-error' : undefined
              }
              disabled={passwordForm.pending}
            />
            <FieldError id="newPassword-error" message={passwordForm.fieldErrors.newPassword} />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="newPasswordRepeat">Yeni sifre (tekrar)</Label>
            <Input
              id="newPasswordRepeat"
              name="newPasswordRepeat"
              type="password"
              value={passwordForm.values.newPasswordRepeat}
              onChange={(event) => passwordForm.setField('newPasswordRepeat', event.target.value)}
              autoComplete="new-password"
              aria-invalid={passwordForm.fieldErrors.newPasswordRepeat ? true : undefined}
              aria-describedby={
                passwordForm.fieldErrors.newPasswordRepeat ? 'newPasswordRepeat-error' : undefined
              }
              disabled={passwordForm.pending}
            />
            <FieldError
              id="newPasswordRepeat-error"
              message={passwordForm.fieldErrors.newPasswordRepeat}
            />
          </div>

          {/*
            Backend "Mevcut sifre hatali" mesajini hem govde mesaji hem de
            `details.currentPassword` olarak doner; ikincisi alanin altina
            dusuyor, birincisi burada. Ayni cumleyi iki kez gostermemek icin
            alan hatasi varken form hatasi gizleniyor.
          */}
          <FormError
            message={passwordForm.fieldErrors.currentPassword ? null : passwordForm.formError}
          />

          {passwordChanged && (
            <p
              className="password-changed rounded-md border border-signal-positive/25 bg-signal-positive/8 px-3 py-2 text-sm text-signal-positive"
              role="status"
            >
              Sifreniz degistirildi. Bu cihazdaki oturumunuz acik kaldi.
            </p>
          )}

          <div>
            <Button type="submit" disabled={passwordForm.pending}>
              {passwordForm.pending ? 'Degistiriliyor...' : 'Sifreyi degistir'}
            </Button>
          </div>
        </form>
      </SettingsCard>

      {/* =============================================================== gorunum */}
      <SettingsCard
        id="settings-theme"
        title="Gorunum"
        description="Tema bu cihazda saklanir; hesabiniza bagli degildir."
      >
        <ThemeChoice />
      </SettingsCard>
    </section>
  );
};

export default SettingsPage;
