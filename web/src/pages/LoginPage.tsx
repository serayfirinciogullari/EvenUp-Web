import { useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import useAuth from '../hooks/useAuth';
import useAuthForm from '../hooks/useAuthForm';
import { validateLoginForm } from '../utils/validation';

import type { LoginFormValues } from '../utils/validation';

/**
 * Giris ekrani — gercek `POST /auth/login` cagrisina bagli.
 *
 * Istemci dogrulamasi bilincli olarak yalnizca "bos mu" kontrolu; gerekcesi
 * `utils/validation.ts` icinde yazili.
 */
const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogin = useCallback(
    async (values: LoginFormValues) => {
      await login(values);

      // Korunan bir sayfadan yonlendirilmisse oraya don, degilse /groups.
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      navigate(from ?? '/groups', { replace: true });
    },
    [location.state, login, navigate]
  );

  const { values, setField, fieldErrors, formError, pending, handleSubmit } =
    useAuthForm<LoginFormValues>({
      initialValues: { email: '', password: '' },
      validate: validateLoginForm,
      onSubmit: handleLogin,
      fallbackMessage: 'Giris yapilamadi',
    });

  return (
    <div className="auth-page">
      <h1>Giris yap</h1>

      {/*
        `noValidate`: tarayicinin kendi balonlarini kapatiyoruz. Sebep, o
        mesajlarin dile ve tarayiciya gore degismesi ve backend'in mesajlariyla
        ayni yerde/ayni bicimde gorunmemesi. Dogrulama bizde, gorunum tek tip.
      */}
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="email">E-posta</label>
        <input
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
          <p className="field-error" id="email-error">
            {fieldErrors.email}
          </p>
        )}

        <label htmlFor="password">Sifre</label>
        <input
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
          <p className="field-error" id="password-error">
            {fieldErrors.password}
          </p>
        )}

        {/*
          Backend'in kendi mesaji gosterilir ("E-posta veya sifre hatali"),
          jenerik bir metin degil. Backend bu iki durumu bilerek ayirmiyor
          (bkz. docs/decisions/1.3.md - kullanici sizdirma); frontend de
          ayirmaya calismaz, geleni oldugu gibi gosterir.
        */}
        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}

        <button type="submit" disabled={pending}>
          {pending ? 'Giris yapiliyor...' : 'Giris yap'}
        </button>
      </form>

      <p>
        Hesabiniz yok mu? <Link to="/register">Kayit olun</Link>
      </p>
    </div>
  );
};

export default LoginPage;
