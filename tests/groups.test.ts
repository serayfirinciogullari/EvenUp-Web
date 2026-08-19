import { randomUUID } from 'crypto';

import jwt from 'jsonwebtoken';
import request from 'supertest';

import app from '../src/app';
import groupModel from '../src/models/group.model';

import type { GroupMemberView, GroupSummary, RedeemResult } from '../src/models/group.model';
import type {
  GroupInviteRow,
  GroupMemberRow,
  GroupRow,
  GroupMemberRole,
  MemberNicknameRow,
} from '../src/types/models';

/**
 * Grup CRUD + yetkilendirme testleri.
 *
 * Veri katmani (group.model) mock'lanip yerine bellek ici tablolar konuyor:
 * testler calisan bir PostgreSQL istemez. Mock'lanmayan her sey — routing,
 * requireAuth, validasyon, **tum yetki kontrolleri**, hata yoneticisi —
 * gercek kod olarak calisir. Yani bu dosya asil olarak `group.service`
 * icindeki erisim kararlarini test eder.
 */
jest.mock('../src/models/group.model', () => ({
  __esModule: true,
  default: {
    findById: jest.fn(),
    findMembership: jest.fn(),
    listForUser: jest.fn(),
    listMembers: jest.fn(),
    listMemberIds: jest.fn(),
    upsertNickname: jest.fn(),
    removeNickname: jest.fn(),
    createWithOwner: jest.fn(),
    updateDetails: jest.fn(),
    removeMember: jest.fn(),
    softDelete: jest.fn(),
    findActiveInvite: jest.fn(),
    issueInvite: jest.fn(),
    redeemInvite: jest.fn(),
  },
}));

const mockedGroupModel = groupModel as jest.Mocked<typeof groupModel>;

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
let invites: GroupInviteRow[] = [];
let nicknames: MemberNicknameRow[] = [];

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

const isInviteUsable = (invite: GroupInviteRow): boolean =>
  invite.revoked_at === null &&
  invite.expires_at > new Date() &&
  (invite.max_uses === null || invite.use_count < invite.max_uses);

/** Model fonksiyonlarinin bellek ici karsiliklari (gercek SQL semantigi ile ayni). */
const installInMemoryModel = (): void => {
  mockedGroupModel.findById.mockImplementation(async (groupId: string) =>
    groups.find((group) => group.id === groupId && group.deleted_at === null)
  );

  mockedGroupModel.findMembership.mockImplementation(async (groupId: string, userId: string) =>
    members.find((member) => member.group_id === groupId && member.user_id === userId)
  );

  mockedGroupModel.createWithOwner.mockImplementation(async (input) => {
    const group: GroupRow = {
      id: randomUUID(),
      name: input.name,
      description: input.description,
      created_by: input.created_by,
      deleted_at: null,
      created_at: new Date(),
    };

    groups.push(group);
    members.push({
      id: randomUUID(),
      group_id: group.id,
      user_id: input.created_by,
      role: 'owner',
      joined_at: new Date(),
    });

    return group;
  });

  mockedGroupModel.listForUser.mockImplementation(async (userId: string) =>
    members
      .filter((member) => member.user_id === userId)
      .map((member) => {
        const group = groups.find((row) => row.id === member.group_id) as GroupRow;
        return { group, member };
      })
      .filter(({ group }) => group.deleted_at === null)
      .map<GroupSummary>(({ group, member }) => ({
        id: group.id,
        name: group.name,
        description: group.description,
        created_by: group.created_by,
        created_at: group.created_at,
        role: member.role,
        joined_at: member.joined_at,
        member_count: members.filter((row) => row.group_id === group.id).length,
      }))
  );

  // `viewerId` gercek sorgudaki gibi: takma isim kisiye ozel, dolayisiyla
  // hangi satirin doldugu **kimin sordugu** ile belirleniyor.
  mockedGroupModel.listMembers.mockImplementation(async (groupId: string, viewerId: string) =>
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
          nickname:
            nicknames.find(
              (row) =>
                row.group_id === groupId &&
                row.owner_user_id === viewerId &&
                row.target_user_id === member.user_id
            )?.nickname ?? null,
        };
      })
  );

  mockedGroupModel.listMemberIds.mockImplementation(async (groupId: string) =>
    members.filter((member) => member.group_id === groupId).map((member) => member.user_id)
  );

  mockedGroupModel.upsertNickname.mockImplementation(async (input) => {
    const existing = nicknames.find(
      (row) =>
        row.group_id === input.group_id &&
        row.owner_user_id === input.owner_user_id &&
        row.target_user_id === input.target_user_id
    );

    if (existing) {
      existing.nickname = input.nickname;
      existing.updated_at = new Date();
      return existing;
    }

    const row: MemberNicknameRow = {
      id: randomUUID(),
      group_id: input.group_id,
      owner_user_id: input.owner_user_id,
      target_user_id: input.target_user_id,
      nickname: input.nickname,
      created_at: new Date(),
      updated_at: new Date(),
    };

    nicknames.push(row);
    return row;
  });

  mockedGroupModel.removeNickname.mockImplementation(
    async (groupId: string, ownerId: string, targetId: string) => {
      const before = nicknames.length;
      nicknames = nicknames.filter(
        (row) =>
          !(
            row.group_id === groupId &&
            row.owner_user_id === ownerId &&
            row.target_user_id === targetId
          )
      );
      return before - nicknames.length;
    }
  );

  mockedGroupModel.updateDetails.mockImplementation(async (groupId: string, patch) => {
    const group = groups.find((row) => row.id === groupId && row.deleted_at === null);
    if (!group) {
      return undefined;
    }

    Object.assign(group, patch);
    return group;
  });

  mockedGroupModel.removeMember.mockImplementation(async (groupId: string, userId: string) => {
    const before = members.length;
    members = members.filter(
      (member) => !(member.group_id === groupId && member.user_id === userId)
    );
    return before - members.length;
  });

  mockedGroupModel.softDelete.mockImplementation(async (groupId: string) => {
    const group = groups.find((row) => row.id === groupId && row.deleted_at === null);
    if (!group) {
      return undefined;
    }

    const now = new Date();
    group.deleted_at = now;
    invites
      .filter((invite) => invite.group_id === groupId && invite.revoked_at === null)
      .forEach((invite) => {
        invite.revoked_at = now;
      });

    return group;
  });

  mockedGroupModel.findActiveInvite.mockImplementation(async (groupId: string) =>
    invites.find((invite) => invite.group_id === groupId && isInviteUsable(invite))
  );

  mockedGroupModel.issueInvite.mockImplementation(async (input) => {
    invites
      .filter((invite) => invite.group_id === input.group_id && invite.revoked_at === null)
      .forEach((invite) => {
        invite.revoked_at = new Date();
      });

    const invite: GroupInviteRow = {
      id: randomUUID(),
      group_id: input.group_id,
      created_by: input.created_by,
      code: input.code,
      expires_at: input.expires_at,
      max_uses: input.max_uses,
      use_count: 0,
      revoked_at: null,
      created_at: new Date(),
    };

    invites.push(invite);
    return invite;
  });

  mockedGroupModel.redeemInvite.mockImplementation(
    async (code: string, userId: string): Promise<RedeemResult> => {
      const invite = invites.find((row) => row.code === code);
      if (!invite || !isInviteUsable(invite)) {
        return { status: 'invalid' };
      }

      const group = groups.find((row) => row.id === invite.group_id && row.deleted_at === null);
      if (!group) {
        return { status: 'invalid' };
      }

      const existing = members.find(
        (member) => member.group_id === group.id && member.user_id === userId
      );
      if (existing) {
        return { status: 'already_member', group };
      }

      members.push({
        id: randomUUID(),
        group_id: group.id,
        user_id: userId,
        role: 'member',
        joined_at: new Date(),
      });
      invite.use_count += 1;

      return { status: 'joined', group };
    }
  );
};

/* -------------------------------------------------------------- yardimcilar */

const createGroupFor = async (
  user: TestUser,
  body: Record<string, unknown> = { name: 'Ev Arkadaslari' }
): Promise<GroupRow> => {
  const response = await request(app)
    .post('/groups')
    .set(...auth(user))
    .send(body);
  expect(response.status).toBe(201);
  return response.body.group as GroupRow;
};

const inviteCodeFor = async (
  owner: TestUser,
  groupId: string,
  body: Record<string, unknown> = {}
): Promise<string> => {
  const response = await request(app)
    .post(`/groups/${groupId}/invite`)
    .set(...auth(owner))
    .send(body);
  expect([200, 201]).toContain(response.status);
  return response.body.invite.code as string;
};

const roleOf = (groupId: string, userId: string): GroupMemberRole | undefined =>
  members.find((member) => member.group_id === groupId && member.user_id === userId)?.role;

beforeAll(() => {
  // Hata yoneticisi 4xx'leri warn'lar; testler bilerek 401/403/404 uretiyor.
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

beforeEach(() => {
  users.clear();
  groups = [];
  members = [];
  invites = [];
  nicknames = [];
  installInMemoryModel();
});

/* =============================================================== POST /groups */

describe('POST /groups', () => {
  it('grubu olusturur ve kurucuyu owner rolüyle uye yapar', async () => {
    const deniz = makeUser('Deniz');

    const response = await request(app)
      .post('/groups')
      .set(...auth(deniz))
      .send({ name: 'Tatil Fonu', description: 'Yaz tatili masraflari' });

    expect(response.status).toBe(201);
    expect(response.body.group).toMatchObject({
      name: 'Tatil Fonu',
      description: 'Yaz tatili masraflari',
      created_by: deniz.id,
    });
    expect(roleOf(response.body.group.id, deniz.id)).toBe('owner');
  });

  it('aciklama opsiyoneldir, verilmezse null olur', async () => {
    const deniz = makeUser('Deniz');

    const group = await createGroupFor(deniz, { name: 'Ofis Kahvesi' });

    expect(group.description).toBeNull();
  });

  it('soft delete alani response govdesine sizmaz', async () => {
    const deniz = makeUser('Deniz');

    const group = await createGroupFor(deniz);

    expect(group).not.toHaveProperty('deleted_at');
  });

  it('grup adi bossa 400 doner', async () => {
    const deniz = makeUser('Deniz');

    const response = await request(app)
      .post('/groups')
      .set(...auth(deniz))
      .send({ description: 'adsiz' });

    expect(response.status).toBe(400);
    expect(response.body.details).toHaveProperty('name');
    expect(mockedGroupModel.createWithOwner).not.toHaveBeenCalled();
  });

  it('token olmadan 401 doner', async () => {
    const response = await request(app).post('/groups').send({ name: 'Tatil Fonu' });

    expect(response.status).toBe(401);
    expect(mockedGroupModel.createWithOwner).not.toHaveBeenCalled();
  });
});

/* ================================================================ GET /groups */

describe('GET /groups', () => {
  it('sadece kullanicinin uyesi oldugu gruplari listeler', async () => {
    const deniz = makeUser('Deniz');
    const ece = makeUser('Ece');

    const denizinGrubu = await createGroupFor(deniz, { name: 'Deniz Evi' });
    await createGroupFor(ece, { name: 'Ece Evi' });

    const response = await request(app)
      .get('/groups')
      .set(...auth(deniz));

    expect(response.status).toBe(200);
    expect(response.body.groups).toHaveLength(1);
    expect(response.body.groups[0]).toMatchObject({
      id: denizinGrubu.id,
      name: 'Deniz Evi',
      role: 'owner',
      member_count: 1,
    });
  });

  it('hic grubu olmayan kullaniciya bos liste doner', async () => {
    const kerem = makeUser('Kerem');
    const ece = makeUser('Ece');
    await createGroupFor(ece, { name: 'Ece Evi' });

    const response = await request(app)
      .get('/groups')
      .set(...auth(kerem));

    expect(response.status).toBe(200);
    expect(response.body.groups).toEqual([]);
  });

  it('token olmadan 401 doner', async () => {
    const response = await request(app).get('/groups');

    expect(response.status).toBe(401);
  });
});

/* ========================================== GET /groups/:id — IDOR korumasi */

describe('GET /groups/:id (IDOR)', () => {
  it('uye kullaniciya grup detayini ve uye listesini doner', async () => {
    const deniz = makeUser('Deniz');
    const group = await createGroupFor(deniz);

    const response = await request(app)
      .get(`/groups/${group.id}`)
      .set(...auth(deniz));

    expect(response.status).toBe(200);
    expect(response.body.group.id).toBe(group.id);
    expect(response.body.role).toBe('owner');
    expect(response.body.members).toEqual([
      expect.objectContaining({ user_id: deniz.id, role: 'owner' }),
    ]);
  });

  it('uye olmayan kullanici 403 alir ve hicbir grup bilgisi gormez', async () => {
    const deniz = makeUser('Deniz');
    const kerem = makeUser('Kerem');
    const group = await createGroupFor(deniz, { name: 'Gizli Grup' });

    const response = await request(app)
      .get(`/groups/${group.id}`)
      .set(...auth(kerem));

    expect(response.status).toBe(403);
    // Grup adi, uye listesi, kurucu id'si — hicbiri govdede olmamali
    expect(JSON.stringify(response.body)).not.toContain('Gizli Grup');
    expect(JSON.stringify(response.body)).not.toContain(deniz.id);
    expect(mockedGroupModel.listMembers).not.toHaveBeenCalled();
  });

  it("var olmayan grup ID'si, uye olunmayan grupla ayni cevabi verir (varlik sizintisi yok)", async () => {
    const deniz = makeUser('Deniz');
    const kerem = makeUser('Kerem');
    const group = await createGroupFor(deniz);

    const varOlmayan = await request(app)
      .get(`/groups/${randomUUID()}`)
      .set(...auth(kerem));
    const baskasinin = await request(app)
      .get(`/groups/${group.id}`)
      .set(...auth(kerem));

    // Statu ya da mesaj ayrisirsa endpoint "bu ID'de bir grup var mi?"
    // sorusunun cevabini sizdiran bir oracle'a donusur.
    expect(varOlmayan.status).toBe(403);
    expect(baskasinin.status).toBe(403);
    expect(varOlmayan.body.message).toBe(baskasinin.body.message);
  });

  it("bicimsiz grup ID'si 500 degil 403 doner", async () => {
    const kerem = makeUser('Kerem');

    const response = await request(app)
      .get('/groups/not-a-uuid')
      .set(...auth(kerem));

    expect(response.status).toBe(403);
    expect(mockedGroupModel.findById).not.toHaveBeenCalled();
  });

  it('token olmadan 401 doner (403 degil)', async () => {
    const deniz = makeUser('Deniz');
    const group = await createGroupFor(deniz);

    const response = await request(app).get(`/groups/${group.id}`);

    expect(response.status).toBe(401);
  });
});

/* ================================================ POST /groups/:id/invite */

describe('POST /groups/:id/invite', () => {
  it('tahmin edilemez bir kod uretir (sirali ID degil)', async () => {
    const deniz = makeUser('Deniz');
    const group = await createGroupFor(deniz);

    const response = await request(app)
      .post(`/groups/${group.id}/invite`)
      .set(...auth(deniz))
      .send({});

    expect(response.status).toBe(201);

    const { code, join_url: joinUrl } = response.body.invite;
    // base64url(16 bayt) = 22 karakter, 128 bit entropi
    expect(code).toMatch(/^[A-Za-z0-9_-]{22}$/);
    // Kod grup/kullanici ID'sinden turetilmemeli
    expect(code).not.toContain(group.id);
    expect(group.id).not.toContain(code);
    expect(joinUrl).toContain(`/groups/join/${code}`);
  });

  it('iki farkli grubun kodlari birbirinden bagimsizdir', async () => {
    const deniz = makeUser('Deniz');
    const birinci = await createGroupFor(deniz, { name: 'Birinci' });
    const ikinci = await createGroupFor(deniz, { name: 'Ikinci' });

    const kod1 = await inviteCodeFor(deniz, birinci.id);
    const kod2 = await inviteCodeFor(deniz, ikinci.id);

    expect(kod1).not.toBe(kod2);
  });

  it('ikinci cagri mevcut aktif kodu doner, yeni kod uretmez', async () => {
    const deniz = makeUser('Deniz');
    const group = await createGroupFor(deniz);

    const ilk = await request(app)
      .post(`/groups/${group.id}/invite`)
      .set(...auth(deniz))
      .send({});
    const ikinci = await request(app)
      .post(`/groups/${group.id}/invite`)
      .set(...auth(deniz))
      .send({});

    expect(ilk.status).toBe(201);
    expect(ilk.body.rotated).toBe(true);
    // Paylasilmis bir link, sahibi "davet et"e tekrar bastigi icin olmemeli
    expect(ikinci.status).toBe(200);
    expect(ikinci.body.rotated).toBe(false);
    expect(ikinci.body.invite.code).toBe(ilk.body.invite.code);
  });

  it('rotate:true eski kodu olduru ve yenisini verir', async () => {
    const deniz = makeUser('Deniz');
    const kerem = makeUser('Kerem');
    const group = await createGroupFor(deniz);

    const eskiKod = await inviteCodeFor(deniz, group.id);
    const yeniKod = await inviteCodeFor(deniz, group.id, { rotate: true });

    expect(yeniKod).not.toBe(eskiKod);

    const eskiyle = await request(app)
      .post(`/groups/join/${eskiKod}`)
      .set(...auth(kerem));
    expect(eskiyle.status).toBe(404);

    const yeniyle = await request(app)
      .post(`/groups/join/${yeniKod}`)
      .set(...auth(kerem));
    expect(yeniyle.status).toBe(200);
  });

  it('owner olmayan uye davet kodu uretemez', async () => {
    const deniz = makeUser('Deniz');
    const kerem = makeUser('Kerem');
    const group = await createGroupFor(deniz);

    const kod = await inviteCodeFor(deniz, group.id);
    await request(app)
      .post(`/groups/join/${kod}`)
      .set(...auth(kerem));

    const response = await request(app)
      .post(`/groups/${group.id}/invite`)
      .set(...auth(kerem))
      .send({});

    expect(response.status).toBe(403);
  });

  it('uye olmayan kullanici davet kodu uretemez', async () => {
    const deniz = makeUser('Deniz');
    const yabanci = makeUser('Yabanci');
    const group = await createGroupFor(deniz);

    const response = await request(app)
      .post(`/groups/${group.id}/invite`)
      .set(...auth(yabanci))
      .send({});

    expect(response.status).toBe(403);
    expect(mockedGroupModel.issueInvite).not.toHaveBeenCalled();
  });

  it('gecersiz sure/kota degerlerinde 400 doner', async () => {
    const deniz = makeUser('Deniz');
    const group = await createGroupFor(deniz);

    const response = await request(app)
      .post(`/groups/${group.id}/invite`)
      .set(...auth(deniz))
      .send({ expiresInHours: 0, maxUses: -3 });

    expect(response.status).toBe(400);
    expect(response.body.details).toHaveProperty('expiresInHours');
    expect(response.body.details).toHaveProperty('maxUses');
  });
});

/* ========================================== POST /groups/join/:inviteCode */

describe('POST /groups/join/:inviteCode', () => {
  it('gecerli kodla gruba member rolüyle katilir', async () => {
    const deniz = makeUser('Deniz');
    const kerem = makeUser('Kerem');
    const group = await createGroupFor(deniz);
    const kod = await inviteCodeFor(deniz, group.id);

    const response = await request(app)
      .post(`/groups/join/${kod}`)
      .set(...auth(kerem));

    expect(response.status).toBe(200);
    expect(response.body.group.id).toBe(group.id);
    expect(response.body.already_member).toBe(false);
    // Katilan kisi owner degil member olur
    expect(roleOf(group.id, kerem.id)).toBe('member');
  });

  it('katildiktan sonra grup detayina erisebilir', async () => {
    const deniz = makeUser('Deniz');
    const kerem = makeUser('Kerem');
    const group = await createGroupFor(deniz);
    const kod = await inviteCodeFor(deniz, group.id);

    const oncesi = await request(app)
      .get(`/groups/${group.id}`)
      .set(...auth(kerem));
    expect(oncesi.status).toBe(403);

    await request(app)
      .post(`/groups/join/${kod}`)
      .set(...auth(kerem));

    const sonrasi = await request(app)
      .get(`/groups/${group.id}`)
      .set(...auth(kerem));
    expect(sonrasi.status).toBe(200);
    expect(sonrasi.body.role).toBe('member');
  });

  it('varsayilan kod cok kullanimliktir: farkli kullanicilar ayni kodla katilir', async () => {
    const deniz = makeUser('Deniz');
    const ece = makeUser('Ece');
    const kerem = makeUser('Kerem');
    const group = await createGroupFor(deniz);
    const kod = await inviteCodeFor(deniz, group.id);

    const eceIcin = await request(app)
      .post(`/groups/join/${kod}`)
      .set(...auth(ece));
    const keremIcin = await request(app)
      .post(`/groups/join/${kod}`)
      .set(...auth(kerem));

    expect(eceIcin.status).toBe(200);
    expect(keremIcin.status).toBe(200);
    expect(members.filter((member) => member.group_id === group.id)).toHaveLength(3);
  });

  it('maxUses:1 verildiginde kod tek kullanimlik olur', async () => {
    const deniz = makeUser('Deniz');
    const ece = makeUser('Ece');
    const kerem = makeUser('Kerem');
    const group = await createGroupFor(deniz);
    const kod = await inviteCodeFor(deniz, group.id, { maxUses: 1 });

    const ilk = await request(app)
      .post(`/groups/join/${kod}`)
      .set(...auth(ece));
    const ikinci = await request(app)
      .post(`/groups/join/${kod}`)
      .set(...auth(kerem));

    expect(ilk.status).toBe(200);
    expect(ikinci.status).toBe(404);
    expect(roleOf(group.id, kerem.id)).toBeUndefined();
  });

  it('zaten uye olan tekrar tiklarsa hata degil already_member doner ve kota harcanmaz', async () => {
    const deniz = makeUser('Deniz');
    const ece = makeUser('Ece');
    const group = await createGroupFor(deniz);
    const kod = await inviteCodeFor(deniz, group.id, { maxUses: 2 });

    await request(app)
      .post(`/groups/join/${kod}`)
      .set(...auth(ece));
    const tekrar = await request(app)
      .post(`/groups/join/${kod}`)
      .set(...auth(ece));

    expect(tekrar.status).toBe(200);
    expect(tekrar.body.already_member).toBe(true);
    expect(members.filter((member) => member.group_id === group.id)).toHaveLength(2);
    expect(invites[0].use_count).toBe(1);
  });

  it('gecersiz kod 404 doner', async () => {
    const kerem = makeUser('Kerem');

    const response = await request(app)
      .post('/groups/join/boyle-bir-kod-yok')
      .set(...auth(kerem));

    expect(response.status).toBe(404);
  });

  it('suresi dolmus kod 404 doner', async () => {
    const deniz = makeUser('Deniz');
    const kerem = makeUser('Kerem');
    const group = await createGroupFor(deniz);
    const kod = await inviteCodeFor(deniz, group.id);

    // Zamanin gectigini simule et
    invites[0].expires_at = new Date(Date.now() - 1000);

    const response = await request(app)
      .post(`/groups/join/${kod}`)
      .set(...auth(kerem));

    expect(response.status).toBe(404);
    expect(roleOf(group.id, kerem.id)).toBeUndefined();
  });

  it('token olmadan 401 doner', async () => {
    const deniz = makeUser('Deniz');
    const group = await createGroupFor(deniz);
    const kod = await inviteCodeFor(deniz, group.id);

    const response = await request(app).post(`/groups/join/${kod}`);

    expect(response.status).toBe(401);
    expect(mockedGroupModel.redeemInvite).not.toHaveBeenCalled();
  });
});

/* ==================== PUT /groups/:id/members/:userId/nickname */

describe('PUT /groups/:id/members/:userId/nickname', () => {
  const setup = async (): Promise<{
    owner: TestUser;
    member: TestUser;
    outsider: TestUser;
    group: GroupRow;
  }> => {
    const owner = makeUser('Deniz');
    const member = makeUser('Ece');
    const outsider = makeUser('Yabanci');
    const group = await createGroupFor(owner);
    const kod = await inviteCodeFor(owner, group.id);

    await request(app)
      .post(`/groups/join/${kod}`)
      .set(...auth(member));

    return { owner, member, outsider, group };
  };

  const setNickname = (actor: TestUser, groupId: string, targetId: string, nickname: unknown) =>
    request(app)
      .put(`/groups/${groupId}/members/${targetId}/nickname`)
      .set(...auth(actor))
      .send({ nickname });

  const membersSeenBy = async (user: TestUser, groupId: string) => {
    const response = await request(app)
      .get(`/groups/${groupId}`)
      .set(...auth(user));

    expect(response.status).toBe(200);
    return response.body.members as { user_id: string; name: string; nickname: string | null }[];
  };

  it('uye baska bir uyeye takma isim verebilir', async () => {
    const { owner, member, group } = await setup();

    const response = await setNickname(owner, group.id, member.id, 'Ev Arkadasi');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ user_id: member.id, nickname: 'Ev Arkadasi' });
  });

  it('takma isim grup detayinda gercek adin YANINDA doner', async () => {
    const { owner, member, group } = await setup();
    await setNickname(owner, group.id, member.id, 'Ev Arkadasi');

    const row = (await membersSeenBy(owner, group.id)).find((m) => m.user_id === member.id);

    // Takma isim gercek adin yerine gecmiyor: ikisi de cevapta.
    expect(row).toMatchObject({ name: 'Ece', nickname: 'Ev Arkadasi' });
  });

  /*
    Ozelligin asil kurali bu: takma isim KISIYE OZEL. Ayni satiri baska bir
    uye okudugunda `nickname` bos gelmeli — aksi halde birinin baskasina
    taktigi ad herkese gorunurdu.
  */
  it('takma ismi yalnizca veren kisi gorur', async () => {
    const { owner, member, group } = await setup();
    await setNickname(owner, group.id, member.id, 'Ev Arkadasi');

    const seenByMember = (await membersSeenBy(member, group.id)).find(
      (m) => m.user_id === member.id
    );

    expect(seenByMember?.nickname).toBeNull();
  });

  it('iki uye ayni kisiye farkli adlar verebilir', async () => {
    const { owner, member, group } = await setup();

    await setNickname(owner, group.id, member.id, 'Ev Arkadasi');
    await setNickname(member, group.id, owner.id, 'Kirali');

    const ownerView = (await membersSeenBy(owner, group.id)).find((m) => m.user_id === member.id);
    const memberView = (await membersSeenBy(member, group.id)).find((m) => m.user_id === owner.id);

    expect(ownerView?.nickname).toBe('Ev Arkadasi');
    expect(memberView?.nickname).toBe('Kirali');
  });

  it('ayni hedefe ikinci kez yazmak gunceller, ikinci kayit acmaz', async () => {
    const { owner, member, group } = await setup();

    await setNickname(owner, group.id, member.id, 'Ilk');
    const response = await setNickname(owner, group.id, member.id, 'Ikinci');

    expect(response.status).toBe(200);
    expect(response.body.nickname).toBe('Ikinci');

    const row = (await membersSeenBy(owner, group.id)).find((m) => m.user_id === member.id);
    expect(row?.nickname).toBe('Ikinci');
  });

  it('bos metin takma ismi kaldirir — hata degil', async () => {
    const { owner, member, group } = await setup();
    await setNickname(owner, group.id, member.id, 'Ev Arkadasi');

    const response = await setNickname(owner, group.id, member.id, '   ');

    expect(response.status).toBe(200);
    expect(response.body.nickname).toBeNull();

    const row = (await membersSeenBy(owner, group.id)).find((m) => m.user_id === member.id);
    expect(row?.nickname).toBeNull();
  });

  it('null da kaldirir', async () => {
    const { owner, member, group } = await setup();
    await setNickname(owner, group.id, member.id, 'Ev Arkadasi');

    const response = await setNickname(owner, group.id, member.id, null);

    expect(response.status).toBe(200);
    expect(response.body.nickname).toBeNull();
  });

  it('kendine takma isim vermek serbest', async () => {
    const { owner, group } = await setup();

    const response = await setNickname(owner, group.id, owner.id, 'Ben');

    expect(response.status).toBe(200);
    expect(response.body.nickname).toBe('Ben');
  });

  it('60 karakterden uzun takma isim 400 doner', async () => {
    const { owner, member, group } = await setup();

    const response = await setNickname(owner, group.id, member.id, 'x'.repeat(61));

    expect(response.status).toBe(400);
    expect(response.body.details).toHaveProperty('nickname');
    expect(mockedGroupModel.upsertNickname).not.toHaveBeenCalled();
  });

  it('metin olmayan deger 400 doner', async () => {
    const { owner, member, group } = await setup();

    const response = await setNickname(owner, group.id, member.id, 42);

    expect(response.status).toBe(400);
    expect(response.body.details).toHaveProperty('nickname');
  });

  it('owner olmayan uye de takma isim verebilir — yetki uyelik', async () => {
    const { owner, member, group } = await setup();

    const response = await setNickname(member, group.id, owner.id, 'Patron');

    expect(response.status).toBe(200);
    expect(response.body.nickname).toBe('Patron');
  });

  it('uye olmayan kullanici 403 alir', async () => {
    const { member, outsider, group } = await setup();

    const response = await setNickname(outsider, group.id, member.id, 'Deneme');

    expect(response.status).toBe(403);
    expect(mockedGroupModel.upsertNickname).not.toHaveBeenCalled();
  });

  it('grubun uyesi olmayan bir hedefe ad verilemez', async () => {
    const { owner, outsider, group } = await setup();

    const response = await setNickname(owner, group.id, outsider.id, 'Deneme');

    // 404: uc nokta grup disindaki kullanicilarin varligini sinamaya yaramasin.
    expect(response.status).toBe(404);
    expect(mockedGroupModel.upsertNickname).not.toHaveBeenCalled();
  });

  it('token olmadan 401 doner', async () => {
    const { member, group } = await setup();

    const response = await request(app)
      .put(`/groups/${group.id}/members/${member.id}/nickname`)
      .send({ nickname: 'Deneme' });

    expect(response.status).toBe(401);
    expect(mockedGroupModel.upsertNickname).not.toHaveBeenCalled();
  });
});

/* ================================ DELETE /groups/:id/members/:userId */

describe('DELETE /groups/:id/members/:userId', () => {
  const setup = async (): Promise<{
    owner: TestUser;
    member: TestUser;
    outsider: TestUser;
    group: GroupRow;
  }> => {
    const owner = makeUser('Deniz');
    const member = makeUser('Ece');
    const outsider = makeUser('Yabanci');
    const group = await createGroupFor(owner);
    const kod = await inviteCodeFor(owner, group.id);

    await request(app)
      .post(`/groups/join/${kod}`)
      .set(...auth(member));

    return { owner, member, outsider, group };
  };

  it('owner bir uyeyi cikarabilir', async () => {
    const { owner, member, group } = await setup();

    const response = await request(app)
      .delete(`/groups/${group.id}/members/${member.id}`)
      .set(...auth(owner));

    expect(response.status).toBe(200);
    expect(response.body.removed_user_id).toBe(member.id);
    expect(roleOf(group.id, member.id)).toBeUndefined();
  });

  it('cikarilan uye artik grup detayini goremez', async () => {
    const { owner, member, group } = await setup();

    await request(app)
      .delete(`/groups/${group.id}/members/${member.id}`)
      .set(...auth(owner));

    const response = await request(app)
      .get(`/groups/${group.id}`)
      .set(...auth(member));

    expect(response.status).toBe(403);
  });

  it('owner olmayan uye baskasini cikaramaz', async () => {
    const { owner, member, group } = await setup();

    const response = await request(app)
      .delete(`/groups/${group.id}/members/${owner.id}`)
      .set(...auth(member));

    expect(response.status).toBe(403);
    expect(roleOf(group.id, owner.id)).toBe('owner');
  });

  it('uye olmayan kullanici uye cikaramaz', async () => {
    const { member, outsider, group } = await setup();

    const response = await request(app)
      .delete(`/groups/${group.id}/members/${member.id}`)
      .set(...auth(outsider));

    expect(response.status).toBe(403);
    expect(roleOf(group.id, member.id)).toBe('member');
  });

  it('owner kendini cikaramaz, yonlendirici bir 400 alir', async () => {
    const { owner, group } = await setup();

    const response = await request(app)
      .delete(`/groups/${group.id}/members/${owner.id}`)
      .set(...auth(owner));

    expect(response.status).toBe(400);
    // Grup sahipsiz kalmasin diye: dogru yol grubu silmek ya da devretmek
    expect(response.body.message).toMatch(/silmeniz|devretmeniz/i);
    expect(roleOf(group.id, owner.id)).toBe('owner');
  });

  it('grubun uyesi olmayan biri cikarilmak istenirse 404 doner', async () => {
    const { owner, outsider, group } = await setup();

    const response = await request(app)
      .delete(`/groups/${group.id}/members/${outsider.id}`)
      .set(...auth(owner));

    expect(response.status).toBe(404);
  });
});

/* ============================================================ PUT /groups/:id */

describe('PUT /groups/:id', () => {
  it('owner grup adini ve aciklamasini gunceller', async () => {
    const deniz = makeUser('Deniz');
    const group = await createGroupFor(deniz, { name: 'Eski Ad', description: 'eski' });

    const response = await request(app)
      .put(`/groups/${group.id}`)
      .set(...auth(deniz))
      .send({ name: 'Yeni Ad', description: 'yeni' });

    expect(response.status).toBe(200);
    expect(response.body.group).toMatchObject({ name: 'Yeni Ad', description: 'yeni' });
  });

  it('yalnizca gonderilen alan degisir', async () => {
    const deniz = makeUser('Deniz');
    const group = await createGroupFor(deniz, { name: 'Ev Arkadaslari', description: 'orijinal' });

    const response = await request(app)
      .put(`/groups/${group.id}`)
      .set(...auth(deniz))
      .send({ name: 'Yeni Isim' });

    expect(response.status).toBe(200);
    expect(response.body.group).toMatchObject({ name: 'Yeni Isim', description: 'orijinal' });
  });

  it('bos aciklama aciklamayi kaldirir', async () => {
    const deniz = makeUser('Deniz');
    const group = await createGroupFor(deniz, { name: 'Ev Arkadaslari', description: 'var' });

    const response = await request(app)
      .put(`/groups/${group.id}`)
      .set(...auth(deniz))
      .send({ description: '   ' });

    expect(response.status).toBe(200);
    expect(response.body.group.description).toBeNull();
  });

  it('bos ad reddedilir', async () => {
    const deniz = makeUser('Deniz');
    const group = await createGroupFor(deniz);

    const response = await request(app)
      .put(`/groups/${group.id}`)
      .set(...auth(deniz))
      .send({ name: '   ' });

    expect(response.status).toBe(400);
    expect(response.body.details).toHaveProperty('name');
    expect(mockedGroupModel.updateDetails).not.toHaveBeenCalled();
  });

  it('hicbir alan gonderilmezse 400 doner', async () => {
    const deniz = makeUser('Deniz');
    const group = await createGroupFor(deniz);

    const response = await request(app)
      .put(`/groups/${group.id}`)
      .set(...auth(deniz))
      .send({});

    expect(response.status).toBe(400);
  });

  it('owner olmayan uye grubu guncelleyemez', async () => {
    const deniz = makeUser('Deniz');
    const kerem = makeUser('Kerem');
    const group = await createGroupFor(deniz);
    const kod = await inviteCodeFor(deniz, group.id);

    await request(app)
      .post(`/groups/join/${kod}`)
      .set(...auth(kerem));

    const response = await request(app)
      .put(`/groups/${group.id}`)
      .set(...auth(kerem))
      .send({ name: 'Baskasinin adi' });

    expect(response.status).toBe(403);
    expect(mockedGroupModel.updateDetails).not.toHaveBeenCalled();
  });

  it('uye olmayan kullanici 403 alir', async () => {
    const deniz = makeUser('Deniz');
    const yabanci = makeUser('Yabanci');
    const group = await createGroupFor(deniz);

    const response = await request(app)
      .put(`/groups/${group.id}`)
      .set(...auth(yabanci))
      .send({ name: 'Deneme' });

    expect(response.status).toBe(403);
  });

  it('token olmadan 401 doner', async () => {
    const deniz = makeUser('Deniz');
    const group = await createGroupFor(deniz);

    const response = await request(app).put(`/groups/${group.id}`).send({ name: 'Deneme' });

    expect(response.status).toBe(401);
  });
});

/* ========================================================= DELETE /groups/:id */

describe('DELETE /groups/:id', () => {
  const setup = async (): Promise<{ owner: TestUser; member: TestUser; group: GroupRow }> => {
    const owner = makeUser('Deniz');
    const member = makeUser('Ece');
    const group = await createGroupFor(owner);
    const kod = await inviteCodeFor(owner, group.id);

    await request(app)
      .post(`/groups/join/${kod}`)
      .set(...auth(member));

    return { owner, member, group };
  };

  it('owner olmayan uye grubu silemez', async () => {
    const { member, group } = await setup();

    const response = await request(app)
      .delete(`/groups/${group.id}`)
      .set(...auth(member));

    expect(response.status).toBe(403);
    expect(mockedGroupModel.softDelete).not.toHaveBeenCalled();
    expect(groups[0].deleted_at).toBeNull();
  });

  it('uye olmayan kullanici grubu silemez', async () => {
    const { group } = await setup();
    const yabanci = makeUser('Yabanci');

    const response = await request(app)
      .delete(`/groups/${group.id}`)
      .set(...auth(yabanci));

    expect(response.status).toBe(403);
    expect(groups[0].deleted_at).toBeNull();
  });

  it('owner grubu siler: satir durur, deleted_at dolar (soft delete)', async () => {
    const { owner, group } = await setup();

    const response = await request(app)
      .delete(`/groups/${group.id}`)
      .set(...auth(owner));

    expect(response.status).toBe(200);
    expect(response.body.group.id).toBe(group.id);
    // Hard delete olsaydi satir yok olurdu; burada duruyor ve isaretli
    expect(groups).toHaveLength(1);
    expect(groups[0].deleted_at).toBeInstanceOf(Date);
  });

  it('silinen grup listede gorunmez ve detayi acilmaz', async () => {
    const { owner, member, group } = await setup();

    await request(app)
      .delete(`/groups/${group.id}`)
      .set(...auth(owner));

    const liste = await request(app)
      .get('/groups')
      .set(...auth(owner));
    const detay = await request(app)
      .get(`/groups/${group.id}`)
      .set(...auth(member));

    expect(liste.body.groups).toEqual([]);
    // Uyeligi hala duruyor ama grup silinmis: erisim yok
    expect(detay.status).toBe(403);
  });

  it('silinen grubun davet kodu calismaz', async () => {
    const { owner, group } = await setup();
    const kerem = makeUser('Kerem');
    const kod = await inviteCodeFor(owner, group.id);

    await request(app)
      .delete(`/groups/${group.id}`)
      .set(...auth(owner));

    const response = await request(app)
      .post(`/groups/join/${kod}`)
      .set(...auth(kerem));

    expect(response.status).toBe(404);
  });

  it('ayni grubun ikinci silme istegi 403 doner', async () => {
    const { owner, group } = await setup();

    await request(app)
      .delete(`/groups/${group.id}`)
      .set(...auth(owner));
    const ikinci = await request(app)
      .delete(`/groups/${group.id}`)
      .set(...auth(owner));

    expect(ikinci.status).toBe(403);
  });
});
