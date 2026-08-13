import type { Knex } from 'knex';

/**
 * group_members tablosuna grup ici rol ekler.
 *
 * `users.role` (admin/user) **uygulama** rolu; buradaki rol **grup** rolu.
 * Ikisi ayri kavram: bir kullanici A grubunun owner'i, B grubunun member'i
 * olabilir. Bu yuzden rol uyelik satirinda durur, kullanicida degil.
 *
 * Native enum tercih edildi (string + CHECK yerine): gecersiz bir rol degeri
 * DB seviyesinde reddedilir ve tip listesi tek bir yerde tanimli olur.
 *
 * Not: knex'in `.enu(..., { useNative: true })` cagrisi alterTable icinde
 * TYPE'i her zaman guvenilir sekilde olusturmadigi icin ham SQL yazildi.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw("CREATE TYPE group_member_role AS ENUM ('owner', 'member')");

  await knex.raw(
    "ALTER TABLE group_members ADD COLUMN role group_member_role NOT NULL DEFAULT 'member'"
  );

  // Bu migration'dan onceki uyelik satirlarinda rol yok. Grubu kuran kisi
  // (groups.created_by) owner kabul edilir; kalan herkes default'ta 'member'.
  await knex.raw(`
    UPDATE group_members AS gm
       SET role = 'owner'
      FROM groups AS g
     WHERE gm.group_id = g.id
       AND gm.user_id = g.created_by
  `);

  // Her grubun en fazla bir owner'i olabilir. Kismi unique index bunu DB'de
  // garanti eder; ileride sahiplik devri eklendiginde "once eskiyi member yap,
  // sonra yeniyi owner yap" adimini tek transaction'da yapmayi zorunlu kilar.
  await knex.raw(`
    CREATE UNIQUE INDEX group_members_single_owner_unique
        ON group_members (group_id)
     WHERE role = 'owner'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS group_members_single_owner_unique');
  await knex.raw('ALTER TABLE group_members DROP COLUMN IF EXISTS role');
  await knex.raw('DROP TYPE IF EXISTS group_member_role');
}
