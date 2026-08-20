import { randomUUID } from 'crypto';

import jwt from 'jsonwebtoken';
import request from 'supertest';

import app from '../src/app';
import aiService from '../src/services/ai.service';
import expenseModel from '../src/models/expense.model';
import groupModel from '../src/models/group.model';
import messageModel from '../src/models/message.model';
import { formatCents } from '../src/utils/money';

import type { ExpenseWithShares } from '../src/models/expense.model';
import type { GroupMessageRow, GroupMemberRow, GroupRow } from '../src/types/models';
import type { ParseResult } from '../src/services/ai.service';

/**
 * Grup sohbeti (3.5) testleri.
 *
 * Model katmani ve ai.service mock'lanip yerine bellek ici tablolar / sabit
 * cevaplar konuyor: testler ne PostgreSQL ne de Anthropic API ister. Mock'lanmayan
 * her sey gercek kod: routing, requireAuth, uyelik kontrolleri, expense.service'in
 * DRY feed kancasi, hata yoneticisi. Yani bu dosya asil olarak "dogal dil / form /
 * fis harcamalari TEK yoldan feed'e dusuyor mu" ve yetki kararlarini test eder.
 */
jest.mock('../src/models/group.model', () => ({
  __esModule: true,
  default: {
    findById: jest.fn(),
    findMembership: jest.fn(),
    listMembers: jest.fn(),
    listMemberIds: jest.fn(),
  },
}));

jest.mock('../src/models/expense.model', () => ({
  __esModule: true,
  default: {
    create: jest.fn(),
    findWithShares: jest.fn(),
    softDelete: jest.fn(),
  },
}));

jest.mock('../src/models/message.model', () => ({
  __esModule: true,
  default: {
    insertUserText: jest.fn(),
    insertAiClarification: jest.fn(),
    insertExpenseCreated: jest.fn(),
    findExpenseCreatedByExpenseId: jest.fn(),
    softDeleteByExpenseId: jest.fn(),
    listByGroup: jest.fn(),
  },
}));

jest.mock('../src/services/ai.service', () => ({
  __esModule: true,
  default: { parseExpenseMessage: jest.fn() },
  parseExpenseMessage: jest.fn(),
}));

const mockedGroupModel = groupModel as jest.Mocked<typeof groupModel>;
const mockedExpenseModel = expenseModel as jest.Mocked<typeof expenseModel>;
const mockedMessageModel = messageModel as jest.Mocked<typeof messageModel>;
const mockedAi = aiService as jest.Mocked<typeof aiService>;

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
let expenses: ExpenseWithShares[] = [];
let messages: GroupMessageRow[] = [];
let clock = 0; // artan created_at: siralama deterministik olsun

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

/** Grubu + owner + verilen uyeleri bellek ici tablolara ekler. */
const seedGroup = (owner: TestUser, extraMembers: TestUser[] = []): GroupRow => {
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
  for (const member of extraMembers) {
    members.push({
      id: randomUUID(),
      group_id: group.id,
      user_id: member.id,
      role: 'member',
      joined_at: new Date(),
    });
  }
  return group;
};

/** Model fonksiyonlarinin bellek ici karsiliklari (gercek SQL semantigi ile ayni). */
const installInMemoryModels = (): void => {
  mockedGroupModel.findById.mockImplementation(async (groupId: string) =>
    groups.find((group) => group.id === groupId && group.deleted_at === null)
  );

  mockedGroupModel.findMembership.mockImplementation(async (groupId: string, userId: string) =>
    members.find((member) => member.group_id === groupId && member.user_id === userId)
  );

  mockedGroupModel.listMemberIds.mockImplementation(async (groupId: string) =>
    members.filter((member) => member.group_id === groupId).map((member) => member.user_id)
  );

  mockedGroupModel.listMembers.mockImplementation(async (groupId: string) =>
    members
      .filter((member) => member.group_id === groupId)
      .map((member) => {
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

  mockedExpenseModel.create.mockImplementation(async (input) => {
    const payer = users.get(input.paid_by) as TestUser;
    const creator = users.get(input.created_by) as TestUser;
    const expense: ExpenseWithShares = {
      id: randomUUID(),
      group_id: input.group_id,
      paid_by: input.paid_by,
      created_by: input.created_by,
      amount: formatCents(input.amount_cents),
      description: input.description,
      category: input.category,
      split_type: input.split_type,
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null,
      payer_name: payer.name,
      creator_name: creator.name,
      shares: input.shares.map((share) => ({
        user_id: share.userId,
        name: (users.get(share.userId) as TestUser).name,
        share_amount: formatCents(share.cents),
      })),
    };
    expenses.push(expense);
    return expense;
  });

  mockedExpenseModel.findWithShares.mockImplementation(async (expenseId: string) =>
    expenses.find((expense) => expense.id === expenseId && expense.deleted_at === null)
  );

  mockedExpenseModel.softDelete.mockImplementation(async (expenseId: string) => {
    const expense = expenses.find((row) => row.id === expenseId && row.deleted_at === null);
    if (!expense) {
      return undefined;
    }
    expense.deleted_at = new Date();
    return expense;
  });

  mockedMessageModel.insertUserText.mockImplementation(async (input) => {
    const row: GroupMessageRow = {
      id: randomUUID(),
      group_id: input.group_id,
      sender_id: input.sender_id,
      type: 'user_text',
      content: input.content,
      expense_id: null,
      receipt_draft_id: null,
      created_at: new Date(clock++),
      deleted_at: null,
    };
    messages.push(row);
    return row;
  });

  mockedMessageModel.insertAiClarification.mockImplementation(async (input) => {
    const row: GroupMessageRow = {
      id: randomUUID(),
      group_id: input.group_id,
      sender_id: null,
      type: 'ai_clarification',
      content: input.content,
      expense_id: null,
      receipt_draft_id: null,
      created_at: new Date(clock++),
      deleted_at: null,
    };
    messages.push(row);
    return row;
  });

  mockedMessageModel.insertExpenseCreated.mockImplementation(async (input) => {
    const row: GroupMessageRow = {
      id: randomUUID(),
      group_id: input.group_id,
      sender_id: input.sender_id,
      type: 'expense_created',
      content: null,
      expense_id: input.expense_id,
      receipt_draft_id: null,
      created_at: new Date(clock++),
      deleted_at: null,
    };
    messages.push(row);
    return row;
  });

  mockedMessageModel.findExpenseCreatedByExpenseId.mockImplementation(async (expenseId: string) =>
    messages.find(
      (row) =>
        row.expense_id === expenseId && row.type === 'expense_created' && row.deleted_at === null
    )
  );

  mockedMessageModel.softDeleteByExpenseId.mockImplementation(async (expenseId: string) => {
    let count = 0;
    for (const row of messages) {
      if (
        row.expense_id === expenseId &&
        row.type === 'expense_created' &&
        row.deleted_at === null
      ) {
        row.deleted_at = new Date();
        count += 1;
      }
    }
    return count;
  });

  mockedMessageModel.listByGroup.mockImplementation(async (groupId: string, page) => {
    const alive = messages
      .filter((row) => row.group_id === groupId && row.deleted_at === null)
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());

    const view = alive.slice(page.offset, page.offset + page.limit).map((row) => {
      const expense =
        row.type === 'expense_created'
          ? expenses.find((e) => e.id === row.expense_id && e.deleted_at === null)
          : undefined;
      return {
        id: row.id,
        group_id: row.group_id,
        sender_id: row.sender_id,
        type: row.type,
        content: row.content,
        expense_id: row.expense_id,
        receipt_draft_id: row.receipt_draft_id,
        created_at: row.created_at,
        expense: expense
          ? {
              id: expense.id,
              amount: expense.amount,
              description: expense.description,
              category: expense.category,
              paid_by: expense.paid_by,
              created_by: expense.created_by,
            }
          : null,
      };
    });

    return { messages: view, total: alive.length };
  });
};

const expenseParse = (
  over: Partial<Extract<ParseResult, { kind: 'expense' }>> = {}
): ParseResult => ({
  kind: 'expense',
  amount: 300,
  description: 'market',
  paidByUserId: null,
  participantUserIds: [],
  ...over,
});

beforeAll(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

beforeEach(() => {
  users.clear();
  groups = [];
  members = [];
  expenses = [];
  messages = [];
  clock = 0;
  installInMemoryModels();
  mockedAi.parseExpenseMessage.mockReset();
});

/* ========================================= POST /groups/:id/messages (dogal dil) */

describe('POST /groups/:id/messages', () => {
  it('net mesaj -> harcama olusur ve expense_created feed satiri gelir', async () => {
    const deniz = makeUser('Deniz');
    const ece = makeUser('Ece');
    const group = seedGroup(deniz, [ece]);
    mockedAi.parseExpenseMessage.mockResolvedValue(
      expenseParse({ amount: 300, description: 'market' })
    );

    const response = await request(app)
      .post(`/groups/${group.id}/messages`)
      .set(...auth(deniz))
      .send({ content: 'market 300 lira, herkese esit' });

    expect(response.status).toBe(201);
    expect(response.body.messages).toHaveLength(2);

    const [userMsg, expenseMsg] = response.body.messages;
    expect(userMsg).toMatchObject({ type: 'user_text', content: 'market 300 lira, herkese esit' });
    expect(expenseMsg).toMatchObject({ type: 'expense_created' });
    // Harcama ozeti JOIN ile geliyor: arayuz ayrica /expenses/:id cagirmasin
    expect(expenseMsg.expense).toMatchObject({ amount: '300.00', description: 'market' });
    // Gercek harcama da olustu
    expect(expenses).toHaveLength(1);

    // Feed'de iki satir da var
    const feed = await request(app)
      .get(`/groups/${group.id}/messages`)
      .set(...auth(deniz));
    expect(feed.status).toBe(200);
    expect(feed.body.messages.map((m: { type: string }) => m.type).sort()).toEqual([
      'expense_created',
      'user_text',
    ]);
  });

  it('belirsiz mesaj -> harcama OLUSMAZ, ai_clarification doner', async () => {
    const deniz = makeUser('Deniz');
    const group = seedGroup(deniz);
    mockedAi.parseExpenseMessage.mockResolvedValue({
      kind: 'clarification',
      question: 'Ne kadar harcadin?',
    });

    const response = await request(app)
      .post(`/groups/${group.id}/messages`)
      .set(...auth(deniz))
      .send({ content: 'bir sey harcadim' });

    expect(response.status).toBe(201);
    expect(response.body.messages).toHaveLength(2);
    expect(response.body.messages[1]).toMatchObject({
      type: 'ai_clarification',
      content: 'Ne kadar harcadin?',
    });
    // Harcama OLUSMADI
    expect(expenses).toHaveLength(0);
    expect(mockedExpenseModel.create).not.toHaveBeenCalled();
  });

  it('bos mesaj 400 doner ve AI cagrilmaz', async () => {
    const deniz = makeUser('Deniz');
    const group = seedGroup(deniz);

    const response = await request(app)
      .post(`/groups/${group.id}/messages`)
      .set(...auth(deniz))
      .send({ content: '   ' });

    expect(response.status).toBe(400);
    expect(mockedAi.parseExpenseMessage).not.toHaveBeenCalled();
  });

  it('uye olmayan mesaj gonderemez (403) ve AI cagrilmaz', async () => {
    const deniz = makeUser('Deniz');
    const yabanci = makeUser('Yabanci');
    const group = seedGroup(deniz);

    const response = await request(app)
      .post(`/groups/${group.id}/messages`)
      .set(...auth(yabanci))
      .send({ content: 'market 300' });

    expect(response.status).toBe(403);
    expect(mockedAi.parseExpenseMessage).not.toHaveBeenCalled();
    expect(messages).toHaveLength(0);
  });

  it('token olmadan 401 doner', async () => {
    const deniz = makeUser('Deniz');
    const group = seedGroup(deniz);

    const response = await request(app).post(`/groups/${group.id}/messages`).send({ content: 'x' });

    expect(response.status).toBe(401);
  });
});

/* ============================================ GET /groups/:id/messages (yetki) */

describe('GET /groups/:id/messages', () => {
  it('uye olmayan feed goremez (403)', async () => {
    const deniz = makeUser('Deniz');
    const yabanci = makeUser('Yabanci');
    const group = seedGroup(deniz);

    const response = await request(app)
      .get(`/groups/${group.id}/messages`)
      .set(...auth(yabanci));

    expect(response.status).toBe(403);
    expect(mockedMessageModel.listByGroup).not.toHaveBeenCalled();
  });
});

/* =================================== Manuel form ve chat AYNI yoldan feed'e dusuyor */

describe('Manuel form harcamasi da feed akisina expense_created ekler', () => {
  it('POST /groups/:id/expenses AI olmadan feed satiri uretir', async () => {
    const deniz = makeUser('Deniz');
    const ece = makeUser('Ece');
    const group = seedGroup(deniz, [ece]);

    const created = await request(app)
      .post(`/groups/${group.id}/expenses`)
      .set(...auth(deniz))
      .send({ description: 'benzin', amount: 200, splitType: 'equal' });

    expect(created.status).toBe(201);
    // Form yolu AI'ya HIC dokunmaz
    expect(mockedAi.parseExpenseMessage).not.toHaveBeenCalled();
    // Ama chat ile ayni alt fonksiyondan gecti: feed satiri olustu
    expect(mockedMessageModel.insertExpenseCreated).toHaveBeenCalledTimes(1);

    const feed = await request(app)
      .get(`/groups/${group.id}/messages`)
      .set(...auth(deniz));
    expect(feed.body.messages).toHaveLength(1);
    expect(feed.body.messages[0]).toMatchObject({
      type: 'expense_created',
      expense: { description: 'benzin', amount: '200.00' },
    });
  });
});

/* ===================================== Harcamayi silme feed'deki mesaji da kaldirir */

describe('DELETE /expenses/:id ilgili expense_created feed satirini da kaldirir', () => {
  it('silinen harcamanin feed karti kalkar', async () => {
    const deniz = makeUser('Deniz');
    const ece = makeUser('Ece');
    const group = seedGroup(deniz, [ece]);
    mockedAi.parseExpenseMessage.mockResolvedValue(expenseParse());

    const posted = await request(app)
      .post(`/groups/${group.id}/messages`)
      .set(...auth(deniz))
      .send({ content: 'market 300, herkese' });
    const expenseId = posted.body.messages[1].expense.id as string;

    // Silmeden once feed'de expense_created var
    const before = await request(app)
      .get(`/groups/${group.id}/messages`)
      .set(...auth(deniz));
    expect(before.body.messages.some((m: { type: string }) => m.type === 'expense_created')).toBe(
      true
    );

    const deleted = await request(app)
      .delete(`/expenses/${expenseId}`)
      .set(...auth(deniz));
    expect(deleted.status).toBe(200);
    expect(mockedMessageModel.softDeleteByExpenseId).toHaveBeenCalledWith(expenseId);

    // Silmeden sonra expense_created feed'den dustu; kullanicinin mesaji kaldi
    const after = await request(app)
      .get(`/groups/${group.id}/messages`)
      .set(...auth(deniz));
    expect(after.body.messages.some((m: { type: string }) => m.type === 'expense_created')).toBe(
      false
    );
    expect(after.body.messages.some((m: { type: string }) => m.type === 'user_text')).toBe(true);
  });
});
