import type { Knex } from 'knex';

/**
 * Uye takma isimleri.
 *
 * TAKMA ISIM **KISIYE OZEL**, GRUBA ORTAK DEGIL
 * ---------------------------------------------
 * Satirin anahtari uc alan: (grup, adi koyan, adi konan). Yani "Deniz'in Ece
 * icin verdigi ad" ile "Kerem'in Ece icin verdigi ad" iki ayri kayit ve
 * birbirini gormezler.
 *
 * Alternatif — grup basina tek ortak takma isim — daha az satir tutardi ama
 * yanlis bir urun olurdu: bir kullanicinin baskasina taktigi adi herkese
 * gostermek, en iyi ihtimalle mahcup edici bir ozelliktir. Ustelik "kim
 * degistirebilir?" sorusu da acilir ve takma isim bir yetki konusuna donusurdu.
 * Kisiye ozel olunca boyle bir soru yok: herkes yalnizca kendi verdigi adi
 * yazar ve yalnizca kendisi gorur.
 *
 * NEDEN `users` UZERINDE BIR KOLON DEGIL
 * --------------------------------------
 * Takma isim kullanicinin bir ozelligi degil, **iki kullanici arasindaki**
 * bir iliski. `users.nickname` gibi bir kolon herkes icin tek bir ad demek
 * olurdu — yani yukaridaki "ortak ad" tasarimi, ustelik grup ayrimi bile
 * olmadan.
 *
 * NEDEN GRUP BASINA
 * -----------------
 * Ayni kisi ev grubunda "Ev Arkadasi Ali", is grubunda "Ali (muhasebe)"
 * olabilir. Grup baglami olmadan tek bir ad tutmak, kullaniciyi iki baglamdan
 * birinde yanlis adla birakirdi. Grup silinince kayitlar da gider (CASCADE) —
 * takma isim finansal veri degil, tutulmasi gereken bir kanit yok.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('member_nicknames', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // group_id -> groups.id : CASCADE
    // Grubun yasam dongusune bagli; disinda bir anlami yok.
    table
      .uuid('group_id')
      .notNullable()
      .references('id')
      .inTable('groups')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');

    // owner_user_id -> users.id : CASCADE
    // Adi **koyan** kisi. Hesabi silinirse verdigi adlarin durmasi anlamsiz.
    table
      .uuid('owner_user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');

    // target_user_id -> users.id : CASCADE
    // Adi **konan** kisi. Burada RESTRICT kullanilmiyor (expenses'in aksine):
    // takma isim finansal bir kayit degil, silinmesi hicbir bakiyeyi bozmaz.
    table
      .uuid('target_user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');

    // 60 karakter: users.name ile ayni mertebe. Takma isim gercek addan uzun
    // olmak zorunda degil, arayuzde de ayni yerlere siğiyor.
    table.string('nickname', 60).notNullable();

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // Uclu anahtar hem "ayni kisiye iki ad" durumunu DB seviyesinde imkansiz
    // kiliyor hem de okuma sorgusunun (bir kullanicinin bir gruptaki tum
    // adlari) index'i oluyor: onek (group_id, owner_user_id) tam da o sorgu.
    table.unique(['group_id', 'owner_user_id', 'target_user_id'], {
      indexName: 'member_nicknames_group_owner_target_unique',
    });
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('member_nicknames');
}
