'use strict';

const config = require('../config');

/**
 * Servis katmani: is mantigi burada durur, HTTP'den haberi yoktur.
 * DB baglandiginda buraya bir connectivity kontrolu eklenebilir.
 */
const getStatus = async () => ({ status: 'ok' });

const getDetails = async () => ({
  status: 'ok',
  env: config.env,
  uptime: Number(process.uptime().toFixed(2)),
  timestamp: new Date().toISOString(),
  // DB baglandiginda: database: await db.ping() ? 'up' : 'down'
  database: config.databaseUrl ? 'configured' : 'not-configured',
});

module.exports = { getStatus, getDetails };
