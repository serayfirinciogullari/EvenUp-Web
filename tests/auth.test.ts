import { randomUUID } from 'crypto';

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import app from '../src/app';
import userModel from '../src/models/user.model';

import type { PublicUser } from '../src/models/user.model';
import type { UserInsert, UserRole, UserRow } from '../src/types/models';

/**
 * Auth uctan uca testleri.
 *
 * Veri katmani (user.model) mock'lanip yerine bellek ici bir Map konuyor:
 * boylece testler calisan bir PostgreSQL istemez. Mock'lanmayan her sey —
 * validasyon, bcrypt, JWT imzalama/dogrulama, middleware sirasi, hata
 * yoneticisi — gercek kod olarak calisir.
 */
jest.mock('../src/models/user.model', () => ({
  __esModule: true,
  default: {
    findByEmail: jest.fn(),
    findPublicById: jest.fn(),
    create: jest.fn(),
    listPublic: jest.fn(),
    requestDeletion: jest.fn(),
    cancelDeletion: jest.fn(),
  },
}));

const mockedUserModel = userModel as jest.Mocked<typeof userModel>;

const TEST_JWT_SECRET = process.env.JWT_SECRET as string;

/* ------------------------------------------------------- bellek ici "tablo" */

const usersByEmail = new Map<string, UserRow>();

const toPublic = (row: UserRow): PublicUser => {
  const { password_hash: _hash, ...publicFields } = row;
  return publicFields;
};

/** Testin dogrudan "veritabanina" kullanici yazmasi icin (register'dan gecmeden). */
const insertUser = async (input: {
  email: string;
  password: string;
  name?: string;
  role?: UserRole;
  is_active?: boolean;
  deleted_at?: Date | null;
}): Promise<UserRow> => {
  const row: UserRow = {
    id: randomUUID(),
    email: input.email,
    name: input.name ?? 'Test Kullanici',
    password_hash: await bcrypt.hash(input.password, 10),
    role: input.role ?? 'user',
    fcm_token: null,
    is_active: input.is_active ?? true,
    created_at: new Date(),
    activity_seen_at: new Date(),
    avatar: null,
    handle: null,
    deleted_at: input.deleted_at ?? null,
  };

  usersByEmail.set(row.email, row);
  return row;
};

const loginFor = async (email: string, password: string): Promise<string> => {
  const response = await request(app).post('/auth/login').send({ email, password });
  expect(response.status).toBe(200);
  return response.body.token as string;
};

beforeAll(() => {
  // Hata yoneticisi 4xx'leri warn'lar; testler bilerek 401/403 uretiyor.
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

beforeEach(() => {
  usersByEmail.clear();

  mockedUserModel.findByEmail.mockImplementation(async (email: string) => usersByEmail.get(email));

  mockedUserModel.create.mockImplementation(async (data: UserInsert) => {
    const row: UserRow = {
      id: data.id ?? randomUUID(),
      email: data.email,
      name: data.name,
      password_hash: data.password_hash,
      // DB kolon default'lari ile ayni
      role: data.role ?? 'user',
      fcm_token: data.fcm_token ?? null,
      is_active: data.is_active ?? true,
      created_at: data.created_at ?? new Date(),
      activity_seen_at: data.activity_seen_at ?? new Date(),
      avatar: data.avatar ?? null,
      handle: data.handle ?? null,
      deleted_at: data.deleted_at ?? null,
    };

    usersByEmail.set(row.email, row);
    return toPublic(row);
  });

  mockedUserModel.findPublicById.mockImplementation(async (id: string) =>
    [...usersByEmail.values()].map(toPublic).find((user) => user.id === id)
  );

  mockedUserModel.listPublic.mockImplementation(async () =>
    [...usersByEmail.values()].map(toPublic)
  );

  mockedUserModel.requestDeletion.mockImplementation(async (userId: string) => {
    const row = [...usersByEmail.values()].find((user) => user.id === userId);
    if (!row) return false;
    row.deleted_at = new Date();
    row.is_active = false;
    return true;
  });

  mockedUserModel.cancelDeletion.mockImplementation(async (userId: string) => {
    const row = [...usersByEmail.values()].find((user) => user.id === userId);
    if (!row) return undefined;
    row.deleted_at = null;
    row.is_active = true;
    return toPublic(row);
  });
});

/* ==================================================== POST /auth/register */

describe('POST /auth/register', () => {
  const validBody = {
    email: 'yeni@evenup.dev',
    password: 'GucluSifre123',
    name: 'Yeni Kullanici',
  };

  it('gecerli bilgilerle 201 doner ve kullaniciyi olusturur', async () => {
    const response = await request(app).post('/auth/register').send(validBody);

    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({
      email: validBody.email,
      name: validBody.name,
      role: 'user',
    });
    expect(response.body.token).toEqual(expect.any(String));
    expect(usersByEmail.has(validBody.email)).toBe(true);
  });

  it('sifreyi duz metin degil bcrypt hash olarak saklar', async () => {
    await request(app).post('/auth/register').send(validBody);

    const stored = usersByEmail.get(validBody.email) as UserRow;
    expect(stored.password_hash).not.toBe(validBody.password);
    expect(stored.password_hash).toMatch(/^\$2[aby]\$\d{2}\$/);
    await expect(bcrypt.compare(validBody.password, stored.password_hash)).resolves.toBe(true);
  });

  it('response govdesinde password_hash bulunmaz', async () => {
    const response = await request(app).post('/auth/register').send(validBody);

    expect(response.body.user).not.toHaveProperty('password_hash');
    expect(JSON.stringify(response.body)).not.toContain('$2b$');
  });

  it('e-postayi kucuk harfe cevirip bosluklarini kirpar', async () => {
    const response = await request(app)
      .post('/auth/register')
      .send({ ...validBody, email: '  KarisikYazim@EvenUp.DEV  ' });

    expect(response.status).toBe(201);
    expect(response.body.user.email).toBe('karisikyazim@evenup.dev');
  });

  it('gecersiz e-posta formatinda 400 doner', async () => {
    const response = await request(app)
      .post('/auth/register')
      .send({ ...validBody, email: 'email-degil' });

    expect(response.status).toBe(400);
    expect(response.body.details).toHaveProperty('email');
    expect(mockedUserModel.create).not.toHaveBeenCalled();
  });

  it('8 karakterden kisa sifrede 400 doner', async () => {
    const response = await request(app)
      .post('/auth/register')
      .send({ ...validBody, password: 'Kisa12' });

    expect(response.status).toBe(400);
    expect(response.body.details).toHaveProperty('password');
    expect(mockedUserModel.create).not.toHaveBeenCalled();
  });

  it('isim eksikse 400 doner', async () => {
    const response = await request(app)
      .post('/auth/register')
      .send({ email: validBody.email, password: validBody.password });

    expect(response.status).toBe(400);
    expect(response.body.details).toHaveProperty('name');
  });

  it('ayni e-posta ikinci kez kayit olursa 409 doner', async () => {
    await insertUser({ email: validBody.email, password: 'BaskaSifre123' });

    const response = await request(app).post('/auth/register').send(validBody);

    expect(response.status).toBe(409);
    expect(mockedUserModel.create).not.toHaveBeenCalled();
  });

  it('istemcinin gonderdigi role alanini yok sayar (yetki yukseltme engeli)', async () => {
    const response = await request(app)
      .post('/auth/register')
      .send({ ...validBody, role: 'admin' });

    expect(response.status).toBe(201);
    expect(response.body.user.role).toBe('user');
    expect(mockedUserModel.create).toHaveBeenCalledWith(
      expect.not.objectContaining({ role: 'admin' })
    );
  });
});

/* ======================================================= POST /auth/login */

describe('POST /auth/login', () => {
  const email = 'deniz@evenup.dev';
  const password = 'DogruSifre123';

  it('dogru bilgilerle 200 ve kullanilabilir bir token doner', async () => {
    const user = await insertUser({ email, password });

    const response = await request(app).post('/auth/login').send({ email, password });

    expect(response.status).toBe(200);
    expect(response.body.expiresIn).toBe('1h');

    const payload = jwt.verify(response.body.token, TEST_JWT_SECRET) as jwt.JwtPayload;
    expect(payload.userId).toBe(user.id);
    expect(payload.role).toBe('user');
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('yanlis sifre 401 doner', async () => {
    await insertUser({ email, password });

    const response = await request(app)
      .post('/auth/login')
      .send({ email, password: 'YanlisSifre123' });

    expect(response.status).toBe(401);
    expect(response.body).not.toHaveProperty('token');
  });

  it('kayitli olmayan e-posta 401 doner ve yanlis sifreyle ayni mesaji verir', async () => {
    await insertUser({ email, password });

    const unknownUser = await request(app)
      .post('/auth/login')
      .send({ email: 'yok@evenup.dev', password });
    const wrongPassword = await request(app)
      .post('/auth/login')
      .send({ email, password: 'YanlisSifre123' });

    expect(unknownUser.status).toBe(401);
    // Mesajlar ayrisirsa endpoint hangi e-postalarin kayitli oldugunu sizdirir.
    expect(unknownUser.body.message).toBe(wrongPassword.body.message);
  });

  it('pasiflestirilmis kullanici 401 doner', async () => {
    await insertUser({ email, password, is_active: false });

    const response = await request(app).post('/auth/login').send({ email, password });

    expect(response.status).toBe(401);
  });

  it('eksik alanlarda 400 doner', async () => {
    const response = await request(app).post('/auth/login').send({ email });

    expect(response.status).toBe(400);
  });

  it('response govdesinde password_hash bulunmaz', async () => {
    await insertUser({ email, password });

    const response = await request(app).post('/auth/login').send({ email, password });

    expect(response.body.user).not.toHaveProperty('password_hash');
    expect(JSON.stringify(response.body)).not.toContain('$2b$');
  });

  it('silme surecindeki (30 gun icinde) kullanici 403 doner ve kalan gunu soyler', async () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    await insertUser({ email, password, is_active: false, deleted_at: fiveDaysAgo });

    const response = await request(app).post('/auth/login').send({ email, password });

    expect(response.status).toBe(403);
    expect(response.body.details).toMatchObject({ deletionPending: true, daysRemaining: 25 });
  });

  it('yanlis sifreyle silme surecindeki hesap icin bile "e-posta veya sifre hatali" doner', async () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    await insertUser({ email, password, is_active: false, deleted_at: fiveDaysAgo });

    const response = await request(app)
      .post('/auth/login')
      .send({ email, password: 'YanlisSifre123' });

    expect(response.status).toBe(401);
    expect(response.body).not.toHaveProperty('details');
  });

  it('silme suresi (30 gun) dolmus kullanici icin 401 doner (403 degil)', async () => {
    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await insertUser({ email, password, is_active: false, deleted_at: fortyDaysAgo });

    const response = await request(app).post('/auth/login').send({ email, password });

    expect(response.status).toBe(401);
  });
});

/* =================================== POST /users/me/delete-request */

describe('POST /users/me/delete-request', () => {
  const email = 'silinecek@evenup.dev';
  const password = 'DogruSifre123';

  it('gecerli token ile hesabi silme surecine sokar ve is_active false yapar', async () => {
    const user = await insertUser({ email, password });
    const token = await loginFor(email, password);

    const response = await request(app)
      .post('/users/me/delete-request')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);

    const stored = usersByEmail.get(user.email) as UserRow;
    expect(stored.deleted_at).not.toBeNull();
    expect(stored.is_active).toBe(false);
  });

  it('token olmadan 401 doner', async () => {
    const response = await request(app).post('/users/me/delete-request');

    expect(response.status).toBe(401);
  });

  it('istek atildiktan sonra ayni token ile giris denemesi artik gecerli sifreyle bile basarisiz olur', async () => {
    await insertUser({ email, password });
    const token = await loginFor(email, password);

    await request(app).post('/users/me/delete-request').set('Authorization', `Bearer ${token}`);

    const loginAttempt = await request(app).post('/auth/login').send({ email, password });

    expect(loginAttempt.status).toBe(403);
    expect(loginAttempt.body.details).toMatchObject({ deletionPending: true });
  });
});

/* =================================== POST /users/me/cancel-deletion */

describe('POST /users/me/cancel-deletion', () => {
  const email = 'gerialinacak@evenup.dev';
  const password = 'DogruSifre123';

  it('30 gun icinde dogru sifreyle geri alir ve yeni token doner (otomatik giris)', async () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const user = await insertUser({ email, password, is_active: false, deleted_at: fiveDaysAgo });

    const response = await request(app).post('/users/me/cancel-deletion').send({ email, password });

    expect(response.status).toBe(200);
    expect(response.body.token).toBeDefined();
    expect(response.body.user.id).toBe(user.id);

    const stored = usersByEmail.get(email) as UserRow;
    expect(stored.deleted_at).toBeNull();
    expect(stored.is_active).toBe(true);

    // Donen token gercekten kullanilabilir mi (otomatik giris ile ayni sozlesme).
    const payload = jwt.verify(response.body.token, TEST_JWT_SECRET) as jwt.JwtPayload;
    expect(payload.userId).toBe(user.id);
  });

  it('yanlis sifre 401 doner', async () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    await insertUser({ email, password, is_active: false, deleted_at: fiveDaysAgo });

    const response = await request(app)
      .post('/users/me/cancel-deletion')
      .send({ email, password: 'YanlisSifre123' });

    expect(response.status).toBe(401);
  });

  it('silme surecinde olmayan hesap icin 400 doner', async () => {
    await insertUser({ email, password });

    const response = await request(app).post('/users/me/cancel-deletion').send({ email, password });

    expect(response.status).toBe(400);
  });

  it('30 gunu asmis silme talebi icin artik geri alinamaz hatasi doner', async () => {
    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await insertUser({ email, password, is_active: false, deleted_at: fortyDaysAgo });

    const response = await request(app).post('/users/me/cancel-deletion').send({ email, password });

    expect(response.status).toBe(403);
  });

  it('token gerektirmez (silme sonrasi token yok varsayimiyla)', async () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    await insertUser({ email, password, is_active: false, deleted_at: fiveDaysAgo });

    const response = await request(app)
      .post('/users/me/cancel-deletion')
      .send({ email, password });

    expect(response.status).not.toBe(401);
  });
});

/* ============================================ requireAuth — GET /auth/me */

describe('requireAuth (GET /auth/me)', () => {
  const email = 'ece@evenup.dev';
  const password = 'DogruSifre123';

  it('gecerli token ile 200 ve kullanici profili doner', async () => {
    const user = await insertUser({ email, password, name: 'Ece Yilmaz' });
    const token = await loginFor(email, password);

    const response = await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({ id: user.id, email, name: 'Ece Yilmaz' });
    expect(response.body.user).not.toHaveProperty('password_hash');
  });

  it('token olmadan 401 doner', async () => {
    const response = await request(app).get('/auth/me');

    expect(response.status).toBe(401);
  });

  it('Bearer semasi olmayan header 401 doner', async () => {
    const token = await insertUser({ email, password }).then(() => loginFor(email, password));

    const response = await request(app).get('/auth/me').set('Authorization', token);

    expect(response.status).toBe(401);
  });

  it('bozuk token 401 doner', async () => {
    const response = await request(app)
      .get('/auth/me')
      .set('Authorization', 'Bearer bu.bir.token.degil');

    expect(response.status).toBe(401);
  });

  it('baska bir secret ile imzalanmis token 401 doner', async () => {
    const forged = jwt.sign({ userId: randomUUID(), role: 'admin' }, 'baska-bir-secret');

    const response = await request(app).get('/auth/me').set('Authorization', `Bearer ${forged}`);

    expect(response.status).toBe(401);
  });

  it('suresi dolmus token 401 doner', async () => {
    const user = await insertUser({ email, password });
    const expired = jwt.sign({ userId: user.id, role: user.role }, TEST_JWT_SECRET, {
      expiresIn: '-1s',
    });

    const response = await request(app).get('/auth/me').set('Authorization', `Bearer ${expired}`);

    expect(response.status).toBe(401);
    expect(response.body.message).toMatch(/suresi dolmus/i);
  });
});

/* ====================================== requireAdmin — GET /auth/users */

describe('requireAdmin (GET /auth/users)', () => {
  const password = 'DogruSifre123';

  it('admin rolu ile 200 ve kullanici listesi doner', async () => {
    await insertUser({ email: 'admin@evenup.dev', password, role: 'admin' });
    await insertUser({ email: 'kerem@evenup.dev', password });
    const token = await loginFor('admin@evenup.dev', password);

    const response = await request(app).get('/auth/users').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.users).toHaveLength(2);
    expect(JSON.stringify(response.body)).not.toContain('$2b$');
  });

  it('normal kullanici 403 doner', async () => {
    await insertUser({ email: 'kerem@evenup.dev', password });
    const token = await loginFor('kerem@evenup.dev', password);

    const response = await request(app).get('/auth/users').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(mockedUserModel.listPublic).not.toHaveBeenCalled();
  });

  it('token olmadan 401 doner (403 degil)', async () => {
    const response = await request(app).get('/auth/users');

    expect(response.status).toBe(401);
  });
});
