# models

PostgreSQL veri erisim katmani. Modeller sadece sorgu calistirir; is mantigi
`src/services` altinda kalir.

Mevcut:

- `user.model.ts` — users tablosu. `PUBLIC_USER_COLUMNS` disariya donen sorgularda
  `password_hash`'in sizmasini engeller; hash yalnizca `findByEmail` ile doner
  (login'de karsilastirmak icin).
- `group.model.ts` — groups / group_members / group_invites. Iki kural: (1) grup okuyan
  her sorgu `deleted_at IS NULL` filtresini uygular, servis katmani dogrudan
  `db('groups')` cagirmaz — soft delete kullanildigi icin bu filtreyi unutmak silinmis
  grubu geri gorunur kilar; (2) atomik olmasi gereken islemler ("grup olustur + owner
  uyeligi yaz", "daveti dogrula + uyelik ekle + sayaci artir") transaction icinde burada
  durur, servis bunlari tek cagriyla kullanir.

Plan: kalan tablolar icin birer dosya — `expense.model.ts`, `settlement.model.ts`.
Baglanti `src/db/connection.ts` uzerindeki tek Knex ornegidir.
