import type { Knex } from 'knex';

/**
 * `users.notification_prefs` — Ayarlar > Tercihler > Bildirimler'deki uc
 * anahtarin kaydi (3.18, bkz. docs/decisions/3.18-tercihler-sayfasi.md).
 *
 * NEDEN JSONB, UC AYRI BOOLEAN KOLON DEGIL
 * ------------------------------------------
 * Uc alan da tek bir "bildirim tercihleri" kavraminin parcasi ve **birlikte**
 * okunup yaziliyor (tek bir PUT govdesi, bkz. auth.service.ts). Ayri kolonlar
 * olsaydi her yeni bildirim turu icin yeni bir migration gerekirdi; jsonb
 * bu genisleme maliyetini ortadan kaldiriyor. `theme` gibi cihaza ozel bir
 * tercih degil (bkz. ThemeToggle.tsx'teki "NEDEN SUNUCUYA YAZILMIYOR" notu) —
 * bu tercihler **hesaba** ait, cihazdan bagimsiz kalmali, o yuzden burada.
 *
 * NEDEN VARSAYILAN DEGER VAR (NOT NULL + defaultTo)
 * ----------------------------------------------------
 * Mevcut kullanicilarin satirinda bu kolon bos gelmemeli: `NULL` olsaydi her
 * okuyan yer (model, servis, frontend) "tercih hic ayarlanmamissa ne olur"
 * sorusunu ayrica cozmek zorunda kalirdi. Varsayilan, "hepsi acik, haftalik
 * ozet kapali" — mevcut davranisla (hicbir sey gonderilmiyor, bkz. asagi)
 * celismiyor cunku gonderim mekanizmasinin kendisi henuz yok.
 *
 * ONEMLI: bu kolon yalnizca bir TERCIH kaydi. Gercek e-posta/push gonderimi
 * bu is kapsaminda degil (Hafta 4, ayri is) — hicbir yerde bu degeri okuyup
 * bildirim yollayan bir kod yok.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table
      .jsonb('notification_prefs')
      .notNullable()
      .defaultTo(
        knex.raw(
          `'{"email_enabled":true,"push_enabled":true,"weekly_digest_enabled":false}'::jsonb`
        )
      );
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('notification_prefs');
  });
}
