import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from '../App';
import { AuthProvider } from '../context/AuthProvider';
import { formatCents, parseAmountToCents } from '../utils/money';
import { toneOfCents } from '../utils/balance';

import type {
  BalanceResult,
  Expense,
  GroupDetail,
  GroupSummary,
  InviteResult,
  User,
} from '../types/models';

/**
 * Gruplarim ekrani testleri.
 *
 * Yalnizca ag katmani (`api/auth`, `api/groups`) mock'lanir; `useAsync`,
 * `utils/balance`, `utils/money`, React Router ve `AuthProvider` gercek kod.
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
    createInvite: vi.fn(),
    getGroupBalances: vi.fn(),
    getGroup: vi.fn(),
  },
}));

/*
  "Harcama ekle" akisi grubun tam uye listesini `GET /groups/:id` ile anlik
  cekiyor (bkz. docs/decisions/gruplar-kart-tasarimi.md), sonra gercek
  `AddExpenseModal`i aciyor — o da `createExpense`i cagiriyor. Ikisi de gercek
  bilesen, yalnizca ag katmani mock'lu.
*/
vi.mock('../api/expenses', () => ({
  __esModule: true,
  default: { listExpenses: vi.fn(), createExpense: vi.fn() },
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

import authApi from '../api/auth';
import expensesApi from '../api/expenses';
import groupsApi from '../api/groups';

const mockedAuth = vi.mocked(authApi);
const mockedGroups = vi.mocked(groupsApi);
const mockedExpenses = vi.mocked(expensesApi);

const TOKEN_KEY = 'evenup.token';
const ME_ID = '11111111-1111-4111-8111-111111111111';

const me: User = {
  id: ME_ID,
  email: 'deniz@evenup.dev',
  name: 'Deniz',
  role: 'user',
  is_active: true,
  created_at: '2026-08-01T10:00:00.000Z',
};

const group = (over: Partial<GroupSummary> = {}): GroupSummary => ({
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  name: 'Ev Arkadaslari',
  description: null,
  created_by: ME_ID,
  created_at: '2026-08-01T10:00:00.000Z',
  role: 'owner',
  joined_at: '2026-08-01T10:00:00.000Z',
  member_count: 4,
  member_preview: [{ user_id: ME_ID, name: 'Deniz' }],
  has_pending_incoming: false,
  last_activity: null,
  ...over,
});

const ECE_ID = '22222222-2222-4222-8222-222222222222';

/** "Harcama ekle" akisinin cektigi tam grup detayi. */
const groupDetailFor = (groupId: string): GroupDetail => ({
  group: {
    id: groupId,
    name: 'Ev Arkadaslari',
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
  ],
});

const expense = (over: Partial<Expense> = {}): Expense => ({
  id: 'eeeeeeee-0000-4000-8000-000000000001',
  group_id: group().id,
  paid_by: ME_ID,
  created_by: ME_ID,
  amount: '40.00',
  description: 'Market',
  category: 'market',
  split_type: 'equal',
  created_at: '2026-08-16T10:00:00.000Z',
  updated_at: '2026-08-16T10:00:00.000Z',
  payer_name: 'Deniz',
  creator_name: 'Deniz',
  shares: [
    { user_id: ME_ID, name: 'Deniz', share_amount: '20.00' },
    { user_id: ECE_ID, name: 'Ece', share_amount: '20.00' },
  ],
  ...over,
});

/** Yalnizca net bakiyesi onemli olan minimal bir cevap. */
const balances = (netBalance: string, userId = ME_ID): BalanceResult => ({
  balances: [{ user_id: userId, name: 'Deniz', net_balance: netBalance }],
  transfers: [],
  meta: {
    expense_count: 1,
    confirmed_settlement_count: 0,
    pending_settlement_count: 0,
    rejected_settlement_count: 0,
    algorithm: 'optimal',
  },
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

const apiError = (statusCode: number, message: string) =>
  Object.assign(new Error(message), {
    isAxiosError: true,
    response: { status: statusCode, data: { status: 'error', statusCode, message } },
  });

const renderGroups = () => {
  window.localStorage.setItem(TOKEN_KEY, 'gecerli.jwt.token');
  mockedAuth.getMe.mockResolvedValue(me);

  return render(
    <MemoryRouter initialEntries={['/groups']}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>
  );
};

/** Kart gorunene kadar bekle ve dondur. */
const findCard = async (name: string) => {
  const heading = await screen.findByRole('heading', { name });
  const card = heading.closest('article');
  expect(card).not.toBeNull();
  return card as HTMLElement;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedGroups.getGroupBalances.mockResolvedValue(balances('0.00'));
});

/* ============================================================ liste durumlari */

describe('liste durumlari', () => {
  it('yuklenirken iskelet gosterilir, sonra kartlar gelir', async () => {
    const pending = deferred<GroupSummary[]>();
    mockedGroups.listGroups.mockReturnValue(pending.promise);

    renderGroups();

    expect(await screen.findByLabelText('Gruplar yukleniyor')).toBeInTheDocument();

    await act(async () => {
      pending.resolve([group()]);
    });

    expect(await screen.findByRole('heading', { name: 'Ev Arkadaslari' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Gruplar yukleniyor')).not.toBeInTheDocument();
  });

  it('hic grup yoksa karsilama ekrani ve olusturma CTA gosterilir', async () => {
    mockedGroups.listGroups.mockResolvedValue([]);

    renderGroups();

    expect(await screen.findByRole('heading', { name: "EvenUp'a hos geldin" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ilk grubunu olustur/ })).toBeInTheDocument();
  });

  it('API hatasinda anlamli mesaj ve tekrar dene gosterilir', async () => {
    mockedGroups.listGroups.mockRejectedValue(apiError(500, 'Sunucu hatasi'));

    renderGroups();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Sunucu hatasi');
    // Hata, "grup yok" ile karistirilmamali.
    expect(screen.queryByRole('heading', { name: "EvenUp'a hos geldin" })).not.toBeInTheDocument();
  });

  it('tekrar dene listeyi yeniden ister', async () => {
    mockedGroups.listGroups.mockRejectedValueOnce(apiError(500, 'Sunucu hatasi'));
    mockedGroups.listGroups.mockResolvedValueOnce([group()]);

    renderGroups();

    fireEvent.click(await screen.findByRole('button', { name: 'Tekrar dene' }));

    expect(await screen.findByRole('heading', { name: 'Ev Arkadaslari' })).toBeInTheDocument();
    expect(mockedGroups.listGroups).toHaveBeenCalledTimes(2);
  });

  it('ag hatasi sifre/veri hatasindan ayri bir mesaj alir', async () => {
    mockedGroups.listGroups.mockRejectedValue(
      Object.assign(new Error('Network Error'), { isAxiosError: true })
    );

    renderGroups();

    expect(await screen.findByRole('alert')).toHaveTextContent('Sunucuya ulasilamiyor');
  });
});

/* ============================================================== bos durum */

describe('bos durum ekrani', () => {
  it('grup nedir bolumu ve dort ozellik kutusu gosterilir', async () => {
    mockedGroups.listGroups.mockResolvedValue([]);

    renderGroups();

    expect(await screen.findByRole('heading', { name: 'Grup nedir?' })).toBeInTheDocument();

    // Kutular gercek ozelliklere referans veriyor; henuz yazilmamis olanlar
    // (sohbet, AI'in kalemlere ayirmasi) rozetle isaretli.
    for (const title of ['Sohbet & fisler', 'Harcama kalemleri', 'Bakiyeler', 'Grup ayarlari']) {
      expect(screen.getByRole('heading', { name: new RegExp(title) })).toBeInTheDocument();
    }

    expect(screen.getAllByText('Yakinda')).toHaveLength(2);
  });

  it('karsilama kartindaki buton grup olusturma modalini acar', async () => {
    mockedGroups.listGroups.mockResolvedValue([]);

    renderGroups();

    fireEvent.click(await screen.findByRole('button', { name: /Ilk grubunu olustur/ }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Grup adi')).toBeInTheDocument();
  });

  it('en az bir grup varken bos durum degil kart listesi gosterilir', async () => {
    mockedGroups.listGroups.mockResolvedValue([group()]);

    renderGroups();

    await findCard('Ev Arkadaslari');

    expect(screen.queryByRole('heading', { name: "EvenUp'a hos geldin" })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Grup nedir?' })).not.toBeInTheDocument();
  });
});

/* ======================================================== bakiye renklendirme */

describe('bakiye renklendirme', () => {
  it('pozitif bakiye yesil ve "sana borclular"', async () => {
    mockedGroups.listGroups.mockResolvedValue([group()]);
    mockedGroups.getGroupBalances.mockResolvedValue(balances('105.00'));

    renderGroups();
    const card = await findCard('Ev Arkadaslari');

    await waitFor(() => expect(within(card).getByText('Sana borclular')).toBeInTheDocument());
    expect(card.querySelector('.balance--credit')).not.toBeNull();
    // Yon metinle anlatildigi icin tutar isaretsiz gosterilir.
    expect(within(card).getByText('105,00 ₺')).toBeInTheDocument();
  });

  it('negatif bakiye kirmizi ve "sen borclusun"', async () => {
    mockedGroups.listGroups.mockResolvedValue([group()]);
    mockedGroups.getGroupBalances.mockResolvedValue(balances('-135.50'));

    renderGroups();
    const card = await findCard('Ev Arkadaslari');

    await waitFor(() => expect(within(card).getByText('Sen borclusun')).toBeInTheDocument());
    expect(card.querySelector('.balance--debt')).not.toBeNull();
    expect(within(card).getByText('135,50 ₺')).toBeInTheDocument();
  });

  it('sifir bakiye notr ve "hesap kapali"', async () => {
    mockedGroups.listGroups.mockResolvedValue([group()]);
    mockedGroups.getGroupBalances.mockResolvedValue(balances('0.00'));

    renderGroups();
    const card = await findCard('Ev Arkadaslari');

    await waitFor(() => expect(within(card).getByText('Hesap kapali')).toBeInTheDocument());
    expect(card.querySelector('.balance--settled')).not.toBeNull();
    expect(card.querySelector('.balance--credit')).toBeNull();
    expect(card.querySelector('.balance--debt')).toBeNull();
  });

  it('kullanicinin kendi satiri secilir, baskasininki degil', async () => {
    mockedGroups.listGroups.mockResolvedValue([group()]);
    mockedGroups.getGroupBalances.mockResolvedValue({
      ...balances('0.00'),
      balances: [
        { user_id: 'baskasi', name: 'Ece', net_balance: '-500.00' },
        { user_id: ME_ID, name: 'Deniz', net_balance: '42.00' },
      ],
    });

    renderGroups();
    const card = await findCard('Ev Arkadaslari');

    await waitFor(() => expect(within(card).getByText('42,00 ₺')).toBeInTheDocument());
    expect(within(card).queryByText('500,00 ₺')).not.toBeInTheDocument();
  });

  it('bakiye hatasinda 0,00 gosterilmez — bilinmiyor denir', async () => {
    mockedGroups.listGroups.mockResolvedValue([group()]);
    mockedGroups.getGroupBalances.mockRejectedValue(apiError(500, 'Bakiye hesaplanamadi'));

    renderGroups();
    const card = await findCard('Ev Arkadaslari');

    await waitFor(() =>
      expect(within(card).getByText(/Bakiye su an alinamadi/)).toBeInTheDocument()
    );
    // Bilinmeyen bakiye ile dengede olan bakiye ayni sey degil.
    expect(within(card).queryByText('Hesap kapali')).not.toBeInTheDocument();
    expect(within(card).queryByText('0,00 ₺')).not.toBeInTheDocument();
  });

  it('bir grubun bakiyesi patlasa da digerleri gosterilir', async () => {
    mockedGroups.listGroups.mockResolvedValue([
      group(),
      group({ id: 'bbbbbbbb-0000-4000-8000-000000000002', name: 'Tatil' }),
    ]);
    mockedGroups.getGroupBalances.mockImplementation((groupId: string) =>
      groupId === 'bbbbbbbb-0000-4000-8000-000000000002'
        ? Promise.reject(apiError(500, 'Bakiye hesaplanamadi'))
        : Promise.resolve(balances('105.00'))
    );

    renderGroups();

    const healthy = await findCard('Ev Arkadaslari');
    const broken = await findCard('Tatil');

    await waitFor(() => expect(within(healthy).getByText('Sana borclular')).toBeInTheDocument());
    expect(within(broken).getByText(/Bakiye su an alinamadi/)).toBeInTheDocument();
  });
});

/* ================================================================ yeni grup */

describe('yeni grup modali', () => {
  it('grup olusturur ve liste yenilenir', async () => {
    mockedGroups.listGroups.mockResolvedValueOnce([]);
    mockedGroups.listGroups.mockResolvedValueOnce([group({ name: 'Tatil' })]);
    mockedGroups.createGroup.mockResolvedValue({
      id: 'x',
      name: 'Tatil',
      description: null,
      created_by: ME_ID,
      created_at: '2026-08-15T10:00:00.000Z',
    });

    renderGroups();

    fireEvent.click(await screen.findByRole('button', { name: 'Yeni Grup' }));
    fireEvent.change(screen.getByLabelText('Grup adi'), { target: { value: '  Tatil  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Olustur' }));

    await waitFor(() => expect(mockedGroups.createGroup).toHaveBeenCalledWith({ name: 'Tatil' }));
    expect(await screen.findByRole('heading', { name: 'Tatil' })).toBeInTheDocument();
    // Liste elle guncellenmiyor, yeniden isteniyor.
    expect(mockedGroups.listGroups).toHaveBeenCalledTimes(2);
  });

  it('bos isimde istek atilmaz', async () => {
    mockedGroups.listGroups.mockResolvedValue([]);

    renderGroups();

    fireEvent.click(await screen.findByRole('button', { name: 'Yeni Grup' }));
    fireEvent.click(screen.getByRole('button', { name: 'Olustur' }));

    expect(await screen.findByText('Grup adi zorunlu')).toBeInTheDocument();
    expect(mockedGroups.createGroup).not.toHaveBeenCalled();
  });

  it('backend hatasi modalda gosterilir ve modal kapanmaz', async () => {
    mockedGroups.listGroups.mockResolvedValue([]);
    mockedGroups.createGroup.mockRejectedValue(apiError(400, 'Gecersiz grup bilgileri'));

    renderGroups();

    fireEvent.click(await screen.findByRole('button', { name: 'Yeni Grup' }));
    fireEvent.change(screen.getByLabelText('Grup adi'), { target: { value: 'Tatil' } });
    fireEvent.click(screen.getByRole('button', { name: 'Olustur' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Gecersiz grup bilgileri');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('ayni anda gelen ikinci gonderim elenir', async () => {
    mockedGroups.listGroups.mockResolvedValue([]);
    const pending = deferred<never>();
    mockedGroups.createGroup.mockReturnValue(pending.promise);

    renderGroups();

    fireEvent.click(await screen.findByRole('button', { name: 'Yeni Grup' }));
    fireEvent.change(screen.getByLabelText('Grup adi'), { target: { value: 'Tatil' } });

    // Modal bir portal'da render ediliyor (shadcn/Radix Dialog), yani render
    // container'inin disinda. Formu rolden bulmak hem portal'dan bagimsiz hem
    // de sinif adina bagli olmadigi icin daha saglam.
    const form = screen.getByRole('dialog').querySelector('form');

    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(mockedGroups.createGroup).toHaveBeenCalledTimes(1);
  });

  it('Escape ile kapanir', async () => {
    mockedGroups.listGroups.mockResolvedValue([]);

    renderGroups();

    fireEvent.click(await screen.findByRole('button', { name: 'Yeni Grup' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Escape dinleyicisi artik Radix Dialog'da ve `document` uzerinde duruyor.
    // `window`a gonderilen olay document'e kabarciklanmaz; gercek kullanicinin
    // tuslamasi da odaktaki ogeden baslar, o yuzden dogru hedef bu.
    fireEvent.keyDown(document.body, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

/* ============================================================== davet linki */

describe('davet linki kopyala', () => {
  const invite: InviteResult = {
    invite: {
      code: 'AbCdEf123456789012345',
      join_url: 'http://localhost:3000/groups/join/AbCdEf123456789012345',
      expires_at: '2026-08-22T10:00:00.000Z',
      max_uses: null,
      use_count: 0,
    },
    rotated: false,
  };

  it('owner icin buton gorunur ve link panoya yazilir', async () => {
    mockedGroups.listGroups.mockResolvedValue([group({ role: 'owner' })]);
    mockedGroups.createInvite.mockResolvedValue(invite);

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    renderGroups();

    fireEvent.click(await screen.findByRole('button', { name: 'Davet linkini kopyala' }));

    expect(await screen.findByText('Davet linki panoya kopyalandi.')).toBeInTheDocument();
    expect(mockedGroups.createInvite).toHaveBeenCalledWith(group().id);
    /*
      Backend'in `join_url`i API adresini ve POST uc noktasini gosteriyor; link
      istemci origin'inden ve tarayicida acilabilen `/join/:kod` rotasindan
      kuruluyor (bkz. utils/invite.ts, pages/JoinPage.tsx).
    */
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/join/${invite.invite.code}`);
  });

  it('pano kullanilamazsa link ekranda gosterilir', async () => {
    mockedGroups.listGroups.mockResolvedValue([group({ role: 'owner' })]);
    mockedGroups.createInvite.mockResolvedValue(invite);

    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('izin yok')) },
      configurable: true,
    });

    renderGroups();

    fireEvent.click(await screen.findByRole('button', { name: 'Davet linkini kopyala' }));

    // Sessizce "kopyalandi" demek, kullanicinin bos pano yapistirmasi demekti.
    expect(await screen.findByText(/Pano kullanilamadi/)).toBeInTheDocument();
    expect(
      screen.getByText(`${window.location.origin}/join/${invite.invite.code}`)
    ).toBeInTheDocument();
  });

  it('uye (owner olmayan) icin buton hic gosterilmez', async () => {
    mockedGroups.listGroups.mockResolvedValue([group({ role: 'member' })]);

    renderGroups();
    await findCard('Ev Arkadaslari');

    expect(screen.queryByRole('button', { name: 'Davet linkini kopyala' })).not.toBeInTheDocument();
  });

  it('davet istegi hata verirse mesaj gosterilir', async () => {
    mockedGroups.listGroups.mockResolvedValue([group({ role: 'owner' })]);
    mockedGroups.createInvite.mockRejectedValue(
      apiError(403, 'Bu islem icin grup sahibi olmalisiniz')
    );

    renderGroups();

    fireEvent.click(await screen.findByRole('button', { name: 'Davet linkini kopyala' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Bu islem icin grup sahibi olmalisiniz'
    );
  });
});

/* ============================================================ satir kart tasarimi */

describe('avatar yigini', () => {
  it('onizlemedeki uyelerin bas harfleri gosterilir', async () => {
    mockedGroups.listGroups.mockResolvedValue([
      group({
        member_preview: [
          { user_id: ME_ID, name: 'Deniz' },
          { user_id: ECE_ID, name: 'Ece' },
        ],
      }),
    ]);

    renderGroups();
    const card = await findCard('Ev Arkadaslari');

    expect(within(card).getByText('D')).toBeInTheDocument();
    expect(within(card).getByText('E')).toBeInTheDocument();
  });

  it('onizlemeden fazla uye varsa "+N" sayaci gosterilir', async () => {
    mockedGroups.listGroups.mockResolvedValue([
      group({
        member_count: 6,
        member_preview: [
          { user_id: ME_ID, name: 'Deniz' },
          { user_id: ECE_ID, name: 'Ece' },
        ],
      }),
    ]);

    renderGroups();
    const card = await findCard('Ev Arkadaslari');

    expect(within(card).getByText('+4')).toBeInTheDocument();
  });

  it('tum uyeler onizlemede sigiyorsa sayac gosterilmez', async () => {
    mockedGroups.listGroups.mockResolvedValue([
      group({ member_count: 1, member_preview: [{ user_id: ME_ID, name: 'Deniz' }] }),
    ]);

    renderGroups();
    const card = await findCard('Ev Arkadaslari');

    expect(within(card).queryByText(/^\+/)).not.toBeInTheDocument();
  });
});

describe('onay bekleyen rozeti', () => {
  it('has_pending_incoming true ise ONAY BEKLIYOR gosterilir', async () => {
    mockedGroups.listGroups.mockResolvedValue([group({ has_pending_incoming: true })]);

    renderGroups();
    const card = await findCard('Ev Arkadaslari');

    expect(within(card).getByText('ONAY BEKLIYOR')).toBeInTheDocument();
  });

  it('has_pending_incoming false ise rozet hic yok', async () => {
    mockedGroups.listGroups.mockResolvedValue([group({ has_pending_incoming: false })]);

    renderGroups();
    const card = await findCard('Ev Arkadaslari');

    expect(within(card).queryByText('ONAY BEKLIYOR')).not.toBeInTheDocument();
  });
});

describe('son hareket satiri', () => {
  it('son hareket varsa gorece zaman + cumle gosterilir', async () => {
    mockedGroups.listGroups.mockResolvedValue([
      group({
        last_activity: {
          kind: 'expense_created',
          // "renderGroups" cagrisindan hemen once sabitlenen saate gore 2 saat once.
          occurred_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          actor_id: ECE_ID,
          actor_name: 'Ece',
          counterparty_id: null,
          counterparty_name: null,
          amount: '90.00',
          description: 'market alisverisi',
        },
      }),
    ]);

    renderGroups();
    const card = await findCard('Ev Arkadaslari');

    // Cumle `activitySentence` ile ayni kaynaktan: "Ece market alisverisi ekledi".
    expect(
      await within(card).findByText(/2 saat once · Ece market alisverisi ekledi/)
    ).toBeInTheDocument();
  });

  it('son hareket yoksa yer tutucu metin gosterilir', async () => {
    mockedGroups.listGroups.mockResolvedValue([group({ last_activity: null })]);

    renderGroups();
    const card = await findCard('Ev Arkadaslari');

    expect(await within(card).findByText('Henuz hareket yok')).toBeInTheDocument();
  });
});

describe('kartan hizli harcama ekleme', () => {
  it('Harcama ekle grup detayini anlik ceker ve formu uyelerle acar', async () => {
    mockedGroups.listGroups.mockResolvedValue([group()]);
    mockedGroups.getGroup.mockResolvedValue(groupDetailFor(group().id));

    renderGroups();
    await findCard('Ev Arkadaslari');

    fireEvent.click(await screen.findByRole('button', { name: 'Harcama ekle' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(mockedGroups.getGroup).toHaveBeenCalledWith(group().id);
    // Form gercekten cekilen uyelerle acildi: "Ece dahil" onay kutusu var.
    expect(screen.getByLabelText('Ece dahil')).toBeInTheDocument();
  });

  it('basarili eklemeden sonra modal kapanir ve liste + bu kartin bakiyesi yeniden istenir', async () => {
    mockedGroups.listGroups.mockResolvedValue([group()]);
    mockedGroups.getGroup.mockResolvedValue(groupDetailFor(group().id));
    mockedExpenses.createExpense.mockResolvedValue(expense());

    renderGroups();
    await findCard('Ev Arkadaslari');

    const balanceCallsBefore = mockedGroups.getGroupBalances.mock.calls.length;
    const listCallsBefore = mockedGroups.listGroups.mock.calls.length;

    fireEvent.click(await screen.findByRole('button', { name: 'Harcama ekle' }));
    await screen.findByRole('dialog');

    fireEvent.change(screen.getByLabelText('Aciklama'), { target: { value: 'Market' } });
    fireEvent.change(screen.getByLabelText('Tutar (₺)'), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ekle' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // 2.4: bakiye netlestirmesi istemcide tekrarlanmiyor, tam yeniden istek.
    expect(mockedGroups.getGroupBalances.mock.calls.length).toBeGreaterThan(balanceCallsBefore);
    expect(mockedGroups.listGroups.mock.calls.length).toBeGreaterThan(listCallsBefore);
  });

  it('grup bilgisi alinamazsa hata gosterilir, modal acilmaz', async () => {
    mockedGroups.listGroups.mockResolvedValue([group()]);
    mockedGroups.getGroup.mockRejectedValue(apiError(500, 'Grup bilgisi alinamadi'));

    renderGroups();
    await findCard('Ev Arkadaslari');

    fireEvent.click(await screen.findByRole('button', { name: 'Harcama ekle' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Grup bilgisi alinamadi');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

/* ====================================================== para/bakiye birimleri */

describe('para ve bakiye kurallari (birim)', () => {
  it('NUMERIC metni kurusa kayipsiz cevrilir', () => {
    expect(parseAmountToCents('105.00')).toBe(10500);
    expect(parseAmountToCents('-135.50')).toBe(-13550);
    expect(parseAmountToCents('0.00')).toBe(0);
    expect(parseAmountToCents('0.1')).toBe(10);
    expect(parseAmountToCents('1.005')).toBeNull();
    expect(parseAmountToCents('abc')).toBeNull();
  });

  it('kurus bicimlendirmesi binlik ayraci ve iki ondalik verir', () => {
    expect(formatCents(10500)).toBe('105,00 ₺');
    expect(formatCents(-13550)).toBe('-135,50 ₺');
    expect(formatCents(0)).toBe('0,00 ₺');
    expect(formatCents(123456789)).toBe('1.234.567,89 ₺');
  });

  it('ton yalnizca isarete bakar', () => {
    expect(toneOfCents(1)).toBe('credit');
    expect(toneOfCents(-1)).toBe('debt');
    expect(toneOfCents(0)).toBe('settled');
  });
});
