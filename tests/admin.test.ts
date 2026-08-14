import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import app from '../src/app';
import adminModel from '../src/models/admin.model';
import userModel from '../src/models/user.model';

import type { GroupMetaView } from '../src/models/admin.model';
import type { PublicUser } from '../src/models/user.model';
import type { UserRole, UserRow } from '../src/types/models';

/**
 * Admin paneli testleri.
 *
 * Veri katmani (admin.model, user.model) mock'lanip yerine bellek ici tablolar
 * konuyor. Mock'lanmayan her sey gercek kod: routing, requireAuth + requireAdmin
 * sirasi, validasyon, sayfalama, hata yoneticisi.
 *
 * GIZLILIK IKI KATMANDA SINANIYOR
 * -------------------------------
 * 1. HTTP: /admin/groups ve /admin/stats cevaplarinda hicbir harcama verisi
 *    bulunmadigi dogrulaniyor (anahtar kumesi + tum govdede metin taramasi).
 * 2. Kaynak: `admin.model.listGroupMeta`'nin `expenses`/`expense_shares`
 *    tablolarina hic dokunmadigi dosyanin kendisi okunarak dogrulaniyor.
 *    Model mock'landigi icin (1) tek basina sorgu katmanini kanitlamaz;
 *    (2) o boslugu kapatir. Gerekce docs/decisions/1.8.md icinde.
 */
jest.mock('../src/models/admin.model', () => ({
  __esModule: true,
  default: {
    listUsers: jest.fn(),
    listGroupMeta: jest.fn(),
    collectStats: jest.fn(),
  },
}));

jest.mock('../src/models/user.model', () => {
  const actual = jest.requireActual('../src/models/user.model');
  return {
    __esModule: true,
    // PUBLIC_USER_COLUMNS gercek kalir: admin.model onu import ediyor.
    ...actual,
    default: {
      findByEmail: jest.fn(),
      findPublicById: jest.fn(),
      create: jest.fn(),
      listPublic: jest.fn(),
      setActive: jest.fn(),
    },
  };
});

const mockedAdminModel = adminModel as jest.Mocked<typeof adminModel>;
const mockedUserModel = userModel as jest.Mocked<typeof userModel>;

const TEST_JWT_SECRET = process.env.JWT_SECRET as string;
const PASSWORD = 'Password123!';

/* ------------------------------------------------------ bellek ici "tablolar" */

interface TestUser extends PublicUser {
  token: string;
  password_hash: string;
}

interface TestGroup {
  id: string;
  name: string;
  description: string | null;
  created_at: Date;
  deleted_at: Date | null;
  member_ids: string[];
}

/** Sizmamasi gereken harcama verisi — testler bu degerleri cevaplarda arar. */
interface TestExpense {
  group_id: string;
  description: string;
  amount: string;
}

let users: TestUser[] = [];
let groups: TestGroup[] = [];
let expenses: TestExpense[] = [];
let passwordHash = '';

const makeUser = (name: string, role: UserRole = 'user', isActive = true): TestUser => {
  const id = randomUUID();
  const user: TestUser = {
    id,
    email: `${name.toLowerCase()}@evenup.dev`,
    name,
    role,
    is_active: isActive,
    created_at: new Date(Date.now() - users.length * 1000),
    password_hash: passwordHash,
    token: jwt.sign({ userId: id, role }, TEST_JWT_SECRET, { expiresIn: '1h' }),
  };

  users.push(user);
  return user;
};

const makeGroup = (name: string, memberIds: string[], deleted = false): TestGroup => {
  const group: TestGroup = {
    id: randomUUID(),
    name,
    description: `${name} icin gizli aciklama`,
    created_at: new Date(Date.now() - groups.length * 1000),
    deleted_at: deleted ? new Date() : null,
    member_ids: memberIds,
  };

  groups.push(group);
  return group;
};

const auth = (user: TestUser): [string, string] => ['Authorization', `Bearer ${user.token}`];

const toPublicUser = (user: TestUser): PublicUser => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  is_active: user.is_active,
  created_at: user.created_at,
});

/** Model fonksiyonlarinin bellek ici karsiliklari (gercek sorgu semantigi ile ayni). */
const installInMemoryModel = (): void => {
  mockedUserModel.findByEmail.mockImplementation(async (email: string) => {
    const user = users.find((row) => row.email === email);
    return user ? ({ ...user, fcm_token: null } as unknown as UserRow) : undefined;
  });

  mockedUserModel.findPublicById.mockImplementation(async (id: string) => {
    const user = users.find((row) => row.id === id);
    return user ? toPublicUser(user) : undefined;
  });

  mockedUserModel.setActive.mockImplementation(async (id: string, isActive: boolean) => {
    const user = users.find((row) => row.id === id);
    if (!user) {
      return undefined;
    }

    user.is_active = isActive;
    return toPublicUser(user);
  });

  mockedAdminModel.listUsers.mockImplementation(async (filters) => {
    let rows = [...users];

    if (filters.search) {
      const term = filters.search.toLowerCase();
      rows = rows.filter(
        (user) => user.email.toLowerCase().includes(term) || user.name.toLowerCase().includes(term)
      );
    }

    if (filters.isActive !== undefined) {
      rows = rows.filter((user) => user.is_active === filters.isActive);
    }

    if (filters.role) {
      rows = rows.filter((user) => user.role === filters.role);
    }

    rows.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());

    return {
      users: rows.slice(filters.offset, filters.offset + filters.limit).map(toPublicUser),
      total: rows.length,
    };
  });

  // Gercek sorgunun karsiligi: yalnizca groups + group_members. Harcama yok.
  mockedAdminModel.listGroupMeta.mockImplementation(async (page, search) => {
    let rows = groups.filter((group) => group.deleted_at === null);

    if (search) {
      rows = rows.filter((group) => group.name.toLowerCase().includes(search.toLowerCase()));
    }

    rows.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());

    return {
      groups: rows.slice(page.offset, page.offset + page.limit).map<GroupMetaView>((group) => ({
        id: group.id,
        name: group.name,
        created_at: group.created_at,
        member_count: group.member_ids.length,
      })),
      total: rows.length,
    };
  });

  // Yalnizca toplamlar: satir bazli hicbir alan donmez.
  mockedAdminModel.collectStats.mockImplementation(async () => {
    const aliveGroups = groups.filter((group) => group.deleted_at === null);
    const volume = expenses.reduce(
      (sum, expense) => sum + Math.round(Number(expense.amount) * 100),
      0
    );

    return {
      users: {
        total: users.length,
        active: users.filter((user) => user.is_active).length,
        inactive: users.filter((user) => !user.is_active).length,
      },
      groups: { active: aliveGroups.length, deleted: groups.length - aliveGroups.length },
      expenses: { count: expenses.length, volume: (volume / 100).toFixed(2) },
      settlements: { confirmed_count: 0, confirmed_volume: '0.00' },
      trends: {
        last_7_days: { new_users: 0, new_groups: 0, expense_count: 0, expense_volume: '0.00' },
        last_30_days: {
          new_users: users.length,
          new_groups: aliveGroups.length,
          expense_count: expenses.length,
          expense_volume: (volume / 100).toFixed(2),
        },
      },
    };
  });
};

/* ------------------------------------------------------------------ kurulum */

let admin: TestUser;
let normal: TestUser;
let pasif: TestUser;
let group: TestGroup;

const ADMIN_ENDPOINTS: [string, string][] = [
  ['get', '/admin/users'],
  ['get', '/admin/groups'],
  ['get', '/admin/stats'],
];

beforeAll(async () => {
  passwordHash = await bcrypt.hash(PASSWORD, 10);
});

beforeEach(() => {
  users = [];
  groups = [];
  expenses = [];

  installInMemoryModel();

  admin = makeUser('Admin', 'admin');
  normal = makeUser('Burak');
  pasif = makeUser('Pasif', 'user', false);

  group = makeGroup('Ev Arkadaslari', [admin.id, normal.id]);
  makeGroup('Silinmis Grup', [normal.id], true);

  // Cevaplarda ASLA gorunmemesi gereken veriler.
  expenses.push(
    { group_id: group.id, description: 'Gizli psikolog randevusu', amount: '1250.00' },
    { group_id: group.id, description: 'Nikah hediyesi', amount: '780.50' }
  );
});

/* ============================================================ yetkilendirme */

describe('admin yetkilendirmesi', () => {
  it('normal kullanici hicbir /admin ucuna erisemez', async () => {
    for (const [method, path] of ADMIN_ENDPOINTS) {
      const response = await (request(app) as never as Record<string, CallableFunction>)
        [method](path)
        .set(...auth(normal));

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Bu islem icin admin yetkisi gerekli');
    }
  });

  it('normal kullanici baskasini devre disi birakamaz', async () => {
    const response = await request(app)
      .put(`/admin/users/${admin.id}/disable`)
      .set(...auth(normal));

    expect(response.status).toBe(403);
    expect(users.find((user) => user.id === admin.id)?.is_active).toBe(true);
  });

  it('token olmadan 403 degil 401 doner', async () => {
    for (const [method, path] of ADMIN_ENDPOINTS) {
      const response = await (request(app) as never as Record<string, CallableFunction>)[method](
        path
      );

      expect(response.status).toBe(401);
    }
  });

  it('admin tum uc noktalara erisebilir', async () => {
    for (const [method, path] of ADMIN_ENDPOINTS) {
      const response = await (request(app) as never as Record<string, CallableFunction>)
        [method](path)
        .set(...auth(admin));

      expect(response.status).toBe(200);
    }
  });
});

/* ========================================================== GET /admin/users */

describe('GET /admin/users', () => {
  it('tum kullanicilari sayfalama bilgisiyle listeler', async () => {
    const response = await request(app)
      .get('/admin/users')
      .set(...auth(admin));

    expect(response.status).toBe(200);
    expect(response.body.users).toHaveLength(3);
    expect(response.body.pagination).toMatchObject({
      page: 1,
      limit: 20,
      total: 3,
      total_pages: 1,
      has_next: false,
      has_previous: false,
    });
  });

  it('e-posta ile arar', async () => {
    const response = await request(app)
      .get('/admin/users')
      .query({ search: 'burak@evenup' })
      .set(...auth(admin));

    expect(response.status).toBe(200);
    expect(response.body.users).toHaveLength(1);
    expect(response.body.users[0].id).toBe(normal.id);
  });

  it('isimle arar ve buyuk/kucuk harf ayirmaz', async () => {
    const response = await request(app)
      .get('/admin/users')
      .query({ search: 'bUrAk' })
      .set(...auth(admin));

    expect(response.body.users).toHaveLength(1);
    expect(response.body.users[0].name).toBe('Burak');
  });

  it('duruma gore filtreler', async () => {
    const response = await request(app)
      .get('/admin/users')
      .query({ status: 'inactive' })
      .set(...auth(admin));

    expect(response.body.users).toHaveLength(1);
    expect(response.body.users[0].id).toBe(pasif.id);
  });

  it('gecersiz durum filtresi 400 doner', async () => {
    const response = await request(app)
      .get('/admin/users')
      .query({ status: 'silinmis' })
      .set(...auth(admin));

    expect(response.status).toBe(400);
    expect(response.body.details.status).toBeDefined();
  });

  it('sayfalama sinirlari zorlanamaz', async () => {
    const tooBig = await request(app)
      .get('/admin/users')
      .query({ limit: 5000 })
      .set(...auth(admin));

    expect(tooBig.status).toBe(400);
    expect(tooBig.body.details.limit).toBeDefined();

    const negative = await request(app)
      .get('/admin/users')
      .query({ page: 0 })
      .set(...auth(admin));

    expect(negative.status).toBe(400);
  });

  it('ikinci sayfa dogru dilimi doner', async () => {
    const response = await request(app)
      .get('/admin/users')
      .query({ page: 2, limit: 2 })
      .set(...auth(admin));

    expect(response.body.users).toHaveLength(1);
    expect(response.body.pagination).toMatchObject({
      page: 2,
      total: 3,
      total_pages: 2,
      has_next: false,
      has_previous: true,
    });
  });

  it('hicbir cevapta password_hash bulunmaz', async () => {
    const response = await request(app)
      .get('/admin/users')
      .set(...auth(admin));

    const body = JSON.stringify(response.body);
    expect(body).not.toContain('password_hash');
    expect(body).not.toContain('$2b$');
  });
});

/* ============================================== disable / enable + login etkisi */

describe('PUT /admin/users/:id/disable ve /enable', () => {
  it('devre disi birakilan kullanici login olamaz', async () => {
    const before = await request(app)
      .post('/auth/login')
      .send({ email: normal.email, password: PASSWORD });

    expect(before.status).toBe(200);

    const disabled = await request(app)
      .put(`/admin/users/${normal.id}/disable`)
      .set(...auth(admin));

    expect(disabled.status).toBe(200);
    expect(disabled.body.user.is_active).toBe(false);
    expect(disabled.body.changed).toBe(true);

    const after = await request(app)
      .post('/auth/login')
      .send({ email: normal.email, password: PASSWORD });

    expect(after.status).toBe(401);
    // Pasif kullanici ile yanlis sifre ayni mesaji doner: durum sizmasin.
    expect(after.body.message).toBe('E-posta veya sifre hatali');
  });

  it('yeniden aktiflestirilen kullanici tekrar login olabilir', async () => {
    await request(app)
      .put(`/admin/users/${pasif.id}/enable`)
      .set(...auth(admin))
      .expect(200);

    const login = await request(app)
      .post('/auth/login')
      .send({ email: pasif.email, password: PASSWORD });

    expect(login.status).toBe(200);
  });

  it('admin kendi hesabini devre disi birakamaz', async () => {
    const response = await request(app)
      .put(`/admin/users/${admin.id}/disable`)
      .set(...auth(admin));

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/kendi hesabinizi/i);
    expect(users.find((user) => user.id === admin.id)?.is_active).toBe(true);
  });

  it('admin kendini yeniden aktiflestirebilir (kilitlenme riski yok)', async () => {
    const response = await request(app)
      .put(`/admin/users/${admin.id}/enable`)
      .set(...auth(admin));

    expect(response.status).toBe(200);
  });

  it('olmayan ve bicimsiz ID 404 doner', async () => {
    const missing = await request(app)
      .put(`/admin/users/${randomUUID()}/disable`)
      .set(...auth(admin));

    expect(missing.status).toBe(404);

    const malformed = await request(app)
      .put('/admin/users/bicimsiz-id/disable')
      .set(...auth(admin));

    // Bicimsiz ID DB'ye gitmeden elenir: 500 degil 404.
    expect(malformed.status).toBe(404);
  });

  it('ayni islem tekrarlandiginda changed false doner', async () => {
    await request(app)
      .put(`/admin/users/${normal.id}/disable`)
      .set(...auth(admin))
      .expect(200);

    const second = await request(app)
      .put(`/admin/users/${normal.id}/disable`)
      .set(...auth(admin));

    expect(second.status).toBe(200);
    expect(second.body.changed).toBe(false);
    expect(second.body.user.is_active).toBe(false);
  });
});

/* ========================================= GET /admin/groups — GIZLILIK SINIRI */

describe('GET /admin/groups yalnizca ust veri doner', () => {
  it('her grup icin tam olarak ad, uye sayisi ve tarih doner', async () => {
    const response = await request(app)
      .get('/admin/groups')
      .set(...auth(admin));

    expect(response.status).toBe(200);
    expect(response.body.groups).toHaveLength(1);

    const [row] = response.body.groups;
    expect(Object.keys(row).sort()).toEqual(['created_at', 'id', 'member_count', 'name']);
    expect(row.name).toBe('Ev Arkadaslari');
    expect(row.member_count).toBe(2);
  });

  it('cevapta HICBIR harcama detayi bulunmaz', async () => {
    const response = await request(app)
      .get('/admin/groups')
      .set(...auth(admin));

    const body = JSON.stringify(response.body);

    for (const expense of expenses) {
      expect(body).not.toContain(expense.description);
      expect(body).not.toContain(expense.amount);
    }

    for (const field of ['expense', 'amount', 'description', 'share', 'paid_by', 'category']) {
      expect(body).not.toContain(field);
    }
  });

  it('grup aciklamasi da donmez (kullanici icerigi sayilir)', async () => {
    const response = await request(app)
      .get('/admin/groups')
      .set(...auth(admin));

    expect(JSON.stringify(response.body)).not.toContain('gizli aciklama');
  });

  it('uye kimlikleri donmez, yalnizca sayi doner', async () => {
    const response = await request(app)
      .get('/admin/groups')
      .set(...auth(admin));

    const body = JSON.stringify(response.body);
    expect(body).not.toContain(normal.id);
    expect(body).not.toContain(normal.email);
  });

  it('silinmis gruplar listelenmez', async () => {
    const response = await request(app)
      .get('/admin/groups')
      .set(...auth(admin));

    expect(JSON.stringify(response.body)).not.toContain('Silinmis Grup');
    expect(response.body.pagination.total).toBe(1);
  });

  it('grup adiyla arar', async () => {
    makeGroup('Ofis Ekibi', [admin.id]);

    const response = await request(app)
      .get('/admin/groups')
      .query({ search: 'ofis' })
      .set(...auth(admin));

    expect(response.body.groups).toHaveLength(1);
    expect(response.body.groups[0].name).toBe('Ofis Ekibi');
  });
});

/* ========================================================== GET /admin/stats */

describe('GET /admin/stats yalnizca toplam doner', () => {
  it('kullanici, grup ve hacim toplamlarini verir', async () => {
    const response = await request(app)
      .get('/admin/stats')
      .set(...auth(admin));

    expect(response.status).toBe(200);
    expect(response.body.users).toEqual({ total: 3, active: 2, inactive: 1 });
    expect(response.body.groups).toEqual({ active: 1, deleted: 1 });
    expect(response.body.expenses).toEqual({ count: 2, volume: '2030.50' });
    expect(response.body.trends.last_30_days.expense_count).toBe(2);
  });

  it('cevapta satir bazli harcama verisi bulunmaz', async () => {
    const response = await request(app)
      .get('/admin/stats')
      .set(...auth(admin));

    const body = JSON.stringify(response.body);

    for (const expense of expenses) {
      expect(body).not.toContain(expense.description);
    }

    expect(body).not.toContain('description');
    expect(body).not.toContain(group.id);
  });
});

/* ============================== sorgu katmani: kaynak seviyesinde gizlilik guvencesi */

describe('admin.model sorgulari gizlilik sinirini korur', () => {
  const source = readFileSync(join(__dirname, '..', 'src', 'models', 'admin.model.ts'), 'utf8');

  /** Yorumlar cikarilir: gerekce metinleri "expenses" kelimesini iceriyor. */
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  const sectionOf = (start: string, end: string): string =>
    code.slice(code.indexOf(start), code.indexOf(end));

  it('listGroupMeta expenses tablolarina hic dokunmaz', () => {
    const groupSection = sectionOf('const groupsQuery', 'const periodStats');

    // Bolum gercekten bulunmus olmali; bulunamazsa asagidaki iki kontrol bos
    // bir metin uzerinde calisir ve test yaniltici sekilde gecerdi.
    expect(groupSection).toContain('listGroupMeta');
    expect(groupSection).toContain('group_members');

    expect(groupSection).not.toMatch(/expense/i);
    expect(groupSection).not.toMatch(/settlement/i);
  });

  it('hicbir sorgu satir bazli harcama alani secmez', () => {
    expect(code).not.toMatch(/expense_shares/);
    expect(code).not.toMatch(/description/);
    expect(code).not.toMatch(/share_amount/);
    expect(code).not.toMatch(/paid_by/);
  });

  it('harcama tablosu yalnizca COUNT/SUM ile ve GROUP BY olmadan okunur', () => {
    const statsSection = sectionOf('const periodStats', 'export default');
    const expenseLines = statsSection
      .split('\n')
      .map((line) => line.trim())
      // Yalnizca **tabloya** deger satirlar: `db('expenses')` ya da `expenses.<kolon>`.
      // Ayni adi tasiyan yerel degiskenler (`const [, , expenses] = ...`) haric.
      .filter((line) => /'expenses'|expenses\./.test(line));

    // Filtre gercekten satir yakalamali; yoksa asagidaki dongu bos gecer ve
    // test hicbir sey dogrulamadan yesil olurdu.
    expect(expenseLines.length).toBeGreaterThan(3);

    // Harcama tablosuna degen HER satir ya toplam (COUNT/SUM) ya da
    // join/filtre olmali; satir bazli bir SELECT olmamali.
    const allowed =
      /^(db\('expenses'\)|\.join\(|\.whereNull\(|\.where\(|\.select\(|db\.raw\('COUNT|db\.raw\('COALESCE\(SUM)/;

    for (const line of expenseLines) {
      expect(line).toMatch(allowed);
    }

    // Grup basina kirilim yok: "hangi ev ne kadar harciyor" bilgisi uretilmez.
    expect(statsSection).not.toMatch(/groupBy/);
  });
});
