import { useCallback, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import AuthShell from '@/components/AuthShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getDeletionPendingInfo, getErrorMessage } from '../api/client';
import usersApi from '../api/users';
import useAuth from '../hooks/useAuth';
import useAuthForm from '../hooks/useAuthForm';
import { afterAuthPath } from '../utils/afterAuth';
import { validateLoginForm } from '../utils/validation';

import type { LoginFormValues } from '../utils/validation';

/**
 * Giris ekrani — gercek `POST /auth/login` cagrisina bagli.
 *
 * Gorsel kimlik uygulanirken yalnizca **sunum katmani** degisti; form mantigi
 * (`useAuthForm`), dogrulama (`utils/validation`) ve yonlendirme aynen 2.2'deki
 * gibi (bkz. docs/decisions/gorsel-kimlik.md).
 *
 * Istemci dogrulamasi bilincli olarak yalnizca "bos mu" kontrolu; gerekcesi
 * `utils/validation.ts` icinde.
 */
const LoginPage = () => {
  const { login, applySession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  /**
   * "Hesabin silme surecinde" 403'u genel `formError` degil, ayri bir kutu:
   * kullaniciya sadece hata degil bir **eylem** (geri alma) sunuyoruz. Bilgiler
   * (e-posta/sifre) formdan degil buradan tasiniyor cunku `useAuthForm` basarili
   * `onSubmit` sonrasi degerleri sifirlamiyor ama garanti de etmiyor.
   */
  const [recovery, setRecovery] = useState<{
    email: string;
    password: string;
    daysRemaining: number;
  } | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [recoverError, setRecoverError] = useState<string | null>(null);

  const handleLogin = useCallback(
    async (values: LoginFormValues) => {
      setRecovery(null);

      try {
        await login(values);
      } catch (caught) {
        const pending = getDeletionPendingInfo(caught);

        if (pending) {
          // Genel hata kutusuna dusmesin diye burada yutuluyor; formError
          // bilerek bos kaliyor, asagidaki ozel kutu gosteriliyor.
          setRecovery({ email: values.email, password: values.password, ...pending });
          return;
        }

        throw caught;
      }

      /*
        Korunan bir sayfadan yonlendirilmisse oraya don, bekleyen bir davet
        varsa katilma sayfasina, yoksa Home (bkz. utils/afterAuth.ts).

        Varsayilan `/groups` idi ama pratikte hicbir zaman calismiyordu: oturum
        acilir acilmaz `GuestRoute` de bir yonlendirme uretiyor ve yarisi
        genellikle o kazaniyor (test: "giris basarili olunca /home gorunur").
        Iki taraf ayni varsayilani kullaninca hedef, yarisin sonucundan
        bagimsiz hale geliyor.
      */
      navigate(afterAuthPath(location.state, '/home'), { replace: true });
    },
    [location.state, login, navigate]
  );

  const handleRecover = useCallback(async () => {
    if (!recovery) {
      return;
    }

    setRecovering(true);
    setRecoverError(null);

    try {
      const result = await usersApi.cancelDeletion({
        email: recovery.email,
        password: recovery.password,
      });
      applySession(result);
      navigate(afterAuthPath(location.state, '/home'), { replace: true });
    } catch (caught) {
      setRecoverError(getErrorMessage(caught, 'Hesap geri alinamadi'));
      setRecovering(false);
    }
  }, [applySession, location.state, navigate, recovery]);

  const { values, setField, fieldErrors, formError, pending, handleSubmit } =
    useAuthForm<LoginFormValues>({
      initialValues: { email: '', password: '' },
      validate: validateLoginForm,
      onSubmit: handleLogin,
      fallbackMessage: 'Giris yapilamadi',
    });

  return (
    <AuthShell
      title="Giris yap"
      subtitle="Gruplarina ve bakiyelerine devam et."
      footer={
        <>
          Hesabiniz yok mu?{' '}
          {/*
            `state` aynen tasiniyor: davet linkinden gelip "kayit olun"a
            tiklayan kullanicinin `from`u bu hopta kaybolmasin.
          */}
          <Link
            to="/register"
            state={location.state}
            className="font-medium text-rose underline-offset-4 hover:underline"
          >
            Kayit olun
          </Link>
        </>
      }
    >
      {/*
        `noValidate`: tarayicinin kendi balonlari kapali. O mesajlar dile ve
        tarayiciya gore degisir, backend'den gelen hatalarla ayni yerde/ayni
        bicimde gorunmez. Dogrulama bizde, gorunum tek tip (bkz. 2.2.md).
      */}
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
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
            autoComplete="current-password"
            aria-invalid={fieldErrors.password ? true : undefined}
            aria-describedby={fieldErrors.password ? 'password-error' : undefined}
            disabled={pending}
          />
          {fieldErrors.password && (
            <p className="field-error text-sm text-destructive" id="password-error">
              {fieldErrors.password}
            </p>
          )}
        </div>

        {/*
          Backend'in kendi mesaji gosterilir ("E-posta veya sifre hatali"),
          jenerik metin degil. Backend bu iki durumu bilerek ayirmiyor
          (kullanici sizdirma, 1.3); frontend de ayirmaya calismaz.
        */}
        {formError && (
          <p
            className="form-error rounded-md border border-destructive/25 bg-destructive/8 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {formError}
          </p>
        )}

        {recovery && (
          <div
            className="flex flex-col gap-2 rounded-md border border-destructive/25 bg-destructive/8 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            <p>
              Hesabin silme surecinde, {recovery.daysRemaining} gun kaldi. Silme talebini geri
              alip devam edebilirsin.
            </p>
            {recoverError && <p className="font-medium">{recoverError}</p>}
            <Button
              type="button"
              variant="outline"
              className="self-start"
              disabled={recovering}
              onClick={() => void handleRecover()}
            >
              {recovering ? 'Geri aliniyor...' : 'Hesabini geri al'}
            </Button>
          </div>
        )}

        <Button type="submit" disabled={pending} className="mt-1 w-full">
          {pending ? 'Giris yapiliyor...' : 'Giris yap'}
        </Button>
      </form>
    </AuthShell>
  );
};

export default LoginPage;
