import { Router } from 'express';

import settlementController from '../controllers/settlement.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import asyncHandler from '../utils/asyncHandler';

/**
 * Odeme kaydinin kendi ID'si uzerinden calisan uc noktalar.
 *
 * Harcamalarda oldugu gibi (bkz. expense.routes.ts) grup adrese konmuyor:
 * kaydin grubu satirdan okunuyor, yetki kontrolu ona gore yapiliyor.
 *
 * Neden PUT: onay/red kaynagi belirli bir son duruma tasir ve ayni istegin
 * tekrari sonucu degistirmez (ikinci cagri 409 alir, veri ayni kalir).
 * Olusturma ise grup baglaminda anlamli oldugu icin /groups altinda durur.
 */
const router = Router();

// Diger router'lardaki gibi requireAuth router seviyesinde: yeni bir uc nokta
// eklendiginde onu unutmak mumkun olmasin.
router.use(requireAuth);

/*
  Sabit yol, parametreli yollardan **once** tanimli. Bugun bir catisma yok
  (parametreli olanlar PUT ve alt segmentli), ama ileride bir `GET /:id`
  eklendiginde `/pending` onun eline duser ve "pending" bir ID gibi okunurdu.
  Siranin burada olmasi o hatayi bastan imkansiz kiliyor.
*/
router.get('/pending', asyncHandler(settlementController.listPending));

router.put('/:id/confirm', asyncHandler(settlementController.confirm));
router.put('/:id/reject', asyncHandler(settlementController.reject));

export default router;
