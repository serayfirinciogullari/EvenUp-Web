import { useEffect, useRef, type ComponentPropsWithoutRef } from 'react';
import { useMotionValue, useSpring } from 'motion/react';

import { cn } from '@/lib/utils';

/**
 * NumberTicker — Magic UI'dan kopyalandi (magicui.design/docs/components/number-ticker),
 * bu projeye uyarlandi. Kopyala-yapistir bir bilesen oldugu icin kaynak bizim;
 * asagidaki dort degisiklik bilincli:
 *
 * 1. **Bicimlendirme disaridan geliyor (`format`).**
 *    Ozgun surum `Intl.NumberFormat("en-US")` ile yaziyordu: "105". Bizim para
 *    bicimimiz "105,00 ₺" ve kaynagi `utils/money.ts` — tek kapi (docs/decisions/1.5,
 *    2.3). Ticker kendi basina para bicimlendirseydi projede ikinci bir para
 *    bicimlendirme yolu acilmis olurdu.
 *
 * 2. **Deger TAM SAYI KURUS.** Ondalik sayi hic girmiyor; ara karelerde bile
 *    yuvarlama hatasi olusamaz.
 *
 * 3. **Ilk render'da animasyon YOK, yalnizca DEGISIMDE var.**
 *    Ozgun surum gorunur olunca 0'dan sayiyordu. Gorevin istedigi sey
 *    "bakiye degistiginde animasyonlu gecmesi"; ilk acilista her bakiyenin
 *    sifirdan sayilmasi hem gurultu olurdu hem de bir an icin **yanlis bir
 *    tutar** gostermek demekti. Bir gider uygulamasinda bu kabul edilemez.
 *    Bu yuzden ilk metin dogrudan son deger; sonraki degisimler animasyonlu.
 *
 * 4. **`useInView` kaldirildi.** Kartlar zaten ekranda; IntersectionObserver
 *    bagimliligi test ortaminda da gereksiz kirilganlik uretiyordu.
 *
 * ERISILEBILIRLIK: metin `aria-live` ile duyurulmuyor. Hizla degisen bir sayiyi
 * ekran okuyucuya akitmak faydali degil, gurultudur; son deger DOM'da durdugu
 * icin talep uzerine dogru okunur.
 */

interface NumberTickerProps extends Omit<ComponentPropsWithoutRef<'span'>, 'children'> {
  /** Tam sayi kurus. */
  value: number;
  /**
   * Kurusu metne cevirir. **Kararli (module-level) bir fonksiyon olmali**;
   * her render'da yeniden uretilirse abonelik bosuna kurulur.
   */
  format: (cents: number) => string;
}

/** `prefers-reduced-motion` — matchMedia olmayan ortamlarda (jsdom) guvenli. */
const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function NumberTicker({ value, format, className, ...props }: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement>(null);

  /**
   * Ilk metin bir kez hesaplanip sabitleniyor. React'in cocuk olarak her
   * render'da `format(value)` yazmasina izin verilseydi, deger degistigi anda
   * React son degeri basar, hemen ardindan yay eski degerden baslayip uzerine
   * yazardi — sayi bir an ileri gidip geri donerdi.
   */
  const initialText = useRef(format(value));
  const previous = useRef(value);

  const motionValue = useMotionValue(value);
  const spring = useSpring(motionValue, { damping: 30, stiffness: 140 });

  useEffect(() => {
    if (previous.current === value) {
      return;
    }

    previous.current = value;

    if (prefersReducedMotion()) {
      if (ref.current) {
        ref.current.textContent = format(value);
      }
      // Yay da senkron tutuluyor, yoksa sonraki gecis yanlis noktadan baslar.
      motionValue.jump(value);
      return;
    }

    motionValue.set(value);
  }, [value, format, motionValue]);

  useEffect(
    () =>
      spring.on('change', (latest) => {
        if (ref.current) {
          ref.current.textContent = format(Math.round(latest));
        }
      }),
    [spring, format]
  );

  return (
    <span ref={ref} className={cn('inline-block tabular-nums', className)} {...props}>
      {initialText.current}
    </span>
  );
}
