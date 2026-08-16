import { motion, useMotionValue, useSpring } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useFinePointer, usePrefersReducedMotion } from '../hooks/useMediaQuery';

/**
 * Uygulama imleci — iki parca.
 *
 *   NOKTA  : ince, keskin, `rose`. Gecikmesiz; **gercek imlec konumu** bu.
 *   HALKA  : yumusak, `blush`. Noktayi yay fizigiyle takip eder ve etkilesimli
 *            bir ogenin uzerine gelince buyuyup ona **kilitlenir**.
 *
 * NEDEN IKI PARCA
 * ---------------
 * Tek parcali "gecikmeli" bir imlec kullanilamaz: tiklama noktasi ile
 * gorunen nokta arasindaki fark, kullaniciyi isabetsiz hissettirir. Bu yuzden
 * dogruluk ve suslemenin **isi bolunuyor** — nokta her zaman tam yerinde,
 * gecikme yalnizca dekoratif halkada. Halka yanlis yerde durdugunda kimse bir
 * sey kacirmiyor; nokta yanlis yerde dursa her tiklama tereddutlu olurdu.
 *
 * MIKNATISLANMA
 * -------------
 * Halka etkilesimli ogenin **merkezine** oturup olcusunu aliyor; bu sirada
 * fareyle birlikte hareket etmeyi birakiyor — "kilitlenme" duygusu tam olarak
 * bundan geliyor. Nokta bu sirada da serbest, cunku o gercek konumu gosteriyor.
 *
 * PERFORMANS: HER KAREDE RENDER YOK
 * ---------------------------------
 * Konum ve olcu React state'inde degil `MotionValue` icinde tutuluyor; bunlar
 * DOM'a React agacini yeniden render etmeden yaziliyor. `mousemove` saniyede
 * onlarca kez tetiklenir — orada `setState` cagirmak butun sayfayi her fare
 * hareketinde yeniden render ederdi. Yalnizca **nadiren** degisen iki sey
 * (gorunurluk, kilitli mi) state: ikisi de hareket basina degil, durum
 * degisimi basina bir kez yaziliyor.
 */

/** Nokta: ince ve keskin. Buyudukce "gercek konum" isareti olmaktan cikar. */
const DOT_SIZE = 6;

/** Halkanin serbest (kilitlenmemis) capi. */
const RING_SIZE = 34;

/** Kilitlenirken ogenin cevresinde birakilan bosluk. */
const MAGNET_PADDING = 6;

/**
 * Buyuk ogelere kilitlenilmiyor. Ekranin yarisini kaplayan bir halka
 * "mıknatis" degil, "vurgu katmani" gibi gorunur ve imlecin nerede oldugunu
 * anlatmayi tamamen birakir.
 */
const MAX_MAGNET_WIDTH = 460;
const MAX_MAGNET_HEIGHT = 320;

/** Konum yayi: takip belirgin olacak kadar gevsek, saliniyor gorunmeyecek kadar sonumlu. */
const POSITION_SPRING = { stiffness: 260, damping: 26, mass: 0.55 };

/** Olcu yayi biraz daha sert: buyume/kuculme "yapiskan" degil, kararli hissetmeli. */
const SIZE_SPRING = { stiffness: 320, damping: 30, mass: 0.5 };

/**
 * Neye kilitleniliyor: **gercekten etkilesimli** ogeler.
 *
 * Liste bilerek dar. Ornegin Home'daki istatistik karti (`article`) buraya
 * girmiyor: tiklanabilir olmayan bir seye kilitlenmek, kullaniciya olmayan bir
 * eylem vaat etmek olurdu. Grup karti ise listede — icindeki yayilmis link
 * (`a[href]`) sayesinde kartin her yeri zaten tiklanabilir.
 *
 * `[data-magnetic]` bir kacis kapisi: standart bir role oturmayan ozel bir
 * ogeye elle isaret koymak icin.
 */
const MAGNET_SELECTOR = [
  'a[href]',
  'button:not(:disabled)',
  '[role="button"]',
  '[role="tab"]',
  '[role="radio"]',
  '[role="menuitem"]',
  'input:not([type="hidden"]):not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[data-magnetic]',
].join(',');

/** `<html data-app-cursor="on">`: global `cursor: none` kurali buna bakiyor. */
const CURSOR_FLAG = 'appCursor';

/** Ogenin kose yaricapi; yuzde degerler icin kisa kenarin yarisi. */
const radiusOf = (element: Element, width: number, height: number): number => {
  const raw = getComputedStyle(element).borderRadius.split(' ')[0] ?? '0';

  if (raw.endsWith('%')) {
    return (Math.min(width, height) * (parseFloat(raw) || 0)) / 100;
  }

  return parseFloat(raw) || 0;
};

const AppCursor = () => {
  const finePointer = useFinePointer();
  const reducedMotion = usePrefersReducedMotion();
  const active = finePointer && !reducedMotion;

  // Nokta: ham degerler, yay yok — gecikmesiz olmasinin tek yolu bu.
  const dotX = useMotionValue(-100);
  const dotY = useMotionValue(-100);

  // Halka: hedefler ham, gorunen degerler yayli.
  const targetX = useMotionValue(-100);
  const targetY = useMotionValue(-100);
  const targetWidth = useMotionValue(RING_SIZE);
  const targetHeight = useMotionValue(RING_SIZE);
  const targetRadius = useMotionValue(RING_SIZE / 2);

  const ringX = useSpring(targetX, POSITION_SPRING);
  const ringY = useSpring(targetY, POSITION_SPRING);
  const ringWidth = useSpring(targetWidth, SIZE_SPRING);
  const ringHeight = useSpring(targetHeight, SIZE_SPRING);
  const ringRadius = useSpring(targetRadius, SIZE_SPRING);

  const [visible, setVisible] = useState(false);
  const [magnetized, setMagnetized] = useState(false);

  /** O an kilitlenilen oge. `null` = serbest. Ref, cunku her karede okunuyor. */
  const lockedRef = useRef<Element | null>(null);
  const visibleRef = useRef(false);

  useEffect(() => {
    if (!active) {
      return;
    }

    document.documentElement.dataset[CURSOR_FLAG] = 'on';

    /** Halkanin hedefini serbest konuma alir. */
    const release = (x: number, y: number): void => {
      targetX.set(x);
      targetY.set(y);
      targetWidth.set(RING_SIZE);
      targetHeight.set(RING_SIZE);
      targetRadius.set(RING_SIZE / 2);
    };

    /** Halkayi ogenin olcusune ve merkezine oturtur. */
    const lockOnto = (element: Element): boolean => {
      const rect = element.getBoundingClientRect();

      // Olcusuz (henuz cizilmemis ya da gizli) ve asiri buyuk ogeler atlanir.
      if (
        rect.width === 0 ||
        rect.height === 0 ||
        rect.width > MAX_MAGNET_WIDTH ||
        rect.height > MAX_MAGNET_HEIGHT
      ) {
        return false;
      }

      targetX.set(rect.left + rect.width / 2);
      targetY.set(rect.top + rect.height / 2);
      targetWidth.set(rect.width + MAGNET_PADDING * 2);
      targetHeight.set(rect.height + MAGNET_PADDING * 2);
      targetRadius.set(radiusOf(element, rect.width, rect.height) + MAGNET_PADDING);

      return true;
    };

    const handleMove = (event: MouseEvent) => {
      dotX.set(event.clientX);
      dotY.set(event.clientY);

      if (!visibleRef.current) {
        visibleRef.current = true;
        setVisible(true);
      }

      const target = event.target instanceof Element ? event.target : null;
      const candidate = target?.closest(MAGNET_SELECTOR) ?? null;

      if (candidate === lockedRef.current) {
        // Kilitliyken halka fareyi **takip etmiyor**; kilitlenme duygusu bu.
        if (!lockedRef.current) {
          release(event.clientX, event.clientY);
        }
        return;
      }

      if (candidate && lockOnto(candidate)) {
        lockedRef.current = candidate;
        setMagnetized(true);
        return;
      }

      lockedRef.current = null;
      setMagnetized(false);
      release(event.clientX, event.clientY);
    };

    /**
     * Sayfa kaydiginca kilitli ogenin ekrandaki yeri degisir; halka onunla
     * birlikte gitmezse "kilitli" gorunmez. Oge DOM'dan cikmissa kilit birakilir.
     */
    const handleScroll = () => {
      const locked = lockedRef.current;

      if (!locked) {
        return;
      }

      if (!locked.isConnected || !lockOnto(locked)) {
        lockedRef.current = null;
        setMagnetized(false);
      }
    };

    const handleLeave = () => {
      visibleRef.current = false;
      setVisible(false);
      lockedRef.current = null;
      setMagnetized(false);
    };

    window.addEventListener('mousemove', handleMove, { passive: true });
    // `capture`: kaydirma ic kaplarda da olabiliyor ve o olaylar balonlanmaz.
    window.addEventListener('scroll', handleScroll, { passive: true, capture: true });
    document.addEventListener('mouseleave', handleLeave);

    return () => {
      delete document.documentElement.dataset[CURSOR_FLAG];
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('scroll', handleScroll, { capture: true });
      document.removeEventListener('mouseleave', handleLeave);
    };
  }, [
    active,
    dotX,
    dotY,
    targetX,
    targetY,
    targetWidth,
    targetHeight,
    targetRadius,
  ]);

  if (!active) {
    return null;
  }

  /*
    Portal `document.body`ye: Radix modalleri ve sonner bildirimleri de oraya
    ciziliyor. `#root` icinde kalsaydi imlec onlarin **altinda** kalirdi.
  */
  return createPortal(
    <div
      className="app-cursor pointer-events-none fixed inset-0 z-[9999]"
      aria-hidden
      style={{ opacity: visible ? 1 : 0, transition: 'opacity 160ms ease-out' }}
    >
      {/* HALKA — once ciziliyor ki nokta uzerinde kalsin. */}
      <motion.div className="fixed top-0 left-0" style={{ x: ringX, y: ringY }}>
        <motion.div
          className={
            'app-cursor__ring -translate-x-1/2 -translate-y-1/2 border-2 transition-colors ' +
            (magnetized ? 'border-rose/60 bg-rose/8' : 'border-blush bg-transparent')
          }
          style={{ width: ringWidth, height: ringHeight, borderRadius: ringRadius }}
        />
      </motion.div>

      {/* NOKTA — gercek konum. Yay yok, gecikme yok. */}
      <motion.div className="fixed top-0 left-0" style={{ x: dotX, y: dotY }}>
        <div
          className="app-cursor__dot -translate-x-1/2 -translate-y-1/2 rounded-full bg-rose"
          style={{ width: DOT_SIZE, height: DOT_SIZE }}
        />
      </motion.div>
    </div>,
    document.body
  );
};

export default AppCursor;
