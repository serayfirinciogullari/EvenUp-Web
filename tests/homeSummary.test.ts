import { randomUUID } from 'crypto';

import jwt from 'jsonwebtoken';
import request from 'supertest';

import app from '../src/app';
import activityModel from '../src/models/activity.model';
import expenseModel from '../src/models/expense.model';
import groupModel from '../src/models/group.model';
import settlementModel from '../src/models/settlement.model';
import userModel from '../src/models/user.model';

import type { GroupSummary } from '../src/models/group.model';
import type { PendingApprovalView } from '../src/models/settlement.model';

/**
 * `GET /users/me/home-summary` testleri.
 *
 * Bes model birden mock'lanip yerine bellek ici tablolar konuyor; geri kalan her
 * sey — routing, requireAuth, `summary.service`in gruplama/toplama mantigi,
 * 1.6'daki netlestirme, para donusumleri — gercek kod olarak calisiyor. Yani bu
 * dosya asil olarak **toplamanin dogrulugunu** ve **sorgu sayisini** test ediyor.
 */
jest.mock('../src/models/group.model', () => ({
  __esModule: true,
  default: { listForUser: jest.fn(), listContactsForUser: jest.fn() },
}));

jest.mock('../src/models/expense.model', () => ({
  __esModule: true,
  default: { listForNettingByGroups: jest.fn(), sumPaidByUserBetween: jest.fn() },
}));

jest.mock('../src/models/settlement.model', () => ({
  __esModule: true,
  default: {
    listConfirmedByGroups: jest.fn(),
    countPendingForUser: jest.fn(),
    listPendingForCreditor: jest.fn(),
  },
}));

jest.mock('../src/models/user.model', () => ({
  __esModule: true,
  default: { findActivitySeenAt: jest.fn() },
}));

jest.mock('../src/models/activity.model', () => ({
  __esModule: true,
  default: { countUnseenForGroups: jest.fn() },
}));

const mockedGroupModel = groupModel as jest.Mocked<typeof groupModel>;
const mockedExpenseModel = expenseModel as jest.Mocked<typeof expenseModel>;
const mockedSettlementModel = settlementModel as jest.Mocked<typeof settlementModel>;
const mockedUserModel = userModel as jest.Mocked<typeof userModel>;
const mockedActivityModel = activityModel as jest.Mocked<typeof activityModel>;

const TEST_JWT_SECRET = process.env.JWT_SECRET as string;

/* ------------------------------------------------------ bellek ici "tablolar" */

interface ExpenseFixture {
  id: string;
  group_id: string;
  paid_by: string;
  amount: string;
  created_at: Date;
}

interface ShareFixture {
  expense_id: string;
  user_id: string;
  share_amount: string;
}

interface ConfirmedFixture {
  id: string;
  group_id: string;
  from_user: string;
  to_user: string;
  amount: string;
}

/** `listContactsForUser` satirinin testteki karsiligi (bkz. group.model.ts -> ContactRow). */
interface ContactFixture {
  user_id: string;
  name: string;
  nickname: string | null;
  shared_groups: { id: string; name: string; slug: string; nickname: string | null }[];
}

let memberships: string[] = [];
let expenses: ExpenseFixture[] = [];
let shares: ShareFixture[] = [];
let confirmed: ConfirmedFixture[] = [];
let pendingCount = 0;
let unseenCount = 0;
let activitySeenAt: Date | undefined = new Date('2026-01-01T00:00:00.000Z');
/** "Seni bekleyenler"in BRC satirlari icin isim eslemesi — varsayilan bos. */
let contacts: ContactFixture[] = [];
/** "Seni bekleyenler"in ONY satirlari. */
let pendingApprovals: PendingApprovalView[] = [];

const uid = (): string => randomUUID();

const ME = uid();
const ALI = uid();
const BURAK = uid();

const GROUP_CREDIT = uid();
const GROUP_DEBT = uid();
const GROUP_SETTLED = uid();

const tokenFor = (userId: string): string =>
  jwt.sign({ userId, role: 'user' }, TEST_JWT_SECRET, { expiresIn: '1h' });

const auth = (userId: string): [string, string] => ['Authorization', `Bearer ${tokenFor(userId)}`];

/** Harcama + paylarini tek cagride kurar (paylarin toplami tutara esit olmali). */
const addExpense = (
  groupId: string,
  paidBy: string,
  amount: string,
  split: readonly [string, string][],
  createdAt: Date = new Date()
): void => {
  const id = uid();

  expenses.push({ id, group_id: groupId, paid_by: paidBy, amount, created_at: createdAt });

  for (const [userId, shareAmount] of split) {
    shares.push({ expense_id: id, user_id: userId, share_amount: shareAmount });
  }
};

const installInMemoryModels = (): void => {
  mockedGroupModel.listForUser.mockImplementation(async (userId: string) =>
    userId === ME
      ? memberships.map<GroupSummary>((groupId) => ({
          id: groupId,
          name: `Grup ${groupId.slice(0, 4)}`,
          slug: `grup-${groupId.slice(0, 4)}`,
          description: null,
          created_by: ME,
          created_at: new Date(),
          role: 'member',
          joined_at: new Date(),
          member_count: 2,
          member_preview: [],
          has_pending_incoming: false,
          last_activity: null,
        }))
      : []
  );

  // Gercek sorgunun semantigi: verilen gruplarin harcamalari + o harcamalarin paylari.
  mockedExpenseModel.listForNettingByGroups.mockImplementation(async (groupIds) => {
    if (groupIds.length === 0) {
      return { expenses: [], shares: [] };
    }

    const rows = expenses.filter((expense) => groupIds.includes(expense.group_id));
    const ids = new Set(rows.map((expense) => expense.id));

    return {
      expenses: rows.map(({ created_at: _createdAt, ...row }) => row),
      shares: shares.filter((share) => ids.has(share.expense_id)),
    };
  });

  // SQL SUM'in karsiligi: `[from, to)` araligi ve `paid_by` filtresi burada da
  // gercek sorguyla ayni — servisin urettigi ay sinirlari boylece test ediliyor.
  mockedExpenseModel.sumPaidByUserBetween.mockImplementation(async (userId, from, to) => {
    const cents = expenses
      .filter(
        (expense) =>
          expense.paid_by === userId && expense.created_at >= from && expense.created_at < to
      )
      .reduce((sum, expense) => sum + Math.round(Number(expense.amount) * 100), 0);

    return (cents / 100).toFixed(2);
  });

  mockedSettlementModel.listConfirmedByGroups.mockImplementation(async (groupIds) =>
    groupIds.length === 0
      ? []
      : confirmed.filter((settlement) => groupIds.includes(settlement.group_id))
  );

  mockedSettlementModel.countPendingForUser.mockImplementation(async () => pendingCount);

  mockedUserModel.findActivitySeenAt.mockImplementation(async () => activitySeenAt);
  mockedActivityModel.countUnseenForGroups.mockImplementation(async () => unseenCount);

  mockedGroupModel.listContactsForUser.mockImplementation(async (userId: string) =>
    userId === ME ? contacts : []
  );
  mockedSettlementModel.listPendingForCreditor.mockImplementation(async () => pendingApprovals);
};

/**
 * Uc gruplu senaryo:
 *
 *   GROUP_CREDIT  — ben 300 odedim, ucumuze esit bolundu   -> net +200,00
 *   GROUP_DEBT    — Ali 240 odedi, ikimize esit bolundu    -> net -120,00
 *   GROUP_SETTLED — ben 100 odedim, ikimize bolundu (+50),
 *                   Ali 50'yi odedi ve onaylandi           -> net    0,00
 *
 *   TOPLAM                                                 ->      +80,00
 */
const seedThreeGroups = (): void => {
  memberships = [GROUP_CREDIT, GROUP_DEBT, GROUP_SETTLED];

  addExpense(GROUP_CREDIT, ME, '300.00', [
    [ME, '100.00'],
    [ALI, '100.00'],
    [BURAK, '100.00'],
  ]);

  addExpense(GROUP_DEBT, ALI, '240.00', [
    [ME, '120.00'],
    [ALI, '120.00'],
  ]);

  addExpense(GROUP_SETTLED, ME, '100.00', [
    [ME, '50.00'],
    [ALI, '50.00'],
  ]);

  // Ali bana 50 odedi ve ben onayladim: GROUP_SETTLED bakiyesi kapaniyor.
  confirmed.push({
    id: uid(),
    group_id: GROUP_SETTLED,
    from_user: ALI,
    to_user: ME,
    amount: '50.00',
  });
};

beforeAll(() => {
  // Hata yoneticisi 4xx'leri warn'lar; testler bilerek 401 uretiyor.
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

beforeEach(() => {
  jest.clearAllMocks();

  memberships = [];
  expenses = [];
  shares = [];
  confirmed = [];
  pendingCount = 0;
  unseenCount = 0;
  activitySeenAt = new Date('2026-01-01T00:00:00.000Z');
  contacts = [];
  pendingApprovals = [];

  installInMemoryModels();
});

/* -------------------------------------------------------------------- erisim */

describe('GET /users/me/home-summary — erisim', () => {
  it('token olmadan 401 doner', async () => {
    const response = await request(app).get('/users/me/home-summary');

    expect(response.status).toBe(401);
    expect(mockedGroupModel.listForUser).not.toHaveBeenCalled();
  });

  it('ozet her zaman token icindeki kullaniciya ait', async () => {
    seedThreeGroups();

    await request(app)
      .get('/users/me/home-summary')
      .set(...auth(ME))
      .expect(200);

    expect(mockedGroupModel.listForUser).toHaveBeenCalledWith(ME);
  });
});

/* ------------------------------------------------------------------ toplama */

describe('GET /users/me/home-summary — toplama', () => {
  it('alacakli + borclu + dengede uc grubun net bakiyesini dogru topluyor', async () => {
    seedThreeGroups();

    const response = await request(app)
      .get('/users/me/home-summary')
      .set(...auth(ME));

    expect(response.status).toBe(200);
    // +200,00 + (-120,00) + 0,00
    expect(response.body.summary.totalNetBalance).toBe('80.00');
  });

  it('borclu taraf toplaminda negatif deger dondurebiliyor', async () => {
    memberships = [GROUP_DEBT];
    addExpense(GROUP_DEBT, ALI, '240.00', [
      [ME, '120.00'],
      [ALI, '120.00'],
    ]);

    const response = await request(app)
      .get('/users/me/home-summary')
      .set(...auth(ME));

    expect(response.body.summary.totalNetBalance).toBe('-120.00');
  });

  it('grup sayisi ve bekleyen odeme sayisi cevaba giriyor', async () => {
    seedThreeGroups();
    pendingCount = 2;

    const response = await request(app)
      .get('/users/me/home-summary')
      .set(...auth(ME));

    expect(response.body.summary.activeGroupsCount).toBe(3);
    expect(response.body.summary.pendingSettlementsCount).toBe(2);
    expect(mockedSettlementModel.countPendingForUser).toHaveBeenCalledWith(ME);
  });

  it('aylik harcama yalnizca kullanicinin odedigi ve bu ayki kayitlari sayiyor', async () => {
    memberships = [GROUP_CREDIT];

    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);

    // Bu ay, ben odedim -> sayilir
    addExpense(GROUP_CREDIT, ME, '300.00', [
      [ME, '150.00'],
      [ALI, '150.00'],
    ]);
    // Bu ay, Ali odedi -> sayilmaz
    addExpense(GROUP_CREDIT, ALI, '80.00', [
      [ME, '40.00'],
      [ALI, '40.00'],
    ]);
    // Gecen ay, ben odedim -> sayilmaz
    addExpense(
      GROUP_CREDIT,
      ME,
      '500.00',
      [
        [ME, '250.00'],
        [ALI, '250.00'],
      ],
      lastMonth
    );

    const response = await request(app)
      .get('/users/me/home-summary')
      .set(...auth(ME));

    expect(response.body.summary.monthlySpend).toBe('300.00');
  });

  it('onaylanmis odeme bakiyeyi kapatiyor, bekleyen odeme kapatmiyor', async () => {
    // `listConfirmedByGroups` yalnizca `confirmed` dondurur; bekleyen bir kayit
    // hic gelmez. Burada onaylanmis kaydin etkisi olculuyor: onsuz +50 olurdu.
    memberships = [GROUP_SETTLED];
    addExpense(GROUP_SETTLED, ME, '100.00', [
      [ME, '50.00'],
      [ALI, '50.00'],
    ]);

    const withoutSettlement = await request(app)
      .get('/users/me/home-summary')
      .set(...auth(ME));

    expect(withoutSettlement.body.summary.totalNetBalance).toBe('50.00');

    confirmed.push({
      id: uid(),
      group_id: GROUP_SETTLED,
      from_user: ALI,
      to_user: ME,
      amount: '50.00',
    });

    const withSettlement = await request(app)
      .get('/users/me/home-summary')
      .set(...auth(ME));

    expect(withSettlement.body.summary.totalNetBalance).toBe('0.00');
  });
});

/* ------------------------------------------------------------- bos durumlar */

describe('GET /users/me/home-summary — hic grubu olmayan kullanici', () => {
  it('tum alanlar 0 doner, hata vermez', async () => {
    const response = await request(app)
      .get('/users/me/home-summary')
      .set(...auth(ME));

    expect(response.status).toBe(200);
    expect(response.body.summary).toEqual({
      totalNetBalance: '0.00',
      monthlySpend: '0.00',
      activeGroupsCount: 0,
      pendingSettlementsCount: 0,
      unseenActivityCount: 0,
      pendingApprovals: [],
      pendingDebts: [],
    });
  });

  it('grubu yokken harcama/odeme sorgulari bos liste ile cagrilir', async () => {
    await request(app)
      .get('/users/me/home-summary')
      .set(...auth(ME))
      .expect(200);

    expect(mockedExpenseModel.listForNettingByGroups).toHaveBeenCalledWith([]);
    expect(mockedSettlementModel.listConfirmedByGroups).toHaveBeenCalledWith([]);
  });

  it('uyesi oldugu ama hicbir harcamasi olmayan grup bakiyeyi bozmuyor', async () => {
    memberships = [GROUP_CREDIT, GROUP_DEBT];
    addExpense(GROUP_CREDIT, ME, '100.00', [
      [ME, '50.00'],
      [ALI, '50.00'],
    ]);

    const response = await request(app)
      .get('/users/me/home-summary')
      .set(...auth(ME));

    expect(response.body.summary.totalNetBalance).toBe('50.00');
    expect(response.body.summary.activeGroupsCount).toBe(2);
  });
});

/* ------------------------------------------------------------------- N+1 */

describe('GET /users/me/home-summary — sorgu sayisi', () => {
  it('grup sayisindan bagimsiz: her model fonksiyonu bir kez cagriliyor', async () => {
    seedThreeGroups();

    await request(app)
      .get('/users/me/home-summary')
      .set(...auth(ME))
      .expect(200);

    // Asil kural bu: uc grup icin de tek tur sorgu. Grup basina cagri yapan bir
    // uygulama burada 3 gorurdu.
    expect(mockedExpenseModel.listForNettingByGroups).toHaveBeenCalledTimes(1);
    expect(mockedSettlementModel.listConfirmedByGroups).toHaveBeenCalledTimes(1);
    expect(mockedExpenseModel.sumPaidByUserBetween).toHaveBeenCalledTimes(1);
    expect(mockedSettlementModel.countPendingForUser).toHaveBeenCalledTimes(1);
    expect(mockedGroupModel.listContactsForUser).toHaveBeenCalledTimes(1);
    expect(mockedSettlementModel.listPendingForCreditor).toHaveBeenCalledTimes(1);

    // Ve gruplarin tamami tek cagriya veriliyor.
    expect(mockedExpenseModel.listForNettingByGroups).toHaveBeenCalledWith([
      GROUP_CREDIT,
      GROUP_DEBT,
      GROUP_SETTLED,
    ]);

    expect(mockedUserModel.findActivitySeenAt).toHaveBeenCalledTimes(1);
    expect(mockedActivityModel.countUnseenForGroups).toHaveBeenCalledTimes(1);
    expect(mockedActivityModel.countUnseenForGroups).toHaveBeenCalledWith(
      [GROUP_CREDIT, GROUP_DEBT, GROUP_SETTLED],
      ME,
      activitySeenAt
    );
  });
});

/* -------------------------------------------------------- okunmamis aktivite */

describe('GET /users/me/home-summary — unseenActivityCount', () => {
  it('cevaba giriyor', async () => {
    seedThreeGroups();
    unseenCount = 4;

    const response = await request(app)
      .get('/users/me/home-summary')
      .set(...auth(ME));

    expect(response.body.summary.unseenActivityCount).toBe(4);
  });

  it('kullanicinin activity_seen_at satiri hic yoksa (silinmis kullanici) 0 doner, hata firlatmaz', async () => {
    seedThreeGroups();
    activitySeenAt = undefined;

    const response = await request(app)
      .get('/users/me/home-summary')
      .set(...auth(ME));

    expect(response.status).toBe(200);
    expect(response.body.summary.unseenActivityCount).toBe(0);
    expect(mockedActivityModel.countUnseenForGroups).not.toHaveBeenCalled();
  });
});

/* --------------------------------------------------------- seni bekleyenler */

describe('GET /users/me/home-summary — pendingApprovals (ONY)', () => {
  it('listPendingForCreditor sonucunu oldugu gibi dondurur', async () => {
    seedThreeGroups();
    pendingApprovals = [
      {
        id: uid(),
        group_id: GROUP_CREDIT,
        group_name: `Grup ${GROUP_CREDIT.slice(0, 4)}`,
        from_user: ALI,
        from_name: 'Ali',
        amount: '75.00',
        created_at: new Date('2026-01-10T00:00:00.000Z'),
      },
    ];

    const response = await request(app)
      .get('/users/me/home-summary')
      .set(...auth(ME));

    expect(response.body.summary.pendingApprovals).toHaveLength(1);
    expect(response.body.summary.pendingApprovals[0]).toMatchObject({
      from_name: 'Ali',
      amount: '75.00',
    });
  });
});

describe('GET /users/me/home-summary — pendingDebts (BRC)', () => {
  it('net borclu oldugum grupta netlesmis transferi kisi adiyla doner', async () => {
    seedThreeGroups();
    contacts = [
      {
        user_id: ALI,
        name: 'Ali',
        nickname: null,
        shared_groups: [
          { id: GROUP_DEBT, name: 'Grup', slug: 'grup', nickname: null },
        ],
      },
    ];

    const response = await request(app)
      .get('/users/me/home-summary')
      .set(...auth(ME));

    // GROUP_DEBT: Ali 240 odedi, ikimize esit bolundu -> ben Ali'ye 120 borcluyum.
    expect(response.body.summary.pendingDebts).toEqual([
      {
        group_id: GROUP_DEBT,
        group_name: `Grup ${GROUP_DEBT.slice(0, 4)}`,
        to_user: ALI,
        to_user_name: 'Ali',
        amount: '120.00',
      },
    ]);
  });

  it('takma isim varsa gercek adin yerine gecer', async () => {
    seedThreeGroups();
    contacts = [
      {
        user_id: ALI,
        name: 'Ali',
        nickname: 'Aliş',
        shared_groups: [
          { id: GROUP_DEBT, name: 'Grup', slug: 'grup', nickname: 'Aliş' },
        ],
      },
    ];

    const response = await request(app)
      .get('/users/me/home-summary')
      .set(...auth(ME));

    expect(response.body.summary.pendingDebts[0].to_user_name).toBe('Aliş');
  });

  it('net alacakli ya da dengede oldugum gruplar icin satir uretilmez', async () => {
    seedThreeGroups();
    // Ucu de kapsayan bir isim listesi versek bile GROUP_CREDIT (+200) ve
    // GROUP_SETTLED (0) icin satir cikmamali — yalnizca GROUP_DEBT (-120) icin.
    contacts = [
      {
        user_id: ALI,
        name: 'Ali',
        nickname: null,
        shared_groups: [
          { id: GROUP_CREDIT, name: 'Grup', slug: 'grup', nickname: null },
          { id: GROUP_DEBT, name: 'Grup', slug: 'grup', nickname: null },
          { id: GROUP_SETTLED, name: 'Grup', slug: 'grup', nickname: null },
        ],
      },
      {
        user_id: BURAK,
        name: 'Burak',
        nickname: null,
        shared_groups: [{ id: GROUP_CREDIT, name: 'Grup', slug: 'grup', nickname: null }],
      },
    ];

    const response = await request(app)
      .get('/users/me/home-summary')
      .set(...auth(ME));

    expect(response.body.summary.pendingDebts).toHaveLength(1);
    expect(response.body.summary.pendingDebts[0].group_id).toBe(GROUP_DEBT);
  });

  /**
   * `namesByGroupFromContacts` yalnizca **hala grupta olan** kisileri tasir
   * (`listContactsForUser` uyelik tablosundan geliyor). Karsi taraf gruptan
   * cikarilmissa ad bulunamaz; bu durumda satir hic uretilmiyor, "Hesabi
   * kapat"i kimin icin gosterecegini bilemeyen bir satir yerine.
   */
  it('borclu oldugum kisinin adi bulunamiyorsa (gruptan cikarilmis) satir uretilmez', async () => {
    seedThreeGroups();
    contacts = [];

    const response = await request(app)
      .get('/users/me/home-summary')
      .set(...auth(ME));

    expect(response.body.summary.pendingDebts).toEqual([]);
    // Toplam bakiye yine de dogru: isim eksikligi yalnizca satir uretimini
    // engelliyor, `totalNetBalance`i etkilemiyor.
    expect(response.body.summary.totalNetBalance).toBe('80.00');
  });
});
