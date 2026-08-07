'use strict';

const healthService = require('../services/health.service');

/**
 * GET /health -> { "status": "ok" }
 */
const getHealth = async (req, res) => {
  const result = await healthService.getStatus();
  res.status(200).json(result);
};

/**
 * GET /health/details -> uptime, env, db durumu vb.
 */
const getHealthDetails = async (req, res) => {
  const result = await healthService.getDetails();
  res.status(200).json(result);
};

module.exports = { getHealth, getHealthDetails };
