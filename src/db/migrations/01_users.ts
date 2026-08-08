import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    table.string('email', 255).notNullable().unique();
    table.string('name', 120).notNullable();
    table.string('password_hash', 255).notNullable();

    // Native PG enum: gecersiz deger DB seviyesinde reddedilir (CHECK'ten daha acik hata verir)
    table
      .enu('role', ['admin', 'user'], { useNative: true, enumName: 'user_role' })
      .notNullable()
      .defaultTo('user');

    // Push bildirimi tokeni; kullanici mobil uygulamaya girene kadar bos
    table.text('fcm_token').nullable();

    // Kullanici silmek yerine pasiflestirilir -> harcama gecmisi bozulmaz
    table.boolean('is_active').notNullable().defaultTo(true);

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('users');
  // useNative enum tablodan bagimsiz bir PG tipi olusturur, tablo dusunce geride kalir
  await knex.raw('DROP TYPE IF EXISTS user_role');
}
