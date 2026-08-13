import authService from '../services/auth.service';
import ApiError from '../utils/ApiError';

import type { RequestHandler } from 'express';

const BEARER_PREFIX = 'Bearer ';

/**
 * `Authorization: Bearer <token>` header'ini dogrular ve `req.user`'a
 * { id, role } yazar. Header yoksa, bicimsizse ya da token gecersiz/suresi
 * dolmussa 401 doner.
 */
const requireAuth: RequestHandler = (req, res, next) => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith(BEARER_PREFIX)) {
    next(ApiError.unauthorized('Authorization header eksik veya hatali'));
    return;
  }

  const token = header.slice(BEARER_PREFIX.length).trim();
  if (!token) {
    next(ApiError.unauthorized('Token bulunamadi'));
    return;
  }

  try {
    req.user = authService.verifyToken(token);
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Sadece admin rolune izin verir. requireAuth'tan **sonra** takilmali;
 * req.user yoksa (yani route yanlis kurulmussa) 401 doner.
 */
const requireAdmin: RequestHandler = (req, res, next) => {
  if (!req.user) {
    next(ApiError.unauthorized('Kimlik dogrulamasi gerekli'));
    return;
  }

  if (req.user.role !== 'admin') {
    next(ApiError.forbidden('Bu islem icin admin yetkisi gerekli'));
    return;
  }

  next();
};

export default { requireAuth, requireAdmin };
export { requireAuth, requireAdmin };
