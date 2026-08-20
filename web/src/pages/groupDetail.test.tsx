import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from '../App';
import { AuthProvider } from '../context/AuthProvider';
import { formatExpenseDate } from '../utils/datetime';
import { parseInputToCents } from '../utils/money';
import { equalShares, validateCount, validateExact, toSplitDetails } from '../utils/split';
import { dative } from '../utils/turkish';

import type {
  BalanceResult,
  Expense,
  ExpenseListResult,
  GroupDetail,
  SettlementListResult,
  SettlementView,
  User,
} from '../types/models';

/**
 * Grup detay ekrani testleri.
 *
 * Yalnizca ag katmani mock'lanir (`api/auth`, `api/groups`, `api/expenses`,
 * `api/settlements`). `useAsync`, `useExpenseFeed`, `utils/split`,
 * `utils/money`, `utils/turkish`, Radix sekmeleri ve React Router gercek kod.
 *
 * Dosyanin asil derdi iki sey:
 *   1. bolusme formunun ANLIK toplam dogrulamasi (eksik/fazla/tam)
 *   2. uctan uca akis: harcama ekle -> bakiye guncellenir -> ode -> onayla
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
    joinGroup: vi.fn(),
    getGroupBalances: vi.fn(),
    setMemberNickname: vi.fn(),
    updateGroup: vi.fn(),
    deleteGroup: vi.fn(),
    removeMember: vi.fn(),
  },
}));

/*
  Sidebar (Layout) bekleyen odeme rozetini paylasilan saglayicidan okuyor,
  yani her korunan sayfa bu ucu tetikliyor. Bu dosyanin derdi baska oldugu
  icin cevap sabitleniyor; mock'lanmasaydi testler gercek bir istek denerdi.
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
import summaryApi from '../api/summary';

const mockedAuth = vi.mocked(authApi);
const mockedGroups = vi.mocked(groupsApi);
const mockedExpenses = vi.mocked(expensesApi);
const mockedSettlements = vi.mocked(settlementsApi);
const mockedSummary = vi.mocked(summaryApi);

/* ------------------------------------------------------------------ veri */

const TOKEN_KEY = 'evenup.token';
const GROUP_ID = 'gggggggg-0000-4000-8000-000000000001';
const ME_ID = '11111111-1111-4111-8111-111111111111';
const ECE_ID = '22222222-2222-4222-8222-222222222222';
const ALI_ID = '33333333-3333-4333-8333-333333333333';

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

const groupDetail: GroupDetail = {
  group: {
    id: GROUP_ID,
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
    {
      user_id: ECE_ID,
      name: 'Ece',
      email: 'ece@evenup.dev',
      role: 'member',
      joined_at: '2026-08-01T10:00:00.000Z',
      nickname: null,
    },
    {
      user_id: ALI_ID,
      name: 'Ali',
      email: 'ali@evenup.dev',
      role: 'member',
      joined_at: '2026-08-01T10:00:00.000Z',
      nickname: null,
    },
  ],
};

const expense = (over: Partial<Expense> = {}): Expense => ({
  id: 'eeeeeeee-0000-4000-8000-000000000001',
  group_id: GROUP_ID,
  paid_by: ECE_ID,
  created_by: ECE_ID,
  amount: '90.00',
  description: 'Market alisverisi',
  category: 'market',
  split_type: 'equal',
  created_at: '2026-08-14T10:00:00.000Z',
  updated_at: '2026-08-14T10:00:00.000Z',
  payer_name: 'Ece',
  creator_name: 'Ece',
  shares: [
    { user_id: ME_ID, name: 'Deniz', share_amount: '30.00' },
    { user_id: ECE_ID, name: 'Ece', share_amount: '30.00' },
    { user_id: ALI_ID, name: 'Ali', share_amount: '30.00' },
  ],
  ...over,
});

const expensePage = (
  expenses: Expense[],
  over: Partial<ExpenseListResult['pagination']> = {}
): ExpenseListResult => ({
  expenses,
  pagination: {
    page: 1,
    limit: 10,
    total: expenses.length,
    total_pages: 1,
    has_next: false,
    has_previous: false,
    ...over,
  },
});

/** Deniz 30 borclu, Ece 30 alacakli. */
const owingBalances: BalanceResult = {
  balances: [
    { user_id: ECE_ID, name: 'Ece', net_balance: '30.00' },
    { user_id: ME_ID, name: 'Deniz', net_balance: '-30.00' },
  ],
  transfers: [{ from_user: ME_ID, to_user: ECE_ID, amount: '30.00' }],
  meta: {
    expense_count: 1,
    confirmed_settlement_count: 0,
    pending_settlement_count: 0,
    rejected_settlement_count: 0,
    algorithm: 'optimal',
  },
};

/** Herkes dengede. */
const settledBalances: BalanceResult = {
  balances: [
    { user_id: ECE_ID, name: 'Ece', net_balance: '0.00' },
    { user_id: ME_ID, name: 'Deniz', net_balance: '0.00' },
  ],
  transfers: [],
  meta: {
    expense_count: 1,
    confirmed_settlement_count: 1,
    pending_settlement_count: 0,
    rejected_settlement_count: 0,
    algorithm: 'optimal',
  },
};

const settlement = (over: Partial<SettlementView> = {}): SettlementView => ({
  id: 'ssssssss-0000-4000-8000-000000000001',
  group_id: GROUP_ID,
  from_user: ALI_ID,
  to_user: ME_ID,
  from_name: 'Ali',
  to_name: 'Deniz',
  amount: '45.00',
  status: 'pending',
  created_at: '2026-08-15T09:00:00.000Z',
  confirmed_at: null,
  rejected_at: null,
  ...over,
});

const settlementPage = (settlements: SettlementView[]): SettlementListResult => ({
  settlements,
  pagination: {
    page: 1,
    limit: 50,
    total: settlements.length,
    total_pages: 1,
    has_next: false,
    has_previous: false,
  },
});

const apiError = (statusCode: number, message: string, details?: Record<string, string>) =>
  Object.assign(new Error(message), {
    isAxiosError: true,
    response: { status: statusCode, data: { status: 'error', statusCode, message, details } },
  });

/* ------------------------------------------------------------- yardimcilar */

const renderDetail = () => {
  window.localStorage.setItem(TOKEN_KEY, 'gecerli.jwt.token');
  mockedAuth.getMe.mockResolvedValue(me);

  return render(
    <MemoryRouter initialEntries={[`/groups/${GROUP_ID}`]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>
  );
};

/** Grup basligi gelene kadar bekle: sayfanin hazir oldugunun isareti. */
const waitForPage = async () => screen.findByRole('heading', { name: 'Ev Arkadaslari' });

/**
 * Sekme degistirir.
 *
 * `click` degil `mouseDown`: Radix sekmeyi **mousedown** aninda degistiriyor
 * (gercek kullanicida da secim tusa basar basmaz oluyor). `fireEvent.click`
 * mousedown uretmedigi icin sekme sessizce degismezdi.
 */
const selectTab = (name: RegExp | string) => {
  fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0 });
};

const openBalances = async () => {
  await waitForPage();
  selectTab(/Odemeler/);
  return screen.findByText('Kim kime odeyecek');
};

const openExpenseModal = async () => {
  await waitForPage();
  fireEvent.click(screen.getByRole('button', { name: 'Harcama Ekle' }));
  return screen.findByRole('dialog');
};

/** Modal'da ortak alanlari doldurur. */
const fillBasics = (amount: string, description = 'Yemek') => {
  fireEvent.change(screen.getByLabelText('Aciklama'), { target: { value: description } });
  fireEvent.change(screen.getByLabelText('Tutar (₺)'), { target: { value: amount } });
};

const chooseSplit = (label: string) => {
  fireEvent.click(screen.getByLabelText(label));
};

const submitExpense = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Ekle' }));
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();

  mockedGroups.getGroup.mockResolvedValue(groupDetail);
  mockedGroups.getGroupBalances.mockResolvedValue(owingBalances);
  mockedExpenses.listExpenses.mockResolvedValue(expensePage([expense()]));
  mockedSettlements.listSettlements.mockResolvedValue(settlementPage([]));
});

/* ============================================================== sekmeler */

describe('sekmeli gorunum', () => {
  it('uc sekme gosterilir ve varsayilan Harcamalar', async () => {
    renderDetail();
    await waitForPage();

    expect(screen.getByRole('tab', { name: 'Harcamalar' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByRole('tab', { name: /Odemeler/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Kisiler' })).toBeInTheDocument();
    expect(screen.getByText('Market alisverisi')).toBeInTheDocument();
  });

  it('Odemeler sekmesine gecilebilir', async () => {
    renderDetail();
    await openBalances();

    expect(screen.getByRole('tab', { name: /Odemeler/ })).toHaveAttribute('data-state', 'active');
  });

  it('onay bekleyen kayit sayisi sekmede rozet olarak gorunur', async () => {
    mockedSettlements.listSettlements.mockResolvedValue(settlementPage([settlement()]));

    renderDetail();
    await waitForPage();

    // Ali -> Deniz bekleyen odeme: onaylamasi gereken kisi Deniz.
    const tab = await screen.findByRole('tab', { name: /Odemeler/ });
    await waitFor(() => expect(within(tab).getByText('1')).toBeInTheDocument());
  });

  it('grup bulunamazsa hata gosterilir', async () => {
    mockedGroups.getGroup.mockRejectedValue(apiError(403, 'Bu gruba erisim yetkiniz yok'));

    renderDetail();

    expect(await screen.findByRole('alert')).toHaveTextContent('Bu gruba erisim yetkiniz yok');
  });
});

/* ======================================================= kisiler sekmesi */

describe('kisiler sekmesi — takma isimler', () => {
  const openMembers = async () => {
    await waitForPage();
    selectTab('Kisiler');
    // E-posta yerine turetilmis @handle gosteriliyor (bkz. MembersTab.handleOf).
    return screen.findByText('@ece');
  };

  /*
    Sorgular sekme panelinin **icine** kapsanmali: "Deniz" ayni anda Layout
    basliginda da (giris yapan kisi) geciyor ve kapsamsiz sorgu iki oge bulur.
  */
  const panel = () => screen.getByRole('tabpanel');

  /** Bir uyenin satirini adindan bulur. */
  const rowOf = (name: string) =>
    within(panel()).getByText(name).closest('li') as HTMLElement;

  /**
   * Satirdaki "..." menusunu acar. Radix menusu `pointerdown` ile aciliyor,
   * `click` tek basina yetmiyor (bkz. Sidebar — hesap menusu testleri).
   * Menu icerigi bir Portal'da rendered olur, satirin **disinda**; bu yuzden
   * acildiktan sonraki sorgular `within(rowOf(...))` degil `screen` uzerinden.
   */
  const openRowMenu = (displayName: string) => {
    fireEvent.pointerDown(
      within(rowOf(displayName)).getByRole('button', { name: `${displayName} icin islemler` }),
      new PointerEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: false })
    );
  };

  it('uyeler adi, handle i ve rolu ile listelenir', async () => {
    renderDetail();
    await openMembers();

    const list = within(panel());

    expect(list.getByText('Deniz')).toBeInTheDocument();
    expect(list.getByText('Ece')).toBeInTheDocument();
    expect(list.getByText('Ali')).toBeInTheDocument();
    expect(list.getByText('@deniz')).toBeInTheDocument();
    expect(list.getByText('@ali')).toBeInTheDocument();
    expect(within(rowOf('Deniz')).getByText('Sahip')).toBeInTheDocument();
  });

  it('istekte bulunan kendi satirinda Sen rozeti gorur', async () => {
    renderDetail();
    await openMembers();

    expect(within(rowOf('Deniz')).getByText('Sen')).toBeInTheDocument();
  });

  it('takma ismi olmayan uyede menude "Takma isim ver" yazar', async () => {
    renderDetail();
    await openMembers();

    openRowMenu('Ece');

    expect(
      await screen.findByRole('menuitem', { name: 'Takma isim ver' })
    ).toBeInTheDocument();
  });

  it('takma isim kaydedilir ve uc nokta dogru cagrilir', async () => {
    mockedGroups.setMemberNickname.mockResolvedValue({
      user_id: ECE_ID,
      nickname: 'Ev Arkadasi',
    });

    renderDetail();
    await openMembers();

    openRowMenu('Ece');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Takma isim ver' }));

    fireEvent.change(screen.getByLabelText('Ece icin takma isim'), {
      target: { value: 'Ev Arkadasi' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Takma ismi kaydet' }));

    await waitFor(() =>
      expect(mockedGroups.setMemberNickname).toHaveBeenCalledWith(
        GROUP_ID,
        ECE_ID,
        'Ev Arkadasi'
      )
    );
  });

  it('kaydettikten sonra grup detayi ve bakiye yeniden istenir', async () => {
    mockedGroups.setMemberNickname.mockResolvedValue({ user_id: ECE_ID, nickname: 'Ev Arkadasi' });

    renderDetail();
    await openMembers();

    const detailCallsBefore = mockedGroups.getGroup.mock.calls.length;
    const balanceCallsBefore = mockedGroups.getGroupBalances.mock.calls.length;

    openRowMenu('Ece');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Takma isim ver' }));
    fireEvent.change(screen.getByLabelText('Ece icin takma isim'), {
      target: { value: 'Ev Arkadasi' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Takma ismi kaydet' }));

    // Adlar bakiye satirlarinda da geciyor; ikisi ayri istek, ikisi de eskiyor.
    await waitFor(() =>
      expect(mockedGroups.getGroup.mock.calls.length).toBeGreaterThan(detailCallsBefore)
    );
    await waitFor(() =>
      expect(mockedGroups.getGroupBalances.mock.calls.length).toBeGreaterThan(balanceCallsBefore)
    );
  });

  it('takma isim varsa gercek ad kaybolmuyor, altta duruyor', async () => {
    mockedGroups.getGroup.mockResolvedValue({
      ...groupDetail,
      members: groupDetail.members.map((member) =>
        member.user_id === ECE_ID ? { ...member, nickname: 'Ev Arkadasi' } : member
      ),
    });

    renderDetail();
    await waitForPage();
    selectTab('Kisiler');

    const row = (await screen.findByText('Ev Arkadasi')).closest('li') as HTMLElement;

    // Gorunen ad takma isim, ama gercek ad ve @handle yaninda.
    expect(within(row).getByText(/Ece · @ece/)).toBeInTheDocument();

    openRowMenu('Ev Arkadasi');
    expect(
      await screen.findByRole('menuitem', { name: 'Takma adi degistir' })
    ).toBeInTheDocument();
  });

  it('bos birakip kaydetmek takma ismi kaldirir', async () => {
    mockedGroups.getGroup.mockResolvedValue({
      ...groupDetail,
      members: groupDetail.members.map((member) =>
        member.user_id === ECE_ID ? { ...member, nickname: 'Ev Arkadasi' } : member
      ),
    });
    mockedGroups.setMemberNickname.mockResolvedValue({ user_id: ECE_ID, nickname: null });

    renderDetail();
    await waitForPage();
    selectTab('Kisiler');
    await screen.findByText('Ev Arkadasi');

    openRowMenu('Ev Arkadasi');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Takma adi degistir' }));
    fireEvent.change(screen.getByLabelText('Ece icin takma isim'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Takma ismi kaydet' }));

    await waitFor(() =>
      expect(mockedGroups.setMemberNickname).toHaveBeenCalledWith(GROUP_ID, ECE_ID, '')
    );
  });

  it('vazgecmek istegi hic baslatmaz', async () => {
    renderDetail();
    await openMembers();

    openRowMenu('Ece');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Takma isim ver' }));
    fireEvent.change(screen.getByLabelText('Ece icin takma isim'), {
      target: { value: 'Yazildi ama vazgecildi' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Vazgec' }));

    expect(mockedGroups.setMemberNickname).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Ece icin takma isim')).not.toBeInTheDocument();
  });

  /* ---------------------------------------------------- uyeyi gruptan cikar */

  it('owner olmayan hedefte "Gruptan cikar" menude YOK (kendi satirinda)', async () => {
    renderDetail();
    await openMembers();

    // Deniz (owner) kendi satirinda kendini cikaramaz — backend zaten
    // reddeder (group.service.removeMember), buton hic gosterilmiyor.
    openRowMenu('Deniz');

    expect(
      await screen.findByRole('menuitem', { name: 'Takma isim ver' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Gruptan cikar' })).not.toBeInTheDocument();
  });

  it('owner baska bir uyeyi gruptan cikarabilir', async () => {
    mockedGroups.removeMember.mockResolvedValue({ removed_user_id: ECE_ID });

    renderDetail();
    await openMembers();

    openRowMenu('Ece');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Gruptan cikar' }));

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cikar' }));

    await waitFor(() =>
      expect(mockedGroups.removeMember).toHaveBeenCalledWith(GROUP_ID, ECE_ID)
    );
  });

  it('cikarma onaylanmadan istek atilmaz', async () => {
    renderDetail();
    await openMembers();

    openRowMenu('Ece');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Gruptan cikar' }));

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Vazgec' }));

    expect(mockedGroups.removeMember).not.toHaveBeenCalled();
  });

  it('takma isim bakiye satirlarinda da gorunur', async () => {
    // Backend bakiye adlarina takma ismi kendisi uyguluyor; arayuz onu
    // oldugu gibi gosteriyor.
    mockedGroups.getGroupBalances.mockResolvedValue({
      ...owingBalances,
      balances: owingBalances.balances.map((balance) =>
        balance.user_id === ECE_ID ? { ...balance, name: 'Ev Arkadasi' } : balance
      ),
    });

    renderDetail();
    await openBalances();

    expect(screen.getAllByText(/Ev Arkadasi/).length).toBeGreaterThan(0);
  });
});

/* ====================================================== harcama listesi */

describe('harcamalar sekmesi', () => {
  it('satirda kim odedi, ne kadar ve senin payin yazili', async () => {
    renderDetail();
    await waitForPage();

    const row = screen.getByText('Market alisverisi').closest('li') as HTMLElement;

    expect(within(row).getByText(/Ece odedi/)).toBeInTheDocument();
    expect(within(row).getByText('90,00 ₺')).toBeInTheDocument();
    expect(within(row).getByText('Senin payin 30,00 ₺')).toBeInTheDocument();
    expect(within(row).getByText('market')).toBeInTheDocument();
  });

  it('kendi odedigin harcamada "Sen odedin" yazar', async () => {
    mockedExpenses.listExpenses.mockResolvedValue(
      expensePage([expense({ paid_by: ME_ID, payer_name: 'Deniz' })])
    );

    renderDetail();
    await waitForPage();

    expect(await screen.findByText(/Sen odedin/)).toBeInTheDocument();
  });

  it('harcama yoksa bos durum gosterilir', async () => {
    mockedExpenses.listExpenses.mockResolvedValue(expensePage([]));

    renderDetail();
    await waitForPage();

    expect(await screen.findByText('Bu grupta henuz harcama yok.')).toBeInTheDocument();
  });

  it('liste hatasi bos durumdan ayri gosterilir', async () => {
    mockedExpenses.listExpenses.mockRejectedValue(apiError(500, 'Sunucu hatasi'));

    renderDetail();
    await waitForPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Sunucu hatasi');
    expect(screen.queryByText('Bu grupta henuz harcama yok.')).not.toBeInTheDocument();
  });
});

/* ======================================================== sayfalama */

describe('sayfalama', () => {
  it('daha fazla yukle ikinci sayfayi listeye ekler', async () => {
    const second = expense({
      id: 'eeeeeeee-0000-4000-8000-000000000002',
      description: 'Tren bileti',
    });

    mockedExpenses.listExpenses.mockResolvedValueOnce(
      expensePage([expense()], { total: 2, total_pages: 2, has_next: true })
    );
    mockedExpenses.listExpenses.mockResolvedValueOnce({
      expenses: [second],
      pagination: {
        page: 2,
        limit: 10,
        total: 2,
        total_pages: 2,
        has_next: false,
        has_previous: true,
      },
    });

    renderDetail();
    await waitForPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Daha fazla yukle' }));

    // Ekleme: ilk sayfa ekranda kaliyor.
    expect(await screen.findByText('Tren bileti')).toBeInTheDocument();
    expect(screen.getByText('Market alisverisi')).toBeInTheDocument();
    expect(mockedExpenses.listExpenses).toHaveBeenLastCalledWith(GROUP_ID, {
      page: 2,
      limit: 10,
    });
  });

  it('son sayfada buton gosterilmez', async () => {
    renderDetail();
    await waitForPage();

    expect(screen.queryByRole('button', { name: 'Daha fazla yukle' })).not.toBeInTheDocument();
    expect(screen.getByText('1 / 1 harcama')).toBeInTheDocument();
  });
});

/* ============================================ harcama ekleme: esit bolme */

describe('harcama ekleme - esit bolme', () => {
  it('yalnizca kimler dahil listesi gosterilir, tutar alani yok', async () => {
    renderDetail();
    await openExpenseModal();

    expect(screen.getByLabelText('Ece dahil')).toBeChecked();
    expect(screen.queryByLabelText('Ece tutari')).not.toBeInTheDocument();
  });

  it('kisi basi tutar aninda onizlenir ve kurus artigi dagitilir', async () => {
    renderDetail();
    await openExpenseModal();

    fillBasics('100');

    // 100,00 / 3 = 33,34 + 33,33 + 33,33 (artik en kucuk userId'ye).
    await waitFor(() => expect(screen.getByText('33,34 ₺')).toBeInTheDocument());
    expect(screen.getAllByText('33,33 ₺')).toHaveLength(2);
  });

  it('secim kaldirilinca onizleme yeniden hesaplanir', async () => {
    renderDetail();
    await openExpenseModal();

    fillBasics('100');
    fireEvent.click(screen.getByLabelText('Ali dahil'));

    await waitFor(() =>
      expect(screen.getByText('2 kisi arasinda esit bolunuyor')).toBeInTheDocument()
    );
    expect(screen.getAllByText('50,00 ₺')).toHaveLength(2);
  });

  it('kimse secili degilse istek atilmaz', async () => {
    renderDetail();
    await openExpenseModal();

    fillBasics('100');
    for (const name of ['Deniz', 'Ece', 'Ali']) {
      fireEvent.click(screen.getByLabelText(`${name} dahil`));
    }

    submitExpense();

    expect(await screen.findByRole('alert')).toHaveTextContent('En az bir kisi secilmeli');
    expect(mockedExpenses.createExpense).not.toHaveBeenCalled();
  });

  it('dogru govde ile gonderilir', async () => {
    mockedExpenses.createExpense.mockResolvedValue(expense());

    renderDetail();
    await openExpenseModal();

    fillBasics('100', 'Pizza');
    fireEvent.change(screen.getByLabelText('Kim odedi'), { target: { value: ECE_ID } });
    fireEvent.change(screen.getByLabelText('Kategori'), { target: { value: 'yemek' } });
    submitExpense();

    await waitFor(() =>
      expect(mockedExpenses.createExpense).toHaveBeenCalledWith(GROUP_ID, {
        amount: '100.00',
        description: 'Pizza',
        category: 'yemek',
        paidBy: ECE_ID,
        splitType: 'equal',
        splitDetails: { participants: [ME_ID, ECE_ID, ALI_ID] },
      })
    );
  });
});

/* =========================================== harcama ekleme: ozel tutar */

describe('harcama ekleme - ozel tutar (anlik toplam)', () => {
  it('eksik toplam ANINDA gosterilir ve istek atilmaz', async () => {
    renderDetail();
    await openExpenseModal();

    fillBasics('100');
    chooseSplit('Ozel tutar');

    fireEvent.change(screen.getByLabelText('Deniz tutari'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Ece tutari'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('Ali tutari'), { target: { value: '8' } });

    // Hicbir istek atilmadan, tusa basildigi anda.
    expect(await screen.findByText('42,00 ₺ eksik')).toBeInTheDocument();

    submitExpense();

    expect(mockedExpenses.createExpense).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent('42,00 ₺ eksik');
  });

  it('fazla toplam da yonuyle birlikte soylenir', async () => {
    renderDetail();
    await openExpenseModal();

    fillBasics('50');
    chooseSplit('Ozel tutar');

    fireEvent.change(screen.getByLabelText('Deniz tutari'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Ece tutari'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Ali tutari'), { target: { value: '0' } });

    expect(await screen.findByText('10,00 ₺ fazla')).toBeInTheDocument();
  });

  it('toplam tutunca gonderilir ve paylar kurus kaybi olmadan gider', async () => {
    mockedExpenses.createExpense.mockResolvedValue(expense());

    renderDetail();
    await openExpenseModal();

    fillBasics('100', 'Tatil');
    chooseSplit('Ozel tutar');

    fireEvent.change(screen.getByLabelText('Deniz tutari'), { target: { value: '33,34' } });
    fireEvent.change(screen.getByLabelText('Ece tutari'), { target: { value: '33.33' } });
    fireEvent.change(screen.getByLabelText('Ali tutari'), { target: { value: '33.33' } });

    // Virgul ve nokta ayni sekilde okunuyor; float toplaminda 100.00000000000001
    // olan girdi kurusta tam tutuyor.
    expect(await screen.findByText('Toplam tutuyor: 100,00 ₺')).toBeInTheDocument();

    submitExpense();

    await waitFor(() =>
      expect(mockedExpenses.createExpense).toHaveBeenCalledWith(
        GROUP_ID,
        expect.objectContaining({
          splitType: 'exact',
          splitDetails: {
            shares: [
              { userId: ME_ID, amount: '33.34' },
              { userId: ECE_ID, amount: '33.33' },
              { userId: ALI_ID, amount: '33.33' },
            ],
          },
        })
      )
    );
  });

  it('"Esit dagit" alanlari doldurur ve toplam tutar', async () => {
    renderDetail();
    await openExpenseModal();

    fillBasics('100');
    chooseSplit('Ozel tutar');
    fireEvent.click(screen.getByRole('button', { name: 'Esit dagit' }));

    await waitFor(() => expect(screen.getByLabelText('Deniz tutari')).toHaveValue('33.34'));
    expect(screen.getByText('Toplam tutuyor: 100,00 ₺')).toBeInTheDocument();
  });

  it('tutar girilmeden pay yazilirsa hedef bilinmedigi soylenir', async () => {
    renderDetail();
    await openExpenseModal();

    chooseSplit('Ozel tutar');

    expect(await screen.findByText('Once harcama tutarini gir')).toBeInTheDocument();
  });
});

/* ============================================ harcama ekleme: kaca bol */

describe('harcama ekleme - kaca bol', () => {
  it('once bolen sayisi sorulur, varsayilan 2 ve secim bos baslar', async () => {
    renderDetail();
    await openExpenseModal();

    chooseSplit('Kaca Bol');

    expect(screen.getByLabelText('Kaca bolunsun?')).toHaveValue('2');
    // "Esit"teki isaretler sizmiyor: bu liste kendi secimini tutuyor.
    expect(screen.getByLabelText('Deniz secili')).not.toBeChecked();
    expect(await screen.findByText('2 kisiye bolunecek: 2 kisi daha sec')).toBeInTheDocument();
  });

  it('bolen sayisi grup uye sayisina kadar secilebilir', async () => {
    renderDetail();
    await openExpenseModal();

    chooseSplit('Kaca Bol');

    // Uc kisilik grup: 2 ve 3. "1 kisi" bolusme degil, "4 kisi" grupta yok.
    const options = within(screen.getByLabelText('Kaca bolunsun?'))
      .getAllByRole('option')
      .map((option) => option.textContent);

    expect(options).toEqual(['2 kisi', '3 kisi']);
  });

  it('eksik secim istegi durdurur', async () => {
    renderDetail();
    await openExpenseModal();

    fillBasics('100');
    chooseSplit('Kaca Bol');
    fireEvent.change(screen.getByLabelText('Kaca bolunsun?'), { target: { value: '3' } });
    fireEvent.click(screen.getByLabelText('Deniz secili'));
    fireEvent.click(screen.getByLabelText('Ece secili'));

    expect(await screen.findByText('3 kisiye bolunecek: 1 kisi daha sec')).toBeInTheDocument();

    submitExpense();

    expect(mockedExpenses.createExpense).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent('1 kisi daha sec');
  });

  it('fazla secim de kabul edilmez', async () => {
    renderDetail();
    await openExpenseModal();

    fillBasics('100');
    chooseSplit('Kaca Bol');

    for (const name of ['Deniz', 'Ece', 'Ali']) {
      fireEvent.click(screen.getByLabelText(`${name} secili`));
    }

    // Bolen 2, secim 3.
    expect(
      await screen.findByText('2 kisiye bolunecek: 1 kisinin isaretini kaldir')
    ).toBeInTheDocument();

    submitExpense();
    expect(mockedExpenses.createExpense).not.toHaveBeenCalled();
  });

  it('kisi basi tutar yalnizca secim tamamlaninca gosterilir', async () => {
    renderDetail();
    await openExpenseModal();

    fillBasics('100');
    chooseSplit('Kaca Bol');
    fireEvent.click(screen.getByLabelText('Deniz secili'));

    // Tek kisi isaretliyken "100,00 ₺" yazmak, kaydedilmeyecek bir tutari
    // kaydedilecekmis gibi gosterirdi.
    expect(screen.queryByText('100,00 ₺')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Ece secili'));

    await waitFor(() => expect(screen.getAllByText('50,00 ₺')).toHaveLength(2));
  });

  it('tam secimde ESIT bolusme govdesiyle gonderilir', async () => {
    mockedExpenses.createExpense.mockResolvedValue(expense());

    renderDetail();
    await openExpenseModal();

    fillBasics('100', 'Tasi');
    chooseSplit('Kaca Bol');
    fireEvent.click(screen.getByLabelText('Ece secili'));
    fireEvent.click(screen.getByLabelText('Ali secili'));

    expect(await screen.findByText('2 kisi arasinda esit bolunuyor')).toBeInTheDocument();

    submitExpense();

    // Backend'de "kaca bol" diye bir tip yok: istek `equal` + katilimci listesi.
    await waitFor(() =>
      expect(mockedExpenses.createExpense).toHaveBeenCalledWith(
        GROUP_ID,
        expect.objectContaining({
          splitType: 'equal',
          splitDetails: { participants: [ECE_ID, ALI_ID] },
        })
      )
    );
  });

  it('mod degistirmek "Esit" secimini bozmuyor', async () => {
    renderDetail();
    await openExpenseModal();

    fillBasics('100');
    chooseSplit('Kaca Bol');
    fireEvent.click(screen.getByLabelText('Ece secili'));
    chooseSplit('Esit');

    // "Esit" listesi acildigi gibi duruyor: uc kisi de dahil.
    for (const name of ['Deniz', 'Ece', 'Ali']) {
      expect(screen.getByLabelText(`${name} dahil`)).toBeChecked();
    }
    expect(screen.getByText('3 kisi arasinda esit bolunuyor')).toBeInTheDocument();
  });

  it('yuzde secenegi kaldirildi', async () => {
    renderDetail();
    await openExpenseModal();

    expect(screen.queryByLabelText('Yuzde')).not.toBeInTheDocument();
  });
});

/* ===================================================== form dogrulama */

describe('harcama formu alan dogrulamasi', () => {
  it('aciklama bos birakilamaz', async () => {
    renderDetail();
    await openExpenseModal();

    fireEvent.change(screen.getByLabelText('Tutar (₺)'), { target: { value: '10' } });
    submitExpense();

    expect(await screen.findByText('Aciklama zorunlu')).toBeInTheDocument();
    expect(mockedExpenses.createExpense).not.toHaveBeenCalled();
  });

  it('bozuk tutar reddedilir', async () => {
    renderDetail();
    await openExpenseModal();

    fillBasics('1.005');
    submitExpense();

    expect(
      await screen.findByText('Tutar en fazla iki ondalikli pozitif bir sayi olmali')
    ).toBeInTheDocument();
    expect(mockedExpenses.createExpense).not.toHaveBeenCalled();
  });

  it('backend hatasi modalda gosterilir ve modal kapanmaz', async () => {
    mockedExpenses.createExpense.mockRejectedValue(
      apiError(400, 'Gecersiz harcama bilgileri', { amount: 'Tutar sifirdan buyuk olmali' })
    );

    renderDetail();
    await openExpenseModal();

    fillBasics('100', 'Pizza');
    submitExpense();

    expect(await screen.findByRole('alert')).toHaveTextContent('Gecersiz harcama bilgileri');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('ayni anda gelen ikinci gonderim elenir', async () => {
    let resolve!: (value: Expense) => void;
    mockedExpenses.createExpense.mockReturnValue(
      new Promise<Expense>((res) => {
        resolve = res;
      })
    );

    renderDetail();
    await openExpenseModal();

    fillBasics('100', 'Pizza');

    const form = screen.getByRole('dialog').querySelector('form');

    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(mockedExpenses.createExpense).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve(expense());
    });
  });
});

/* ========================================================= bakiyeler */

describe('bakiyeler sekmesi', () => {
  it('transfer satiri okunabilir cumle olarak yazilir', async () => {
    renderDetail();
    await openBalances();

    expect(screen.getByText("Sen Ece'ye 30,00 ₺ borclusun")).toBeInTheDocument();
  });

  it('alacakli oldugun satirda "sana borclu" yazar ve Ode butonu cikmaz', async () => {
    mockedGroups.getGroupBalances.mockResolvedValue({
      ...owingBalances,
      transfers: [{ from_user: ECE_ID, to_user: ME_ID, amount: '30.00' }],
    });

    renderDetail();
    await openBalances();

    expect(screen.getByText('Ece sana 30,00 ₺ borclu')).toBeInTheDocument();
    // Kaydi yalnizca borclu acabilir; alacakliya buton gosterilmez.
    expect(screen.queryByRole('button', { name: 'Ode' })).not.toBeInTheDocument();
  });

  it('taraf olmadigin transfer ucuncu sahis cumlesi olur', async () => {
    mockedGroups.getGroupBalances.mockResolvedValue({
      ...owingBalances,
      transfers: [{ from_user: ALI_ID, to_user: ECE_ID, amount: '12.50' }],
    });

    renderDetail();
    await openBalances();

    expect(screen.getByText("Ali, Ece'ye 12,50 ₺ borclu")).toBeInTheDocument();
  });

  it('borc yoksa hesabin kapali oldugu yazilir', async () => {
    mockedGroups.getGroupBalances.mockResolvedValue(settledBalances);

    renderDetail();
    await openBalances();

    expect(screen.getByText(/Tum hesaplar kapali/)).toBeInTheDocument();
  });

  it('bakiye hatasi ayri gosterilir', async () => {
    mockedGroups.getGroupBalances.mockRejectedValue(apiError(500, 'Bakiye hesaplanamadi'));

    renderDetail();
    await waitForPage();
    selectTab(/Odemeler/);

    expect(await screen.findByRole('alert')).toHaveTextContent('Bakiye hesaplanamadi');
  });
});

/* ================================================= odeme isaretleme */

describe('odeme isaretleme', () => {
  it('Ode butonu onerilen tutarla modal acar ve kayit olusturur', async () => {
    mockedSettlements.createSettlement.mockResolvedValue(
      settlement({ from_user: ME_ID, to_user: ECE_ID, amount: '30.00' })
    );

    renderDetail();
    await openBalances();

    fireEvent.click(screen.getByRole('button', { name: 'Ode' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Tutar (₺)')).toHaveValue('30.00');
    expect(within(dialog).getByText(/Ece'ye odedigini bildiriyorsun/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Odedim' }));

    await waitFor(() =>
      expect(mockedSettlements.createSettlement).toHaveBeenCalledWith(GROUP_ID, {
        toUserId: ECE_ID,
        amount: '30.00',
      })
    );
  });

  it('kismi odeme icin tutar degistirilebilir', async () => {
    mockedSettlements.createSettlement.mockResolvedValue(settlement());

    renderDetail();
    await openBalances();

    fireEvent.click(screen.getByRole('button', { name: 'Ode' }));

    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Tutar (₺)'), { target: { value: '10' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Odedim' }));

    await waitFor(() =>
      expect(mockedSettlements.createSettlement).toHaveBeenCalledWith(GROUP_ID, {
        toUserId: ECE_ID,
        amount: '10.00',
      })
    );
  });

  it('bekleyen kayit varsa backend 409 mesaji gosterilir', async () => {
    mockedSettlements.createSettlement.mockRejectedValue(
      apiError(409, 'Bu kisiye bekleyen bir odeme kaydiniz zaten var')
    );

    renderDetail();
    await openBalances();

    fireEvent.click(screen.getByRole('button', { name: 'Ode' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Odedim' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('bekleyen bir odeme kaydiniz');
  });
});

/* ============================================== onay / red (alacakli) */

describe('bekleyen odemeyi onaylama ve reddetme', () => {
  it('alacakli tarafa Onayla/Reddet gosterilir', async () => {
    mockedSettlements.listSettlements.mockResolvedValue(settlementPage([settlement()]));

    renderDetail();
    await openBalances();

    expect(screen.getByText(/Ali sana 45,00 ₺ odedigini bildirdi/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Onayla' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reddet' })).toBeInTheDocument();
  });

  it('borclu tarafta buton degil "onay bekleniyor" yazar', async () => {
    mockedSettlements.listSettlements.mockResolvedValue(
      settlementPage([
        settlement({ from_user: ME_ID, to_user: ECE_ID, from_name: 'Deniz', to_name: 'Ece' }),
      ])
    );

    renderDetail();
    await openBalances();

    expect(screen.getByText(/Ece'ye 45,00 ₺ odedigini bildirdin/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Onayla' })).not.toBeInTheDocument();
    expect(screen.getByText('Onay bekleniyor')).toBeInTheDocument();
  });

  it('onaylayinca istek atilir ve bakiye yeniden istenir', async () => {
    mockedSettlements.listSettlements.mockResolvedValue(settlementPage([settlement()]));
    mockedSettlements.confirmSettlement.mockResolvedValue({
      ...settlement(),
      status: 'confirmed',
    });

    renderDetail();
    await openBalances();

    const balanceCallsBefore = mockedGroups.getGroupBalances.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Onayla' }));

    await waitFor(() =>
      expect(mockedSettlements.confirmSettlement).toHaveBeenCalledWith(settlement().id)
    );
    await waitFor(() =>
      expect(mockedGroups.getGroupBalances.mock.calls.length).toBeGreaterThan(balanceCallsBefore)
    );
  });

  it('reddetme ayri uc noktaya gider', async () => {
    mockedSettlements.listSettlements.mockResolvedValue(settlementPage([settlement()]));
    mockedSettlements.rejectSettlement.mockResolvedValue({
      ...settlement(),
      status: 'rejected',
    });

    renderDetail();
    await openBalances();

    fireEvent.click(screen.getByRole('button', { name: 'Reddet' }));

    await waitFor(() =>
      expect(mockedSettlements.rejectSettlement).toHaveBeenCalledWith(settlement().id)
    );
  });

  it('onay hatasi satirda gosterilir', async () => {
    mockedSettlements.listSettlements.mockResolvedValue(settlementPage([settlement()]));
    mockedSettlements.confirmSettlement.mockRejectedValue(
      apiError(409, 'Bu odeme kaydi zaten onaylanmis; durumu tekrar degistirilemez')
    );

    renderDetail();
    await openBalances();

    fireEvent.click(screen.getByRole('button', { name: 'Onayla' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('zaten onaylanmis');
  });

  /* ================================== sidebar rozeti (optimistic-ui-duzeltme) */

  it('Onayla sidebar rozetini SUNUCUYA SORMADAN yerelde 1 azaltir', async () => {
    mockedSummary.getHomeSummary.mockResolvedValue({
      totalNetBalance: '0.00',
      monthlySpend: '0.00',
      activeGroupsCount: 1,
      pendingSettlementsCount: 2,
      unseenActivityCount: 0,
    });
    mockedSettlements.listSettlements.mockResolvedValue(settlementPage([settlement()]));
    mockedSettlements.confirmSettlement.mockResolvedValue({ ...settlement(), status: 'confirmed' });

    renderDetail();
    await openBalances();

    const sidebarLink = () => screen.getByRole('link', { name: /Aktivite/ });
    expect(within(sidebarLink()).getByText('2')).toBeInTheDocument();

    const summaryCallsBefore = mockedSummary.getHomeSummary.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Onayla' }));

    await waitFor(() => expect(within(sidebarLink()).getByText('1')).toBeInTheDocument());

    // Azalma yerel: `GET /users/me/home-summary` tekrar cagirilmadi.
    expect(mockedSummary.getHomeSummary.mock.calls.length).toBe(summaryCallsBefore);
  });

  it('Reddet de sidebar rozetini yerelde 1 azaltir', async () => {
    mockedSummary.getHomeSummary.mockResolvedValue({
      totalNetBalance: '0.00',
      monthlySpend: '0.00',
      activeGroupsCount: 1,
      pendingSettlementsCount: 1,
      unseenActivityCount: 0,
    });
    mockedSettlements.listSettlements.mockResolvedValue(settlementPage([settlement()]));
    mockedSettlements.rejectSettlement.mockResolvedValue({ ...settlement(), status: 'rejected' });

    renderDetail();
    await openBalances();

    const sidebarLink = () => screen.getByRole('link', { name: /Aktivite/ });
    expect(within(sidebarLink()).getByText('1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reddet' }));

    // Rozet tamamen kalkar (0 -> hic rozet cizilmez, bkz. Sidebar.tsx).
    await waitFor(() => expect(within(sidebarLink()).queryByText('1')).not.toBeInTheDocument());
  });

  it("sayfayi acip bakmak rozeti DEGISTIRMEZ — yalnizca Onayla/Reddet degistirir", async () => {
    mockedSummary.getHomeSummary.mockResolvedValue({
      totalNetBalance: '0.00',
      monthlySpend: '0.00',
      activeGroupsCount: 1,
      pendingSettlementsCount: 2,
      unseenActivityCount: 0,
    });
    mockedSettlements.listSettlements.mockResolvedValue(settlementPage([settlement()]));

    renderDetail();
    await openBalances();

    const sidebarLink = () => screen.getByRole('link', { name: /Aktivite/ });
    expect(within(sidebarLink()).getByText('2')).toBeInTheDocument();

    // Sekmeler arasi gezinme — Onayla/Reddet'e hic basilmadi. `@ece` Kisiler
    // sekmesine ozgu (bkz. MembersTab.handleOf); "Deniz" sidebar'da da gectigi
    // icin `findByText('Deniz')` birden fazla eslesme verirdi.
    selectTab('Kisiler');
    await screen.findByText('@ece');
    selectTab(/Odemeler/);
    await screen.findByText('Kim kime odeyecek');

    expect(within(sidebarLink()).getByText('2')).toBeInTheDocument();
    // Ozet oturum basina TEK istekle geldi (AppDataProvider); sayfa gezintisi
    // ikinci bir istek uretmedi.
    expect(mockedSummary.getHomeSummary).toHaveBeenCalledTimes(1);
  });
});

/* ================================================ KRITIK: uctan uca akis */

describe('KRITIK akis: harcama -> bakiye -> odeme -> onay', () => {
  it('harcama eklenince liste ve bakiye yeniden istenir', async () => {
    mockedExpenses.listExpenses.mockResolvedValue(expensePage([]));
    mockedGroups.getGroupBalances.mockResolvedValueOnce(settledBalances);
    mockedExpenses.createExpense.mockResolvedValue(expense());

    renderDetail();
    await waitForPage();

    // Ekleme sonrasi sunucunun donecegi yeni durum.
    mockedExpenses.listExpenses.mockResolvedValue(expensePage([expense()]));
    mockedGroups.getGroupBalances.mockResolvedValue(owingBalances);

    fireEvent.click(screen.getByRole('button', { name: 'Harcama Ekle' }));
    await screen.findByRole('dialog');
    fillBasics('90', 'Market alisverisi');
    submitExpense();

    // Liste elle guncellenmiyor: yeniden isteniyor (offset sayfalamada elle
    // ekleme, biriken sayfalarla sirayi bozardi).
    await waitFor(() => expect(mockedExpenses.listExpenses).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mockedGroups.getGroupBalances).toHaveBeenCalledTimes(2));

    // Bakiye ekranda da guncellendi.
    selectTab(/Odemeler/);
    expect(await screen.findByText("Sen Ece'ye 30,00 ₺ borclusun")).toBeInTheDocument();
  });

  it('bekleyen odeme IYIMSER olarak isleniyor: transfer satiri aninda kalkar, bekleyen listeye aninda eklenir', async () => {
    mockedSettlements.listSettlements.mockResolvedValueOnce(settlementPage([]));
    mockedSettlements.createSettlement.mockResolvedValue(
      settlement({
        from_user: ME_ID,
        to_user: ECE_ID,
        from_name: 'Deniz',
        to_name: 'Ece',
        amount: '30.00',
      })
    );

    renderDetail();
    await openBalances();
    expect(screen.getByText("Sen Ece'ye 30,00 ₺ borclusun")).toBeInTheDocument();

    const balanceCallsBefore = mockedGroups.getGroupBalances.mock.calls.length;
    const settlementListCallsBefore = mockedSettlements.listSettlements.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Ode' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Odedim' }));

    // Bekleyen odemeler listesine sunucuya sormadan, ANINDA ekleniyor
    // (docs/decisions/optimistic-ui-duzeltme.md).
    expect(await screen.findByText(/Ece'ye 30,00 ₺ odedigini bildirdin/)).toBeInTheDocument();

    // "Sayfa yenilenmeden": ne bakiye ne bekleyen liste sunucudan yeniden
    // istendi — ikisi de yalnizca yerel `mutate` ile guncellendi.
    expect(mockedGroups.getGroupBalances.mock.calls.length).toBe(balanceCallsBefore);
    expect(mockedSettlements.listSettlements.mock.calls.length).toBe(settlementListCallsBefore);

    // Transfer satiri da ANINDA kalkiyor: backend zaten ayni cifte ikinci bir
    // bekleyen kayda izin vermiyor (409), yani "Ode" butonu bu satirda tekrar
    // calismayacakti — satirin kalkmasi bunu gorunur kiliyor. Bu, ONCEKI
    // surumden BILINCLI bir davranis degisikligi: eskiden tam yeniden istek
    // atildigi icin (ve bekleyen kayit bakiyeyi etkilemedigi icin, 1.7) satir
    // sunucudan ayni sekilde geri geliyordu; simdi hic yeniden istek atilmiyor.
    expect(screen.queryByText("Sen Ece'ye 30,00 ₺ borclusun")).not.toBeInTheDocument();

    // Bu tarafta onay/red butonu yok; kaydi alacakli kapatir.
    expect(screen.queryByRole('button', { name: 'Onayla' })).not.toBeInTheDocument();

    // Ikinci bir "Ode" istegi de atilmadi: transfer satiri (ve butonu) artik yok.
    expect(mockedSettlements.createSettlement).toHaveBeenCalledTimes(1);
  });

  /**
   * Ayni akisin **alacakli** ucu: onay bu tarafta veriliyor ve bakiyeyi
   * degistiren adim tam olarak burasi. Borclu tarafinda ekran ancak karsi taraf
   * onayladiktan sonra tazelendiginde degisir (acik madde: canli bildirim yok).
   */
  it('onaylayinca bakiye sifirlanir ve bekleyen kayit listeden duser', async () => {
    const incoming = settlement({
      from_user: ALI_ID,
      to_user: ME_ID,
      from_name: 'Ali',
      to_name: 'Deniz',
      amount: '45.00',
    });

    mockedGroups.getGroupBalances.mockResolvedValueOnce({
      ...owingBalances,
      balances: [
        { user_id: ME_ID, name: 'Deniz', net_balance: '45.00' },
        { user_id: ALI_ID, name: 'Ali', net_balance: '-45.00' },
      ],
      transfers: [{ from_user: ALI_ID, to_user: ME_ID, amount: '45.00' }],
    });
    mockedSettlements.listSettlements.mockResolvedValueOnce(settlementPage([incoming]));

    renderDetail();
    await openBalances();

    expect(screen.getByText('Ali sana 45,00 ₺ borclu')).toBeInTheDocument();
    expect(screen.getByText(/Ali sana 45,00 ₺ odedigini bildirdi/)).toBeInTheDocument();

    // Onay sonrasi sunucunun donecegi durum: hesap kapali, bekleyen kayit yok.
    mockedSettlements.confirmSettlement.mockResolvedValue({ ...incoming, status: 'confirmed' });
    mockedGroups.getGroupBalances.mockResolvedValue(settledBalances);
    mockedSettlements.listSettlements.mockResolvedValue(settlementPage([]));

    fireEvent.click(screen.getByRole('button', { name: 'Onayla' }));

    expect(await screen.findByText(/Tum hesaplar kapali/)).toBeInTheDocument();
    expect(screen.queryByText('Ali sana 45,00 ₺ borclu')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Onayla' })).not.toBeInTheDocument();
  });
});

/* ==================================================== birim: bolusme */

describe('bolusme kurallari (birim)', () => {
  it('esit bolme kurus artigini dagitir, toplam korunur', () => {
    const shares = equalShares(10_000, ['b', 'a', 'c']);
    const total = [...shares.values()].reduce((sum, cents) => sum + cents, 0);

    expect(total).toBe(10_000);
    // Artik en kucuk userId'ye: deterministik ve backend ile ayni tie-break.
    expect(shares.get('a')).toBe(3334);
    expect(shares.get('b')).toBe(3333);
    expect(shares.get('c')).toBe(3333);
  });

  it('ozel tutarda fark kurus uzerinden hesaplanir', () => {
    const rows = [
      { userId: 'a', value: '33.33', included: true },
      { userId: 'b', value: '33.33', included: true },
      { userId: 'c', value: '33.34', included: true },
    ];

    // Float toplaminda 100.00000000000001; kurusta tam 10000.
    expect(validateExact(10_000, rows).valid).toBe(true);
    expect(validateExact(10_000, rows).difference).toBe(0);

    expect(validateExact(10_000, rows.slice(0, 2)).message).toBe('33,34 ₺ eksik');
    expect(validateExact(5000, rows.slice(0, 2)).message).toBe('16,66 ₺ fazla');
  });

  it('secili olmayan satir toplama girmez', () => {
    const rows = [
      { userId: 'a', value: '50', included: true },
      { userId: 'b', value: '50', included: true },
      { userId: 'c', value: '999', included: false },
    ];

    expect(validateExact(10_000, rows).valid).toBe(true);
    expect(toSplitDetails('exact', rows)).toEqual({
      shares: [
        { userId: 'a', amount: '50.00' },
        { userId: 'b', amount: '50.00' },
      ],
    });
  });

  it('kaca bol yalnizca TAM sayida secimi gecerli sayar', () => {
    expect(validateCount(3, ['a', 'b']).valid).toBe(false);
    expect(validateCount(3, ['a', 'b']).difference).toBe(1);
    expect(validateCount(3, ['a', 'b', 'c', 'd']).valid).toBe(false);
    expect(validateCount(3, ['a', 'b', 'c', 'd']).difference).toBe(-1);
    expect(validateCount(3, ['a', 'b', 'c']).valid).toBe(true);
  });

  it('kaca bol govdesi esit bolusmenin govdesi', () => {
    const rows = [
      { userId: 'a', value: '', included: true },
      { userId: 'b', value: '', included: true },
    ];

    // `included` degil, ayri secim listesi kullaniliyor.
    expect(toSplitDetails('count', rows, ['b', 'c'])).toEqual({ participants: ['b', 'c'] });
  });

  it('bozuk metin sessizce 0 sayilmaz', () => {
    expect(parseInputToCents('abc')).toBeNull();
    expect(parseInputToCents('-5')).toBeNull();
    expect(parseInputToCents('1.005')).toBeNull();
    expect(parseInputToCents('12,50')).toBe(1250);
  });
});

/* =================================================== birim: dil / tarih */

describe('Turkce ek ve tarih (birim)', () => {
  it('yonelme eki son unluye gore secilir', () => {
    expect(dative('Deniz')).toBe("Deniz'e");
    expect(dative('Burak')).toBe("Burak'a");
    expect(dative('Ece')).toBe("Ece'ye");
    expect(dative('Ali')).toBe("Ali'ye");
    expect(dative('Oguz')).toBe("Oguz'a");
    // Turkce'ye ozgu kucultme: "Gül" -> son unlu "ü" -> ince -> "'e".
    expect(dative('Gül')).toBe("Gül'e");
    expect(dative('Işıl')).toBe("Işıl'a");
  });

  it('tarih bugun/dun/tam tarih olarak yazilir', () => {
    const now = new Date(2026, 7, 15, 12, 0);

    expect(formatExpenseDate(new Date(2026, 7, 15, 9, 5).toISOString(), now)).toBe('Bugun 09:05');
    expect(formatExpenseDate(new Date(2026, 7, 14, 22, 30).toISOString(), now)).toBe('Dun 22:30');
    expect(formatExpenseDate(new Date(2026, 7, 2, 8, 0).toISOString(), now)).toBe('2 Agustos');
    expect(formatExpenseDate(new Date(2025, 11, 31, 8, 0).toISOString(), now)).toBe(
      '31 Aralik 2025'
    );
    expect(formatExpenseDate('bozuk-tarih', now)).toBe('Tarih bilinmiyor');
  });
});
