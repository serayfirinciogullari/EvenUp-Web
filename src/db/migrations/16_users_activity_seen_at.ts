import type { Knex } from 'knex';

/**
 * `users.activity_seen_at` — kullanicinin Aktivite akisini en son ne zaman
 * gordugu. Sidebar rozetindeki "okunmamis" sayisi bu zaman damgasindan sonraki
 * olaylari sayar (bkz. docs/decisions/aktivite-okunma-sayaci.md).
 *
 * VARSAYILAN NEDEN `now()` (NULL DEGIL)
 * --------------------------------------
 * Kolon `NOT NULL DEFAULT now()`: mevcut kullanicilarin gecmisi bu migration
 * calistigi anda "gorulmus" sayilir. `NULL` (= "hic gormedi") secilseydi her
 * mevcut kullanici ilk girisinde uygulamanin butun gecmisini "okunmamis" olarak
 * gorur, rozet anlamsiz buyuk bir sayiyla acilirdi.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.table('users', (table) => {
    table.timestamp('activity_seen_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.table('users', (table) => {
    table.dropColumn('activity_seen_at');
  });
}
