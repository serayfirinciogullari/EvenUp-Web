import { useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import AuthShell from '@/components/AuthShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import useAuth from '../hooks/useAuth';
import useAuthForm from '../hooks/useAuthForm';
import { afterAuthPath } from '../utils/afterAuth';
import { MIN_PASSWORD_LENGTH, validateRegisterForm } from '../utils/validation';

import type { RegisterFormValues } from '../utils/validation';

/**
 * Kayit ekrani — gercek `POST /auth/register` cagrisina bagli.
 *
 * KAYIT SONRASI: OTOMATIK GIRIS
 * -----------------------------
 * Backend `/auth/register` cevabinda zaten kullanilabilir bir `token` donuyor.
 * Kullaniciyi login ekranina yollamak, elimizdeki gecerli token'i cope atip az
 * once yazdigi bilgileri tekrar yazdirmak olurdu.
 * Ayrintili gerekce ve hangi kosulda degisecegi: docs/decisions/2.2.md
 *
 * Gorsel kimlik uygulanirken yalnizca sunum katmani degisti; mantik aynen
 * duruyor (bkz. docs/decisions/gorsel-kimlik.md).
 */
const RegisterPage = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleRegister = useCallback(
    async (values: RegisterFormValues) => {
      await register(values);

      /*
        Hedef artik sabit `/groups` degil (bkz. utils/afterAuth.ts). Davet
        linkinden gelen kullanici buraya bir **niyetle** dusuyor: gruba
        katilmak. Kayit bitince onu uygulamanin girisine birakmak, o niyeti
        kaybetmek ve linke tekrar tiklamasini beklemek olurdu.

        Varsayilan Home; gerekcesi `GuestRoute` ile ayni hedefi vermek
        (bkz. LoginPage).
      */
      navigate(afterAuthPath(location.state, '/home'), { replace: true });
    },
    [location.state, navigate, register]
  );

  const { values, setField, fieldErrors, formError, pending, handleSubmit } =
    useAuthForm<RegisterFormValues>({
      initialValues: { name: '', email: '', password: '' },
      validate: validateRegisterForm,
      onSubmit: handleRegister,
      fallbackMessage: 'Kayit olusturulamadi',
    });

  return (
    <AuthShell
      title="Kayit ol"
      subtitle="Birkac saniyede hesap ac, harcamalari paylasmaya basla."
      footer={
        <>
          Zaten hesabiniz var mi?{' '}
          {/* `state` aynen tasiniyor (ayni gerekce: LoginPage). */}
          <Link
            to="/login"
            state={location.state}
            className="font-medium text-rose underline-offset-4 hover:underline"
          >
            Giris yapin
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="name">Ad</Label>
          <Input
            id="name"
            name="name"
            value={values.name}
            onChange={(event) => setField('name', event.target.value)}
            autoComplete="name"
            aria-invalid={fieldErrors.name ? true : undefined}
            aria-describedby={fieldErrors.name ? 'name-error' : undefined}
            disabled={pending}
          />
          {fieldErrors.name && (
            <p className="field-error text-sm text-destructive" id="name-error">
              {fieldErrors.name}
            </p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="email">E-posta</Label>
          <Input
            id="email"
            name="email"
            type="email"
            value={values.email}
            onChange={(event) => setField('email', event.target.value)}
            autoComplete="email"
            aria-invalid={fieldErrors.email ? true : undefined}
            aria-describedby={fieldErrors.email ? 'email-error' : undefined}
            disabled={pending}
          />
          {fieldErrors.email && (
            <p className="field-error text-sm text-destructive" id="email-error">
              {fieldErrors.email}
            </p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="password">Sifre</Label>
          <Input
            id="password"
            name="password"
            type="password"
            value={values.password}
            onChange={(event) => setField('password', event.target.value)}
            autoComplete="new-password"
            aria-invalid={fieldErrors.password ? true : undefined}
            aria-describedby={fieldErrors.password ? 'password-error' : 'password-hint'}
            disabled={pending}
          />
          {/* Kural hata olmadan once de yaziyor: "once yanlis yap, sonra ogren" olmasin. */}
          {!fieldErrors.password && (
            <p className="field-hint text-xs text-ink-muted" id="password-hint">
              En az {MIN_PASSWORD_LENGTH} karakter
            </p>
          )}
          {fieldErrors.password && (
            <p className="field-error text-sm text-destructive" id="password-error">
              {fieldErrors.password}
            </p>
          )}
        </div>

        {formError && (
          <p
            className="form-error rounded-md border border-destructive/25 bg-destructive/8 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {formError}
          </p>
        )}

        <Button type="submit" disabled={pending} className="mt-1 w-full">
          {pending ? 'Kayit olusturuluyor...' : 'Kayit ol'}
        </Button>
      </form>
    </AuthShell>
  );
};

export default RegisterPage;
