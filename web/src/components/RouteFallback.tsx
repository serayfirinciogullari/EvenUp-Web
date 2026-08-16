import { useEffect, useState } from 'react';

import { AnimatedCircularProgressBar } from '@/components/ui/animated-circular-progress-bar';

/**
 * Guard'lar karar veremezken (oturum dogrulanirken) gosterilen ara ekran.
 * Ayri bir bilesen: uc guard'in ayni bekleme davranisini paylasmasi icin.
 *
 * DONEN IKON YERINE DAIRESEL GOSTERGE
 * -----------------------------------
 * Onceki hali `Loader2` + `animate-spin` idi: donuyordu ama "ne kadar kaldi"
 * sorusuna dair hicbir sey soylemiyordu. Dairesel gosterge bekleyisi
 * **ilerleyen** bir seye cevirdigi icin ayni sure daha kisa hissettiriyor.
 *
 * ILERLEME NEDEN SAHTE — VE NEDEN EKRAN OKUYUCUYA SOYLENMIYOR
 * -----------------------------------------------------------
 * Beklenen sey tek bir `GET /auth/me`; HTTP istegi ilerleme yayinlamaz, yani
 * olcecek gercek bir yuzde yok. Gosterge %90'a kadar **yavaslayarak** tirmaniyor
 * ve orada duruyor: istek bittiginde bilesen zaten unmount oluyor, dolayisiyla
 * "100" hicbir zaman yalan yere gosterilmiyor.
 *
 * Sayi `aria-hidden`: uydurulmus bir yuzdeyi ekran okuyucuya gercek bir ilerleme
 * gibi okutmak, gorsel bir suslemeyi bilgiye terfi ettirmek olurdu. Mesaji
 * tasiyan sey yanindaki metin — `role="status"` onun uzerinde.
 */

/** Gostergenin durdugu tavan: bunun otesi "bitti" demek olurdu, bilmiyoruz. */
const CEILING = 90;
const TICK_MS = 220;

/**
 * Kalan mesafenin sabit bir oranini kapatir; boylece adimlar kendiliginden
 * kuculur (once hizli, sonra yavas). Dogrusal artis %90'a erken varip orada
 * donuk kalirdi — asil bekleyisin en uzun oldugu an.
 */
const useCreepingProgress = () => {
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setPercent((current) => current + (CEILING - current) * 0.18);
    }, TICK_MS);

    return () => clearInterval(timer);
  }, []);

  return percent;
};

const RouteFallback = ({ label }: { label: string }) => {
  const percent = useCreepingProgress();

  return (
    <div
      className="route-fallback flex min-h-screen flex-col items-center justify-center gap-4 bg-cream text-ink-muted"
      role="status"
      aria-live="polite"
    >
      {/* `aria-hidden` sarmalayicida: bilesenin prop'lari kapali bir kume,
          disaridan HTML niteligi almiyor. */}
      <div aria-hidden>
        <AnimatedCircularProgressBar
          value={percent}
          // Token'lar uzerinden: koyu temada (2.6) ikisi de birlikte degisiyor.
          gaugePrimaryColor="var(--color-rose)"
          gaugeSecondaryColor="color-mix(in srgb, var(--color-ink) 12%, transparent)"
          className="size-24 text-lg text-ink"
        />
      </div>
      <span className="text-sm">{label}</span>
    </div>
  );
};

export default RouteFallback;
