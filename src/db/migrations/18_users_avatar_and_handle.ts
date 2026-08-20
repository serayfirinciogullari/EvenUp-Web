import type { Knex } from 'knex';

/**
 * `users.avatar` + `users.handle` — Ayarlar > Profil'e eklenen iki alan.
 *
 * NEDEN AVATAR AYRI BIR DOSYA DEPOLAMA SERVISI DEGIL
 * -----------------------------------------------------
 * Projede henuz nesne depolama (S3/Cloudinary vb.) yok ve tek bir kucuk
 * profil fotografi icin bunu kurmak orantisiz olurdu. Fotograf dogrudan
 * `data:image/...;base64,...` metni olarak `TEXT` kolonda tutuluyor —
 * boyut sinirinin (2MB) `auth.service.ts`teki dogrulamada zorlanmasi bu
 * yuzden onemli: sinirsiz metin, satiri pratik olmayan boyuta tasirdi.
 * Sunucu tarafinda ayrica bir "servis etme" ucu da gerekmiyor: istemci
 * data URI'yi dogrudan `<img src>`e verebiliyor.
 *
 * NEDEN `handle` NULLABLE VE BASTAN BENZERSIZ
 * ---------------------------------------------
 * Kisi bazinda takma isim sistemiyle (member_nicknames) KARISTIRILMAMALI —
 * bu, kullanicinin **kendi** hesabina verdigi tek, herkese ayni gorunen bir
 * ad (@handle). Kucuk harfe cevrilip saklaniyor (auth.service.ts) ki basit
 * bir `UNIQUE` kisiti buyuk/kucuk harf farkini gormezden gelsin — `citext`
 * uzantisina ihtiyac duymadan.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.text('avatar').nullable();
    table.string('handle', 30).nullable().unique();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('avatar');
    table.dropColumn('handle');
  });
}
