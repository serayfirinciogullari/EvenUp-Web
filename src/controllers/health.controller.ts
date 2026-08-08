import type { Request, Response } from 'express';

import healthService from '../services/health.service';

/**
 * GET /health -> { "status": "ok" }
 */
const getHealth = async (req: Request, res: Response): Promise<void> => {
  const result = await healthService.getStatus();
  res.status(200).json(result);
};

/**
 * GET /health/details -> uptime, env, db durumu vb.
 */
const getHealthDetails = async (req: Request, res: Response): Promise<void> => {
  const result = await healthService.getDetails();
  res.status(200).json(result);
};

export default { getHealth, getHealthDetails };
