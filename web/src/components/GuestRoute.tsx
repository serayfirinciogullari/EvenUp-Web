import { Navigate, Outlet, useLocation } from 'react-router-dom';

import useAuth from '../hooks/useAuth';
import RouteFallback from './RouteFallback';

/**
 * `ProtectedRoute`'un tersi: giris **yapmis** kullaniciyi /login ve /register
 * sayfalarindan uzak tutar.
 *
 * Gerekmeseydi ne olurdu: oturumu acik biri /login'e gittiginde bos bir form
 * gorur, tekrar giris yapar ve elindeki gecerli token'in yerine yenisi gecerdi.
 * Zararsiz gorunse de kullanici "cikis yapmis miyim?" diye tereddut eder.
 *
 * `state.from` varsa oraya doner: korunan bir sayfadan login'e yonlendirilip
 * giris yapan kullanici basladigi yere geri gider.
 */
const GuestRoute = () => {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <RouteFallback label="Yukleniyor..." />;
  }

  if (status === 'authenticated') {
    const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
    return <Navigate to={from ?? '/groups'} replace />;
  }

  return <Outlet />;
};

export default GuestRoute;
