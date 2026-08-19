import { randomUUID } from 'crypto';

import jwt from 'jsonwebtoken';
import request from 'supertest';

import app from '../src/app';
import activityModel from '../src/models/activity.model';
import groupModel from '../src/models/group.model';

import type { ActivityRow } from '../src/models/activity.model';

/**
 * Aktivite akisi (GET /activity) testleri.
 *
 * `activity.model`in kendisi (bes dalli UNION ALL) burada mock'lanip yerine
 * sabit veriler konuyor — testler calisan bir PostgreSQL istemez. Bu dosyanin
 * derdi ham SQL'in dogrulugu degil (o migration'in kendi gerekcesinde ve bir
 * kerelik canli-DB dogrulamada ele alindi); burasi **servis + route**
 * katmanini test ediyor: kapsamin dogru uygulanmasi (yalnizca uyesi olunan
 * gruplar), sayfalamanin dogru gecmesi, grup adinin dogru eslesmesi ve
 * kimlik dogrulama.
 */
jest.mock('../src/models/group.model', () => ({
  __esModule: true,
  default: {
    listMembershipNames: jest.fn(),
  },
}));

jest.mock('../src/models/activity.model', () => ({
  __esModule: true,
  default: {
    listForGroups: jest.fn(),
  },
}));

const mockedGroupModel = groupModel as jest.Mocked<typeof groupModel>;
const mockedActivityModel = activityModel as jest.Mocked<typeof activityModel>;

const TEST_JWT_SECRET = process.env.JWT_SECRET as string;

interface TestUser {
  id: string;
  token: string;
}

const makeUser = (): TestUser => {
  const id = randomUUID();
  return { id, token: jwt.sign({ userId: id, role: 'user' }, TEST_JWT_SECRET, { expiresIn: '1h' }) };
};

const auth = (user: TestUser): [string, string] => ['Authorization', `Bearer ${user.token}`];

const row = (over: Partial<ActivityRow> = {}): ActivityRow => ({
  kind: 'expense_created',
  occurred_at: new Date('2026-08-17T08:40:00.000Z'),
  group_id: 'gggggggg-0000-4000-8000-000000000001',
  actor_id: 'aaaaaaaa-0000-4000-8000-000000000001',
  actor_name: 'Deniz',
  counterparty_id: null,
  counterparty_name: null,
  amount: '480.00',
  previous_amount: null,
  description: 'Aksam marketi',
  previous_description: null,
  event_id: randomUUID(),
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /activity', () => {
  it('kullanicinin uye oldugu gruplarin id listesini olay sorgusuna gecirir', async () => {
    const user = makeUser();
    const groupId = 'gggggggg-0000-4000-8000-000000000001';

    mockedGroupModel.listMembershipNames.mockResolvedValue([{ id: groupId, name: 'Ev Arkadaslari' }]);
    mockedActivityModel.listForGroups.mockResolvedValue({ events: [], total: 0 });

    await request(app)
      .get('/activity')
      .set(...auth(user));

    expect(mockedGroupModel.listMembershipNames).toHaveBeenCalledWith(user.id);
    expect(mockedActivityModel.listForGroups).toHaveBeenCalledWith([groupId], {
      limit: 20,
      offset: 0,
    });
  });

  it('olay satirina uyelik sorgusundan gelen grup adini ekler', async () => {
    const user = makeUser();
    const groupId = 'gggggggg-0000-4000-8000-000000000001';

    mockedGroupModel.listMembershipNames.mockResolvedValue([{ id: groupId, name: 'Ev Arkadaslari' }]);
    mockedActivityModel.listForGroups.mockResolvedValue({
      events: [row({ group_id: groupId })],
      total: 1,
    });

    const response = await request(app)
      .get('/activity')
      .set(...auth(user));

    expect(response.status).toBe(200);
    expect(response.body.events).toHaveLength(1);
    expect(response.body.events[0]).toMatchObject({
      group_id: groupId,
      group_name: 'Ev Arkadaslari',
      kind: 'expense_created',
      description: 'Aksam marketi',
      amount: '480.00',
    });
  });

  it('ayni kaynak satirin iki olayi (kind+id) tekil id uretir', async () => {
    const user = makeUser();
    const settlementId = 'ssssssss-0000-4000-8000-000000000001';

    mockedGroupModel.listMembershipNames.mockResolvedValue([
      { id: 'gggggggg-0000-4000-8000-000000000001', name: 'Ev Arkadaslari' },
    ]);
    mockedActivityModel.listForGroups.mockResolvedValue({
      events: [
        row({ kind: 'settlement_created', event_id: settlementId }),
        row({ kind: 'settlement_confirmed', event_id: settlementId }),
      ],
      total: 2,
    });

    const response = await request(app)
      .get('/activity')
      .set(...auth(user));

    const ids = response.body.events.map((event: { id: string }) => event.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('duzenleme olayinda oncesi/sonrasi alanlari tasinir', async () => {
    const user = makeUser();

    mockedGroupModel.listMembershipNames.mockResolvedValue([
      { id: 'gggggggg-0000-4000-8000-000000000001', name: 'Ev Arkadaslari' },
    ]);
    mockedActivityModel.listForGroups.mockResolvedValue({
      events: [
        row({
          kind: 'expense_edited',
          description: 'Temizlik',
          previous_description: 'Temizlik',
          amount: '195.00',
          previous_amount: '210.00',
        }),
      ],
      total: 1,
    });

    const response = await request(app)
      .get('/activity')
      .set(...auth(user));

    expect(response.body.events[0]).toMatchObject({
      kind: 'expense_edited',
      amount: '195.00',
      previous_amount: '210.00',
    });
  });

  it('hicbir gruba uye olmayan kullanici icin model hic cagrilmaz', async () => {
    const user = makeUser();
    mockedGroupModel.listMembershipNames.mockResolvedValue([]);
    mockedActivityModel.listForGroups.mockResolvedValue({ events: [], total: 0 });

    const response = await request(app)
      .get('/activity')
      .set(...auth(user));

    expect(response.status).toBe(200);
    expect(response.body.events).toEqual([]);
    expect(mockedActivityModel.listForGroups).toHaveBeenCalledWith([], { limit: 20, offset: 0 });
  });

  it('page/limit sorgusu dogru offsete cevrilir', async () => {
    const user = makeUser();
    mockedGroupModel.listMembershipNames.mockResolvedValue([
      { id: 'gggggggg-0000-4000-8000-000000000001', name: 'Ev Arkadaslari' },
    ]);
    mockedActivityModel.listForGroups.mockResolvedValue({ events: [], total: 45 });

    const response = await request(app)
      .get('/activity?page=2&limit=20')
      .set(...auth(user));

    expect(mockedActivityModel.listForGroups).toHaveBeenCalledWith(
      ['gggggggg-0000-4000-8000-000000000001'],
      { limit: 20, offset: 20 }
    );
    expect(response.body.pagination).toMatchObject({
      page: 2,
      limit: 20,
      total: 45,
      has_next: true,
      has_previous: true,
    });
  });

  it('token olmadan 401 doner', async () => {
    const response = await request(app).get('/activity');

    expect(response.status).toBe(401);
    expect(mockedActivityModel.listForGroups).not.toHaveBeenCalled();
  });
});
