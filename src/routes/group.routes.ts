import { Router } from 'express';

import groupController from '../controllers/group.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import asyncHandler from '../utils/asyncHandler';

const router = Router();

// Tum grup uc noktalari kimlik dogrulamasi ister. Route bazinda tek tek
// yazmak yerine router seviyesinde takiliyor: yeni bir route eklendiginde
// requireAuth'u unutmak mumkun degil.
router.use(requireAuth);

// DIKKAT: '/join/:inviteCode' , '/:id' kaliplarindan **once** tanimlanmali.
// Aksi halde Express 'join' kelimesini grup id'si sanar.
router.post('/join/:inviteCode', asyncHandler(groupController.join));

router.post('/', asyncHandler(groupController.create));
router.get('/', asyncHandler(groupController.list));

router.get('/:id', asyncHandler(groupController.detail));
router.delete('/:id', asyncHandler(groupController.remove));

router.post('/:id/invite', asyncHandler(groupController.invite));
router.delete('/:id/members/:userId', asyncHandler(groupController.removeMember));

export default router;
