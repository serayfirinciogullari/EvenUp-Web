import config from '../config/env';

export interface HealthStatus {
  status: 'ok';
}

export interface HealthDetails extends HealthStatus {
  env: string;
  uptime: number;
  timestamp: string;
  database: 'configured' | 'not-configured';
}

/**
 * Servis katmani: is mantigi burada durur, HTTP'den haberi yoktur.
 * DB baglandiginda buraya bir connectivity kontrolu eklenebilir.
 */
const getStatus = async (): Promise<HealthStatus> => ({ status: 'ok' });

const getDetails = async (): Promise<HealthDetails> => ({
  status: 'ok',
  env: config.env,
  uptime: Number(process.uptime().toFixed(2)),
  timestamp: new Date().toISOString(),
  // DB baglandiginda: database: await db.ping() ? 'up' : 'down'
  database: config.databaseUrl ? 'configured' : 'not-configured',
});

export default { getStatus, getDetails };
