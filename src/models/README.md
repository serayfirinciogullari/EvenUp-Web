# models

PostgreSQL veri erisim katmani. Modeller sadece sorgu calistirir; is mantigi
`src/services` altinda kalir.

Mevcut:

- `user.model.ts` — users tablosu. `PUBLIC_USER_COLUMNS` disariya donen sorgularda
  `password_hash`'in sizmasini engeller; hash yalnizca `findByEmail` ile doner
  (login'de karsilastirmak icin).

Plan: her tablo icin bir dosya — `group.model.ts`, `expense.model.ts`,
`settlement.model.ts`. Baglanti `src/db/connection.ts` uzerindeki tek Knex ornegidir.
