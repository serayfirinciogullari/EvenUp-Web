# EvenUp — Backend

Gider/borc takip uygulamasinin REST API iskeleti. Node.js + Express.
PostgreSQL henuz bagli degil; sadece konfigurasyon placeholder'i mevcut.

## Kurulum

```bash
npm install
cp .env.example .env    # Windows: copy .env.example .env
npm run dev
```

Server varsayilan olarak `http://localhost:3000` uzerinde ayaga kalkar.

## Scriptler

| Komut                  | Aciklama                        |
| ---------------------- | ------------------------------- |
| `npm run dev`          | nodemon ile watch modunda calis |
| `npm start`            | production modunda calis        |
| `npm run lint`         | ESLint kontrolu                 |
| `npm run lint:fix`     | ESLint otomatik duzeltme        |
| `npm run format`       | Prettier ile formatla           |
| `npm run format:check` | Format kontrolu                 |

## Endpoint'ler

| Method | Path              | Yanit                                         |
| ------ | ----------------- | --------------------------------------------- |
| GET    | `/health`         | `{ "status": "ok" }`                          |
| GET    | `/health/details` | env, uptime, timestamp, database durumu       |
| \*     | diger hepsi       | `404` — merkezi error handler formatinda JSON |

## Klasor yapisi

```
src/
├── app.js                 # Express app: middleware + route + error handler zinciri
├── server.js              # listen + graceful shutdown
├── config/                # env okuma (dotenv), uygulama ayarlari
├── routes/                # HTTP route tanimlari
├── controllers/           # req/res isleme, servis cagirma
├── services/              # is mantigi (HTTP'den bagimsiz)
├── models/                # veri erisim katmani (DB baglandiginda)
├── middlewares/           # notFound, errorHandler, ileride auth/validate
└── utils/                 # ApiError, asyncHandler, logger
```

## Yeni bir modul eklerken

1. `src/models/x.model.js` — veri erisimi
2. `src/services/x.service.js` — is mantigi
3. `src/controllers/x.controller.js` — `asyncHandler` ile sarilir
4. `src/routes/x.routes.js` — router tanimi
5. `src/routes/index.js` icinde `router.use('/x', xRoutes)`

Hata firlatmak icin `ApiError` kullanin; merkezi error handler yakalar:

```js
const ApiError = require('../utils/ApiError');
throw ApiError.notFound('Grup bulunamadi');
```

## Ortam degiskenleri

`.env.example` dosyasina bakin: `NODE_ENV`, `PORT`, `LOG_LEVEL`, `DATABASE_URL`, `JWT_SECRET`.
