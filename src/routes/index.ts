import { Router } from 'express';

import authRoutes from './auth.routes';
import groupRoutes from './group.routes';
import healthRoutes from './health.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/groups', groupRoutes);

// Yeni modul route'lari buraya eklenir:
// router.use('/expenses', expenseRoutes);

export default router;
