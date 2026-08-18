import { readPendingInvite } from '../api/pendingInvite';
import { joinPath } from './invite';

/**
 * Oturum acildiktan sonra nereye gidilecegi.
 *
 * Karar artik tek dallanma degil ve **birden fazla yer** ayni cevabi vermek
 * zorunda (form sayfalari ve `GuestRoute`; gerekcesi api/pendingInvite.ts):
 *
 *   1. `state.from` — korunan bir sayfadan yonlendirilen kullanici basladigi
 *      yere doner (`ProtectedRoute`un yerlestirdigi deger).
 *   2. bekleyen davet — davet linkinden gelip kayit olan kullanici, **linke
 *      tekrar tiklamadan** katilma sayfasina doner; istek orada kendiliginden
 *      tekrarlanir (bkz. pages/JoinPage.tsx).
 *   3. varsayilan.
 *
 * Fonksiyonun yan etkisi yok: iki kez cagrilmasi ya da farkli sirada
 * cagrilmasi ayni sonucu verir.
 */
export const afterAuthPath = (state: unknown, fallback = '/groups'): string => {
  const from = (state as { from?: { pathname?: string } } | null)?.from?.pathname;

  if (from) {
    return from;
  }

  const pendingInvite = readPendingInvite();

  return pendingInvite ? joinPath(pendingInvite) : fallback;
};
