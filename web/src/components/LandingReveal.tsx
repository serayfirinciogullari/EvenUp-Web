import { motion } from 'motion/react';

import { usePrefersReducedMotion } from '../hooks/useMediaQuery';

import type { ReactNode } from 'react';

/**
 * Scroll'da beliren blok — landing sayfasinin tek hareket kalibi.
 *
 * NEDEN TEK BILESEN
 * -----------------
 * Bes bolumun her biri kendi `whileInView` degerlerini yazsaydi, mesafeler ve
 * sureler zamanla birbirinden ayrisir ve sayfa "her bolumu farkli bir yerden
 * ogrenmis" gibi gorunurdu. Kalip burada tek yerde: 18px asagidan, 450ms,
 * `easeOut`.
 *
 * `once: true` — BIR KERE
 * -----------------------
 * Kullanici yukari kaydirip geri geldiginde animasyon tekrar oynamiyor. Tekrar
 * oynasaydi sayfa, okunmus bir yeri her ziyarette yeniden "kurulur" gosterir ve
 * kaydirma bir gosteriye donusurdu. `amount: 0.25` -> blogun dortte biri
 * gorunur gorunmez basliyor; tamamini beklemek uzun bolumlerde animasyonun hic
 * tetiklenmemesi demek olurdu.
 *
 * HAREKETI AZALT
 * --------------
 * `prefers-reduced-motion` altinda `motion.div` hic mount edilmiyor, duz bir
 * `div` doniyor. Buradaki hareket JS ile inline stile yaziliyor; index.css'teki
 * global `transition-duration: 0.01ms` kurali onu durduramaz — CSS gecisi degil,
 * kare kare hesaplanan bir animasyon.
 */
const LandingReveal = ({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  /** Ayni bolumdeki kartlari sirayla getirmek icin (saniye). */
  delay?: number;
}) => {
  const reducedMotion = usePrefersReducedMotion();

  if (reducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.45, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
};

export default LandingReveal;
