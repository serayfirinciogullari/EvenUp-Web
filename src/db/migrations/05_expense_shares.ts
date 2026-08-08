import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('expense_shares', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // expense_id -> expenses.id : CASCADE
    // Paylasim satiri harcamanin parcasi (kompozisyon). Harcama silinince
    // paylasimlarin ayakta kalmasi anlamsiz ve tehlikeli olur.
    table
      .uuid('expense_id')
      .notNullable()
      .references('id')
      .inTable('expenses')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');

    // user_id -> users.id : RESTRICT
    // Bu satir "kim ne kadar borclu" bilgisidir. Kullanici silinip paylasim
    // ucarsa harcamanin toplami paylasimlarin toplamina esit olmaz ve
    // bakiye hesabi sessizce yanlis cikar.
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');

    table.decimal('share_amount', 10, 2).notNullable();

    // Bir kullanicinin ayni harcamada tek payi olur
    table.unique(['expense_id', 'user_id'], {
      indexName: 'expense_shares_expense_id_user_id_unique',
    });

    table.index(['user_id'], 'expense_shares_user_id_index');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('expense_shares');
}
