# models

PostgreSQL modelleri / query katmani buraya gelecek.

Plan:

- `src/config/database.js` icinde `pg` Pool (veya Prisma/Sequelize client) kurulacak,
  `config.databaseUrl` uzerinden baglanacak.
- Her tablo icin bir dosya: `user.model.js`, `group.model.js`, `expense.model.js`,
  `settlement.model.js`.
- Modeller sadece veri erisiminden sorumlu; is mantigi `src/services` altinda kalir.
