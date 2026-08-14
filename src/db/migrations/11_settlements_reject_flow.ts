import type { Knex } from 'knex';

/**
 * settlements tablosunu 1.7 uc noktalari icin hazirlar.
 *
 * Eklenenler:
 *
 * - `settlement_status` enum'una **`rejected`**: alacakli "boyle bir odeme
 *   almadim" diyebilmeli. Kaydi silmek yerine reddedilmis olarak isaretlemek,
 *   anlasmazligin kendisini de kayit altinda tutar.
 *
 * - `rejected_at`: `confirmed_at`in karsiligi. Tek bir `resolved_at` kolonu da
 *   yeterdi ama o zaman "ne zaman onaylandi" sorusunun cevabi status kolonuna
 *   bakmadan okunamazdi; ayrica asagidaki CHECK yazilamazdi.
 *
 * - Uc CHECK: tutar pozitif, taraflar farkli, **status ile zaman damgalari
 *   tutarli**. Sonuncusu "confirmed ama confirmed_at bos" gibi bir satirin
 *   olusmasini DB seviyesinde imkansiz kilar.
 *
 * - Kismi unique index: bir grupta ayni (borclu -> alacakli) cifti icin ayni
 *   anda **en fazla bir** `pending` kayit olabilir.
 *
 * Gerekceler docs/decisions/1.7.md icinde.
 */
export async function up(knex: Knex): Promise<void> {
  // Enum'a deger eklemenin dogrudan yolu `ALTER TYPE ... ADD VALUE`'dur ama
  // eklenen deger AYNI transaction icinde kullanilamaz; knex migration'lari
  // transaction icinde calistigi icin asagidaki CHECK'ler patlardi. Tipi
  // bastan olusturup kolonu cast etmek bu kisitin disinda kalir.
  await knex.raw('ALTER TABLE settlements ALTER COLUMN status DROP DEFAULT');
  await knex.raw('ALTER TYPE settlement_status RENAME TO settlement_status_old');
  await knex.raw("CREATE TYPE settlement_status AS ENUM ('pending', 'confirmed', 'rejected')");
  await knex.raw(`
    ALTER TABLE settlements
      ALTER COLUMN status TYPE settlement_status USING status::text::settlement_status
  `);
  await knex.raw("ALTER TABLE settlements ALTER COLUMN status SET DEFAULT 'pending'");
  await knex.raw('DROP TYPE settlement_status_old');

  await knex.raw('ALTER TABLE settlements ADD COLUMN rejected_at timestamptz');

  await knex.raw(
    'ALTER TABLE settlements ADD CONSTRAINT settlements_amount_positive CHECK (amount > 0)'
  );

  // Kendi kendine odeme yapan bir kayit bakiyeyi degistirmez ama listeyi kirletir
  // ve "iki tarafli onay" modelini anlamsiz kilar (borclu = alacakli olurdu).
  await knex.raw(
    'ALTER TABLE settlements ADD CONSTRAINT settlements_distinct_parties CHECK (from_user <> to_user)'
  );

  await knex.raw(`
    ALTER TABLE settlements ADD CONSTRAINT settlements_status_timestamps CHECK (
      (status = 'pending'   AND confirmed_at IS NULL     AND rejected_at IS NULL) OR
      (status = 'confirmed' AND confirmed_at IS NOT NULL AND rejected_at IS NULL) OR
      (status = 'rejected'  AND confirmed_at IS NULL     AND rejected_at IS NOT NULL)
    )
  `);

  // Ayni cift arasinda ikinci bir bekleyen kayit, neredeyse her zaman cift
  // gonderimdir. Karara baglandiktan (confirmed/rejected) sonra yenisi acilabilir.
  await knex.raw(`
    CREATE UNIQUE INDEX settlements_single_pending_unique
        ON settlements (group_id, from_user, to_user) WHERE status = 'pending'
  `);
}

/**
 * Geri alma **kayipli**: daraltilan enum'a sigmayan `rejected` satirlar
 * `pending`e cekilir. Baska turlu cast patlardi; sessizce silmek ise kayit
 * kaybi olurdu.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS settlements_single_pending_unique');

  await knex.raw('ALTER TABLE settlements DROP CONSTRAINT IF EXISTS settlements_status_timestamps');
  await knex.raw('ALTER TABLE settlements DROP CONSTRAINT IF EXISTS settlements_distinct_parties');
  await knex.raw('ALTER TABLE settlements DROP CONSTRAINT IF EXISTS settlements_amount_positive');

  await knex.raw("UPDATE settlements SET status = 'pending' WHERE status = 'rejected'");
  await knex.raw('ALTER TABLE settlements DROP COLUMN IF EXISTS rejected_at');

  await knex.raw('ALTER TABLE settlements ALTER COLUMN status DROP DEFAULT');
  await knex.raw('ALTER TYPE settlement_status RENAME TO settlement_status_old');
  await knex.raw("CREATE TYPE settlement_status AS ENUM ('pending', 'confirmed')");
  await knex.raw(`
    ALTER TABLE settlements
      ALTER COLUMN status TYPE settlement_status USING status::text::settlement_status
  `);
  await knex.raw("ALTER TABLE settlements ALTER COLUMN status SET DEFAULT 'pending'");
  await knex.raw('DROP TYPE settlement_status_old');
}
