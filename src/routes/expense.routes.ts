import { Router } from 'express';

import expenseController from '../controllers/expense.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import asyncHandler from '../utils/asyncHandler';

/**
 * Harcamanin kendi ID'si uzerinden calisan uc noktalar.
 *
 * Neden `/groups/:id/expenses/:expenseId` degil de `/expenses/:id`?
 * Harcama ID'si zaten benzersiz; adrese grubu da koymak, iki ID'nin
 * birbiriyle tutarli olup olmadigini her istekte ayrica dogrulamayi
 * gerektirirdi ("A grubunun altindan B grubunun harcamasini duzenle").
 * Grup, harcama satirindan okunuyor ve yetki kontrolu ona gore yapiliyor.
 *
 * Liste ve olusturma ise grup baglaminda anlamli oldugu icin
 * `/groups/:id/expenses` altinda duruyor (bkz. group.routes.ts).
 */
const router = Router();

// Grup route'lari gibi burada da requireAuth router seviyesinde: yeni bir uc
// nokta eklendiginde onu unutmak mumkun olmasin.
router.use(requireAuth);

router.get('/:id', asyncHandler(expenseController.detail));
router.put('/:id', asyncHandler(expenseController.update));
router.delete('/:id', asyncHandler(expenseController.remove));

export default router;
