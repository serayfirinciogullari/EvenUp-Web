import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from '../App';
import { AuthProvider } from '../context/AuthProvider';

/**
 * Landing (halka acik `/`) testleri.
 *
 * Ag katmani mock'lanir ama landing hicbir istek atmiyor: bu dosyadaki
 * `api/auth` mock'u yalnizca "token yokken kimse `/auth/me` cagirmasin"
 * kuralini dogrulayabilmek icin duruyor.
 *
 * ANIMASYON NEDEN SINANMIYOR
 * --------------------------
 * jsdom'da `IntersectionObserver` sahte (test/setup.ts) ve hicbir zaman
 * tetiklenmiyor; `whileInView` blogu bu yuzden baslangic durumunda kaliyor.
 * Icerik yine de DOM'da oldugu icin **ne oldugu** sinanabiliyor, **nasil
 * belirdigi** sinanamiyor. Hero animasyonunun bir kere oynamasi da ayni
 * sebeple (rAF + gercek zaman) burada degil, kodun kendisinde garanti:
 * `repeat` yok, tetikleyici mount (bkz. LandingNetting).
 */

vi.mock('../api/auth', () => ({
  __esModule: true,
  default: { login: vi.fn(), register: vi.fn(), getMe: vi.fn() },
}));

import authApi from '../api/auth';

const mockedAuth = vi.mocked(authApi);

const renderLanding = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
});

/* --------------------------------------------------------------- erisim */

describe('Landing — halka acik', () => {
  it('giris yapmadan acilir ve hicbir oturum istegi atmaz', async () => {
    renderLanding();

    expect(
      await screen.findByRole('heading', { name: /Arkadas hesabi, tartismaya donusmesin/ })
    ).toBeInTheDocument();
    expect(mockedAuth.getMe).not.toHaveBeenCalled();
  });

  it('uygulama cercevesini tasimaz — gezinme ve cikis yok', async () => {
    renderLanding();
    await screen.findByRole('heading', { name: /Arkadas hesabi/ });

    expect(screen.queryByRole('link', { name: 'Gruplar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cikis' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hesap menusu' })).not.toBeInTheDocument();
  });

  it('ust barda giris ve kayit baglantilari var', async () => {
    renderLanding();

    const header = (await screen.findByRole('banner')) as HTMLElement;

    expect(within(header).getByRole('link', { name: 'Giris yap' })).toHaveAttribute(
      'href',
      '/login'
    );
    expect(within(header).getByRole('link', { name: 'Hemen basla' })).toHaveAttribute(
      'href',
      '/register'
    );
  });
});

/* ---------------------------------------------------------------- hero */

describe('Landing — hero', () => {
  it('netlestirme semasi tek bir erisilebilir gorsel olarak duyurulur', async () => {
    renderLanding();

    const figure = await screen.findByRole('img', { name: /yedi ayri borc/i });

    expect(figure.tagName.toLowerCase()).toBe('svg');
  });

  it('sema once yedi borc, sonra uc odeme cizer', async () => {
    renderLanding();
    await screen.findByRole('img', { name: /yedi ayri borc/i });

    // Ok isareti yalnizca netlestirme sonrasi odemelerde; sayilar semanin
    // anlatisini sabitliyor (7 -> 3).
    const figure = screen.getByRole('img', { name: /yedi ayri borc/i });

    expect(figure.querySelectorAll('path[marker-end]')).toHaveLength(3);
    expect(screen.getByText('7 ayri borc · 3 odemeye indi')).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------- bolumler */

describe('Landing — bolumler', () => {
  it('nasil calisir uc adimi sirasiyla anlatir', async () => {
    renderLanding();
    await screen.findByRole('heading', { name: 'Nasil calisir' });

    expect(screen.getByRole('heading', { name: 'Fisi cek' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'AI duzenlesin' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Hesap kapansin' })).toBeInTheDocument();

    // Sira konumdan degil metinden de okunabiliyor.
    expect(screen.getByText('1. adim')).toBeInTheDocument();
    expect(screen.getByText('3. adim')).toBeInTheDocument();
  });

  it('AI onizlemesi statik: yazma alani yok, yakinda oldugu yazili', async () => {
    renderLanding();
    await screen.findByRole('heading', { name: 'Fisi anlayan bir sohbet' });

    expect(screen.getByText(/Temizlik bana ait degil, sil/)).toBeInTheDocument();
    // Isleyen bir demo degil.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('Yakinda')).toBeInTheDocument();
  });

  it('neden EvenUp bolumu rakip ismi vermeden farki anlatir', async () => {
    renderLanding();
    await screen.findByRole('heading', { name: 'Neden EvenUp' });

    expect(screen.getByRole('heading', { name: 'En az sayida odeme' })).toBeInTheDocument();
    expect(screen.getAllByText(/Diger uygulamalar/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Splitwise/i)).not.toBeInTheDocument();
  });

  it('son CTA kayit ekranina bakar', async () => {
    renderLanding();
    await screen.findByRole('heading', { name: /Bir sonraki hesabi kimse hesaplamasin/ });

    const links = screen.getAllByRole('link', { name: /Hemen basla/ });

    // Ust bar + hero + son CTA: ucu de ayni hedefe bakiyor.
    expect(links).toHaveLength(3);
    links.forEach((link) => expect(link).toHaveAttribute('href', '/register'));
  });
});
