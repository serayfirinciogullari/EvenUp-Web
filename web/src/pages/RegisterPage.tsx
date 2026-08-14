import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { getErrorDetails, getErrorMessage } from '../api/client';
import useAuth from '../hooks/useAuth';

import type { FormEvent } from 'react';

/** Backend ile ayni sinir (`auth.service.ts` -> MIN_PASSWORD_LENGTH). */
const MIN_PASSWORD_LENGTH = 8;

const RegisterPage = () => {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setPending(true);

    try {
      await register({ name, email, password });
      navigate('/groups', { replace: true });
    } catch (caught) {
      setError(getErrorMessage(caught, 'Kayit olusturulamadi'));
      setFieldErrors(getErrorDetails(caught));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="auth-page">
      <h1>Kayit ol</h1>

      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="name">Ad</label>
        <input
          id="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="name"
          required
        />
        {fieldErrors.name && <p className="field-error">{fieldErrors.name}</p>}

        <label htmlFor="email">E-posta</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          required
        />
        {fieldErrors.email && <p className="field-error">{fieldErrors.email}</p>}

        <label htmlFor="password">Sifre</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
        {/* Istemci tarafi kontrol yalnizca erken geri bildirim; asil dogrulama
            backend'de (buyuk/kucuk harf ve rakam kurallari dahil). */}
        <p className="field-hint">En az {MIN_PASSWORD_LENGTH} karakter</p>
        {fieldErrors.password && <p className="field-error">{fieldErrors.password}</p>}

        {error && (
          <p className="form-error" role="alert">
            {error}
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
