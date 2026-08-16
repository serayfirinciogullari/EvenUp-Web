import { ThemeProvider } from 'next-themes';
import { Navigate, Route, Routes } from 'react-router-dom';

import { Toaster } from '@/components/ui/sonner';
import { THEME_STORAGE_KEY } from '@/lib/theme';
import AdminRoute from './components/AdminRoute';
import GuestRoute from './components/GuestRoute';
import Layout from './components/Layout';
import AppCursor from './components/AppCursor';
import ProtectedRoute from './components/ProtectedRoute';
import AdminPage from './pages/AdminPage';
import GroupDetailPage from './pages/GroupDetailPage';
import GroupsPage from './pages/GroupsPage';
import HomePage from './pages/HomePage';
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
 *   /                 -> /home (yonlendirme)
 *   GuestRoute        -> /login, /register        (giris yapmisken erisilmez)
 *   ProtectedRoute    -> /home, /groups, /groups/:id, /settings
 *     + AdminRoute    -> /admin
 *
 * KOK ADRES NEDEN /home
 * ---------------------
 * 2.1'de `/` -> `/groups` idi. Home eklenince acilis ekrani degisti ama
 * `/groups` **kaldirilmadi**: Home bir gecit degil, geri donulebilir bir sayfa.
 * Ust bardaki gezinme ikisini de tasiyor (bkz. Layout.tsx).
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
      <Route path="/" element={<Navigate to="/home" replace />} />

      <Route element={<GuestRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/home" element={<HomePage />} />
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

    {/*
      Ozel imlec de rota agacinin disinda: sayfa degisiminde yeniden mount
      olsaydi imlec her gecişte bir kare kaybolurdu. Kendisi dokunmatikte ve
      `prefers-reduced-motion` altinda hic cizilmiyor (bkz. AppCursor).
    */}
    <AppCursor />
  </ThemeProvider>
);

export default App;
