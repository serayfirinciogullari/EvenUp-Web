import type { UserRole } from './models';

/**
 * Kimlik dogrulama tipleri.
 *
 * `JwtPayload` token'in **icine** yazilan veri, `AuthUser` ise token dogrulandiktan
 * sonra `req.user`'a konan veridir. Ikisini ayri tutuyoruz: payload alan adlari
 * (userId) token formatinin parcasi, req.user ise uygulamanin ic sozlesmesi.
 */

export interface JwtPayload {
  userId: string;
  role: UserRole;
}

export interface AuthUser {
  id: string;
  role: UserRole;
}
