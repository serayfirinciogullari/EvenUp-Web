import { Router } from 'express';

import activityController from '../controllers/activity.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import asyncHandler from '../utils/asyncHandler';

/**
 * Aktivite akisi.
 *
 * NEDEN `/activity`, `/users/me/activity` DEGIL
 * ---------------------------------------------
 * Home ozeti `/users/me/home-summary` altinda duruyor ve oradaki gerekce
 * "hicbir gruba ait degil, kullaniciya ait" idi. Akis icin de ayni sey
 * gecerli — yani iki adres de savunulabilir. Ust seviye secildi cunku akis bir
 * **hesap alani** degil, kendi basina bir ekran: `/users/*` altindaki diger uc
 * noktalar (profil, sifre) kullanici **kaydini** okuyup yaziyor, burasi ise
 * kullanicinin kaydiyla degil gruplarinda olup bitenle ilgili.
 *
 * Guvenlik acisindan fark yok, cunku onemli olan kisim ikisinde de ayni: adres
 * bir kullanici ID'si tasimiyor, hedef her zaman token'in sahibi.
 *
 * `requireAuth` router seviyesinde — diger router'lardaki gerekcenin aynisi:
 * buraya eklenecek yeni bir uc nokta korumayi otomatik devralsin.
 */
const router = Router();

router.use(requireAuth);

router.get('/', asyncHandler(activityController.list));

export default router;
