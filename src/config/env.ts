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
  logLevel: string;
  isProduction: boolean;
  isDevelopment: boolean;
}

const toNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const env = process.env.NODE_ENV || 'development';

const config: Config = {
  env,
  port: toNumber(process.env.PORT, 3000),
  databaseUrl: process.env.DATABASE_URL || null,
  // Yonetilen PostgreSQL servisleri (Render, Heroku, Supabase...) SSL ister
  databaseSsl: process.env.DATABASE_SSL === 'true',
  jwtSecret: process.env.JWT_SECRET || null,
  logLevel: process.env.LOG_LEVEL || 'dev',
  isProduction: env === 'production',
  isDevelopment: env === 'development',
};

export default config;
