import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
 *
 * "SENI BEKLEYENLER" — CTA'NIN YERINE GECEN BOLUM
 * -------------------------------------------------
 * Eski "Gruplarini Gor" CTA'si kaldirildi (bkz.
 * docs/decisions/3.13-home-seni-bekleyenler.md); `api/settlements` bu yuzden
 * artik burada da mock'lanir — ONY satirlarinin Onayla/Itiraz Et'i ve BRC
 * satirlarinin "Hesabi kapat"i (Kisiler sayfasindaki ayni `CloseAccountDialog`)
 * gercek istek atmadan test edilebilsin diye.
 */

vi.mock('../api/auth', () => ({
  __esModule: true,
  default: { login: vi.fn(), register: vi.fn(), getMe: vi.fn() },
}));

vi.mock('../api/summary', () => ({
  __esModule: true,
  default: { getHomeSummary: vi.fn() },
}));

vi.mock('../api/settlements', () => ({
  __esModule: true,
  default: {
    createSettlement: vi.fn(),
    confirmSettlement: vi.fn(),
    rejectSettlement: vi.fn(),
  },
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
import settlementsApi from '../api/settlements';
import summaryApi from '../api/summary';

const mockedAuth = vi.mocked(authApi);
const mockedSettlements = vi.mocked(settlementsApi);
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
  avatar: null,
  handle: null,
};

const summaryOf = (over: Partial<HomeSummary> = {}): HomeSummary => ({
  totalNetBalance: '230.00',
  monthlySpend: '450.00',
  activeGroupsCount: 3,
  pendingSettlementsCount: 0,
  unseenActivityCount: 0,
  pendingApprovals: [],
  pendingDebts: [],
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

    expect(tiles.getByText('Tum gruplarda net durumun')).toBeInTheDocument();
    expect(tiles.getByText('Bu ay harcadigin')).toBeInTheDocument();
    expect(tiles.getByText('Fisi cek, AI duzenlesin')).toBeInTheDocument();

    // Kisisel karolar `article`; tanitim karosu bir buton. Toplam uc kutu.
    expect(tiles.getAllByRole('article')).toHaveLength(2);
  });

  it('negatif bakiye eksi isaretiyle, yon rozetiyle ve cumleyle gosterilir', async () => {
    mockedSummary.getHomeSummary.mockResolvedValue(summaryOf({ totalNetBalance: '-120.50' }));

    renderHome();
    await waitForPage();

    const tiles = within(grid());

    // Buyuk sayi isaretli; cumle borcu absolute tutarla, duz dille anlatiyor.
    expect(tiles.getByText('-120,50 ₺')).toBeInTheDocument();
    // Renk bilgiyi tasimiyor: yon hem rozette hem cumlede YAZILI.
    expect(tiles.getByText('Borcun var')).toBeInTheDocument();
    expect(tiles.getByText('3 grupta toplam 120,50 ₺ borcun var.')).toBeInTheDocument();
  });

  it('pozitif bakiyede alacak rozeti ve cumlesi cikar', async () => {
    // Varsayilan ozet: 230,00 ₺ alacak, 3 grup, bekleyen yok.
    renderHome();
    await waitForPage();

    const tiles = within(grid());

    expect(tiles.getByText('Sana borclular')).toBeInTheDocument();
    expect(tiles.getByText('3 grupta toplam 230,00 ₺ alacagin var.')).toBeInTheDocument();
  });

  it('bekleyen odeme net durum cumlesine de yansir', async () => {
    mockedSummary.getHomeSummary.mockResolvedValue(
      summaryOf({ totalNetBalance: '-120.50', pendingSettlementsCount: 2 })
    );

    renderHome();
    await waitForPage();

    expect(
      within(grid()).getByText('3 grupta toplam 120,50 ₺ borcun var; 2 islem seni bekliyor.')
    ).toBeInTheDocument();
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
  it('sayfa ayakta kalir: tanitim karosu gorunmeye devam eder, Seni bekleyenler gizli kalir', async () => {
    mockedSummary.getHomeSummary.mockRejectedValue(new Error('bozuk'));

    renderHome();
    await waitForPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Ozet yuklenemedi');

    // Home'un asil isi (ozet + yonlendirme) ozet olmadan da yapilabiliyor.
    expect(within(grid()).getByText('Fisi cek, AI duzenlesin')).toBeInTheDocument();
    // Ozet olmadan hangi satirlarin gosterilecegi bilinmiyor — uydurulmuyor.
    expect(screen.queryByRole('heading', { name: 'Seni bekleyenler' })).not.toBeInTheDocument();
  });

  it('hicbir kisisel karo uydurulmuyor — sifir degil, hic gosterilmiyor', async () => {
    mockedSummary.getHomeSummary.mockRejectedValue(new Error('bozuk'));

    renderHome();
    await waitForPage();
    await screen.findByRole('alert');

    expect(within(grid()).queryByText('Tum gruplarda net durumun')).not.toBeInTheDocument();
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

/* -------------------------------------------------------- seni bekleyenler */

describe('Home — Seni bekleyenler', () => {
  const approval = {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    group_id: 'gggggggg-0000-4000-8000-000000000001',
    group_name: 'Ev Arkadaslari',
    from_user: '33333333-3333-4333-8333-333333333333',
    from_name: 'Serenad',
    amount: '310.00',
    created_at: '2026-01-10T00:00:00.000Z',
  };

  const debt = {
    group_id: 'gggggggg-0000-4000-8000-000000000002',
    group_name: 'Ofis kahvesi',
    to_user: '44444444-4444-4444-8444-444444444444',
    to_user_name: 'Deniz',
    amount: '85.00',
  };

  const section = () => screen.getByRole('heading', { name: 'Seni bekleyenler' }).closest('section') as HTMLElement;

  beforeEach(() => {
    mockedSettlements.confirmSettlement.mockResolvedValue({} as never);
    mockedSettlements.rejectSettlement.mockResolvedValue({} as never);
    mockedSettlements.createSettlement.mockResolvedValue({} as never);
  });

  it('onay ve borc yokken bolum hic gorunmez', async () => {
    renderHome();
    await waitForPage();

    expect(screen.queryByRole('heading', { name: 'Seni bekleyenler' })).not.toBeInTheDocument();
  });

  it('ONY satiri onay bekleyen odemeyi ve grubunu gosterir', async () => {
    mockedSummary.getHomeSummary.mockResolvedValue(summaryOf({ pendingApprovals: [approval] }));

    renderHome();
    await waitForPage();

    const scope = within(section());
    expect(scope.getByText('Serenad, sana 310,00 ₺ odedigini isaretledi')).toBeInTheDocument();
    expect(scope.getByText('Ev Arkadaslari · onayin bekleniyor')).toBeInTheDocument();
  });

  it('Onayla tiklaninca confirmSettlement cagrilir ve ozet yeniden okunur', async () => {
    mockedSummary.getHomeSummary.mockResolvedValueOnce(summaryOf({ pendingApprovals: [approval] }));
    mockedSummary.getHomeSummary.mockResolvedValue(summaryOf());

    renderHome();
    await waitForPage();

    fireEvent.click(within(section()).getByRole('button', { name: 'Onayla' }));

    await waitFor(() => expect(mockedSettlements.confirmSettlement).toHaveBeenCalledWith(approval.id));
    await waitFor(() => expect(mockedSummary.getHomeSummary).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Seni bekleyenler' })).not.toBeInTheDocument()
    );
  });

  it('Itiraz Et tiklaninca rejectSettlement cagrilir', async () => {
    mockedSummary.getHomeSummary.mockResolvedValueOnce(summaryOf({ pendingApprovals: [approval] }));
    mockedSummary.getHomeSummary.mockResolvedValue(summaryOf());

    renderHome();
    await waitForPage();

    fireEvent.click(within(section()).getByRole('button', { name: 'Itiraz Et' }));

    await waitFor(() => expect(mockedSettlements.rejectSettlement).toHaveBeenCalledWith(approval.id));
  });

  it('onay basarisiz olursa satirin altinda hata gosterilir, satir kaybolmaz', async () => {
    mockedSummary.getHomeSummary.mockResolvedValue(summaryOf({ pendingApprovals: [approval] }));
    mockedSettlements.confirmSettlement.mockRejectedValue(
      Object.assign(new Error('Kayit zaten sonuclanmis'), {
        isAxiosError: true,
        response: { status: 409, data: { message: 'Kayit zaten sonuclanmis' } },
      })
    );

    renderHome();
    await waitForPage();

    fireEvent.click(within(section()).getByRole('button', { name: 'Onayla' }));

    expect(await within(section()).findByRole('alert')).toHaveTextContent('Kayit zaten sonuclanmis');
    // Ozet yeniden okunmadi: satir hala orada.
    expect(within(section()).getByText('Ev Arkadaslari · onayin bekleniyor')).toBeInTheDocument();
  });

  it('BRC satiri kisi adini dogru ekle ve netlesmis tutar etiketiyle gosterir', async () => {
    mockedSummary.getHomeSummary.mockResolvedValue(summaryOf({ pendingDebts: [debt] }));

    renderHome();
    await waitForPage();

    const scope = within(section());
    // "Deniz" ince unluyle bitmiyor -> yonelme eki "'e" (bkz. utils/turkish.ts).
    expect(scope.getByText("Deniz'e 85,00 ₺ borcun var")).toBeInTheDocument();
    expect(scope.getByText('Ofis kahvesi · netlesmis tutar')).toBeInTheDocument();
  });

  it('Hesabi kapat, Kisiler sayfasindaki ayni diyalogu acar ve odeme olusturur', async () => {
    mockedSummary.getHomeSummary.mockResolvedValueOnce(summaryOf({ pendingDebts: [debt] }));
    mockedSummary.getHomeSummary.mockResolvedValue(summaryOf());

    renderHome();
    await waitForPage();

    fireEvent.click(within(section()).getByRole('button', { name: 'Hesabi kapat' }));

    expect(await screen.findByRole('heading', { name: 'Hesabi kapat' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Odemeleri olustur' }));

    await waitFor(() => {
      expect(mockedSettlements.createSettlement).toHaveBeenCalledWith(debt.group_id, {
        toUserId: debt.to_user,
        amount: '85.00',
      });
    });
  });

  it('ONY satirlari BRC satirlarindan once gelir', async () => {
    mockedSummary.getHomeSummary.mockResolvedValue(
      summaryOf({ pendingApprovals: [approval], pendingDebts: [debt] })
    );

    renderHome();
    await waitForPage();

    const badges = within(section())
      .getAllByText(/^(ONY|BRC)$/)
      .map((node) => node.textContent);

    expect(badges).toEqual(['ONY', 'BRC']);
  });
});
