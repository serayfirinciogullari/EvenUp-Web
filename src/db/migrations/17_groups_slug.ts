import { slugify } from '../../utils/slug';

import type { Knex } from 'knex';

/**
 * `groups.slug` — grup detay adresinde uuid'nin yerini alan, addan uretilmis
 * okunabilir parca (`/groups/ev-arkadaslari`).
 *
 * TEKILLIK NEDEN **KISMI** INDEX (yalnizca yasayan gruplar)
 * ---------------------------------------------------------
 * Soft delete kullaniliyor: silinen grubun satiri duruyor. Index tum satirlari
 * kapsasaydi silinmis bir grup adini sonsuza kadar rehin alir, ayni adla yeni
 * grup kuran kullanici sebepsiz yere `ev-arkadaslari-2` adresini alirdi.
 * `groups_alive_index` (07) ayni gerekceyle kismi.
 *
 * Kolon **160** karakter, `name` ise 120: cakisma eki (`-2`, `-13`) slug'in
 * uzunluk sinirinin (utils/slug -> MAX_SLUG_LENGTH) ustune biniyor.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('groups', (table) => {
    // Once nullable: mevcut satirlar doldurulmadan NOT NULL konamaz.
    table.string('slug', 160).nullable();
  });

  /*
    Geri doldurma. Cakisma numaralandirmasi burada da gecerli olmali; aksi
    halde ayni adli iki mevcut grup ayni slug'i alir ve asagidaki unique index
    olusturulamaz — migration yarida kalirdi.

    Yasayan gruplar `created_at` sirasiyla isleniyor: adi ilk alan, sade slug'i
    alir. Sonradan kurulan ayni adli grup `-2` eki alir, yani uygulamanin
    calisma anindaki kurali ile ayni sonuc.
  */
  const alive = await knex('groups')
    .whereNull('deleted_at')
    .orderBy('created_at', 'asc')
    .select('id', 'name');

  const taken = new Set<string>();

  for (const group of alive) {
    const base = slugify(group.name);

    let slug = base;
    for (let suffix = 2; taken.has(slug); suffix += 1) {
      slug = `${base}-${suffix}`;
    }

    taken.add(slug);
    await knex('groups').where({ id: group.id }).update({ slug });
  }

  /*
    Silinmis gruplar kismi index'in disinda kaldigi icin numaralandirilmadan
    ham slug'i aliyor; kolon NOT NULL olacagi icin yine de bir deger sart.
    Tek UPDATE yetiyor ama slug uretimi uygulama tarafinda (Turkce harf
    haritasi) oldugundan satir satir gidiliyor — SQL'de ikinci bir kopyasini
    yazmak, iki uretecin zamanla ayrismasi demek olurdu.
  */
  const deleted = await knex('groups').whereNotNull('deleted_at').select('id', 'name');

  for (const group of deleted) {
    await knex('groups')
      .where({ id: group.id })
      .update({ slug: slugify(group.name) });
  }

  await knex.schema.alterTable('groups', (table) => {
    table.string('slug', 160).notNullable().alter();
  });

  await knex.raw(
    'CREATE UNIQUE INDEX groups_slug_unique ON groups (slug) WHERE deleted_at IS NULL'
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS groups_slug_unique');

  await knex.schema.alterTable('groups', (table) => {
    table.dropColumn('slug');
  });
}
