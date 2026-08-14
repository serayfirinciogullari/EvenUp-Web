import { Navigate, Outlet } from 'react-router-dom';

import useAuth from '../hooks/useAuth';
import RouteFallback from './RouteFallback';

/**
 * `ProtectedRoute`'un **ustune** takilir: once giris, sonra rol.
 *
 * BU KONTROL GUVENLIK DEGIL, UX
 * -----------------------------
 * Frontend'deki rol kontrolu yalnizca kullaniciya erisemeyecegi bir ekrani
 * gostermemek icindir. Rol bilgisi JWT'nin icinden ve `/auth/me` cevabindan
 * gelir; ikisi de istemcide degistirilebilir (DevTools ile `role: 'admin'`
 * yazmak yeterlidir). Bu yapildiginda kullanici admin ekranini **gorur** ama
 * ekranin cektigi her `/admin/*` istegi backend'de `requireAdmin` tarafindan
 * 403 ile reddedilir — yani hicbir veri gelmez.
 *
 * Gercek yetki siniri `src/routes/admin.routes.ts` icindeki
 * `router.use(requireAuth, requireAdmin)` satiridir.
 * Ayrinti: docs/decisions/2.1.md ve docs/decisions/1.8.md
 */
const AdminRoute = () => {
  const { status, isAdmin } = useAuth();

  if (status === 'loading') {
    return <RouteFallback label="Yetki kontrol ediliyor..." />;
  }

  if (!isAdmin) {
    return <Navigate to="/groups" replace />;
  }

  return <Outlet />;
};

export default AdminRoute;
