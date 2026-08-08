import path from 'path';

import type { Knex } from 'knex';

import config from './env';

/**
 * Knex konfigurasyonu. `knexfile.ts` bu dosyayi re-export eder; CLI
 * (knex migrate:latest / seed:run) ve uygulama ayni ayarlari kullanir.
 *
 * Dizinler __dirname'e gore cozuluyor: ts-node ile calisirken
 * `src/db/migrations` (.ts), derlenmis halde `dist/db/migrations` (.js) bulunur.
 */

if (!config.databaseUrl) {
  throw new Error(
    'DATABASE_URL tanimli degil. .env dosyanizi kontrol edin (.env.example baz alin).'
  );
}

const migrationsDirectory = path.resolve(__dirname, '../db/migrations');
const seedsDirectory = path.resolve(__dirname, '../db/seeds');

const base: Knex.Config = {
  client: 'pg',
  connection: config.databaseSsl
    ? { connectionString: config.databaseUrl, ssl: { rejectUnauthorized: false } }
    : { connectionString: config.databaseUrl },
  migrations: {
    directory: migrationsDirectory,
    tableName: 'knex_migrations',
    extension: 'ts',
    // Hem kaynaktan (.ts) hem derlenmis koddan (.js) calisabilsin
    loadExtensions: ['.ts', '.js'],
  },
  seeds: {
    directory: seedsDirectory,
    extension: 'ts',
    loadExtensions: ['.ts', '.js'],
  },
};

const configurations: Record<string, Knex.Config> = {
  development: {
    ...base,
    pool: { min: 2, max: 10 },
    // Uretilen SQL'i gormek icin: DEBUG=knex:query npm run dev
    debug: false,
  },

  production: {
    ...base,
    pool: { min: 2, max: 20 },
    debug: false,
    // Uretimde migration'lar derlenmis dist/ uzerinden calisir (npm run build sonrasi)
    acquireConnectionTimeout: 10000,
  },
};

export default configurations;
