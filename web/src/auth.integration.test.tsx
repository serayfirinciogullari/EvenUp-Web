import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, describe, expect, it } from 'vitest';

import App from './App';
import { AuthProvider } from './context/AuthProvider';

import type { AuthResult } from './types/api';

/**
 * GERCEK BACKEND'e karsi calisan testler — hicbir sey mock'lanmaz.
 *
 * Calistirmak icin (uc sart):
 *   1. PostgreSQL ayakta ve migrate + seed edilmis  ->  npm run db:reset (kokte)
 *   2. Backend ayakta                               ->  npm run dev      (kokte)
 *   3. Bu komut                                     ->  npm run test:api (web/)
 *
 * `npm test` bu dosyayi CALISTIRMAZ (bkz. vite.config.ts -> test.exclude).
 * Gerekcesi vitest.api.config.ts icinde.
 *
 * YAN ETKI: "kayit" testi veritabaninda gercek bir kullanici satiri birakir
 * (e-posta `e2e-<zaman>@evenup.test`). Silinmiyor cunku kullanici silen bir uc
 * nokta yok — proje kullaniciyi silmek yerine pasiflestiriyor
 * (bkz. docs/decisions/1.2). Birikirlerse kokte `npm run db:reset` temizler.
 */

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const TOKEN_KEY = 'evenup.token';

/** Seed verisinden (src/db/seeds/01_demo_data.ts). */
const SEED_EMAIL = 'admin@evenup.dev';
const SEED_PASSWORD = 'Password123!';

/** Her kosuda benzersiz: ayni e-posta ikinci kez 409 alirdi. */
const NEW_EMAIL = `e2e-${Date.now()}@evenup.test`;
const NEW_PASSWORD = 'Password123!';

/** Interceptor'siz, ham istemci — tarayici konsolu / curl gibi davranir. */
const raw = axios.create({ baseURL: API_URL, validateStatus: () => true });

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>
  );

const type = (label: string, value: string): void => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
};

const submit = (name: string): void => {
  fireEvent.click(screen.getByRole('button', { name }));
};

beforeAll(async () => {
  // Backend kapaliysa sessizce atlamak yerine ne yapilmasi gerektigini soyle.
  try {
    const health = await raw.get('/health');

    if (health.status !== 200) {
      throw new Error(`/health ${health.status} dondu`);
    }
  } catch (error) {
    throw new Error(
      `Backend'e ulasilamiyor (${API_URL}). Bu testler gercek API ister.\n` +
        `  Proje kokunde:  npm run dev\n` +
        `  Veritabani icin: npm run db:reset\n` +
        `Ayrinti: ${error instanceof Error ? error.message : String(error)}`
    );
  }
});

/* ============================================ backend sozlesmesi (ham istek) */

describe('backend sozlesmesi', () => {
  it('yanlis sifre 401 ve spesifik mesaj doner', async () => {
    const response = await raw.post('/auth/login', {
      email: SEED_EMAIL,
      password: 'kesinlikle-yanlis-sifre',
    });

    expect(response.status).toBe(401);
    expect(response.data.message).toBe('E-posta veya sifre hatali');
  });

  it('kayitli olmayan e-posta, yanlis sifreyle AYNI cevabi verir', async () => {
    const unknown = await raw.post('/auth/login', {
      email: 'boyle-biri-yok@evenup.test',
      password: 'herhangi-bir-sifre',
    });

    // Ayrissalardi uc nokta hangi e-postalarin kayitli oldugunu sizdirirdi
    // (bkz. docs/decisions/1.3.md). Arayuz de bu iki durumu ayirmaya calismaz.
    expect(unknown.status).toBe(401);
    expect(unknown.data.message).toBe('E-posta veya sifre hatali');
  });

  it('dogru bilgi 200 ve kullanilabilir bir token doner', async () => {
    const response = await raw.post<AuthResult>('/auth/login', {
      email: SEED_EMAIL,
      password: SEED_PASSWORD,
    });

    expect(response.status).toBe(200);
    expect(response.data.token).toBeTruthy();
    expect(response.data.user.email).toBe(SEED_EMAIL);
    expect(response.data.expiresIn).toBe('7d');

    // Sifre hash'i hicbir cevapta bulunmamali (1.3'teki PUBLIC_USER_COLUMNS).
    expect(JSON.stringify(response.data)).not.toContain('$2b$');
    expect(JSON.stringify(response.data)).not.toContain('password_hash');
  });
});

/* ================================================= savunma derinligi kaniti */

describe('frontend dogrulamasi atlatildiginda backend hala tutuyor', () => {
  /**
   * Bu blogun tamami arayuzu **hic kullanmadan** dogrudan API'ye gider —
   * yani DevTools'tan, curl'den ya da Postman'den gelen bir istek gibi.
   * `utils/validation.ts` bu istekler icin hic calismaz.
   */

  it('7 karakterlik sifre backend tarafindan reddedilir (400)', async () => {
    const response = await raw.post('/auth/register', {
      name: 'Atlatma Denemesi',
      email: `bypass-${Date.now()}@evenup.test`,
      password: 'Pass12!', // istemcide de takilirdi, ama istemciyi atladik
    });

    expect(response.status).toBe(400);
    expect(response.data.details?.password).toBe('Sifre en az 8 karakter olmali');
  });

  it('bicimsiz e-posta backend tarafindan reddedilir (400)', async () => {
    const response = await raw.post('/auth/register', {
      name: 'Atlatma Denemesi',
      email: 'deniz-at-evenup',
      password: 'Password123!',
    });

    expect(response.status).toBe(400);
    expect(response.data.details?.email).toBe('Gecerli bir e-posta adresi girin');
  });

  it('bos govde backend tarafindan reddedilir (400)', async () => {
    const response = await raw.post('/auth/register', {});

    expect(response.status).toBe(400);
    expect(Object.keys(response.data.details ?? {})).toEqual(
      expect.arrayContaining(['email', 'password', 'name'])
    );
  });

  it('govdede role=admin gonderilse bile kullanici "user" olur', async () => {
    const response = await raw.post<AuthResult>('/auth/register', {
      name: 'Rol Yukseltme Denemesi',
      email: `escalate-${Date.now()}@evenup.test`,
      password: 'Password123!',
      role: 'admin',
    });

    expect(response.status).toBe(201);
    // Frontend `role` alanini hic gondermiyor (api/auth.ts), ama gonderseydi
    // de bir sey degismezdi: karari sunucu veriyor (docs/decisions/1.3.md).
    expect(response.data.user.role).toBe('user');
  });
});

/* ================================================== arayuz -> gercek backend */

describe('giris ekrani gercek backend ile', () => {
  it('yanlis sifre: backend mesaji ekranda, token yazilmaz, sayfada kalinir', async () => {
    renderAt('/login');
    await screen.findByRole('heading', { name: 'Giris yap' });

    type('E-posta', SEED_EMAIL);
    type('Sifre', 'kesinlikle-yanlis-sifre');
    submit('Giris yap');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('E-posta veya sifre hatali');

    // Jenerik metne dusulmedigi ayrica dogrulanir.
    expect(alert).not.toHaveTextContent('Beklenmeyen bir hata olustu');
    expect(alert).not.toHaveTextContent('Giris yapilamadi');

    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(screen.getByRole('heading', { name: 'Giris yap' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Gruplar' })).not.toBeInTheDocument();
  });

  it('dogru bilgi: /groups ekranina duser ve token localStorage e yazilir', async () => {
    renderAt('/login');
    await screen.findByRole('heading', { name: 'Giris yap' });

    type('E-posta', SEED_EMAIL);
    type('Sifre', SEED_PASSWORD);
    submit('Giris yap');

    expect(await screen.findByRole('heading', { name: 'Gruplar' })).toBeInTheDocument();

    const stored = window.localStorage.getItem(TOKEN_KEY);
    expect(stored).toBeTruthy();

    // Saklanan sey gercekten calisan bir token mi: sunucuya sorarak dogrula.
    const me = await raw.get('/auth/me', { headers: { Authorization: `Bearer ${stored}` } });
    expect(me.status).toBe(200);
    expect(me.data.user.email).toBe(SEED_EMAIL);
  });

  it('istemci dogrulamasi takilirsa backend e hic istek gitmez', async () => {
    renderAt('/login');
    await screen.findByRole('heading', { name: 'Giris yap' });

    submit('Giris yap'); // bos form

    expect(await screen.findByText('E-posta zorunlu')).toBeInTheDocument();
    expect(screen.getByText('Sifre zorunlu')).toBeInTheDocument();
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});

/* =================================================== kayit -> otomatik giris */

describe('kayit ekrani gercek backend ile', () => {
  it('gecersiz sifre istemcide takilir — sunucuya gidilmez', async () => {
    renderAt('/register');
    await screen.findByRole('heading', { name: 'Kayit ol' });

    type('Ad', 'Erken Geri Bildirim');
    type('E-posta', NEW_EMAIL);
    type('Sifre', 'Pass12!'); // 7 karakter

    submit('Kayit ol');

    expect(await screen.findByText('Sifre en az 8 karakter olmali')).toBeInTheDocument();
    // Kayit olusmadigi bir sonraki testte kanitlaniyor: ayni e-posta 201 aliyor.
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('basarili kayit otomatik giris yapar ve /groups a duser', async () => {
    renderAt('/register');
    await screen.findByRole('heading', { name: 'Kayit ol' });

    type('Ad', 'E2E Kullanici');
    type('E-posta', NEW_EMAIL);
    type('Sifre', NEW_PASSWORD);
    submit('Kayit ol');

    // KARAR: kayit cevabindaki token dogrudan kullanilir; login ekranina
    // yonlendirme yok (bkz. docs/decisions/2.2.md).
    expect(await screen.findByRole('heading', { name: 'Gruplar' })).toBeInTheDocument();
    // Kullanici adi Layout basliginda; yeni kullanicinin hic grubu olmadigi icin
    // liste bos durum gosterecek (2.3).
    expect(screen.getByText('E2E Kullanici')).toBeInTheDocument();

    const stored = window.localStorage.getItem(TOKEN_KEY);
    expect(stored).toBeTruthy();

    const me = await raw.get('/auth/me', { headers: { Authorization: `Bearer ${stored}` } });
    expect(me.status).toBe(200);
    expect(me.data.user.email).toBe(NEW_EMAIL);
    expect(me.data.user.role).toBe('user');
  });

  it('ayni e-posta ile ikinci kayit 409 alir ve mesaj ekranda gorunur', async () => {
    renderAt('/register');
    await screen.findByRole('heading', { name: 'Kayit ol' });

    type('Ad', 'Ikinci Deneme');
    type('E-posta', NEW_EMAIL);
    type('Sifre', NEW_PASSWORD);
    submit('Kayit ol');

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Bu e-posta zaten kayitli')
    );
  });

  it('yeni kullanici gercekten giris yapabiliyor', async () => {
    const response = await raw.post<AuthResult>('/auth/login', {
      email: NEW_EMAIL,
      password: NEW_PASSWORD,
    });

    expect(response.status).toBe(200);
    expect(response.data.user.name).toBe('E2E Kullanici');
  });
});
