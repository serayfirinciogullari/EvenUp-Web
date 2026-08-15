import { Router } from 'express';

import expenseController from '../controllers/expense.controller';
import groupController from '../controllers/group.controller';
import settlementController from '../controllers/settlement.controller';
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

// Harcama ekleme/listeleme grup baglaminda anlamli oldugu icin burada duruyor;
// tek bir harcama uzerindeki islemler /expenses altinda (expense.routes.ts).
router.post('/:id/expenses', asyncHandler(expenseController.create));
router.get('/:id/expenses', asyncHandler(expenseController.listByGroup));

// Ayni gerekce: odeme kaydi acmak ve bakiye okumak grup baglaminda anlamli;
// onay/red ise /settlements altinda (settlement.routes.ts).
router.post('/:id/settlements', asyncHandler(settlementController.create));
router.get('/:id/settlements', asyncHandler(settlementController.list));
router.get('/:id/balances', asyncHandler(settlementController.balances));

export default router;
