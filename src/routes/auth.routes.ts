import { Router } from 'express';

import authController from '../controllers/auth.controller';
import { requireAdmin, requireAuth } from '../middlewares/auth.middleware';
import asyncHandler from '../utils/asyncHandler';

const router = Router();

// Herkese acik
router.post('/register', asyncHandler(authController.register));
router.post('/login', asyncHandler(authController.login));

// Token gerektirir
router.get('/me', requireAuth, asyncHandler(authController.getMe));

// Token + admin rolu gerektirir (sira onemli: once kimlik, sonra yetki)
router.get('/users', requireAuth, requireAdmin, asyncHandler(authController.listUsers));

export default router;
