import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from '../App';
import { AuthProvider } from '../context/AuthProvider';

import type { Contact, User } from '../types/models';

/**
 * Kisiler sayfasi testleri.
 *
 * Ag katmani mock'lanir (`api/auth`, `api/groups`, `api/summary`, `api/contacts`,
 * `api/settlements`); geri kalan her sey (routing, `useAsync`, arama/siralama,
 * diyaloglar) gercek kod. `api/groups`/`api/summary` yalnizca Sidebar'i
 * (Layout) ayakta tutmak icin mock'lu — bu sayfanin derdi degil.
 */
vi.mock('../api/auth', () => ({
  __esModule: true,
  default: { login: vi.fn(), register: vi.fn(), getMe: vi.fn() },
}));

vi.mock('../api/groups', () => ({
  __esModule: true,
  default: {
    listGroups: vi.fn().mockResolvedValue([]),
    setMemberNickname: vi.fn(),
  },
}));

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

vi.mock('../api/contacts', () => ({
  __esModule: true,
  default: { getContacts: vi.fn() },
}));

vi.mock('../api/settlements', () => ({
  __esModule: true,
  default: {
    listSettlements: vi.fn(),
    listPendingApprovals: vi.fn(),
    createSettlement: vi.fn(),
    confirmSettlement: vi.fn(),
    rejectSettlement: vi.fn(),
  },
}));

import authApi from '../api/auth';
import contactsApi from '../api/contacts';
import groupsApi from '../api/groups';
import settlementsApi from '../api/settlements';

const mockedAuth = vi.mocked(authApi);
const mockedContacts = vi.mocked(contactsApi);
const mockedGroups = vi.mocked(groupsApi);
const mockedSettlements = vi.mocked(settlementsApi);

const TOKEN_KEY = 'evenup.token';
const ME_ID = '11111111-1111-4111-8111-111111111111';
const ECE_ID = '22222222-2222-4222-8222-222222222222';
const GROUP_A_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const GROUP_B_ID = 'bbbbbbbb-0000-4000-8000-000000000002';

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

const ece = (over: Partial<Contact> = {}): Contact => ({
  user_id: ECE_ID,
  name: 'Ece',
  nickname: null,
  shared_groups: [
    { id: GROUP_A_ID, name: 'Ev Arkadaslari', slug: 'ev-arkadaslari', nickname: null, net_balance: '30.00' },
  ],
  net_balance: '30.00',
  ...over,
});

const renderContacts = () => {
  window.localStorage.setItem(TOKEN_KEY, 'gecerli.jwt.token');
  mockedAuth.getMe.mockResolvedValue(me);

  return render(
    <MemoryRouter initialEntries={['/contacts']}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>
  );
};

const waitForPage = () => screen.findByRole('heading', { name: 'Tum gruplardaki kisiler' });

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  mockedGroups.listGroups.mockResolvedValue([]);
});

/* ============================================================ liste durumlari */

describe('liste durumlari', () => {
  it('yuklenirken iskelet, sonra kisi satiri gosterilir', async () => {
    const pending = deferred<Contact[]>();
    mockedContacts.getContacts.mockReturnValue(pending.promise);

    renderContacts();

    expect(await screen.findByLabelText('Kisiler yukleniyor')).toBeInTheDocument();

    await act(async () => {
      pending.resolve([ece()]);
    });

    expect(await screen.findByText('Ece')).toBeInTheDocument();
    expect(screen.queryByLabelText('Kisiler yukleniyor')).not.toBeInTheDocument();
  });

  it('hic ortak kisi yoksa bos durum mesaji gosterilir', async () => {
    mockedContacts.getContacts.mockResolvedValue([]);

    renderContacts();
    await waitForPage();

    expect(await screen.findByText('Henuz ortak grubun oldugu kimse yok.')).toBeInTheDocument();
  });

  it('API hatasinda tekrar dene ile yeniden istek atilir', async () => {
    mockedContacts.getContacts.mockRejectedValueOnce(
      Object.assign(new Error('Sunucu hatasi'), {
        isAxiosError: true,
        response: { status: 500, data: { message: 'Sunucu hatasi' } },
      })
    );
    mockedContacts.getContacts.mockResolvedValueOnce([ece()]);

    renderContacts();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Sunucu hatasi');

    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }));

    expect(await screen.findByText('Ece')).toBeInTheDocument();
    expect(mockedContacts.getContacts).toHaveBeenCalledTimes(2);
  });
});

/* ================================================================ arama/siralama */

describe('arama ve siralama', () => {
  const kerem = (): Contact => ({
    user_id: '33333333-3333-4333-8333-333333333333',
    name: 'Kerem',
    nickname: null,
    shared_groups: [
      { id: GROUP_B_ID, name: 'Tatil', slug: 'tatil', nickname: null, net_balance: '-10.00' },
    ],
    net_balance: '-10.00',
  });

  it('isim/takma ada gore filtreler', async () => {
    mockedContacts.getContacts.mockResolvedValue([ece(), kerem()]);

    renderContacts();
    await waitForPage();

    expect(await screen.findByText('Ece')).toBeInTheDocument();
    expect(screen.getByText('Kerem')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Kisi ara'), { target: { value: 'ece' } });

    expect(screen.getByText('Ece')).toBeInTheDocument();
    expect(screen.queryByText('Kerem')).not.toBeInTheDocument();
  });

  it('arama eslesmezse "eslesen kisi yok" gosterilir', async () => {
    mockedContacts.getContacts.mockResolvedValue([ece()]);

    renderContacts();
    await waitForPage();
    await screen.findByText('Ece');

    fireEvent.change(screen.getByLabelText('Kisi ara'), { target: { value: 'yoktur-boyle-biri' } });

    expect(await screen.findByText('Aramayla eslesen kisi yok.')).toBeInTheDocument();
  });

  it('varsayilan siralama en buyuk mutlak bakiyeyi one alir', async () => {
    // Ece: +30 (kucuk), Kerem: -10... ama buyukluk sirasi icin degerleri degistiriyoruz.
    mockedContacts.getContacts.mockResolvedValue([
      ece({ net_balance: '10.00' }),
      kerem(),
    ]);
    // Kerem -10, Ece +10 -> esit mutlak deger, isme gore Ece once gelir (E < K).

    renderContacts();
    await waitForPage();

    const rows = await screen.findAllByRole('listitem');
    const names = rows.map((row) => within(row).queryByText(/Ece|Kerem/)?.textContent);
    expect(names[0]).toBe('Ece');
  });
});

/* ================================================================= hesabi kapat */

describe('hesabi kapat', () => {
  it('bakiye sifirsa buton gorunmez', async () => {
    mockedContacts.getContacts.mockResolvedValue([ece({ net_balance: '0.00' })]);

    renderContacts();
    await waitForPage();
    await screen.findByText('Ece');

    expect(screen.queryByRole('button', { name: 'Hesabi kapat' })).not.toBeInTheDocument();
  });

  it('borcluysam onaylayinca dogru grup+tutarla odeme olusturur', async () => {
    // -30: ben Ece'ye borcluyum.
    mockedContacts.getContacts.mockResolvedValue([
      ece({
        net_balance: '-30.00',
        shared_groups: [
          {
            id: GROUP_A_ID,
            name: 'Ev Arkadaslari',
            slug: 'ev-arkadaslari',
            nickname: null,
            net_balance: '-30.00',
          },
        ],
      }),
    ]);
    mockedSettlements.createSettlement.mockResolvedValue({
      id: 'sss',
      group_id: GROUP_A_ID,
      from_user: ME_ID,
      to_user: ECE_ID,
      amount: '30.00',
      status: 'pending',
      created_at: '2026-08-20T10:00:00.000Z',
      confirmed_at: null,
      rejected_at: null,
    });

    renderContacts();
    await waitForPage();
    await screen.findByText('Ece');

    fireEvent.click(screen.getByRole('button', { name: 'Hesabi kapat' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Odemeleri olustur' }));

    await waitFor(() =>
      expect(mockedSettlements.createSettlement).toHaveBeenCalledWith(GROUP_A_ID, {
        toUserId: ECE_ID,
        amount: '30.00',
      })
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // Basari sonrasi liste yeniden istendi.
    await waitFor(() => expect(mockedContacts.getContacts).toHaveBeenCalledTimes(2));
  });

  it('kisi bana borcluysa (alacakliysam) odeme kaydi ATILMAZ, yalnizca bilgilendirme gosterilir', async () => {
    mockedContacts.getContacts.mockResolvedValue([ece({ net_balance: '30.00' })]);

    renderContacts();
    await waitForPage();
    await screen.findByText('Ece');

    fireEvent.click(screen.getByRole('button', { name: 'Hesabi kapat' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/sana 30,00 ₺ borclu/)).toBeInTheDocument();
    // Bu yonde "Odemeleri olustur" butonu hic yok, yalnizca "Tamam".
    expect(within(dialog).queryByRole('button', { name: 'Odemeleri olustur' })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Tamam' })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Tamam' }));
    expect(mockedSettlements.createSettlement).not.toHaveBeenCalled();
  });
});

/* =================================================================== takma isim */

describe('takma adi duzenle', () => {
  it('grup basina ayri kutu gosterir ve kaydeder', async () => {
    mockedContacts.getContacts.mockResolvedValue([ece()]);
    mockedGroups.setMemberNickname.mockResolvedValue({ user_id: ECE_ID, nickname: 'Ev Arkadasi' });

    renderContacts();
    await waitForPage();
    await screen.findByText('Ece');

    // Radix DropdownMenu tetikleyicisi `pointerdown` aninda aciliyor; `click`
    // bunu uretmiyor (bkz. groupDetail.test.tsx -> openRowMenu).
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Ece icin islemler' }),
      new PointerEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: false })
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Takma adi duzenle' }));

    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByLabelText('Ev Arkadaslari icin takma isim');
    fireEvent.change(input, { target: { value: 'Ev Arkadasi' } });
    fireEvent.click(within(dialog).getByLabelText('Ev Arkadaslari icin takma ismi kaydet'));

    await waitFor(() =>
      expect(mockedGroups.setMemberNickname).toHaveBeenCalledWith(GROUP_A_ID, ECE_ID, 'Ev Arkadasi')
    );
  });
});
