import type { AuthUser } from './auth';

/**
 * Express'in `Request` tipine `user` alanini ekler.
 * requireAuth middleware'i bu alani doldurur; ondan once undefined'dir,
 * bu yuzden opsiyonel tanimlandi.
 */
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
