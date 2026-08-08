import { Router } from 'express';

import healthController from '../controllers/health.controller';
import asyncHandler from '../utils/asyncHandler';

const router = Router();

router.get('/', asyncHandler(healthController.getHealth));
router.get('/details', asyncHandler(healthController.getHealthDetails));

export default router;
