import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('groups', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name', 120).notNullable();

    // created_by -> users.id : RESTRICT
    // Grubu kuran kullanici silinirse grup (ve altindaki tum harcama gecmisi)
    // ucup gitmemeli. Kullanici ayrilirsa is_active=false yapilir; gercekten
    // silinecekse once grup sahipligi baska bir uyeye devredilmeli.
    table
      .uuid('created_by')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['created_by'], 'groups_created_by_index');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('groups');
}
