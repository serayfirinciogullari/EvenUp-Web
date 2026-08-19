import type { Knex } from 'knex';

/**
 * Harcama duzenleme gecmisi — aktivite akisindaki "DUZ" olayinin veri kaynagi.
 *
 * NEDEN YENI BIR TABLO GEREKTI
 * ----------------------------
 * Aktivite akisindaki bes olay turunun dordu mevcut tablolardan **turetilebiliyor**:
 * harcama eklendi (`expenses.created_at`), odeme bildirildi (`settlements.created_at`),
 * onaylandi (`confirmed_at`), reddedildi (`rejected_at`). Hicbiri icin yeni satir
 * yazmaya gerek yok; sorgu zaten var olan gecmisi okuyor.
 *
 * Duzenleme tek istisna. `expenses.updated_at` yalnizca "bir sey degisti" der:
 *   - kac kez degistigini,
 *   - her degisiklikte **neyin** degistigini,
 *   - ve en onemlisi **eski tutarin ne oldugunu**
 * bilmiyor, cunku UPDATE eski degerin uzerine yaziyor. "Ece, Temizlik tutarini
 * 210,00 -> 195,00 olarak duzeltti" cumlesindeki sol taraf hicbir yerde durmuyordu.
 *
 * Bu tablo tam olarak o kayip yarim: her basarili UPDATE icin bir satir.
 *
 * NEDEN "ONCE/SONRA" IKISI BIRDEN SAKLANIYOR
 * ------------------------------------------
 * Yalnizca eski degeri saklamak da yeterdi — yeni deger bir sonraki satirin eskisi,
 * en sonuncusu da `expenses` uzerinde duruyor. Ama o kurgu her olayi okumak icin
 * komsu satira bakmayi zorunlu kilardi ve zincirin ortasindaki bir satir tek basina
 * anlamsiz olurdu. Iki degeri birden yazmak satiri **kendi kendine yeterli** kilar:
 * akis sorgusu tek bir satirdan tam bir cumle uretebiliyor.
 *
 * GERIYE DONUK VERI YOK — VE KURTARILAMAZ
 * ---------------------------------------
 * Bu migration'dan onceki duzenlemeler icin satir uretilemiyor. Backfill mumkun
 * degil, eksik veri gecmiste **hic yazilmamis**: eski tutar UPDATE aninda kayboldu.
 * Sonucu, akista yalnizca bu tarihten sonraki duzenlemelerin gorunmesi. Bilincli
 * kabul: alternatif, dogru olmayan bir tutar uydurmak olurdu.
 *
 * Neden `group_messages` kullanilmadi: o tablo bir **grubun sohbeti** (bkz.
 * migration 13), satirlari tek bir grubun feed'ine ait ve tipleri sohbet
 * kavramlari. Duzenleme bir sohbet mesaji degil, harcamanin kendi gecmisi;
 * oraya konsaydi sohbet ekraninda gorunmesi gereken bir satir uretirdi.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('expense_edits', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // expense_id -> expenses.id : CASCADE
    // Gecmis, harcamanin kendisine bagli. Harcama ILERIDE hard delete edilirse
    // sahipsiz gecmis satiri kalmasin. (Bugun harcamalar soft delete; akis
    // sorgusu silinmis harcamanin duzenlemelerini zaten `deleted_at IS NULL`
    // join'i ile disarida birakiyor.)
    table
      .uuid('expense_id')
      .notNullable()
      .references('id')
      .inTable('expenses')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');

    // edited_by -> users.id : RESTRICT
    // `expenses.created_by` ile ayni gerekce: duzenlemeyi kimin yaptigi finansal
    // kaydin bir parcasi. Kullaniciyi silip gecmisi CASCADE ile ucurmak, tutarin
    // ne zaman ve kim tarafindan degistigi sorusunu cevapsiz birakirdi.
    table
      .uuid('edited_by')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');

    // Para: `expenses.amount` ile ayni tip. Float kullanilmaz (bkz. 1.5).
    table.decimal('previous_amount', 10, 2).notNullable();
    table.decimal('new_amount', 10, 2).notNullable();

    // Aciklama da saklaniyor: yalnizca adi degisen bir duzenlemede ("Market" ->
    // "Aksam marketi") tutar sabit kalir ve akis satirinin soyleyecek baska bir
    // seyi olmazdi. Uzunluk `expenses.description` ile ayni.
    table.string('previous_description', 255).notNullable();
    table.string('new_description', 255).notNullable();

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // Akis sorgusunun sordugu tek soru: "su harcamalarin duzenlemeleri, zaman
    // sirali". Harcama listesi gruptan geldigi icin filtre `expense_id` uzerinden.
    table.index(['expense_id', 'created_at'], 'expense_edits_expense_created_index');
  });

  // Bir kullanicinin yaptigi duzenlemeleri bulmak icin (akista aktor filtresi
  // yok ama `edited_by` FK'si RESTRICT: kullanici silme denemesi bu indexi kullanir).
  await knex.raw('CREATE INDEX expense_edits_edited_by_index ON expense_edits (edited_by)');

  // Tutarlarin isareti `expenses_amount_positive` ile ayni kuralda olmali:
  // gecmiste de negatif ya da sifir tutar gorunmemeli.
  await knex.raw(`
    ALTER TABLE expense_edits
      ADD CONSTRAINT expense_edits_amounts_positive
      CHECK (previous_amount > 0 AND new_amount > 0)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('expense_edits');
}
