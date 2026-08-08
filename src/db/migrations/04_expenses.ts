import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('expenses', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // group_id -> groups.id : CASCADE
    // Harcama grubun yasam dongusune bagli. Grup bilincli olarak silindiginde
    // (kullanici "grubu sil" der) icindeki harcamalarin da gitmesi beklenir;
    // aksi halde sahipsiz harcama satirlari kalir.
    table
      .uuid('group_id')
      .notNullable()
      .references('id')
      .inTable('groups')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');

    // paid_by -> users.id : RESTRICT
    // Odemeyi yapan kisi finansal kaydin bir parcasi. Kullaniciyi silip
    // harcamayi CASCADE ile ucurmak grubun tum bakiye hesabini bozar
    // (digerlerinin borcu sessizce kaybolur). Bu yuzden silme engellenir.
    table
      .uuid('paid_by')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');

    // Para: NUMERIC(10,2) -> en fazla 99.999.999,99. Float kullanilmaz.
    table.decimal('amount', 10, 2).notNullable();

    table.string('description', 255).notNullable();
    table.string('category', 60).notNullable();

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // Grup detay ekrani: son harcamalar tarihe gore listelenir
    table.index(['group_id', 'created_at'], 'expenses_group_id_created_at_index');
    table.index(['paid_by'], 'expenses_paid_by_index');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('expenses');
}
