import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { getErrorDetails, getErrorMessage } from '../api/client';
import useAuth from '../hooks/useAuth';

import type { FormEvent } from 'react';

const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

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
      await login({ email, password });

      // Korunan bir sayfadan yonlendirilmisse oraya don, degilse /groups.
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      navigate(from ?? '/groups', { replace: true });
    } catch (caught) {
      // Backend "kullanici yok" ile "sifre yanlis" icin ayni mesaji doner;
      // burada da ayirmiyoruz (bkz. docs/decisions/1.3.md).
      setError(getErrorMessage(caught, 'Giris yapilamadi'));
      setFieldErrors(getErrorDetails(caught));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="auth-page">
      <h1>Giris yap</h1>

      <form onSubmit={handleSubmit} noValidate>
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
          autoComplete="current-password"
          required
        />
        {fieldErrors.password && <p className="field-error">{fieldErrors.password}</p>}

        {error && (
          <p className="form-error" role="alert">
            {error}
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
