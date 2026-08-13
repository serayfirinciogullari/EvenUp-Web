import type { Knex } from 'knex';

/**
 * Davet kodlari.
 *
 * Kod, sirali/tahmin edilebilir bir ID **degil**: uygulama tarafinda
 * `crypto.randomBytes(16)` ile uretilip base64url'e cevrilir (128 bit entropi,
 * 22 karakter). Ayri bir tabloda tutulmasinin sebebi kodun grup satirinin
 * kendisinden bagimsiz bir yasam dongusune sahip olmasi: suresi dolar,
 * iptal edilir, yenilenir, kullanim sayisi tutulur.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('group_invites', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // group_id -> groups.id : CASCADE
    // Davet kodunun grup olmadan hicbir anlami yok, finansal veri de tasimaz.
    table
      .uuid('group_id')
      .notNullable()
      .references('id')
      .inTable('groups')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');

    // created_by -> users.id : CASCADE
    // Ayni gerekce: davet kaydi bir iliski/oturum verisi, kanit degil.
    table
      .uuid('created_by')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');

    // base64url(16 bayt) = 22 karakter; kolon biraz genis birakildi.
    table.string('code', 64).notNullable();

    table.timestamp('expires_at', { useTz: true }).notNullable();

    // NULL = sinirsiz kullanim (paylasilan grup linki).
    // 1 = tek kullanimlik davet. Karar docs/decisions/1.4.md'de.
    table.integer('max_uses').nullable();
    table.integer('use_count').notNullable().defaultTo(0);

    // Kod yenilendiginde (rotate) eski kod burasi doldurularak olduruluyor.
    table.timestamp('revoked_at', { useTz: true }).nullable();

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // Katilma akisi koda gore tek satir okur; unique hem hizi hem de
    // ayni kodun iki gruba dusmesini engellemeyi saglar.
    table.unique(['code'], { indexName: 'group_invites_code_unique' });

    table.index(['group_id'], 'group_invites_group_id_index');
  });

  // Bir grubun ayni anda en fazla bir **aktif** daveti olur. Yeni kod uretmek
  // eskisini iptal eder; boylece sizan bir link tek islemle olur ve "hangi kod
  // hala gecerli" sorusunun cevabi her zaman tektir.
  await knex.raw(`
    CREATE UNIQUE INDEX group_invites_single_active_unique
        ON group_invites (group_id)
     WHERE revoked_at IS NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS group_invites_single_active_unique');
  await knex.schema.dropTableIfExists('group_invites');
}
