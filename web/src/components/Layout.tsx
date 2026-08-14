import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import useAuth from '../hooks/useAuth';

/**
 * Giris yapmis kullanicilarin ortak cercevesi: gezinme + cikis.
 * Admin baglantisi yalnizca admin'e gosterilir — bu da guvenlik degil UX
 * (bkz. AdminRoute).
 */
const Layout = () => {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="layout">
      <header className="layout__header">
        <span className="layout__brand">EvenUp</span>

        <nav className="layout__nav">
          <NavLink to="/groups">Gruplar</NavLink>
          {isAdmin && <NavLink to="/admin">Admin</NavLink>}
          <NavLink to="/settings">Ayarlar</NavLink>
        </nav>

        <div className="layout__user">
          <span>{user?.name}</span>
          <button type="button" onClick={handleLogout}>
            Cikis
          </button>
        </div>
      </header>

      <main className="layout__main">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
