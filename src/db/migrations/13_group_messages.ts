import type { Knex } from 'knex';

/**
 * Grup sohbeti: harcamalarin, AI cevaplarinin ve (ileride) fis referanslarinin
 * tek bir zaman cizelgesinde aktigi mesaj feed'i.
 *
 * NEDEN AYRI BIR TABLO — expenses'e KOLON EKLEMEK DEGIL
 * -----------------------------------------------------
 * Feed dort ayri turden satir tasiyor: kullanicinin yazdigi duz metin, AI'in
 * netlestirme sorusu, olusan bir harcamaya referans ve olusan bir fis taslagina
 * referans. Bunlar expenses'in kolonu olamaz; cogunun harcamayla ilgisi bile
 * yok (metin ve soru harcama uretmeden de feed'de durur). Ayri tablo, feed'i
 * "ne oldugundan bagimsiz, sirali olaylar" olarak modeller.
 *
 * TIP <-> DOLU KOLON TUTARLILIGI DB'DE ZORLANIR (CHECK)
 * -----------------------------------------------------
 * Her tur yalnizca kendi referans kolonunu doldurur:
 *   user_text / ai_clarification -> content dolu, expense_id ve draft NULL
 *   expense_created              -> expense_id dolu, content ve draft NULL
 *   receipt_draft_ref            -> receipt_draft_id dolu, content ve expense NULL
 * Uygulama katmani da bunu saglar; DB'deki CHECK, ileride elle SQL ya da yeni
 * bir kod yolu tutarsiz satir yazmaya kalktiginda son savunma hatti.
 *
 * FIS AKISI (3.5.2) ERTELENDI — AMA SEMA DIKISI HAZIR
 * ---------------------------------------------------
 * `receipt_draft_ref` enum degeri ve `receipt_draft_id` kolonu simdiden var,
 * ama `receipt_drafts` tablosu henuz olmadigi icin **FK yok**. 3.5.2 geldiginde
 * o migration yalnizca `receipt_draft_id -> receipt_drafts.id` FK'sini ekleyecek
 * ve fis akisini `receipt_draft_ref` satiri yazacak sekilde baglayacak; bu tabloyu
 * yeniden sekillendirmesi gerekmeyecek. Gerekce: docs/decisions/grup-detay-sohbet.md
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TYPE group_message_type AS ENUM (
      'user_text',
      'ai_clarification',
      'expense_created',
      'receipt_draft_ref'
    )
  `);

  await knex.schema.createTable('group_messages', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // group_id -> groups.id : CASCADE
    // Feed grubun yasam dongusune bagli; grup silinince mesajlar da gider.
    table
      .uuid('group_id')
      .notNullable()
      .references('id')
      .inTable('groups')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');

    // sender_id -> users.id : SET NULL
    // Sistem/AI mesajlarinda zaten NULL. Bir kullanicinin hesabi silinirse
    // yazdigi metinler durur ama yazari NULL'a duser: mesaj feed'i finansal
    // kanit degil (expenses'in RESTRICT'inin aksine), yazarligi kaybetmek
    // kabul edilebilir. NULL ayni zamanda "insan gondermedi" anlamini tasidigi
    // icin bu gecis semantikle tutarli.
    table
      .uuid('sender_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL')
      .onUpdate('CASCADE');

    table.specificType('type', 'group_message_type').notNullable();

    // Yalnizca user_text ve ai_clarification icin dolu (bkz. CHECK).
    table.text('content').nullable();

    // expense_created satirinin isaret ettigi harcama. CASCADE: bir harcama
    // ILERIDE hard delete edilirse dangling mesaj kalmasin. (Bugun harcamalar
    // soft delete; "geri al" mesaji ayrica deleted_at ile isaretler.)
    table
      .uuid('expense_id')
      .nullable()
      .references('id')
      .inTable('expenses')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');

    // receipt_draft_ref satirinin isaret edecegi fis taslagi. FK YOK: receipt_drafts
    // tablosu 3.5.2'de gelecek; o migration bu kolona FK ekleyecek.
    table.uuid('receipt_draft_id').nullable();

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // "Geri al": bir harcama silininde ilgili expense_created mesaji da
    // isaretlenir. Soft delete, kod tabaninin her yerindeki desenle ayni:
    // satir durur, feed'den duser, harcama geri gelirse mesaj da geri gelebilir.
    table.timestamp('deleted_at', { useTz: true }).nullable();

    // Feed sorgusu her zaman "bir grubun canli mesajlari, zaman sirali".
    // Kismi index silinmis satirlari disarida birakir.
    table.index(['group_id', 'created_at'], 'group_messages_group_created_index');
  });

  // Silinen harcamanin mesajini bulmak (softDeleteByExpenseId) icin.
  await knex.raw(`
    CREATE INDEX group_messages_expense_id_index
        ON group_messages (expense_id)
     WHERE expense_id IS NOT NULL
  `);

  // Tip ile dolu kolon tutarliligi. Her tur tam olarak bir referansi doldurur;
  // metin turlerinde content zorunlu, referans turlerinde content bos.
  await knex.raw(`
    ALTER TABLE group_messages
      ADD CONSTRAINT group_messages_shape_check CHECK (
        (type = 'user_text'
          AND content IS NOT NULL AND expense_id IS NULL AND receipt_draft_id IS NULL)
        OR (type = 'ai_clarification'
          AND content IS NOT NULL AND expense_id IS NULL AND receipt_draft_id IS NULL)
        OR (type = 'expense_created'
          AND expense_id IS NOT NULL AND content IS NULL AND receipt_draft_id IS NULL)
        OR (type = 'receipt_draft_ref'
          AND receipt_draft_id IS NOT NULL AND content IS NULL AND expense_id IS NULL)
      )
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('group_messages');
  await knex.raw('DROP TYPE IF EXISTS group_message_type');
}
