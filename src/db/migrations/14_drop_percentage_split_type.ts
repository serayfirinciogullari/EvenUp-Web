import type { Knex } from 'knex';

/**
 * `expense_split_type` enum'undan `percentage` degerini kaldirir.
 *
 * NEDEN SEMADAN DA SILINIYOR
 * --------------------------
 * Yuzdeli bolusme uygulamadan kaldirildi (gerekce:
 * docs/decisions/bolusum-basitlestirme.md). Enum'da birakmak "kod kabul etmiyor
 * ama veritabani ediyor" durumu uretirdi: elle atilan bir INSERT ya da ileride
 * yazilacak bir script, uygulamanin artik okuyamadigi bir satir olusturabilirdi.
 * Tip sistemi (`ExpenseSplitType = 'equal' | 'exact'`) ile semanin ayni seyi
 * soylemesi bu yuzden onemli.
 *
 * ESKI SATIRLAR `exact` OLUYOR — `equal` DEGIL
 * --------------------------------------------
 * Yuzdeyle bolunmus bir harcamanin paylari `expense_shares`'te zaten yaziyor ve
 * bu migration onlara **dokunmuyor**: kimse bir kurus kazanmiyor ya da
 * kaybetmiyor. Degisen tek sey satirin "hangi yontemle bolundu" etiketi.
 *
 * `equal` yazmak yanlis olurdu: %70/%30 bolunmus bir harcamayi "esit bolundu"
 * diye etiketlemek, ekranda gorunen paylarla celisen bir cumle uretirdi.
 * `exact` ise dogruyu soyluyor — o satirin paylari kisi basina hesaplanmis
 * sabit tutarlar; bugun formda acildiginda da tam olarak oyle gorunurler.
 *
 * ENUM DEGERI NEDEN "DROP" EDILEMIYOR
 * -----------------------------------
 * PostgreSQL bir enum'dan deger silmeyi desteklemiyor (yalnizca ekleme var).
 * Tek yol yeni tipi kurup kolonu ona tasimak; asagidaki sira da bu.
 */
export async function up(knex: Knex): Promise<void> {
  // Kolonun DEFAULT'u eski tipe bagli; tip degistirilmeden once birakilmali.
  await knex.raw('ALTER TABLE expenses ALTER COLUMN split_type DROP DEFAULT');

  await knex.raw("UPDATE expenses SET split_type = 'exact' WHERE split_type = 'percentage'");

  await knex.raw("CREATE TYPE expense_split_type_new AS ENUM ('equal', 'exact')");
  await knex.raw(`
    ALTER TABLE expenses
      ALTER COLUMN split_type TYPE expense_split_type_new
        USING split_type::text::expense_split_type_new
  `);
  await knex.raw('DROP TYPE expense_split_type');
  await knex.raw('ALTER TYPE expense_split_type_new RENAME TO expense_split_type');

  await knex.raw("ALTER TABLE expenses ALTER COLUMN split_type SET DEFAULT 'equal'");
}

/**
 * Geri alma enum degerini geri getirir ama **veriyi geri getiremez**: hangi
 * satirin eskiden `percentage` oldugu bilgisi `up` icinde kayboluyor (yuzdeler
 * hicbir zaman saklanmiyordu, yalnizca paylar). Bu kabul edilmis bir kayip:
 * saklanan pay tutarlari degismedigi icin geri alma sonrasi da hesaplar dogru.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE expenses ALTER COLUMN split_type DROP DEFAULT');

  await knex.raw("CREATE TYPE expense_split_type_old AS ENUM ('equal', 'exact', 'percentage')");
  await knex.raw(`
    ALTER TABLE expenses
      ALTER COLUMN split_type TYPE expense_split_type_old
        USING split_type::text::expense_split_type_old
  `);
  await knex.raw('DROP TYPE expense_split_type');
  await knex.raw('ALTER TYPE expense_split_type_old RENAME TO expense_split_type');

  await knex.raw("ALTER TABLE expenses ALTER COLUMN split_type SET DEFAULT 'equal'");
}
