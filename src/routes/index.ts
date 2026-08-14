import { Router } from 'express';

import adminRoutes from './admin.routes';
import authRoutes from './auth.routes';
import expenseRoutes from './expense.routes';
import groupRoutes from './group.routes';
import healthRoutes from './health.routes';
import settlementRoutes from './settlement.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/groups', groupRoutes);
router.use('/expenses', expenseRoutes);
router.use('/settlements', settlementRoutes);
router.use('/admin', adminRoutes);

// Yeni modul route'lari buraya eklenir:
// router.use('/reports', reportRoutes);

export default router;
