import path from 'path';

import dotenv from 'dotenv';

// .env proje kokunden okunur (calisma dizininden bagimsiz olsun diye mutlak yol)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export interface Config {
  env: string;
  port: number;
  appUrl: string;
  databaseUrl: string | null;
  databaseSsl: boolean;
  jwtSecret: string | null;
  jwtExpiresIn: string;
  bcryptSaltRounds: number;
  logLevel: string;
  /** Anthropic API anahtari. Yoksa null; dogal dil harcama ucu (ai.service)
   *  cagrildiginda 503 dondurur, uygulamanin geri kalani etkilenmez. */
  anthropicApiKey: string | null;
  /** Dogal dil harcama ayristirmada kullanilan model. Isim/katilimci
   *  eslestirme hata riski tasidigi icin varsayilan Sonnet (bkz.
   *  docs/decisions/grup-detay-sohbet.md). */
  anthropicModel: string;
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
const port = toNumber(process.env.PORT, 3000);

const config: Config = {
  env,
  port,
  // Davet linki gibi disariya verilen mutlak adreslerin koku. Uretimde gercek
  // alan adi verilmeli; sondaki '/' varsa kirpilir ki link '//' ile olusmasin.
  appUrl: (process.env.APP_URL || `http://localhost:${port}`).replace(/\/+$/, ''),
  databaseUrl: process.env.DATABASE_URL || null,
  // Yonetilen PostgreSQL servisleri (Render, Heroku, Supabase...) SSL ister
  databaseSsl: process.env.DATABASE_SSL === 'true',
  // Secret koda gomulmez; yoksa null kalir ve token ureten/dogrulayan kod hata firlatir
  jwtSecret: process.env.JWT_SECRET || null,
  // jsonwebtoken sozdizimi: '7d', '12h', '30m' ya da saniye cinsinden sayi
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  bcryptSaltRounds: clampSaltRounds(toNumber(process.env.BCRYPT_SALT_ROUNDS, 12)),
  logLevel: process.env.LOG_LEVEL || 'dev',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || null,
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
  isProduction: env === 'production',
  isDevelopment: env === 'development',
};

export default config;
