import path from 'path';

import dotenv from 'dotenv';

// .env proje kokunden okunur (calisma dizininden bagimsiz olsun diye mutlak yol)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export interface Config {
  env: string;
  port: number;
  databaseUrl: string | null;
  databaseSsl: boolean;
  jwtSecret: string | null;
  jwtExpiresIn: string;
  bcryptSaltRounds: number;
  logLevel: string;
  isProduction: boolean;
  isDevelopment: boolean;
}

const toNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

/** bcrypt maliyeti: 10'un altina inmek guvenlik, 12'nin ustune cikmak istek suresi maliyetli. */
const clampSaltRounds = (value: number): number => Math.min(12, Math.max(10, value));

const env = process.env.NODE_ENV || 'development';

const config: Config = {
  env,
  port: toNumber(process.env.PORT, 3000),
  databaseUrl: process.env.DATABASE_URL || null,
  // Yonetilen PostgreSQL servisleri (Render, Heroku, Supabase...) SSL ister
  databaseSsl: process.env.DATABASE_SSL === 'true',
  // Secret koda gomulmez; yoksa null kalir ve token ureten/dogrulayan kod hata firlatir
  jwtSecret: process.env.JWT_SECRET || null,
  // jsonwebtoken sozdizimi: '7d', '12h', '30m' ya da saniye cinsinden sayi
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  bcryptSaltRounds: clampSaltRounds(toNumber(process.env.BCRYPT_SALT_ROUNDS, 12)),
  logLevel: process.env.LOG_LEVEL || 'dev',
  isProduction: env === 'production',
  isDevelopment: env === 'development',
};

export default config;
