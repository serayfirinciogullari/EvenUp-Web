import { ThemeProvider } from 'next-themes';
import { Navigate, Route, Routes } from 'react-router-dom';

import { Toaster } from '@/components/ui/sonner';
import { THEME_STORAGE_KEY } from '@/lib/theme';
import AdminRoute from './components/AdminRoute';
import GuestRoute from './components/GuestRoute';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import AdminPage from './pages/AdminPage';
import GroupDetailPage from './pages/GroupDetailPage';
import GroupsPage from './pages/GroupsPage';
import LoginPage from './pages/LoginPage';
import NotFoundPage from './pages/NotFoundPage';
import RegisterPage from './pages/RegisterPage';
import SettingsPage from './pages/SettingsPage';

/**
 * Rota agaci.
 *
 * Guard'lar tek tek sayfalara degil **layout route** olarak takili: yeni bir
 * korunan sayfa eklendiginde korumayi devralir. Backend'de `requireAuth`'un
 * router seviyesinde takili olmasiyla ayni gerekce (bkz. group.routes.ts).
 *
 *   /                 -> /groups (yonlendirme)
 *   GuestRoute        -> /login, /register        (giris yapmisken erisilmez)
 *   ProtectedRoute    -> /groups, /groups/:id, /settings
 *     + AdminRoute    -> /admin
 *
 * `Toaster` rota agacinin disinda: bir bildirim, onu tetikleyen sayfadan sonra
 * da (ornegin modal kapandiktan sonra) ayakta kalmali.
 *
 * TEMA SAGLAYICISI NEDEN BURADA, `main.tsx`'te DEGIL (2.6)
 * -------------------------------------------------------
 * `main.tsx` yalnizca uretimde calisiyor; testler `<App />`i dogrudan render
 * ediyor. Saglayici disarida kalsaydi tema kontrolleri testlerde **sessizce**
 * calismayan bir bilesene donusurdu. Ayrica `Toaster` da temayi buradan okuyor
 * (`ui/sonner` -> `useTheme`), yani bildirim kutusu koyu temada koyu geliyor.
 */
const App = () => (
  <ThemeProvider
    attribute="class"
    defaultTheme="system"
    enableSystem
    storageKey={THEME_STORAGE_KEY}
    // Tema degisirken gecis animasyonlarini kapatir: aksi halde her renk
    // token'i ayri ayri "yumusayarak" degisir ve ekran bir an bulanik bir ara
    // renge duser.
    disableTransitionOnChange
  >
    <Routes>
      <Route path="/" element={<Navigate to="/groups" replace />} />

      <Route element={<GuestRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/groups" element={<GroupsPage />} />
          <Route path="/groups/:id" element={<GroupDetailPage />} />
          <Route path="/settings" element={<SettingsPage />} />

          {/* Admin kontrolu ProtectedRoute'un ustune biner: once giris, sonra rol. */}
          <Route element={<AdminRoute />}>
            <Route path="/admin" element={<AdminPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>

    <Toaster position="bottom-right" />
  </ThemeProvider>
);

export default App;
