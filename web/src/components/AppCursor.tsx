import { motion, useMotionValue, useSpring } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useFinePointer, usePrefersReducedMotion } from '../hooks/useMediaQuery';

/**
 * Uygulama imleci — ic ice iki daire.
 *
 *   NOKTA  : ince, keskin, `rose`. Gecikmesiz; **gercek imlec konumu** bu.
 *   HALKA  : yumusak, `blush`. Noktayi yay fizigiyle takip eder.
 *
 * NEDEN IKI PARCA
 * ---------------
 * Tek parcali "gecikmeli" bir imlec kullanilamaz: tiklama noktasi ile
 * gorunen nokta arasindaki fark, kullaniciyi isabetsiz hissettirir. Bu yuzden
 * dogruluk ve suslemenin **isi bolunuyor** — nokta her zaman tam yerinde,
 * gecikme yalnizca dekoratif halkada. Halka yanlis yerde durdugunda kimse bir
 * sey kacirmiyor; nokta yanlis yerde dursa her tiklama tereddutlu olurdu.
 *
 * OLCU SABIT
 * ----------
 * Halka etkilesimli ogelerin uzerinde **buyumuyor**, onlara kilitlenmiyor.
 * Surekli olcu degistiren bir imlec sayfada gezerken kendi basina bir olaya
 * donusuyor ve gozu icerikten koparıyor. Tek olcu degisimi tiklamada: o da
 * suslemek icin degil, **basildi** bilgisini vermek icin.
 *
 * PERFORMANS: HER KAREDE RENDER YOK
 * ---------------------------------
 * Konum React state'inde degil `MotionValue` icinde tutuluyor; bunlar DOM'a
 * React agacini yeniden render etmeden yaziliyor. `mousemove` saniyede onlarca
 * kez tetiklenir — orada `setState` cagirmak butun sayfayi her fare
 * hareketinde yeniden render ederdi. Yalnizca **nadiren** degisen gorunurluk
 * state: hareket basina degil, durum degisimi basina bir kez yaziliyor.
 */

/** Nokta: ince ve keskin. Buyudukce "gercek konum" isareti olmaktan cikar. */
const DOT_SIZE = 6;

/** Halkanin capi — her zaman bu; hicbir sey onu degistirmiyor. */
const RING_SIZE = 34;

/**
 * Basili tutarken halkanin olcegi. Bilerek kucuk bir deger: amac gosteri
 * yapmak degil, tiklamanin **kaydedildigini** hissettirmek.
 */
const PRESS_SCALE = 1.18;

/** Konum yayi: takip belirgin olacak kadar gevsek, saliniyor gorunmeyecek kadar sonumlu. */
const POSITION_SPRING = { stiffness: 260, damping: 26, mass: 0.55 };

/**
 * Basma yayi konumdan **daha sert**: tepki gecikirse dokunsal his kayboluyor,
 * tiklama ile buyume arasindaki bag kopuyor.
 */
const PRESS_SPRING = { stiffness: 420, damping: 28, mass: 0.4 };

/** `<html data-app-cursor="on">`: global `cursor: none` kurali buna bakiyor. */
const CURSOR_FLAG = 'appCursor';

const AppCursor = () => {
  const finePointer = useFinePointer();
  const reducedMotion = usePrefersReducedMotion();
  const active = finePointer && !reducedMotion;

  // Nokta: ham degerler, yay yok — gecikmesiz olmasinin tek yolu bu.
  const dotX = useMotionValue(-100);
  const dotY = useMotionValue(-100);

  // Halka: hedef konum ham, gorunen konum yayli.
  const targetX = useMotionValue(-100);
  const targetY = useMotionValue(-100);
  const targetScale = useMotionValue(1);

  const ringX = useSpring(targetX, POSITION_SPRING);
  const ringY = useSpring(targetY, POSITION_SPRING);
  const ringScale = useSpring(targetScale, PRESS_SPRING);

  const [visible, setVisible] = useState(false);
  const visibleRef = useRef(false);

  useEffect(() => {
    if (!active) {
      return;
    }

    document.documentElement.dataset[CURSOR_FLAG] = 'on';

    const handleMove = (event: MouseEvent) => {
      dotX.set(event.clientX);
      dotY.set(event.clientY);
      targetX.set(event.clientX);
      targetY.set(event.clientY);

      if (!visibleRef.current) {
        visibleRef.current = true;
        setVisible(true);
      }
    };

    const handleDown = () => targetScale.set(PRESS_SCALE);

    /*
      Birakma `window` uzerinde ve `capture` ile dinleniyor: fare sayfa disinda
      birakilirsa ya da bir oge olayi yutarsa halka buyumus halde kalirdi.
    */
    const handleUp = () => targetScale.set(1);

    const handleLeave = () => {
      visibleRef.current = false;
      setVisible(false);
      targetScale.set(1);
    };

    window.addEventListener('mousemove', handleMove, { passive: true });
    window.addEventListener('mousedown', handleDown, { passive: true, capture: true });
    window.addEventListener('mouseup', handleUp, { passive: true, capture: true });
    window.addEventListener('blur', handleUp);
    document.addEventListener('mouseleave', handleLeave);

    return () => {
      delete document.documentElement.dataset[CURSOR_FLAG];
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mousedown', handleDown, { capture: true });
      window.removeEventListener('mouseup', handleUp, { capture: true });
      window.removeEventListener('blur', handleUp);
      document.removeEventListener('mouseleave', handleLeave);
    };
  }, [active, dotX, dotY, targetX, targetY, targetScale]);

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
        {/*
          Ortalama Tailwind sinifiyla degil `x`/`y` ile: `scale` verildigi anda
          Motion `transform`i kendisi yaziyor ve sinifin `translate`ini eziyor —
          halka kendi yariçapi kadar kayardi.
        */}
        <motion.div
          className="app-cursor__ring rounded-full border-2 border-blush"
          style={{
            width: RING_SIZE,
            height: RING_SIZE,
            x: '-50%',
            y: '-50%',
            scale: ringScale,
          }}
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
