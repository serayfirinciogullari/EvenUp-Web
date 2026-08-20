import { ThemeProvider } from 'next-themes';
import { Navigate, Route, Routes } from 'react-router-dom';

import { Toaster } from '@/components/ui/sonner';
import { THEME_STORAGE_KEY } from '@/lib/theme';
import AccountTab from './components/AccountTab';
import AdminRoute from './components/AdminRoute';
import GuestRoute from './components/GuestRoute';
import Layout from './components/Layout';
import AppCursor from './components/AppCursor';
import PreferencesTab from './components/PreferencesTab';
import ProfileTab from './components/ProfileTab';
import ProtectedRoute from './components/ProtectedRoute';
import SecurityTab from './components/SecurityTab';
import AppDataProvider from './context/AppDataProvider';
import ActivityPage from './pages/ActivityPage';
import AdminPage from './pages/AdminPage';
import ContactsPage from './pages/ContactsPage';
import GroupDetailPage from './pages/GroupDetailPage';
import GroupsPage from './pages/GroupsPage';
import HomePage from './pages/HomePage';
import JoinPage from './pages/JoinPage';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import NotFoundPage from './pages/NotFoundPage';
import ReceiptScanPage from './pages/ReceiptScanPage';
import RegisterPage from './pages/RegisterPage';
import SettingsPage from './pages/SettingsPage';

/**
 * Rota agaci.
 *
 * Guard'lar tek tek sayfalara degil **layout route** olarak takili: yeni bir
 * korunan sayfa eklendiginde korumayi devralir. Backend'de `requireAuth`'un
 * router seviyesinde takili olmasiyla ayni gerekce (bkz. group.routes.ts).
 *
 *   /                 -> Landing (halka acik, guard YOK)
 *   /join/:inviteCode -> Davet linki (halka acik, guard YOK)
 *   GuestRoute        -> /login, /register        (giris yapmisken erisilmez)
 *   ProtectedRoute    -> /home, /groups, /groups/:id, /activity, /contacts,
 *                        /fis-tara, /settings
 *     + AdminRoute    -> /admin
 *
 * KOK ADRES: ONCE /groups, SONRA /home, SIMDI LANDING
 * --------------------------------------------------
 * 2.1'de `/` -> `/groups`, 2.7'de `/` -> `/home` idi; ikisi de giris yapmis
 * kullaniciyi varsayiyordu ve giris yapmamis ziyaretci kok adreste yalnizca
 * bir login formu goruyordu. Artik `/` bir tanitim sayfasi.
 *
 * Landing **hicbir guard'in altinda degil**. `GuestRoute` altina konsaydi
 * oturumu acik olan herkes icin bir yonlendirmeye donusur, paylasilan kok adres
 * linki onlarda hic acilmazdi. Giris yapmis kullanici da ayni sayfayi goruyor;
 * fark yalnizca butonlarda ("Uygulamaya don"). Uygulama ici acilis ekrani
 * `/home` olmaya devam ediyor: giris sonrasi hedef ve `GuestRoute`un
 * varsayilan yonu degismedi.
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
      <Route path="/" element={<LandingPage />} />

      {/*
        Davet linki de guard'siz — ama Landing'den farkli bir sebeple: hedef
        kitlesi **giris yapmamis** kullanici. `ProtectedRoute` altinda olsaydi
        ziyaretci /login'e duser ve davet kodu adres cubugundan silinirdi.
        Sayfa kendi yonlendirmesini yapiyor ve kodu yaninda tasiyor
        (bkz. pages/JoinPage.tsx).
      */}
      <Route path="/join/:inviteCode" element={<JoinPage />} />
      {/*
        Eski bicim: `utils/invite.buildJoinUrl` bir donem bu adresi uretiyordu
        ve o linkler sohbetlerde durmaya devam ediyor. Rota agacinda tek satir,
        karsiligi "daha once paylasilmis her davetin calismaya devam etmesi".
        `/groups/:id` ile cakismiyor: uc parcali adres iki parcali kalibin
        eslesme alanina girmiyor.
      */}
      <Route path="/groups/join/:inviteCode" element={<JoinPage />} />

      <Route element={<GuestRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        {/*
          `AppDataProvider` Layout'un **disinda ve ProtectedRoute'un altinda**:
          grup listesi ile home ozeti korunan alana girildiginde bir kez
          cekiliyor, sayfa gecislerinde yeniden istenmiyor. Sidebar ve sayfalar
          ayni nesneyi okudugu icin grup olusturunca ikisi birden guncelleniyor
          (bkz. context/AppDataContext.ts).
        */}
        <Route
          element={
            <AppDataProvider>
              <Layout />
            </AppDataProvider>
          }
        >
          <Route path="/home" element={<HomePage />} />
          <Route path="/groups" element={<GroupsPage />} />
          <Route path="/activity" element={<ActivityPage />} />
          {/*
            Parametre bir uuid degil, grubun adindan uretilmis adres parcasi
            (`/groups/ev-arkadaslari`). Uuid'li eski adresler de ayni rotaya
            dusuyor ve calisiyor: backend ikisini de cozuyor, sayfa da adresi
            slug'a sessizce duzeltiyor (bkz. pages/GroupDetailPage.tsx).
          */}
          <Route path="/groups/:groupKey" element={<GroupDetailPage />} />
          <Route path="/contacts" element={<ContactsPage />} />
          <Route path="/fis-tara" element={<ReceiptScanPage />} />
          <Route path="/settings" element={<SettingsPage />}>
            <Route index element={<Navigate to="profile" replace />} />
            <Route path="profile" element={<ProfileTab />} />
            <Route path="security" element={<SecurityTab />} />
            <Route path="preferences" element={<PreferencesTab />} />
            <Route path="account" element={<AccountTab />} />
          </Route>

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
