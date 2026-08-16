import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

import { AnimatedThemeToggler } from '@/components/ui/animated-theme-toggler';
import { cn } from '@/lib/utils';
import { usePrefersReducedMotion } from '../hooks/useMediaQuery';

/**
 * Tema kontrolleri (2.6).
 *
 * UC SECENEK, IKI DEGIL
 * ---------------------
 * `acik | koyu | sistem`. "Sistem" bir varsayilan degil, **secilebilir bir
 * deger**: isletim sistemi gun icinde tema degistiren kullanicilar var ve
 * uygulamanin onlari takip etmesi bir tercih. Yalnizca iki durum tutsaydik,
 * bir kez tikladiktan sonra "sistemi takip et"e geri donmenin yolu kalmazdi.
 *
 * DURUM NEREDE TUTULUYOR
 * ----------------------
 * `next-themes` (zaten bagimliyiz: `ui/sonner` tema bilgisini oradan okuyor).
 * Secim `localStorage`'a yaziliyor, `<html>` uzerine `class="dark"` konuyor ve
 * ilk boyamadan once `index.html` icindeki kucuk script ayni sinifi uyguluyor
 * — yani sayfa yenilenince tema **yanip sonmuyor**.
 *
 * NEDEN SUNUCUYA YAZILMIYOR
 * -------------------------
 * Tema bir kullanici kaydi degil, **cihaz** tercihi: is bilgisayarinda koyu,
 * telefonda acik isteyen biri icin sunucuda tek bir deger tutmak yanlis cevap
 * olurdu. Ayrica sunucuda tutulsaydi tema ancak `GET /auth/me` dondukten sonra
 * uygulanabilirdi; acilista gorunur bir beyaz parlama demek.
 */

/**
 * `mounted` beklemesi: `next-themes` ilk render'da tercihi bilmez (deger
 * `localStorage`'dan mount sonrasi okunur). Beklemeden cizersek bir kare
 * boyunca **yanlis** ikon gorunur ve kullanici tikladiginda bir onceki durumu
 * gormus olur.
 */
const useMountedTheme = () => {
  const [mounted, setMounted] = useState(false);
  const { theme, resolvedTheme, setTheme } = useTheme();

  useEffect(() => setMounted(true), []);

  return { mounted, theme, resolvedTheme, setTheme };
};

/** Butonun olcusu iki durumda da ayni: mount oncesi/sonrasi bar sicramasin. */
const TOGGLE_CLASS =
  'theme-toggle inline-flex size-8 items-center justify-center rounded-md text-ink transition-colors hover:bg-ink/5 [&_svg]:size-4';

/**
 * Ust bardaki hizli gecis: yalnizca acik <-> koyu.
 *
 * GECIS ANIMASYONU — `AnimatedThemeToggler`
 * -----------------------------------------
 * Yeni tema, tiklanan noktadan disari acilan bir daire icinde ortaya cikiyor
 * (View Transitions API). Iki sey kazandiriyor: degisimin **nereden**
 * tetiklendigi gorunur oluyor, ve ani renk sicramasi yerine yonu belli bir
 * hareket kaliyor. Destegi olmayan tarayicida bilesen sessizce dogrudan
 * degistirmeye dusuyor — ek bir kontrol yazmaya gerek yok.
 *
 * NEDEN KONTROLLU KULLANIM (`theme` + `onThemeChange`)
 * ---------------------------------------------------
 * Bilesenin kendi hali `localStorage`'a **`theme`** anahtariyla yaziyor; bizim
 * anahtarimiz `evenup.theme` (bkz. lib/theme.ts) ve tercihi `next-themes`
 * yonetiyor. Kontrolsuz birakilsaydi iki ayri kayit olusur, sayfa yenilendiginde
 * `index.html`'deki acilis script'i **eski** degeri okur ve tema geri atardi.
 * Kontrollu halde saklama tek elde kaliyor; bilesene yalnizca animasyon dusuyor.
 */
export const ThemeToggle = () => {
  const { mounted, resolvedTheme, setTheme } = useMountedTheme();
  // Kosullu return'un ustunde: hook sirasi her render'da ayni kalmali.
  const reducedMotion = usePrefersReducedMotion();

  const isDark = resolvedTheme === 'dark';
  // Etiket **eylemi** anlatiyor ("koyu temaya gec"), durumu degil: ekran
  // okuyucu kullanicisi butona basinca ne olacagini bilmeli.
  const label = isDark ? 'Acik temaya gec' : 'Koyu temaya gec';

  /*
    Mount olmadan once notr bir ikon: yanlis durum gostermektense yansiz.
    Ayri bir oge olmasinin ikinci nedeni kontrollu kullanim — `theme` prop'u
    `undefined` gecilirse bilesen kontrolsuz moda duser ve yukaridaki cift
    kayit sorunu geri gelir. Tercih bilinmeden o bilesen hic cizilmiyor.
  */
  if (!mounted) {
    return (
      <span className={TOGGLE_CLASS} aria-hidden>
        <Monitor className="size-4" />
      </span>
    );
  }

  return (
    <AnimatedThemeToggler
      className={TOGGLE_CLASS}
      aria-label={label}
      title={label}
      theme={isDark ? 'dark' : 'light'}
      onThemeChange={setTheme}
      // `prefers-reduced-motion` altinda acilan daire kapaniyor. index.css'teki
      // genel kural buna yetmiyor: efekt bir CSS gecisi degil, pseudo-oge
      // uzerinde calisan bir Web Animations animasyonu.
      duration={reducedMotion ? 0 : 400}
    />
  );
};

const THEME_OPTIONS = [
  { value: 'light', label: 'Acik', icon: Sun },
  { value: 'dark', label: 'Koyu', icon: Moon },
  { value: 'system', label: 'Sistem', icon: Monitor },
] as const;

/**
 * Ayarlar sayfasindaki uc secenekli kontrol.
 *
 * `radiogroup` rolu bilincli: bu bir buton grubu degil, **birbirini disleyen
 * bir secim**. Rol dogru verilince ekran okuyucu "3 secenekten 2.si, secili"
 * diye okur; uc ayri buton olsaydi hangisinin acik oldugu duyulmazdi.
 */
export const ThemeChoice = () => {
  const { mounted, theme, setTheme } = useMountedTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Tema"
      className="theme-choice flex flex-wrap gap-2"
    >
      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
        // Secili olan `theme` (ham tercih), `resolvedTheme` degil: kullanici
        // "Sistem"i sectiyse isaretlenmesi gereken kutu "Sistem"dir, sistemin
        // o an hangi temayi verdigi degil.
        const selected = mounted && theme === value;

        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setTheme(value)}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
              selected
                ? 'border-rose/35 bg-rose/10 text-rose'
                : 'border-ink/12 text-ink-muted hover:bg-ink/5 hover:text-ink'
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
};

export default ThemeToggle;
