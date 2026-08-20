import { randomUUID } from 'crypto';

import jwt from 'jsonwebtoken';
import request from 'supertest';

import app from '../src/app';
import expenseModel from '../src/models/expense.model';
import groupModel from '../src/models/group.model';
import settlementModel from '../src/models/settlement.model';

import type { ContactRow } from '../src/models/group.model';
import type { GroupSummary } from '../src/models/group.model';

/**
 * `GET /users/me/contacts` testleri.
 *
 * Uc model mock'lanip yerine bellek ici tablolar konuyor (`homeSummary.test.ts`
 * ile ayni desen); gercek kod olan kisim tam olarak test edilmek istenen kisim:
 * `contacts.service`teki kisi-bazli (netlestirme DEGIL) bakiye aritmetigi.
 * Gerekce docs/decisions/kisiler-sayfasi.md icinde.
 */
jest.mock('../src/models/group.model', () => ({
  __esModule: true,
  default: { listForUser: jest.fn(), listContactsForUser: jest.fn() },
}));

jest.mock('../src/models/expense.model', () => ({
  __esModule: true,
  default: { listForNettingByGroups: jest.fn() },
}));

jest.mock('../src/models/settlement.model', () => ({
  __esModule: true,
  default: { listConfirmedByGroups: jest.fn() },
}));

const mockedGroupModel = groupModel as jest.Mocked<typeof groupModel>;
const mockedExpenseModel = expenseModel as jest.Mocked<typeof expenseModel>;
const mockedSettlementModel = settlementModel as jest.Mocked<typeof settlementModel>;

const TEST_JWT_SECRET = process.env.JWT_SECRET as string;

/* ------------------------------------------------------ bellek ici "tablolar" */

interface ExpenseFixture {
  id: string;
  group_id: string;
  paid_by: string;
  amount: string;
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

let memberships: string[] = [];
let contactRows: ContactRow[] = [];
let expenses: ExpenseFixture[] = [];
let shares: ShareFixture[] = [];
let confirmed: ConfirmedFixture[] = [];

const uid = (): string => randomUUID();

const ME = uid();
const ECE = uid();
const ALI = uid();

const GROUP_A = uid();
const GROUP_B = uid();

const tokenFor = (userId: string): string =>
  jwt.sign({ userId, role: 'user' }, TEST_JWT_SECRET, { expiresIn: '1h' });

const auth = (userId: string): [string, string] => ['Authorization', `Bearer ${tokenFor(userId)}`];

const addExpense = (
  groupId: string,
  paidBy: string,
  amount: string,
  split: readonly [string, string][]
): void => {
  const id = uid();
  expenses.push({ id, group_id: groupId, paid_by: paidBy, amount });
  for (const [userId, shareAmount] of split) {
    shares.push({ expense_id: id, user_id: userId, share_amount: shareAmount });
  }
};

const addConfirmed = (groupId: string, fromUser: string, toUser: string, amount: string): void => {
  confirmed.push({ id: uid(), group_id: groupId, from_user: fromUser, to_user: toUser, amount });
};

const installInMemoryModels = (): void => {
  mockedGroupModel.listForUser.mockImplementation(async (userId: string) =>
    userId === ME
      ? (memberships.map<GroupSummary>((groupId) => ({
          id: groupId,
          name: `Grup ${groupId.slice(0, 4)}`,
          slug: groupId.slice(0, 4),
          description: null,
          created_by: ME,
          created_at: new Date(),
          role: 'member',
          joined_at: new Date(),
          member_count: 2,
          member_preview: [],
          has_pending_incoming: false,
          last_activity: null,
        })) as GroupSummary[])
      : []
  );

  mockedGroupModel.listContactsForUser.mockImplementation(async (userId: string) =>
    userId === ME ? contactRows : []
  );

  mockedExpenseModel.listForNettingByGroups.mockImplementation(async (groupIds) => {
    if (groupIds.length === 0) {
      return { expenses: [], shares: [] };
    }
    const rows = expenses.filter((expense) => groupIds.includes(expense.group_id));
    const ids = new Set(rows.map((expense) => expense.id));
    return {
      expenses: rows,
      shares: shares.filter((share) => ids.has(share.expense_id)),
    };
  });

  mockedSettlementModel.listConfirmedByGroups.mockImplementation(async (groupIds) =>
    groupIds.length === 0
      ? []
      : confirmed.filter((settlement) => groupIds.includes(settlement.group_id))
  );
};

beforeAll(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

beforeEach(() => {
  jest.clearAllMocks();
  memberships = [];
  contactRows = [];
  expenses = [];
  shares = [];
  confirmed = [];
  installInMemoryModels();
});

describe('GET /users/me/contacts — erisim', () => {
  it('token olmadan 401 doner', async () => {
    const response = await request(app).get('/users/me/contacts');
    expect(response.status).toBe(401);
    expect(mockedGroupModel.listContactsForUser).not.toHaveBeenCalled();
  });
});

describe('GET /users/me/contacts — kisi-bazli bakiye (netlestirme DEGIL)', () => {
  it('tek grupta basit bir harcamadan dogru kisi bakiyesi hesaplar', async () => {
    memberships = [GROUP_A];
    contactRows = [
      {
        user_id: ECE,
        name: 'Ece',
        nickname: null,
        shared_groups: [{ id: GROUP_A, name: 'Grup A', slug: 'grup-a', nickname: null }],
      },
    ];
    // Ben 100 odedim, ikimize esit bolundu -> Ece bana 50 borclu.
    addExpense(GROUP_A, ME, '100.00', [
      [ME, '50.00'],
      [ECE, '50.00'],
    ]);

    const response = await request(app).get('/users/me/contacts').set(...auth(ME));

    expect(response.status).toBe(200);
    expect(response.body.contacts).toEqual([
      expect.objectContaining({
        user_id: ECE,
        net_balance: '50.00',
        shared_groups: [expect.objectContaining({ id: GROUP_A, net_balance: '50.00' })],
      }),
    ]);
  });

  it('IKI grupta toplam dogru topluyor', async () => {
    memberships = [GROUP_A, GROUP_B];
    contactRows = [
      {
        user_id: ECE,
        name: 'Ece',
        nickname: null,
        shared_groups: [
          { id: GROUP_A, name: 'Grup A', slug: 'grup-a', nickname: null },
          { id: GROUP_B, name: 'Grup B', slug: 'grup-b', nickname: null },
        ],
      },
    ];
    // Grup A: Ece bana 50 borclu. Grup B: ben Ece'ye 20 borcluyum. Toplam: +30.
    addExpense(GROUP_A, ME, '100.00', [
      [ME, '50.00'],
      [ECE, '50.00'],
    ]);
    addExpense(GROUP_B, ECE, '40.00', [
      [ME, '20.00'],
      [ECE, '20.00'],
    ]);

    const response = await request(app).get('/users/me/contacts').set(...auth(ME));

    const ece = response.body.contacts[0];
    expect(ece.net_balance).toBe('30.00');
    expect(ece.shared_groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: GROUP_A, net_balance: '50.00' }),
        expect.objectContaining({ id: GROUP_B, net_balance: '-20.00' }),
      ])
    );
  });

  it('ucuncu bir kisinin payi bu kisinin bakiyesini etkilemez', async () => {
    memberships = [GROUP_A];
    contactRows = [
      {
        user_id: ECE,
        name: 'Ece',
        nickname: null,
        shared_groups: [{ id: GROUP_A, name: 'Grup A', slug: 'grup-a', nickname: null }],
      },
      {
        user_id: ALI,
        name: 'Ali',
        nickname: null,
        shared_groups: [{ id: GROUP_A, name: 'Grup A', slug: 'grup-a', nickname: null }],
      },
    ];
    // Ben 300 odedim, uc kisiye esit bolundu (100/100/100).
    addExpense(GROUP_A, ME, '300.00', [
      [ME, '100.00'],
      [ECE, '100.00'],
      [ALI, '100.00'],
    ]);

    const response = await request(app).get('/users/me/contacts').set(...auth(ME));

    const byId = Object.fromEntries(
      response.body.contacts.map((contact: { user_id: string; net_balance: string }) => [
        contact.user_id,
        contact.net_balance,
      ])
    );
    // Ece'nin bakiyesi Ali'nin payindan ETKILENMEMELI.
    expect(byId[ECE]).toBe('100.00');
    expect(byId[ALI]).toBe('100.00');
  });

  it('onaylanmis odeme (sanal harcama) bakiyeyi dogru kapatir', async () => {
    memberships = [GROUP_A];
    contactRows = [
      {
        user_id: ECE,
        name: 'Ece',
        nickname: null,
        shared_groups: [{ id: GROUP_A, name: 'Grup A', slug: 'grup-a', nickname: null }],
      },
    ];
    addExpense(GROUP_A, ME, '100.00', [
      [ME, '50.00'],
      [ECE, '50.00'],
    ]);
    // Ece bana 50 odedi ve onayladim -> bakiye kapanmali.
    addConfirmed(GROUP_A, ECE, ME, '50.00');

    const response = await request(app).get('/users/me/contacts').set(...auth(ME));

    expect(response.body.contacts[0].net_balance).toBe('0.00');
    expect(response.body.contacts[0].shared_groups[0].net_balance).toBe('0.00');
  });

  it('bekleyen (onaylanmamis) odeme bakiyeyi ETKILEMEZ — yalnizca confirmed sayilir', async () => {
    // `listConfirmedByGroups` zaten yalnizca confirmed doner (mock bunu taklit
    // ediyor); bu test o sozlesmenin servis tarafinda da bozulmadigini kanitlar.
    memberships = [GROUP_A];
    contactRows = [
      {
        user_id: ECE,
        name: 'Ece',
        nickname: null,
        shared_groups: [{ id: GROUP_A, name: 'Grup A', slug: 'grup-a', nickname: null }],
      },
    ];
    addExpense(GROUP_A, ME, '100.00', [
      [ME, '50.00'],
      [ECE, '50.00'],
    ]);
    // `confirmed` fixture'ina hic eklenmiyor -> bekleyen bir odeme simule ediliyor.

    const response = await request(app).get('/users/me/contacts').set(...auth(ME));

    expect(response.body.contacts[0].net_balance).toBe('50.00');
  });

  it('ortak grubu olmayan kisi listeye hic girmez', async () => {
    memberships = [GROUP_A];
    contactRows = []; // group.model zaten filtreliyor; servis buna guveniyor.

    const response = await request(app).get('/users/me/contacts').set(...auth(ME));

    expect(response.body.contacts).toEqual([]);
  });

  it('sorgu sayisi grup/kisi sayisindan bagimsiz: her model fonksiyonu bir kez cagrilir', async () => {
    memberships = [GROUP_A, GROUP_B];
    contactRows = [
      {
        user_id: ECE,
        name: 'Ece',
        nickname: null,
        shared_groups: [
          { id: GROUP_A, name: 'Grup A', slug: 'grup-a', nickname: null },
          { id: GROUP_B, name: 'Grup B', slug: 'grup-b', nickname: null },
        ],
      },
      {
        user_id: ALI,
        name: 'Ali',
        nickname: null,
        shared_groups: [{ id: GROUP_A, name: 'Grup A', slug: 'grup-a', nickname: null }],
      },
    ];

    await request(app).get('/users/me/contacts').set(...auth(ME)).expect(200);

    expect(mockedGroupModel.listForUser).toHaveBeenCalledTimes(1);
    expect(mockedGroupModel.listContactsForUser).toHaveBeenCalledTimes(1);
    expect(mockedExpenseModel.listForNettingByGroups).toHaveBeenCalledTimes(1);
    expect(mockedSettlementModel.listConfirmedByGroups).toHaveBeenCalledTimes(1);
  });
});

describe('GET /users/me/contacts — takma isim', () => {
  it('ortak grup + takma isim (varsa) cevaba giriyor', async () => {
    memberships = [GROUP_A];
    contactRows = [
      {
        user_id: ECE,
        name: 'Ece',
        nickname: 'Ev Arkadasi',
        shared_groups: [
          { id: GROUP_A, name: 'Grup A', slug: 'grup-a', nickname: 'Ev Arkadasi' },
        ],
      },
    ];

    const response = await request(app).get('/users/me/contacts').set(...auth(ME));

    expect(response.body.contacts[0]).toMatchObject({
      name: 'Ece',
      nickname: 'Ev Arkadasi',
    });
    expect(response.body.contacts[0].shared_groups[0].nickname).toBe('Ev Arkadasi');
  });
});
