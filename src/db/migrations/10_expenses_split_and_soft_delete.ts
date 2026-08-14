import type { Knex } from 'knex';

/**
 * expenses tablosunu 1.5 uc noktalari icin hazirlar.
 *
 * Eklenen kolonlar ve gerekceleri:
 *
 * - `split_type`: harcamanin **nasil** bolundugu. Paylar zaten expense_shares'te
 *   duruyor ama sonuctan yontem geri okunamaz: 100.00'un 3 kisiye "esit"
 *   bolunmusu ile "33.34/33.33/33.33" diye elle girilmisi ayni satirlari uretir.
 *   Duzenleme ekraninin hangi formu acacagini bilmesi icin yontem saklanir.
 *
 * - `created_by`: harcamayi **giren** kisi. `paid_by` ile ayni sey degil —
 *   "ben odedim" kadar sik olan bir senaryo "Kerem odedi, ben giriyorum".
 *   Duzenleme yetkisi giren kisiye bagli oldugu icin bu kolon olmadan
 *   "sadece ekleyen duzenleyebilir" kurali yazilamaz.
 *
 * - `updated_at`: harcama artik degistirilebiliyor; "300 TL yazmistin" /
 *   "hayir 350" tartismasinda satirin ne zaman degistigi bilinmeli.
 *
 * - `deleted_at`: soft delete. Hard DELETE, expense_shares'i CASCADE ile
 *   goturur ve harcamanin varligina dair hicbir iz kalmaz. Gerekce
 *   docs/decisions/1.5.md icinde.
 *
 * Ayrica iki CHECK: tutar pozitif, pay negatif olamaz. Bunlar uygulama
 * katmaninda da dogrulaniyor; DB'de olmalari, ileride bir script ya da manuel
 * SQL ile veri girildiginde de gecerli kalmalarini saglar.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw("CREATE TYPE expense_split_type AS ENUM ('equal', 'exact', 'percentage')");

  await knex.raw(`
    ALTER TABLE expenses
      ADD COLUMN split_type expense_split_type NOT NULL DEFAULT 'equal',
      ADD COLUMN created_by uuid REFERENCES users (id) ON DELETE RESTRICT ON UPDATE CASCADE,
      ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
      ADD COLUMN deleted_at timestamptz
  `);

  // Bu migration'dan onceki satirlarda "giren kisi" bilgisi yok. Elde olan tek
  // makul yaklasim odeyeni girdi kabul etmek; sonrasinda kolon NOT NULL olur.
  await knex.raw('UPDATE expenses SET created_by = paid_by WHERE created_by IS NULL');
  await knex.raw('ALTER TABLE expenses ALTER COLUMN created_by SET NOT NULL');

  // Kategori 1.2'de zorunlu tanimlanmisti ama 1.5 govdesinde opsiyonel:
  // her harcamayi siniflandirmaya zorlamak giris akisini gereksiz yavaslatir.
  await knex.raw("ALTER TABLE expenses ALTER COLUMN category SET DEFAULT 'genel'");

  await knex.raw('ALTER TABLE expenses ADD CONSTRAINT expenses_amount_positive CHECK (amount > 0)');
  await knex.raw(
    'ALTER TABLE expense_shares ADD CONSTRAINT expense_shares_amount_non_negative CHECK (share_amount >= 0)'
  );

  // Liste uc noktasi her zaman "canli harcamalar, tarihe gore" sorusunu sorar.
  // Kismi index silinmis satirlari disarida birakir.
  await knex.raw(`
    CREATE INDEX expenses_group_alive_index
        ON expenses (group_id, created_at DESC)
     WHERE deleted_at IS NULL
  `);

  await knex.raw('CREATE INDEX expenses_created_by_index ON expenses (created_by)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS expenses_created_by_index');
  await knex.raw('DROP INDEX IF EXISTS expenses_group_alive_index');

  await knex.raw(
    'ALTER TABLE expense_shares DROP CONSTRAINT IF EXISTS expense_shares_amount_non_negative'
  );
  await knex.raw('ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_amount_positive');

  await knex.raw('ALTER TABLE expenses ALTER COLUMN category DROP DEFAULT');

  await knex.raw(`
    ALTER TABLE expenses
      DROP COLUMN IF EXISTS deleted_at,
      DROP COLUMN IF EXISTS updated_at,
      DROP COLUMN IF EXISTS created_by,
      DROP COLUMN IF EXISTS split_type
  `);

  await knex.raw('DROP TYPE IF EXISTS expense_split_type');
}
