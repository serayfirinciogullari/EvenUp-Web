import { Router } from 'express';

import userController from '../controllers/user.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import asyncHandler from '../utils/asyncHandler';

/**
 * Kullanicinin kendi hesabi (2.6 icin **Hafta 1'e geriye donuk** eklendi).
 *
 * `requireAuth` router seviyesinde ve `requireAdmin` **yok** — ikisi de bilincli:
 *
 *   - Buraya eklenecek her yeni uc nokta korumayi otomatik devralir; tek tek
 *     route'lara yazsaydik bir gun biri unutulurdu (admin.routes.ts ile ayni
 *     gerekce).
 *   - `requireAdmin` gerekmiyor cunku hedef her zaman **istegi atanin kendisi**:
 *     yol `/me`, ID token'dan geliyor. Baskasinin profilini guncellemek bir
 *     yetki sorunu degil, bu router'da **ifade edilemeyen** bir istek.
 *
 * Adres neden `/users/me`, `/auth/me` degil: `/auth/*` oturumla ilgili
 * (register, login, "bu token kimin?"), `/users/*` kullanici **kaydiyla**.
 * `GET /auth/me` yerinde kaldi — oturum acilisinda token'i dogrulayan cagri o.
 */
const router = Router();

router.use(requireAuth);

// Home ekraninin acilis ozeti: tum gruplar uzerinden toplu.
// Neden `/groups` ya da `/balances` altinda degil: hicbir gruba ait degil,
// **kullaniciya** ait. Gerekce docs/decisions/home-summary.md
router.get('/me/home-summary', asyncHandler(userController.getHomeSummary));

// Aktivite sayfasi acilinca cagrilir: okunmamis rozetini sifirlar.
router.post('/me/activity-seen', asyncHandler(userController.markActivitySeen));

// Kisiler sayfasi: kullanicinin ortak grubu oldugu herkes + toplam bakiye.
router.get('/me/contacts', asyncHandler(userController.getContacts));

router.put('/me', asyncHandler(userController.updateMe));

// Ayri uc nokta: sifre degisikligi mevcut sifreyi de ister ve profil
// guncellemesiyle ayni govdede tasinmasi, "ismini degistirirken sifreni de
// yaz" gibi anlamsiz bir sozlesme uretirdi.
router.put('/me/password', asyncHandler(userController.changeMyPassword));

export default router;
