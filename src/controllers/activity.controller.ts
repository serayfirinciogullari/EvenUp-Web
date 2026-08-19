import activityService from '../services/activity.service';
import ApiError from '../utils/ApiError';

import type { Request, Response } from 'express';

/**
 * Aktivite akisi uc noktasi.
 *
 * `user.controller` ile ayni desen: hedef kullanici **token'dan** okunuyor
 * (`req.user.id`), adreste ya da sorgu dizesinde bir kullanici ID'si yok.
 * Bu bir yetki kontrolunden daha guclu — "baskasinin akisini gor" bu uc
 * noktada ifade edilemiyor bile.
 */

/**
 * GET /activity?page=&limit= -> 200 { events, pagination }  (requireAuth)
 */
const list = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    throw ApiError.unauthorized('Kimlik dogrulamasi gerekli');
  }

  const result = await activityService.listActivity(req.user.id, req.query);
  res.status(200).json(result);
};

export default { list };
