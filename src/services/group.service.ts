import { randomBytes } from 'crypto';

import config from '../config/env';
import groupModel from '../models/group.model';
import ApiError from '../utils/ApiError';
import { isUuid } from '../utils/uuid';

import type { GroupMemberView, GroupSummary } from '../models/group.model';
import type { GroupInviteRow, GroupMemberRow, GroupRow } from '../types/models';

/**
 * Grup is mantigi: validasyon, yetkilendirme ve davet kodu uretimi.
 * HTTP'den haberi yoktur; hata durumlarini ApiError olarak firlatir.
 *
 * IDOR (Insecure Direct Object Reference) KARARI
 * ----------------------------------------------
 * Grup ID'si tahmin edilebilir olmasa da (uuid), yetki kontrolu ID'nin gizli
 * kalmasina **guvenmez**. Grup baglami isteyen her islem `requireMembership`
 * ya da `requireOwnership` uzerinden gecer; ikisi de once uyeligi dogrular,
 * sonra veriyi okur.
 *
 * Ayrica "grup yok" ile "grup var ama senin degil" ayni cevabi dondurur
 * (403 + ayni mesaj). Ayrisirlarsa uc nokta bir **varlik oracle**'ina donusur:
 * saldirgan ID deneyerek hangi gruplarin var oldugunu ogrenir. Gerekce
 * docs/decisions/1.4.md icinde.
 */

const MAX_NAME_LENGTH = 120; // groups.name kolonu ile ayni
const MAX_DESCRIPTION_LENGTH = 500; // groups.description kolonu ile ayni
const MAX_NICKNAME_LENGTH = 60; // member_nicknames.nickname kolonu ile ayni

/** 16 bayt = 128 bit entropi. base64url'de 22 karakter, linke gomulebilir. */
const INVITE_CODE_BYTES = 16;

const DEFAULT_INVITE_TTL_HOURS = 24 * 7;
const MAX_INVITE_TTL_HOURS = 24 * 30;
const MAX_INVITE_USES = 1000;

/** Uyelik/varlik ayrimini sizdirmamak icin tek metin. */
const ACCESS_DENIED = 'Bu gruba erisim yetkiniz yok';

/* -------------------------------------------------------------- tipler */

export interface CreateGroupInput {
  name: string;
  description?: string | null;
}

export interface CreateInviteInput {
  /** true ise mevcut aktif davet iptal edilip yenisi uretilir. */
  rotate?: boolean;
  expiresInHours?: number;
  /** 1 = tek kullanimlik. Verilmezse sinirsiz. */
  maxUses?: number | null;
}

/** Response'a konulabilecek grup gorunumu — `deleted_at` disarida kalir. */
export type PublicGroup = Omit<GroupRow, 'deleted_at'>;

export interface GroupDetail {
  group: PublicGroup;
  /** Istekte bulunan kullanicinin bu gruptaki rolu. */
  role: GroupMemberRow['role'];
  members: GroupMemberView[];
}

export interface PublicInvite {
  code: string;
  join_url: string;
  expires_at: Date;
  max_uses: number | null;
  use_count: number;
}

export interface InviteResult {
  invite: PublicInvite;
  /** false ise mevcut aktif davet aynen dondu, yeni kod uretilmedi. */
  rotated: boolean;
}

export interface JoinResult {
  group: PublicGroup;
  /** true ise kullanici zaten uyeydi; davet kotasindan dusulmedi. */
  already_member: boolean;
}

export interface SetNicknameInput {
  /** `null` ya da bos metin takma ismi **kaldirir**. */
  nickname: string | null;
}

export interface NicknameResult {
  user_id: string;
  nickname: string | null;
}

/* ---------------------------------------------------------- yardimcilar */

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

const toPublicGroup = (group: GroupRow): PublicGroup => {
  const { deleted_at: _deletedAt, ...publicFields } = group;
  return publicFields;
};

const toPublicInvite = (invite: GroupInviteRow): PublicInvite => ({
  code: invite.code,
  join_url: `${config.appUrl}/groups/join/${invite.code}`,
  expires_at: invite.expires_at,
  max_uses: invite.max_uses,
  use_count: invite.use_count,
});

/**
 * Davet kodu. Sirali ID ya da `Math.random()` **kullanilmaz**: ikisi de
 * tahmin edilebilir, yani davetsiz birinin gruba sizmasi demek.
 * `randomBytes` kriptografik olarak guvenli uretecten okur.
 */
const generateInviteCode = (): string => randomBytes(INVITE_CODE_BYTES).toString('base64url');

/* -------------------------------------------------------- validasyon */

const validateCreateInput = (
  input: Partial<CreateGroupInput>
): { name: string; description: string | null } => {
  const name = asString(input.name).trim();
  const rawDescription = asString(input.description).trim();
  const errors: Record<string, string> = {};

  if (!name) {
    errors.name = 'Grup adi zorunlu';
  } else if (name.length > MAX_NAME_LENGTH) {
    errors.name = `Grup adi en fazla ${MAX_NAME_LENGTH} karakter olabilir`;
  }

  if (rawDescription.length > MAX_DESCRIPTION_LENGTH) {
    errors.description = `Aciklama en fazla ${MAX_DESCRIPTION_LENGTH} karakter olabilir`;
  }

  if (Object.keys(errors).length > 0) {
    throw ApiError.badRequest('Gecersiz grup bilgileri', errors);
  }

  return { name, description: rawDescription || null };
};

const validateInviteInput = (
  input: Partial<CreateInviteInput>
): { rotate: boolean; expiresAt: Date; maxUses: number | null } => {
  const errors: Record<string, string> = {};

  let ttlHours = DEFAULT_INVITE_TTL_HOURS;
  if (input.expiresInHours !== undefined) {
    const value = Number(input.expiresInHours);
    if (!Number.isInteger(value) || value < 1 || value > MAX_INVITE_TTL_HOURS) {
      errors.expiresInHours = `1 ile ${MAX_INVITE_TTL_HOURS} arasinda bir tam sayi olmali`;
    } else {
      ttlHours = value;
    }
  }

  let maxUses: number | null = null;
  if (input.maxUses !== undefined && input.maxUses !== null) {
    const value = Number(input.maxUses);
    if (!Number.isInteger(value) || value < 1 || value > MAX_INVITE_USES) {
      errors.maxUses = `1 ile ${MAX_INVITE_USES} arasinda bir tam sayi olmali`;
    } else {
      maxUses = value;
    }
  }

  if (input.rotate !== undefined && typeof input.rotate !== 'boolean') {
    errors.rotate = 'true ya da false olmali';
  }

  if (Object.keys(errors).length > 0) {
    throw ApiError.badRequest('Gecersiz davet ayarlari', errors);
  }

  return {
    rotate: input.rotate === true,
    expiresAt: new Date(Date.now() + ttlHours * 60 * 60 * 1000),
    maxUses,
  };
};

/**
 * Takma isim dogrulamasi.
 *
 * BOS METIN = SILME, HATA DEGIL
 * -----------------------------
 * Arayuzde takma isim tek bir metin kutusu. Kullanici icini bosaltip
 * kaydettiginde beklenen sey "takma ismi kaldir"dir; buna "zorunlu alan" hatasi
 * dondurmek, kullaniciyi ayri bir "sil" dugmesi aramaya iterdi. Bu yuzden ayri
 * bir DELETE uc noktasi da yok — tek uc nokta iki niyeti de karsiliyor.
 *
 * `null` ile bos metin ayni sey sayiliyor: istemcinin "temizledim" niyetini iki
 * farkli sekilde ifade edebilmesi, sunucuda iki farkli davranis gerektirmiyor.
 */
const validateNickname = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== 'string') {
    throw ApiError.badRequest('Gecersiz takma isim', {
      nickname: 'Takma isim metin olmali',
    });
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.length > MAX_NICKNAME_LENGTH) {
    throw ApiError.badRequest('Gecersiz takma isim', {
      nickname: `Takma isim en fazla ${MAX_NICKNAME_LENGTH} karakter olabilir`,
    });
  }

  return trimmed;
};

/* ------------------------------------------------------- yetkilendirme */

/**
 * Kullanicinin gruba erisim hakkini dogrular ve grup + uyelik satirini doner.
 *
 * Bicimsiz ID, silinmis grup, olmayan grup ve uye olmayan kullanici —
 * dordu de ayni 403'u doner. Bicimsiz ID'nin burada elenmesi ayrica
 * PostgreSQL'in uuid cast hatasiyla 500 uretmesini de engeller.
 */
const requireMembership = async (
  groupId: string,
  userId: string
): Promise<{ group: GroupRow; membership: GroupMemberRow }> => {
  if (!isUuid(groupId)) {
    throw ApiError.forbidden(ACCESS_DENIED);
  }

  const group = await groupModel.findById(groupId);
  if (!group) {
    throw ApiError.forbidden(ACCESS_DENIED);
  }

  const membership = await groupModel.findMembership(groupId, userId);
  if (!membership) {
    throw ApiError.forbidden(ACCESS_DENIED);
  }

  return { group, membership };
};

/**
 * Uyelige ek olarak `owner` rolunu de sart kosar.
 * Buradaki mesaj farkli olabilir: kullanici zaten uye oldugu icin grubun
 * varligini biliyor, sizacak bir bilgi yok.
 */
const requireOwnership = async (
  groupId: string,
  userId: string
): Promise<{ group: GroupRow; membership: GroupMemberRow }> => {
  const context = await requireMembership(groupId, userId);

  if (context.membership.role !== 'owner') {
    throw ApiError.forbidden('Bu islem icin grup sahibi olmalisiniz');
  }

  return context;
};

/* ----------------------------------------------------------- islemler */

const createGroup = async (
  userId: string,
  input: Partial<CreateGroupInput>
): Promise<PublicGroup> => {
  const { name, description } = validateCreateInput(input);

  const group = await groupModel.createWithOwner({
    name,
    description,
    created_by: userId,
  });

  return toPublicGroup(group);
};

/** Sadece kullanicinin uyesi oldugu gruplar. Filtreleme sorgunun icinde. */
const listGroups = async (userId: string): Promise<GroupSummary[]> =>
  groupModel.listForUser(userId);

const getGroup = async (groupId: string, userId: string): Promise<GroupDetail> => {
  const { group, membership } = await requireMembership(groupId, userId);
  // `userId` yalnizca yetki icin degil, **gorunum** icin de gerekli: takma
  // isimler kisiye ozel, yani cevap kime dondugune gore degisiyor.
  const members = await groupModel.listMembers(group.id, userId);

  return { group: toPublicGroup(group), role: membership.role, members };
};

/**
 * Takma isim atar ya da kaldirir (`null`/bos metin -> kaldir).
 *
 * YETKI: YALNIZCA UYELIK — OWNER DEGIL
 * ------------------------------------
 * Takma isim kisiye ozel: kullanici yalnizca **kendi** gordugu etiketi
 * degistiriyor, hedef kisi bundan etkilenmiyor ve haberi bile olmuyor.
 * Owner sarti koymak, kimsenin gormedigi bir tercihi yonetici iznine baglamak
 * olurdu. Ayni sebeple "hedefin onayi" diye bir akis da yok.
 *
 * Hedefin **uye olmasi** yine de sart: uye olmayan biri icin ad tutmak, grup
 * disindaki kullanicilarin varligini sinamaya yarayan bir uc nokta uretirdi
 * (ID dene, 200 mu 404 mu bak). Uye olmayan her hedef ayni 404'u aliyor.
 *
 * Kendine takma isim vermek serbest: kimseyi ilgilendirmiyor ve engellemek
 * icin ayri bir hata yolu yazmak, kazanci olmayan bir kural olurdu.
 */
const setMemberNickname = async (
  groupId: string,
  actorId: string,
  targetUserId: string,
  input: Partial<SetNicknameInput>
): Promise<NicknameResult> => {
  await requireMembership(groupId, actorId);

  if (!isUuid(targetUserId)) {
    throw ApiError.notFound('Kullanici bu grubun uyesi degil');
  }

  const membership = await groupModel.findMembership(groupId, targetUserId);
  if (!membership) {
    throw ApiError.notFound('Kullanici bu grubun uyesi degil');
  }

  const nickname = validateNickname(input.nickname);

  if (nickname === null) {
    await groupModel.removeNickname(groupId, actorId, targetUserId);
    return { user_id: targetUserId, nickname: null };
  }

  const row = await groupModel.upsertNickname({
    group_id: groupId,
    owner_user_id: actorId,
    target_user_id: targetUserId,
    nickname,
  });

  return { user_id: targetUserId, nickname: row.nickname };
};

/**
 * Davet kodu uretir/doner. Yalnizca owner cagirabilir.
 *
 * Varsayilan davranis **yeniden uretmek degil, mevcut aktif daveti dondurmek**:
 * kullanici linki tekrar kopyalamak istedi diye sohbette paylasilmis link
 * olmemeli. Link sizdiysa `rotate: true` ile eskisi iptal edilip yenisi alinir.
 */
const createInvite = async (
  groupId: string,
  userId: string,
  input: Partial<CreateInviteInput> = {}
): Promise<InviteResult> => {
  await requireOwnership(groupId, userId);

  const { rotate, expiresAt, maxUses } = validateInviteInput(input);

  if (!rotate) {
    const active = await groupModel.findActiveInvite(groupId);
    if (active) {
      // Mevcut davet aynen doner; gonderilen sure/kota ayarlari uygulanmaz.
      return { invite: toPublicInvite(active), rotated: false };
    }
  }

  const invite = await groupModel.issueInvite({
    group_id: groupId,
    created_by: userId,
    code: generateInviteCode(),
    expires_at: expiresAt,
    max_uses: maxUses,
  });

  return { invite: toPublicInvite(invite), rotated: true };
};

/**
 * Davet koduyla gruba katilir.
 *
 * Gecersiz kod, suresi dolmus kod, kotasi dolmus kod ve silinmis grubun kodu
 * ayni 404'u doner: aksi halde uc nokta gecerli kod formatlarini ve grup
 * varligini sizdirir.
 */
const joinByCode = async (code: string, userId: string): Promise<JoinResult> => {
  const normalized = asString(code).trim();

  if (!normalized) {
    throw ApiError.notFound('Davet kodu gecersiz veya suresi dolmus');
  }

  const result = await groupModel.redeemInvite(normalized, userId);

  if (result.status === 'invalid') {
    throw ApiError.notFound('Davet kodu gecersiz veya suresi dolmus');
  }

  return {
    group: toPublicGroup(result.group),
    already_member: result.status === 'already_member',
  };
};

/**
 * Uye cikarir. Sadece owner yapabilir.
 *
 * Owner kendini cikaramaz: grup sahipsiz kalirdi (kimse davet uretemez,
 * kimse silemez). Cikis isteyen owner icin dogru yol grubu silmek ya da
 * ileride eklenecek sahiplik devri; bu yuzden 400 ile acik bir yonlendirme
 * doner. Detay docs/decisions/1.4.md icinde.
 *
 * Cikarilan uyenin harcama gecmisi **silinmez**: expenses/expense_shares
 * satirlari users tablosuna RESTRICT ile bagli ve grup bakiyesinin bir parcasi.
 * Uyelik satirinin gitmesi yalnizca erisimi keser.
 */
const removeMember = async (
  groupId: string,
  actorId: string,
  targetUserId: string
): Promise<{ removed_user_id: string }> => {
  await requireOwnership(groupId, actorId);

  if (targetUserId === actorId) {
    throw ApiError.badRequest(
      'Grup sahibi kendini gruptan cikaramaz; grubu silmeniz ya da sahipligi devretmeniz gerekir'
    );
  }

  if (!isUuid(targetUserId)) {
    throw ApiError.notFound('Kullanici bu grubun uyesi degil');
  }

  const membership = await groupModel.findMembership(groupId, targetUserId);
  if (!membership) {
    throw ApiError.notFound('Kullanici bu grubun uyesi degil');
  }

  // Tek owner kurali geregi buraya normalde dusulmez; yine de sessizce
  // grubu sahipsiz birakmaktansa acik hata verilir.
  if (membership.role === 'owner') {
    throw ApiError.badRequest('Grup sahibi cikarilamaz');
  }

  await groupModel.removeMember(groupId, targetUserId);

  return { removed_user_id: targetUserId };
};

/**
 * Grubu siler (soft delete). Sadece owner yapabilir.
 * Bagli expenses/expense_shares/settlements satirlarina dokunulmaz — hard
 * DELETE olsaydi CASCADE zinciri tum finansal gecmisi goturur ve geri
 * alinamazdi. Gerekce docs/decisions/1.4.md icinde.
 */
const deleteGroup = async (
  groupId: string,
  userId: string
): Promise<{ id: string; deleted_at: Date }> => {
  await requireOwnership(groupId, userId);

  const deleted = await groupModel.softDelete(groupId);

  // requireOwnership grubun canli oldugunu dogruladi; buraya duserse araya
  // baska bir istek girmis demektir (yaris). Sonuc yine "grup yok".
  if (!deleted || !deleted.deleted_at) {
    throw ApiError.forbidden(ACCESS_DENIED);
  }

  return { id: deleted.id, deleted_at: deleted.deleted_at };
};

export default {
  createGroup,
  listGroups,
  getGroup,
  createInvite,
  joinByCode,
  removeMember,
  setMemberNickname,
  deleteGroup,
  requireMembership,
  requireOwnership,
};

export {
  ACCESS_DENIED,
  MAX_NAME_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_NICKNAME_LENGTH,
  requireMembership,
  requireOwnership,
};
