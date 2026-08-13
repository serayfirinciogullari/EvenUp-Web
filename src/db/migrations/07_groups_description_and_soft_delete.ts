import type { Knex } from 'knex';

/**
 * groups tablosuna iki kolon ekler:
 *
 * - `description`: opsiyonel grup aciklamasi (1.4 gereksinimi).
 * - `deleted_at`: soft delete isareti. Grup silme hard DELETE olsaydi
 *   expenses/expense_shares/settlements CASCADE ile birlikte ucardi; yani tek
 *   bir istek tum finansal gecmisi geri donusu olmadan silerdi. Bunun yerine
 *   grup "gorunmez" yapilir, satirlar durur. Gerekce docs/decisions/1.4.md'de.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('groups', (table) => {
    table.string('description', 500).nullable();
    table.timestamp('deleted_at', { useTz: true }).nullable();
  });

  // Grup listeleme/detay sorgulari her zaman "deleted_at IS NULL" ile filtreler.
  // Kismi index yalnizca canli gruplari tutar, silinenler index'i sismeye ugratmaz.
  await knex.raw('CREATE INDEX groups_alive_index ON groups (id) WHERE deleted_at IS NULL');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS groups_alive_index');

  await knex.schema.alterTable('groups', (table) => {
    table.dropColumn('deleted_at');
    table.dropColumn('description');
  });
}
