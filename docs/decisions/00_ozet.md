# EvenUp — Karar Özeti

`docs/decisions/` altındaki 9 dosyanın (1.1–2.3) tek dosyada özeti. Amaç: projeye,
koda ve fonksiyonlara hâkim olmak — **ne yapıldı** değil, **neden öyle yapıldı**.

Ayrıntı gerekirse ilgili görev dosyasına bak; her bölümün başında kaynağı yazıyor.

**İçindekiler**

1. [Bir bakışta sistem](#1-bir-bakışta-sistem)
2. [Tekrar eden 8 ilke](#2-tekrar-eden-8-ilke) ← projenin asıl omurgası
3. [Veri modeli](#3-veri-modeli)
4. [Katmanlar ve dosya haritası](#4-katmanlar-ve-dosya-haritası)
5. [Para: tek kapı, tam sayı kuruş](#5-para-tek-kapı-tam-sayı-kuruş)
6. [Algoritmalar: bölüşme ve netleştirme](#6-algoritmalar-bölüşme-ve-netleştirme)
7. [Kimlik, yetki ve gizlilik](#7-kimlik-yetki-ve-gizlilik)
8. [API uç noktaları](#8-api-uç-noktaları)
9. [Frontend (2.1)](#9-frontend-21)
10. [Test stratejisi](#10-test-stratejisi)
11. [Açık maddeler / teknik borç](#11-açık-maddeler--teknik-borç)
12. [Mülakat: üç soruya kısa cevap](#12-mülakat-üç-soruya-kısa-cevap)

---

## 1. Bir bakışta sistem

Gider paylaşım uygulaması. Node.js + Express + TypeScript + PostgreSQL (Knex),
frontend'i Vite + React.

Bir isteğin yolu:

```
İstek → route → controller → service → model → PostgreSQL
        "hangi  "isteği aç,  "kararı   "SQL"
         adres"  cevabı yaz"  ver"
```

Kuralın tek amacı: **her katman kendi işini bilsin, komşusunun işini bilmesin.**
Somut karşılığı — netleştirme ve bölüşme algoritmaları `service` katmanında saf
modüller olarak durduğu için testlerinde tek bir mock yok, veritabanı ayakta
olmasa bile çalışıyorlar.

Görevlerin ilerleyişi:

| Görev | Konu                                        |
| ----- | ------------------------------------------- |
| 1.1   | Proje iskeleti, katmanlar, kütüphaneler     |
| 1.2   | Veritabanı şeması, migration'lar, seed      |
| 1.3   | JWT kimlik doğrulama + rol yetkilendirme    |
| 1.4   | Grup CRUD, davet sistemi, grup içi yetki    |
| 1.5   | Harcama CRUD + bölüşme algoritmaları        |
| 1.6   | Borç netleştirme algoritması (greedy/optimal) |
| 1.7   | Ödeme (settlement) akışı + bakiye uç noktası |
| 1.8   | Admin paneli + gizlilik sınırı              |
| 2.1   | Frontend iskeleti, rota koruma, token saklama |
| 2.2   | Giriş/kayıt ekranları, iki katmanlı validasyon |
| 2.3   | Gruplarım ekranı, bakiye renklendirmesi, durum yönetimi |
| 2.7   | [Home sayfası](2.7-home-sayfasi.md) — karma carousel, kart sırası, `/` → `/home` |
| 2.8   | [Özel imleç](2.8-ozel-imlec.md) — para tomarı, portal, kabul edilen maliyet |
| 2.9   | [Takma isimler](2.9-takma-isimler.md) — Kişiler sekmesi, kişiye özel adlar |
| —     | [Görsel kimlik](gorsel-kimlik.md) — Tailwind + shadcn/ui + Magic UI, yüzey ayrımı |
| —     | [Home özeti](home-summary.md) — ilk toplu (aggregate) uç, N+1'in önlenmesi |

---

## 2. Tekrar eden 8 ilke

Dosyaları ayrı ayrı okuyunca dağınık görünüyor; aslında **aynı 8 ilke** tekrar
tekrar uygulanıyor. Bunları bilirsen her kararı türetebilirsin.

### İlke 1 — Sessizce yanlış olmaktansa gürültüyle patla

Muhasebe uygulamasında "biraz yanlış cevap" en kötü sonuçtur: kimse fark etmez,
aylar sonra hesap tutmaz, nerede bozulduğu bulunamaz.

Uygulandığı yerler:

- `calculateNetBalances`: bilinmeyen harcamaya bağlı pay → **hata** (atlamak bütün
  bakiyeleri kaydırırdı)
- `normalizeBalances`: bakiyeler sıfıra toplanmıyorsa → **hata** (tolerans dışında)
- `parseAmountToCents`: iki ondalıktan fazlası → **null → 400** (sessizce yuvarlamak yok)
- `computeShares`: son kontrolde toplam tutmuyorsa → `SplitError` değil düz `Error` → **500**,
  çünkü buraya düşmek kullanıcı hatası değil **kod hatası**

### İlke 2 — Kural veritabanında da olsun (savunma derinliği)

Kodda bir kontrolü atlarsan bile DB reddetsin. İki hat, biri her zaman ayakta.

- `UNIQUE (expense_id, user_id)`, `UNIQUE (group_id, user_id)`
- Native `ENUM`'lar (`user_role`, `settlement_status`, `split_type`) — `role='yonetici'`
  DB'de `22P02` ile düşer
- Kısmi unique index'ler: grup başına tek `owner`, tek aktif davet, çift başına tek `pending` ödeme
- CHECK'ler: `amount > 0`, `share_amount >= 0`, `from_user <> to_user`, status ↔ zaman damgası tutarlılığı

2.2 aynı ilkeyi bir katman **dışarı** taşıdı: `web/src/utils/validation.ts`
backend'in kurallarını tekrarlıyor. Ama yön önemli — dıştaki katman kimseyi
korumaz, yalnızca hızlandırır. İstemci kontrolü curl/DevTools ile tamamen
atlanabilir; **son söz her zaman en içteki katmanın.** Ayrıntı: `2.2.md`.

### İlke 3 — Finansal kayıt silinmez (RESTRICT + soft delete)

Tek soru: **"Bu satır uçarsa para hesabı bozulur mu?"**
Bozuluyorsa `RESTRICT`, bozulmuyorsa `CASCADE`.

- Kullanıcı silinmez → `is_active = false`
- Grup silinmez → `groups.deleted_at`
- Harcama silinmez → `expenses.deleted_at` (paylara **dokunulmaz**, geri alma tek `UPDATE`)
- Reddedilen ödeme silinmez → `status = 'rejected'` (red, anlaşmazlığın kendisi; geçmişin parçası)

### İlke 4 — Tek kapı (single gateway)

Bir kural birden çok yerde tekrarlanırsa biri güncellenirken diğeri unutulur.

| Konu               | Tek kapı                                       |
| ------------------ | ---------------------------------------------- |
| Para çevrimi       | `src/utils/money.ts`                           |
| Sayfalama          | `src/utils/pagination.ts` (1.5'teki kopya buraya taşındı) |
| UUID biçim kontrolü| `src/utils/uuid.ts` (1.4'teki kopya buraya taşındı) |
| Şifre gizleme      | `PUBLIC_USER_COLUMNS` (`user.model.ts`)        |
| Grup okuma         | `group.model.ts` (`deleted_at IS NULL` burada) |
| Harcama okuma      | `expense.model.ts` (`aliveExpenses`)           |
| Onaylı ödeme okuma | `settlement.model.ts` (`listConfirmed`)        |
| Token saklama      | `web/src/api/tokenStorage.ts`                  |
| İstemci validasyonu| `web/src/utils/validation.ts`                  |
| Para (istemci)     | `web/src/utils/money.ts`                       |
| Bakiye renk kuralı | `web/src/utils/balance.ts`                     |
| Sunucu durumu      | `web/src/hooks/useAsync.ts`                    |
| Tasarım token'ları | `web/src/index.css` (`@theme` + `:root`)       |
| İmza parıltı       | `web/src/components/GlassCard.tsx`             |

### İlke 5 — Koruma route seviyesinde takılır

`router.use(requireAuth)` / `router.use(requireAuth, requireAdmin)` — tek tek
route'lara değil. Sebep: yeni bir uç nokta eklendiğinde korumayı **otomatik**
devralsın, unutulamasın. Frontend'de aynı desen: guard'lar layout route olarak takılı.

Sıra da önemli: **kimlik yetkiden önce.** Token'sız istek 403 değil **401** alır.

### İlke 6 — Varlık sızıntısını kapat (aynı 403)

Grup/harcama/ödeme uç noktalarında **dört durum aynı 403 ve aynı mesaj**:

| Durum                    | Cevap |
| ------------------------ | ----- |
| Kayıt yok                | 403 `Bu gruba erisim yetkiniz yok` |
| Var ama üye değilsin     | 403 (aynı) |
| Soft delete edilmiş      | 403 (aynı) |
| ID biçimsiz (uuid değil) | 403 (aynı) |

Ayrışsalardı ("yok" için 404) uç nokta bir **varlık oracle**'ına dönerdi: saldırgan
ID deneyerek hangi kayıtların var olduğunu öğrenirdi. Biçimsiz ID'nin burada
elenmesinin ikinci faydası: PostgreSQL'e geçseydi `invalid input syntax for type uuid`
**500** üretirdi.

**İstisna 1:** kullanıcı zaten kaydı görebiliyorsa ayrı mesaj dönebilir (sızacak
bilgi kalmamış) — "sen owner değilsin", "bu harcamayı yalnızca ekleyen ya da owner
değiştirebilir", "yalnızca ödemeyi alan taraf onaylar".

**İstisna 2:** `/admin/*` uçlarında bu kaygı **yok** — admin zaten tüm kullanıcıları
listeleyebiliyor. Orada dürüstçe **404** dönülüyor.

### İlke 7 — İstemciden asla güvenlik alanı alınmaz

- `register` gövdesindeki `role: 'admin'` **yok sayılır** (DB default'u `user`)
- Settlement gövdesindeki `status: 'confirmed'` **yok sayılır** (kayıt her zaman `pending` başlar)
- `fromUserId` başkasını gösterirse **403**

Aksi halde tek satırla tüm model delinirdi.

### İlke 8 — Kararın bedeli yazılır, geri dönüş yolu bırakılır

Her dosyada "bedeli neydi" ve "ne zaman değiştiririm" bölümü var. Bedeli olmayan
karar zaten karar değildir. Örnek: JWT geri alınamaz → kabul edildi, geçiş yolu
(`token_version` kolonu ya da `jti` denylist) yazıldı.

---

## 3. Veri modeli

**Kaynak: `1.1-1.2-1.6-anlatim.md`, `1.4.md`, `1.5.md`, `1.7.md`**

### Neden Knex, Prisma değil

- Bu projede bakiye/toplama sorguları yazılacak; **SQL'i görmek gerekiyor.** Knex SQL'i
  gizlemez, yazmayı kolaylaştırır. Prisma karmaşık aggregate'te ya kısıtlar ya ham SQL'e
  düşürür — o noktada zaten sağladığı kolaylıktan çıkmış olursun.
- PostgreSQL'in kendi özelliklerine tam erişim: native `ENUM`, `gen_random_uuid()`, `NUMERIC`.
- **Bedeli:** Prisma'nın hazır verdiği tip güvenliği elle kuruldu → `src/types/models.ts`
  (her tablo için `XRow` / `XInsert` / `XUpdate`).

### Migration zinciri

```
00_extensions        pgcrypto (gen_random_uuid için — her şeyden önce)
01_users
02_groups            → users
03_group_members     → users + groups
04_expenses          → groups + users
05_expense_shares    → expenses + users
06_settlements       → groups + users
07_groups_description_and_soft_delete   groups.description, groups.deleted_at
08_group_member_roles                   group_members.role + tek owner index'i
09_group_invites                        group_invites + tek aktif davet index'i
10_expenses_split_and_soft_delete       split_type, created_by, updated_at, deleted_at, CHECK'ler
11_settlements_reject_flow              rejected durumu, rejected_at, 3 CHECK, tek pending index'i
```

**Numara zorunlu:** Knex dosyaları alfabetik çalıştırır; `expenses` `users`'a referans
verdiği için `users` önce oluşmalı. Çalışmış bir migration'ın **adı değiştirilmez**
(Knex adları `knex_migrations` tablosunda tutar → "migration directory is corrupt").

**Neden UUID, artan sayı değil:** artan sayı tahmin edilebilir (`/api/expenses/5`) ve
üretmek için DB'ye gitmek gerekir. Bedeli: daha çok yer, okunması zor.

### Kritik kolon kararları

| Kolon | Karar | Gerekçe |
| ----- | ----- | ------- |
| `users.password_hash` | adı `password` değil | bcrypt ile geri çevrilemez; DB sızsa bile okunamaz |
| `users.is_active` | silme yok, pasifleştir | silinen kullanıcının harcaması grubun bakiyesinin parçası |
| `*.created_at` | `timestamptz` | saat dilimi bilgisi olmadan kaydın ne zaman olduğu belirsizleşir |
| `expenses.amount` | `numeric(10,2)` | float'ta `0.1+0.2 = 0.30000000000000004`; yüzlerce toplamada kuruş kaybolur |
| `expense_shares` | **ayrı tablo** | harcama eşit bölünmek zorunda değil (180 TL pizza, Kerem yoktu → 3 kişi) |
| `expense_shares.created_at` | **yok** | pay harcamanın parçası; kendi zamanı yok |
| `expenses.created_by` | `paid_by`'dan ayrı | "Kerem ödedi, girişi ben yaptım" sık senaryo; düzenleme yetkisi **girene** bağlı |
| `expenses.split_type` | saklanıyor | sonuçtan yöntem geri okunamaz — "eşit bölünmüş 33.34/33.33/33.33" ile elle girilmişi aynı satırları üretir; düzenleme ekranı hangi formu açacağını bilmeli |
| `expenses.category` | `NOT NULL DEFAULT 'genel'` | 1.2'de zorunluydu; her harcamayı sınıflandırmaya zorlamak giriş akışını yavaşlatıyor |
| `group_members.role` | üyelik satırında, kullanıcıda değil | bir kişi A grubunun owner'ı, B'nin member'ı olabilir |
| `settlements.status` | `pending/confirmed/rejected` | iki taraflı onay (bkz. §7) |
| `settlements.rejected_at` | ayrı kolon (tek `resolved_at` değil) | status ↔ zaman damgası CHECK'i ancak böyle yazılabilir |

### Silme kuralları özeti

> **İlişki satırları CASCADE, finansal kayıtlar RESTRICT.**

| Yabancı anahtar | Kural | Gerekçe |
| --- | --- | --- |
| `groups.created_by` | RESTRICT | kurucu silinince tüm grup geçmişi uçmamalı |
| `group_members.group_id` / `user_id` | CASCADE | üyelik grupsuz anlamsız, veri taşımıyor |
| `expenses.group_id` | CASCADE | harcama grubun yaşam döngüsüne bağlı |
| `expenses.paid_by` | RESTRICT | ödeyen silinirse borçlar sessizce kaybolur |
| `expense_shares.expense_id` | CASCADE | pay, harcamanın parçası |
| `expense_shares.user_id` | RESTRICT | "kim ne kadar borçlu" kaybolmamalı |
| `settlements.group_id` | CASCADE | ödeme kaydı grup bağlamında anlamlı |
| `settlements.from_user` / `to_user` | RESTRICT | ödemenin iki tarafı da kanıt |

**Ama:** `DELETE /groups/:id` bu cascade'i hiç tetiklemez — soft delete yapar. Tek bir
HTTP isteği grubun tüm finansal geçmişini uçurmamalı; ayrıca cascade'e izin vermek
"kullanıcının harcama geçmişini silmenin yolu onu silmek değil, grubu silmek olur"
diyerek `RESTRICT` ilkesini arka kapıdan delerdi.

**Soft delete'in bedeli:** grup/harcama okuyan **her** sorgu `deleted_at IS NULL`
filtrelemeli. Risk tek noktaya indirildi (İlke 4): servis katmanı doğrudan
`db('groups')` / `db('expenses')` çağırmıyor.

### Seed (`01_demo_data.ts`)

- Silme sırası ters (çocuk tablodan başlayarak) — `RESTRICT` kurallarına saygı
- Kimlikler **sabit UUID** — Postman'de kaydedilen istekler her seed'de bozulmasın
- Şifre gerçekten hash'li (`bcrypt.hash('Password123!', 10)`) — düz metin olsaydı
  `bcrypt.compare` çalışmaz, boşuna "giriş yapılamıyor" hatası aranırdı
- 4 kullanıcı, 1 grup, 3 harcama, **11 pay** (4+4+3): pizza kasıtlı olarak 3 kişiye
  bölündü — "herkes her harcamaya dahil değil" durumunu test edebilmek için

Bu verinin sonucu: Admin +105, Deniz +45, Ece −15, Kerem −135 → **toplam 0** (matematiksel
zorunluluk, netleştirme bunu doğrulama olarak kullanıyor) → 11 pay satırı **3 ödemeye** iniyor.

---

## 4. Katmanlar ve dosya haritası

| Klasör | Görevi | Neden ayrı |
| --- | --- | --- |
| `config/` | ayarlar tek yerde | `process.env.PORT` 20 yerde geçmesin |
| `db/migrations/` | şema adımları | şema kodun parçası; yeni makinede tek komut |
| `db/seeds/` | örnek veri | Postman'de test edebilmek |
| `types/` | tablo tipleri | `is_activ` yazarsan **derlenmez** |
| `routes/` | adres → controller | tüm API'yi tek yerden görmek |
| `controllers/` | HTTP çevirisi | **hesap yapmaz, yetki kararı vermez** |
| `services/` | iş mantığı + **tüm yetki kararları** | HTTP/DB bilmez → kolay test |
| `models/` | veri erişimi | SQL tek yerde; filtreler burada hapsedilir |
| `middlewares/` | ortak davranış | 404 / hata / auth her route'da tekrarlanmasın |
| `utils/` | yardımcılar | hiçbir katmana ait olmayan tek kapılar |

Dosya isimlendirme: `<konu>.<katman>.ts` (`netting.service.ts`), migration'lar `NN_<tablo>.ts`.

**Testler `src/` içinde değil, `tests/` altında:** `src/` yalnızca derlenip sunucuya
gidecek kodu içeriyor; testler orada olsa `npm run build` onları da production
çıktısına koyardı. Bedeli: `jest.config.js`, `tsconfig.typecheck.json`, `eslint.config.js`
içinde yol tarifi.

### Kütüphaneler (1.1)

**Çalışma zamanı:** express (web iskeleti) · pg (PostgreSQL sürücüsü) · knex (query
builder + migration) · dotenv (şifre koda gömülmesin) · bcryptjs (geri çevrilemez hash) ·
cors (frontend'in isteği bloklanmasın) · helmet (güvenlik başlıkları) · morgan (istek log'u)

**Geliştirme:** typescript · tsx (`npm run dev` hızlı olsun) · ts-node (knex CLI `.ts`
migration çalıştırabilsin) · `@types/*` · eslint + typescript-eslint · prettier (+ iki
uyum paketi) · globals · jest + ts-jest (**1.1'de değil, 1.6'da eklendi**)

> `@types/express` v4 çünkü `express` v4 — tip sözlüğü sürümü kütüphaneyle eşleşmek zorunda.

---

## 5. Para: tek kapı, tam sayı kuruş

**Kaynak: `1.5.md` (`utils/money.ts`), `1.1-1.2-1.6-anlatim.md` (`netting.service.ts`)**

Kural tek cümle: **uygulama içinde para hiçbir zaman ondalık sayı olarak toplanmaz
veya çarpılmaz.**

Sorun DB'de değil (NUMERIC tam ondalık), **sürücüde**: `pg`, NUMERIC'i JS'e `string`
verir ve `Number(...)` denildiği anda float dünyasına geçilir. Bu yüzden:

```
DB (NUMERIC string) → parseAmountToCents → integer kuruş
integer kuruş       → formatCents        → DB / JSON (string)
```

`money.ts` dışında hiçbir yerde tutar ayrıştırılmıyor/biçimlendirilmiyor.

**İki incelik:**

1. **`Math.round(value * 100)` kullanılmıyor.** `Math.round(1.005 * 100)` motorda 101
   değil **100** verir (1.005 ikili tabanda tam değil). Bunun yerine metin noktadan
   ikiye bölünüp iki tam sayı toplanıyor.
2. **Yuvarlamak yerine reddetmek.** `12.345` → `null` → 400. Sessiz yuvarlama,
   kullanıcının gördüğü tutarla kaydedileni ayırır ("ben 12.35 yazmıştım" tartışması).
   Üstelik iki ondalıktan fazlası taşıyan değer zaten float aritmetiğinden gelmiştir.

**Yüzdeler de tam sayı:** `parsePercentageToBasisPoints` → `33.33% → 3333`. Çünkü
"toplam tam 100 mü?" float'ta yanıtlanamaz (`33.33 * 3 = 99.99000000000001`).
Tam sayıda `3333*3 = 9999 ≠ 10000` doğru reddedilir, `3334+3333+3333 = 10000` kabul edilir.

**Neden NUMERIC bırakıldı, BIGINT kuruşa geçilmedi:** dönüşümü tamamen kaldırırdı ama
1.2'deki şemayı, seed'i ve settlements tarafını değiştirmeyi gerektirirdi; ayrıca SQL'de
elle bakılan her tutar `30000` görünürdü. NUMERIC + tek kapı, aynı garantiyi şema
değişikliği olmadan veriyor.

Netleştirme tarafında aynı ilke: `toCents` girişte ×100 tam sayıya çevirir, tüm hesap
tam sayıda yapılır, `fromCents` çıkışta böler. `string | number` kabul etmesi bilinçli
(DB'den metin, testte sayı).

---

## 6. Algoritmalar: bölüşme ve netleştirme

Her ikisi de **saf modül**: `import` ile çekilen DB/HTTP/kütüphane yok. Veri girer,
veri çıkar. Bedeli: veriyi tabloya göre değil fonksiyona göre şekillendiren bir ara
katman (`calculateNetBalances`, `balance.service`). Karşılığı: mock'suz testler,
1.5 saniyede çalışan 23 test, 300 senaryoluk rastgele test.

### 6.1 Bölüşme — `split.service.ts` (1.5)

Tek değişmez kural: `sum(paylar) === toplam tutar` — **tam eşitlik, tolerans yok.**

Üç tip de tek fonksiyona (`distributeByWeights`) indirgendi; ayrı yazılsalardı kuruş
artığı mantığı iki yerde tekrarlanır, biri düzeltilirken diğeri unutulurdu.

| Tip | Ağırlık |
| --- | --- |
| `equal` | herkes 1 |
| `percentage` | baz puan (33.33% → 3333) |
| `exact` | dağıtım yok — sadece doğrulama |

**Kuruş artığı: en büyük artık (largest remainder / Hamilton).** Önce herkese `floor`
verilir, artan kuruşlar **ondalık artığı en büyük olanlara** birer birer dağıtılır:

```ts
cents:     Math.floor(exact / totalWeight),
remainder: exact % totalWeight,
```

`100.00 / 3 → 33.34 + 33.33 + 33.33`. Kimse diğerinden 1 kuruştan fazla farklı ödemez.

**Seçilmeyen alternatif — "artanı son kişiye ekle":** invaryantı sağlardı ama 10 kişilik
grupta 9 kuruşun tamamı tek kişiye yazılırdı. Daha kötüsü "son kişi" istemcinin gönderdiği
dizinin sırasına bağlı olurdu → aynı harcama, farklı sırayla farklı borçlar.
Eşit artıkta sıralama `userId`'ye göre → **deterministik**.

`SplitError` bilerek `ApiError` değil (modül HTTP bilmemeli); dönüşüm `expense.service`
içinde tek yerde yapılıyor.

### 6.2 Netleştirme — `netting.service.ts` (1.6)

Üç dışa açık fonksiyon:

| Fonksiyon | Ne yapar |
| --- | --- |
| `calculateNetBalances()` | ham harcama/pay → net bakiye |
| `greedyNetting()` | hızlı sadeleştirme; **doğru**, ama en az sayıda ödeme garanti değil |
| `optimalNetting()` | en az ödemeyi **garanti eder** (max 14 kişi) |

**`calculateNetBalances`** — formül: `net = ödediği toplam − payına düşen toplam`.
Aynı kişi hem ödeyen hem pay sahibi olabilir (Admin 300 ödedi `+300`, kendi payı `−75`
→ net `+225`); ayrı takip edilmiyor, tek toplama akıyor. Sonuç `userId`'ye göre sıralı
— aynı girdiye her zaman aynı sırada aynı cevap (yoksa test bir gün geçer bir gün kalırdı).

**`normalizeBalances`** — dört iş: (①) tekrar eden `userId` → hata, (②) toplam sıfır
değilse → tolerans kontrolü, (③) yuvarlama artığını **en büyük bakiyeye** yedir (göreli
hatası orada en küçük), (④) sıfır bakiyelileri ele.

Toleransın mantığı: `tolerance = kişi sayısı` kuruş. Çünkü 100 TL üçe bölününce
33.33+33.33+33.34 yazmak zorundasın — yuvarlama kişi başına **en fazla 1 kuruş** artık
bırakır. Bundan büyük sapma yuvarlama değil, **gerçek hesap hatası** → hata fırlat.

**`greedyCore`** — kural: *"en çok alacaklı ile en çok borçluyu eşleştir, aralarında
mümkün olan en büyük ödemeyi yap, tekrarla."*

```ts
const amount = Math.min(entries[creditor].cents, -entries[debtor].cents);
```

`Math.min` sayesinde her adımda **en az bir taraf sıfırlanır** → en fazla `n−1` adımda biter.

**`optimalNetting`** — dayandığı fikir:

> **En az ödeme sayısı = kişi sayısı − (toplamı sıfır olan bağımsız alt grup sayısı)**

Çünkü toplamı sıfır olan `k` kişilik grup tam `k−1` ödemeyle kapanır. Problem şuna
dönüşüyor: *"bu insanları en fazla kaç bağımsız gruba bölebilirim?"*

Üç püf noktası:

1. **Memoization** (`maxGroups`) — aynı kişi kümesi arama sırasında yüzlerce kez
   karşımıza çıkıyor; olmasa hesap pratikte bitmezdi.
2. **Anchor** (`mask & -mask`) — `{A,B}+{C,D}` ile `{C,D}+{A,B}` aynı bölünme; en küçüğü
   sabitlemek aynı cevabı farklı sıralarla tekrar denemeyi engelliyor.
3. **Grup içinde greedy artık optimaldir** — bölünme bulunduktan sonra grup daha
   parçalanamaz; öyle bir grupta greedy tam `k−1` ödeme üretir. Zor kısım doğru grubu
   bulmak, içini kapatmak kolay.

**`OPTIMAL_NETTING_LIMIT = 14`:** maliyet `3ⁿ` mertebesinde — 14 kişide milisaniyeler,
20 kişide pratikte hiç dönmüyor. Bu problemin (subset-sum akrabası) bilinen hızlı çözümü
**yok**; kod eksikliği değil, problemin doğası. Sınır sessizce aşılmıyor, açık hata veriyor.
Mimari karar: **küçük gruplarda en iyi cevap, büyük gruplarda hızlı ve yeterince iyi cevap.**

**Greedy'nin optimal olmadığının ispatı (5. senaryo):**

```
Ali +10, Burak +8, Ceren −6, Deniz −4, Elif −8
Gizli yapı:  {Ali, Ceren, Deniz} = 0   ve   {Burak, Elif} = 0
En az ödeme = 5 − 2 = 3
```

Greedy ilk adımda Ali (+10) ile Elif (−8) eşleştirir — **farklı gruplardan.** Doğal
bölünme bozulur, Ali'de 2.00 artık kalır ve ikinci gruba sızar → Deniz **iki ayrı ödeme**
yapmak zorunda kalır → **4 ödeme**. Optimal: **3 ödeme.**

> Greedy'nin cevabı **yanlış değil** — iki liste de herkesin bakiyesini sıfırlıyor.
> Fark sadece verimlilikte. Testler ikisinin de geçerli olduğunu ayrı ayrı doğruluyor.

---

## 7. Kimlik, yetki ve gizlilik

### 7.1 JWT (1.3)

**Neden JWT, session değil:** (1) istemci mobil — cookie tabanlı session tarayıcı için
tasarlanmış; `users.fcm_token` kolonu hedefin mobil olduğunu söylüyor. (2) Ek altyapı
istemiyor (Redis / her istekte ek DB sorgusu yok). (3) Yatay ölçeklenmede her kopya aynı
`JWT_SECRET` ile doğrular.

**Bedeli:** JWT geri alınamaz — çıkışta veya rol değişince token süresi dolana kadar
geçerli. Kabul edildi; çözüm yolu yazıldı (`jti` denylist ya da `token_version` kolonu).

**Neden 7 gün:** kısa süre (15dk) refresh olmadan kullanıcıyı gün içinde defalarca
login'e atar; uzun süre (90 gün) çalınan token'ı çok uzun yaşatır. `.env`'den okunur,
testlerde `1h` — yani gerçekten yapılandırılabilir olduğu kanıtlanıyor.

**Neden access/refresh ayrımı yok:** refresh'in tek anlamlı faydası access'i kısa
tutmaktır, ama işe yaraması için DB'de saklama + rotasyon + iptal + yeniden kullanım
tespiti gerekir. **Yarım kurulmuş bir refresh akışı, tek başına 7 günlük token'dan
daha kötüdür.** Geçiş kolay: `signToken`/`verifyToken` tek yerde, `req.user` sözleşmesi
(`{id, role}`) değişmez.

**Diğer kararlar:** bcrypt maliyeti `clampSaltRounds` ile 10–12'ye sıkıştırılıyor
(altı güvensiz, üstü login'i uzatır) · `PUBLIC_USER_COLUMNS` şifreyi **hiç seçmiyor** ·
`role` istemciden alınmaz · kayıtlı olmayan e-posta ile yanlış şifre **aynı 401**
(kullanıcı sızdırma) · `JWT_SECRET` yoksa 500, koda gömülü fallback **bilinçli olarak yok**
(fallback = üretimde sessizce zayıf anahtar) · `verifyToken` imzanın yanında payload
içeriğini de doğruluyor.

### 7.2 Grup yetkisi ve davet (1.4)

**İki rol ayrı kavram:** `users.role` (admin/user) = uygulama rolü; `group_members.role`
(owner/member) = grup rolü.

**IDOR'a karşı ana kural:** yetki kontrolü ID'nin gizli kalmasına güvenmez. UUID tahmin
edilemez ama log'a, ekran görüntüsüne, paylaşılan bir linke düşebilir. Grup bağlamı
isteyen her işlem tek kapıdan geçer: `requireMembership` / `requireOwnership`.
**Controller katmanında hiç yetki kararı yok** — her fonksiyon `req.user.id`'yi servise
geçirir. `GET /groups` filtrelemeyi sorgunun kendisinde yapıyor (JOIN), sonradan değil.

**Davet kodu:** `crypto.randomBytes(16).toString('base64url')` — 128 bit entropi, 22
karakter, URL/QR'a doğrudan gömülebilir. `Math.random()` **değil** (kriptografik değil;
çıktısından üretecin iç durumu geri hesaplanabilir). Sıralı ID olsaydı saldırgan 1'den
sayıp davetsiz gruba girerdi.

Kod ayrı `group_invites` tablosunda — davetin grup satırından bağımsız yaşam döngüsü var
(süresi dolar, iptal edilir, yenilenir, kullanım sayılır).

**Varsayılan çok kullanımlık, istenirse tek (`maxUses: 1`).** Gerçek kullanım "linki
WhatsApp grubuna at" senaryosu; tek kullanımlık varsayılan olsaydı 5 kişi için 5 kod
gerekirdi. Yani karar "ikisinden biri" değil, **varsayılanı doğru seçmek** oldu.
Risk üç mekanizmayla dengeleniyor: süre sınırı (varsayılan 7, en fazla 30 gün), kota,
rotate. Grup başına tek aktif davet DB'de garanti.

**İkinci `POST /invite` yeni kod üretmez**, mevcut aktif daveti döner — aksi halde
"linki tekrar kopyalayayım" diye butona basan kişi az önce paylaştığı linki öldürürdü.
Bedeli: kod DB'de **düz metin** (hash'lense geri gösterilemezdi). Kabul edildi: davet
kodu şifre değil, kapsamı tek gruba katılmak, ömrü kısa, iptal edilebilir.

**Daveti sadece owner üretir:** üye çıkarmayı sadece owner yapabildiğine göre üye
**eklemeyi** de sadece owner yapabilmeli; aksi halde çıkarılan kişiyi başka üye geri
davet ederdi.

**Yarış koşulu:** `redeemInvite` tek transaction + davet satırında `FOR UPDATE`. Kilit
olmasaydı `maxUses: 1` olan davete aynı anda gelen iki istek ikisi de `use_count = 0`
görüp gruba girerdi (TOCTOU). Zaten üye olan tekrar tıklarsa hata değil,
`200 + already_member: true` ve **kotadan düşülmez.**

**Owner kendini çıkaramaz** (400). Sessizce izin verilseydi grup **sahipsiz** kalırdı:
kimse davet üretemez, üye çıkaramaz, silemez. Seçilmeyen alternatifler: otomatik devir
(kullanıcıya sormadan yönetim yüklemek + "grup neden bana geçti?"), owner çıkınca grubu
sil (bir kişinin ayrılması diğerlerinin geçmişini silmemeli). Doğru yol kullanıcıya
bırakıldı; sahiplik devri bu görevin kapsamında değildi ama şema (tek owner index'i)
hazır.

### 7.3 Harcama yetkisi (1.5)

**Kim düzenleyebilir: ekleyen ya da grup sahibi.**

- Sadece ekleyen olsaydı: yanlış giren kişi gruptan çıkarıldığında hatalı harcama
  düzeltilemez kalırdı.
- Her üye olsaydı: bakiyesi hoşuna gitmeyen biri başkasının kaydını sessizce değiştirirdi.

**Katılımcı grubun üyesi olmalı** — olmasaydı o kişi harcamayı hiç göremezken bakiyesinde
borç birikirdi. **`paidBy` verilmezse istek sahibi.** **Ödeyenin paylaşıma dahil olması
zorunlu değil** (hediye senaryosu). **`equal` için katılımcı listesi opsiyonel** (verilmezse
tüm gruba eşit).

**Para bloğu bölünmez:** `amount`, `splitType`, `splitDetails`'ten biri gönderilirse
`amount` + `splitType` **birlikte** gelmek zorunda. Yalnızca tutar değişseydi paylar
eski tutara göre kalır ve `sum(paylar) = tutar` eşitliği **sessizce** bozulurdu — hata
veren bir uç nokta değil, yanlış bakiye üreten bir veri satırı olurdu. "Otomatik yeniden
hesapla" seçilmedi: `exact`'te öyle bir şey yok, `percentage`'ta eski yüzdelerin geçerli
olduğu varsayımı sessiz bir tahmin olurdu.

**Paylar güncellenmez, silinip yeniden yazılır** (tek transaction): katılımcı listesi de
değişebiliyor; "güncelle + ekle + sil" üç adımının yarısı çalışırsa toplam tutmaz.
Aynı gerekçe `create` için de geçerli — ayrı yazılsalardı ikinci INSERT patladığında
**paysız**, yani bakiyeyi sessizce bozan bir harcama satırı kalırdı.

**İki ayrı router:** liste/oluşturma `/groups/:id/expenses`, tek harcama işlemleri
`/expenses/:id`. `/groups/:id/expenses/:expenseId` seçilmedi — iki ID'nin tutarlılığını
her istekte doğrulamak gerekirdi ("A grubunun altından B'nin harcamasını düzenle" ne
dönmeli?). Grup, harcama satırından okunuyor.

**Sayfalama:** varsayılan 20, üst sınır 100 (`limit=100000` tüm tabloyu belleğe alırdı).
Sıralama `created_at DESC, id DESC` — sadece `created_at` aynı anda eklenen iki kayıtta
sırayı belirsiz bırakır, aynı satır iki sayfada görünebilir. Paylar N+1 değil, sayfa
başına **tek** ek sorgu (`attachShares`).

### 7.4 Ödeme akışı: iki taraflı onay (1.7)

Üç model değerlendirildi:

| | Model | Sonuç |
| --- | --- | --- |
| A | tek taraflı bildirim (borçlu "ödedim" der, anında geçerli) | ❌ |
| **B** | **iki taraflı onay (borçlu açar, alacaklı onaylar/reddeder)** | ✅ seçildi |
| C | yalnızca alacaklı kaydeder | ❌ |

**Belirleyici olan:** para hareketi uygulamanın **dışında** gerçekleşiyor (elden nakit,
havale). Sistemin doğrulayabileceği hiçbir kaynak yok → "ödedim" beyanı bir *kanıt* değil,
bir *iddia*.

- **A'da** bu iddia tek başına bakiyeyi değiştirirdi: yanlış tıkla alacaklının alacağı
  sessizce sıfırlanır; kötü niyetle "ödedim" demek bedavadır ve borç takibini anlamsız kılar.
- **C**, B kadar güçlü ama ödeyen tarafı akışın dışında bırakır — "ben ödedim, artık sende"
  diyemez.
- **B**, C'nin doğruluk garantisini korur ve akışı doğru tarafın başlatmasına izin verir.

**Bedeli:**

| Bedel | Nasıl hafifletildi |
| --- | --- |
| Alacaklı onaylamazsa kilitlenme | red açık bir yol; `pending` bakiyeyi bozmaz |
| "Ödedim ama hâlâ borçlu görünüyorum" | `meta.pending_settlement_count` |
| Bekleyen kayıt birikmesi | çift başına tek `pending` (DB'de zorunlu) |
| Daha fazla sürtünme | kabul edildi — doğruluk sürtünmeden önce gelir |
| Bildirim ihtiyacı | **karşılanmadı** — açık madde (`users.fcm_token` hazır) |

**Geri dönüş ucuz:** `createSettlement` kaydı doğrudan `confirmed` yazmaya başlarsa
model A olur. Ara yol: **otomatik onay** (n gün içinde reddedilmeyen onaylanmış sayılır) —
bir job ve "sessiz kalmak onaydır" kabulü gerektiriyor, kapsam dışı.

**`pending` bakiyeyi etkilemez** — tek satırda, **model katmanında** uygulanıyor
(`listConfirmed`). Servise bırakılsaydı "hepsini oku sonra filtrele" yazılabilir, bir gün
filtreyi atlayan ikinci bir çağrı eklenebilirdi.

**Onaylanmış ödeme = sanal harcama.** Ödemeler için ayrı aritmetik **yazılmadı**:
A'nın B'ye X TL ödemesi, "A ödedi (X), tamamı B'nin payı" harcamasına birebir denk.
Bu yüzden `calculateNetBalances`'a sanal harcama olarak besleniyor. Alternatif
("bakiyeyi hesapla, sonra ödemeleri elle ekle/çıkar") reddedildi: para aritmetiği ikinci
bir yerde tekrarlanır ve tek kapı ilkesi delinirdi.

**Neden `PUT .../confirm` ve `.../reject`, `PATCH {status}` değil:** bu bir alan
güncellemesi değil, **durum geçişi**. Tek `status` alanı yazdırmak `confirmed → pending`
gibi geçersiz istekleri de kabul edilebilir gösterirdi; ayrıca yetki kuralı alanın
*değerine* bağlı hale gelirdi.

**Enum'a değer eklerken transaction tuzağı:** `ALTER TYPE ... ADD VALUE` ile eklenen değer
**aynı transaction içinde kullanılamaz** — knex migration'ları transaction içinde çalıştığı
için CHECK'ler patlardı. Bu yüzden tip baştan oluşturulup kolon cast ediliyor. `down`
**kayıplı**: `rejected` satırlar `pending`e çekiliyor (cast başka türlü patlardı, silmek
kayıt kaybı olurdu) — migration dosyasında not edildi.

**Bakiye uç noktası:** harcamalar **sayfalanmadan** okunur (netleştirme kısmi veriyle
çalışamaz). Algoritma seçimi otomatik: sıfır olmayan bakiye sayısı > 14 → greedy, değilse
optimal; sayım sıfır bakiyeleri dışarıda bırakır (`optimalNetting` de eliyor, yoksa
dengedeki üyeler yüzünden gereksiz greedy'ye düşerdik). Liste iki kümenin birleşimi:
tüm üyeler + bakiyesi olan herkes — gruptan çıkarılmış ama geçmiş harcaması duran kullanıcı
`name: null` ile görünür.

### 7.5 Admin ve gizlilik sınırı (1.8)

**Asıl soru: gizlilik sorgu seviyesinde mi, serialization seviyesinde mi?
Karar: sorgu seviyesinde.** Veri ne çekiliyor ne kırpılıyor — **hiç okunmuyor.**

| | Serialization | **Sorgu (seçilen)** |
| --- | --- | --- |
| Nasıl | okunur, yazılırken kırpılır | sorguda hiç yer almaz |
| Veri nerede | bellekte, log'da, hata izinde | süreç belleğine hiç girmez |
| **Yeni alan eklenince** | **listeye eklenmezse sızar** | **sorguda tablo yoksa sızamaz** |
| Testi | "bu alan response'ta yok" | "bu tablo sorguda yok" |

Belirleyici olan üçüncü satır: serialization'da güvenlik bir **çıkarma listesinin** güncel
tutulmasına bağlıdır. Repo'da örneği zaten vardı — `PUBLIC_USER_COLUMNS` (1.3): şifre
hash'i kırpılmıyor, **hiç seçilmiyor**. 1.8 aynı deseni harcama verisine uyguluyor.

Sınır **üç katmanda** tekrarlanıyor: router (`admin.routes` yalnızca `admin.service`'e
bağlanır) → servis (`expense.model`/`settlement.model` **import bile edilmemiş**) →
model (`listGroupMeta` sorgusunda `expenses` kelimesi hiç geçmiyor).

- **`description` dönmüyor:** ad bir tanımlayıcı, açıklama kullanıcının yazdığı serbest
  metin — yani **içerik**. "Ev Arkadaşları" ile "Boşanma avukatı masrafları" arasında
  gizlilik farkı var.
- **Harcama sayısı bile dönmüyor:** teknik olarak aggregate sayılırdı ama bir kez
  `expenses`'e join atıldığında sınır yine "hangi alanı seçtiğime dikkat ediyorum"a döner.
  Join'in hiç olmaması kuralı **denetlenebilir** kılıyor.
- **`/admin/stats` neden `expenses` okuyabiliyor:** "toplam işlem hacmi" `SUM(amount)`
  demek. Sınır farklı çizildi — **tablo okunur ama yalnızca toplam üretilir.**
  **`GROUP BY` yok**: grup başına hacim admin'e *"hangi ev ne kadar harcıyor"* profilini
  verirdi. Toplam bir satır, kırılım profildir.

**Admin kendini devre dışı bırakamaz** (400) — sessizce izin verilseydi ne panele girebilir
ne login olabilirdi, kurtarma yolu yalnızca DB'ye elle müdahale olurdu. Enable'da kısıt yok.

**LIKE kaçışı:** `%`, `_`, `\` kaçırılıyor — kaçırılmasaydı tek başına `%` yazan istek
filtreyi tamamen etkisiz kılardı (güvenlik açığı değil, **sessiz yanlış sonuç**).

**Migration gerekmedi:** `is_active` 1.2'de, login kontrolü 1.3'te zaten yazılmıştı.
1.8'de eklenen tek şey kolonu **yazan** uç noktalar oldu.

---

## 8. API uç noktaları

Tümü `/auth/register`, `/auth/login` ve `POST /groups/join/:code` dışında `requireAuth`
arkasında.

| Metot + adres | Ek yetki | Cevap |
| --- | --- | --- |
| `POST /auth/register` | — | 201 `{ user, token, expiresIn }` |
| `POST /auth/login` | — | 200 `{ user, token, expiresIn }` |
| `GET /auth/me` | — | 200 `{ user }` |
| `GET /auth/users` | admin | 200 `{ users }` — `/admin/users` ile ikizi, silinmeli |
| `POST /groups` | — | 201 `{ group }`, kurucu otomatik `owner` |
| `GET /groups` | — | 200 `{ groups }` — yalnızca üye olunanlar |
| `GET /groups/:id` | üyelik | 200 `{ group, role, members }` |
| `POST /groups/:id/invite` | owner | 201 (yeni) / 200 (mevcut kod) |
| `POST /groups/join/:inviteCode` | — | 200 `{ group, already_member }` |
| `DELETE /groups/:id/members/:userId` | owner | 200 `{ removed_user_id }` |
| `DELETE /groups/:id` | owner | 200 `{ group }` (soft delete) |
| `POST /groups/:id/expenses` | üyelik | 201 `{ expense }` |
| `GET /groups/:id/expenses` | üyelik | 200 `{ expenses, pagination }` |
| `GET /expenses/:id` | üyelik | 200 `{ expense }` |
| `PUT /expenses/:id` | ekleyen ya da owner | 200 `{ expense }` |
| `DELETE /expenses/:id` | ekleyen ya da owner | 200 `{ expense }` (soft delete) |
| `POST /groups/:id/settlements` | borçlu = istek sahibi | 201 `{ settlement }` (`pending`) |
| `PUT /settlements/:id/confirm` | alacaklı | 200 (`confirmed`) |
| `PUT /settlements/:id/reject` | alacaklı | 200 (`rejected`) |
| `GET /groups/:id/balances` | üyelik | 200 `{ balances, transfers, meta }` |
| `GET /admin/users` | admin | 200 `{ users, pagination }` — `?search=&status=&role=&page=&limit=` |
| `PUT /admin/users/:id/disable` | admin | 200 `{ user, changed }` |
| `PUT /admin/users/:id/enable` | admin | 200 `{ user, changed }` |
| `GET /admin/groups` | admin | 200 — **yalnızca üst veri** |
| `GET /admin/stats` | admin | 200 toplamlar + 7/30 gün trendi |

---

## 9. Frontend (2.1)

`web/` altında ayrı Vite + React + TS projesi (kendi `package.json`'ı ile).

**Token saklama: `localStorage`.** Seçeneklerin bu backend'le nasıl çalıştığına dayanıyor:

- **Bellek değil:** sayfa yenilenince kaybolur. Normalde kabul edilebilir çünkü yanında
  refresh token olur — ama bu projede refresh **bilinçli olarak yok** (1.3). Bellek-only
  seçilseydi kullanıcı her F5'te login'e düşer ve geri dönüş yolu olmazdı. "Bellek daha
  güvenli" doğru ama eksik: bu mimaride bellek güvenliği değil yalnızca **kullanılabilirliği**
  değiştirir — çalınabilir token'ın ömrü sunucuda zaten 7 gün.
- **httpOnly cookie değil:** güvenlik açısından en iyisi olurdu ama 1.3'te kimlik
  `Authorization` header'ı ile taşınacak şekilde kuruldu (mobil hedef). Geçiş `Set-Cookie`,
  `SameSite`, CSRF token'ı ve CORS `credentials` demek; ayrıca mobil için geri adım.
  2.1'in kapsamı frontend iskeleti kurmaktı, backend'in kimlik kararını tersine çevirmek değil.
- **sessionStorage değil:** XSS'e karşı `localStorage`'dan **daha güvenli değil** (aynı
  origin'deki JS ikisini de okur). Tek farkı sekme kapanınca silinmesi — bu, gider paylaşan
  uygulamada kazanç değil kayıp. Aynı bedel, aynı risk.

**XSS riski dürüstçe kabul ediliyor**, "şu önlemlerle güvenli hale getirdim" denmiyor.
Taşınabilir kılan üç gözlem: (1) XSS varsa httpOnly cookie de kurtarmaz — saldırgan
token'ı okuyamasa bile kurbanın tarayıcısından istek atabilir; httpOnly *sızmayı* engeller,
*kötüye kullanımı* engellemez. (2) Saldırı yüzeyi dar — `dangerouslySetInnerHTML` hiç
kullanılmıyor. (3) Token dar kapsamlı ve süreli; rolü sunucu belirliyor.

**AdminRoute: güvenlik değil, UX.** Rol bilgisi JWT'den ve `/auth/me`'den gelir; ikisi de
istemcide kurcalanabilir (DevTools'ta state'e `role: 'admin'` yazmak yeterli). O zaman
kullanıcı `/admin` iskeletini **görür** ama attığı her istek backend'de `requireAdmin`
tarafından **403** ile reddedilir. Gerçek sınır `router.use(requireAuth, requireAdmin)`.

**API katmanı:**

- Base URL `VITE_API_URL`'den. Vite yalnızca `VITE_` önekli değişkenleri istemciye açar —
  bu bir güvenlik özelliği; bundle'a giren her değişkenin **herkese açık** olduğu unutulmamalı.
- **Authorization interceptor'ı** — her çağrıda header'ı elle kurmak bir gün unutulurdu ve
  hata "401" değil "veri gelmedi" olarak görünürdü.
- **401 → otomatik logout**, ama `window.location.href` **kullanılmadı** (tam yenileme React
  ağacını baştan kurar, durumu ve geçmişi kaybeder). Interceptor callback çağırır
  (`setUnauthorizedHandler`), yönlendirmeyi `ProtectedRoute` yapar, adres `state.from` ile korunur.
- **`/auth/login` ve `/auth/register` muaf:** oradan gelen 401 "oturum düştü" değil "şifre
  hatalı" demek. Muaf tutulmasaydı yanlış şifre giren kullanıcı formda hata görmek yerine
  sessizce login'e yönlendirilir, yani hiçbir şey olmamış gibi görünürdü.

**`loading` durumu neden var:** `status` üç değerli (`loading | authenticated | anonymous`).
İki değerli olsaydı geçerli token'ı olan biri sayfayı yenilediğinde ilk render'da kullanıcı
henüz yüklenmediği için **login'e atılırdı**. Token'ın geçerliliğini istemci bilemez (imza
doğrulaması sunucuda), bu yüzden açılışta `/auth/me` çağrılır ve guard'lar cevap gelene
kadar karar vermez. Token hiç yoksa istek atılmaz.

**Tip tutarlılığı:** frontend tipleri backend'in **JSON çıktısını** tanımlar, DB satırını
değil. `Date` → `string` (ISO 8601), `NUMERIC` para → `string` (float ile para toplanmaz;
`Number(...)` yalnızca gösterim anında).

### Giriş/kayıt formları (2.2)

**İki katmanlı validasyon.** `utils/validation.ts` backend'in kurallarını tekrarlıyor —
amacı hız, otoritesi yok. Frontend kontrolü kaldırılsa arayüz yavaşlar, güvenlik aynı
kalır; backend kontrolü kaldırılsa veritabanı bozulur. Gerekçe ve kanıt testleri: `2.2.md`.

**Girişte yalnızca "boş mu" kontrolü var** (backend'in `validateLoginInput`'u da öyle).
Giriş yeni kayıt üretmez, var olanı eşleştirir — girişte bugünkü kuralı dayatmak, eski
kurallarla açılmış geçerli bir hesabı arayüzden erişilemez hâle getirirdi. İkinci sebep:
parola politikasını kimlik doğrulamadan önce söylememek.

**Çift gönderim koruması `useRef`, `useState` değil.** `disabled` bir sonraki render'da
uygulanır; iki hızlı tık aynı render döneminde iki submit üretebilir ve o anda `pending`
hâlâ `false` görünür. Ref senkron güncellenir. Önemi kayıtta somut: ikinci `POST
/auth/register` **409** alır ve kullanıcı başarıyla kayıt olduğu hâlde "bu e-posta zaten
kayıtlı" görür.

**Kayıt sonrası otomatik giriş.** Backend `/auth/register` cevabında zaten kullanılabilir
bir token dönüyor; login'e yönlendirmek onu çöpe atıp aynı bilgileri tekrar yazdırmak
olurdu. Login'e yönlendirme yalnızca e-posta doğrulaması olan akışlarda anlamlı — bu
projede o akış yok. Değiştirme sinyali: e-posta doğrulama eklendiği gün.

**Hata mesajı backend'den olduğu gibi geliyor** ("E-posta veya sifre hatali"), jenerik
metin yalnızca backend hiç mesaj döndürmediğinde. Frontend bu mesajı yorumlamıyor: 1.3'te
backend "kullanıcı yok" ile "şifre yanlış"ı bilerek ayırmıyor, frontend ayırsaydı ayrımı
arka kapıdan geri getirirdi. Ağ hatası ayrı ele alınıyor — kullanıcının yapacağı şey farklı.

### Gruplarım ekranı (2.3)

**Bakiye renklendirmesi: işaret yönü belirler, renk yalnızca onu tekrarlar.**
`> 0` yeşil "Sana borçlular", `< 0` kırmızı "Sen borçlusun", `= 0` nötr "Hesap kapalı".
İşaretin anlamı backend'den geliyor (`net = ödediği − payına düşen`, 1.6).

Karşılaştırma **kuruş üzerinden**: `Number("-0.004") < 0` true döner ve ekranda kırmızı bir
"0,00 ₺ borcun var" çıkardı — renk ile yazılan tutar çelişirdi. Kuruşa çevirmek ikisini aynı
kaynağa bağlıyor. Ayrıştırılamayan değer sessizce 0 sayılmıyor; bilinmeyen bakiye ile
dengede olan bakiye aynı şey değil.

**Renk tek başına bilgi taşımıyor** — her tonun metni her zaman yazılı, artı sol renk şeridi.
Kırmızı-yeşil en yaygın renk körlüğünün ayıramadığı ayrım; renk bilgiyi taşımıyor,
hızlandırıyor. Tutar işaretsiz gösteriliyor: yön zaten metinle söyleniyor.

**Durum yönetimi: kütüphane değil, `useAsync`.** React Query'nin asıl kazancı paylaşılan
sunucu durumu; şu an tek ekran ve iki uç nokta var. Ama "useState yeterli" demek de yanlış
olurdu — kütüphanesiz çözümün gerçek tuzağı **yarış koşulu**: `reload` iki kez çağrılırsa
hangi cevabın önce döneceği garanti değil ve eski cevap yeninin üzerine yazabilir, hiçbir
hata görünmeden. `useAsync` istek numarası tutarak bunu kapatıyor. Geçiş sinyali: aynı
veriyi iki ekran okumaya başlayınca (2.4 grup detayı).

**Bakiye kart başına ayrı istek.** Toplu uç nokta yok; sayfada toplansaydı liste en yavaş
bakiye kadar geç görünür, biri hata verse tüm ekran boş kalırdı. Kart başına bağımsız
istekte tek bir grubun hatası yalnızca o kartı etkiliyor.

**Dört durum ayrı:** iskelet / hata / boş / dolu. Boş ile hatayı aynı göstermek, sunucuya
ulaşılamadığında "gruplarım silinmiş" izlenimi verirdi.

### Görsel kimlik

Ayrıntı: [gorsel-kimlik.md](gorsel-kimlik.md). Üç karar özet:

**İki kanal kuralı** — sıcaklık (rose/blush/lilac) yalnızca etkileşimli öğelerde ve
dekoratif yüzeylerde; otorite (ink + Fraunces) yalnızca başlıklarda. `rose` bir başlık
rengi değil: olsaydı marka rengi "her yerde olan renk" olur ve *tıklanabilir olanı işaret
etme* gücünü kaybederdi.

**Yüzey ayrımı içeriğe göre** — `.card-glass` özet/durum yüzeyleri (grup kartı, bakiye
özeti), `.card-solid` işlem/veri yüzeyleri (formlar, modal, listeler). İmza parıltı
(`ShineBorder`) tek girişten dağıtılıyor (`GlassCard`); serbest bırakılsaydı her yerde
belirip imza olmaktan çıkardı. Blur mobilde kapalı — kart bir listede N kez tekrarlanıyor
ve `backdrop-filter` kaydırmayı takardı.

**Ölçülen kontrast:** rose/beyaz 7.14:1, ink/cream 15.92:1, sinyal renkleri 4.83–6.54:1 —
hepsi AA. **Bulgu: lilac beyaz üzerinde 2.37:1**, metin rengi olarak kullanılamaz; kodda
yalnızca dekoratif (gradyan durağı, grafik dolgusu) olarak geçiyor, ikincil metin için
`ink-muted` (6.49:1) var.

**Davet linki istemci origin'inden kuruluyor.** Backend'in `join_url`i `APP_URL`den
üretiliyor ve varsayılanı API adresi; oradaki `/groups/join/:code` bir POST uç noktası,
tarayıcıda 404 verir. Pano başarısız olabilir (izin/güvenli bağlam) — o durumda link
ekranda gösteriliyor, sessizce "kopyalandı" denmiyor.

---

## 10. Test stratejisi

**Varsayılan koşuda 229 test + gerçek backend'e karşı 20 test.**

| Dosya | Test | Yaklaşım |
| --- | --- | --- |
| `tests/netting.service.test.ts` | 23 | **mock yok** — saf modül |
| `tests/split.service.test.ts` | 28 | **mock yok** — saf modül |
| `tests/auth.test.ts` | 24 | `user.model` mock (bellek içi `Map`) + supertest |
| `tests/groups.test.ts` | 40 | `group.model` mock + supertest |
| `tests/settlements.test.ts` | 29 | group/expense/settlement model mock + supertest |
| `tests/admin.test.ts` | 29 | supertest + **kaynak taraması** |
| `web/src/routes.test.tsx` | 16 | ağ katmanı mock, geri kalan gerçek |
| `web/src/pages/auth.test.tsx` | 17 | ağ katmanı mock; validasyon/loading/çift submit |
| `web/src/pages/groups.test.tsx` | 23 | ağ katmanı mock; renklendirme/durumlar/modal/davet |
| `web/src/auth.integration.test.tsx` | 14 | **hiç mock yok — gerçek backend** (`npm run test:api`) |
| `web/src/groups.integration.test.tsx` | 6 | **hiç mock yok — gerçek backend** |

**Ortak desen:** yalnızca **veri katmanı** mock'lanır, yerine bellek içi tablolar konur.
Mock'lanmayan her şey gerçek kod: routing, `requireAuth`, validasyon, **tüm yetki
kontrolleri**, algoritmalar, hata yöneticisi. Böylece testler çalışan bir PostgreSQL
istemiyor ama asıl sınadıkları şey (erişim kararları) gerçek kod üzerinden geçiyor.

**Üç özel teknik:**

1. **Sabit başlangıçlı rastgele test (netting).** 300 senaryo (2–7 kişi) üretiliyor;
   her ikisinin geçerli çözüm verdiği ve `optimal ≤ greedy` olduğu doğrulanıyor.
   "Sabit başlangıç" kritik: aynı 300 senaryo her çalıştırmada **birebir** aynı — gerçekten
   rastgele olsa test bir gün geçer bir gün kalırdı, hata yeniden üretilemezdi.
   Ayrıca `expect(strictlyBetterCount).toBeGreaterThan(0)` — "hiç fark çıkmadı" gibi boş
   bir başarı mümkün değil.
2. **Kaba kuvvet taraması (split).** 1 kuruş–500 TL aralığı 7'şer kuruş adımlarla, her tutar
   1–12 kişiye bölünüyor: toplam korunuyor ve kimse 1 kuruştan fazla farklı ödemiyor.
3. **Kaynak taraması (admin).** Model mock'landığı için HTTP testleri **sorgunun kendisini
   kanıtlamaz.** Üç test `admin.model.ts` dosyasını okuyup (yorumları ayıklayarak)
   `expense`/`settlement` kelimelerinin geçmediğini ve istatistik bölümünde `groupBy`
   olmadığını doğruluyor. Testler kendi kendilerini de koruyor: taranan satır kümesi boş
   kalırsa (test yanıltıcı biçimde yeşil olacaksa) `expect` ile düşüyorlar.
4. **Arayüzü atlayan istekler (2.2).** Entegrasyon testlerinin bir bloğu React'i hiç
   kullanmadan doğrudan API'ye gidiyor — curl/DevTools ne yaparsa onu. Frontend
   validasyonu böylece atlanıyor ve backend'in yine de reddettiği gösteriliyor. Savunma
   derinliğini "iddia" olmaktan çıkarıp kanıta çeviren şey bu blok.

Entegrasyon testleri varsayılan `npm test`'e **karışmıyor** (ayrı config + ayrı komut):
backend kapalıyken frontend testlerinin de kırmızı yanması "kod mu bozuldu, sunucu mu
kapalı?" ayrımını kaybettirirdi. Ama sessizce de atlanmıyorlar — backend yoksa `beforeAll`
açık bir hatayla durup ne yapılması gerektiğini yazıyor.

Ayrıca 1.4, 1.7, 1.8 ve 2.1'de **canlı doğrulama** yapıldı: migration'lar `up`/`down`
çalıştırıldı, DB kısıtları gerçek PostgreSQL'de sınandı (ikinci owner reddedildi, `role='admin'`
`22P02` ile düştü), frontend gerçek backend'e karşı denendi.

---

## 11. Açık maddeler / teknik borç

Görevler arası devreden maddeler — hangisi hangi görevde açıldı:

| # | Madde | Açıldığı yer | Durum |
| --- | --- | --- | --- |
| 1 | **Devre dışı kullanıcının token'ı geçerli kalıyor.** Login engellenir, oturum engellenmez — 7 gün API kullanmaya devam eder | 1.3 kararı, 1.8'de somutlaştı | **Gerçek açık.** Çözüm: `requireAuth`'a istek başına `is_active` sorgusu (JWT'nin durumsuzluğunu harcar) ya da `token_version` kolonu |
| 2 | **Harcama uç noktaları için HTTP entegrasyon testi yok** (`split.service` birim testleri var) | 1.5 | 1.7 ve 1.8'de hâlâ açık |
| 3 | **Bakiyesi sıfır olmayan üye gruptan çıkarılabiliyor** | 1.4 | `balance.service` ile artık yazılabilir |
| 4 | **Bildirim yok** — alacaklı onay beklediğini ancak bakiye ekranına bakarak öğrenir | 1.7 | `users.fcm_token` hazır |
| 5 | **Borçlu kendi bekleyen kaydını iptal edemiyor** | 1.7 | `DELETE /settlements/:id` (yalnızca `pending` + `from_user`) doğal devamı |
| 6 | **Bekleyen kayıtlar için zaman aşımı yok** (otomatik onay/iptal) | 1.7 | job + "sessizlik onaydır" kabulü gerektiriyor |
| 7 | **Son admin kapatılabilir** (kendini kapatma engelli ama A→B, B→A mümkün) | 1.8 | — |
| 8 | **Admin işlemleri için audit log yok** | 1.8 | — |
| 9 | **`/auth/users` artık `/admin/users`'ın ikizi** | 1.8 | 1.3 testleri ona bağlı; silinince iki test taşınmalı |
| 10 | **Sahiplik devri uç noktası yok** | 1.4 | Şema hazır; `PATCH /groups/:id/owner` tek transaction'da |
| 11 | **Frontend tipleri elle senkron** — backend'de alan değişirse derleyici yakalamaz | 2.1 | paylaşılan tip paketi ya da OpenAPI üretimi |
| 12 | **`expiresIn` kullanılmıyor** — süre dolduğu ilk 401'de öğreniliyor | 2.1 | proaktif uyarı için işlenmeli |
| 13 | **Çıkış yalnızca istemcide** — sunucuda geçersizleşmiyor | 2.1 | #1 ile aynı kök |
| 14 | **Sayfalar iskelet** — `/groups`, `/groups/:id`, `/admin`, `/settings` veri çekmiyor | 2.1 | 2.2 login/register'ı tamamladı; kalanlar sonraki görevde |
| 15 | **Frontend lint/format ayrı** (backend ESLint+Prettier, web `oxlint`) | 2.1 | birleştirilebilir |
| 16 | **Kalıcı silme (KVKK/GDPR) uç noktası yok** | 1.4 | `deleted_at < now() - 90 days` temizleyen job olarak düşünüldü |
| 17 | **Giriş uç noktasında rate limiting yok** — çift submit koruması yalnızca *kazara* tekrarı engeller, kaba kuvveti değil | 2.2 | backend işi (`express-rate-limit`) |
| 18 | **"Şifremi unuttum" akışı yok** — backend'de de karşılığı yok | 2.2 | ayrı görev |
| 19 | **Şifre kuralı iki yerde elle senkron** (`utils/validation.ts` ↔ `auth.service.ts`) | 2.2 | sapma güvenlik açığı üretmez ama tutarsız mesaj üretebilir; #11 ile aynı kök |
| 20 | **`e2e-*` test kullanıcıları veritabanında birikiyor** | 2.2 | temizlik elle: `npm run db:reset` |
| 21 | **`/groups/join/:code` rotası frontend'de yok** — kopyalanan link 404 verir | 2.3 | sonraki görevin doğal parçası |
| 22 | **Backend `APP_URL` API adresini gösteriyor** — `join_url` bu yüzden kullanılamıyor | 2.3 | frontend origin'ine çekilirse elle link kurma kalkar |
| 23 | **Bakiye için toplu uç nokta yok** — N grup, N istek | 2.3 | `GET /groups?include=balance` benzeri |
| 24 | **Modal odak tuzağı (focus trap) yok** — Tab ile arkadaki sayfaya çıkılabiliyor | 2.3 | `inert` ya da odak tuzağı |

---

## 12. Mülakat: üç soruya kısa cevap

### "Veritabanı şeman neden bu şekilde kurulu?"

1. **Harcama ve pay ayrı tablolar, çünkü harcamalar eşit bölünmüyor.** 180 TL'lik pizzada
   Kerem yoktu → 3 kişiye bölündü. `expenses` içinde "kaç kişiye bölündü" kolonu olsaydı bu
   ifade edilemezdi. Bu tasarım eşit/elle/yüzde bölmenin hepsini aynı yapıyla destekliyor.
2. **Para `numeric(10,2)`, asla float değil.** `0.1 + 0.2 ≠ 0.3`; bir harcamada fark etmez,
   yüzlerce toplamada kuruşlar kaybolur ve nerede kaybolduğu bulunamaz. Aynı prensip kodda
   sürüyor: tüm hesap tam sayı kuruş üzerinde.
3. **Silme kuralları tek soruya göre verildi: "bu satır uçarsa para hesabı bozulur mu?"**
   Bozulmuyorsa CASCADE, bozuluyorsa RESTRICT. Bu yüzden kullanıcı da silinmiyor.

Ekle: kurallar koda değil **veritabanına** yazıldı (UNIQUE, ENUM, FK, CHECK) — kodda bir
kontrolü atlasam bile DB reddeder.

### "Netleştirme algoritman ne yapıyor, greedy'den farkı ne?"

Net bakiye = `ödediği − payına düşen`; sonra bu bakiyeler en az havaleyle kapatılıyor
(örnek veride 11 pay → 3 ödeme). Greedy her adımda en çok alacaklı ile en çok borçluyu
eşleştirir — hızlı ve **doğru**, ama her zaman **en az** sayıda ödemeyi bulmaz.

Somut fark: `Ali +10, Burak +8, Ceren −6, Deniz −4, Elif −8`. Bu küme
`{Ali, Ceren, Deniz}` ve `{Burak, Elif}` diye iki bağımsız sıfır-toplamlı gruba ayrılıyor,
en az ödeme `5 − 2 = 3`. Greedy ilk adımda Ali ile Elif'i eşleştiriyor — **farklı
gruplardan** — doğal bölünmeyi bozuyor, Ali'de 2.00 artık kalıyor, Deniz iki ayrı ödeme
yapmak zorunda kalıyor → 4 ödeme.

Tek cümlelik özet: **greedy lokal olarak en büyük tutarı kapatmaya çalışırken global grup
yapısını görmüyor.**

İkisi de kodda duruyor çünkü optimal her kombinasyonu denemek zorunda (`3ⁿ`): 14 kişide
milisaniyeler, 20 kişide hiç bitmiyor. Bilinen hızlı çözümü yok. Pratikte bir ev grubu 14
kişiyi geçmediği için hep optimal çalışıyor. Greedy'nin cevabı **yanlış değil**, sadece
daha uzun — testim ikisinin de geçerli olduğunu ayrı ayrı doğruluyor.

### "Bu projede en zor teknik karar neydi?"

**Hatalı veri karşısında ne yapılacağı.** Net bakiyeler sıfıra toplanmazsa ne olmalı?

Zor kısım: sorunun **iki farklı sebebi** var ve tepkileri **tam zıt** olmalı.

- **Yuvarlama** — 100 TL üçe bölününce 33.33+33.33+33.34 yazmak zorundasın. Kaçınılmaz,
  kişi başına en fazla 1 kuruş. Burada hata vermek uygulamayı kullanılamaz yapar.
- **Gerçek hesap hatası** — çağıran taraf bir harcamayı eksik saymış. Burada sessiz kalmak
  muhasebeyi bozar, hem de kimsenin fark etmeyeceği şekilde.

**Karar: eşik koydum.** `tolerance = kişi sayısı` kuruş. İçindeyse yuvarlamadır → artığı
en büyük bakiyeye yediriyorum (göreli hatası orada en küçük). Dışındaysa hesap hatasıdır →
sapma miktarını söyleyen açık bir hata fırlatıyorum.

**Prensip:** muhasebe uygulamasında "biraz yanlış cevap" en kötü sonuçtur. Yüksek sesle
hata vermek, sessizce yanlış olmaktan her zaman iyidir. Aynı prensibi başka yerlerde de
uyguladım (bilinmeyen harcamaya bağlı pay, tekrar eden `userId`, iki ondalıktan fazla
tutar) — her biri için ayrı test var.

**Alternatif cevap (mimari):** netleştirmeyi hiçbir şeye bağlamamak. Kolay yol algoritmayı
DB sorgusunun yanına yazmaktı; o zaman test için sahte DB kurmam ve algoritma yerine
altyapıyı doğrulamam gerekirdi. Bedeli: veriyi fonksiyona göre şekillendiren bir ara katman.
Karşılığı: 1.5 saniyede çalışan 23 test, tek mock yok, 300 senaryoluk rastgele test.

> "Zor bir şey yoktu" en kötü cevap. Her teknik kararın bedeli var; bedeli olmayan karar
> zaten karar değildir. İyi cevap **"şunu kazandım, karşılığında şunu ödedim"** yapısındadır.

---

## Doğrulama komutları

```bash
npm test                  # backend testleri
npm test -- --verbose     # test adlarıyla
npm run typecheck         # src + tests + knexfile
npm run lint
npm run migrate && npm run seed

cd web && npm test         # frontend testleri (backend gerekmez)
cd web && npm run test:api # gercek backend'e karsi (backend ayakta olmali)
cd web && npm run build
```
