import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from '../App';
import AuthProvider from '../context/AuthProvider';
import { dayKeyOf, formatDayGroup, formatTime } from '../utils/datetime';
import { ACTIVITY_BADGES, ACTIVITY_BADGE_TITLES, activitySentence, groupByDay } from '../utils/activity';

import type { ActivityEvent, ActivityKind, ActivityListResult, PendingApproval, User } from '../types/models';

/**
 * Aktivite sayfasi testleri.
 *
 * Ag katmani mock'lanir (`api/auth`, `api/groups`, `api/summary`, `api/activity`,
 * `api/settlements`); geri kalan her sey gercek kod: rota agaci, guard'lar,
 * `useAsync`, `useActivityFeed`.
 *
 * SAYFA TESTI GERCEK SAATE BAGLI KALMAZ, SAHTE SAAT DE KULLANMAZ
 * ----------------------------------------------------------------
 * `ActivityPage` gun basliklarini `groupByDay(feed.events)` ile, varsayilan
 * `now = new Date()` uzerinden hesaplar. Sayfa testleri bu yuzden olay
 * saatlerini **`Date.now()`a gore bagil** kuruyor ("simdi", "24 saat once")
 * ve tam baslik metnini ("BUGUN"/"DUN") degil, gun grubu **sayisini** ve satir
 * icerigini dogruluyor — `vi.useFakeTimers` RTL'in kendi `waitFor` zamanlayicisiyla
 * catisabildigi icin bilerek kullanilmadi.
 *
 * Baslik metninin **tam dogrulugu** (BUGUN/DUN/17 AGUSTOS, yil ekleme kurali)
 * sabit `now` ile calisan `groupByDay`/`formatDayGroup` birim testlerinde
 * ele aliniyor (dosyanin sonu) — `groupDetail.test.tsx`teki "birim" bloklariyla
 * ayni desen.
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
    getGroupBalances: vi.fn(),
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

vi.mock('../api/activity', () => ({
  __esModule: true,
  default: { listActivity: vi.fn(), markActivitySeen: vi.fn().mockResolvedValue(undefined) },
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
import activityApi from '../api/activity';
import settlementsApi from '../api/settlements';
import summaryApi from '../api/summary';

const mockedAuth = vi.mocked(authApi);
const mockedActivity = vi.mocked(activityApi);
const mockedSettlements = vi.mocked(settlementsApi);
const mockedSummary = vi.mocked(summaryApi);

const TOKEN_KEY = 'evenup.token';

const deniz: User = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'deniz@evenup.dev',
  name: 'Deniz',
  role: 'user',
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
  avatar: null,
  handle: null,
};

const HOUR_MS = 60 * 60 * 1000;
/** "Simdiden N saat once" — sayfa testlerinde gercek saate bagil zaman. */
const hoursAgo = (hours: number): string => new Date(Date.now() - hours * HOUR_MS).toISOString();

/* ------------------------------------------------------------------ veri */

const event = (over: Partial<ActivityEvent> = {}): ActivityEvent => ({
  id: `expense_created:${crypto.randomUUID()}`,
  kind: 'expense_created',
  occurred_at: hoursAgo(1),
  group_id: 'g1',
  group_name: 'Ev Arkadaslari',
  actor_id: deniz.id,
  actor_name: 'Deniz',
  counterparty_id: null,
  counterparty_name: null,
  amount: '100.00',
  previous_amount: null,
  description: 'Market',
  previous_description: null,
  ...over,
});

const feedOf = (
  events: ActivityEvent[],
  over: Partial<ActivityListResult['pagination']> = {}
): ActivityListResult => ({
  events,
  pagination: {
    page: 1,
    limit: 20,
    total: events.length,
    total_pages: 1,
    has_next: false,
    has_previous: false,
    ...over,
  },
});

const approvalOf = (over: Partial<PendingApproval> = {}): PendingApproval => ({
  id: 'sssssss-approval-1',
  group_id: 'g2',
  group_name: 'Kapadokya',
  from_user: 'zzzzzzzz-0000-4000-8000-000000000001',
  from_name: 'Serenad',
  amount: '310.00',
  created_at: hoursAgo(18),
  ...over,
});

/* -------------------------------------------------------------- yardimcilar */

const renderActivity = () => {
  window.localStorage.setItem(TOKEN_KEY, 'gecerli.jwt.token');
  mockedAuth.getMe.mockResolvedValue(deniz);

  return render(
    <MemoryRouter initialEntries={['/activity']}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>
  );
};

const waitForPage = async () => screen.findByRole('heading', { name: 'Aktivite' });

const apiError = (statusCode: number, message: string) =>
  Object.assign(new Error(message), {
    isAxiosError: true,
    response: { status: statusCode, data: { status: 'error', statusCode, message } },
  });

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();

  mockedSettlements.listPendingApprovals.mockResolvedValue([]);
  mockedActivity.listActivity.mockResolvedValue(feedOf([]));
});

/* ==================================================================== banner */

describe('Aktivite — onay bekleyen banner', () => {
  it('bekleyen onay yokken banner cikmaz', async () => {
    renderActivity();
    await waitForPage();

    expect(screen.queryByRole('region', { name: 'Onay bekleyen odeme' })).not.toBeInTheDocument();
  });

  it('bekleyen onay varsa kim-ne-kadar cumlesi ve iki buton gorunur', async () => {
    mockedSettlements.listPendingApprovals.mockResolvedValue([approvalOf()]);

    renderActivity();
    await waitForPage();

    const banner = await screen.findByRole('region', { name: 'Onay bekleyen odeme' });
    expect(
      within(banner).getByText(/Serenad, sana 310,00 ₺ odedigini isaretledi/)
    ).toBeInTheDocument();
    expect(within(banner).getByText('Kapadokya')).toBeInTheDocument();
    expect(within(banner).getByRole('button', { name: 'Onayla' })).toBeInTheDocument();
    expect(within(banner).getByRole('button', { name: 'Itiraz Et' })).toBeInTheDocument();
  });

  it('Onayla tiklanince onay istegi gider ve banner + akis yeniden istenir', async () => {
    mockedSettlements.listPendingApprovals.mockResolvedValueOnce([approvalOf()]);
    mockedSettlements.confirmSettlement.mockResolvedValue({
      id: 'sssssss-approval-1',
      group_id: 'g2',
      from_user: 'zzzzzzzz-0000-4000-8000-000000000001',
      to_user: deniz.id,
      amount: '310.00',
      status: 'confirmed',
      created_at: hoursAgo(18),
      confirmed_at: hoursAgo(0),
      rejected_at: null,
    });

    renderActivity();
    await waitForPage();
    const banner = await screen.findByRole('region', { name: 'Onay bekleyen odeme' });

    // Onaydan sonra banner bos donuyor: kayit kapandi.
    mockedSettlements.listPendingApprovals.mockResolvedValue([]);

    fireEvent.click(within(banner).getByRole('button', { name: 'Onayla' }));

    await waitFor(() =>
      expect(mockedSettlements.confirmSettlement).toHaveBeenCalledWith('sssssss-approval-1')
    );
    await waitFor(() => expect(mockedSettlements.listPendingApprovals).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mockedActivity.listActivity).toHaveBeenCalledTimes(2));
  });

  it('Onayla sidebar rozetini SUNUCUYA SORMADAN yerelde 1 azaltir', async () => {
    mockedSummary.getHomeSummary.mockResolvedValue({
      totalNetBalance: '0.00',
      monthlySpend: '0.00',
      activeGroupsCount: 1,
      pendingSettlementsCount: 3,
      unseenActivityCount: 0,
    });
    mockedSettlements.listPendingApprovals.mockResolvedValueOnce([approvalOf()]);
    mockedSettlements.confirmSettlement.mockResolvedValue({
      id: 'sssssss-approval-1',
      group_id: 'g2',
      from_user: 'zzzzzzzz-0000-4000-8000-000000000001',
      to_user: deniz.id,
      amount: '310.00',
      status: 'confirmed',
      created_at: hoursAgo(18),
      confirmed_at: hoursAgo(0),
      rejected_at: null,
    });

    renderActivity();
    await waitForPage();
    const banner = await screen.findByRole('region', { name: 'Onay bekleyen odeme' });

    const sidebarLink = () => screen.getByRole('link', { name: /Aktivite/ });
    expect(within(sidebarLink()).getByText('3')).toBeInTheDocument();

    const summaryCallsBefore = mockedSummary.getHomeSummary.mock.calls.length;

    fireEvent.click(within(banner).getByRole('button', { name: 'Onayla' }));

    await waitFor(() => expect(within(sidebarLink()).getByText('2')).toBeInTheDocument());
    // Azalma yerel: `GET /users/me/home-summary` tekrar cagirilmadi.
    expect(mockedSummary.getHomeSummary.mock.calls.length).toBe(summaryCallsBefore);
  });

  it('bekleyenler alinamazsa akis yine de gorunur, banner alaninda hata yazar', async () => {
    mockedSettlements.listPendingApprovals.mockRejectedValue(apiError(500, 'Sunucu hatasi'));
    mockedActivity.listActivity.mockResolvedValue(feedOf([event()]));

    renderActivity();
    await waitForPage();

    expect(await screen.findByText('Sunucu hatasi')).toBeInTheDocument();
    expect(await screen.findByText('Sen Market ekledin')).toBeInTheDocument();
  });
});

/* ===================================================================== akis */

describe('Aktivite — akis', () => {
  it('mockup senaryosu: farkli olay turleri dogru cumle/tutar/grup ile gorunur', async () => {
    mockedActivity.listActivity.mockResolvedValue(
      feedOf([
        event({
          id: 'e1',
          occurred_at: hoursAgo(1),
          actor_id: deniz.id,
          actor_name: 'Deniz',
          description: 'Aksam marketi',
          amount: '480.00',
        }),
        event({
          id: 'e2',
          occurred_at: hoursAgo(2),
          actor_id: 'eeeeeeee-0000-4000-8000-000000000002',
          actor_name: 'Ece',
          description: 'Elektrik faturasi',
          amount: '1240.00',
        }),
        event({
          id: 'e3',
          kind: 'expense_edited',
          occurred_at: hoursAgo(20),
          actor_id: 'eeeeeeee-0000-4000-8000-000000000002',
          actor_name: 'Ece',
          description: 'Temizlik',
          previous_description: 'Temizlik',
          amount: '195.00',
          previous_amount: '210.00',
        }),
        event({
          id: 'e4',
          kind: 'settlement_confirmed',
          occurred_at: hoursAgo(21),
          group_name: 'Kapadokya',
          actor_id: 'zzzzzzzz-0000-4000-8000-000000000001',
          actor_name: 'Zeynep',
          counterparty_id: deniz.id,
          counterparty_name: 'Deniz',
          description: null,
          amount: '240.00',
        }),
        event({
          id: 'e5',
          kind: 'settlement_created',
          occurred_at: hoursAgo(22),
          group_name: 'Kapadokya',
          actor_id: deniz.id,
          actor_name: 'Deniz',
          counterparty_id: 'bbbbbbbb-0000-4000-8000-000000000003',
          counterparty_name: 'Baris',
          description: null,
          amount: '240.00',
        }),
      ])
    );

    renderActivity();
    await waitForPage();

    // En az bir gun basligi (h2) var; tam metni birim testlerinde dogrulaniyor.
    expect((await screen.findAllByRole('heading', { level: 2 })).length).toBeGreaterThan(0);

    expect(screen.getByText('Sen Aksam marketi ekledin')).toBeInTheDocument();
    expect(screen.getByText('Ece Elektrik faturasi ekledi')).toBeInTheDocument();
    expect(
      screen.getByText('Ece Temizlik tutarini 210,00 ₺ -> 195,00 ₺ olarak duzeltti')
    ).toBeInTheDocument();
    expect(screen.getByText('Zeynep odemeni onayladi')).toBeInTheDocument();
    expect(screen.getByText("Sen Baris'e odeme isaretledin")).toBeInTheDocument();

    // Grup adi + tutar sagda gorunuyor. Regex: grup adi metin dugumunde
    // yaninda " · " ayracıyla birlikte duruyor (bkz. activity-row__meta).
    expect(screen.getAllByText(/Ev Arkadaslari/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Kapadokya/).length).toBeGreaterThan(0);
    expect(screen.getByText('1.240,00 ₺')).toBeInTheDocument();
  });

  it('akis bossa bos durum gosterilir', async () => {
    renderActivity();
    await waitForPage();

    expect(await screen.findByText('Henuz bir aktivite yok.')).toBeInTheDocument();
  });

  it('akis hatasi bos akista tekrar dene ile gosterilir', async () => {
    mockedActivity.listActivity.mockRejectedValue(apiError(500, 'Aktiviteler alinamadi'));

    renderActivity();
    await waitForPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Aktiviteler alinamadi');
    expect(screen.queryByText('Henuz bir aktivite yok.')).not.toBeInTheDocument();
  });

  it('daha fazla yukle ikinci sayfayi listeye ekler', async () => {
    mockedActivity.listActivity.mockResolvedValueOnce(
      feedOf([event({ id: 'e1', description: 'Ilk sayfa' })], { has_next: true, total: 2 })
    );
    mockedActivity.listActivity.mockResolvedValueOnce({
      events: [event({ id: 'e2', description: 'Ikinci sayfa', occurred_at: hoursAgo(3) })],
      pagination: {
        page: 2,
        limit: 20,
        total: 2,
        total_pages: 2,
        has_next: false,
        has_previous: true,
      },
    });

    renderActivity();
    await waitForPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Daha fazla yukle' }));

    expect(await screen.findByText('Sen Ikinci sayfa ekledin')).toBeInTheDocument();
    expect(screen.getByText('Sen Ilk sayfa ekledin')).toBeInTheDocument();
    expect(mockedActivity.listActivity).toHaveBeenLastCalledWith({ page: 2, limit: 20 });
  });

  it('son sayfada daha fazla yukle butonu gorunmez', async () => {
    mockedActivity.listActivity.mockResolvedValue(feedOf([event()]));

    renderActivity();
    await waitForPage();

    await screen.findByText('1 / 1 aktivite');
    expect(screen.queryByRole('button', { name: 'Daha fazla yukle' })).not.toBeInTheDocument();
  });
});

/* ==================================================== okunmamis rozeti */

describe('Aktivite — okunmamis rozeti (aktivite-okunma-sayaci)', () => {
  it('sayfa acilip feed yuklenince sunucuya "gordum" bildirilir ve rozet yerelde sifirlanir', async () => {
    mockedSummary.getHomeSummary.mockResolvedValue({
      totalNetBalance: '0.00',
      monthlySpend: '0.00',
      activeGroupsCount: 1,
      pendingSettlementsCount: 0,
      unseenActivityCount: 5,
    });
    mockedActivity.listActivity.mockResolvedValue(feedOf([event()]));

    renderActivity();

    const sidebarLink = () => screen.getByRole('link', { name: /Aktivite/ });
    expect(within(await screen.findByRole('link', { name: /Aktivite/ })).getByText('5')).toBeInTheDocument();

    await waitFor(() => expect(mockedActivity.markActivitySeen).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(within(sidebarLink()).queryByText('5')).not.toBeInTheDocument());
  });

  it('sunucuya sormadan yerelde sifirlanir — GET /users/me/home-summary tekrar cagirilmaz', async () => {
    mockedSummary.getHomeSummary.mockResolvedValue({
      totalNetBalance: '0.00',
      monthlySpend: '0.00',
      activeGroupsCount: 1,
      pendingSettlementsCount: 0,
      unseenActivityCount: 2,
    });
    mockedActivity.listActivity.mockResolvedValue(feedOf([event()]));

    renderActivity();
    await waitForPage();

    const summaryCallsBefore = mockedSummary.getHomeSummary.mock.calls.length;

    await waitFor(() => expect(mockedActivity.markActivitySeen).toHaveBeenCalledTimes(1));

    expect(mockedSummary.getHomeSummary.mock.calls.length).toBe(summaryCallsBefore);
  });

  it('onay bekleyenler kismini ETKILEMEZ — yalnizca okunmamis kismi sifirlanir', async () => {
    mockedSummary.getHomeSummary.mockResolvedValue({
      totalNetBalance: '0.00',
      monthlySpend: '0.00',
      activeGroupsCount: 1,
      pendingSettlementsCount: 3,
      unseenActivityCount: 2,
    });
    mockedActivity.listActivity.mockResolvedValue(feedOf([event()]));

    renderActivity();
    await waitForPage();

    // 3 (bekleyen) + 2 (okunmamis) = 5, oncesinde.
    const sidebarLink = () => screen.getByRole('link', { name: /Aktivite/ });
    expect(within(sidebarLink()).getByText('5')).toBeInTheDocument();

    // Feed yuklenince okunmamis kisim sifirlanir: yalnizca bekleyen (3) kalir.
    await waitFor(() => expect(within(sidebarLink()).getByText('3')).toBeInTheDocument());
  });

  it('feed bos ise de "gordum" bildirilir (rozeti sifirlamak icin olay olmasi gerekmiyor)', async () => {
    mockedSummary.getHomeSummary.mockResolvedValue({
      totalNetBalance: '0.00',
      monthlySpend: '0.00',
      activeGroupsCount: 1,
      pendingSettlementsCount: 0,
      unseenActivityCount: 2,
    });
    mockedActivity.listActivity.mockResolvedValue(feedOf([]));

    renderActivity();
    await waitForPage();

    await waitFor(() => expect(mockedActivity.markActivitySeen).toHaveBeenCalledTimes(1));
  });
});

/* ============================================== birim: aktivite cumleleri */

describe('activitySentence (birim)', () => {
  const base = (over: Partial<ActivityEvent> = {}): ActivityEvent => ({
    id: 'x',
    kind: 'expense_created',
    occurred_at: '2026-08-17T08:00:00.000Z',
    group_id: 'g1',
    group_name: 'Ev Arkadaslari',
    actor_id: 'actor-1',
    actor_name: 'Ece',
    counterparty_id: null,
    counterparty_name: null,
    amount: '100.00',
    previous_amount: null,
    description: 'Market',
    previous_description: null,
    ...over,
  });

  const ME = 'me-1';

  it('expense_created: kendi eklemen "Sen" ile, baskasininki isimle', () => {
    expect(activitySentence(base({ actor_id: ME }), ME)).toBe('Sen Market ekledin');
    expect(activitySentence(base({ actor_id: 'actor-1' }), ME)).toBe('Ece Market ekledi');
  });

  it('expense_edited: tutar degisince oncesi/sonrasi cumlesi', () => {
    const edited = base({
      kind: 'expense_edited',
      actor_id: ME,
      description: 'Temizlik',
      previous_description: 'Temizlik',
      amount: '195.00',
      previous_amount: '210.00',
    });

    expect(activitySentence(edited, ME)).toBe(
      'Sen Temizlik tutarini 210,00 ₺ -> 195,00 ₺ olarak duzelttin'
    );
  });

  it('expense_edited: yalnizca ad degisince yeniden adlandirma cumlesi', () => {
    const renamed = base({
      kind: 'expense_edited',
      actor_id: 'actor-1',
      previous_description: 'Market',
      description: 'Aksam marketi',
      amount: '100.00',
      previous_amount: '100.00',
    });

    expect(activitySentence(renamed, ME)).toBe(
      'Ece Market harcamasini Aksam marketi olarak yeniden adlandirdi'
    );
  });

  it('expense_edited: ne tutar ne ad degisince genel duzenleme cumlesi', () => {
    const categoryOnly = base({
      kind: 'expense_edited',
      actor_id: 'actor-1',
      description: 'Market',
      previous_description: 'Market',
      amount: '100.00',
      previous_amount: '100.00',
    });

    expect(activitySentence(categoryOnly, ME)).toBe('Ece Market harcamasini duzenledi');
  });

  it('settlement_created: uc bakis acisi (aktor / karsi taraf / ucuncu kisi)', () => {
    const created = (over: Partial<ActivityEvent>) =>
      base({
        kind: 'settlement_created',
        actor_id: 'actor-1',
        actor_name: 'Ece',
        counterparty_id: 'other-1',
        counterparty_name: 'Baris',
        ...over,
      });

    expect(activitySentence(created({ actor_id: ME }), ME)).toBe("Sen Baris'e odeme isaretledin");
    expect(activitySentence(created({ counterparty_id: ME }), ME)).toBe(
      'Ece sana odeme isaretledi'
    );
    expect(activitySentence(created({}), ME)).toBe("Ece, Baris'e odeme isaretledi");
  });

  it('settlement_confirmed: uc bakis acisi (onaylayan / onaylanan / ucuncu kisi)', () => {
    const confirmed = (over: Partial<ActivityEvent>) =>
      base({
        kind: 'settlement_confirmed',
        actor_id: 'actor-1',
        actor_name: 'Ece',
        counterparty_id: 'other-1',
        counterparty_name: 'Baris',
        ...over,
      });

    expect(activitySentence(confirmed({ counterparty_id: ME }), ME)).toBe('Ece odemeni onayladi');
    expect(activitySentence(confirmed({ actor_id: ME }), ME)).toBe(
      'Sen Baris odemesini onayladin'
    );
    expect(activitySentence(confirmed({}), ME)).toBe('Ece, Baris odemesini onayladi');
  });

  it('settlement_rejected: uc bakis acisi (reddeden / reddedilen / ucuncu kisi)', () => {
    const rejected = (over: Partial<ActivityEvent>) =>
      base({
        kind: 'settlement_rejected',
        actor_id: 'actor-1',
        actor_name: 'Ece',
        counterparty_id: 'other-1',
        counterparty_name: 'Baris',
        ...over,
      });

    expect(activitySentence(rejected({ counterparty_id: ME }), ME)).toBe('Ece odemeni reddetti');
    expect(activitySentence(rejected({ actor_id: ME }), ME)).toBe(
      'Sen Baris odemesini reddettin'
    );
    expect(activitySentence(rejected({}), ME)).toBe('Ece, Baris odemesini reddetti');
  });

  it('bilinmeyen tur: guvenli varsayilan cumle uretir, catlamaz', () => {
    const unknown = base({ kind: 'unknown_future_kind' as ActivityKind, actor_id: ME });

    expect(activitySentence(unknown, ME)).toBe('Sen bir islem yaptin');
  });

  it('rozet kisaltmalari her tur icin uc karakter ve bir acilim tasir', () => {
    const kinds: ActivityKind[] = [
      'expense_created',
      'expense_edited',
      'settlement_created',
      'settlement_confirmed',
      'settlement_rejected',
    ];

    for (const kind of kinds) {
      expect(ACTIVITY_BADGES[kind]).toHaveLength(3);
      expect(ACTIVITY_BADGE_TITLES[kind].length).toBeGreaterThan(0);
    }
  });
});

/* ==================================================== birim: gun gruplama */

describe('groupByDay / formatDayGroup (birim)', () => {
  const NOW = new Date(2026, 7, 17, 12, 0, 0); // 17 Agustos 2026, ogle

  const at = (year: number, month: number, day: number, hour = 12, minute = 0): string =>
    new Date(year, month, day, hour, minute).toISOString();

  it('ardisik ayni gun olaylari tek grupta toplanir', () => {
    const events = [
      { occurred_at: at(2026, 7, 17, 9, 0) } as ActivityEvent,
      { occurred_at: at(2026, 7, 17, 8, 0) } as ActivityEvent,
    ];

    const groups = groupByDay(events, NOW);

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('BUGUN');
    expect(groups[0].events).toHaveLength(2);
  });

  it('gun degisince yeni grup acilir: BUGUN / DUN / tarihli baslik', () => {
    const events = [
      { occurred_at: at(2026, 7, 17, 9, 0) } as ActivityEvent, // bugun
      { occurred_at: at(2026, 7, 16, 21, 0) } as ActivityEvent, // dun
      { occurred_at: at(2026, 7, 2, 8, 0) } as ActivityEvent, // ayni yil, uzak
      { occurred_at: at(2025, 11, 31, 8, 0) } as ActivityEvent, // gecen yil
    ];

    const groups = groupByDay(events, NOW);

    expect(groups.map((g) => g.label)).toEqual(['BUGUN', 'DUN', '2 AGUSTOS', '31 ARALIK 2025']);
  });

  it('gelis sirasi bozulmaz: ayni gun iki kez ayri ayri arada baska gunle gorunurse BIRLESTIRILMEZ', () => {
    const events = [
      { occurred_at: at(2026, 7, 17, 9, 0) } as ActivityEvent, // bugun (1. blok)
      { occurred_at: at(2026, 7, 16, 21, 0) } as ActivityEvent, // dun
      { occurred_at: at(2026, 7, 17, 8, 0) } as ActivityEvent, // bugun (2. blok — yeniden siralama YOK)
    ];

    const groups = groupByDay(events, NOW);

    expect(groups.map((g) => g.label)).toEqual(['BUGUN', 'DUN', 'BUGUN']);
    expect(groups).toHaveLength(3);
  });

  it('bos liste bos grup dizisi doner', () => {
    expect(groupByDay([], NOW)).toEqual([]);
  });

  it('dayKeyOf ayni yerel gundeki iki farkli saat icin ayni anahtari uretir', () => {
    expect(dayKeyOf(at(2026, 7, 17, 0, 5))).toBe(dayKeyOf(at(2026, 7, 17, 23, 55)));
    expect(dayKeyOf(at(2026, 7, 17, 23, 55))).not.toBe(dayKeyOf(at(2026, 7, 18, 0, 5)));
  });

  it('formatTime yalnizca saat:dakika doner', () => {
    expect(formatTime(at(2026, 7, 17, 8, 5))).toBe('08:05');
    expect(formatTime('bozuk-tarih')).toBe('--:--');
  });

  it('bozuk tarih guvenli varsayilan doner, catlamaz', () => {
    expect(formatDayGroup('bozuk-tarih', NOW)).toBe('TARIH BILINMIYOR');
    expect(dayKeyOf('bozuk-tarih')).toBe('gecersiz');
  });
});
