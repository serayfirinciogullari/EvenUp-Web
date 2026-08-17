import { fireEvent, render, screen } from '@testing-library/react';
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

// /groups sayfasi artik gercek veri cekiyor (2.3). Bu dosyanin derdi rota
// korumasi oldugu icin grup API'si bos liste dondurecek sekilde sabitleniyor;
// aksi halde her rota testi bir de ag istegi denerdi.
vi.mock('./api/groups', () => ({
  __esModule: true,
  default: {
    listGroups: vi.fn().mockResolvedValue([]),
    createGroup: vi.fn(),
    getGroup: vi.fn(),
    createInvite: vi.fn(),
    getGroupBalances: vi.fn().mockResolvedValue({
      balances: [],
      transfers: [],
      meta: {
        expense_count: 0,
        confirmed_settlement_count: 0,
        pending_settlement_count: 0,
        rejected_settlement_count: 0,
        algorithm: 'optimal',
      },
    }),
  },
}));

// Grup detay sayfasi 2.4'te gercek veri cekmeye basladi (harcama + odeme).
// Bu dosyanin derdi yine yalnizca rota; istekler bos cevaplarla sabitleniyor.
vi.mock('./api/expenses', () => ({
  __esModule: true,
  default: {
    listExpenses: vi.fn().mockResolvedValue({
      expenses: [],
      pagination: {
        page: 1,
        limit: 10,
        total: 0,
        total_pages: 1,
        has_next: false,
        has_previous: false,
      },
    }),
    createExpense: vi.fn(),
  },
}));

// Admin paneli 2.5'te gercek veri cekmeye basladi. Mock'lanmazsa bu dosyadaki
// /admin testi gercek bir ag istegi dener; sahte token 401 doner ve merkezi
// 401 yonetimi oturumu **sonraki teste tasan** bicimde dusururdu.
vi.mock('./api/admin', () => ({
  __esModule: true,
  default: {
    listUsers: vi.fn().mockResolvedValue({
      users: [],
      pagination: { page: 1, limit: 20, total: 0, total_pages: 1, has_next: false, has_previous: false },
    }),
    disableUser: vi.fn(),
    enableUser: vi.fn(),
    listGroups: vi.fn().mockResolvedValue({
      groups: [],
      pagination: { page: 1, limit: 20, total: 0, total_pages: 1, has_next: false, has_previous: false },
    }),
    getStats: vi.fn().mockResolvedValue({
      users: { total: 0, active: 0, inactive: 0 },
      groups: { active: 0, deleted: 0 },
      expenses: { count: 0, volume: '0.00' },
      settlements: { confirmed_count: 0, confirmed_volume: '0.00' },
      trends: {
        last_7_days: { new_users: 0, new_groups: 0, expense_count: 0, expense_volume: '0.00' },
        last_30_days: { new_users: 0, new_groups: 0, expense_count: 0, expense_volume: '0.00' },
      },
    }),
  },
}));

vi.mock('./api/settlements', () => ({
  __esModule: true,
  default: {
    listSettlements: vi.fn().mockResolvedValue({
      settlements: [],
      pagination: {
        page: 1,
        limit: 50,
        total: 0,
        total_pages: 1,
        has_next: false,
        has_previous: false,
      },
    }),
    createSettlement: vi.fn(),
    confirmSettlement: vi.fn(),
    rejectSettlement: vi.fn(),
  },
}));

// Kok adres ve giris sonrasi yonlendirmelerin hedefi artik /home; o sayfa da
// ozet cekiyor. Bu dosyanin derdi rota agaci oldugu icin ozet sabitleniyor.
vi.mock('./api/summary', () => ({
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

// `vi.mock` vitest tarafindan dosyanin en ustune tasinir, bu yuzden asagidaki
// import mock'lanmis modulu alir.
import authApi from './api/auth';
import groupsApi from './api/groups';

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

  /*
    Kok adres halka acik: guard yok, login formu yok. Onceki surumde `/`
    dogrudan /home'a (yani login'e) duserdi; tanitim sayfasinin varlik sebebi
    tam olarak bu.
  */
  it('kok adreste tanitim sayfasini gorur, login formunu degil', async () => {
    renderAt('/');

    expect(
      await screen.findByRole('heading', { name: /Arkadas hesabi, tartismaya donusmesin/ })
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Giris yap' })).not.toBeInTheDocument();
  });

  it('landing CTA kayit ekranina goturur', async () => {
    renderAt('/');

    fireEvent.click((await screen.findAllByRole('link', { name: /Hemen basla/ }))[0]);

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
  it('/login istedigi halde Home sayfasina yonlendirilir', async () => {
    signIn();
    renderAt('/login');

    expect(await screen.findByRole('heading', { name: 'Merhaba, Burak' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Giris yap' })).not.toBeInTheDocument();
  });

  it('/register de ayni sekilde korunur', async () => {
    signIn();
    renderAt('/register');

    expect(await screen.findByRole('heading', { name: 'Merhaba, Burak' })).toBeInTheDocument();
  });

  it('/groups sayfasinda kalir ve kullanici adini gorur', async () => {
    signIn();
    renderAt('/groups');

    expect(await screen.findByRole('heading', { name: 'Gruplar' })).toBeInTheDocument();
    // Kullanici adi Layout basliginda duruyor.
    expect(screen.getByText('Burak')).toBeInTheDocument();
  });

  /*
    Kok adres artik landing: giris yapmis kullanici da **ayni** sayfayi goruyor,
    yonlendirilmiyor. Paylasilan bir `/` linki herkeste ayni seyi acmali.
    Fark yalnizca butonda.
  */
  it('kok adreste landing gorunur, uygulamaya donus baglantisi tasir', async () => {
    signIn();
    renderAt('/');

    const back = await screen.findAllByRole('link', { name: 'Uygulamaya don' });

    expect(back[0]).toHaveAttribute('href', '/home');
    expect(screen.queryByRole('link', { name: 'Giris yap' })).not.toBeInTheDocument();
  });

  it('landing uzerinden uygulamaya donulebilir', async () => {
    signIn();
    renderAt('/');

    fireEvent.click((await screen.findAllByRole('link', { name: 'Uygulamaya don' }))[0]);

    expect(await screen.findByRole('heading', { name: 'Merhaba, Burak' })).toBeInTheDocument();
  });

  it('Home acikken gezinmeden Gruplar sayfasina gecilebilir', async () => {
    signIn();
    renderAt('/home');
    await screen.findByRole('heading', { name: 'Merhaba, Burak' });

    fireEvent.click(screen.getByRole('link', { name: 'Gruplar' }));

    expect(await screen.findByRole('heading', { name: 'Gruplar' })).toBeInTheDocument();
  });

  it('/groups/:id parametresi okunur', async () => {
    signIn();

    const groupId = '7f3d1c2a-0000-4000-8000-000000000001';

    vi.mocked(groupsApi).getGroup.mockResolvedValue({
      group: {
        id: groupId,
        name: 'Tatil Fonu',
        description: null,
        created_by: '11111111-1111-4111-8111-111111111111',
        created_at: '2026-08-01T10:00:00.000Z',
      },
      role: 'owner',
      members: [],
    });

    renderAt(`/groups/${groupId}`);

    // Rota parametresinin dogru okundugunun kaniti: o ID ile grup istendi ve
    // donen grubun adi ekranda.
    expect(await screen.findByRole('heading', { name: 'Tatil Fonu' })).toBeInTheDocument();
    expect(vi.mocked(groupsApi).getGroup).toHaveBeenCalledWith(groupId);
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
  it('normal kullanici /admin isteyince Home gorur', async () => {
    signIn('user');
    renderAt('/admin');

    expect(await screen.findByRole('heading', { name: 'Merhaba, Burak' })).toBeInTheDocument();
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
