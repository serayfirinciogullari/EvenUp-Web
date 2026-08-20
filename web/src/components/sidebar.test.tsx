import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from '../App';
import { AuthProvider } from '../context/AuthProvider';
import { SIDEBAR_STORAGE_KEY } from '../hooks/useSidebarCollapsed';
import { colorOfGroup } from '../utils/groupColor';

import type { GroupSummary, User } from '../types/models';

/**
 * Sol sidebar testleri.
 *
 * Ag katmani mock'lanir; sidebar'in kendisi, `AppDataProvider`, rota agaci ve
 * `localStorage` tabanli tercih gercek kod.
 *
 * Dosyanin uc asil derdi:
 *   1. sidebar **kendi istegini atmiyor** — sayfalarla ayni veriyi paylasiyor
 *   2. grup olusturunca liste tek `reload` ile tazeleniyor
 *   3. daralt/genislet tercihi kaliciligi ve dar halde adin kaybolmamasi
 */

vi.mock('../api/auth', () => ({
  __esModule: true,
  default: { login: vi.fn(), register: vi.fn(), getMe: vi.fn() },
}));

vi.mock('../api/groups', () => ({
  __esModule: true,
  default: {
    listGroups: vi.fn(),
    createGroup: vi.fn(),
    getGroup: vi.fn(),
    createInvite: vi.fn(),
    getGroupBalances: vi.fn(),
    setMemberNickname: vi.fn(),
  },
}));

vi.mock('../api/summary', () => ({
  __esModule: true,
  default: { getHomeSummary: vi.fn() },
}));

vi.mock('../api/expenses', () => ({
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

vi.mock('../api/settlements', () => ({
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

import authApi from '../api/auth';
import groupsApi from '../api/groups';
import summaryApi from '../api/summary';

const mockedAuth = vi.mocked(authApi);
const mockedGroups = vi.mocked(groupsApi);
const mockedSummary = vi.mocked(summaryApi);

const TOKEN_KEY = 'evenup.token';
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

const EV_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const TATIL_ID = 'bbbbbbbb-0000-4000-8000-000000000002';

const group = (over: Partial<GroupSummary> = {}): GroupSummary => ({
  id: EV_ID,
  name: 'Ev Arkadaslari',
  slug: 'ev-arkadaslari',
  description: null,
  created_by: ME_ID,
  created_at: '2026-08-01T10:00:00.000Z',
  role: 'owner',
  joined_at: '2026-08-01T10:00:00.000Z',
  member_count: 4,
  member_preview: [],
  has_pending_incoming: false,
  last_activity: null,
  ...over,
});

const renderApp = (path = '/home', user: User = me) => {
  window.localStorage.setItem(TOKEN_KEY, 'gecerli.jwt.token');
  mockedAuth.getMe.mockResolvedValue(user);

  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>
  );
};

const sidebar = () => screen.getByRole('complementary', { name: 'Kenar cubugu' });

const waitForSidebar = () => screen.findByRole('complementary', { name: 'Kenar cubugu' });

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();

  mockedGroups.listGroups.mockResolvedValue([
    group(),
    group({ id: TATIL_ID, name: 'Tatil', slug: 'tatil' }),
  ]);
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
  mockedSummary.getHomeSummary.mockResolvedValue({
    totalNetBalance: '0.00',
    monthlySpend: '0.00',
    activeGroupsCount: 2,
    pendingSettlementsCount: 0,
    unseenActivityCount: 0,
    pendingApprovals: [],
    pendingDebts: [],
  });
});

/* ------------------------------------------------------------ ana gezinme */

describe('Sidebar — gezinme', () => {
  it('dort ana hedefi tasir', async () => {
    renderApp();
    const nav = within(await waitForSidebar());

    expect(nav.getByRole('link', { name: 'Ana Sayfa' })).toHaveAttribute('href', '/home');
    expect(nav.getByRole('link', { name: 'Gruplarim' })).toHaveAttribute('href', '/groups');
    expect(nav.getByRole('link', { name: /Aktivite/ })).toHaveAttribute('href', '/activity');
    expect(nav.getByRole('link', { name: 'Ayarlar' })).toHaveAttribute('href', '/settings');
  });

  it('Admin baglantisi yalnizca admin kullanicida cikar', async () => {
    renderApp('/home', { ...me, role: 'admin' });

    expect(await within(await waitForSidebar()).findByRole('link', { name: 'Admin' })).toBeInTheDocument();
  });

  it('aktif sayfa isaretlenir', async () => {
    renderApp('/groups');
    const nav = within(await waitForSidebar());

    // `aria-current` React Router'dan geliyor; gorsel vurgu (zemin + sol
    // cizgi) ayni sinifa bagli (bkz. index.css `.sidebar__item--active`).
    await waitFor(() =>
      expect(nav.getByRole('link', { name: 'Gruplarim' })).toHaveAttribute('aria-current', 'page')
    );
    expect(nav.getByRole('link', { name: 'Ana Sayfa' })).not.toHaveAttribute('aria-current');
  });
});

/* ------------------------------------------------------------ grup listesi */

describe('Sidebar — grup kisayollari', () => {
  it('uye olunan gruplari renkli noktalariyla listeler', async () => {
    renderApp();

    const groupNav = await screen.findByRole('navigation', { name: 'Grup kisayollari' });
    const link = await within(groupNav).findByRole('link', { name: 'Ev Arkadaslari' });

    // Baglanti slug ile kuruluyor (bkz. utils/groupPath.ts) — uuid degil.
    expect(link).toHaveAttribute('href', '/groups/ev-arkadaslari');
    expect(within(groupNav).getByRole('link', { name: 'Tatil' })).toBeInTheDocument();

    // Renk grup id'sinden turetiliyor, sunucudan gelmiyor (utils/groupColor).
    const dot = link.querySelector('span[style]') as HTMLElement;
    expect(dot).toHaveStyle({ backgroundColor: colorOfGroup(EV_ID) });
  });

  it('kisayol dogrudan grup detayina goturur', async () => {
    mockedGroups.getGroup.mockResolvedValue({
      group: {
        id: EV_ID,
        name: 'Ev Arkadaslari',
        slug: 'ev-arkadaslari',
        description: null,
        created_by: ME_ID,
        created_at: '2026-08-01T10:00:00.000Z',
      },
      role: 'owner',
      members: [
        {
          user_id: ME_ID,
          name: 'Deniz',
          email: 'deniz@evenup.dev',
          role: 'owner',
          joined_at: '2026-08-01T10:00:00.000Z',
          nickname: null,
        },
      ],
    });

    renderApp();

    const groupNav = await screen.findByRole('navigation', { name: 'Grup kisayollari' });
    fireEvent.click(await within(groupNav).findByRole('link', { name: 'Tatil' }));

    // Baglanti slug ile kuruluyor (bkz. utils/groupPath.ts) — uuid degil.
    await waitFor(() => expect(mockedGroups.getGroup).toHaveBeenCalledWith('tatil'));
  });

  /*
    Paylasilan durumun asil sinavi: liste iki yerde gorunuyor ama tek kaynaktan
    besleniyor. Sidebar kendi istegini atsaydi bu sayi 2 olurdu ve grup
    olusturduktan sonra sidebar eski listede kalirdi.
  */
  it('sayfalarla ayni veriyi paylasir — grup listesi bir kez istenir', async () => {
    renderApp('/groups');
    await waitForSidebar();
    await screen.findByRole('heading', { name: 'Ortak hesap tuttugun gruplar' });

    expect(mockedGroups.listGroups).toHaveBeenCalledTimes(1);
    expect(mockedSummary.getHomeSummary).toHaveBeenCalledTimes(1);
  });

  it('yeni grup olusturulunca sidebar da tazelenir', async () => {
    mockedGroups.listGroups.mockResolvedValueOnce([group()]);
    mockedGroups.listGroups.mockResolvedValueOnce([
      group(),
      group({ id: TATIL_ID, name: 'Tatil', slug: 'tatil' }),
    ]);
    mockedGroups.createGroup.mockResolvedValue({
      id: TATIL_ID,
      name: 'Tatil',
      slug: 'tatil',
      description: null,
      created_by: ME_ID,
      created_at: '2026-08-15T10:00:00.000Z',
    });

    renderApp('/groups');

    const groupNav = await screen.findByRole('navigation', { name: 'Grup kisayollari' });
    await within(groupNav).findByRole('link', { name: 'Ev Arkadaslari' });
    expect(within(groupNav).queryByRole('link', { name: 'Tatil' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Yeni Grup' }));
    fireEvent.change(screen.getByLabelText('Grup adi'), { target: { value: 'Tatil' } });
    fireEvent.click(screen.getByRole('button', { name: 'Olustur' }));

    expect(await within(groupNav).findByRole('link', { name: 'Tatil' })).toBeInTheDocument();
    // Tek `reload`: sayfa ve sidebar ayni istekten besleniyor.
    expect(mockedGroups.listGroups).toHaveBeenCalledTimes(2);
  });
});

/* ------------------------------------------------------------------ rozet */

describe('Sidebar — bekleyen odeme + okunmamis aktivite rozeti', () => {
  it('bekleyen odeme varken Aktivite yaninda sayi gosterir', async () => {
    mockedSummary.getHomeSummary.mockResolvedValue({
      totalNetBalance: '0.00',
      monthlySpend: '0.00',
      activeGroupsCount: 2,
      pendingSettlementsCount: 3,
      unseenActivityCount: 0,
      pendingApprovals: [],
      pendingDebts: [],
    });

    renderApp();
    const nav = within(await waitForSidebar());

    const activity = await nav.findByRole('link', { name: /Aktivite/ });
    expect(within(activity).getByText('3')).toBeInTheDocument();
  });

  /*
    Iki sayi TEK rozette toplaniyor (bkz. docs/decisions/aktivite-okunma-sayaci.md):
    kullaniciya "Aktivite'de bakilacak bir sey var" tek bir sayi olarak gorunuyor.
  */
  it('onay bekleyen ve okunmamis aktivite toplanarak tek rozette gosterilir', async () => {
    mockedSummary.getHomeSummary.mockResolvedValue({
      totalNetBalance: '0.00',
      monthlySpend: '0.00',
      activeGroupsCount: 2,
      pendingSettlementsCount: 2,
      unseenActivityCount: 5,
      pendingApprovals: [],
      pendingDebts: [],
    });

    renderApp();
    const nav = within(await waitForSidebar());

    const activity = await nav.findByRole('link', { name: /Aktivite/ });
    expect(within(activity).getByText('7')).toBeInTheDocument();
  });

  it('yalnizca okunmamis aktivite varken (bekleyen onay yok) yine rozet gosterir', async () => {
    mockedSummary.getHomeSummary.mockResolvedValue({
      totalNetBalance: '0.00',
      monthlySpend: '0.00',
      activeGroupsCount: 2,
      pendingSettlementsCount: 0,
      unseenActivityCount: 4,
      pendingApprovals: [],
      pendingDebts: [],
    });

    renderApp();
    const nav = within(await waitForSidebar());

    const activity = await nav.findByRole('link', { name: /Aktivite/ });
    expect(within(activity).getByText('4')).toBeInTheDocument();
  });

  it('ikisi de sifirken rozet cizilmez', async () => {
    renderApp();
    const nav = within(await waitForSidebar());

    const activity = await nav.findByRole('link', { name: /Aktivite/ });
    expect(within(activity).queryByText('0')).not.toBeInTheDocument();
  });

  it('rozet ayni ozetten besleniyor — ikinci istek yok', async () => {
    renderApp('/home');
    await screen.findByRole('heading', { name: 'Merhaba, Deniz' });

    expect(mockedSummary.getHomeSummary).toHaveBeenCalledTimes(1);
  });
});

/* --------------------------------------------------------- daralt / genislet */

describe('Sidebar — daralt/genislet', () => {
  it('kontrol ustte, markanin yaninda duruyor', async () => {
    renderApp();
    const aside = await waitForSidebar();

    const toggle = screen.getByRole('button', { name: 'Daralt' });
    const nav = screen.getByRole('navigation', { name: 'Ana gezinme' });

    // Ust blogun icinde: liste uzadikca asagi kayan bir yerde degil.
    expect(aside.querySelector('.sidebar__head')?.contains(toggle)).toBe(true);
    expect(toggle.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it('daraltinca isimler gizlenir ama erisilebilir ad korunur', async () => {
    renderApp();
    await waitForSidebar();

    fireEvent.click(screen.getByRole('button', { name: 'Daralt' }));

    // Ad `sr-only` ile gizleniyor, kaldirilmiyor: rol sorgusu hala buluyor.
    expect(screen.getByRole('link', { name: 'Ana Sayfa' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Genislet' })).toBeInTheDocument();
  });

  it('tercih localStorage icinde kalici', async () => {
    renderApp();
    await waitForSidebar();

    fireEvent.click(screen.getByRole('button', { name: 'Daralt' }));

    expect(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe('collapsed');
  });

  it('kayitli tercih acilista uygulanir', async () => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, 'collapsed');

    renderApp();
    await waitForSidebar();

    // Ilk render dogrudan dar geliyor; "once genis cizip sonra daralt" yok.
    expect(screen.getByRole('button', { name: 'Genislet' })).toBeInTheDocument();
    expect(sidebar().className).toContain('w-16');
  });
});

/* --------------------------------------------------- yukseklik ve kaydirma */

describe('Sidebar — yukseklik ve kaydirma', () => {
  it('kap 100vh ve tek kaydirma alani; ic bloklarin kendi kaydirmasi yok', async () => {
    renderApp();
    const aside = await waitForSidebar();

    expect(aside.className).toContain('h-screen');
    expect(aside.className).toContain('overflow-y-auto');

    /*
      jsdom olcu hesaplamiyor, dolayisiyla "cubuk gorunuyor mu" olculemiyor.
      Olculebilen sey kuralin kendisi: kaydirma **yalnizca** kapta. Ic bir blok
      da `overflow` tasisaydi ic ice iki kaydirma alani olur ve icerik sigsa
      bile ikinci bir cubuk cikabilirdi.
    */
    expect(aside.querySelectorAll('[class*="overflow-y-auto"]')).toHaveLength(0);
  });

  /*
    Dar halde altta yatay bir cubuk cikiyordu: isim ipucu mutlak konumla
    sidebar'in disina tasiyordu ve `overflow-y: auto` verilen bir kapta CSS
    diger ekseni de `auto`ya cevirir. Ipucu artik yerel `title`, kap da
    `overflow-x-clip`.
  */
  it('dar halde yatay tasma yok — ipucu title ile veriliyor', async () => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, 'collapsed');

    renderApp();
    const aside = await waitForSidebar();

    expect(aside.className).toContain('overflow-x-clip');
    expect(aside.querySelector('.sidebar__tip')).toBeNull();

    // Ad hala okunabiliyor: gorsel ipucu `title`, erisilebilir ad `sr-only`.
    expect(screen.getByRole('link', { name: 'Ana Sayfa' })).toHaveAttribute('title', 'Ana Sayfa');
  });

  it('genis halde title yok — ad zaten satirda yaziyor', async () => {
    renderApp();
    await waitForSidebar();

    expect(screen.getByRole('link', { name: 'Ana Sayfa' })).not.toHaveAttribute('title');
  });

  it('bloklar arasinda itme yok — kullanici menusu grup listesinin hemen altinda', async () => {
    renderApp();
    const aside = await waitForSidebar();

    /*
      Kabin **dogrudan** cocuklarinda esneme/itme yok: `flex-1` bir blogu
      buyutur, `mt-auto` digerini dibe yapistirir. Ikisi de az grubu olan
      kullanicida sidebar'in ortasinda kocaman bir bosluk birakirdi.
      (Satir icindeki `flex-1`ler serbest — onlar metni tasiyor.)
    */
    Array.from(aside.children).forEach((block) => {
      expect(block.className).not.toMatch(/flex-1|mt-auto/);
    });

    const groupNav = screen.getByRole('navigation', { name: 'Grup kisayollari' });
    const trigger = screen.getByRole('button', { name: 'Hesap menusu' });

    // Menu, grup listesinden **sonra** ve onun kardesi: araya yayilan bir
    // bosluk ogesi girmiyor.
    expect(groupNav.compareDocumentPosition(trigger) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(groupNav.nextElementSibling?.contains(trigger)).toBe(true);
  });
});

/* ------------------------------------------------------------ hesap menusu */

describe('Sidebar — hesap menusu', () => {
  /** Radix menusu `pointerdown` ile aciliyor; `click` tek basina yetmiyor. */
  const openMenu = () => {
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Hesap menusu' }),
      new PointerEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: false })
    );
  };

  it('tek bir tetikleyici var — ayri tema/cikis ikonlari yok', async () => {
    renderApp();
    const aside = within(await waitForSidebar());

    expect(aside.getByRole('button', { name: 'Hesap menusu' })).toBeInTheDocument();
    // Menu kapaliyken bunlar ekranda durmuyor.
    expect(aside.queryByRole('button', { name: 'Cikis' })).not.toBeInTheDocument();
    expect(aside.queryByRole('button', { name: /temaya gec/ })).not.toBeInTheDocument();
  });

  it('acilinca tema ve cikis secenekleri cikar', async () => {
    renderApp();
    await waitForSidebar();

    openMenu();

    expect(await screen.findByRole('menuitem', { name: 'Koyu temaya gec' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Cikis' })).toBeInTheDocument();
  });

  it('tema secenegi tercihi degistirir', async () => {
    renderApp();
    await waitForSidebar();

    openMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Koyu temaya gec' }));

    await waitFor(() => expect(document.documentElement).toHaveClass('dark'));
  });

  it('cikis oturumu kapatir ve giris ekranina goturur', async () => {
    renderApp();
    await waitForSidebar();

    openMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Cikis' }));

    expect(await screen.findByRole('heading', { name: 'Giris yap' })).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ mobil */

describe('Sidebar — dar ekran', () => {
  it('hamburger sidebari acar, gezinince kapanir', async () => {
    renderApp();
    await waitForSidebar();

    const toggle = screen.getByRole('button', { name: 'Menuyu ac' });

    // Kapaliyken sidebar ekran disinda; DOM'da tek kopya var (iki ayri
    // sidebar cizilseydi her sorgu iki eslesme bulurdu).
    expect(screen.getAllByRole('complementary', { name: 'Kenar cubugu' })).toHaveLength(1);
    expect(sidebar().className).toContain('-translate-x-full');

    fireEvent.click(toggle);
    expect(sidebar().className).toContain('translate-x-0');

    fireEvent.click(screen.getByRole('link', { name: 'Ayarlar' }));

    await waitFor(() => expect(sidebar().className).toContain('-translate-x-full'));
  });
});
