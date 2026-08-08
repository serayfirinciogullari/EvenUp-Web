import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('group_members', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // group_id -> groups.id : CASCADE
    // Uyelik kaydinin grup olmadan hicbir anlami yok; grup silinince
    // uyelik satirlari da gitmeli (saf join tablosu, tasidigi veri yok).
    table
      .uuid('group_id')
      .notNullable()
      .references('id')
      .inTable('groups')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');

    // user_id -> users.id : CASCADE
    // Ayni gerekce: uyelik satiri finansal kayit degil, sadece bir iliski.
    // Kullanici gercekten silinirse uyelikleri de temizlenir; harcamalari
    // ise RESTRICT ile korunur (bkz. expenses migration'i).
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');

    table.timestamp('joined_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // Ayni kullanici ayni gruba iki kez eklenemez
    table.unique(['group_id', 'user_id'], { indexName: 'group_members_group_id_user_id_unique' });

    table.index(['user_id'], 'group_members_user_id_index');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('group_members');
}
