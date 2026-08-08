import knexFactory, { type Knex } from 'knex';

import config from '../config/env';
import configurations from '../config/database';

// Tablo tiplerinin `knex/types/tables` augmentation'i devreye girsin diye import ediliyor.
import '../types/models';

const environmentConfig: Knex.Config =
  configurations[config.env] ?? (configurations.development as Knex.Config);

/**
 * Uygulama genelinde tek bir Knex ornegi (connection pool) kullanilir.
 *
 *   import db from '../db/connection';
 *   const users = await db<UserRow>('users').where({ is_active: true });
 */
const db: Knex = knexFactory(environmentConfig);

export default db;
