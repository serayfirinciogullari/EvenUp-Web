import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from '../App';
import { AuthProvider } from '../context/AuthProvider';

import type { AuthResult } from '../types/api';
import type { User } from '../types/models';

/**
 * Login ve register formlarinin davranis testleri.
 *
 * Yalnizca ag katmani (`api/auth`) mock'lanir; geri kalan her sey gercek kod:
 * React Router, AuthProvider, `useAuthForm`, `utils/validation` ve
 * `localStorage` tabanli token saklama.
 *
 * GERCEK BACKEND'e karsi calisan testler ayri dosyada:
 * `src/auth.integration.test.tsx` (`npm run test:api`).
 */
vi.mock('../api/auth', () => ({
  __esModule: true,
  default: {
    login: vi.fn(),
    register: vi.fn(),
    getMe: vi.fn(),
  },
}));

// Basarili giris 2.7'den beri /home'a duser ve o sayfa ozet cekiyor; bu
// dosyanin derdi form davranisi oldugu icin ozet sabitleniyor.
vi.mock('../api/summary', () => ({
  __esModule: true,
  default: {
    getHomeSummary: vi.fn().mockResolvedValue({
      totalNetBalance: '0.00',
      monthlySpend: '0.00',
      activeGroupsCount: 0,
      pendingSettlementsCount: 0,
    }),
  },
}));

// Gruplar sayfasi da gercek veri cekiyor (2.3); gezinme testleri icin sabit.
vi.mock('../api/groups', () => ({
  __esModule: true,
  default: {
    listGroups: vi.fn().mockResolvedValue([]),
    createGroup: vi.fn(),
    createInvite: vi.fn(),
    getGroupBalances: vi.fn(),
  },
}));

import authApi from '../api/auth';

const mockedAuthApi = vi.mocked(authApi);

const TOKEN_KEY = 'evenup.token';

const user: User = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'deniz@evenup.dev',
  name: 'Deniz',
  role: 'user',
  is_active: true,
  created_at: '2026-08-01T10:00:00.000Z',
};

const authResult: AuthResult = { user, token: 'yeni.jwt.token', expiresIn: '7d' };

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>
  );

/** Bir alanin degerini yaz. */
const type = (label: string, value: string): void => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
};

const submit = (buttonName: string): void => {
  fireEvent.click(screen.getByRole('button', { name: buttonName }));
};

/** Cozumu disaridan kontrol edilebilen promise — "istek surerken" anini tutar. */
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

/** Axios hatasi taklidi — `getErrorMessage` bu bicimi okur. */
const apiError = (statusCode: number, message: string, details?: Record<string, string>) =>
  Object.assign(new Error(message), {
    isAxiosError: true,
    response: { status: statusCode, data: { status: 'error', statusCode, message, details } },
  });

beforeEach(() => {
  vi.clearAllMocks();
});

/* ==================================================== istemci tarafi dogrulama */

describe('istemci tarafi dogrulama (kayit)', () => {
  const fillValid = () => {
    type('Ad', 'Deniz Kaya');
    type('E-posta', 'deniz@evenup.dev');
    type('Sifre', 'Password123!');
  };

  it('gecersiz e-posta bicimi ag istegini hic baslatmaz', async () => {
    renderAt('/register');
    await screen.findByRole('heading', { name: 'Kayit ol' });

    fillValid();
    type('E-posta', 'deniz-at-evenup');
    submit('Kayit ol');

    expect(await screen.findByText('Gecerli bir e-posta adresi girin')).toBeInTheDocument();
    // Asil kazanc bu: gidis-donus beklemeden cevap.
    expect(mockedAuthApi.register).not.toHaveBeenCalled();
  });

  it('8 karakterden kisa sifre ag istegini hic baslatmaz', async () => {
    renderAt('/register');
    await screen.findByRole('heading', { name: 'Kayit ol' });

    fillValid();
    type('Sifre', 'Pass12!'); // 7 karakter
    submit('Kayit ol');

    expect(await screen.findByText('Sifre en az 8 karakter olmali')).toBeInTheDocument();
    expect(mockedAuthApi.register).not.toHaveBeenCalled();
  });

  it('bos isim ag istegini hic baslatmaz', async () => {
    renderAt('/register');
    await screen.findByRole('heading', { name: 'Kayit ol' });

    fillValid();
    type('Ad', '   '); // yalnizca bosluk
    submit('Kayit ol');

    expect(await screen.findByText('Isim zorunlu')).toBeInTheDocument();
    expect(mockedAuthApi.register).not.toHaveBeenCalled();
  });

  it('gecerli bilgilerde istek atilir ve e-posta normalize edilir', async () => {
    mockedAuthApi.register.mockResolvedValue(authResult);

    renderAt('/register');
    await screen.findByRole('heading', { name: 'Kayit ol' });

    type('Ad', 'Deniz Kaya');
    type('E-posta', 'deniz@evenup.dev');
    type('Sifre', 'Password123!');
    submit('Kayit ol');

    await waitFor(() => expect(mockedAuthApi.register).toHaveBeenCalledTimes(1));
    expect(mockedAuthApi.register).toHaveBeenCalledWith({
      name: 'Deniz Kaya',
      email: 'deniz@evenup.dev',
      password: 'Password123!',
    });
  });

  it('kullanici duzeltmeye baslayinca alan hatasi kalkar', async () => {
    renderAt('/register');
    await screen.findByRole('heading', { name: 'Kayit ol' });

    type('Ad', 'Deniz');
    type('E-posta', 'bozuk');
    type('Sifre', 'Password123!');
    submit('Kayit ol');

    expect(await screen.findByText('Gecerli bir e-posta adresi girin')).toBeInTheDocument();

    type('E-posta', 'bozuk@evenup.dev');

    await waitFor(() =>
      expect(screen.queryByText('Gecerli bir e-posta adresi girin')).not.toBeInTheDocument()
    );
  });
});

describe('istemci tarafi dogrulama (giris)', () => {
  it('bos formda ag istegi hic baslatilmaz', async () => {
    renderAt('/login');
    await screen.findByRole('heading', { name: 'Giris yap' });

    submit('Giris yap');

    expect(await screen.findByText('E-posta zorunlu')).toBeInTheDocument();
    expect(screen.getByText('Sifre zorunlu')).toBeInTheDocument();
    expect(mockedAuthApi.login).not.toHaveBeenCalled();
  });

  it('giriste e-posta bicimi dogrulanmaz — backend ile ayni davranis', async () => {
    mockedAuthApi.login.mockResolvedValue(authResult);

    renderAt('/login');
    await screen.findByRole('heading', { name: 'Giris yap' });

    // Eski kurallarla acilmis bir hesabi arayuzden erisilemez yapmamak icin
    // giriste bicim kontrolu yok; karari sunucu verir.
    type('E-posta', 'eski-kullanici');
    type('Sifre', 'kisa');
    submit('Giris yap');

    await waitFor(() => expect(mockedAuthApi.login).toHaveBeenCalledTimes(1));
  });

  it('giriste sifre uzunlugu dogrulanmaz', async () => {
    mockedAuthApi.login.mockResolvedValue(authResult);

    renderAt('/login');
    await screen.findByRole('heading', { name: 'Giris yap' });

    type('E-posta', 'deniz@evenup.dev');
    type('Sifre', 'abc'); // 3 karakter
    submit('Giris yap');

    await waitFor(() => expect(mockedAuthApi.login).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Sifre en az 8 karakter olmali')).not.toBeInTheDocument();
  });
});

/* ======================================== yukleniyor durumu ve cift gonderim */

describe('yukleniyor durumu ve cift gonderim', () => {
  it('istek surerken buton devre disi kalir ve metni degisir', async () => {
    const pending = deferred<AuthResult>();
    mockedAuthApi.login.mockReturnValue(pending.promise);

    renderAt('/login');
    await screen.findByRole('heading', { name: 'Giris yap' });

    type('E-posta', 'deniz@evenup.dev');
    type('Sifre', 'Password123!');
    submit('Giris yap');

    const button = await screen.findByRole('button', { name: 'Giris yapiliyor...' });
    expect(button).toBeDisabled();
    // Alanlar da kilitlenir: istek ucarken degeri degistirmek, gonderilenle
    // ekranda gorunenin ayrismasi demek olurdu.
    expect(screen.getByLabelText('E-posta')).toBeDisabled();

    await act(async () => {
      pending.resolve(authResult);
    });
  });

  it('ayni anda gelen ikinci gonderim elenir — tek istek gider', async () => {
    const pending = deferred<AuthResult>();
    mockedAuthApi.login.mockReturnValue(pending.promise);

    const { container } = renderAt('/login');
    await screen.findByRole('heading', { name: 'Giris yap' });

    type('E-posta', 'deniz@evenup.dev');
    type('Sifre', 'Password123!');

    const form = container.querySelector('form');
    expect(form).not.toBeNull();

    // Butonun `disabled` olmasi bir sonraki render'da uygulanir. Burada iki
    // submit olayini React yeniden render etmeden ONCE gonderiyoruz; koruma
    // yalnizca `useAuthForm` icindeki senkron `inFlight` ref'inden geliyor.
    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(mockedAuthApi.login).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve(authResult);
    });
  });

  it('hata sonrasi buton yeniden kullanilabilir olur', async () => {
    mockedAuthApi.login.mockRejectedValue(apiError(401, 'E-posta veya sifre hatali'));

    renderAt('/login');
    await screen.findByRole('heading', { name: 'Giris yap' });

    type('E-posta', 'deniz@evenup.dev');
    type('Sifre', 'yanlis-sifre');
    submit('Giris yap');

    expect(await screen.findByRole('alert')).toHaveTextContent('E-posta veya sifre hatali');
    expect(screen.getByRole('button', { name: 'Giris yap' })).toBeEnabled();
  });
});

/* ============================================================ backend hatalari */

describe('backend hatalari', () => {
  it('giris: backend mesaji aynen gosterilir, jenerik metin degil', async () => {
    mockedAuthApi.login.mockRejectedValue(apiError(401, 'E-posta veya sifre hatali'));

    renderAt('/login');
    await screen.findByRole('heading', { name: 'Giris yap' });

    type('E-posta', 'deniz@evenup.dev');
    type('Sifre', 'yanlis-sifre');
    submit('Giris yap');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('E-posta veya sifre hatali');
    expect(alert).not.toHaveTextContent('Beklenmeyen bir hata olustu');
    expect(alert).not.toHaveTextContent('Giris yapilamadi');

    // Basarisiz girisin token yazmadigi da dogrulanir.
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('kayit: 409 mesaji gosterilir', async () => {
    mockedAuthApi.register.mockRejectedValue(apiError(409, 'Bu e-posta zaten kayitli'));

    renderAt('/register');
    await screen.findByRole('heading', { name: 'Kayit ol' });

    type('Ad', 'Deniz Kaya');
    type('E-posta', 'admin@evenup.dev');
    type('Sifre', 'Password123!');
    submit('Kayit ol');

    expect(await screen.findByRole('alert')).toHaveTextContent('Bu e-posta zaten kayitli');
  });

  it('backend alan bazli hatalari (details) ilgili alanin altinda gosterilir', async () => {
    mockedAuthApi.register.mockRejectedValue(
      apiError(400, 'Gecersiz kayit bilgileri', {
        email: 'Gecerli bir e-posta adresi girin',
      })
    );

    renderAt('/register');
    await screen.findByRole('heading', { name: 'Kayit ol' });

    type('Ad', 'Deniz Kaya');
    // Istemci kontrolunu gecen ama backend'in reddettigi bir deger.
    type('E-posta', 'deniz@evenup.dev');
    type('Sifre', 'Password123!');
    submit('Kayit ol');

    expect(await screen.findByText('Gecerli bir e-posta adresi girin')).toBeInTheDocument();
    expect(screen.getByLabelText('E-posta')).toHaveAttribute('aria-invalid', 'true');
  });

  it('ag hatasi "sifre yanlis"tan ayri bir mesaj alir', async () => {
    // `error.response` yok: sunucuya hic ulasilamamis.
    mockedAuthApi.login.mockRejectedValue(
      Object.assign(new Error('Network Error'), { isAxiosError: true })
    );

    renderAt('/login');
    await screen.findByRole('heading', { name: 'Giris yap' });

    type('E-posta', 'deniz@evenup.dev');
    type('Sifre', 'Password123!');
    submit('Giris yap');

    expect(await screen.findByRole('alert')).toHaveTextContent('Sunucuya ulasilamiyor');
  });
});

/* ================================================================ basarili akis */

describe('basarili akis', () => {
  it('giris basarili olunca /home gorunur ve token saklanir', async () => {
    mockedAuthApi.login.mockResolvedValue(authResult);

    renderAt('/login');
    await screen.findByRole('heading', { name: 'Giris yap' });

    type('E-posta', 'deniz@evenup.dev');
    type('Sifre', 'Password123!');
    submit('Giris yap');

    // 2.7: giris sonrasi ilk ekran Home.
    expect(await screen.findByRole('heading', { name: 'Merhaba, Deniz' })).toBeInTheDocument();
    expect(window.localStorage.getItem(TOKEN_KEY)).toBe('yeni.jwt.token');
  });

  it('kayit sonrasi otomatik giris yapilir — login ekranina donulmez', async () => {
    mockedAuthApi.register.mockResolvedValue(authResult);

    renderAt('/register');
    await screen.findByRole('heading', { name: 'Kayit ol' });

    type('Ad', 'Deniz Kaya');
    type('E-posta', 'deniz@evenup.dev');
    type('Sifre', 'Password123!');
    submit('Kayit ol');

    // Karar: kayit cevabindaki token dogrudan kullanilir.
    expect(await screen.findByRole('heading', { name: 'Merhaba, Deniz' })).toBeInTheDocument();
    // Kullanici adi Layout basliginda da duruyor.
    expect(screen.getByText('Deniz')).toBeInTheDocument();
    expect(window.localStorage.getItem(TOKEN_KEY)).toBe('yeni.jwt.token');
    expect(screen.queryByRole('heading', { name: 'Giris yap' })).not.toBeInTheDocument();
  });
});
