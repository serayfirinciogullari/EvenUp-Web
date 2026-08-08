import type { Knex } from 'knex';

/**
 * uuid uretimi icin pgcrypto.
 * PostgreSQL 13+ `gen_random_uuid()` fonksiyonunu cekirdekte sunar; extension
 * daha eski sunucularda da ayni fonksiyonu garanti eder ve 13+ uzerinde zararsizdir.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP EXTENSION IF EXISTS "pgcrypto"');
}
