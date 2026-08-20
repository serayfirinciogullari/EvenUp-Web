import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from '../App';
import { AuthProvider } from '../context/AuthProvider';
import { formatDate } from '../utils/datetime';

import type {
  AdminGroupListResult,
  AdminStats,
  AdminUserListResult,
  GroupMeta,
  User,
} from '../types/models';

/**
 * Admin paneli testleri.
 *
 * Yalnizca ag katmani mock'lanir (`api/auth`, `api/admin`); `useAsync`,
 * `useDebouncedValue`, `AdminRoute`, Radix Dialog ve Router gercek kod.
 *
 * Dosyanin iki asil derdi:
 *   1. yazma islemlerinin onay modalindan gecmesi (ve onaysiz istek atilmamasi)
 *   2. grup listesinin gercekten SALT OKUNUR olmasi — icerige giden hicbir
 *      baglanti, buton ya da alan bulunmamasi
 */
vi.mock('../api/auth', () => ({
  __esModule: true,
  default: { login: vi.fn(), register: vi.fn(), getMe: vi.fn() },
}));

// Admin olmayan kullanici 2.7'den beri /home'a duser; o sayfa ozet cekiyor.
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

// Home "Son hareketler" bu ucu cagiriyor (bkz. docs/decisions/3.15-home-son-hareketler.md).
vi.mock('../api/activity', () => ({
  __esModule: true,
  default: {
    listActivity: vi.fn().mockResolvedValue({
      events: [],
      pagination: { page: 1, limit: 5, total: 0, total_pages: 1, has_next: false, has_previous: false },
    }),
    markActivitySeen: vi.fn().mockResolvedValue(undefined),
  },
}));

/*
  Sidebar (Layout) grup kisayollarini paylasilan saglayicidan okuyor, yani her
  korunan sayfa `GET /groups` tetikliyor. Bu dosyanin derdi baska oldugu icin
  bos liste dondurecek sekilde sabitleniyor.
*/
vi.mock('../api/groups', () => ({
  __esModule: true,
  default: {
    listGroups: vi.fn().mockResolvedValue([]),
    createGroup: vi.fn(),
    getGroup: vi.fn(),
    createInvite: vi.fn(),
    getGroupBalances: vi.fn(),
    setMemberNickname: vi.fn(),
  },
}));

vi.mock('../api/admin', () => ({
  __esModule: true,
  default: {
    listUsers: vi.fn(),
    disableUser: vi.fn(),
    enableUser: vi.fn(),
    listGroups: vi.fn(),
    getStats: vi.fn(),
  },
}));

import adminApi from '../api/admin';
import authApi from '../api/auth';

const mockedAdmin = vi.mocked(adminApi);
const mockedAuth = vi.mocked(authApi);

/* ------------------------------------------------------------------ veri */

const TOKEN_KEY = 'evenup.token';
const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const DENIZ_ID = '22222222-2222-4222-8222-222222222222';
const ECE_ID = '33333333-3333-4333-8333-333333333333';

const admin: User = {
  id: ADMIN_ID,
  email: 'admin@evenup.dev',
  name: 'Admin Kullanici',
  role: 'admin',
  is_active: true,
  created_at: '2026-08-01T10:00:00.000Z',
  avatar: null,
  handle: null,
};

const deniz: User = {
  id: DENIZ_ID,
  email: 'deniz@evenup.dev',
  name: 'Deniz Kaya',
  role: 'user',
  is_active: true,
  created_at: '2026-08-02T10:00:00.000Z',
  avatar: null,
  handle: null,
};

const ece: User = {
  id: ECE_ID,
  email: 'ece@evenup.dev',
  name: 'Ece Demir',
  role: 'user',
  is_active: false,
  created_at: '2026-08-03T10:00:00.000Z',
  avatar: null,
  handle: null,
};

const stats: AdminStats = {
  users: { total: 4, active: 3, inactive: 1 },
  groups: { active: 2, deleted: 1 },
  expenses: { count: 3, volume: '720.00' },
  settlements: { confirmed_count: 1, confirmed_volume: '150.00' },
  trends: {
    last_7_days: { new_users: 2, new_groups: 1, expense_count: 3, expense_volume: '720.00' },
    last_30_days: { new_users: 4, new_groups: 2, expense_count: 3, expense_volume: '720.00' },
  },
};

const userPage = (
  users: User[],
  over: Partial<AdminUserListResult['pagination']> = {}
): AdminUserListResult => ({
  users,
  pagination: {
    page: 1,
    limit: 20,
    total: users.length,
    total_pages: 1,
    has_next: false,
    has_previous: false,
    ...over,
  },
});

const group = (over: Partial<GroupMeta> = {}): GroupMeta => ({
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'Ev Arkadaslari',
  created_at: '2026-08-01T10:00:00.000Z',
  member_count: 4,
  ...over,
});

const groupPage = (
  groups: GroupMeta[],
  over: Partial<AdminGroupListResult['pagination']> = {}
): AdminGroupListResult => ({
  groups,
  pagination: {
    page: 1,
    limit: 20,
    total: groups.length,
    total_pages: 1,
    has_next: false,
    has_previous: false,
    ...over,
  },
});

const apiError = (statusCode: number, message: string) =>
  Object.assign(new Error(message), {
    isAxiosError: true,
    response: { status: statusCode, data: { status: 'error', statusCode, message } },
  });

/* ------------------------------------------------------------ yardimcilar */

const renderAdmin = (as: User = admin) => {
  window.localStorage.setItem(TOKEN_KEY, 'gecerli.jwt.token');
  mockedAuth.getMe.mockResolvedValue(as);

  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>
  );
};

const waitForPage = () => screen.findByRole('heading', { name: 'Admin' });

/*
  Bloklar bolume gore sorgulaniyor: "Admin Kullanici" hem Layout basliginda
  (giris yapan kisi) hem tabloda geciyor, "Sonraki" ise iki tabloda birden
  olabilir. Bolum kapsami olmadan bu sorgular yanlis ogeyi bulur.
*/
const usersSection = () =>
  screen.getByRole('heading', { name: 'Kullanicilar' }).closest('section') as HTMLElement;

const groupsSection = () =>
  screen.getByRole('heading', { name: 'Gruplar' }).closest('section') as HTMLElement;

/** Kullanici tablosundaki satiri ada gore bulur. */
const userRow = async (name: string) => {
  const cell = await within(usersSection()).findByText(name);
  return cell.closest('tr') as HTMLElement;
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();

  mockedAdmin.getStats.mockResolvedValue(stats);
  mockedAdmin.listUsers.mockResolvedValue(userPage([admin, deniz, ece]));
  mockedAdmin.listGroups.mockResolvedValue(groupPage([group()]));
});

/* ========================================================== erisim (2.1) */

describe('erisim', () => {
  it('admin olmayan kullanici panele giremez', async () => {
    renderAdmin({ ...deniz, role: 'user' });

    // AdminRoute 2.7'den beri /home'a yonlendirir; admin istekleri hic atilmaz.
    expect(await screen.findByRole('heading', { name: `Merhaba, ${deniz.name}` })).toBeInTheDocument();
    expect(mockedAdmin.getStats).not.toHaveBeenCalled();
    expect(mockedAdmin.listUsers).not.toHaveBeenCalled();
  });

  it('admin panel acilir ve uc blok da veri ister', async () => {
    renderAdmin();
    await waitForPage();

    await waitFor(() => expect(mockedAdmin.getStats).toHaveBeenCalledTimes(1));
    expect(mockedAdmin.listUsers).toHaveBeenCalledWith({
      search: undefined,
      page: 1,
      limit: 20,
    });
    expect(mockedAdmin.listGroups).toHaveBeenCalledWith({
      search: undefined,
      page: 1,
      limit: 20,
    });
  });
});

/* ============================================================ istatistik */

describe('ozet istatistik kartlari', () => {
  it('toplam kullanici, aktif grup ve islem hacmi gosterilir', async () => {
    renderAdmin();
    await waitForPage();

    // Sayilar `NumberTicker` icinde ve metni bir abonelik yaziyor (imperatif,
    // render disinda). `getBy*` o ani ornekler; yuklu makinede kare gecikirse
    // test degeri "yok" sanabilir. `findBy*` bekliyor — iddia ayni.
    const total = (await screen.findByText('Toplam kullanici')).closest('article') as HTMLElement;
    expect(await within(total).findByText('4')).toBeInTheDocument();
    expect(within(total).getByText('3 aktif · 1 pasif')).toBeInTheDocument();

    const groups = screen.getByText('Aktif grup').closest('article') as HTMLElement;
    expect(await within(groups).findByText('2')).toBeInTheDocument();
    expect(within(groups).getByText('1 silinmis grup haric')).toBeInTheDocument();

    const volume = screen.getByText('Toplam islem hacmi').closest('article') as HTMLElement;
    // NUMERIC metni ("720.00") kurus uzerinden bicimlendirilir.
    expect(await within(volume).findByText('720,00 ₺')).toBeInTheDocument();
    expect(within(volume).getByText('3 harcama')).toBeInTheDocument();
  });

  it('yuklenirken iskelet gosterilir', async () => {
    mockedAdmin.getStats.mockReturnValue(new Promise(() => {}));

    renderAdmin();

    expect(await screen.findByLabelText('Istatistikler yukleniyor')).toBeInTheDocument();
  });

  it('hata durumunda tekrar dene istegi yeniler', async () => {
    mockedAdmin.getStats.mockRejectedValueOnce(apiError(500, 'Sunucu hatasi'));
    mockedAdmin.getStats.mockResolvedValueOnce(stats);

    renderAdmin();
    await waitForPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Sunucu hatasi');

    fireEvent.click(within(alert).getByRole('button', { name: 'Tekrar dene' }));

    expect(await screen.findByText('Toplam kullanici')).toBeInTheDocument();
    expect(mockedAdmin.getStats).toHaveBeenCalledTimes(2);
  });

  it('bozuk hacim degeri 0 olarak gosterilmez', async () => {
    mockedAdmin.getStats.mockResolvedValue({
      ...stats,
      expenses: { count: 3, volume: 'bozuk' },
    });

    renderAdmin();
    await waitForPage();

    expect(await screen.findByText('Bilinmiyor')).toBeInTheDocument();
    expect(screen.queryByText('0,00 ₺')).not.toBeInTheDocument();
  });
});

/* ====================================================== kullanici tablosu */

describe('kullanici tablosu', () => {
  it('satirlar rol ve durum bilgisiyle listelenir', async () => {
    renderAdmin();
    await waitForPage();

    const denizRow = await userRow('Deniz Kaya');
    expect(within(denizRow).getByText('deniz@evenup.dev')).toBeInTheDocument();
    expect(within(denizRow).getByText('Aktif')).toBeInTheDocument();
    expect(within(denizRow).getByText(formatDate(deniz.created_at))).toBeInTheDocument();

    const eceRow = await userRow('Ece Demir');
    // Durum yalnizca renkle degil metinle de yazili.
    expect(within(eceRow).getByText('Pasif')).toBeInTheDocument();
    expect(within(eceRow).getByRole('button', { name: /aktiflestir/i })).toBeInTheDocument();

    const adminRow = await userRow('Admin Kullanici');
    expect(within(adminRow).getByText('Admin')).toBeInTheDocument();
  });

  it('admin kendi satirinda kapatma butonu gormez', async () => {
    renderAdmin();
    await waitForPage();

    const adminRow = await userRow('Admin Kullanici');

    expect(within(adminRow).getByText('Kendi hesabin')).toBeInTheDocument();
    expect(within(adminRow).queryByRole('button')).not.toBeInTheDocument();
  });

  it('kullanici bulunamadiginda arama terimi ile birlikte soylenir', async () => {
    mockedAdmin.listUsers.mockResolvedValue(userPage([]));

    renderAdmin();
    await waitForPage();

    fireEvent.change(await screen.findByLabelText('E-posta ya da isim ara'), {
      target: { value: 'yok' },
    });

    expect(await screen.findByText('"yok" icin kullanici bulunamadi.')).toBeInTheDocument();
  });
});

/* ================================================================ arama */

describe('arama', () => {
  it('terim sunucuya gonderilir (istemcide filtrelenmez)', async () => {
    renderAdmin();
    await waitForPage();

    fireEvent.change(screen.getByLabelText('E-posta ya da isim ara'), {
      target: { value: 'ece' },
    });

    await waitFor(() =>
      expect(mockedAdmin.listUsers).toHaveBeenLastCalledWith({
        search: 'ece',
        page: 1,
        limit: 20,
      })
    );
  });

  it('her tus vurusu ayri istek atmaz', async () => {
    renderAdmin();
    await waitForPage();
    await waitFor(() => expect(mockedAdmin.listUsers).toHaveBeenCalledTimes(1));

    const input = screen.getByLabelText('E-posta ya da isim ara');
    fireEvent.change(input, { target: { value: 'e' } });
    fireEvent.change(input, { target: { value: 'ec' } });
    fireEvent.change(input, { target: { value: 'ece' } });

    await waitFor(() =>
      expect(mockedAdmin.listUsers).toHaveBeenLastCalledWith({
        search: 'ece',
        page: 1,
        limit: 20,
      })
    );

    // Ilk yukleme + gecikmeden sonra tek istek.
    expect(mockedAdmin.listUsers).toHaveBeenCalledTimes(2);
  });

  it('arama degisince sayfa basa doner', async () => {
    mockedAdmin.listUsers.mockResolvedValue(
      userPage([deniz], { page: 1, total: 40, total_pages: 2, has_next: true })
    );

    renderAdmin();
    await waitForPage();

    await screen.findByText('Sayfa 1 / 2 · toplam 40 kullanici');
    fireEvent.click(within(usersSection()).getByRole('button', { name: 'Sonraki' }));
    await waitFor(() =>
      expect(mockedAdmin.listUsers).toHaveBeenLastCalledWith({
        search: undefined,
        page: 2,
        limit: 20,
      })
    );

    fireEvent.change(screen.getByLabelText('E-posta ya da isim ara'), {
      target: { value: 'deniz' },
    });

    // 2. sayfada kalinsaydi filtrelenmis sonuc cogu zaman bos gorunurdu.
    await waitFor(() =>
      expect(mockedAdmin.listUsers).toHaveBeenLastCalledWith({
        search: 'deniz',
        page: 1,
        limit: 20,
      })
    );
  });
});

/* =========================================================== sayfalama */

describe('sayfalama', () => {
  it('ilk sayfada Onceki kapalidir', async () => {
    mockedAdmin.listUsers.mockResolvedValue(
      userPage([deniz], { page: 1, total: 40, total_pages: 2, has_next: true })
    );

    renderAdmin();
    await waitForPage();

    expect(await screen.findByText('Sayfa 1 / 2 · toplam 40 kullanici')).toBeInTheDocument();

    const section = within(usersSection());
    expect(section.getByRole('button', { name: 'Onceki' })).toBeDisabled();
    expect(section.getByRole('button', { name: 'Sonraki' })).toBeEnabled();
  });

  it('son sayfada Sonraki kapalidir', async () => {
    mockedAdmin.listUsers.mockResolvedValue(
      userPage([deniz], { page: 2, total: 40, total_pages: 2, has_previous: true })
    );

    renderAdmin();
    await waitForPage();

    await screen.findByText('Sayfa 2 / 2 · toplam 40 kullanici');
    expect(within(usersSection()).getByRole('button', { name: 'Sonraki' })).toBeDisabled();
  });
});

/* ==================================================== onay modali + yazma */

describe('devre disi birakma onayi', () => {
  const openDisableDialog = async () => {
    const row = await userRow('Deniz Kaya');
    fireEvent.click(within(row).getByRole('button', { name: /devre disi birak/i }));
    return screen.findByRole('dialog');
  };

  it('buton dogrudan istek atmaz, once onay sorar', async () => {
    renderAdmin();
    await waitForPage();

    const dialog = await openDisableDialog();

    expect(
      within(dialog).getByText(/devre disi birakmak istediginize emin misiniz\?/i)
    ).toBeInTheDocument();
    // Onay verilmeden hicbir yazma istegi gitmemeli.
    expect(mockedAdmin.disableUser).not.toHaveBeenCalled();
  });

  it('modalda hangi hesabin kapatildigi yazar', async () => {
    renderAdmin();
    await waitForPage();

    const dialog = await openDisableDialog();

    expect(within(dialog).getByText(/Deniz Kaya \(deniz@evenup.dev\)/)).toBeInTheDocument();
    // Geri alinabilir olmasi metinde soyleniyor: gecmis veri silinmiyor.
    expect(within(dialog).getByText(/gecmis harcamalari ve bakiyeleri oldugu gibi kalir/)).toBeInTheDocument();
  });

  it('vazgecince istek atilmaz', async () => {
    renderAdmin();
    await waitForPage();

    const dialog = await openDisableDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Vazgec' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockedAdmin.disableUser).not.toHaveBeenCalled();
  });

  it('onaylayinca istek atilir, liste ve ozet tazelenir', async () => {
    mockedAdmin.disableUser.mockResolvedValue({
      user: { ...deniz, is_active: false },
      changed: true,
    });

    renderAdmin();
    await waitForPage();
    await waitFor(() => expect(mockedAdmin.listUsers).toHaveBeenCalledTimes(1));

    const dialog = await openDisableDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Devre disi birak' }));

    await waitFor(() => expect(mockedAdmin.disableUser).toHaveBeenCalledWith(DENIZ_ID));
    // Satir elle guncellenmiyor: liste yeniden isteniyor.
    await waitFor(() => expect(mockedAdmin.listUsers).toHaveBeenCalledTimes(2));
    // Aktif/pasif sayilari degistigi icin ozet de tazeleniyor.
    await waitFor(() => expect(mockedAdmin.getStats).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('hata durumunda modal kapanmaz ve mesaj icinde gosterilir', async () => {
    mockedAdmin.disableUser.mockRejectedValue(
      apiError(400, 'Kendi hesabinizi devre disi birakamazsiniz')
    );

    renderAdmin();
    await waitForPage();

    const dialog = await openDisableDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Devre disi birak' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Kendi hesabinizi devre disi birakamazsiniz'
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('pasif kullanici icin aktiflestirme onayi ayri metin kullanir', async () => {
    mockedAdmin.enableUser.mockResolvedValue({ user: { ...ece, is_active: true }, changed: true });

    renderAdmin();
    await waitForPage();

    const row = await userRow('Ece Demir');
    fireEvent.click(within(row).getByRole('button', { name: /aktiflestir/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/yeniden aktiflestirmek istediginize emin misiniz\?/i)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Aktiflestir' }));

    await waitFor(() => expect(mockedAdmin.enableUser).toHaveBeenCalledWith(ECE_ID));
    expect(mockedAdmin.disableUser).not.toHaveBeenCalled();
  });
});

/* ================================================= SALT OKUNUR grup listesi */

describe('grup listesi salt okunur', () => {
  it('yalnizca ad, uye sayisi ve tarih gosterilir', async () => {
    renderAdmin();
    await waitForPage();

    const section = groupsSection();
    const row = (await within(section).findByText('Ev Arkadaslari')).closest(
      'tr'
    ) as HTMLElement;

    expect(within(row).getByText('4 uye')).toBeInTheDocument();
    expect(within(row).getByText(formatDate(group().created_at))).toBeInTheDocument();
    // Satirda tam olarak uc hucre var: dorduncu bir "detay" sutunu yok.
    expect(row.querySelectorAll('td')).toHaveLength(3);
  });

  it('grup adi link degil ve satirda hicbir aksiyon yok', async () => {
    renderAdmin();
    await waitForPage();

    const section = groupsSection();
    await within(section).findByText('Ev Arkadaslari');

    // Icerige gidecek bir yol yok: ne link, ne buton (sayfalama butonlari
    // toplam 1 sayfada gorunmez, liste tek sayfa).
    expect(within(section).queryByRole('link')).not.toBeInTheDocument();
    expect(
      within(section).queryByRole('button', { name: /harcama|detay|goruntule|ac/i })
    ).not.toBeInTheDocument();
  });

  it('gizlilik notu ekranda kalici olarak yazili', async () => {
    renderAdmin();
    await waitForPage();

    const section = groupsSection();

    expect(within(section).getByText(/Grup icerigi admin icin gizlidir/)).toBeInTheDocument();
    // Kapatilabilir bir bildirim degil: kapatma dugmesi yok.
    expect(within(section).queryByRole('button', { name: /kapat/i })).not.toBeInTheDocument();
  });

  it('satir ipucu ayni cumleyi tekrar eder', async () => {
    renderAdmin();
    await waitForPage();

    const section = groupsSection();
    const row = (await within(section).findByText('Ev Arkadaslari')).closest(
      'tr'
    ) as HTMLElement;

    expect(row).toHaveAttribute('title', expect.stringContaining('Grup icerigi admin icin gizlidir'));
  });

  it('cevapta harcama bilgisi tasiyan hicbir metin gorunmez', async () => {
    // Backend zaten donmuyor; bu test arayuzun kendi kendine bir sey
    // uydurmadigini (ornegin "0,00 ₺ hacim") gosteriyor.
    renderAdmin();
    await waitForPage();

    const section = groupsSection();
    await within(section).findByText('Ev Arkadaslari');

    expect(section.textContent).not.toMatch(/₺/);
    expect(section.textContent).not.toMatch(/harcama sayisi|bakiye/i);
  });

  it('grup aramasi da sunucuya gider', async () => {
    renderAdmin();
    await waitForPage();

    fireEvent.change(screen.getByLabelText('Grup adi ara'), { target: { value: 'tatil' } });

    await waitFor(() =>
      expect(mockedAdmin.listGroups).toHaveBeenLastCalledWith({
        search: 'tatil',
        page: 1,
        limit: 20,
      })
    );
  });

  it('grup listesi hatasi kullanici tablosunu etkilemez', async () => {
    mockedAdmin.listGroups.mockRejectedValue(apiError(500, 'Gruplar alinamadi'));

    renderAdmin();
    await waitForPage();

    expect(await screen.findByText('Gruplar alinamadi')).toBeInTheDocument();
    // Kullanici tablosu calismaya devam ediyor.
    expect(await userRow('Deniz Kaya')).toBeInTheDocument();
  });
});

/* ==================================================== birim: tarih bicimi */

describe('tarih bicimi (birim)', () => {
  it('tablo hucresi tam tarih yazar, "bugun" demez', () => {
    expect(formatDate(new Date(2026, 7, 15, 9, 5).toISOString())).toBe('15 Agustos 2026');
    expect(formatDate(new Date(2025, 11, 31, 23, 59).toISOString())).toBe('31 Aralik 2025');
    expect(formatDate('bozuk')).toBe('Tarih bilinmiyor');
  });
});
