# EvenUp — Backend

Gider/borc takip uygulamasinin REST API iskeleti.
Node.js + Express + TypeScript + Knex + PostgreSQL.

> **Frontend `web/` altinda** ayri bir Vite + React + TypeScript projesidir; kendi
> `package.json`'i ve README'si vardir (`web/README.md`). Bu dosya backend'i anlatir.
>
> ```bash
> npm run dev            # backend  -> http://localhost:3000
> cd web && npm run dev  # frontend -> http://localhost:5173
> ```

## Kurulum

```bash
npm install
cp .env.example .env    # Windows: copy .env.example .env
npm run migrate         # semayi kur
npm run seed            # ornek veri (opsiyonel)
npm run dev
```

Server varsayilan olarak `http://localhost:3000` uzerinde ayaga kalkar.

Production icin once derleyin:

```bash
npm run build
npm start
```

## Scriptler

| Komut                  | Aciklama                                 |
| ---------------------- | ---------------------------------------- |
| `npm run dev`          | tsx ile watch modunda calis (derlemesiz) |
| `npm run build`        | TypeScript'i `dist/` altina derle        |
| `npm start`            | derlenmis `dist/server.js`'i calistir    |
| `npm run typecheck`    | tip kontrolu (cikti uretmeden)           |
| `npm run lint`         | ESLint kontrolu                          |
| `npm run lint:fix`     | ESLint otomatik duzeltme                 |
| `npm run format`       | Prettier ile formatla                    |
| `npm run format:check` | Format kontrolu                          |

### Veritabani scriptleri

| Komut                       | Aciklama                                          |
| --------------------------- | ------------------------------------------------- |
| `npm run migrate`           | bekleyen migration'lari calistir                  |
| `npm run migrate:rollback`  | son batch'i geri al                               |
| `npm run migrate:status`    | hangi migration'lar calismis                      |
| `npm run migrate:make <ad>` | yeni `.ts` migration dosyasi olustur (\*)         |
| `npm run seed`              | seed dosyalarini calistir                         |
| `npm run seed:make <ad>`    | yeni `.ts` seed dosyasi olustur                   |
| `npm run db:reset`          | tum migration'lari geri al + tekrar kur + seed'le |

(\*) `migrate:make` knex'in kendi formatinda uzun timestamp'li bir dosya uretir.
Olusturduktan sonra siradaki numaraya gore yeniden adlandirin: `07_<tablo>.ts`.
Migration henuz calismadigi icin bu yeniden adlandirma guvenlidir.

> **Dikkat:** calismis bir migration dosyasinin adini degistirmeyin. Knex calistirdigi
> dosya adlarini `knex_migrations` tablosunda tutar; ad degisirse "migration directory
> is corrupt" hatasi verir. Zorunluysa once `npm run migrate:rollback:all` calistirin.

## Veritabani

PostgreSQL + Knex. Migration ve seed dosyalari TypeScript'tir; knex CLI bunlari
`ts-node` uzerinden dogrudan calistirir (ayri bir derleme adimi gerekmez).

```bash
createdb evenup          # veya: psql -c "CREATE DATABASE evenup"
npm run migrate
npm run seed
```

`knexfile.ts` kok dizinde durur ama asil konfigurasyon `src/config/database.ts`
icindedir. Dizin yollari `__dirname`'e gore cozuldugu icin ayni config hem
kaynaktan (`src/db/migrations/*.ts`) hem derlenmis koddan (`dist/db/migrations/*.js`)
calisir — uretimde `npm run build` sonrasi `npm run migrate` yeterlidir.

### Tablolar

`users`, `groups`, `group_members`, `group_invites`, `expenses`, `expense_shares`,
`settlements`. Tum PK'lar `uuid` ve `gen_random_uuid()` ile DB tarafinda uretilir (pgcrypto).

Iki kural kismi unique index ile DB seviyesinde zorunlu:

| Index                                | Kural                                        |
| ------------------------------------ | -------------------------------------------- |
| `group_members_single_owner_unique`  | Bir grubun en fazla bir `owner`'i olur       |
| `group_invites_single_active_unique` | Bir grubun en fazla bir **aktif** daveti olur |
| `settlements_single_pending_unique`  | Ayni (borclu -> alacakli) cifti icin ayni anda en fazla bir **bekleyen** odeme olur |

`group_members.role` (`owner`/`member`) grup **ici** roldur; `users.role`
(`admin`/`user`) uygulama rolu. Bir kullanici A grubunda owner, B grubunda member olabilir.

### Silme kurallari (CASCADE / RESTRICT)

Kural: **iliski satirlari** CASCADE, **finansal kayitlar** RESTRICT.

| FK                              | Kural    | Gerekce                                             |
| ------------------------------- | -------- | --------------------------------------------------- |
| `groups.created_by`             | RESTRICT | Grubu kuran silinince tum grup gecmisi ucmamali     |
| `group_members.group_id`        | CASCADE  | Uyelik grupsuz anlamsiz, veri tasimayan join satiri |
| `group_members.user_id`         | CASCADE  | Ayni gerekce                                        |
| `group_invites.group_id`        | CASCADE  | Davet kodu grupsuz anlamsiz, finansal veri tasimaz  |
| `group_invites.created_by`      | CASCADE  | Ayni gerekce: davet bir iliski verisi, kanit degil  |
| `expenses.group_id`             | CASCADE  | Harcama grubun yasam dongusune bagli                |
| `expenses.paid_by`              | RESTRICT | Odeyen silinirse bakiye hesabi sessizce bozulur     |
| `expenses.created_by`           | RESTRICT | Harcamayi giren kisi de kaydin bir parcasi          |
| `expense_shares.expense_id`     | CASCADE  | Pay, harcamanin parcasi (kompozisyon)               |
| `expense_shares.user_id`        | RESTRICT | "Kim ne kadar borclu" kaydi kaybolmamali            |
| `settlements.group_id`          | CASCADE  | Odeme kaydi grup baglaminda anlamli                 |
| `settlements.from_user/to_user` | RESTRICT | Odemenin iki tarafi da kanitin parcasi              |

Kullanicilar silinmek yerine `is_active = false` ile pasiflestirilir.

**Gruplar da silinmek yerine `deleted_at` ile isaretlenir** (soft delete). Yukaridaki
CASCADE zinciri tam da bu yuzden bir API ucu olarak acilmadi: `DELETE FROM groups`
calissaydi tek istek grubun tum harcama ve odeme gecmisini geri donusu olmadan silerdi.
Gerekce `docs/decisions/1.4.md` icinde.

**Harcamalar icin de ayni kural**: `expenses.deleted_at` doldurulur, `expense_shares`
satirlarina dokunulmaz. Paylar yalnizca canli harcama uzerinden okundugu icin silinmis
harcama hicbir sorguda ve hicbir bakiye hesabinda gorunmez; yanlislikla silineni geri
almak tek `UPDATE`. Gerekce `docs/decisions/1.5.md` icinde.

### Tip guvenli sorgular

Tablo tipleri `src/types/models.ts` icinde; ayni dosya `knex/types/tables`
augmentation'i ile tablo adi -> tip eslemesini de yapar.

```ts
import db from './db/connection';
import type { UserRow } from './types/models';

// acik generic
const users = await db<UserRow>('users').where({ is_active: true });

// generic yazmadan da ayni tip cikar
const user = await db('users').where({ email }).first(); // UserRow | undefined
```

`NUMERIC` kolonlari (`amount`, `share_amount`) pg surucusunden **string** doner;
tipler bunu `Decimal = string` olarak yansitir. Float'a cevirmeyin: para hesaplari
tam sayi kurus uzerinden yapilir ve TL <-> kurus cevrimi yalnizca `src/utils/money.ts`
icinde olur (`parseAmountToCents` / `formatCents`). Gerekce `docs/decisions/1.5.md`.

### Seed verisi

1 admin + 3 kullanici, 1 grup (`Ev Arkadaslari`), 4 uyelik (admin `owner`, digerleri
`member`), 3 harcama ve 11 pay. Tum seed kullanicilarinin sifresi `Password123!`
(bcrypt ile hashlenir). ID'ler sabit UUID oldugundan seed tekrar calistirilabilir.

Ucuncu harcamada `paid_by` ve `created_by` bilerek farkli ("Ece odedi, girisi admin
yapti"): duzenleme yetkisinin odeyene degil **girene** baktigi seed verisinde de gorunur.

## Endpoint'ler

| Method | Path              | Koruma                         | Yanit                                         |
| ------ | ----------------- | ------------------------------ | --------------------------------------------- |
| GET    | `/health`         | yok                            | `{ "status": "ok" }`                          |
| GET    | `/health/details` | yok                            | env, uptime, timestamp, database durumu       |
| POST   | `/auth/register`  | yok                            | 201 `{ user, token, expiresIn }`              |
| POST   | `/auth/login`     | yok                            | 200 `{ user, token, expiresIn }`              |
| GET    | `/auth/me`        | `requireAuth`                  | 200 `{ user }`                                |
| GET    | `/auth/users`     | `requireAuth` + `requireAdmin` | 200 `{ users }` (\*)                          |
| \*     | diger hepsi       | —                              | `404` — merkezi error handler formatinda JSON |

(\*) `/auth/users` yerini 1.8'deki `/admin/users`'a birakti (arama + filtre + sayfalama
ile). Geriye donuk uyumluluk icin duruyor; bir sonraki adimda kaldirilacak.

### Kendi hesabin

Ikisi de `requireAuth` arkasinda. Hedef kullanici **token'dan** okunur; adreste ya da
govdede kullanici ID'si yoktur, dolayisiyla baskasinin kaydina dokunmak ifade edilemez.

| Method | Path                     | Koruma        | Yanit             |
| ------ | ------------------------ | ------------- | ----------------- |
| PUT    | `/users/me`              | `requireAuth` | 200 `{ user }`    |
| PUT    | `/users/me/password`     | `requireAuth` | 200 `{ message }` |

- `PUT /users/me` yalnizca **`name`** alanini gunceller. Govdeye yazilan `role`,
  `is_active`, `email` ve `id` yok sayilir (servis yalnizca `name` cikarir, model
  sabit kolon yazar).
- `PUT /users/me/password` **mevcut sifreyi** de ister; yanlissa **400** doner
  (401 degil — istek kimlik dogrulamasindan gecti, basarisiz olan govdedeki bir alan;
  ayrica 401 frontend'de oturumu dusururdu). Hata `details.currentPassword` alaninda
  gelir.

Ikisi de **2.6'da, Hafta 1'e geriye donuk** eklendi: 1.3-1.8 arasinda profil guncelleme
ucu tanimlanmamisti. Gerekceler `docs/decisions/2.6.md` ve `docs/decisions/1.3.md`.

### Gruplar

Tumu `requireAuth` arkasinda (router seviyesinde takili).

| Method | Path                              | Ek yetki | Yanit                                 |
| ------ | --------------------------------- | -------- | ------------------------------------- |
| POST   | `/groups`                         | —        | 201 `{ group }`, kurucu = `owner`     |
| GET    | `/groups`                         | —        | 200 `{ groups }` (yalnizca uye olunan)|
| GET    | `/groups/:id`                     | uyelik   | 200 `{ group, role, members }` \| 403 |
| POST   | `/groups/:id/invite`              | owner    | 201 yeni kod \| 200 mevcut kod        |
| POST   | `/groups/join/:inviteCode`        | —        | 200 `{ group, already_member }` \| 404|
| DELETE | `/groups/:id/members/:userId`     | owner    | 200 `{ removed_user_id }`             |
| DELETE | `/groups/:id`                     | owner    | 200 `{ group }` (soft delete)         |

Uc davranis karari (detay: `docs/decisions/1.4.md`):

- **Davet kodu** `crypto.randomBytes(16)` -> base64url (22 karakter, 128 bit).
  Varsayilan cok kullanimlik ve 7 gun gecerli; `{ "maxUses": 1 }` ile tek kullanimlik,
  `{ "rotate": true }` ile eski kod iptal edilip yenisi uretilir. Grup basina en fazla
  bir aktif davet olur (DB'de kismi unique index).
- **Grup silme soft delete**: `groups.deleted_at` doldurulur, expenses/settlements
  satirlarina dokunulmaz. Hard DELETE olsaydi CASCADE zinciri tum finansal gecmisi
  geri donusu olmadan silerdi.
- **IDOR korumasi**: "grup yok", "uye degilsin", "grup silinmis" ve "ID bicimsiz"
  ayni 403'u ve ayni mesaji doner — aksi halde uc nokta hangi gruplarin var oldugunu
  sizdiran bir oracle olurdu.

### Harcamalar

Tumu `requireAuth` arkasinda; hepsi ayrica grup **uyeligi** ister.

| Method | Path                        | Ek yetki            | Yanit                          |
| ------ | --------------------------- | ------------------- | ------------------------------ |
| POST   | `/groups/:id/expenses`      | uyelik              | 201 `{ expense }`              |
| GET    | `/groups/:id/expenses`      | uyelik              | 200 `{ expenses, pagination }` |
| GET    | `/expenses/:id`             | uyelik              | 200 `{ expense }`              |
| PUT    | `/expenses/:id`             | ekleyen ya da owner | 200 `{ expense }`              |
| DELETE | `/expenses/:id`             | ekleyen ya da owner | 200 `{ expense }` (soft delete)|

Liste ve olusturma grup baglaminda anlamli oldugu icin `/groups/:id/...` altinda; tek bir
harcama uzerindeki islemler `/expenses/:id` altinda. `/groups/:id/expenses/:expenseId`
secilmedi — iki ID'nin tutarliligini her istekte ayrica dogrulamak gerekirdi.

Liste sayfalanmis: `?page=1&limit=20` (varsayilan 20, ust sinir 100), siralama
`created_at DESC, id DESC`.

Ornek istek (esit bolusme, katilimci verilmezse tum gruba bolunur):

```jsonc
POST /groups/:id/expenses
{
  "description": "Haftalik market",
  "amount": "300.00",       // en fazla iki ondalik
  "category": "market",     // opsiyonel, varsayilan "genel"
  "paidBy": "<uuid>",       // opsiyonel, varsayilan istegi yapan kisi
  "splitType": "equal",     // equal | exact | percentage
  "splitDetails": { "participants": ["<uuid>", "<uuid>"] }
}
```

`splitDetails` bicimi bolusme tipine gore degisir:

| `splitType`  | `splitDetails`                                          |
| ------------ | ------------------------------------------------------- |
| `equal`      | `{ participants: [uuid, ...] }` — verilmezse tum uyeler  |
| `exact`      | `{ shares: [{ userId, amount: "33.34" }] }`             |
| `percentage` | `{ shares: [{ userId, percentage: 33.34 }] }`           |

Bes davranis karari (detay: `docs/decisions/1.5.md`):

- **Para tam sayi kurus uzerinden hesaplanir.** Tutarlarda en fazla iki ondalik kabul
  edilir; `12.345` ya da float artigi tasiyan bir deger sessizce yuvarlanmaz, 400 doner.
  Yuzdeler de baz puana cevrilir (33.33% -> 3333), boylece "toplam tam %100 mu" sorusu
  tam sayi karsilastirmasiyla yanitlanir.
- **Paylarin toplami her zaman harcama tutarina esittir.** Kurus artigi "en buyuk artik"
  yontemiyle dagitilir: `100.00 / 3` -> `33.34 + 33.33 + 33.33`. Kimse digerinden 1
  kurustan fazla farkli odemez ve sonuc katilimci sirasindan bagimsizdir.
- **Duzenleme/silme yetkisi ekleyene ya da grup sahibine ait.** Bu yuzden `expenses`
  tablosunda odeyenden (`paid_by`) ayri bir `created_by` kolonu var.
- **Tutar ve bolusme birlikte guncellenir.** `amount`, `splitType` veya `splitDetails`
  alanlarindan biri gonderildiginde `amount` ve `splitType` zorunlu olur; yoksa paylar
  eski tutara gore kalir ve toplam esitligi sessizce bozulurdu.
- **IDOR korumasi gruplardaki ile ayni**: "harcama yok", "silinmis", "ID bicimsiz" ve
  "gruba uye degilsin" ayni 403'u doner. Yalnizca "uyesin ama duzenleyemezsin" durumu
  ayri mesaj alir — o kullanici harcamayi zaten gorebiliyor, sizacak bilgi yok.

### Odemeler ve bakiye

Tumu `requireAuth` arkasinda; hepsi ayrica grup **uyeligi** ister.

| Method | Path                           | Ek yetki              | Yanit                               |
| ------ | ------------------------------ | --------------------- | ----------------------------------- |
| POST   | `/groups/:id/settlements`      | borclu = istek sahibi | 201 `{ settlement }` (`pending`)    |
| PUT    | `/settlements/:id/confirm`     | alacakli              | 200 `{ settlement }` (`confirmed`)  |
| PUT    | `/settlements/:id/reject`      | alacakli              | 200 `{ settlement }` (`rejected`)   |
| GET    | `/groups/:id/balances`         | uyelik                | 200 `{ balances, transfers, meta }` |

Odeme kaydinin **iki ayri sahibi** var: kaydi yalnizca borclu acar, yalnizca alacakli
sonuclandirir. Borclu kendi kaydini onaylayamaz.

```jsonc
POST /groups/:id/settlements
{
  "toUserId": "<uuid>",   // odemeyi alan; grup uyesi olmali
  "amount": "100.00",     // en fazla iki ondalik, > 0
  "fromUserId": "<uuid>"  // opsiyonel; verilirse istek sahibiyle ayni olmali
}
```

`GET /groups/:id/balances` cevabi:

```jsonc
{
  "balances": [{ "user_id": "…", "name": "Ali", "net_balance": "200.00" }],
  "transfers": [{ "from_user": "…", "to_user": "…", "amount": "100.00" }],
  "meta": {
    "expense_count": 3,
    "confirmed_settlement_count": 1,
    "pending_settlement_count": 2,   // bakiyeye DAHIL DEGIL
    "rejected_settlement_count": 0,
    "algorithm": "optimal"           // optimal | greedy
  }
}
```

Dort davranis karari (detay: `docs/decisions/1.7.md`):

- **Iki tarafli onay.** Para hareketi uygulamanin disinda gerceklestigi icin "odedim"
  bir kanit degil iddiadir; bakiyeyi degistirmesi icin parayi ALAN tarafin onaylamasi
  gerekir. Tek tarafli bildirimde yanlis ya da kotu niyetli tek bir tik, alacaklinin
  alacagini sessizce sifirlardi.
- **`pending` bakiyeyi ETKILEMEZ.** Bu filtre tek bir sorguda (`listConfirmed`) uygulanir;
  bakiye servisi onaylanmamis bir kaydi gorebilecegi baska bir kapiya sahip degil.
  Bekleyenler yalnizca `meta.pending_settlement_count` icinde sayi olarak gorunur.
- **Onaylanmis odeme = sanal harcama.** Netlestirmeye ayri bir aritmetik yazilmadi:
  "A odedi, tamami B'nin payi" harcamasi ile ayni sey oldugu icin odemeler dogrudan
  1.6'daki `calculateNetBalances`'a beslenir. Para hesabi tek modulde kalir.
- **Red bir durumdur, silme degil.** Reddedilen kayit `rejected` olarak durur; "odedim
  dedi / almadim dedi" anlasmazligi grubun gecmisinin parcasi.

### Admin

Tumu `requireAuth` + `requireAdmin` arkasinda (router seviyesinde, bu sirayla).

| Method | Path                          | Yanit                                            |
| ------ | ----------------------------- | ------------------------------------------------ |
| GET    | `/admin/users`                | 200 `{ users, pagination }`                      |
| PUT    | `/admin/users/:id/disable`    | 200 `{ user, changed }`                          |
| PUT    | `/admin/users/:id/enable`     | 200 `{ user, changed }`                          |
| GET    | `/admin/groups`               | 200 `{ groups, pagination }` — **yalnizca ust veri** |
| GET    | `/admin/stats`               | 200 toplamlar + 7/30 gun trendi                  |

`/admin/users` filtreleri: `?search=` (e-posta veya isim), `?status=active|inactive`,
`?role=admin|user`, `?page=&limit=` (varsayilan 20, ust sinir 100).

**GIZLILIK SINIRI — admin harcama/grup icerigine mudahale etmez.** Bu karar
**sorgu seviyesinde** uygulanir, response kirpilarak degil:

- `/admin/groups` her grup icin **tam olarak** `id`, `name`, `created_at`, `member_count`
  doner. Sorgu yalnizca `groups` + `group_members` tablolarina dokunur; `expenses` ve
  `expense_shares` o sorguda **hic gecmez**. Grup aciklamasi ve uye kimlikleri de donmez.
- `/admin/stats` `expenses` tablosunu yalnizca `COUNT`/`SUM` icin okur ve tek satirlik
  toplam uretir. `GROUP BY group_id` bilincli olarak yok: grup basina hacim, "hangi ev ne
  kadar harciyor" demek olurdu.
- `admin.service` icinde `expense.model` ve `settlement.model` **import bile edilmemistir**.

Gerekce ve "sorgu seviyesi vs. serialization seviyesi" karsilastirmasi:
`docs/decisions/1.8.md`.

`is_active` icin yeni migration gerekmedi: kolon 1.2'de (`01_users.ts`), login'deki
kontrol 1.3'te (`auth.service.ts`) zaten vardi. Pasif kullanici login olamaz ve
"kullanici yok" ile ayni mesaji alir.

> **Bilinen acik:** devre disi birakma **login'i** engeller, mevcut **token'i**
> gecersizlestirmez — JWT geri alinamaz (1.3 karari). Kapatilan kullanici elindeki
> token'la `JWT_EXPIRES_IN` suresi boyunca API'yi kullanmaya devam eder.

## Klasor yapisi

```
knexfile.ts                          # knex CLI giris noktasi (config/database.ts'i re-export eder)
web/                                 # frontend (Vite + React + TS) — bkz. web/README.md
src/
├── app.ts                           # Express app: middleware + route + error handler zinciri
├── server.ts                        # listen + graceful shutdown
├── config/
│   ├── env.ts                       # .env okuma, uygulama ayarlari
│   └── database.ts                  # knex konfigurasyonu (development / production)
├── db/
│   ├── connection.ts                # tekil Knex ornegi (connection pool)
│   ├── migrations/
│   │   ├── 00_extensions.ts         # pgcrypto (gen_random_uuid)
│   │   ├── 01_users.ts
│   │   ├── 02_groups.ts
│   │   ├── 03_group_members.ts
│   │   ├── 04_expenses.ts
│   │   ├── 05_expense_shares.ts
│   │   ├── 06_settlements.ts
│   │   ├── 07_groups_description_and_soft_delete.ts
│   │   ├── 08_group_member_roles.ts  # grup ici rol + tek owner kurali
│   │   ├── 09_group_invites.ts       # davet kodlari
│   │   ├── 10_expenses_split_and_soft_delete.ts  # split_type, created_by, soft delete
│   │   └── 11_settlements_reject_flow.ts         # rejected durumu, tek bekleyen kayit kurali
│   └── seeds/
│       └── 01_demo_data.ts          # ornek kullanici / grup / harcama verisi
├── types/
│   ├── models.ts                    # tablo satir tipleri + knex tablo eslemesi
│   ├── auth.ts                      # JWT payload tipleri
│   └── express.d.ts                 # req.user tip genisletmesi
├── routes/
│   ├── index.ts                     # kok router, modul route'larini baglar
│   ├── health.routes.ts
│   ├── auth.routes.ts
│   ├── user.routes.ts               # /users/me — kendi profilini guncelle (2.6)
│   ├── group.routes.ts              # requireAuth router seviyesinde takili
│   ├── expense.routes.ts            # /expenses/:id islemleri
│   ├── settlement.routes.ts         # /settlements/:id onay & red
│   └── admin.routes.ts              # requireAuth + requireAdmin router seviyesinde
├── controllers/
│   ├── health.controller.ts         # req/res isleme, servis cagirma
│   ├── auth.controller.ts
│   ├── user.controller.ts           # hedef kullanici her zaman token'in sahibi
│   ├── group.controller.ts          # yetki karari yok, servise devreder
│   ├── expense.controller.ts
│   ├── settlement.controller.ts     # odeme + bakiye uc noktalari
│   └── admin.controller.ts
├── services/
│   ├── health.service.ts            # is mantigi (HTTP'den bagimsiz)
│   ├── auth.service.ts
│   ├── group.service.ts             # tum grup yetki kararlari burada
│   ├── expense.service.ts           # harcama validasyonu + yetki kararlari
│   ├── split.service.ts             # bolusme algoritmalari (saf, I/O yok)
│   ├── settlement.service.ts        # odeme akisi: borclu acar, alacakli onaylar
│   ├── balance.service.ts           # harcama + onayli odeme -> netlestirme
│   ├── netting.service.ts           # borc netlestirme (saf, I/O yok)
│   └── admin.service.ts             # harcama servislerine BAGLANMAZ (gizlilik siniri)
├── models/                          # veri erisim katmani (repository'ler)
│   ├── user.model.ts
│   ├── group.model.ts
│   ├── expense.model.ts             # harcama + paylar tek transaction
│   ├── settlement.model.ts          # yalnizca confirmed kayitlar bakiyeye girer
│   └── admin.model.ts               # yalnizca ust veri / COUNT / SUM sorgulari
├── middlewares/
│   ├── auth.middleware.ts           # requireAuth, requireAdmin
│   ├── errorHandler.middleware.ts   # merkezi hata yonetimi
│   └── notFound.middleware.ts       # 404
└── utils/
    ├── ApiError.ts                  # HTTP hata sinifi
    ├── asyncHandler.ts              # async controller sarmalayici
    ├── money.ts                     # TL <-> kurus cevriminin tek kapisi
    ├── pagination.ts                # sayfalama dogrulamasinin tek kapisi
    ├── uuid.ts                      # UUID bicim kontrolu
    └── logger.ts
```

### Isimlendirme kurallari

- **Migration'lar**: `NN_<tablo_adi>.ts` — iki haneli sira + tablo adi. Knex dosyalari
  alfabetik siraya gore calistirdigi icin onek zorunlu; FK bagimliliklari bu sirayi
  belirler (`users` once, `settlements` en son).
- **Katman dosyalari**: `<konu>.<katman>.ts` — `health.controller.ts`,
  `errorHandler.middleware.ts`. Dosya adina bakinca hangi katmana ait oldugu bellidir.
- **Siniflar**: dosya adi sinif adiyla ayni (`ApiError.ts`).
- `index.ts` sadece barrel/kok router icin kullanilir; konfigurasyon gibi icerigi olan
  dosyalar acik isim alir (`config/env.ts`, `config/database.ts`).

`dist/` derleme ciktisidir, git'e girmez.

## Yeni bir modul eklerken

1. `src/models/x.model.ts` — veri erisimi
2. `src/services/x.service.ts` — is mantigi (girdi/cikti tipleri `export` edilir)
3. `src/controllers/x.controller.ts` — `asyncHandler` ile sarilir
4. `src/routes/x.routes.ts` — router tanimi
5. `src/routes/index.ts` icinde `router.use('/x', xRoutes)`

Hata firlatmak icin `ApiError` kullanin; merkezi error handler yakalar:

```ts
import ApiError from '../utils/ApiError';

throw ApiError.notFound('Grup bulunamadi');
```

## TypeScript notlari

- `tsconfig.json` `strict: true` ile calisir; modul cikti formati CommonJS.
- Sadece tip iceren import'lar `import type { ... } from 'express'` seklinde yazilir
  (ESLint `consistent-type-imports` kurali bunu zorunlu kilar).
- Express tipleri `@types/express` v4'ten gelir — Express 4 kullanildigi icin v5'e yukseltmeyin.

## Ortam degiskenleri

`.env.example` dosyasina bakin: `NODE_ENV`, `PORT`, `APP_URL`, `LOG_LEVEL`,
`DATABASE_URL`, `DATABASE_SSL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `BCRYPT_SALT_ROUNDS`.

`APP_URL` davet linklerinin kokudur; verilmezse `http://localhost:$PORT` kullanilir.
Uretimde gercek alan adi yazilmali, yoksa paylasilan davet linki localhost'u gosterir.
