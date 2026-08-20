import db from '../db/connection';
import { slugify } from '../utils/slug';

import type {
  GroupInviteRow,
  GroupMemberRole,
  GroupMemberRow,
  GroupRow,
  MemberNicknameRow,
} from '../types/models';
import type { ActivityKind } from './activity.model';
import type { Knex } from 'knex';

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

/** Avatar yiginda gosterilecek ilk birkac uye. */
export interface GroupMemberPreview {
  user_id: string;
  name: string;
}

/**
 * Grup listesi kartinin "son hareket" satiri icin malzeme.
 *
 * `activity.model.ts` (aktivite akisi) ile AYNI ilkeyi izliyor: backend cumleyi
 * kurmuyor, malzemeyi (kim, kime, ne kadar, ne) doner. Cumlenin kendisi
 * `web/src/utils/activity.ts`teki `activitySentence` ile kuruluyor — o
 * fonksiyonun ikinci bir kopyasi burada **yok**. Gerekce:
 * docs/decisions/gruplar-kart-tasarimi.md.
 *
 * `expense_edited` bilerek disarida: kart tek bir "son hareket" gosteriyor,
 * bir duzenleme gecmisi degil. Dahil etmek `previous_*` alanlarini da
 * tasimayi gerektirirdi ki bu kartin ihtiyaci bu degil.
 */
export interface GroupLastActivity {
  kind: Exclude<ActivityKind, 'expense_edited'>;
  occurred_at: Date;
  actor_id: string;
  actor_name: string;
  counterparty_id: string | null;
  counterparty_name: string | null;
  amount: string;
  description: string | null;
}

/** Liste ekrani icin grup + istekte bulunan kullanicinin rolu + uye sayisi. */
export interface GroupSummary {
  id: string;
  name: string;
  /** Grup detay linkini kuran adres parcasi (bkz. `resolveSlug`). */
  slug: string;
  description: string | null;
  created_by: string;
  created_at: Date;
  role: GroupMemberRole;
  joined_at: Date;
  member_count: number;
  /** Avatar yiginini besler; `member_count`ten az olabilir (ilk birkac uye). */
  member_preview: GroupMemberPreview[];
  /**
   * Istekte bulunanin **alacakli** oldugu, onayini bekleyen bir odeme bu
   * grupta var mi. Netlestirmeyi tekrarlamiyor (1.7 kurali): yalnizca bir
   * varlik sorgusu, bakiyeye hicbir sekilde karismiyor.
   */
  has_pending_incoming: boolean;
  last_activity: GroupLastActivity | null;
}

/** `listForUser` sorgusunun ham (surucu seviyesi) satiri. */
interface RawGroupSummaryRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  created_by: string;
  created_at: Date;
  role: GroupMemberRole;
  joined_at: Date;
  member_count: string;
  member_preview: GroupMemberPreview[] | null;
  has_pending_incoming: boolean;
  last_activity_kind: GroupLastActivity['kind'] | null;
  last_activity_at: Date | null;
  last_activity_actor_id: string | null;
  last_activity_actor_name: string | null;
  last_activity_counterparty_id: string | null;
  last_activity_counterparty_name: string | null;
  last_activity_amount: string | null;
  last_activity_description: string | null;
}

const toGroupSummary = (row: RawGroupSummaryRow): GroupSummary => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  description: row.description,
  created_by: row.created_by,
  created_at: row.created_at,
  role: row.role,
  joined_at: row.joined_at,
  // pg surucusu COUNT'u string dondurur; API'de sayi olmasi beklenir.
  member_count: Number(row.member_count),
  member_preview: row.member_preview ?? [],
  has_pending_incoming: row.has_pending_incoming,
  last_activity: row.last_activity_kind
    ? {
        kind: row.last_activity_kind,
        occurred_at: row.last_activity_at as Date,
        actor_id: row.last_activity_actor_id as string,
        actor_name: row.last_activity_actor_name as string,
        counterparty_id: row.last_activity_counterparty_id,
        counterparty_name: row.last_activity_counterparty_name,
        amount: row.last_activity_amount as string,
        description: row.last_activity_description,
      }
    : null,
});

/** Ust ust binen avatar yiginda gosterilecek en fazla uye sayisi. */
const MEMBER_PREVIEW_LIMIT = 4;

/**
 * Grubun "son hareket"ini bulan LATERAL alt sorgusu.
 *
 * NEDEN LATERAL
 * -------------
 * Aktivite akisinin `UNION ALL`i (bkz. activity.model.ts) butun gruplarin
 * TUM olaylarini getirip disaridan sayfaliyor — burada ihtiyac farkli: grup
 * basina yalnizca EN SON bir satir. `LATERAL`, birlesimi her grup satiri icin
 * `g.id`ye baglayip `ORDER BY ... LIMIT 1` ile tek satira indiriyor; N+1'e
 * dusmeden (sorgu sayisi hala sabit: bir sorgu, PostgreSQL'in kendisi
 * grup basina calistiriyor), aktivite akisinin butun sayfasini cekip
 * istemcide "en yenisini bul" yapmaktan cok daha ucuz.
 */
const LAST_ACTIVITY_LATERAL = `
  LEFT JOIN LATERAL (
    SELECT kind, occurred_at, actor_id, counterparty_id, amount, description FROM (
      SELECT 'expense_created'::text AS kind, e.created_at AS occurred_at, e.created_by AS actor_id,
             CAST(NULL AS uuid) AS counterparty_id, e.amount AS amount, e.description::text AS description
      FROM expenses e
      WHERE e.group_id = g.id AND e.deleted_at IS NULL

      UNION ALL

      SELECT 'settlement_created'::text, s.created_at, s.from_user, s.to_user, s.amount, CAST(NULL AS text)
      FROM settlements s
      WHERE s.group_id = g.id

      UNION ALL

      SELECT 'settlement_confirmed'::text, s.confirmed_at, s.to_user, s.from_user, s.amount, CAST(NULL AS text)
      FROM settlements s
      WHERE s.group_id = g.id AND s.status = 'confirmed' AND s.confirmed_at IS NOT NULL

      UNION ALL

      SELECT 'settlement_rejected'::text, s.rejected_at, s.to_user, s.from_user, s.amount, CAST(NULL AS text)
      FROM settlements s
      WHERE s.group_id = g.id AND s.status = 'rejected' AND s.rejected_at IS NOT NULL
    ) events
    ORDER BY occurred_at DESC
    LIMIT 1
  ) la ON true
`;

/** Grup detayinda donen uye satiri (users tablosundan isim/e-posta ile). */
export interface GroupMemberView {
  user_id: string;
  name: string;
  email: string;
  role: GroupMemberRole;
  joined_at: Date;
  /**
   * **Isteyen kullanicinin** bu uyeye verdigi takma isim; yoksa `null`.
   *
   * Gercek `name` her zaman yaninda duruyor ve asla yerine gecmiyor: takma
   * isim kisiye ozel bir etiket, kimligin kendisi degil. Arayuz ikisini
   * birlikte gosterebilsin diye ikisi de doner (bkz. migration 12).
   */
  nickname: string | null;
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

/**
 * Adres parcasindan yasayan grubu getirir.
 *
 * `findById`in ikizi ve ayni sozlesmeyi tasiyor: silinmis grup `undefined`.
 * Tekillik yalnizca yasayan gruplar arasinda garanti (kismi unique index,
 * migration 17), bu yuzden `deleted_at IS NULL` filtresi burada **dogruluk**
 * meselesi — filtre olmasaydi ayni slug'i tasiyan birden fazla silinmis satir
 * arasindan rastgele biri donebilirdi.
 */
const findBySlug = async (slug: string): Promise<GroupRow | undefined> =>
  db('groups').where({ slug }).whereNull('deleted_at').first();

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
    .joinRaw(LAST_ACTIVITY_LATERAL)
    .leftJoin('users as la_actor', 'la_actor.id', 'la.actor_id')
    .leftJoin('users as la_cp', 'la_cp.id', 'la.counterparty_id')
    .orderBy('g.created_at', 'desc')
    .select(
      'g.id',
      'g.name',
      'g.slug',
      'g.description',
      'g.created_by',
      'g.created_at',
      'gm.role',
      'gm.joined_at',
      db('group_members as c').count('*').whereRaw('c.group_id = g.id').as('member_count'),
      // Netlestirme yok, yalnizca varlik sorgusu (bkz. GroupSummary yorumu).
      db.raw(
        `EXISTS (
          SELECT 1 FROM settlements p
          WHERE p.group_id = g.id AND p.to_user = ? AND p.status = 'pending'
        ) as has_pending_incoming`,
        [userId]
      ),
      db.raw(`(
        SELECT COALESCE(json_agg(json_build_object('user_id', mv.user_id, 'name', mv.name)), '[]')
        FROM (
          SELECT gm2.user_id, u2.name
          FROM group_members gm2
          JOIN users u2 ON u2.id = gm2.user_id
          WHERE gm2.group_id = g.id
          ORDER BY gm2.joined_at ASC
          LIMIT ${MEMBER_PREVIEW_LIMIT}
        ) mv
      ) as member_preview`),
      'la.kind as last_activity_kind',
      'la.occurred_at as last_activity_at',
      'la.actor_id as last_activity_actor_id',
      'la_actor.name as last_activity_actor_name',
      'la.counterparty_id as last_activity_counterparty_id',
      'la_cp.name as last_activity_counterparty_name',
      'la.amount as last_activity_amount',
      'la.description as last_activity_description'
    );

  return (rows as unknown as RawGroupSummaryRow[]).map(toGroupSummary);
};

/**
 * Grubun uyeleri + **istekte bulunanin** verdigi takma isimler.
 *
 * `viewerId` zorunlu, opsiyonel degil: takma isim kisiye ozel oldugu icin "kim
 * soruyor" bilinmeden dogru cevap uretilemez. Parametreyi opsiyonel yapmak,
 * unutuldugunda sessizce **herkese bos takma isim** donduren bir imza olurdu.
 *
 * LEFT JOIN, ikinci bir sorgu degil: uye sayisi kucuk ama satirlari cektikten
 * sonra ayri bir sorgu atip bellekte eslestirmek, tek bir join'in yapacagi isi
 * iki gidis-donuse bolmek olurdu. Join'in ON kosulu `owner_user_id = viewerId`
 * iceriyor — WHERE'e tasinsaydi takma ismi olmayan uyeler listeden **duserdi**.
 */
const listMembers = async (groupId: string, viewerId: string): Promise<GroupMemberView[]> =>
  db('group_members as gm')
    .join('users as u', 'u.id', 'gm.user_id')
    .leftJoin('member_nicknames as mn', function joinNickname() {
      this.on('mn.group_id', '=', 'gm.group_id')
        .andOn('mn.target_user_id', '=', 'gm.user_id')
        .andOnVal('mn.owner_user_id', '=', viewerId);
    })
    .where('gm.group_id', groupId)
    // owner once, sonra katilim sirasi
    .orderByRaw("CASE WHEN gm.role = 'owner' THEN 0 ELSE 1 END")
    .orderBy('gm.joined_at', 'asc')
    .select(
      'gm.user_id',
      'u.name',
      'u.email',
      'gm.role',
      'gm.joined_at',
      'mn.nickname'
    ) as unknown as Promise<GroupMemberView[]>;

/* ------------------------------------------------------------------ slug */

/** PostgreSQL `unique_violation`. */
const UNIQUE_VIOLATION = '23505';

/**
 * Slug carpismasinda kac kez yeniden denenecegi.
 *
 * Tek denemede birakilamaz: `resolveSlug` "bos mu" sorusunu sorarken ile
 * INSERT arasinda **baska bir istek** ayni slug'i almis olabilir (ayni anda
 * ayni adla iki grup kuran iki kullanici). Sinir da gerekli, cunku sonsuz
 * dongu bu yarisin patolojik halinde tek bir istegin sunucuyu mesgul etmesi
 * demek olurdu; ikinci deneme zaten bir sonraki bos numarayi bulur.
 */
const SLUG_RETRY_LIMIT = 3;

/**
 * Cakismanin index tarafindan reddedildigi durum. Kod tek basina yeterli
 * degil: ayni transaction'da `group_members` yazisi da var ve onun kendi
 * unique kisiti bir hatayi "slug carpismasi" sanip bosuna yeniden denetirdi.
 */
const isSlugConflict = (error: unknown): boolean => {
  const pgError = error as { code?: string; constraint?: string } | null;

  return pgError?.code === UNIQUE_VIOLATION && pgError.constraint === 'groups_slug_unique';
};

/**
 * Ad icin **bos** bir slug bulur: once sade hali, doluysa `-2`, `-3`...
 *
 * Numara neden rastgele/hash ek degil: kullanicinin gordugu adres okunabilir
 * kalmali. `ev-arkadaslari-2` bir insanin telefonda okuyabildigi bir sey;
 * `ev-arkadaslari-f3a9` degil.
 *
 * `excludeId` yeniden adlandirmada gerekli: grubun **kendi** slug'i "dolu"
 * sayilsaydi, adi degistirmeden aciklamayi guncellemek bile slug'i her
 * seferinde bir sonraki numaraya kaydirirdi.
 *
 * Aday kumesi tek sorguda cekiliyor (`base` ve `base-%`), sonra numara
 * bellekte araniyor: alternatif, her numara icin ayri bir EXISTS sorgusu
 * kosturmak olurdu.
 */
const resolveSlug = async (
  trx: Knex.Transaction,
  name: string,
  excludeId?: string
): Promise<string> => {
  const base = slugify(name);

  const query = trx('groups')
    .whereNull('deleted_at')
    .andWhere((builder) => {
      void builder.where('slug', base).orWhere('slug', 'like', `${base}-%`);
    })
    .select('slug');

  if (excludeId) {
    void query.whereNot('id', excludeId);
  }

  const taken = new Set((await query).map((row) => row.slug));

  let candidate = base;
  for (let suffix = 2; taken.has(candidate); suffix += 1) {
    candidate = `${base}-${suffix}`;
  }

  return candidate;
};

/** Slug carpismasinda islemi bastan calistirir (bkz. `SLUG_RETRY_LIMIT`). */
const withSlugRetry = async <T>(operation: () => Promise<T>): Promise<T> => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= SLUG_RETRY_LIMIT || !isSlugConflict(error)) {
        throw error;
      }
    }
  }
};

/* ---------------------------------------------------------------- yazma */

/**
 * Grubu ve kurucunun `owner` uyeligini **tek transaction'da** yazar.
 * Ayri ayri yazilsaydi ikinci INSERT patladiginda sahipsiz (uyesi olmayan,
 * kimsenin erisemedigi) bir grup satiri kalirdi.
 *
 * Slug de burada, ayni transaction'da uretiliyor: "bos numarayi bul" ile
 * INSERT arasina baska bir yazi girerse unique index reddediyor ve islem
 * bastan calisiyor (`withSlugRetry`).
 */
const createWithOwner = async (input: CreateGroupInput): Promise<GroupRow> =>
  withSlugRetry(() =>
    db.transaction(async (trx) => {
      const [group] = await trx('groups')
        .insert({
          name: input.name,
          slug: await resolveSlug(trx, input.name),
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
    })
  );

/**
 * Grubun adini/aciklamasini gunceller. Yalnizca **yasayan** grubu (deleted_at
 * NULL) hedefler; silinmis bir grup icin `undefined` doner (cagiran taraf onu
 * ayni "erisim yok" cevabina cevirir). Yalnizca gonderilen alanlar degisir.
 *
 * AD DEGISINCE SLUG DA DEGISIR
 * ----------------------------
 * Adres grubun **su anki** adini gostermeli; "Ev Arkadaslari"ni "Tatil 2026"
 * yapip `/groups/ev-arkadaslari` adresinde kalmak, slug'in cozmeye calistigi
 * okunabilirlik sorununu geri getirirdi. Bedeli, eski slug linkinin artik
 * acilmamasi — ama uuid adresi calismaya devam ediyor (ikisini de `GET
 * /groups/:idOrSlug` cozuyor), yani daha once paylasilmis her link olmuyor.
 *
 * Aciklama tek basina guncellenirse slug'a dokunulmuyor: `resolveSlug`
 * cagrisi yalnizca `patch.name` geldiginde.
 */
const updateDetails = async (
  groupId: string,
  patch: { name?: string; description?: string | null }
): Promise<GroupRow | undefined> =>
  withSlugRetry(() =>
    db.transaction(async (trx) => {
      const [updated] = await trx('groups')
        .where({ id: groupId })
        .whereNull('deleted_at')
        .update(
          patch.name === undefined
            ? patch
            : { ...patch, slug: await resolveSlug(trx, patch.name, groupId) }
        )
        .returning('*');

      return updated;
    })
  );

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

/**
 * Kullanicinin uyesi oldugu gruplarin **yalnizca id + adi**, tek sorguda.
 *
 * `listForUser`ten ayri duruyor cunku farkli bir soru soruyor. O fonksiyon grup
 * listesi ekranini besliyor ve satir basina `role`, `joined_at` ve iliskili bir
 * alt sorgudan gelen `member_count` tasiyor. Aktivite akisinin bunlarin hicbirine
 * ihtiyaci yok; tek istedigi "hangi gruplari okuyabilirim" filtresi ve satirlarda
 * gosterilecek grup adi. `listForUser` cagrilsaydi her akis acilisinda grup basina
 * bir COUNT alt sorgusu bosuna kosardi.
 */
const listMembershipNames = async (userId: string): Promise<{ id: string; name: string }[]> =>
  db('groups as g')
    .join('group_members as gm', 'gm.group_id', 'g.id')
    .where('gm.user_id', userId)
    .whereNull('g.deleted_at')
    .orderBy('g.created_at', 'desc')
    .select('g.id', 'g.name');

/**
 * Yalnizca uye ID'leri.
 *
 * `listMembers`ten ayri duruyor cunku **farkli bir soru**: "kim bu grupta?"
 * — ad, e-posta ya da takma isim gerekmiyor. Katilimci dogrulamasi yapan
 * yerler (harcama payi, odeme karsi tarafi) bunu soruyor ve `listMembers`i
 * cagirsalardi `users` join'i ile takma isim join'ini bosuna odemis olurlardi.
 * Ayrica o imza "kim soruyor?" parametresi ister; burada boyle bir kavram yok.
 */
const listMemberIds = async (groupId: string): Promise<string[]> => {
  const rows = await db('group_members').where({ group_id: groupId }).select('user_id');

  return rows.map((row) => row.user_id);
};

/* ---------------------------------------------------------- takma isimler */

/**
 * Takma ismi yazar ya da gunceller.
 *
 * `onConflict().merge()` (UPSERT) tercih edildi: "once oku, yoksa ekle, varsa
 * guncelle" uc adimi ayni kullanici iki sekmeden yazdiginda unique kisitina
 * takilip 500 uretirdi. Tek ifade hem atomik hem de yaris kosulundan bagimsiz.
 *
 * Cakisma hedefi migration'daki uclu unique ile **ayni** olmali; aksi halde
 * PostgreSQL eslesecek bir kisit bulamaz ve hata verir.
 */
const upsertNickname = async (input: {
  group_id: string;
  owner_user_id: string;
  target_user_id: string;
  nickname: string;
}): Promise<MemberNicknameRow> => {
  const [row] = await db('member_nicknames')
    .insert(input)
    .onConflict(['group_id', 'owner_user_id', 'target_user_id'])
    .merge({ nickname: input.nickname, updated_at: new Date() })
    .returning('*');

  return row;
};

/** Takma ismi kaldirir. Donen sayi 0 ise zaten yoktu — cagiran taraf icin hata degil. */
const removeNickname = async (
  groupId: string,
  ownerUserId: string,
  targetUserId: string
): Promise<number> =>
  db('member_nicknames')
    .where({
      group_id: groupId,
      owner_user_id: ownerUserId,
      target_user_id: targetUserId,
    })
    .del();

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
  findBySlug,
  findMembership,
  listForUser,
  listMembershipNames,
  listMembers,
  listMemberIds,
  createWithOwner,
  updateDetails,
  removeMember,
  softDelete,
  upsertNickname,
  removeNickname,
  findActiveInvite,
  issueInvite,
  redeemInvite,
};
