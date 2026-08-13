import db from '../db/connection';

import type { GroupInviteRow, GroupMemberRole, GroupMemberRow, GroupRow } from '../types/models';

/**
 * groups / group_members / group_invites veri erisim katmani.
 *
 * Iki kural:
 *
 * 1. **Silinmis grup hicbir sorgudan donmez.** Soft delete kullanildigi icin
 *    `deleted_at IS NULL` filtresini unutmak, silinmis bir grubu geri gorunur
 *    kilar. Bu yuzden grup okuyan her fonksiyon buradan gecer; servis katmani
 *    dogrudan `db('groups')` cagirmaz.
 * 2. **Atomik olmasi gereken islemler burada transaction icinde durur.**
 *    "Grup olustur + owner uyeligi yaz" ya da "daveti dogrula + uyelik ekle +
 *    sayaci artir" yarim kalirsa veri tutarsiz olur; servis katmani bunlari
 *    tek bir cagriyla kullanir.
 */

/** Liste ekrani icin grup + istekte bulunan kullanicinin rolu + uye sayisi. */
export interface GroupSummary {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: Date;
  role: GroupMemberRole;
  joined_at: Date;
  member_count: number;
}

/** Grup detayinda donen uye satiri (users tablosundan isim/e-posta ile). */
export interface GroupMemberView {
  user_id: string;
  name: string;
  email: string;
  role: GroupMemberRole;
  joined_at: Date;
}

/** `redeemInvite` sonucu. Neden basarisiz oldugunu **kasten** ayirmaz:
 *  gecersiz/suresi dolmus/tukenmis/iptal edilmis hepsi `invalid` doner ki
 *  servis katmani disariya tek tip cevap versin (bkz. docs/decisions/1.4.md). */
export type RedeemResult =
  | { status: 'invalid' }
  | { status: 'already_member'; group: GroupRow }
  | { status: 'joined'; group: GroupRow };

export interface CreateGroupInput {
  name: string;
  description: string | null;
  created_by: string;
}

export interface IssueInviteInput {
  group_id: string;
  created_by: string;
  code: string;
  expires_at: Date;
  max_uses: number | null;
}

/* ------------------------------------------------------------------ okuma */

/** Yasayan grubu getirir. Silinmis grup icin `undefined` doner. */
const findById = async (groupId: string): Promise<GroupRow | undefined> =>
  db('groups').where({ id: groupId }).whereNull('deleted_at').first();

/** Uyelik satiri (rol dahil). Grubun silinmis olup olmadigina bakmaz —
 *  cagiran taraf once `findById` ile grubu dogrular. */
const findMembership = async (
  groupId: string,
  userId: string
): Promise<GroupMemberRow | undefined> =>
  db('group_members').where({ group_id: groupId, user_id: userId }).first();

/** Kullanicinin uyesi oldugu gruplar. Uyesi olmadigi grup **hicbir kosulda**
 *  bu listeye giremez: filtreleme JOIN'in kendisinde. */
const listForUser = async (userId: string): Promise<GroupSummary[]> => {
  const rows = await db('groups as g')
    .join('group_members as gm', 'gm.group_id', 'g.id')
    .where('gm.user_id', userId)
    .whereNull('g.deleted_at')
    .orderBy('g.created_at', 'desc')
    .select(
      'g.id',
      'g.name',
      'g.description',
      'g.created_by',
      'g.created_at',
      'gm.role',
      'gm.joined_at',
      db('group_members as c').count('*').whereRaw('c.group_id = g.id').as('member_count')
    );

  // pg surucusu COUNT'u string dondurur; API'de sayi olmasi beklenir.
  return (rows as unknown as (Omit<GroupSummary, 'member_count'> & { member_count: string })[]).map(
    (row) => ({ ...row, member_count: Number(row.member_count) })
  );
};

const listMembers = async (groupId: string): Promise<GroupMemberView[]> =>
  db('group_members as gm')
    .join('users as u', 'u.id', 'gm.user_id')
    .where('gm.group_id', groupId)
    // owner once, sonra katilim sirasi
    .orderByRaw("CASE WHEN gm.role = 'owner' THEN 0 ELSE 1 END")
    .orderBy('gm.joined_at', 'asc')
    .select('gm.user_id', 'u.name', 'u.email', 'gm.role', 'gm.joined_at') as unknown as Promise<
    GroupMemberView[]
  >;

/* ---------------------------------------------------------------- yazma */

/**
 * Grubu ve kurucunun `owner` uyeligini **tek transaction'da** yazar.
 * Ayri ayri yazilsaydi ikinci INSERT patladiginda sahipsiz (uyesi olmayan,
 * kimsenin erisemedigi) bir grup satiri kalirdi.
 */
const createWithOwner = async (input: CreateGroupInput): Promise<GroupRow> =>
  db.transaction(async (trx) => {
    const [group] = await trx('groups')
      .insert({
        name: input.name,
        description: input.description,
        created_by: input.created_by,
      })
      .returning('*');

    await trx('group_members').insert({
      group_id: group.id,
      user_id: input.created_by,
      role: 'owner',
    });

    return group;
  });

/** Uyelik satirini siler. Donen sayi 0 ise kullanici zaten uye degildi. */
const removeMember = async (groupId: string, userId: string): Promise<number> =>
  db('group_members').where({ group_id: groupId, user_id: userId }).del();

/**
 * Soft delete: satir durur, `deleted_at` doldurulur.
 * Grubun aktif davet kodlari da ayni transaction'da iptal edilir — silinmis
 * bir gruba davet linkiyle katilinabilmesi kabul edilemez. (Katilma akisi
 * grubun canli oldugunu ayrica kontrol eder; bu ikinci savunma hatti.)
 */
const softDelete = async (groupId: string): Promise<GroupRow | undefined> =>
  db.transaction(async (trx) => {
    const now = new Date();

    await trx('group_invites')
      .where({ group_id: groupId })
      .whereNull('revoked_at')
      .update({ revoked_at: now });

    const [deleted] = await trx('groups')
      .where({ id: groupId })
      .whereNull('deleted_at')
      .update({ deleted_at: now })
      .returning('*');

    return deleted;
  });

/* --------------------------------------------------------------- davetler */

/** Kullanilabilir davet: iptal edilmemis, suresi dolmamis, kotasi bitmemis. */
const findActiveInvite = async (groupId: string): Promise<GroupInviteRow | undefined> =>
  db('group_invites')
    .where({ group_id: groupId })
    .whereNull('revoked_at')
    .where('expires_at', '>', new Date())
    .where((builder) => builder.whereNull('max_uses').orWhereRaw('use_count < max_uses'))
    .first();

/**
 * Yeni davet uretir ve grubun onceki aktif davetlerini iptal eder.
 * `group_invites_single_active_unique` kismi index'i "grup basina en fazla bir
 * aktif davet" kuralini DB'de de zorunlu kilar; iptal ile ekleme bu yuzden ayni
 * transaction'da olmak zorunda.
 */
const issueInvite = async (input: IssueInviteInput): Promise<GroupInviteRow> =>
  db.transaction(async (trx) => {
    await trx('group_invites')
      .where({ group_id: input.group_id })
      .whereNull('revoked_at')
      .update({ revoked_at: new Date() });

    const [invite] = await trx('group_invites')
      .insert({
        group_id: input.group_id,
        created_by: input.created_by,
        code: input.code,
        expires_at: input.expires_at,
        max_uses: input.max_uses,
      })
      .returning('*');

    return invite;
  });

/**
 * Davet kodunu bozdurup kullaniciyi gruba ekler.
 *
 * Tamami tek transaction ve davet satiri uzerinde `FOR UPDATE` kilidiyle
 * calisir: ayni kodla es zamanli iki istek gelirse ikincisi birincinin
 * `use_count` artisini gorur, yoksa `max_uses = 1` olan bir davet iki kez
 * kullanilabilirdi (TOCTOU).
 */
const redeemInvite = async (code: string, userId: string): Promise<RedeemResult> =>
  db.transaction(async (trx): Promise<RedeemResult> => {
    const invite = await trx('group_invites').where({ code }).forUpdate().first();

    if (!invite) {
      return { status: 'invalid' };
    }

    const exhausted = invite.max_uses !== null && invite.use_count >= invite.max_uses;
    if (invite.revoked_at !== null || invite.expires_at <= new Date() || exhausted) {
      return { status: 'invalid' };
    }

    // Silinmis grubun daveti calismaz.
    const group = await trx('groups')
      .where({ id: invite.group_id })
      .whereNull('deleted_at')
      .first();

    if (!group) {
      return { status: 'invalid' };
    }

    const existing = await trx('group_members')
      .where({ group_id: group.id, user_id: userId })
      .first();

    // Zaten uye olan birinin linke tekrar tiklamasi kotadan **dusmez**.
    if (existing) {
      return { status: 'already_member', group };
    }

    await trx('group_members').insert({
      group_id: group.id,
      user_id: userId,
      role: 'member',
    });

    await trx('group_invites').where({ id: invite.id }).increment('use_count', 1);

    return { status: 'joined', group };
  });

export default {
  findById,
  findMembership,
  listForUser,
  listMembers,
  createWithOwner,
  removeMember,
  softDelete,
  findActiveInvite,
  issueInvite,
  redeemInvite,
};
