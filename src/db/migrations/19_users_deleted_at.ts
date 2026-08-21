import type { Knex } from 'knex';

/**
 * `users.deleted_at` — kullanicinin kendi baslattigi hesap silme sureci.
 *
 * NEDEN SATIR SILINMIYOR (groups.deleted_at ile ayni ilke)
 * -----------------------------------------------------------
 * `expenses.paid_by` ve `settlements.from_user`/`to_user` bu tabloya RESTRICT
 * ile bagli (bkz. migration 01/04/06) — bir kullanici satiri silinemez, mali
 * gecmisi baglayan referanslar kirilir. `groups.deleted_at` (migration 07) ile
 * ayni desen: "silme" bir bayrak, bir DELETE degil.
 *
 * NEDEN `is_active`TEN AYRI BIR KOLON
 * -------------------------------------
 * `is_active=false` zaten var (admin'in devre disi birakmasi, 1.8) ve giris
 * denemesini zaten reddediyor — self-servis silme bunu **yeniden kullaniyor**.
 * Ama "neden reddedildi" (yonetici mi kapatti, kullanici kendi mi istedi) ve
 * "geri alinabilir mi, ne zamana kadar" sorularinin cevabi `is_active`te yok.
 * `deleted_at` bu iki soruyu cevapliyor: dolu olmasi "kullanicinin kendi
 * istegi" demek, degeri de 30 gunluk geri alma penceresinin baslangici
 * (bkz. docs/decisions/3.17-hesap-silme.md).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.timestamp('deleted_at', { useTz: true }).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('deleted_at');
  });
}
