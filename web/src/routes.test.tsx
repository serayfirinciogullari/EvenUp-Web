import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';
import { AuthProvider } from './context/AuthProvider';

import type { User } from './types/models';

/**
 * Rota koruma testleri.
 *
 * Ag katmani (`api/auth`) mock'lanir; geri kalan her sey gercek kod: React
 * Router, AuthProvider, ProtectedRoute / AdminRoute / GuestRoute ve
 * `localStorage` tabanli token saklama.
 *
 * Sinanan cekirdek davranis:
 *   - giris yapmadan /groups'a gidince /login'e duser
 *   - token varken /login'e gidince /groups'a yonlenir
 */
vi.mock('./api/auth', () => ({
  __esModule: true,
  default: {
    login: vi.fn(),
    register: vi.fn(),
    getMe: vi.fn(),
  },
}));

// `vi.mock` vitest tarafindan dosyanin en ustune tasinir, bu yuzden asagidaki
// import mock'lanmis modulu alir.
import authApi from './api/auth';

const mockedAuthApi = vi.mocked(authApi);

const TOKEN_KEY = 'evenup.token';

const makeUser = (role: 'admin' | 'user' = 'user'): User => ({
  id: '11111111-1111-4111-8111-111111111111',
  email: 'burak@evenup.dev',
  name: 'Burak',
  role,
  is_active: true,
  created_at: '2026-08-01T10:00:00.000Z',
});

/** Elde gecerli bir token varmis gibi davran. */
const signIn = (role: 'admin' | 'user' = 'user'): void => {
  window.localStorage.setItem(TOKEN_KEY, 'gecerli.jwt.token');
  mockedAuthApi.getMe.mockResolvedValue(makeUser(role));
};

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
});

/* ================================================ giris yapilmamis kullanici */

describe('giris yapilmamis kullanici', () => {
  it('/groups istedigi halde login ekranini gorur', async () => {
    renderAt('/groups');

    expect(await screen.findByRole('heading', { name: 'Giris yap' })).toBeInTheDocument();
    // Korunan sayfanin icerigi hic render edilmemeli.
    expect(screen.queryByRole('heading', { name: 'Gruplar' })).not.toBeInTheDocument();
  });

  it('/settings ve /groups/:id de korunur', async () => {
    renderAt('/settings');
    expect(await screen.findByRole('heading', { name: 'Giris yap' })).toBeInTheDocument();

    renderAt('/groups/abc');
    expect(await screen.findAllByRole('heading', { name: 'Giris yap' })).not.toHaveLength(0);
  });

  it('/admin istedigi halde login ekranina duser', async () => {
    renderAt('/admin');

    expect(await screen.findByRole('heading', { name: 'Giris yap' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Admin' })).not.toBeInTheDocument();
  });

  it('/login ve /register erisilebilir kalir', async () => {
    renderAt('/login');
    expect(await screen.findByRole('heading', { name: 'Giris yap' })).toBeInTheDocument();

    renderAt('/register');
    expect(await screen.findByRole('heading', { name: 'Kayit ol' })).toBeInTheDocument();
  });

  it('token yokken /auth/me istegi hic atilmaz', async () => {
    renderAt('/groups');
    await screen.findByRole('heading', { name: 'Giris yap' });

    expect(mockedAuthApi.getMe).not.toHaveBeenCalled();
  });
});

/* =================================================== giris yapmis kullanici */

describe('giris yapmis kullanici', () => {
  it('/login istedigi halde gruplara yonlendirilir', async () => {
    signIn();
    renderAt('/login');

    expect(await screen.findByRole('heading', { name: 'Gruplar' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Giris yap' })).not.toBeInTheDocument();
  });

  it('/register de ayni sekilde korunur', async () => {
    signIn();
    renderAt('/register');

    expect(await screen.findByRole('heading', { name: 'Gruplar' })).toBeInTheDocument();
  });

  it('/groups sayfasinda kalir ve kullanici adini gorur', async () => {
    signIn();
    renderAt('/groups');

    expect(await screen.findByRole('heading', { name: 'Gruplar' })).toBeInTheDocument();
    expect(screen.getByText('Hos geldin, Burak.')).toBeInTheDocument();
  });

  it('kok adres /groups sayfasina yonlenir', async () => {
    signIn();
    renderAt('/');

    expect(await screen.findByRole('heading', { name: 'Gruplar' })).toBeInTheDocument();
  });

  it('/groups/:id parametresi okunur', async () => {
    signIn();
    renderAt('/groups/7f3d1c2a-0000-4000-8000-000000000001');

    expect(await screen.findByRole('heading', { name: 'Grup detayi' })).toBeInTheDocument();
    expect(screen.getByText('7f3d1c2a-0000-4000-8000-000000000001')).toBeInTheDocument();
  });

  it('token gecersizse (getMe hata verirse) login ekranina duser', async () => {
    window.localStorage.setItem(TOKEN_KEY, 'suresi.dolmus.token');
    mockedAuthApi.getMe.mockRejectedValue(new Error('401'));

    renderAt('/groups');

    expect(await screen.findByRole('heading', { name: 'Giris yap' })).toBeInTheDocument();
    // Ise yaramayan token elde tutulmaz.
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});

/* ============================================================ admin rotasi */

describe('admin rotasi', () => {
  it('normal kullanici /admin isteyince /groups gorur', async () => {
    signIn('user');
    renderAt('/admin');

    expect(await screen.findByRole('heading', { name: 'Gruplar' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Admin' })).not.toBeInTheDocument();
  });

  it('admin /admin sayfasini gorur', async () => {
    signIn('admin');
    renderAt('/admin');

    expect(await screen.findByRole('heading', { name: 'Admin' })).toBeInTheDocument();
  });

  it('normal kullanicinin menusunde Admin baglantisi cikmaz', async () => {
    signIn('user');
    renderAt('/groups');
    await screen.findByRole('heading', { name: 'Gruplar' });

    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Gruplar' })).toBeInTheDocument();
  });

  it('admin menusunde Admin baglantisi cikar', async () => {
    signIn('admin');
    renderAt('/groups');
    await screen.findByRole('heading', { name: 'Gruplar' });

    expect(screen.getByRole('link', { name: 'Admin' })).toBeInTheDocument();
  });
});

/* ============================================================ bilinmeyen rota */

describe('bilinmeyen rota', () => {
  it('404 sayfasi gosterilir', async () => {
    renderAt('/olmayan-sayfa');

    expect(await screen.findByRole('heading', { name: 'Sayfa bulunamadi' })).toBeInTheDocument();
  });
});
