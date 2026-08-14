# EvenUp — Web

Vite + React + TypeScript arayuzu. Backend kok dizinde (`../src`).

## Kurulum

```bash
cd web
npm install
cp .env.example .env    # Windows: copy .env.example .env
npm run dev
```

Vite varsayilan olarak `http://localhost:5173` uzerinde acilir. Backend'in ayri bir
terminalde calisiyor olmasi gerekir (kok dizinde `npm run dev`, port 3000).

## Scriptler

| Komut                | Aciklama                          |
| -------------------- | --------------------------------- |
| `npm run dev`        | gelistirme sunucusu (HMR)         |
| `npm run build`      | tip kontrolu + production derleme |
| `npm run preview`    | derlenmis ciktiyi servis et       |
| `npm run lint`       | oxlint                            |
| `npm test`           | vitest (tek sefer)                |
| `npm run test:watch` | vitest izleme modunda             |

## Ortam degiskenleri

| Degisken       | Varsayilan              | Aciklama          |
| -------------- | ----------------------- | ----------------- |
| `VITE_API_URL` | `http://localhost:3000` | Backend'in adresi |

Vite yalnizca `VITE_` onekli degiskenleri istemciye acar. **Bundle'a giren her degisken
herkese aciktir** — sir tutmayin.

## Klasor yapisi

```
src/
├── main.tsx                  # BrowserRouter > AuthProvider > App
├── App.tsx                   # rota agaci
├── api/
│   ├── client.ts             # axios instance, Authorization + 401 interceptor'lari
│   ├── auth.ts               # /auth/login, /auth/register, /auth/me
│   └── tokenStorage.ts       # token saklamanin TEK kapisi
├── context/
│   ├── AuthContext.ts        # context nesnesi + tipler
│   └── AuthProvider.tsx      # oturum durumunun tek kaynagi
├── hooks/
│   └── useAuth.ts
├── components/
│   ├── ProtectedRoute.tsx    # giris yoksa /login
│   ├── AdminRoute.tsx        # rol admin degilse /groups (YALNIZCA UX)
│   ├── GuestRoute.tsx        # giris varken /login ve /register erisilemez
│   ├── RouteFallback.tsx     # guard'lar karar veremezken
│   └── Layout.tsx            # gezinme + cikis
├── pages/                    # login, register, groups, group detay, admin, ayarlar, 404
├── types/
│   ├── models.ts             # backend JSON tiplerinin karsiliklari
│   └── api.ts                # AuthResult, ApiErrorBody, Pagination
└── routes.test.tsx           # rota koruma testleri
```

## Rotalar

| Adres         | Koruma                          |
| ------------- | ------------------------------- |
| `/`           | -> `/groups`                    |
| `/login`      | `GuestRoute`                    |
| `/register`   | `GuestRoute`                    |
| `/groups`     | `ProtectedRoute`                |
| `/groups/:id` | `ProtectedRoute`                |
| `/settings`   | `ProtectedRoute`                |
| `/admin`      | `ProtectedRoute` + `AdminRoute` |
| `*`           | 404                             |

Guard'lar tek tek sayfalara degil **layout route** olarak takili: yeni bir korunan sayfa
eklendiginde korumayi otomatik devralir (backend'deki `router.use(requireAuth)` ile ayni
gerekce).

## Bilinmesi gerekenler

**Token `localStorage`'da tutulur** (`api/tokenStorage.ts`). Backend tek ve uzun omurlu
(7 gun) bir JWT uretiyor, refresh token akisi yok; bellekte tutmak her sayfa yenilemesinde
oturumu kaybettirirdi. XSS degerlendirmesi ve alternatiflerin karsilastirmasi:
`../docs/decisions/2.1.md`.

**`AdminRoute` bir guvenlik siniri degildir.** Rol bilgisi istemcide kurcalanabilir;
kurcalandiginda kullanici admin ekranini gorur ama ekranin attigi her `/admin/*` istegi
backend'de `requireAdmin` tarafindan 403 alir. Gercek yetki
`../src/routes/admin.routes.ts` icinde.

**Para alanlari `string`.** Backend `NUMERIC` degerleri bilerek metin donuyor; `Number()`
cevrimi yalnizca gosterim aninda yapilmali (bkz. `../docs/decisions/1.5.md`).

**Tipler elle senkron tutulur.** `src/types/models.ts` backend'deki tiplerin kopyasidir;
otomatik uretim yok. Backend'de alan degisirse burasi da guncellenmeli.
