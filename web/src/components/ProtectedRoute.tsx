import { Navigate, Outlet, useLocation } from 'react-router-dom';

import useAuth from '../hooks/useAuth';
import RouteFallback from './RouteFallback';

/**
 * Giris yapmamis kullaniciyi /login'e yonlendirir.
 *
 * IKI AYRINTI
 * -----------
 * 1. `status === 'loading'` iken **karar verilmez**. Token'in gecerliligi
 *    sunucuya sorulurken anlik olarak "kullanici yok" gorunur; burada
 *    yonlendirseydik sayfa yenileyen her kullanici login'e duserdi.
 * 2. Gidilmek istenen adres `state.from` ile tasinir; login sonrasi kullanici
 *    /login'e degil gitmek istedigi sayfaya doner.
 *
 * Bu bir **UX** katmanidir, guvenlik siniri degil: token'siz istek zaten
 * backend'de 401 alir (bkz. docs/decisions/2.1.md).
 */
const ProtectedRoute = () => {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <RouteFallback label="Oturum dogrulaniyor..." />;
  }

  if (status === 'anonymous') {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
