import { randomUUID } from 'crypto';

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import app from '../src/app';
import userModel from '../src/models/user.model';

import type { PublicUser } from '../src/models/user.model';
import type { NotificationPrefs, UserRole, UserRow } from '../src/types/models';

/** Migration 20'deki DB varsayilaniyla ayni. */
const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  email_enabled: true,
  push_enabled: true,
  weekly_digest_enabled: false,
};

/**
 * `/users/me` uctan uca testleri (2.6 — Hafta 1'e geriye donuk eklenen uclar).
 *
 * `auth.test.ts` ile ayni desen: veri katmani bellek ici bir Map ile
 * degistiriliyor, geri kalan her sey (validasyon, bcrypt, JWT, middleware
 * sirasi, hata yoneticisi) gercek kod olarak calisiyor. Boylece testler ayakta
 * bir PostgreSQL istemiyor ama "gercekten kaydediliyor mu" sorusu yine de
 * saklanan satira bakilarak cevaplanabiliyor.
 */
jest.mock('../src/models/user.model', () => ({
  __esModule: true,
  default: {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    findPublicById: jest.fn(),
    create: jest.fn(),
    listPublic: jest.fn(),
    updateProfile: jest.fn(),
    updatePasswordHash: jest.fn(),
    markActivitySeen: jest.fn(),
    requestDeletion: jest.fn(),
    findNotificationPrefs: jest.fn(),
    updateNotificationPrefs: jest.fn(),
  },
}));

const mockedUserModel = userModel as jest.Mocked<typeof userModel>;

const TEST_JWT_SECRET = process.env.JWT_SECRET as string;

/* ------------------------------------------------------- bellek ici "tablo" */

const usersById = new Map<string, UserRow>();

const toPublic = (row: UserRow): PublicUser => {
  const { password_hash: _hash, fcm_token: _fcm, ...publicFields } = row;
  return publicFields;
};

const insertUser = async (input: {
  email?: string;
  password: string;
  name?: string;
  role?: UserRole;
  is_active?: boolean;
}): Promise<UserRow> => {
  const row: UserRow = {
    id: randomUUID(),
    email: input.email ?? `user-${randomUUID()}@evenup.test`,
    name: input.name ?? 'Test Kullanici',
    password_hash: await bcrypt.hash(input.password, 10),
    role: input.role ?? 'user',
    fcm_token: null,
    is_active: input.is_active ?? true,
    created_at: new Date(),
    activity_seen_at: new Date(),
    avatar: null,
    handle: null,
    deleted_at: null,
    notification_prefs: { ...DEFAULT_NOTIFICATION_PREFS },
  };

  usersById.set(row.id, row);
  return row;
};

const tokenFor = (user: UserRow): string =>
  jwt.sign({ userId: user.id, role: user.role }, TEST_JWT_SECRET, { expiresIn: '1h' });

const CURRENT_PASSWORD = 'MevcutSifre123';
const NEW_PASSWORD = 'YeniSifre456';

beforeAll(() => {
  // Hata yoneticisi 4xx'leri warn'lar; testler bilerek 400/401 uretiyor.
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

beforeEach(() => {
  usersById.clear();

  mockedUserModel.findById.mockImplementation(async (id: string) => usersById.get(id));

  mockedUserModel.findPublicById.mockImplementation(async (id: string) => {
    const row = usersById.get(id);
    return row ? toPublic(row) : undefined;
  });

  mockedUserModel.updateProfile.mockImplementation(async (userId: string, patch) => {
    const row = usersById.get(userId);

    if (!row) {
      return undefined;
    }

    // Gercek sorgu gibi: handle UNIQUE — baska bir kullanici zaten aliyorsa carpisma.
    if (patch.handle) {
      const taken = [...usersById.values()].some(
        (other) => other.id !== userId && other.handle === patch.handle
      );
      if (taken) {
        return 'handle_taken';
      }
    }

    // Gercek sorgu gibi: **yalnizca** name/handle/avatar kolonlari yaziliyor.
    const updated: UserRow = { ...row, name: patch.name, handle: patch.handle, avatar: patch.avatar };
    usersById.set(userId, updated);
    return toPublic(updated);
  });

  mockedUserModel.updatePasswordHash.mockImplementation(
    async (userId: string, passwordHash: string) => {
      const row = usersById.get(userId);

      if (!row) {
        return false;
      }

      usersById.set(userId, { ...row, password_hash: passwordHash });
      return true;
    }
  );

  mockedUserModel.markActivitySeen.mockImplementation(async (userId: string) => {
    const row = usersById.get(userId);

    if (!row) {
      return false;
    }

    usersById.set(userId, { ...row, activity_seen_at: new Date() });
    return true;
  });

  mockedUserModel.requestDeletion.mockImplementation(async (userId: string) => {
    const row = usersById.get(userId);

    if (!row) {
      return false;
    }

    usersById.set(userId, { ...row, deleted_at: new Date(), is_active: false });
    return true;
  });

  mockedUserModel.findNotificationPrefs.mockImplementation(async (userId: string) =>
    usersById.get(userId)?.notification_prefs
  );

  mockedUserModel.updateNotificationPrefs.mockImplementation(
    async (userId: string, prefs: NotificationPrefs) => {
      const row = usersById.get(userId);

      if (!row) {
        return undefined;
      }

      usersById.set(userId, { ...row, notification_prefs: prefs });
      return prefs;
    }
  );
});

/* ========================================================= PUT /users/me */

describe('PUT /users/me', () => {
  it('ismi gunceller ve guncel kullaniciyi doner', async () => {
    const user = await insertUser({ password: CURRENT_PASSWORD, name: 'Eski Isim' });

    const response = await request(app)
      .put('/users/me')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ name: 'Yeni Isim' });

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({ id: user.id, name: 'Yeni Isim' });
  });

  it('degisiklik gercekten saklanir: sonraki GET /auth/me yeni ismi doner', async () => {
    // Gorevin "F5'ten sonra kalici mi" sorusunun sunucu tarafindaki karsiligi:
    // cevap govdesi degil, **ikinci bir okuma** dogruluyor.
    const user = await insertUser({ password: CURRENT_PASSWORD, name: 'Eski Isim' });
    const token = tokenFor(user);

    await request(app)
      .put('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Yeni Isim' });

    const me = await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`);

    expect(me.status).toBe(200);
    expect(me.body.user.name).toBe('Yeni Isim');
  });

  it('isimdeki bosluklari kirpar', async () => {
    const user = await insertUser({ password: CURRENT_PASSWORD });

    const response = await request(app)
      .put('/users/me')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ name: '   Bosluklu Isim   ' });

    expect(response.body.user.name).toBe('Bosluklu Isim');
  });

  it('token yoksa 401 doner ve hicbir guncelleme yapilmaz', async () => {
    const response = await request(app).put('/users/me').send({ name: 'Yeni Isim' });

    expect(response.status).toBe(401);
    expect(mockedUserModel.updateProfile).not.toHaveBeenCalled();
  });

  it('bos isim 400 doner, hata alan adiyla birlikte gelir', async () => {
    const user = await insertUser({ password: CURRENT_PASSWORD, name: 'Eski Isim' });

    const response = await request(app)
      .put('/users/me')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ name: '   ' });

    expect(response.status).toBe(400);
    expect(response.body.details).toEqual({ name: 'Isim zorunlu' });
    expect(usersById.get(user.id)?.name).toBe('Eski Isim');
  });

  it('120 karakterden uzun isim 400 doner', async () => {
    const user = await insertUser({ password: CURRENT_PASSWORD });

    const response = await request(app)
      .put('/users/me')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ name: 'a'.repeat(121) });

    expect(response.status).toBe(400);
    expect(response.body.details.name).toContain('120');
  });

  /**
   * Yetki yukseltme: govdeye `role` yazan biri kendini admin yapamamali.
   * Koruma iki katmanda birden (servis yalnizca `name` cikariyor, model sabit
   * kolon yaziyor); test ikisinin **sonucunu** sinar.
   */
  it('govdedeki role / is_active / email alanlari yok sayilir', async () => {
    const user = await insertUser({ password: CURRENT_PASSWORD, name: 'Eski Isim' });

    const response = await request(app)
      .put('/users/me')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({
        name: 'Yeni Isim',
        role: 'admin',
        is_active: false,
        email: 'saldirgan@evenup.test',
      });

    expect(response.status).toBe(200);
    expect(response.body.user.role).toBe('user');

    const stored = usersById.get(user.id) as UserRow;
    expect(stored.role).toBe('user');
    expect(stored.is_active).toBe(true);
    expect(stored.email).toBe(user.email);
    expect(mockedUserModel.updateProfile).toHaveBeenCalledWith(user.id, {
      name: 'Yeni Isim',
      handle: null,
      avatar: null,
    });
  });

  it('govdedeki id baska bir kullaniciyi guncellemez', async () => {
    const attacker = await insertUser({ password: CURRENT_PASSWORD, name: 'Saldirgan' });
    const victim = await insertUser({ password: CURRENT_PASSWORD, name: 'Kurban' });

    await request(app)
      .put('/users/me')
      .set('Authorization', `Bearer ${tokenFor(attacker)}`)
      .send({ id: victim.id, name: 'Ele Gecirildi' });

    expect(usersById.get(victim.id)?.name).toBe('Kurban');
    expect(usersById.get(attacker.id)?.name).toBe('Ele Gecirildi');
  });

  it('response govdesinde password_hash bulunmaz', async () => {
    const user = await insertUser({ password: CURRENT_PASSWORD });

    const response = await request(app)
      .put('/users/me')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ name: 'Yeni Isim' });

    expect(response.body.user).not.toHaveProperty('password_hash');
    expect(JSON.stringify(response.body)).not.toContain('$2b$');
  });
});

/* ================================================ PUT /users/me/password */

describe('PUT /users/me/password', () => {
  const changePassword = (user: UserRow, body: Record<string, unknown>) =>
    request(app)
      .put('/users/me/password')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send(body);

  it('dogru mevcut sifreyle sifreyi degistirir', async () => {
    const user = await insertUser({ password: CURRENT_PASSWORD });

    const response = await changePassword(user, {
      currentPassword: CURRENT_PASSWORD,
      newPassword: NEW_PASSWORD,
    });

    expect(response.status).toBe(200);

    const stored = usersById.get(user.id) as UserRow;
    await expect(bcrypt.compare(NEW_PASSWORD, stored.password_hash)).resolves.toBe(true);
  });

  it('yeni sifre hash olarak saklanir, duz metin degil', async () => {
    const user = await insertUser({ password: CURRENT_PASSWORD });

    await changePassword(user, {
      currentPassword: CURRENT_PASSWORD,
      newPassword: NEW_PASSWORD,
    });

    const stored = usersById.get(user.id) as UserRow;
    expect(stored.password_hash).not.toBe(NEW_PASSWORD);
    expect(stored.password_hash).toMatch(/^\$2[aby]\$\d{2}\$/);
  });

  it('degisiklikten sonra eski sifreyle giris yapilamaz, yenisiyle yapilir', async () => {
    // Sifre degisikliginin **gercekten** etkili oldugunun tek gecerli kaniti.
    const user = await insertUser({ password: CURRENT_PASSWORD });
    mockedUserModel.findByEmail.mockImplementation(async (email: string) =>
      [...usersById.values()].find((row) => row.email === email)
    );

    await changePassword(user, {
      currentPassword: CURRENT_PASSWORD,
      newPassword: NEW_PASSWORD,
    });

    const withOld = await request(app)
      .post('/auth/login')
      .send({ email: user.email, password: CURRENT_PASSWORD });
    const withNew = await request(app)
      .post('/auth/login')
      .send({ email: user.email, password: NEW_PASSWORD });

    expect(withOld.status).toBe(401);
    expect(withNew.status).toBe(200);
  });

  /**
   * Gorevin asil sorusu: mevcut sifre yanlisken hicbir sey degismemeli ve
   * kullanici **acik** bir hata gormeli.
   */
  it('mevcut sifre yanlissa 400 + acik mesaj doner, sifre degismez', async () => {
    const user = await insertUser({ password: CURRENT_PASSWORD });
    const hashBefore = user.password_hash;

    const response = await changePassword(user, {
      currentPassword: 'YanlisSifre999',
      newPassword: NEW_PASSWORD,
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Mevcut sifre hatali');
    expect(response.body.details).toEqual({ currentPassword: 'Mevcut sifre hatali' });
    expect(usersById.get(user.id)?.password_hash).toBe(hashBefore);
    expect(mockedUserModel.updatePasswordHash).not.toHaveBeenCalled();
  });

  /**
   * 401 donseydi frontend'in merkezi interceptor'u bunu "oturum dustu" sayip
   * kullaniciyi cikartirdi (web/src/api/client.ts). Durum kodu bu yuzden
   * sozlesmenin bir parcasi ve testi var.
   */
  it('yanlis mevcut sifre 401 DEGIL 400 doner (oturum dusurulmemeli)', async () => {
    const user = await insertUser({ password: CURRENT_PASSWORD });

    const response = await changePassword(user, {
      currentPassword: 'YanlisSifre999',
      newPassword: NEW_PASSWORD,
    });

    expect(response.status).not.toBe(401);
    expect(response.status).toBe(400);
  });

  it('mevcut sifre bos ise 400 doner ve bcrypt karsilastirmasina hic girilmez', async () => {
    const user = await insertUser({ password: CURRENT_PASSWORD });

    const response = await changePassword(user, { newPassword: NEW_PASSWORD });

    expect(response.status).toBe(400);
    expect(response.body.details).toEqual({ currentPassword: 'Mevcut sifre zorunlu' });
    expect(mockedUserModel.findById).not.toHaveBeenCalled();
  });

  it('yeni sifre 8 karakterden kisaysa 400 doner', async () => {
    const user = await insertUser({ password: CURRENT_PASSWORD });

    const response = await changePassword(user, {
      currentPassword: CURRENT_PASSWORD,
      newPassword: 'kisa',
    });

    expect(response.status).toBe(400);
    expect(response.body.details.newPassword).toBe('Yeni sifre en az 8 karakter olmali');
  });

  it('yeni sifre mevcut sifreyle ayniysa 400 doner', async () => {
    const user = await insertUser({ password: CURRENT_PASSWORD });

    const response = await changePassword(user, {
      currentPassword: CURRENT_PASSWORD,
      newPassword: CURRENT_PASSWORD,
    });

    expect(response.status).toBe(400);
    expect(response.body.details.newPassword).toBe('Yeni sifre mevcut sifreden farkli olmali');
  });

  it('token yoksa 401 doner', async () => {
    const response = await request(app).put('/users/me/password').send({
      currentPassword: CURRENT_PASSWORD,
      newPassword: NEW_PASSWORD,
    });

    expect(response.status).toBe(401);
    expect(mockedUserModel.updatePasswordHash).not.toHaveBeenCalled();
  });

  it('devre disi birakilmis kullanici sifresini degistiremez', async () => {
    const user = await insertUser({ password: CURRENT_PASSWORD, is_active: false });

    const response = await changePassword(user, {
      currentPassword: CURRENT_PASSWORD,
      newPassword: NEW_PASSWORD,
    });

    expect(response.status).toBe(401);
    expect(mockedUserModel.updatePasswordHash).not.toHaveBeenCalled();
  });

  it('bir kullanicinin tokeni baskasinin sifresini degistiremez', async () => {
    const attacker = await insertUser({ password: CURRENT_PASSWORD });
    const victim = await insertUser({ password: 'KurbanSifresi123' });
    const victimHashBefore = victim.password_hash;

    // Govdeye kurbanin ID'si yazilsa bile hedef token'dan okunuyor.
    await changePassword(attacker, {
      userId: victim.id,
      id: victim.id,
      currentPassword: CURRENT_PASSWORD,
      newPassword: NEW_PASSWORD,
    });

    expect(usersById.get(victim.id)?.password_hash).toBe(victimHashBefore);
    await expect(
      bcrypt.compare(NEW_PASSWORD, usersById.get(attacker.id)?.password_hash as string)
    ).resolves.toBe(true);
  });

  it('cevapta sifre ya da hash sizmaz', async () => {
    const user = await insertUser({ password: CURRENT_PASSWORD });

    const response = await changePassword(user, {
      currentPassword: CURRENT_PASSWORD,
      newPassword: NEW_PASSWORD,
    });

    const body = JSON.stringify(response.body);
    expect(body).not.toContain(NEW_PASSWORD);
    expect(body).not.toContain(CURRENT_PASSWORD);
    expect(body).not.toContain('$2b$');
  });
});

/* =========================================== POST /users/me/activity-seen */

describe('POST /users/me/activity-seen', () => {
  it('kullanicinin activity_seen_at degerini simdiye gunceller', async () => {
    const user = await insertUser({ password: CURRENT_PASSWORD });
    // Ayarlanan satirla `now()` arasinda gozle gorulur bir fark olsun diye
    // gecmis bir tarihe sabitleniyor — aksi halde iki `new Date()` cagrisi
    // ayni milisaniyeye dusup test kararsizlasabilirdi.
    const before = new Date('2020-01-01T00:00:00.000Z');
    usersById.set(user.id, { ...(usersById.get(user.id) as UserRow), activity_seen_at: before });

    const response = await request(app)
      .post('/users/me/activity-seen')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send();

    expect(response.status).toBe(200);
    const after = usersById.get(user.id)?.activity_seen_at as Date;
    expect(after.getTime()).toBeGreaterThan(before.getTime());
  });

  it('govde gerektirmez', async () => {
    const user = await insertUser({ password: CURRENT_PASSWORD });

    const response = await request(app)
      .post('/users/me/activity-seen')
      .set('Authorization', `Bearer ${tokenFor(user)}`);

    expect(response.status).toBe(200);
  });

  it('token olmadan 401 doner', async () => {
    const response = await request(app).post('/users/me/activity-seen').send();

    expect(response.status).toBe(401);
    expect(mockedUserModel.markActivitySeen).not.toHaveBeenCalled();
  });

  it('bir kullanicinin tokeni baskasinin gorulme zamanini degistiremez', async () => {
    const actor = await insertUser({ password: CURRENT_PASSWORD });
    const other = await insertUser({ password: 'DigerSifre123' });
    const otherSeenBefore = usersById.get(other.id)?.activity_seen_at as Date;

    await request(app)
      .post('/users/me/activity-seen')
      .set('Authorization', `Bearer ${tokenFor(actor)}`)
      .send({ userId: other.id, id: other.id });

    expect(usersById.get(other.id)?.activity_seen_at).toEqual(otherSeenBefore);
  });
});

describe('POST /users/me/delete-request', () => {
  it('kullaniciyi silme surecine sokar (deleted_at dolar, is_active false olur)', async () => {
    const user = await insertUser({ password: CURRENT_PASSWORD });

    const response = await request(app)
      .post('/users/me/delete-request')
      .set('Authorization', `Bearer ${tokenFor(user)}`);

    expect(response.status).toBe(200);

    const stored = usersById.get(user.id) as UserRow;
    expect(stored.deleted_at).not.toBeNull();
    expect(stored.is_active).toBe(false);
  });

  it('idempotent: iki kez atilinca hata vermez, deleted_at yenilenir', async () => {
    const user = await insertUser({ password: CURRENT_PASSWORD });
    const token = tokenFor(user);

    const first = await request(app)
      .post('/users/me/delete-request')
      .set('Authorization', `Bearer ${token}`);
    const firstDeletedAt = (usersById.get(user.id) as UserRow).deleted_at;

    const second = await request(app)
      .post('/users/me/delete-request')
      .set('Authorization', `Bearer ${token}`);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect((usersById.get(user.id) as UserRow).deleted_at).not.toBeNull();
    expect(firstDeletedAt).not.toBeNull();
  });

  it('token olmadan 401 doner', async () => {
    const response = await request(app).post('/users/me/delete-request');

    expect(response.status).toBe(401);
    expect(mockedUserModel.requestDeletion).not.toHaveBeenCalled();
  });
});

describe('GET /users/me/preferences', () => {
  it('DB varsayilanini doner', async () => {
    const user = await insertUser({ password: CURRENT_PASSWORD });

    const response = await request(app)
      .get('/users/me/preferences')
      .set('Authorization', `Bearer ${tokenFor(user)}`);

    expect(response.status).toBe(200);
    expect(response.body.preferences).toEqual(DEFAULT_NOTIFICATION_PREFS);
  });

  it('token olmadan 401 doner', async () => {
    const response = await request(app).get('/users/me/preferences');

    expect(response.status).toBe(401);
  });
});

describe('PUT /users/me/preferences', () => {
  it('gecerli govdeyi kaydeder ve geri doner', async () => {
    const user = await insertUser({ password: CURRENT_PASSWORD });

    const next = { email_enabled: false, push_enabled: true, weekly_digest_enabled: true };

    const response = await request(app)
      .put('/users/me/preferences')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send(next);

    expect(response.status).toBe(200);
    expect(response.body.preferences).toEqual(next);

    const stored = usersById.get(user.id) as UserRow;
    expect(stored.notification_prefs).toEqual(next);
  });

  it('degisiklik gercekten saklanir: sonraki GET ayni degeri doner', async () => {
    const user = await insertUser({ password: CURRENT_PASSWORD });
    const token = tokenFor(user);

    await request(app)
      .put('/users/me/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({ email_enabled: false, push_enabled: false, weekly_digest_enabled: true });

    const response = await request(app)
      .get('/users/me/preferences')
      .set('Authorization', `Bearer ${token}`);

    expect(response.body.preferences).toEqual({
      email_enabled: false,
      push_enabled: false,
      weekly_digest_enabled: true,
    });
  });

  it('boolean olmayan bir alan 400 doner, hicbir sey degismez', async () => {
    const user = await insertUser({ password: CURRENT_PASSWORD });

    const response = await request(app)
      .put('/users/me/preferences')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ email_enabled: 'evet', push_enabled: true, weekly_digest_enabled: false });

    expect(response.status).toBe(400);
    expect(mockedUserModel.updateNotificationPrefs).not.toHaveBeenCalled();
    expect((usersById.get(user.id) as UserRow).notification_prefs).toEqual(
      DEFAULT_NOTIFICATION_PREFS
    );
  });

  it('eksik alanda 400 doner', async () => {
    const user = await insertUser({ password: CURRENT_PASSWORD });

    const response = await request(app)
      .put('/users/me/preferences')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ email_enabled: true, push_enabled: true });

    expect(response.status).toBe(400);
  });

  it('token olmadan 401 doner', async () => {
    const response = await request(app)
      .put('/users/me/preferences')
      .send({ email_enabled: true, push_enabled: true, weekly_digest_enabled: false });

    expect(response.status).toBe(401);
    expect(mockedUserModel.updateNotificationPrefs).not.toHaveBeenCalled();
  });

  it('bir kullanicinin tokeni baskasinin tercihini degistiremez', async () => {
    const actor = await insertUser({ password: CURRENT_PASSWORD });
    const other = await insertUser({ password: 'DigerSifre123' });

    await request(app)
      .put('/users/me/preferences')
      .set('Authorization', `Bearer ${tokenFor(actor)}`)
      .send({ email_enabled: false, push_enabled: false, weekly_digest_enabled: false });

    expect((usersById.get(other.id) as UserRow).notification_prefs).toEqual(
      DEFAULT_NOTIFICATION_PREFS
    );
  });
});
