import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from '../App';
import { AuthProvider } from '../context/AuthProvider';
import { buildJoinUrl } from '../utils/invite';

import type { AuthResult } from '../types/api';
import type { Group, GroupDetail, User } from '../types/models';

/**
 * Davet linki akisi: `/join/:inviteCode`.
 *
 * Yalnizca ag katmani mock'lanir. Rota agaci, guard'lar, `AuthProvider`,
 * `sessionStorage` tabanli bekleyen davet ve yonlendirmeler gercek kod —
 * cunku bu dosyanin sinadigi sey tam olarak **o parcalarin birlikte
 * calismasi**: kayit ekranina gidip donen kullanicinin isteginin
 * kendiliginden tekrarlanmasi.
 *
 * Uc senaryo:
 *   1. giris yapmis + gecerli kod -> gruba eklenir, detaya duser
 *   2. giris yapmamis -> kayit -> **linke tekrar tiklamadan** katilir
 *   3. gecersiz/dolu kod -> cokmeden anlamli hata
 */
vi.mock('../api/auth', () => ({
  __esModule: true,
  default: { login: vi.fn(), register: vi.fn(), getMe: vi.fn() },
}));

vi.mock('../api/groups', () => ({
  __esModule: true,
  default: {
    listGroups: vi.fn().mockResolvedValue([]),
    createGroup: vi.fn(),
    getGroup: vi.fn(),
    createInvite: vi.fn(),
    joinGroup: vi.fn(),
    getGroupBalances: vi.fn(),
    setMemberNickname: vi.fn(),
  },
}));

/*
  Katilma basarili olunca grup detayina duselecek; o sayfa ve sidebar kendi
  isteklerini atiyor. Bu dosyanin derdi davet akisi oldugu icin hepsi bos
  cevaplarla sabitleniyor.
*/
vi.mock('../api/summary', () => ({
  __esModule: true,
  default: {
    getHomeSummary: vi.fn().mockResolvedValue({
      totalNetBalance: '0.00',
      monthlySpend: '0.00',
      activeGroupsCount: 0,
      pendingSettlementsCount: 0,
      unseenActivityCount: 0,
      pendingApprovals: [],
      pendingDebts: [],
    }),
  },
}));

vi.mock('../api/expenses', () => ({
  __esModule: true,
  default: { listExpenses: vi.fn(), createExpense: vi.fn() },
}));

vi.mock('../api/settlements', () => ({
  __esModule: true,
  default: {
    listSettlements: vi.fn(),
    createSettlement: vi.fn(),
    confirmSettlement: vi.fn(),
    rejectSettlement: vi.fn(),
  },
}));

import authApi from '../api/auth';
import expensesApi from '../api/expenses';
import groupsApi from '../api/groups';
import settlementsApi from '../api/settlements';

const mockedAuth = vi.mocked(authApi);
const mockedGroups = vi.mocked(groupsApi);
const mockedExpenses = vi.mocked(expensesApi);
const mockedSettlements = vi.mocked(settlementsApi);

/* ------------------------------------------------------------------ veri */

const TOKEN_KEY = 'evenup.token';
const CODE = 'Kk7ZqB1sTk2mQ0pXvY9wLA';
const GROUP_ID = 'gggggggg-0000-4000-8000-000000000001';
const ME_ID = '11111111-1111-4111-8111-111111111111';

const me: User = {
  id: ME_ID,
  email: 'deniz@evenup.dev',
  name: 'Deniz',
  role: 'user',
  is_active: true,
  created_at: '2026-08-01T10:00:00.000Z',
  avatar: null,
  handle: null,
};

const group: Group = {
  id: GROUP_ID,
  name: 'Ev Arkadaslari',
  slug: 'ev-arkadaslari',
  description: null,
  created_by: '22222222-2222-4222-8222-222222222222',
  created_at: '2026-08-01T10:00:00.000Z',
};

const groupDetail: GroupDetail = {
  group,
  role: 'member',
  members: [
    {
      user_id: ME_ID,
      name: 'Deniz',
      email: 'deniz@evenup.dev',
      role: 'member',
      joined_at: '2026-08-18T10:00:00.000Z',
      nickname: null,
    },
  ],
};

const authResult: AuthResult = { user: me, token: 'yeni.jwt.token', expiresIn: '7d' };

/** Backend 404'u: gecersiz, suresi dolmus ve kotasi dolmus kod ayni cevabi alir. */
const invalidCodeError = () =>
  Object.assign(new Error('Request failed with status code 404'), {
    isAxiosError: true,
    response: {
      status: 404,
      data: {
        status: 'error',
        statusCode: 404,
        message: 'Davet kodu gecersiz veya suresi dolmus',
      },
    },
  });

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>
  );

/** Elde gecerli bir token varmis gibi davran. */
const signIn = (): void => {
  window.localStorage.setItem(TOKEN_KEY, 'gecerli.jwt.token');
  mockedAuth.getMe.mockResolvedValue(me);
};

const type = (label: string, value: string): void => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
};

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();

  // Katilma sonrasi hedef olan grup detayinin kendi istekleri.
  mockedGroups.getGroup.mockResolvedValue(groupDetail);
  mockedGroups.getGroupBalances.mockResolvedValue({
    balances: [],
    transfers: [],
    meta: {
      expense_count: 0,
      confirmed_settlement_count: 0,
      pending_settlement_count: 0,
      rejected_settlement_count: 0,
      algorithm: 'optimal',
    },
  });
  mockedExpenses.listExpenses.mockResolvedValue({
    expenses: [],
    pagination: {
      page: 1,
      limit: 10,
      total: 0,
      total_pages: 1,
      has_next: false,
      has_previous: false,
    },
  });
  mockedSettlements.listSettlements.mockResolvedValue({
    settlements: [],
    pagination: {
      page: 1,
      limit: 50,
      total: 0,
      total_pages: 1,
      has_next: false,
      has_previous: false,
    },
  });
});

/* ==================================================== 1. giris yapmis kullanici */

describe('giris yapmis kullanici davet linkini acinca', () => {
  it('gruba eklenir ve grup detayina duser', async () => {
    signIn();
    mockedGroups.joinGroup.mockResolvedValue({ group, already_member: false });

    renderAt(`/join/${CODE}`);

    expect(await screen.findByRole('heading', { name: 'Ev Arkadaslari' })).toBeInTheDocument();
    // Adresteki kod, istege oldugu gibi gecti.
    expect(mockedGroups.joinGroup).toHaveBeenCalledWith(CODE);
    // Katildigi kendisine soylendi; sessizce baska bir sayfada uyanmadi.
    expect(await screen.findByText('Ev Arkadaslari grubuna katildin')).toBeInTheDocument();
  });

  it('zaten uyeyse hata gostermez, yine gruba goturur', async () => {
    signIn();
    mockedGroups.joinGroup.mockResolvedValue({ group, already_member: true });

    renderAt(`/join/${CODE}`);

    expect(await screen.findByRole('heading', { name: 'Ev Arkadaslari' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Gruba katilinamadi' })).not.toBeInTheDocument();
    expect(await screen.findByText('Ev Arkadaslari grubunun zaten uyesisin')).toBeInTheDocument();
  });

  /*
    Eski `buildJoinUrl` bu adresi uretiyordu; sohbetlerde paylasilmis linkler
    duruyor olabilir. Ayni sayfaya dusmeli — ve `/groups/:id` kalibina
    yakalanip "join" adli bir grubu aramaya kalkmamali.
  */
  it('eski bicimli /groups/join/:kod linki de calisir', async () => {
    signIn();
    mockedGroups.joinGroup.mockResolvedValue({ group, already_member: false });

    renderAt(`/groups/join/${CODE}`);

    expect(await screen.findByRole('heading', { name: 'Ev Arkadaslari' })).toBeInTheDocument();
    expect(mockedGroups.joinGroup).toHaveBeenCalledWith(CODE);
    expect(mockedGroups.getGroup).not.toHaveBeenCalledWith('join');
  });
});

/* ================================================= 2. giris yapmamis kullanici */

describe('giris yapmamis kullanici davet linkini acinca', () => {
  it('kayit ekranina duser ve kayit bitince linke tekrar tiklamadan katilir', async () => {
    mockedAuth.register.mockResolvedValue(authResult);
    mockedGroups.joinGroup.mockResolvedValue({ group, already_member: false });

    renderAt(`/join/${CODE}`);

    // Once kayit: 404 ya da bos bir ekran degil.
    expect(await screen.findByRole('heading', { name: 'Kayit ol' })).toBeInTheDocument();
    // Oturum yokken katilma istegi atilmaz; atilsaydi 401 alirdi.
    expect(mockedGroups.joinGroup).not.toHaveBeenCalled();

    type('Ad', 'Deniz');
    type('E-posta', 'deniz@evenup.dev');
    type('Sifre', 'Password123!');
    fireEvent.click(screen.getByRole('button', { name: 'Kayit ol' }));

    // Kullanici hicbir sey yapmadan istek tekrarlandi ve grup acildi.
    await waitFor(() => expect(mockedGroups.joinGroup).toHaveBeenCalledWith(CODE));
    expect(await screen.findByRole('heading', { name: 'Ev Arkadaslari' })).toBeInTheDocument();
  });

  /*
    Hesabi olan kullanici kayit ekranindan giris ekranina geciyor. Bu gecis yeni
    bir gezinme, yani router state'ini tasiyan zincirin koptugu nokta: kod
    burada da kaybolmamali.
  */
  it('kayit yerine giris yapsa da davet kodu kaybolmaz', async () => {
    mockedAuth.login.mockResolvedValue(authResult);
    mockedGroups.joinGroup.mockResolvedValue({ group, already_member: false });

    renderAt(`/join/${CODE}`);

    fireEvent.click(await screen.findByRole('link', { name: 'Giris yapin' }));
    expect(await screen.findByRole('heading', { name: 'Giris yap' })).toBeInTheDocument();

    type('E-posta', 'deniz@evenup.dev');
    type('Sifre', 'Password123!');
    fireEvent.click(screen.getByRole('button', { name: 'Giris yap' }));

    await waitFor(() => expect(mockedGroups.joinGroup).toHaveBeenCalledWith(CODE));
    expect(await screen.findByRole('heading', { name: 'Ev Arkadaslari' })).toBeInTheDocument();
  });

  /*
    Router state'ini tamamen kaybeden yol: kullanici davet linkinden kayit
    ekranina dusuyor, sonra adres cubugundan (ya da yer imindeki linkten)
    dogrudan /login'e gidiyor. Geriye yalnizca depodaki kod kaliyor — akisin
    ayakta kalmasi tam olarak onun isi (bkz. api/pendingInvite.ts).
  */
  it('router state kaybolsa da depodaki kod akisi ayakta tutar', async () => {
    mockedAuth.login.mockResolvedValue(authResult);
    mockedGroups.joinGroup.mockResolvedValue({ group, already_member: false });

    const { unmount } = renderAt(`/join/${CODE}`);
    await screen.findByRole('heading', { name: 'Kayit ol' });
    unmount();

    // Sifirdan, state tasimayan bir gezinme.
    renderAt('/login');

    type('E-posta', 'deniz@evenup.dev');
    type('Sifre', 'Password123!');
    fireEvent.click(screen.getByRole('button', { name: 'Giris yap' }));

    await waitFor(() => expect(mockedGroups.joinGroup).toHaveBeenCalledWith(CODE));
    expect(await screen.findByRole('heading', { name: 'Ev Arkadaslari' })).toBeInTheDocument();
  });

  /*
    Davetle ilgisi olmayan bir giris, bekleyen bir davet birakmamali: aksi
    halde kullanici bir sonraki girisinde kendini bilmedigi bir grupta bulurdu.
  */
  it('duz giriste bekleyen davet yoksa Home acilir', async () => {
    mockedAuth.login.mockResolvedValue(authResult);

    renderAt('/login');

    type('E-posta', 'deniz@evenup.dev');
    type('Sifre', 'Password123!');
    fireEvent.click(screen.getByRole('button', { name: 'Giris yap' }));

    // Giris sonrasi bilinen ilk ekran (2.7) — davet akisi bunu degistirmedi.
    expect(await screen.findByRole('heading', { name: 'Merhaba, Deniz' })).toBeInTheDocument();
    expect(mockedGroups.joinGroup).not.toHaveBeenCalled();
  });
});

/* ============================================== 3. gecersiz / kotasi dolmus kod */

describe('gecersiz ya da dolu davet kodu', () => {
  it('cokmeden backend mesajini gosterir', async () => {
    signIn();
    mockedGroups.joinGroup.mockRejectedValue(invalidCodeError());

    renderAt(`/join/${CODE}`);

    expect(await screen.findByRole('heading', { name: 'Gruba katilinamadi' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Davet kodu gecersiz veya suresi dolmus');
    // Ne yapabilecegi de yaziyor: sorun linkte, cozum grubun sahibinde.
    expect(screen.getByText(/yeni bir davet linki isteyebilirsin/)).toBeInTheDocument();
    // Kullanici cikmaza dusmuyor: uygulamaya donebilecegi bir yol var.
    expect(screen.getByRole('link', { name: 'Gruplarima don' })).toBeInTheDocument();
  });

  it('ag hatasindan sonra tekrar denenebilir', async () => {
    signIn();
    mockedGroups.joinGroup.mockRejectedValueOnce(
      Object.assign(new Error('Network Error'), { isAxiosError: true })
    );

    renderAt(`/join/${CODE}`);

    expect(
      await screen.findByText('Sunucuya ulasilamiyor. Baglantinizi kontrol edin.')
    ).toBeInTheDocument();
    // Sorun davette degil baglantida: kullaniciyi grubun sahibine gondermeyiz.
    expect(screen.queryByText(/yeni bir davet linki isteyebilirsin/)).not.toBeInTheDocument();

    mockedGroups.joinGroup.mockResolvedValue({ group, already_member: false });
    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }));

    expect(await screen.findByRole('heading', { name: 'Ev Arkadaslari' })).toBeInTheDocument();
    expect(mockedGroups.joinGroup).toHaveBeenCalledTimes(2);
  });
});

/* ====================================================== link uretimi (origin) */

describe('davet linki uretimi', () => {
  /*
    Link koda gomulu bir adresten degil, kullanicinin uygulamayi actigi
    adresten kuruluyor. Sabit `localhost` olsaydi uretimde paylasilan her
    davet linki bozuk cikardi.
  */
  it('window.location.origin uzerinden kurulur ve /join rotasini gosterir', () => {
    expect(buildJoinUrl(CODE)).toBe(`${window.location.origin}/join/${CODE}`);
    expect(buildJoinUrl(CODE)).not.toContain('/groups/join/');
  });
});
