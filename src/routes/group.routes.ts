import { Router } from 'express';

import expenseController from '../controllers/expense.controller';
import groupController from '../controllers/group.controller';
import messageController from '../controllers/message.controller';
import settlementController from '../controllers/settlement.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import { resolveGroupParam } from '../middlewares/group.middleware';
import asyncHandler from '../utils/asyncHandler';

const router = Router();

// Tum grup uc noktalari kimlik dogrulamasi ister. Route bazinda tek tek
// yazmak yerine router seviyesinde takiliyor: yeni bir route eklendiginde
// requireAuth'u unutmak mumkun degil.
router.use(requireAuth);

// `:id` hem uuid hem adres parcasi (slug) olabilir; slug ise burada uuid'ye
// cevrilir. Tek yerde durmasinin gerekcesi group.middleware.ts icinde.
// `/join/:inviteCode` farkli bir parametre adi tasidigi icin bu kapidan gecmez.
router.param('id', resolveGroupParam);

// DIKKAT: '/join/:inviteCode' , '/:id' kaliplarindan **once** tanimlanmali.
// Aksi halde Express 'join' kelimesini grup id'si sanar.
router.post('/join/:inviteCode', asyncHandler(groupController.join));

router.post('/', asyncHandler(groupController.create));
router.get('/', asyncHandler(groupController.list));

router.get('/:id', asyncHandler(groupController.detail));
router.put('/:id', asyncHandler(groupController.update));
router.delete('/:id', asyncHandler(groupController.remove));

router.post('/:id/invite', asyncHandler(groupController.invite));
router.delete('/:id/members/:userId', asyncHandler(groupController.removeMember));

// Takma isim uyeligin altinda: hedefi bir **uye**, kapsami tek bir grup.
// `/users/me/...` altina konsaydi grup baglami govdeye tasinirdi ve "hangi
// grupta?" sorusu adresten okunamaz hale gelirdi.
router.put('/:id/members/:userId/nickname', asyncHandler(groupController.setMemberNickname));

// Harcama ekleme/listeleme grup baglaminda anlamli oldugu icin burada duruyor;
// tek bir harcama uzerindeki islemler /expenses altinda (expense.routes.ts).
router.post('/:id/expenses', asyncHandler(expenseController.create));
router.get('/:id/expenses', asyncHandler(expenseController.listByGroup));

// Sohbet feed'i: dogal dil harcama ekleme ve birlesik mesaj akisi. Grup
// baglaminda anlamli oldugu icin harcamalarla ayni yerde (bkz. 3.5 sohbet karari).
router.post('/:id/messages', asyncHandler(messageController.create));
router.get('/:id/messages', asyncHandler(messageController.listByGroup));

// Ayni gerekce: odeme kaydi acmak ve bakiye okumak grup baglaminda anlamli;
// onay/red ise /settlements altinda (settlement.routes.ts).
router.post('/:id/settlements', asyncHandler(settlementController.create));
router.get('/:id/settlements', asyncHandler(settlementController.list));
router.get('/:id/balances', asyncHandler(settlementController.balances));

export default router;
