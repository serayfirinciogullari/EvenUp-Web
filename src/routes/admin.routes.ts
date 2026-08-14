import { Router } from 'express';

import adminController from '../controllers/admin.controller';
import { requireAdmin, requireAuth } from '../middlewares/auth.middleware';
import asyncHandler from '../utils/asyncHandler';

/**
 * Admin paneli adresleri.
 *
 * `requireAuth` + `requireAdmin` router seviyesinde ve **bu sirayla** takili:
 * once kimlik, sonra yetki. Boylece token'siz istek 403 degil 401 alir ve
 * buraya eklenen her yeni uc nokta korumayi otomatik devralir — tek tek
 * route'lara yazsaydik bir gun biri unutulurdu.
 *
 * Bu router'in dokunabilecegi tek servis `admin.service`; harcama ve odeme
 * servisleri buraya baglanmaz (bkz. docs/decisions/1.8.md).
 */
const router = Router();

router.use(requireAuth, requireAdmin);

router.get('/users', asyncHandler(adminController.listUsers));
router.put('/users/:id/disable', asyncHandler(adminController.disableUser));
router.put('/users/:id/enable', asyncHandler(adminController.enableUser));

// Yalnizca ust veri: ad, uye sayisi, olusturulma tarihi.
router.get('/groups', asyncHandler(adminController.listGroups));

// Yalnizca toplamlar (COUNT / SUM).
router.get('/stats', asyncHandler(adminController.stats));

export default router;
