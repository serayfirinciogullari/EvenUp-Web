/**
 * Knex CLI giris noktasi.
 *
 * knex CLI bu dosyayi ts-node uzerinden yukler (ts-node devDependency olarak kurulu),
 * boylece `npx knex migrate:latest` migration'lari dogrudan .ts olarak calistirir.
 * Asil konfigurasyon src/config/database.ts icinde; burasi sadece re-export.
 */
import configurations from './src/config/database';

export default configurations;
