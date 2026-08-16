import { fireEvent, render, screen, within } from '@testing-library/react';
import axios from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, describe, expect, it } from 'vitest';

import App from './App';
import { AuthProvider } from './context/AuthProvider';

import type { AuthResult } from './types/api';
import type { User } from './types/models';

/**
 * GERCEK BACKEND'e karsi ayarlar sayfasi (2.6). Hicbir sey mock'lanmaz.
 *
 *   1. npm run db:reset  (kokte)  -> seed verisi
 *   2. npm run dev       (kokte)  -> API
 *   3. npm run test:api  (web/)
 *
 * DOSYANIN ISI
 * ------------
 * 1. Gorevin "F5'ten sonra kalici mi" sorusunu **gercekten** cevaplamak: isim
 *    arayuzden degistirilir, sonra uygulama sifirdan mount edilir (tarayici
 *    yenilemesinin testteki karsiligi) ve deger sunucudan yeniden okunur.
 * 2. Sifre degisikliginin **giris davranisini** degistirdigini gostermek: eski
 *    sifre artik calismiyor, yenisi calisiyor. Cevap govdesine bakmak bunu
 *    kanitlamazdi.
 * 3. Yanlis mevcut sifrenin 400 dondugunu ve **oturumu dusurmedigini**
 *    dogrulamak (401 olsaydi kullanici login ekraninda uyanirdi).
 *
 * Test kendi hesabini aciyor: seed kullanicilarinin sifresini degistirseydi
 * diger test dosyalari (ve bir sonraki calistirma) kirilirdi.
 */

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const TOKEN_KEY = 'evenup.token';

const raw = axios.create({ baseURL: API_URL, validateStatus: () => true });

const STAMP = Date.now();
const EMAIL = `settings-e2e-${STAMP}@evenup.test`;
const ORIGINAL_NAME = `Ayar Testi ${STAMP}`;
const UPDATED_NAME = `Ayar Testi Guncel ${STAMP}`;
const ORIGINAL_PASSWORD = 'IlkSifre123!';
const NEW_PASSWORD = 'IkinciSifre456!';

let token = '';
let userId = '';

const authed = (value: string) => ({ headers: { Authorization: `Bearer ${value}` } });

const renderApp = () => {
  window.localStorage.setItem(TOKEN_KEY, token);

  return render(
    <MemoryRouter initialEntries={['/settings']}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>
  );
};

const waitForPage = () => screen.findByRole('heading', { name: 'Ayarlar' });

const section = (name: string) =>
  screen.getByRole('heading', { name }).closest('section') as HTMLElement;

/** Sunucudaki guncel kaydi okur — ekrandan bagimsiz tek dogruluk kaynagi. */
const readServerUser = async (): Promise<User> => {
  const response = await raw.get<{ user: User }>('/auth/me', authed(token));
  expect(response.status).toBe(200);
  return response.data.user;
};

const login = (email: string, password: string) =>
  raw.post<AuthResult>('/auth/login', { email, password });

beforeAll(async () => {
  try {
    const health = await raw.get('/health');

    if (health.status !== 200) {
      throw new Error(`/health ${health.status} dondu`);
    }
  } catch (error) {
    throw new Error(
      `Backend ${API_URL} adresinde ayakta degil. Kokte "npm run dev" calistirin. (${String(error)})`
    );
  }

  const registered = await raw.post<AuthResult>('/auth/register', {
    email: EMAIL,
    password: ORIGINAL_PASSWORD,
    name: ORIGINAL_NAME,
  });

  if (registered.status !== 201) {
    throw new Error(`Test hesabi olusturulamadi (${registered.status})`);
  }

  token = registered.data.token;
  userId = registered.data.user.id;
});

/* ================================================================= profil */

describe('Ayarlar > profil (gercek backend)', () => {
  it('isim degisikligi veritabaninda kalicidir ve yeniden acilista gorunur', async () => {
    const { unmount } = renderApp();
    await waitForPage();

    const profile = section('Profil');
    fireEvent.change(within(profile).getByLabelText('Ad'), {
      target: { value: UPDATED_NAME },
    });
    fireEvent.click(within(profile).getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByText('Profil guncellendi')).toBeInTheDocument();

    // (1) Sunucu gercekten guncellendi mi?
    expect((await readServerUser()).name).toBe(UPDATED_NAME);

    // (2) F5'in testteki karsiligi: uygulama sifirdan mount ediliyor. Yerel
    //     React state'i tamamen gidiyor; ekrandaki isim yalnizca sunucudan
    //     gelebilir.
    unmount();
    window.localStorage.setItem(TOKEN_KEY, token);
    renderApp();
    await waitForPage();

    expect(within(section('Profil')).getByLabelText('Ad')).toHaveValue(UPDATED_NAME);
  });

  it('rol govdeye yazilsa bile yukseltilmez', async () => {
    const response = await raw.put(
      '/users/me',
      { name: UPDATED_NAME, role: 'admin', is_active: false, email: 'ele@gecir.test' },
      authed(token)
    );

    expect(response.status).toBe(200);
    expect(response.data.user.role).toBe('user');

    const server = await readServerUser();
    expect(server).toMatchObject({ id: userId, role: 'user', is_active: true, email: EMAIL });
  });

  it('bos isim 400 doner ve kayit degismez', async () => {
    const response = await raw.put('/users/me', { name: '  ' }, authed(token));

    expect(response.status).toBe(400);
    expect(response.data.details).toEqual({ name: 'Isim zorunlu' });
    expect((await readServerUser()).name).toBe(UPDATED_NAME);
  });

  it('token olmadan 401 doner', async () => {
    const response = await raw.put('/users/me', { name: 'Tokensiz' });
    expect(response.status).toBe(401);
  });
});

/* ================================================================== sifre */

describe('Ayarlar > sifre degistirme (gercek backend)', () => {
  const fillPasswordForm = (current: string, next: string) => {
    const scope = section('Sifre degistir');

    fireEvent.change(within(scope).getByLabelText('Mevcut sifre'), {
      target: { value: current },
    });
    fireEvent.change(within(scope).getByLabelText('Yeni sifre'), { target: { value: next } });
    fireEvent.change(within(scope).getByLabelText('Yeni sifre (tekrar)'), {
      target: { value: next },
    });
    fireEvent.click(within(scope).getByRole('button', { name: 'Sifreyi degistir' }));
  };

  it('yanlis mevcut sifre acik hata verir, oturumu dusurmez ve sifreyi degistirmez', async () => {
    renderApp();
    await waitForPage();

    fillPasswordForm('KesinlikleYanlis999', NEW_PASSWORD);

    expect(
      await within(section('Sifre degistir')).findByText('Mevcut sifre hatali')
    ).toBeInTheDocument();

    // Hala Ayarlar'dayiz: 401 olsaydi interceptor token'i silip login'e atardi.
    expect(await waitForPage()).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Giris yap' })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(TOKEN_KEY)).toBe(token);

    // Ve sifre gercekten degismedi.
    expect((await login(EMAIL, ORIGINAL_PASSWORD)).status).toBe(200);
    expect((await login(EMAIL, NEW_PASSWORD)).status).toBe(401);
  });

  it('dogru mevcut sifreyle degisiklik kalicidir: eski sifre artik gecmez', async () => {
    renderApp();
    await waitForPage();

    fillPasswordForm(ORIGINAL_PASSWORD, NEW_PASSWORD);

    expect(await screen.findByText('Sifreniz degistirildi')).toBeInTheDocument();

    // Tek gecerli kanit: giris davranisi degisti.
    expect((await login(EMAIL, ORIGINAL_PASSWORD)).status).toBe(401);

    const withNew = await login(EMAIL, NEW_PASSWORD);
    expect(withNew.status).toBe(200);
    expect(withNew.data.user.name).toBe(UPDATED_NAME);
  });

  it('degisiklikten sonra eski token hala gecerli (bilinen sinir)', async () => {
    // Sifre degistirmek acik oturumlari **kapatmiyor**: JWT'de surum bilgisi
    // yok (1.3'ten devreden acik madde). Bu test bir onay degil, davranisin
    // kayda gecmesi — degisirse burasi kirmizi yanar ve karar bilincli olur.
    const response = await raw.get('/auth/me', authed(token));
    expect(response.status).toBe(200);
  });

  it('yeni sifre mevcut sifreyle ayniysa 400 doner', async () => {
    const response = await raw.put(
      '/users/me/password',
      { currentPassword: NEW_PASSWORD, newPassword: NEW_PASSWORD },
      authed(token)
    );

    expect(response.status).toBe(400);
    expect(response.data.details.newPassword).toBe('Yeni sifre mevcut sifreden farkli olmali');
  });

  it('cevapta hicbir sifre ya da hash izi yok', async () => {
    const response = await raw.put(
      '/users/me/password',
      { currentPassword: NEW_PASSWORD, newPassword: ORIGINAL_PASSWORD },
      authed(token)
    );

    expect(response.status).toBe(200);

    const body = JSON.stringify(response.data);
    expect(body).not.toContain(ORIGINAL_PASSWORD);
    expect(body).not.toContain(NEW_PASSWORD);
    expect(body).not.toContain('$2');

    // Hesap baslangic sifresine dondu; testin birakip gittigi durum belirli.
    expect((await login(EMAIL, ORIGINAL_PASSWORD)).status).toBe(200);
  });
});
