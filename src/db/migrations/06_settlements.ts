import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('settlements', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // group_id -> groups.id : CASCADE
    // Odeme kaydi grup baglaminda anlamli; grup silinince birlikte gider.
    table
      .uuid('group_id')
      .notNullable()
      .references('id')
      .inTable('groups')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');

    // from_user / to_user -> users.id : RESTRICT
    // Iki taraf da odemenin kanitidir. Taraflardan biri silinince kayit
    // ucarsa "borc odendi mi" sorusunun cevabi kaybolur; bu yuzden silme
    // engellenir (kullanici pasiflestirilir).
    table
      .uuid('from_user')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');

    table
      .uuid('to_user')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');

    table.decimal('amount', 10, 2).notNullable();

    table
      .enu('status', ['pending', 'confirmed'], {
        useNative: true,
        enumName: 'settlement_status',
      })
      .notNullable()
      .defaultTo('pending');

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // Alacakli onaylayana kadar bos kalir
    table.timestamp('confirmed_at', { useTz: true }).nullable();

    table.index(['group_id', 'status'], 'settlements_group_id_status_index');
    table.index(['from_user'], 'settlements_from_user_index');
    table.index(['to_user'], 'settlements_to_user_index');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('settlements');
  await knex.raw('DROP TYPE IF EXISTS settlement_status');
}
