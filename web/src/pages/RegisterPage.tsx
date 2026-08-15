import { useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import useAuth from '../hooks/useAuth';
import useAuthForm from '../hooks/useAuthForm';
import { MIN_PASSWORD_LENGTH, validateRegisterForm } from '../utils/validation';

import type { RegisterFormValues } from '../utils/validation';

/**
 * Kayit ekrani — gercek `POST /auth/register` cagrisina bagli.
 *
 * KAYIT SONRASI: OTOMATIK GIRIS
 * -----------------------------
 * Backend `/auth/register` cevabinda zaten kullanilabilir bir `token` donuyor
 * (`AuthResult`). Kullaniciyi login ekranina yollamak, elimizdeki gecerli
 * token'i cope atip az once yazdigi bilgileri tekrar yazdirmak olurdu.
 * Ayrintili gerekce ve hangi kosulda degisecegi: docs/decisions/2.2.md
 */
const RegisterPage = () => {
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleRegister = useCallback(
    async (values: RegisterFormValues) => {
      await register(values);
      navigate('/groups', { replace: true });
    },
    [navigate, register]
  );

  const { values, setField, fieldErrors, formError, pending, handleSubmit } =
    useAuthForm<RegisterFormValues>({
      initialValues: { name: '', email: '', password: '' },
      validate: validateRegisterForm,
      onSubmit: handleRegister,
      fallbackMessage: 'Kayit olusturulamadi',
    });

  return (
    <div className="auth-page">
      <h1>Kayit ol</h1>

      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="name">Ad</label>
        <input
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
          <p className="field-error" id="name-error">
            {fieldErrors.name}
          </p>
        )}

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
          autoComplete="new-password"
          aria-invalid={fieldErrors.password ? true : undefined}
          aria-describedby={fieldErrors.password ? 'password-error' : 'password-hint'}
          disabled={pending}
        />
        {/*
          Kural, hata olmadan once de yaziyor: kullaniciya "once yanlis yap,
          sonra ogren" dedirtmemek icin.
        */}
        {!fieldErrors.password && (
          <p className="field-hint" id="password-hint">
            En az {MIN_PASSWORD_LENGTH} karakter
          </p>
        )}
        {fieldErrors.password && (
          <p className="field-error" id="password-error">
            {fieldErrors.password}
          </p>
        )}

        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}

        <button type="submit" disabled={pending}>
          {pending ? 'Kayit olusturuluyor...' : 'Kayit ol'}
        </button>
      </form>

      <p>
        Zaten hesabiniz var mi? <Link to="/login">Giris yapin</Link>
      </p>
    </div>
  );
};

export default RegisterPage;
