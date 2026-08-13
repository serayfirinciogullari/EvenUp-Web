import { Router } from 'express';

import authRoutes from './auth.routes';
import healthRoutes from './health.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);

// Yeni modul route'lari buraya eklenir:
// router.use('/groups', groupRoutes);
// router.use('/expenses', expenseRoutes);

export default router;
