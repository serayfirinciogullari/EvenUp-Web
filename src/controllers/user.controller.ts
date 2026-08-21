import authService from '../services/auth.service';
import contactsService from '../services/contacts.service';
import summaryService from '../services/summary.service';
import ApiError from '../utils/ApiError';

import type { Request, Response } from 'express';

/**
 * Kullanicinin **kendi** hesabi uzerindeki islemleri (2.6).
 *
 * `auth.controller` ile ayri tutuldu cunku ikisi farkli sorulari cevapliyor:
 * `/auth/*` "bu oturum kimin?" (register, login, me), `/users/me` "bu kullanici
 * kaydinda ne yaziyor?". Is mantigi yine `auth.service` icinde — sifre hash'leme
 * ve dogrulama kurallari orada, iki servise bolunmeleri anlamsiz olurdu.
 *
 * Her iki uc noktada da hedef kullanici **token'dan** okunuyor (`req.user.id`);
 * adreste ya da govdede bir kullanici ID'si yok. Bu bir yetki kontrolunden
 * daha guclu: "baskasinin kaydini guncelleme" ifade edilemiyor bile (IDOR
 * yuzeyi sifir).
 */

/**
 * PUT /users/me -> 200 { user }  (requireAuth)
 */
const updateMe = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    throw ApiError.unauthorized('Kimlik dogrulamasi gerekli');
  }

  const user = await authService.updateProfile(req.user.id, req.body);
  res.status(200).json({ user });
};

/**
 * PUT /users/me/password -> 200 { message }  (requireAuth)
 *
 * Cevapta `user` yok: sifre degisikligi hicbir gorunur alani degistirmiyor,
 * doner donmez ekranda tazelenecek bir sey de yok.
 */
const changeMyPassword = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    throw ApiError.unauthorized('Kimlik dogrulamasi gerekli');
  }

  await authService.changePassword(req.user.id, req.body);
  res.status(200).json({ message: 'Sifreniz guncellendi' });
};

/**
 * GET /users/me/home-summary -> 200 { summary }  (requireAuth)
 *
 * Hedef yine token'daki kullanici; adreste ID yok, yani "baskasinin ozeti"
 * bu ucta ifade edilemiyor. Ozet kullanicinin **tum** gruplarini kapsadigi
 * icin bu onemli: tek bir ID parametresi butun gruplarinin mali durumunu
 * disariya acan bir IDOR yuzeyi olurdu.
 */
const getHomeSummary = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    throw ApiError.unauthorized('Kimlik dogrulamasi gerekli');
  }

  const summary = await summaryService.getHomeSummary(req.user.id);
  res.status(200).json({ summary });
};

/**
 * POST /users/me/activity-seen -> 200 { message }  (requireAuth)
 *
 * Govde yok: "simdi" tek anlamli deger. Aktivite sayfasi akisini her
 * yukledi ginde bunu cagirir, sidebar rozetindeki okunmamis kismi boylece
 * sayfa yenilenmeden sifirlanir (bkz. docs/decisions/aktivite-okunma-sayaci.md).
 */
const markActivitySeen = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    throw ApiError.unauthorized('Kimlik dogrulamasi gerekli');
  }

  await authService.markActivitySeen(req.user.id);
  res.status(200).json({ message: 'Aktivite okundu olarak isaretlendi' });
};

/**
 * GET /users/me/contacts -> 200 { contacts }  (requireAuth)
 *
 * `getHomeSummary` ile ayni gerekce: hedef her zaman token'daki kullanici,
 * adreste ID yok — bu ucun cevabi butun ortak-grup gecmisini tasidigi icin bu
 * onemli, tek bir ID parametresi butun bir kullanicinin borc agini disariya
 * acan bir IDOR yuzeyi olurdu.
 */
const getContacts = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    throw ApiError.unauthorized('Kimlik dogrulamasi gerekli');
  }

  const contacts = await contactsService.getContacts(req.user.id);
  res.status(200).json({ contacts });
};

/**
 * POST /users/me/delete-request -> 200 { message }  (requireAuth)
 *
 * Gerekce ve "sonra ne olur" akisi: docs/decisions/3.17-hesap-silme.md.
 */
const requestDeletion = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    throw ApiError.unauthorized('Kimlik dogrulamasi gerekli');
  }

  await authService.requestDeletion(req.user.id);
  res.status(200).json({ message: 'Hesabinizin silinmesi talep edildi' });
};

/**
 * POST /users/me/cancel-deletion -> 200 { user, token, expiresIn }
 *
 * `requireAuth` **yok** — bu ucun butun amaci token'i olmayan (silme talebi
 * sonrasi cikartilmis) birinin e-posta+sifreyle geri donmesi. Cevap sekli
 * `/auth/login`le birebir ayni: basarili olunca frontend'in mevcut
 * "AuthResult uygula" mantigini (token yaz, kullaniciyi ayarla) aynen
 * kullanabilmesi icin.
 */
const cancelDeletion = async (req: Request, res: Response): Promise<void> => {
  const result = await authService.cancelDeletion(req.body);
  res.status(200).json(result);
};

export default {
  updateMe,
  changeMyPassword,
  getHomeSummary,
  markActivitySeen,
  getContacts,
  requestDeletion,
  cancelDeletion,
};
