import {
  Bell,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  House,
  IdCard,
  LogOut,
  Moon,
  ScanLine,
  Settings,
  ShieldCheck,
  Sun,
  User as UserIcon,
  Users,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AnimatedGradientText } from '@/components/ui/animated-gradient-text';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import useAuth from '../hooks/useAuth';
import { useGroupsData, useSummaryData } from '../hooks/useAppData';
import { colorOfGroup } from '../utils/groupColor';
import { groupPath } from '../utils/groupPath';

import type { LucideIcon } from 'lucide-react';

/**
 * Sol sidebar — uygulamanin tek gezinme yuzeyi.
 *
 * ONCE UST YATAY BARDI
 * --------------------
 * Yatay bar dort hedefte zaten sikisiyordu (dar ekranda Admin ve Ayarlar
 * gizleniyordu) ve grup kisayollari icin hic yeri yoktu. Dikey eksen bu iki
 * sorunu birden cozuyor: oge sayisi arttikca liste uzuyor, sikismiyor.
 *
 * UC HAL
 * ------
 *   genis   : ikon + yazi (varsayilan)
 *   dar     : yalnizca ikon + grup noktalari, isimler hover'da ipucunda
 *   mobil   : ekran disinda; hamburger ile ustune acilan bir katman
 *
 * Tek bir `<aside>` var — dar ekran icin ikinci bir kopya **cizilmiyor**.
 * Iki kopya olsaydi ayni baglantilar DOM'da iki kez bulunur, ekran okuyucu
 * hepsini iki kez duyurur ve testlerde her sorgu "birden fazla eslesme"
 * hatasi verirdi. Mobil hal, ayni ogenin `translate-x` ile ekran disina
 * kaydirilmis hali.
 *
 * YUKSEKLIK VE KAYDIRMA
 * ---------------------
 * Kap tam olarak `h-screen` (100vh) ve **tek** kaydirma alani: `overflow-y-auto`
 * yalnizca `<aside>` uzerinde. Ic bloklarin hicbirinde `flex-1` ya da kendi
 * `overflow`u yok, dolayisiyla:
 *
 *   - icerik sigiyorsa hicbir kaydirma cubugu gorunmuyor,
 *   - icerik tasarsa **tek** cubuk cikiyor (ic ice iki kaydirma alani degil).
 *
 * `overflow-x-clip` bilincli: CSS'te bir eksen `visible` disi bir deger alirsa
 * **digeri de** `auto`ya doner. Yani `overflow-y-auto` tek basina yazilinca
 * yatay eksen de kaydirilabilir hale geliyor ve saga tasan tek bir piksel
 * altta bir yatay cubuk cikariyor. Dar halde isim ipuclari mutlak konumla
 * sidebar'in disina tasindigi icin bu tam olarak yasandi; ipucu artik yerel
 * `title` ile veriliyor (asagida) ve `clip` de ayni hatanin tekrarina karsi
 * duruyor. `hidden` degil `clip`: `clip` programatik kaydirmayi da kapatir.
 *
 * Bloklar arasinda `mt-auto` gibi bir itme de yok: kullanici blogu grup
 * listesinin hemen altinda, icerigin dogal devami olarak duruyor. Onceki
 * surumde `flex-1` + `mt-auto` ikilisi az grubu olan kullanicida sidebar'in
 * ortasinda kocaman bir bosluk birakiyordu.
 *
 * VERI NEREDEN
 * ------------
 * Grup listesi ve bekleyen odeme sayisi `AppDataProvider`dan geliyor; sidebar
 * **hicbir istek atmiyor**. Ayni veriyi Gruplarim sayfasi ve Home kartlari da
 * okuyor, dolayisiyla grup olusturulunca sidebar kendiliginden guncelleniyor
 * (bkz. context/AppDataContext.ts).
 */

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** `true` -> bekleyen odeme sayisi rozeti bu ogede gosterilir. */
  badge?: boolean;
}

const NAV_ITEMS: readonly NavItem[] = [
  { to: '/home', label: 'Ana Sayfa', icon: House },
  { to: '/groups', label: 'Gruplarim', icon: Users },
  { to: '/activity', label: 'Aktivite', icon: Bell, badge: true },
  { to: '/contacts', label: 'Kisiler', icon: IdCard },
  // Henuz islevsiz (bkz. pages/ReceiptScanPage.tsx); sekme yine de gercek —
  // Ayarlar'la ayni kural, "yakinda" olmasi tiklanamaz olmasini gerektirmiyor.
  { to: '/fis-tara', label: 'Fis Tara', icon: ScanLine },
  { to: '/settings', label: 'Ayarlar', icon: Settings },
];

/** Ad-soyaddan iki harflik bas harf. Bos ada karsi savunmali. */
const initialsOf = (name: string | undefined): string => {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return '?';
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
};

interface SidebarProps {
  /** Dar (ikon-only) hal. Mobil katman acikken yok sayilir. */
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Mobilde katman acik mi. */
  mobileOpen: boolean;
  /** Bir hedefe gidildiginde mobil katmani kapatmak icin. */
  onNavigate: () => void;
}

const Sidebar = ({ collapsed, onToggleCollapsed, mobileOpen, onNavigate }: SidebarProps) => {
  const { isAdmin } = useAuth();
  const groups = useGroupsData();
  const summary = useSummaryData();

  /*
    Mobil katman acikken tercih yok sayiliyor: telefonda ekranin ustune acilan
    bir katmanin ikon-only olmasinin hicbir kazanci yok — yer zaten var ve
    kullanici oraya isim okumaya geliyor.
  */
  const compact = collapsed && !mobileOpen;

  /*
    Iki ayri sayi tek rozette toplaniyor: onay bekleyen odemeler (yalnizca
    Onayla/Reddet'e basinca azalir) + okunmamis diger aktivite (Aktivite
    sayfasi acilinca azalir). Kullaniciya tek bir "Aktivite'de bakilacak bir
    sey var" sayisi olarak gorunuyor — iki ayri rozet acmak ayni bilgiyi iki
    kez sormak olurdu. Gerekce: docs/decisions/aktivite-okunma-sayaci.md.
  */
  const pending =
    (summary.data?.pendingSettlementsCount ?? 0) + (summary.data?.unseenActivityCount ?? 0);

  const items = isAdmin
    ? [...NAV_ITEMS, { to: '/admin', label: 'Admin', icon: ShieldCheck }]
    : NAV_ITEMS;

  return (
    <aside
      className={cn(
        'sidebar fixed inset-y-0 left-0 z-50 flex h-screen flex-col overflow-x-clip overflow-y-auto border-r border-ink/10 bg-cream transition-[transform,width] duration-200',
        // Genislik tek yerde: ic ogeler `w-full` ile buna uyuyor.
        compact ? 'w-16' : 'w-64',
        // Mobil: ekran disinda bekliyor. lg'den itibaren akisin icinde.
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
        'lg:sticky lg:top-0 lg:translate-x-0'
      )}
      /*
        Kap `aside` (complementary), icindeki iki liste ayri birer `nav`:
        ana hedefler ile grup kisayollari ayni eksende duruyor ama ayni turden
        degil. Ekran okuyucu ikisini ayri ayri atlayabiliyor.
      */
      aria-label="Kenar cubugu"
    >
      {/*
        Marka + daralt/genislet.

        `sticky top-0`: liste uzayip sidebar kayarsa bu satir yerinde kaliyor —
        kontrol her zaman ayni noktada. Zemin opak, aksi halde altindan gecen
        satirlar okunurdu.
      */}
      <div
        className={cn(
          'sidebar__head sticky top-0 z-10 flex shrink-0 items-center gap-2 bg-cream py-3',
          compact ? 'flex-col px-2' : 'px-4'
        )}
      >
        <NavLink to="/home" onClick={onNavigate} className="text-lg font-semibold">
          {compact ? (
            <span className="font-display text-rose" aria-label="EvenUp">
              E
            </span>
          ) : (
            <AnimatedGradientText
              className="font-display tracking-tight"
              colorFrom="var(--color-rose)"
              colorTo="var(--color-lilac)"
            >
              EvenUp
            </AnimatedGradientText>
          )}
        </NavLink>

        {/*
          Kontrol markanin yaninda (dar halde altinda). Onceki surumde
          sidebar'in en altindaydi: kullanicinin en cok kullandigi dugmeyi,
          grup listesi uzadikca asagi kayan bir yere koymak yanlisti.

          Yalnizca genis ekranda: mobilde sidebar zaten bir katman ve orada
          "dar hal" diye bir sey yok.
        */}
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-pressed={collapsed}
          aria-label={compact ? 'Genislet' : 'Daralt'}
          title={compact ? 'Genislet' : 'Daralt'}
          className={cn(
            'hidden size-7 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-ink/5 hover:text-ink lg:inline-flex',
            compact ? '' : 'ml-auto'
          )}
        >
          {compact ? (
            <ChevronsRight className="size-4" aria-hidden />
          ) : (
            <ChevronsLeft className="size-4" aria-hidden />
          )}
        </button>
      </div>

      {/* ------------------------------------------------------- ana gezinme */}
      <nav aria-label="Ana gezinme" className={cn('flex flex-col gap-1', compact ? 'px-2' : 'px-3')}>
        {items.map((item) => (
          <SidebarLink
            key={item.to}
            to={item.to}
            label={item.label}
            icon={item.icon}
            compact={compact}
            onNavigate={onNavigate}
            badge={item.badge ? pending : 0}
          />
        ))}
      </nav>

      {/* ---------------------------------------------------- grup kisayollari */}
      <nav aria-label="Grup kisayollari" className={cn('mt-4', compact ? 'px-2' : 'px-3')}>
        {/* Ayrac: iki liste ayni eksende ama ayni turden degil. */}
        <div className={cn('mb-2 border-t border-ink/10', compact && 'mx-1')} />

        {!compact && (
          <p className="mb-1 px-3 text-xs font-medium tracking-[0.12em] text-ink-muted uppercase">
            Gruplarim
          </p>
        )}

        {groups.loading && <GroupsSkeleton compact={compact} />}

        {!groups.loading && groups.error && !compact && (
          <p className="px-3 py-1 text-xs text-ink-muted">Gruplar su an alinamadi.</p>
        )}

        {!groups.loading &&
          !groups.error &&
          groups.data?.map((group) => (
            <SidebarLink
              key={group.id}
              to={groupPath(group)}
              label={group.name}
              dotColor={colorOfGroup(group.id)}
              compact={compact}
              onNavigate={onNavigate}
            />
          ))}

        {!groups.loading && !groups.error && groups.data?.length === 0 && !compact && (
          <p className="px-3 py-1 text-xs text-ink-muted">Henuz grubun yok.</p>
        )}
      </nav>

      {/*
        Kullanici menusu listenin **hemen altinda**, sidebar'in dibine yapisik
        degil. `pb-4` yalnizca son ogenin kenara degmemesi icin.
      */}
      <div className={cn('mt-4 pb-4', compact ? 'px-2' : 'px-3')}>
        <UserMenu compact={compact} onNavigate={onNavigate} />
      </div>
    </aside>
  );
};

/**
 * Hesap menusu — ince cerceveli bir **kart**, ayni zamanda **tek** tiklanabilir
 * tetikleyici (2.6, Ayarlar yeniden tasarimi -> docs/decisions/ayarlar-sayfasi.md).
 *
 * Onceki surumde burada uc ayri kontrol vardi (avatar, tema ikonu, cikis
 * ikonu). Uc ikon yan yana, dar halde alt alta uc satir demekti ve ucu de
 * ayni sey hakkinda: hesap. Tek bir tetikleyici + menu hem daralmis halde tek
 * satira sigiyor hem de tema/cikis'i ayni yerde topluyor.
 *
 * NEDEN "TIKLAYINCA DOGRUDAN AYARLARA GIT" DEGIL, ACILIR MENU
 * -------------------------------------------------------------
 * Istekte "tiklanince Ayarlar > Profil'e gider" deniyordu ama bu kutu zaten
 * calisan tema gecisi ve cikis'i tasiyor — dogrudan yonlendirme bu ikisini
 * baska bir yere tasimayi gerektirirdi. `çalışan her şeyi taşı` kurali
 * geregince menu korunuyor; kart artik **acilir menunun tetikleyicisi** ve
 * menunun ilk ogesi "Profili duzenle" olarak Ayarlar > Profil'e goturuyor —
 * boylece kartin kendisi de "profile giden bir yer" hissini veriyor.
 *
 * TEMA: MENU ICINDE HIZLI GECIS
 * -----------------------------
 * Ust bardaki `ThemeToggle` (View Transitions ile acilan daire animasyonu)
 * buraya tasinmadi: o efekt tiklanan noktadan disari aciliyor ve menu ogesi
 * tiklanir tiklanmaz **kayboluyor** — daire yok olan bir ogeden buyurdu.
 * Burada duz bir gecis var, etiketi yine **eylemi** anlatiyor ("Koyu temaya
 * gec"). Uc secenekli tam kontrol (Acik/Koyu/Sistem) yerinde duruyor: Ayarlar.
 */
const UserMenu = ({ compact, onNavigate }: { compact: boolean; onNavigate: () => void }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { resolvedTheme, setTheme } = useTheme();

  /*
    `next-themes` tercihi mount'tan sonra okuyor; beklemeden cizersek bir kare
    boyunca yanlis etiket gorunur ve kullanici tikladiginda bir onceki durumu
    gormus olur (ayni gerekce: ThemeToggle).
  */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === 'dark';

  // Ikinci satir: takma ad varsa o, yoksa e-posta. Bos bir satir birakmaktansa
  // her zaman elde olan bir bilgiyi gostermek daha faydali.
  const secondLine = user?.handle ? `@${user.handle}` : user?.email;

  const handleLogout = () => {
    onNavigate();
    logout();
    navigate('/login', { replace: true });
  };

  const handleEditProfile = () => {
    onNavigate();
    navigate('/settings/profile');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'sidebar__user flex w-full items-center gap-2 rounded-lg border border-ink/10 py-2 text-left transition-colors hover:bg-ink/5',
          compact ? 'justify-center px-0' : 'px-2'
        )}
        aria-label="Hesap menusu"
      >
        <Avatar className="size-7 shrink-0">
          {user?.avatar && <AvatarImage src={user.avatar} alt="" />}
          {/* `text-white` degil `text-cream`: koyu temada rose acik gule
              doner ve uzerindeki beyaz metin okunmaz olurdu. */}
          <AvatarFallback className="bg-rose text-xs font-semibold text-cream">
            {initialsOf(user?.name)}
          </AvatarFallback>
        </Avatar>

        {!compact && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink">{user?.name}</span>
              <span className="block truncate text-xs text-ink-muted">{secondLine}</span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-ink-muted" aria-hidden />
          </>
        )}
      </DropdownMenuTrigger>

      {/* `side="top"`: menu sidebar'in altina degil ustune aciliyor — tetikleyici
          zaten sayfanin alt yarisinda olabiliyor ve asagida yer kalmayabilir. */}
      <DropdownMenuContent align="start" side="top" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-medium text-ink">{user?.name}</p>
          <p className="truncate text-xs text-ink-muted">{secondLine}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={handleEditProfile}>
          <UserIcon aria-hidden />
          Profili duzenle
        </DropdownMenuItem>

        <DropdownMenuItem onSelect={() => setTheme(isDark ? 'light' : 'dark')}>
          {isDark ? <Sun aria-hidden /> : <Moon aria-hidden />}
          {isDark ? 'Acik temaya gec' : 'Koyu temaya gec'}
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleLogout}>
          <LogOut aria-hidden />
          Cikis
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

/**
 * Tek bir gezinme satiri — hem ana ogeler hem grup kisayollari.
 *
 * ERISILEBILIR AD HER ZAMAN VAR
 * -----------------------------
 * Dar halde yazi `sr-only` ile gizleniyor, **kaldirilmiyor**. Boylece ekran
 * okuyucu ve klavye kullanicisi icin baglantinin adi degismiyor; degisen
 * yalnizca gorunen sey. Yerine `aria-label` yazmak da olurdu ama o zaman ad
 * iki yerde tanimli olurdu ve biri gunun birinde digerinden ayrisirdi.
 *
 * IPUCU: YEREL `title`, CSS BALONU DEGIL
 * --------------------------------------
 * Once mutlak konumlu bir balon (`.sidebar__tip`) vardi ve satirin sagina,
 * sidebar'in **disina** tasiyordu. Kap `overflow-y-auto` oldugu icin yatay
 * eksen de kaydirilabilir hale geliyor ve o tasma altta bir yatay kaydirma
 * cubugu uretiyordu — dar halde her zaman gorunen bir cubuk. `title` hem bu
 * sorunu tamamen kaldiriyor hem de tarayicinin kendi ipucunu kullaniyor.
 */
const SidebarLink = ({
  to,
  label,
  icon: Icon,
  dotColor,
  compact,
  badge = 0,
  onNavigate,
}: {
  to: string;
  label: string;
  icon?: LucideIcon;
  /** Grup kisayollarinda ikon yerine renkli nokta. */
  dotColor?: string;
  compact: boolean;
  badge?: number;
  onNavigate: () => void;
}) => (
  <NavLink
    to={to}
    onClick={onNavigate}
    // Yalnizca dar halde: genis halde ad zaten satirda yaziyor.
    title={compact ? label : undefined}
    className={({ isActive }) =>
      cn(
        'sidebar__item relative flex items-center gap-3 rounded-md py-2 text-sm font-medium transition-colors',
        compact ? 'justify-center px-0' : 'px-3',
        // Aktif hal iki kanaldan: zemin + sol kenar cizgisi. Yalnizca renk
        // olsaydi, renk korlugu olan kullanicida "neredeyim" sorusu cevapsiz
        // kalirdi.
        isActive
          ? 'sidebar__item--active bg-rose/10 text-rose'
          : 'text-ink-muted hover:bg-ink/5 hover:text-ink'
      )
    }
  >
    {Icon && <Icon className="size-4.5 shrink-0" aria-hidden />}

    {dotColor && (
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: dotColor }}
        aria-hidden
      />
    )}

    <span className={compact ? 'sr-only' : 'min-w-0 flex-1 truncate'}>{label}</span>

    {badge > 0 && (
      <span
        className={cn(
          'sidebar__badge flex items-center justify-center rounded-full bg-rose px-1.5 text-[0.7rem] font-semibold text-cream',
          // Dar halde sayi ikonun ustune biniyor: satirda yer yok ama bilgi
          // kaybolmamali.
          compact ? 'absolute top-1 right-2 size-4 px-0' : 'min-w-5'
        )}
      >
        {badge}
      </span>
    )}
  </NavLink>
);

/** Grup listesi iskeleti: liste gelince sidebar ziplamasin. */
const GroupsSkeleton = ({ compact }: { compact: boolean }) => (
  <div className="flex flex-col gap-1 px-1 py-1" aria-hidden>
    {[0, 1, 2].map((index) => (
      <Skeleton key={index} className={cn('h-7 rounded-md', compact ? 'w-8' : 'w-full')} />
    ))}
  </div>
);

export default Sidebar;
