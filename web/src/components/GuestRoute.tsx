import { Navigate, Outlet, useLocation } from 'react-router-dom';

import useAuth from '../hooks/useAuth';
import { afterAuthPath } from '../utils/afterAuth';
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
    /*
      Varsayilan hedef Home: giris sonrasi akisin basi orasi. `from` varsa o
      kazaniyor — korunan bir sayfadan gelen kullanici basladigi yere donmeli.

      Hedef hesabi form sayfalariyla **ortak** (`utils/afterAuth.ts`) ve bu bir
      zorunluluk: oturum acilir acilmaz bu yonlendirme ile `LoginPage`in kendi
      `navigate`i ayni anda tetikleniyor, hangisinin kazanacagi da belirsiz.
      Iki yer farkli hesap yapsaydi giris sonrasi hedef **kararsiz** olurdu —
      davet linkinden gelen kullanici bazen gruba, bazen ana ekrana duserdi.
    */
    return <Navigate to={afterAuthPath(location.state, '/home')} replace />;
  }

  return <Outlet />;
};

export default GuestRoute;
