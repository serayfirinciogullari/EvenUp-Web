'use strict';

const path = require('path');
const dotenv = require('dotenv');

// .env proje kokunden okunur (calisma dizininden bagimsiz olsun diye mutlak yol)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const toNumber = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const config = {
  env: process.env.NODE_ENV || 'development',
  port: toNumber(process.env.PORT, 3000),
  databaseUrl: process.env.DATABASE_URL || null,
  jwtSecret: process.env.JWT_SECRET || null,
  logLevel: process.env.LOG_LEVEL || 'dev',
};

config.isProduction = config.env === 'production';
config.isDevelopment = config.env === 'development';

module.exports = config;
