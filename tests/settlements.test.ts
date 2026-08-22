import { randomUUID } from 'crypto';

import jwt from 'jsonwebtoken';
import request from 'supertest';

import app from '../src/app';
import expenseModel from '../src/models/expense.model';
import groupModel from '../src/models/group.model';
import settlementModel from '../src/models/settlement.model';

import type { GroupMemberView } from '../src/models/group.model';
import type { SettlementCounts } from '../src/models/settlement.model';
import type {
  ExpenseRow,
  ExpenseShareRow,
  GroupMemberRow,
  GroupRow,
  SettlementRow,
} from '../src/types/models';

/**
 * Odeme (settlement) akisi ve bakiye testleri.
 *
 * Veri katmani (group/expense/settlement model) mock'lanip yerine bellek ici
 * tablolar konuyor: testler calisan bir PostgreSQL istemez. Mock'lanmayan her
 * sey gercek kod: routing, requireAuth, validasyon, **tum yetki kontrolleri**,
 * netlestirme algoritmasi (1.6) ve hata yoneticisi.
 *
 * Dosyanin asil derdi tek bir kural:
 *
 *     pending bir odeme kaydi bakiyeyi ETKILEMEZ.
 *     Yalnizca alacaklinin onayladigi (confirmed) kayit netlestirmeye girer.
 */
jest.mock('../src/models/group.model', () => ({
  __esModule: true,
  default: {
    findById: jest.fn(),
    findMembership: jest.fn(),
    listForUser: jest.fn(),
    listMembers: jest.fn(),
    listMemberIds: jest.fn(),
    createWithOwner: jest.fn(),
    removeMember: jest.fn(),
    softDelete: jest.fn(),
    findActiveInvite: jest.fn(),
    issueInvite: jest.fn(),
    redeemInvite: jest.fn(),
  },
}));

jest.mock('../src/models/expense.model', () => ({
  __esModule: true,
  default: {
    findById: jest.fn(),
    findWithShares: jest.fn(),
    listByGroup: jest.fn(),
    listForNetting: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    sumGroupAmountBetween: jest.fn(),
    sumGroupPaidByUserBetween: jest.fn(),
    sumGroupShareForUserBetween: jest.fn(),
  },
}));

jest.mock('../src/models/settlement.model', () => ({
  __esModule: true,
  default: {
    findById: jest.fn(),
    findPendingBetween: jest.fn(),
    listByGroup: jest.fn(),
    listConfirmed: jest.fn(),
    countByStatus: jest.fn(),
    listPendingForCreditor: jest.fn(),
    create: jest.fn(),
    resolve: jest.fn(),
  },
}));

const mockedGroupModel = groupModel as jest.Mocked<typeof groupModel>;
const mockedExpenseModel = expenseModel as jest.Mocked<typeof expenseModel>;
const mockedSettlementModel = settlementModel as jest.Mocked<typeof settlementModel>;

const TEST_JWT_SECRET = process.env.JWT_SECRET as string;

/* ------------------------------------------------------ bellek ici "tablolar" */

interface TestUser {
  id: string;
  name: string;
  email: string;
  token: string;
}

const users = new Map<string, TestUser>();
let groups: GroupRow[] = [];
let members: GroupMemberRow[] = [];
let expenses: ExpenseRow[] = [];
let shares: ExpenseShareRow[] = [];
let settlements: SettlementRow[] = [];

const makeUser = (name: string): TestUser => {
  const id = randomUUID();
  const user: TestUser = {
    id,
    name,
    email: `${name.toLowerCase()}@evenup.dev`,
    token: jwt.sign({ userId: id, role: 'user' }, TEST_JWT_SECRET, { expiresIn: '1h' }),
  };

  users.set(id, user);
  return user;
};

const auth = (user: TestUser): [string, string] => ['Authorization', `Bearer ${user.token}`];

/** Grup + uyelikleri dogrudan bellege yazar; grup akisi 1.4'te ayrica test ediliyor. */
const makeGroup = (owner: TestUser, ...rest: TestUser[]): GroupRow => {
  const group: GroupRow = {
    id: randomUUID(),
    name: 'Ev Arkadaslari',
    slug: 'ev-arkadaslari',
    description: null,
    created_by: owner.id,
    deleted_at: null,
    created_at: new Date(),
  };

  groups.push(group);
  members.push({
    id: randomUUID(),
    group_id: group.id,
    user_id: owner.id,
    role: 'owner',
    joined_at: new Date(),
  });

  for (const user of rest) {
    members.push({
      id: randomUUID(),
      group_id: group.id,
      user_id: user.id,
      role: 'member',
      joined_at: new Date(),
    });
  }

  return group;
};

/** "X odedi, su kisiler arasinda su tutarlarda bolundu" satirlarini bellege yazar. */
const addExpense = (
  groupId: string,
  paidBy: TestUser,
  amount: string,
  split: readonly [TestUser, string][],
  /** "Bu ay"/"gecen ay" filtresini test edebilmek icin (bkz. "Bu ay ozeti"). */
  createdAt: Date = new Date()
): ExpenseRow => {
  const expense: ExpenseRow = {
    id: randomUUID(),
    group_id: groupId,
    paid_by: paidBy.id,
    created_by: paidBy.id,
    amount,
    description: 'Test harcamasi',
    category: 'genel',
    split_type: 'equal',
    created_at: createdAt,
    updated_at: createdAt,
    deleted_at: null,
  };

  expenses.push(expense);

  for (const [user, shareAmount] of split) {
    shares.push({
      id: randomUUID(),
      expense_id: expense.id,
      user_id: user.id,
      share_amount: shareAmount,
    });
  }

  return expense;
};

/** Model fonksiyonlarinin bellek ici karsiliklari (gercek SQL semantigi ile ayni). */
const installInMemoryModel = (): void => {
  mockedGroupModel.findById.mockImplementation(async (groupId: string) =>
    groups.find((group) => group.id === groupId && group.deleted_at === null)
  );

  mockedGroupModel.findMembership.mockImplementation(async (groupId: string, userId: string) =>
    members.find((member) => member.group_id === groupId && member.user_id === userId)
  );

  // Bu dosyada takma isim senaryosu yok; alan `null` — gercek sorgunun
  // takma ismi olmayan uye icin dondurdugu deger.
  mockedGroupModel.listMembers.mockImplementation(async (groupId: string) =>
    members
      .filter((member) => member.group_id === groupId)
      .map<GroupMemberView>((member) => {
        const user = users.get(member.user_id) as TestUser;
        return {
          user_id: member.user_id,
          name: user.name,
          email: user.email,
          role: member.role,
          joined_at: member.joined_at,
          nickname: null,
        };
      })
  );

  mockedGroupModel.listMemberIds.mockImplementation(async (groupId: string) =>
    members.filter((member) => member.group_id === groupId).map((member) => member.user_id)
  );

  // Silinmis harcama ve silinmis grubun harcamasi netlestirmeye girmez.
  mockedExpenseModel.listForNetting.mockImplementation(async (groupId: string) => {
    const alive = expenses.filter(
      (expense) =>
        expense.group_id === groupId &&
        expense.deleted_at === null &&
        groups.some((group) => group.id === expense.group_id && group.deleted_at === null)
    );
    const ids = new Set(alive.map((expense) => expense.id));

    return {
      expenses: alive.map((expense) => ({
        id: expense.id,
        paid_by: expense.paid_by,
        amount: expense.amount,
      })),
      shares: shares
        .filter((share) => ids.has(share.expense_id))
        .map((share) => ({
          expense_id: share.expense_id,
          user_id: share.user_id,
          share_amount: share.share_amount,
        })),
    };
  });

  const aliveSettlements = (): SettlementRow[] =>
    settlements.filter((settlement) =>
      groups.some((group) => group.id === settlement.group_id && group.deleted_at === null)
    );

  mockedSettlementModel.findById.mockImplementation(async (settlementId: string) =>
    aliveSettlements().find((settlement) => settlement.id === settlementId)
  );

  mockedSettlementModel.findPendingBetween.mockImplementation(
    async (groupId: string, fromUser: string, toUser: string) =>
      aliveSettlements().find(
        (settlement) =>
          settlement.group_id === groupId &&
          settlement.from_user === fromUser &&
          settlement.to_user === toUser &&
          settlement.status === 'pending'
      )
  );

  // Arayuzun okudugu liste. Gercek sorgudaki siralama (created_at DESC, id DESC),
  // status filtresi ve sayfalama penceresi burada da ayni.
  mockedSettlementModel.listByGroup.mockImplementation(async (groupId, filter) => {
    const rows = aliveSettlements()
      .filter(
        (settlement) =>
          settlement.group_id === groupId &&
          (filter.status === undefined || settlement.status === filter.status)
      )
      .sort(
        (a, b) =>
          b.created_at.getTime() - a.created_at.getTime() ||
          (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
      );

    return {
      settlements: rows.slice(filter.offset, filter.offset + filter.limit).map((settlement) => ({
        ...settlement,
        from_name: (users.get(settlement.from_user) as TestUser).name,
        to_name: (users.get(settlement.to_user) as TestUser).name,
      })),
      total: rows.length,
    };
  });

  // 1.7'nin en kritik filtresi: yalnizca confirmed kayitlar.
  mockedSettlementModel.listConfirmed.mockImplementation(async (groupId: string) =>
    aliveSettlements()
      .filter((settlement) => settlement.group_id === groupId && settlement.status === 'confirmed')
      .map((settlement) => ({
        id: settlement.id,
        from_user: settlement.from_user,
        to_user: settlement.to_user,
        amount: settlement.amount,
      }))
  );

  mockedSettlementModel.countByStatus.mockImplementation(async (groupId: string) => {
    const counts: SettlementCounts = { pending: 0, confirmed: 0, rejected: 0 };

    for (const settlement of aliveSettlements()) {
      if (settlement.group_id === groupId) {
        counts[settlement.status] += 1;
      }
    }

    return counts;
  });

  // Gercek sorgudaki filtre: yalnizca `to_user = <istekte bulunan>` VE
  // `status = 'pending'`; siralama en eski once (bkz. settlement.model).
  mockedSettlementModel.listPendingForCreditor.mockImplementation(
    async (userId: string, limit: number) =>
      aliveSettlements()
        .filter((settlement) => settlement.to_user === userId && settlement.status === 'pending')
        .sort(
          (a, b) =>
            a.created_at.getTime() - b.created_at.getTime() || (a.id < b.id ? -1 : 1)
        )
        .slice(0, limit)
        .map((settlement) => ({
          id: settlement.id,
          group_id: settlement.group_id,
          group_name: (groups.find((row) => row.id === settlement.group_id) as GroupRow).name,
          from_user: settlement.from_user,
          from_name: (users.get(settlement.from_user) as TestUser).name,
          amount: settlement.amount,
          created_at: settlement.created_at,
        }))
  );

  mockedSettlementModel.create.mockImplementation(async (input) => {
    const settlement: SettlementRow = {
      id: randomUUID(),
      group_id: input.group_id,
      from_user: input.from_user,
      to_user: input.to_user,
      // Model kurusu NUMERIC metnine cevirir; bellek ici karsiligi da oyle.
      amount: (input.amount_cents / 100).toFixed(2),
      status: 'pending',
      created_at: new Date(),
      confirmed_at: null,
      rejected_at: null,
    };

    settlements.push(settlement);
    return settlement;
  });

  // Gercek sorgudaki `WHERE status = 'pending'` sartinin bellek ici karsiligi.
  mockedSettlementModel.resolve.mockImplementation(
    async (settlementId: string, status: 'confirmed' | 'rejected') => {
      const settlement = settlements.find(
        (row) => row.id === settlementId && row.status === 'pending'
      );

      if (!settlement) {
        return undefined;
      }

      settlement.status = status;
      settlement.confirmed_at = status === 'confirmed' ? new Date() : null;
      settlement.rejected_at = status === 'rejected' ? new Date() : null;

      return settlement;
    }
  );

  /*
    Uc yeni sorgu da ayni "canli harcama, [from,to) araligi" suzgecini
    paylasiyor; gercek SQL'in yaptigi filtreyi burada tekrarliyoruz (SUM'in
    kendisi degil, WHERE kosullari — bkz. homeSummary.test.ts'teki ayni desen).
  */
  const aliveExpensesBetween = (groupId: string, from: Date, to: Date): ExpenseRow[] =>
    expenses.filter(
      (expense) =>
        expense.group_id === groupId &&
        expense.deleted_at === null &&
        expense.created_at >= from &&
        expense.created_at < to &&
        groups.some((group) => group.id === expense.group_id && group.deleted_at === null)
    );

  const sumCents = (rows: readonly { amount: string }[]): number =>
    rows.reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0);

  mockedExpenseModel.sumGroupAmountBetween.mockImplementation(async (groupId, from, to) =>
    (sumCents(aliveExpensesBetween(groupId, from, to)) / 100).toFixed(2)
  );

  mockedExpenseModel.sumGroupPaidByUserBetween.mockImplementation(async (groupId, userId, from, to) =>
    (
      sumCents(aliveExpensesBetween(groupId, from, to).filter((expense) => expense.paid_by === userId)) /
      100
    ).toFixed(2)
  );

  mockedExpenseModel.sumGroupShareForUserBetween.mockImplementation(
    async (groupId, userId, from, to) => {
      const ids = new Set(aliveExpensesBetween(groupId, from, to).map((expense) => expense.id));
      const rows = shares.filter((share) => ids.has(share.expense_id) && share.user_id === userId);

      return (sumCents(rows.map((share) => ({ amount: share.share_amount }))) / 100).toFixed(2);
    }
  );
};

/* -------------------------------------------------------------- yardimcilar */

interface BalanceBody {
  balances: { user_id: string; name: string | null; net_balance: string }[];
  transfers: { from_user: string; to_user: string; amount: string }[];
  meta: {
    expense_count: number;
    confirmed_settlement_count: number;
    pending_settlement_count: number;
    rejected_settlement_count: number;
    algorithm: string;
  };
}

const getBalances = async (user: TestUser, groupId: string): Promise<BalanceBody> => {
  const response = await request(app)
    .get(`/groups/${groupId}/balances`)
    .set(...auth(user));

  expect(response.status).toBe(200);
  return response.body as BalanceBody;
};

const balanceOf = (body: BalanceBody, user: TestUser): string =>
  body.balances.find((balance) => balance.user_id === user.id)?.net_balance ?? 'YOK';

const transferBetween = (body: BalanceBody, from: TestUser, to: TestUser): string | undefined =>
  body.transfers.find((transfer) => transfer.from_user === from.id && transfer.to_user === to.id)
    ?.amount;

const createSettlement = async (
  user: TestUser,
  groupId: string,
  body: Record<string, unknown>
): Promise<SettlementRow> => {
  const response = await request(app)
    .post(`/groups/${groupId}/settlements`)
    .set(...auth(user))
    .send(body);

  expect(response.status).toBe(201);
  return response.body.settlement as SettlementRow;
};

/* ------------------------------------------------------------------ kurulum */

let ali: TestUser;
let burak: TestUser;
let cem: TestUser;
let disaridaki: TestUser;
let group: GroupRow;

beforeEach(() => {
  users.clear();
  groups = [];
  members = [];
  expenses = [];
  shares = [];
  settlements = [];

  installInMemoryModel();

  ali = makeUser('Ali');
  burak = makeUser('Burak');
  cem = makeUser('Cem');
  disaridaki = makeUser('Disaridaki');

  group = makeGroup(ali, burak, cem);

  // Ali 300 TL odedi, ucu arasinda esit bolundu.
  // Net: Ali +200.00, Burak -100.00, Cem -100.00
  addExpense(group.id, ali, '300.00', [
    [ali, '100.00'],
    [burak, '100.00'],
    [cem, '100.00'],
  ]);
});

/* ==================================================== bakiye (baslangic) */

describe('GET /groups/:id/balances', () => {
  it('harcamalardan net bakiyeyi ve transfer listesini uretir', async () => {
    const body = await getBalances(ali, group.id);

    expect(balanceOf(body, ali)).toBe('200.00');
    expect(balanceOf(body, burak)).toBe('-100.00');
    expect(balanceOf(body, cem)).toBe('-100.00');

    expect(body.transfers).toHaveLength(2);
    expect(transferBetween(body, burak, ali)).toBe('100.00');
    expect(transferBetween(body, cem, ali)).toBe('100.00');
  });

  it('uye olmayan kullanici bakiyeyi goremez', async () => {
    const response = await request(app)
      .get(`/groups/${group.id}/balances`)
      .set(...auth(disaridaki));

    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Bu gruba erisim yetkiniz yok');
  });

  it('token olmadan 403 degil 401 doner', async () => {
    const response = await request(app).get(`/groups/${group.id}/balances`);

    expect(response.status).toBe(401);
  });
});

/* ==================================================== Bu ay ozeti */

describe('GET /groups/:id/monthly-summary', () => {
  it('grubun bu ayki toplamini, senin payini ve senin odedigini doner', async () => {
    const response = await request(app)
      .get(`/groups/${group.id}/monthly-summary`)
      .set(...auth(ali));

    expect(response.status).toBe(200);
    expect(response.body.summary).toEqual({
      totalSpend: '300.00',
      myShare: '100.00',
      myPaid: '300.00',
    });
  });

  it('hic odemeyen bir uyede myPaid sifir, myShare yine de dolu', async () => {
    const response = await request(app)
      .get(`/groups/${group.id}/monthly-summary`)
      .set(...auth(burak));

    expect(response.status).toBe(200);
    expect(response.body.summary).toEqual({
      totalSpend: '300.00',
      myShare: '100.00',
      myPaid: '0.00',
    });
  });

  it('gecen aya ait harcama toplama girmez', async () => {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);

    // Bu ay, Burak odedi -> toplama ve Ali'nin payina girer.
    addExpense(group.id, burak, '90.00', [
      [ali, '30.00'],
      [burak, '30.00'],
      [cem, '30.00'],
    ]);
    // Gecen ay, Ali odedi -> uc alanin hicbirine girmez.
    addExpense(
      group.id,
      ali,
      '1000.00',
      [
        [ali, '500.00'],
        [burak, '500.00'],
      ],
      lastMonth
    );

    const response = await request(app)
      .get(`/groups/${group.id}/monthly-summary`)
      .set(...auth(ali));

    expect(response.body.summary).toEqual({
      totalSpend: '390.00',
      myShare: '130.00',
      myPaid: '300.00',
    });
  });

  it('uye olmayan kullanici goremez', async () => {
    const response = await request(app)
      .get(`/groups/${group.id}/monthly-summary`)
      .set(...auth(disaridaki));

    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Bu gruba erisim yetkiniz yok');
  });

  it('token olmadan 403 degil 401 doner', async () => {
    const response = await request(app).get(`/groups/${group.id}/monthly-summary`);

    expect(response.status).toBe(401);
  });
});

/* ======================================== KRITIK: pending bakiyeyi etkilemez */

describe('pending odeme bakiyeyi etkilemez', () => {
  it('bekleyen odeme olusturmak net bakiyeyi degistirmez', async () => {
    const before = await getBalances(ali, group.id);

    await createSettlement(burak, group.id, { toUserId: ali.id, amount: '100.00' });

    const after = await getBalances(ali, group.id);

    expect(balanceOf(after, ali)).toBe(balanceOf(before, ali));
    expect(balanceOf(after, burak)).toBe(balanceOf(before, burak));
    expect(after.transfers).toEqual(before.transfers);
  });

  it('bekleyen odeme transfer listesinden dusulmez', async () => {
    await createSettlement(burak, group.id, { toUserId: ali.id, amount: '100.00' });

    const body = await getBalances(burak, group.id);

    // Odeme henuz onaylanmadi: Burak hala 100 TL borclu gorunmeli.
    expect(transferBetween(body, burak, ali)).toBe('100.00');
    expect(body.meta.pending_settlement_count).toBe(1);
    expect(body.meta.confirmed_settlement_count).toBe(0);
  });

  it('kayit her zaman pending baslar; govdede confirmed gonderilse bile', async () => {
    const settlement = await createSettlement(burak, group.id, {
      toUserId: ali.id,
      amount: '100.00',
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
    });

    expect(settlement.status).toBe('pending');
    expect(settlement.confirmed_at).toBeNull();

    const body = await getBalances(ali, group.id);
    expect(balanceOf(body, burak)).toBe('-100.00');
  });
});

/* ============================================================ onay akisi */

describe('PUT /settlements/:id/confirm', () => {
  it('alacakli onaylayinca bakiye ANINDA guncellenir', async () => {
    const settlement = await createSettlement(burak, group.id, {
      toUserId: ali.id,
      amount: '100.00',
    });

    const response = await request(app)
      .put(`/settlements/${settlement.id}/confirm`)
      .set(...auth(ali));

    expect(response.status).toBe(200);
    expect(response.body.settlement.status).toBe('confirmed');
    expect(response.body.settlement.confirmed_at).not.toBeNull();

    const body = await getBalances(ali, group.id);

    // Burak borcunu odedi: net bakiyesi sifirlandi, Ali'nin alacagi 100'e dustu.
    expect(balanceOf(body, burak)).toBe('0.00');
    expect(balanceOf(body, ali)).toBe('100.00');
    expect(balanceOf(body, cem)).toBe('-100.00');

    // Geriye yalnizca Cem -> Ali transferi kalir.
    expect(body.transfers).toHaveLength(1);
    expect(transferBetween(body, cem, ali)).toBe('100.00');
    expect(body.meta.confirmed_settlement_count).toBe(1);
    expect(body.meta.pending_settlement_count).toBe(0);
  });

  it('kismi odeme bakiyeye kismi yansir', async () => {
    const settlement = await createSettlement(burak, group.id, {
      toUserId: ali.id,
      amount: '40.00',
    });

    await request(app)
      .put(`/settlements/${settlement.id}/confirm`)
      .set(...auth(ali))
      .expect(200);

    const body = await getBalances(ali, group.id);

    expect(balanceOf(body, burak)).toBe('-60.00');
    expect(balanceOf(body, ali)).toBe('160.00');
    expect(transferBetween(body, burak, ali)).toBe('60.00');
  });

  it('borclu kendi odemesini onaylayamaz', async () => {
    const settlement = await createSettlement(burak, group.id, {
      toUserId: ali.id,
      amount: '100.00',
    });

    const response = await request(app)
      .put(`/settlements/${settlement.id}/confirm`)
      .set(...auth(burak));

    expect(response.status).toBe(403);
    expect(response.body.message).toMatch(/yalnizca odemeyi alan taraf/i);

    // Bakiye degismemis olmali.
    const body = await getBalances(ali, group.id);
    expect(balanceOf(body, burak)).toBe('-100.00');
  });

  it('taraf olmayan bir grup uyesi onaylayamaz', async () => {
    const settlement = await createSettlement(burak, group.id, {
      toUserId: ali.id,
      amount: '100.00',
    });

    const response = await request(app)
      .put(`/settlements/${settlement.id}/confirm`)
      .set(...auth(cem));

    expect(response.status).toBe(403);
    expect(response.body.message).toMatch(/yalnizca odemeyi alan taraf/i);
  });

  it('uye olmayan kullanici kaydin varligini bile ogrenemez', async () => {
    const settlement = await createSettlement(burak, group.id, {
      toUserId: ali.id,
      amount: '100.00',
    });

    const response = await request(app)
      .put(`/settlements/${settlement.id}/confirm`)
      .set(...auth(disaridaki));

    expect(response.status).toBe(403);
    // Olmayan bir ID ile ayni cevap: varlik sizmasin.
    expect(response.body.message).toBe('Bu gruba erisim yetkiniz yok');

    const unknown = await request(app)
      .put(`/settlements/${randomUUID()}/confirm`)
      .set(...auth(disaridaki));

    expect(unknown.status).toBe(403);
    expect(unknown.body.message).toBe(response.body.message);
  });

  it('bicimsiz ID 500 degil 403 uretir', async () => {
    const response = await request(app)
      .put('/settlements/bicimsiz-id/confirm')
      .set(...auth(ali));

    expect(response.status).toBe(403);
  });

  it('zaten onaylanmis kayit tekrar onaylanamaz', async () => {
    const settlement = await createSettlement(burak, group.id, {
      toUserId: ali.id,
      amount: '100.00',
    });

    await request(app)
      .put(`/settlements/${settlement.id}/confirm`)
      .set(...auth(ali))
      .expect(200);

    const response = await request(app)
      .put(`/settlements/${settlement.id}/confirm`)
      .set(...auth(ali));

    expect(response.status).toBe(409);

    // Cift onay bakiyeyi iki kez dusurmemeli.
    const body = await getBalances(ali, group.id);
    expect(balanceOf(body, burak)).toBe('0.00');
    expect(balanceOf(body, ali)).toBe('100.00');
  });
});

/* ============================================================= red akisi */

describe('PUT /settlements/:id/reject', () => {
  it('reddedilen odemenin bakiyeye hicbir etkisi olmaz', async () => {
    const before = await getBalances(ali, group.id);

    const settlement = await createSettlement(burak, group.id, {
      toUserId: ali.id,
      amount: '100.00',
    });

    const response = await request(app)
      .put(`/settlements/${settlement.id}/reject`)
      .set(...auth(ali));

    expect(response.status).toBe(200);
    expect(response.body.settlement.status).toBe('rejected');
    expect(response.body.settlement.rejected_at).not.toBeNull();
    expect(response.body.settlement.confirmed_at).toBeNull();

    const after = await getBalances(ali, group.id);

    expect(balanceOf(after, ali)).toBe(balanceOf(before, ali));
    expect(balanceOf(after, burak)).toBe(balanceOf(before, burak));
    expect(after.transfers).toEqual(before.transfers);
    expect(after.meta.rejected_settlement_count).toBe(1);
    expect(after.meta.confirmed_settlement_count).toBe(0);
  });

  it('borclu kendi odemesini reddedemez', async () => {
    const settlement = await createSettlement(burak, group.id, {
      toUserId: ali.id,
      amount: '100.00',
    });

    const response = await request(app)
      .put(`/settlements/${settlement.id}/reject`)
      .set(...auth(burak));

    expect(response.status).toBe(403);
    expect(response.body.message).toMatch(/yalnizca odemeyi alan taraf/i);
  });

  it('taraf olmayan bir grup uyesi reddedemez', async () => {
    const settlement = await createSettlement(burak, group.id, {
      toUserId: ali.id,
      amount: '100.00',
    });

    const response = await request(app)
      .put(`/settlements/${settlement.id}/reject`)
      .set(...auth(cem));

    expect(response.status).toBe(403);
  });

  it('reddedilmis kayit sonradan onaylanamaz', async () => {
    const settlement = await createSettlement(burak, group.id, {
      toUserId: ali.id,
      amount: '100.00',
    });

    await request(app)
      .put(`/settlements/${settlement.id}/reject`)
      .set(...auth(ali))
      .expect(200);

    const response = await request(app)
      .put(`/settlements/${settlement.id}/confirm`)
      .set(...auth(ali));

    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/reddedilmis/i);
  });

  it('reddedilen odemenin ardindan yenisi olusturulabilir', async () => {
    const first = await createSettlement(burak, group.id, {
      toUserId: ali.id,
      amount: '100.00',
    });

    await request(app)
      .put(`/settlements/${first.id}/reject`)
      .set(...auth(ali))
      .expect(200);

    // Bekleyen kayit kalmadigi icin ikinci deneme kabul edilmeli.
    const second = await createSettlement(burak, group.id, {
      toUserId: ali.id,
      amount: '100.00',
    });

    expect(second.id).not.toBe(first.id);
    expect(second.status).toBe('pending');
  });
});

/* ======================================================= olusturma yetkisi */

describe('POST /groups/:id/settlements', () => {
  it('fromUserId verilmezse istegi yapan kisi borclu kabul edilir', async () => {
    const settlement = await createSettlement(burak, group.id, {
      toUserId: ali.id,
      amount: '100.00',
    });

    expect(settlement.from_user).toBe(burak.id);
    expect(settlement.to_user).toBe(ali.id);
    expect(settlement.amount).toBe('100.00');
  });

  it('baskasi adina odeme kaydi olusturulamaz', async () => {
    const response = await request(app)
      .post(`/groups/${group.id}/settlements`)
      .set(...auth(cem))
      .send({ fromUserId: burak.id, toUserId: ali.id, amount: '100.00' });

    expect(response.status).toBe(403);
    expect(response.body.message).toMatch(/yalnizca odemeyi yapan taraf/i);
    expect(settlements).toHaveLength(0);
  });

  it('uye olmayan kullanici odeme kaydi olusturamaz', async () => {
    const response = await request(app)
      .post(`/groups/${group.id}/settlements`)
      .set(...auth(disaridaki))
      .send({ toUserId: ali.id, amount: '100.00' });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Bu gruba erisim yetkiniz yok');
  });

  it('grup uyesi olmayan birine odeme kaydi acilamaz', async () => {
    const response = await request(app)
      .post(`/groups/${group.id}/settlements`)
      .set(...auth(burak))
      .send({ toUserId: disaridaki.id, amount: '100.00' });

    expect(response.status).toBe(400);
    expect(response.body.details.toUserId).toMatch(/uyesi degil/i);
  });

  it('kendine odeme kaydi olusturulamaz', async () => {
    const response = await request(app)
      .post(`/groups/${group.id}/settlements`)
      .set(...auth(burak))
      .send({ toUserId: burak.id, amount: '100.00' });

    expect(response.status).toBe(400);
    expect(response.body.details.toUserId).toBeDefined();
  });

  it('gecersiz tutarlar reddedilir', async () => {
    const invalidAmounts = ['0', '-50.00', '12.345', 'abc', null];

    for (const amount of invalidAmounts) {
      const response = await request(app)
        .post(`/groups/${group.id}/settlements`)
        .set(...auth(burak))
        .send({ toUserId: ali.id, amount });

      expect(response.status).toBe(400);
      expect(response.body.details.amount).toBeDefined();
    }

    expect(settlements).toHaveLength(0);
  });

  it('ayni kisiye ikinci bekleyen kayit acilamaz', async () => {
    await createSettlement(burak, group.id, { toUserId: ali.id, amount: '100.00' });

    const response = await request(app)
      .post(`/groups/${group.id}/settlements`)
      .set(...auth(burak))
      .send({ toUserId: ali.id, amount: '100.00' });

    expect(response.status).toBe(409);
    expect(settlements).toHaveLength(1);
  });

  it('farkli kisilere ayni anda bekleyen kayit acilabilir', async () => {
    await createSettlement(burak, group.id, { toUserId: ali.id, amount: '50.00' });
    await createSettlement(burak, group.id, { toUserId: cem.id, amount: '50.00' });

    expect(settlements).toHaveLength(2);
  });
});

/* ================================================ odeme listesi (arayuz icin) */

describe('GET /groups/:id/settlements', () => {
  interface ListBody {
    settlements: (SettlementRow & { from_name: string; to_name: string })[];
    pagination: { page: number; limit: number; total: number; has_next: boolean };
  }

  const listSettlements = async (
    user: TestUser,
    groupId: string,
    query = ''
  ): Promise<ListBody> => {
    const response = await request(app)
      .get(`/groups/${groupId}/settlements${query}`)
      .set(...auth(user));

    expect(response.status).toBe(200);
    return response.body as ListBody;
  };

  it('kayitlari iki tarafin adiyla birlikte doner', async () => {
    await createSettlement(burak, group.id, { toUserId: ali.id, amount: '100.00' });

    const body = await listSettlements(ali, group.id);

    expect(body.settlements).toHaveLength(1);
    // Ad olmadan arayuz "Burak sana 100 TL odedigini soyluyor" cumlesini kuramaz.
    expect(body.settlements[0].from_name).toBe('Burak');
    expect(body.settlements[0].to_name).toBe('Ali');
    expect(body.settlements[0].status).toBe('pending');
  });

  it('status=pending yalnizca bekleyenleri doner', async () => {
    const first = await createSettlement(burak, group.id, { toUserId: ali.id, amount: '100.00' });
    await createSettlement(cem, group.id, { toUserId: ali.id, amount: '40.00' });

    await request(app)
      .put(`/settlements/${first.id}/confirm`)
      .set(...auth(ali))
      .expect(200);

    const body = await listSettlements(ali, group.id, '?status=pending');

    expect(body.settlements).toHaveLength(1);
    expect(body.settlements[0].from_user).toBe(cem.id);
  });

  it('bilinmeyen status sessizce yok sayilmaz, 400 doner', async () => {
    const response = await request(app)
      .get(`/groups/${group.id}/settlements?status=beklemede`)
      .set(...auth(ali));

    // Sessizce tum gecmisi dondurmek, "bekleyenleri getir" diyen arayuze
    // onaylanmis kayitlari da bekleyen gibi gostermek olurdu.
    expect(response.status).toBe(400);
    expect(response.body.details.status).toContain('pending');
  });

  it('sayfalama bilgisi doner', async () => {
    await createSettlement(burak, group.id, { toUserId: ali.id, amount: '100.00' });
    await createSettlement(cem, group.id, { toUserId: ali.id, amount: '40.00' });

    const body = await listSettlements(ali, group.id, '?limit=1');

    expect(body.settlements).toHaveLength(1);
    expect(body.pagination.total).toBe(2);
    expect(body.pagination.has_next).toBe(true);
  });

  it('borclu da alacakli da ayni listeyi gorur', async () => {
    await createSettlement(burak, group.id, { toUserId: ali.id, amount: '100.00' });

    const creditor = await listSettlements(ali, group.id);
    const debtor = await listSettlements(burak, group.id);

    expect(debtor.settlements.map((row) => row.id)).toEqual(
      creditor.settlements.map((row) => row.id)
    );
  });

  it('uye olmayan listeyi goremez', async () => {
    const response = await request(app)
      .get(`/groups/${group.id}/settlements`)
      .set(...auth(disaridaki));

    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Bu gruba erisim yetkiniz yok');
  });
});

/* ============================================== onaylanmis odeme + netlestirme */

describe('onaylanmis odemeler netlestirmeye dogru yansir', () => {
  it('tum borclar odenince liste bosalir', async () => {
    for (const debtor of [burak, cem]) {
      const settlement = await createSettlement(debtor, group.id, {
        toUserId: ali.id,
        amount: '100.00',
      });

      await request(app)
        .put(`/settlements/${settlement.id}/confirm`)
        .set(...auth(ali))
        .expect(200);
    }

    const body = await getBalances(ali, group.id);

    expect(body.transfers).toHaveLength(0);
    expect(body.balances.every((balance) => balance.net_balance === '0.00')).toBe(true);
    expect(body.meta.confirmed_settlement_count).toBe(2);
  });

  it('fazla odeme yonu ters cevirir', async () => {
    const settlement = await createSettlement(burak, group.id, {
      toUserId: ali.id,
      amount: '150.00',
    });

    await request(app)
      .put(`/settlements/${settlement.id}/confirm`)
      .set(...auth(ali))
      .expect(200);

    const body = await getBalances(ali, group.id);

    // Burak 100 borcluyken 150 odedi: artik 50 alacakli.
    expect(balanceOf(body, burak)).toBe('50.00');
    expect(balanceOf(body, ali)).toBe('50.00');
    expect(transferBetween(body, cem, burak)).toBe('50.00');
    expect(transferBetween(body, cem, ali)).toBe('50.00');
  });

  it('kurus artigi olan bolusmede toplam korunur', async () => {
    // 100.00 TL uc kisiye: 33.34 / 33.33 / 33.33
    addExpense(group.id, burak, '100.00', [
      [ali, '33.34'],
      [burak, '33.33'],
      [cem, '33.33'],
    ]);

    const body = await getBalances(ali, group.id);
    const total = body.balances.reduce(
      (sum, balance) => sum + Math.round(Number(balance.net_balance) * 100),
      0
    );

    expect(total).toBe(0);
  });
});

/* ==================================================== GET /settlements/pending */

describe('GET /settlements/pending', () => {
  const listPending = async (user: TestUser) => {
    const response = await request(app)
      .get('/settlements/pending')
      .set(...auth(user));

    expect(response.status).toBe(200);
    return response.body.settlements as {
      id: string;
      group_id: string;
      group_name: string;
      from_user: string;
      from_name: string;
      amount: string;
    }[];
  };

  it('alacakli kendisine bekleyen odemeyi grup adiyla gorur', async () => {
    const settlement = await createSettlement(burak, group.id, { toUserId: ali.id, amount: '50.00' });

    const pending = await listPending(ali);

    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      id: settlement.id,
      group_id: group.id,
      group_name: group.name,
      from_user: burak.id,
      from_name: 'Burak',
      amount: '50.00',
    });
  });

  it('borclu tarafta kendi bildirdigi kayit bu listede gorunmez', async () => {
    // Burak kaydi acti (Ali'ye borcu var); liste yalnizca ALACAKLIYA gore
    // filtreler, o yuzden Burak'in kendi ekraninda bu kayit cikmamali.
    await createSettlement(burak, group.id, { toUserId: ali.id, amount: '50.00' });

    const pending = await listPending(burak);

    expect(pending).toEqual([]);
  });

  it('onaylanmis ya da reddedilmis kayitlar listede gorunmez', async () => {
    const confirmed = await createSettlement(burak, group.id, {
      toUserId: ali.id,
      amount: '10.00',
    });
    const rejected = await createSettlement(cem, group.id, { toUserId: ali.id, amount: '20.00' });

    await request(app)
      .put(`/settlements/${confirmed.id}/confirm`)
      .set(...auth(ali));
    await request(app)
      .put(`/settlements/${rejected.id}/reject`)
      .set(...auth(ali));

    const pending = await listPending(ali);

    expect(pending).toEqual([]);
  });

  it('birden fazla bekleyen kayit en eskiden yeniye siralanir', async () => {
    const first = await createSettlement(burak, group.id, { toUserId: ali.id, amount: '10.00' });
    const second = await createSettlement(cem, group.id, { toUserId: ali.id, amount: '20.00' });

    const pending = await listPending(ali);

    expect(pending.map((row) => row.id)).toEqual([first.id, second.id]);
  });

  it('bekleyen kayit yoksa bos liste doner', async () => {
    const pending = await listPending(ali);

    expect(pending).toEqual([]);
  });

  it('token olmadan 401 doner', async () => {
    const response = await request(app).get('/settlements/pending');

    expect(response.status).toBe(401);
  });
});
