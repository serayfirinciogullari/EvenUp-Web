# EvenUp — Backend

Gider/borc takip uygulamasinin REST API iskeleti.
Node.js + Express + TypeScript + Knex + PostgreSQL.

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
| `expense_shares.expense_id`     | CASCADE  | Pay, harcamanin parcasi (kompozisyon)               |
| `expense_shares.user_id`        | RESTRICT | "Kim ne kadar borclu" kaydi kaybolmamali            |
| `settlements.group_id`          | CASCADE  | Odeme kaydi grup baglaminda anlamli                 |
| `settlements.from_user/to_user` | RESTRICT | Odemenin iki tarafi da kanitin parcasi              |

Kullanicilar silinmek yerine `is_active = false` ile pasiflestirilir.

**Gruplar da silinmek yerine `deleted_at` ile isaretlenir** (soft delete). Yukaridaki
CASCADE zinciri tam da bu yuzden bir API ucu olarak acilmadi: `DELETE FROM groups`
calissaydi tek istek grubun tum harcama ve odeme gecmisini geri donusu olmadan silerdi.
Gerekce `docs/decisions/1.4.md` icinde.

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
tipler bunu `Decimal = string` olarak yansitir. Float'a cevirmeyin.

### Seed verisi

1 admin + 3 kullanici, 1 grup (`Ev Arkadaslari`), 4 uyelik (admin `owner`, digerleri
`member`), 3 harcama ve 11 pay. Tum seed kullanicilarinin sifresi `Password123!`
(bcrypt ile hashlenir). ID'ler sabit UUID oldugundan seed tekrar calistirilabilir.

## Endpoint'ler

| Method | Path              | Koruma                         | Yanit                                         |
| ------ | ----------------- | ------------------------------ | --------------------------------------------- |
| GET    | `/health`         | yok                            | `{ "status": "ok" }`                          |
| GET    | `/health/details` | yok                            | env, uptime, timestamp, database durumu       |
| POST   | `/auth/register`  | yok                            | 201 `{ user, token, expiresIn }`              |
| POST   | `/auth/login`     | yok                            | 200 `{ user, token, expiresIn }`              |
| GET    | `/auth/me`        | `requireAuth`                  | 200 `{ user }`                                |
| GET    | `/auth/users`     | `requireAuth` + `requireAdmin` | 200 `{ users }`                               |
| \*     | diger hepsi       | —                              | `404` — merkezi error handler formatinda JSON |

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

## Klasor yapisi

```
knexfile.ts                          # knex CLI giris noktasi (config/database.ts'i re-export eder)
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
│   │   └── 09_group_invites.ts       # davet kodlari
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
│   └── group.routes.ts              # requireAuth router seviyesinde takili
├── controllers/
│   ├── health.controller.ts         # req/res isleme, servis cagirma
│   ├── auth.controller.ts
│   └── group.controller.ts          # yetki karari yok, servise devreder
├── services/
│   ├── health.service.ts            # is mantigi (HTTP'den bagimsiz)
│   ├── auth.service.ts
│   ├── group.service.ts             # tum grup yetki kararlari burada
│   └── netting.service.ts           # borc netlestirme (saf, I/O yok)
├── models/                          # veri erisim katmani (repository'ler)
│   ├── user.model.ts
│   └── group.model.ts
├── middlewares/
│   ├── auth.middleware.ts           # requireAuth, requireAdmin
│   ├── errorHandler.middleware.ts   # merkezi hata yonetimi
│   └── notFound.middleware.ts       # 404
└── utils/
    ├── ApiError.ts                  # HTTP hata sinifi
    ├── asyncHandler.ts              # async controller sarmalayici
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
