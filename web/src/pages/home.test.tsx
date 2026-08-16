import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from '../App';
import AuthProvider from '../context/AuthProvider';

import type { HomeSummary, User } from '../types/models';

/**
 * Home ekrani testleri (2.7).
 *
 * Ag katmani mock'lanir; geri kalan her sey gercek kod: rota agaci, guard'lar,
 * `useAsync`, kart siralamasi (`utils/homeCards`), para bicimlendirmesi ve
 * carousel'in kendisi.
 *
 * CAROUSEL VE jsdom
 * -----------------
 * Embla gercek olcu (layout) okur; jsdom'da her sey 0 piksel oldugu icin
 * kaydirma **fiziksel olarak** dogrulanamaz. Bu yuzden testler kaydirmanin
 * kendisini degil, kullanicinin gordugu sozlesmeyi kontrol ediyor: dogru
 * kartlar, dogru sirada, dogru sayida nokta ve **otomatik kaymadigi**.
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
 * Sayfanin hazir olmasi = karsilama **ve** carousel.
 *
 * Ikisini birden beklemek sart: karsilama `/auth/me`den, kartlar ozet
 * ucundan geliyor ve ikincisi gec kalabiliyor. Yalnizca basligi beklemek,
 * kartlar hala iskeletken sorgu yapan kirilgan testler uretirdi — iskeletin
 * `region` rolu yok, cunku o asamada okunacak bir sey de yok.
 */
const waitForPage = async () => {
  await screen.findByRole('heading', { name: 'Merhaba, Deniz' });
  return screen.findByRole('region', { name: 'Ozet ve oneriler' });
};

/** Carousel bolumu: kart sorgulari sayfanin geri kalanina tasmasin. */
const carousel = () => screen.getByRole('region', { name: 'Ozet ve oneriler' });

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

/* -------------------------------------------------------------- kartlar */

describe('Home — carousel kartlari', () => {
  it('kisisel veriler kartlarda gorunur', async () => {
    renderHome();
    await waitForPage();

    const cards = within(carousel());

    expect(cards.getByText('230,00 ₺')).toBeInTheDocument();
    expect(cards.getByText('450,00 ₺')).toBeInTheDocument();
    expect(cards.getByText('3')).toBeInTheDocument();
  });

  it('negatif bakiye eksi isaretiyle ve borclu etiketiyle gosterilir', async () => {
    mockedSummary.getHomeSummary.mockResolvedValue(summaryOf({ totalNetBalance: '-120.50' }));

    renderHome();
    await waitForPage();

    const cards = within(carousel());

    expect(cards.getByText('-120,50 ₺')).toBeInTheDocument();
    // Renk bilgiyi tasimiyor: yon her zaman yazili (bkz. utils/balance.ts).
    expect(cards.getByText(/Sen borclusun/)).toBeInTheDocument();
  });

  it('ozet ve tanitim kartlari donusumlu siralanir, toplam 6 kart olur', async () => {
    renderHome();
    await waitForPage();

    const slides = within(carousel()).getAllByRole('group');

    expect(slides).toHaveLength(6);

    // Sira: kisisel, tanitim, kisisel, tanitim, kisisel, tanitim.
    // Ilk kartin kisisel olmasi bilincli — bkz. utils/homeCards.ts.
    expect(slides[0]).toHaveTextContent('Toplam net bakiyen');
    expect(slides[1]).toHaveTextContent('Fisi cek, AI duzenlesin');
    expect(slides[2]).toHaveTextContent('Bu ay harcadigin');
    expect(slides[3]).toHaveTextContent('Herkese kendi takma ismini ver');
    expect(slides[4]).toHaveTextContent('Aktif oldugun grup');
    expect(slides[5]).toHaveTextContent('Borcunu unutma, hatirlat');
  });

  /*
    Takma isimler 2.9'da gercek bir ozellik oldu, dolayisiyla artik iki kart
    "Yakinda" (fis tarama ve hatirlatma). Bu sayi bilerek sabitlenmis: bir
    ozellik yazildiginda `homeCards.ts` icindeki `to` alani guncellenmezse
    test kirmizi yanar ve kart yanlis yere "yakinda" demeye devam etmez.
  */
  it('yalnizca henuz yazilmamis kartlar Yakinda rozeti tasir', async () => {
    renderHome();
    await waitForPage();

    expect(within(carousel()).getAllByText('Yakinda')).toHaveLength(2);
  });

  it('yazilmis bir ozelligin karti ilgili sayfaya goturur', async () => {
    renderHome();
    await waitForPage();

    fireEvent.click(
      within(carousel()).getByRole('button', { name: /Herkese kendi takma ismini ver/ })
    );

    expect(await screen.findByRole('heading', { name: 'Gruplar' })).toBeInTheDocument();
  });
});

/* ----------------------------------------------------------- gostergeler */

describe('Home — nokta gostergeleri', () => {
  it('kart sayisi kadar nokta cikar ve ilki aktiftir', async () => {
    renderHome();
    await waitForPage();

    const dots = within(carousel()).getAllByRole('button', { name: /\. karta git$/ });

    expect(dots).toHaveLength(6);
    expect(dots[0]).toHaveAttribute('aria-current', 'true');
  });

  it('carousel kendiliginden kaymaz — bekledikten sonra da ilk kart aktif', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    try {
      renderHome();
      await waitForPage();

      const activeBefore = within(carousel())
        .getAllByRole('button', { name: /\. karta git$/ })
        .findIndex((dot) => dot.getAttribute('aria-current') === 'true');

      // Otomatik kayan bir carousel bu sure icinde en az bir kez ilerlerdi.
      await vi.advanceTimersByTimeAsync(15_000);

      const activeAfter = within(carousel())
        .getAllByRole('button', { name: /\. karta git$/ })
        .findIndex((dot) => dot.getAttribute('aria-current') === 'true');

      expect(activeAfter).toBe(activeBefore);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ileri/geri butonlari erisilebilir adlarla var', async () => {
    renderHome();
    await waitForPage();

    const cards = within(carousel());

    expect(cards.getByRole('button', { name: 'Onceki kart' })).toBeInTheDocument();
    expect(cards.getByRole('button', { name: 'Sonraki kart' })).toBeInTheDocument();
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
  it('sayfa ayakta kalir: CTA ve tanitim kartlari gorunmeye devam eder', async () => {
    mockedSummary.getHomeSummary.mockRejectedValue(new Error('bozuk'));

    renderHome();
    await waitForPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Ozet yuklenemedi');

    // Home'un asil isi (gruplara yonlendirmek) ozet olmadan da yapilabiliyor.
    expect(screen.getByRole('link', { name: /Gruplarini Gor/ })).toBeInTheDocument();
    expect(within(carousel()).getByText('Fisi cek, AI duzenlesin')).toBeInTheDocument();
  });

  it('hicbir kisisel kart uydurulmuyor — sifir degil, hic gosterilmiyor', async () => {
    mockedSummary.getHomeSummary.mockRejectedValue(new Error('bozuk'));

    renderHome();
    await waitForPage();
    await screen.findByRole('alert');

    expect(within(carousel()).queryByText('Toplam net bakiyen')).not.toBeInTheDocument();
  });

  it('tekrar dene ucu yeniden cagirir', async () => {
    mockedSummary.getHomeSummary.mockRejectedValueOnce(new Error('bozuk'));

    renderHome();
    await waitForPage();
    await screen.findByRole('alert');

    mockedSummary.getHomeSummary.mockResolvedValue(summaryOf());
    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }));

    // `carousel()` ile sarmalanmiyor: yeniden yukleme sirasinda iskelet
    // ciziliyor ve o an bolge yok. Tutar zaten yalnizca kartta gecebilir.
    expect(await screen.findByText('230,00 ₺')).toBeInTheDocument();
  });
});
