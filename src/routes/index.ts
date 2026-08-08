import { Router } from 'express';

import healthRoutes from './health.routes';

const router = Router();

router.use('/health', healthRoutes);

// Yeni modul route'lari buraya eklenir:
// router.use('/auth', authRoutes);
// router.use('/groups', groupRoutes);
// router.use('/expenses', expenseRoutes);

export default router;
