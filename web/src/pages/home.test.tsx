import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from '../App';
import AuthProvider from '../context/AuthProvider';

import type { HomeSummary, User } from '../types/models';

/**
 * Home ekrani testleri.
 *
 * Ag katmani mock'lanir; geri kalan her sey gercek kod: rota agaci, guard'lar,
 * `useAsync`, karo icerigi (`utils/homeCards`), para bicimlendirmesi ve
 * izgaranin kendisi.
 *
 * CAROUSEL GITTI — TESTLER DE BUNU KORUYOR
 * ----------------------------------------
 * Sabit izgaraya gecildi (bkz. docs/decisions/home-ve-bos-durum-duzeltme.md).
 * Asagida bunun icin ayri bir blok var: ok butonu / nokta gostergesi / slide
 * rolu **hic** olmamali. Testin isi yalnizca yeni duzeni dogrulamak degil,
 * eskisinin geri sizmasini engellemek.
 */

vi.mock('../api/auth', () => ({
  __esModule: true,
  default: { login: vi.fn(), register: vi.fn(), getMe: vi.fn() },
}));

vi.mock('../api/summary', () => ({
  __esModule: true,
  default: { getHomeSummary: vi.fn() },
}));

vi.mock('../api/groups', () => ({
  __esModule: true,
  default: {
    listGroups: vi.fn().mockResolvedValue([]),
    createGroup: vi.fn(),
    getGroup: vi.fn(),
    createInvite: vi.fn(),
    getGroupBalances: vi.fn(),
  },
}));

import authApi from '../api/auth';
import summaryApi from '../api/summary';

const mockedAuth = vi.mocked(authApi);
const mockedSummary = vi.mocked(summaryApi);

/** `api/tokenStorage.ts` icindeki anahtar; disari acilmiyor (diger testlerle ayni desen). */
const TOKEN_KEY = 'evenup.token';

const deniz: User = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'deniz@evenup.dev',
  name: 'Deniz',
  role: 'user',
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
};

const summaryOf = (over: Partial<HomeSummary> = {}): HomeSummary => ({
  totalNetBalance: '230.00',
  monthlySpend: '450.00',
  activeGroupsCount: 3,
  pendingSettlementsCount: 0,
  ...over,
});

const renderHome = () => {
  window.localStorage.setItem(TOKEN_KEY, 'gecerli.jwt.token');
  mockedAuth.getMe.mockResolvedValue(deniz);

  return render(
    <MemoryRouter initialEntries={['/home']}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>
  );
};

/**
 * Sayfanin hazir olmasi = karsilama **ve** izgara.
 *
 * Ikisini birden beklemek sart: karsilama `/auth/me`den, karolar ozet
 * ucundan geliyor ve ikincisi gec kalabiliyor. Yalnizca basligi beklemek,
 * karolar hala iskeletken sorgu yapan kirilgan testler uretirdi — iskeletin
 * `region` rolu yok, cunku o asamada okunacak bir sey de yok.
 */
const waitForPage = async () => {
  await screen.findByRole('heading', { name: 'Merhaba, Deniz' });
  return screen.findByRole('region', { name: 'Ozetin ve oneriler' });
};

/** Izgara bolumu: karo sorgulari sayfanin geri kalanina tasmasin. */
const grid = () => screen.getByRole('region', { name: 'Ozetin ve oneriler' });

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();

  mockedSummary.getHomeSummary.mockResolvedValue(summaryOf());
});

/* ------------------------------------------------------------- karsilama */

describe('Home — karsilama', () => {
  it('kullanicinin adiyla karsilar', async () => {
    renderHome();

    expect(await waitForPage()).toBeInTheDocument();
  });

  it('ozet ucunu bir kez cagirir', async () => {
    renderHome();
    await waitForPage();

    expect(mockedSummary.getHomeSummary).toHaveBeenCalledTimes(1);
  });
});

/* ---------------------------------------------------------------- karolar */

describe('Home — izgara karolari', () => {
  it('kisisel veriler karolarda gorunur', async () => {
    renderHome();
    await waitForPage();

    const tiles = within(grid());

    expect(tiles.getByText('230,00 ₺')).toBeInTheDocument();
    expect(tiles.getByText('450,00 ₺')).toBeInTheDocument();
  });

  it('izgara sabit: iki kisisel karo + bir tanitim karosu, hepsi ayni anda', async () => {
    renderHome();
    await waitForPage();

    const tiles = within(grid());

    expect(tiles.getByText('Toplam net bakiyen')).toBeInTheDocument();
    expect(tiles.getByText('Bu ay harcadigin')).toBeInTheDocument();
    expect(tiles.getByText('Fisi cek, AI duzenlesin')).toBeInTheDocument();

    // Kisisel karolar `article`; tanitim karosu bir buton. Toplam uc kutu.
    expect(tiles.getAllByRole('article')).toHaveLength(2);
  });

  it('negatif bakiye eksi isaretiyle ve borclu etiketiyle gosterilir', async () => {
    mockedSummary.getHomeSummary.mockResolvedValue(summaryOf({ totalNetBalance: '-120.50' }));

    renderHome();
    await waitForPage();

    const tiles = within(grid());

    expect(tiles.getByText('-120,50 ₺')).toBeInTheDocument();
    // Renk bilgiyi tasimiyor: yon her zaman yazili (bkz. utils/balance.ts).
    expect(tiles.getByText(/Sen borclusun/)).toBeInTheDocument();
  });

  it('henuz yazilmamis ozellik Yakinda rozeti tasir ve bildirim gosterir', async () => {
    renderHome();
    await waitForPage();

    expect(within(grid()).getByText('Yakinda')).toBeInTheDocument();

    fireEvent.click(within(grid()).getByRole('button', { name: /Fisi cek, AI duzenlesin/ }));

    expect(await screen.findByText('Bu ozellik yakinda')).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------ renk kurali */

describe('Home — tek renk ailesi', () => {
  /*
    jsdom stil dosyasini yuklemiyor, dolayisiyla gercek zemin rengi
    olculemiyor. Kural bu yuzden **sinif duzeyinde** korunuyor: her karo
    yalnizca `home-tile--{balance|spend|feature}` yuzeylerinden birini
    tasiyabilir ve bunlarin ucu de index.css'te rose/ink gradyanidir.
  */
  const SURFACES = /home-tile--(balance|spend|feature)/;

  it('her karo tek aileden bir yuzey sinifi tasir', async () => {
    renderHome();
    await waitForPage();

    const tiles = grid().querySelectorAll('.home-tile');

    expect(tiles).toHaveLength(3);
    tiles.forEach((tile) => expect(tile.className).toMatch(SURFACES));
  });

  it('sinyal rengi zemine degil yalnizca sayiya uygulanir', async () => {
    mockedSummary.getHomeSummary.mockResolvedValue(summaryOf({ totalNetBalance: '-120.50' }));

    renderHome();
    await waitForPage();

    const amount = within(grid()).getByText('-120,50 ₺');

    // Ton sinifi karonun uzerinde ama zemini degistiren `balance--*`
    // ailesinden degil; rakamin rengini index.css bu sinif uzerinden veriyor.
    expect(amount.closest('.home-tile')?.className).toMatch(/home-tile--debt/);
    expect(grid().querySelector('.balance--debt')).toBeNull();
    expect(grid().querySelector('.balance--credit')).toBeNull();
  });
});

/* ------------------------------------------------------- carousel kalintisi */

describe('Home — carousel kaldirildi', () => {
  it('nokta gostergesi, ok butonu ve slide rolu kalmadi', async () => {
    renderHome();
    await waitForPage();

    expect(screen.queryByRole('button', { name: /karta git$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Onceki kart' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sonraki kart' })).not.toBeInTheDocument();
    // Embla her slide'i `role="group"` ile duyuruyordu.
    expect(screen.queryAllByRole('group')).toHaveLength(0);
    expect(document.querySelector('[aria-roledescription="carousel"]')).toBeNull();
  });
});

/* ------------------------------------------------------------------ CTA */

describe('Home — yonlendirme', () => {
  it('Gruplarini Gor bagli oldugu sayfaya goturur', async () => {
    renderHome();
    await waitForPage();

    fireEvent.click(screen.getByRole('link', { name: /Gruplarini Gor/ }));

    expect(await screen.findByRole('heading', { name: 'Gruplar' })).toBeInTheDocument();
  });

  it('CTA bir link — sag tik/yeni sekme calissin diye buton degil', async () => {
    renderHome();
    await waitForPage();

    expect(screen.getByRole('link', { name: /Gruplarini Gor/ })).toHaveAttribute('href', '/groups');
  });

  it('aktif grup sayisi CTA altindaki cumlede yasiyor', async () => {
    renderHome();
    await waitForPage();

    expect(screen.getByText(/3 grupta aktifsin/)).toBeInTheDocument();
  });
});

/* --------------------------------------------------------------- banner */

describe('Home — bekleyen odeme uyarisi', () => {
  it('bekleyen odeme yokken banner cikmaz', async () => {
    renderHome();
    await waitForPage();

    expect(screen.queryByText(/bekleyen odemen var/)).not.toBeInTheDocument();
  });

  it('bekleyen odeme varken sayiyla birlikte cikar ve gruplara baglar', async () => {
    mockedSummary.getHomeSummary.mockResolvedValue(summaryOf({ pendingSettlementsCount: 2 }));

    renderHome();
    await waitForPage();

    const banner = screen.getByText('2 bekleyen odemen var.');

    expect(banner).toBeInTheDocument();
    expect(banner.closest('a')).toHaveAttribute('href', '/groups');
  });
});

/* ---------------------------------------------------------- hata / bos */

describe('Home — ozet okunamadiginda', () => {
  it('sayfa ayakta kalir: CTA ve tanitim karosu gorunmeye devam eder', async () => {
    mockedSummary.getHomeSummary.mockRejectedValue(new Error('bozuk'));

    renderHome();
    await waitForPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Ozet yuklenemedi');

    // Home'un asil isi (gruplara yonlendirmek) ozet olmadan da yapilabiliyor.
    expect(screen.getByRole('link', { name: /Gruplarini Gor/ })).toBeInTheDocument();
    expect(within(grid()).getByText('Fisi cek, AI duzenlesin')).toBeInTheDocument();
  });

  it('hicbir kisisel karo uydurulmuyor — sifir degil, hic gosterilmiyor', async () => {
    mockedSummary.getHomeSummary.mockRejectedValue(new Error('bozuk'));

    renderHome();
    await waitForPage();
    await screen.findByRole('alert');

    expect(within(grid()).queryByText('Toplam net bakiyen')).not.toBeInTheDocument();
    expect(within(grid()).queryAllByRole('article')).toHaveLength(0);
  });

  it('tekrar dene ucu yeniden cagirir', async () => {
    mockedSummary.getHomeSummary.mockRejectedValueOnce(new Error('bozuk'));

    renderHome();
    await waitForPage();
    await screen.findByRole('alert');

    mockedSummary.getHomeSummary.mockResolvedValue(summaryOf());
    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }));

    // `grid()` ile sarmalanmiyor: yeniden yukleme sirasinda iskelet ciziliyor
    // ve o an bolge yok. Tutar zaten yalnizca karoda gecebilir.
    expect(await screen.findByText('230,00 ₺')).toBeInTheDocument();
  });
});
