import { motion } from 'motion/react';

import { usePrefersReducedMotion } from '../hooks/useMediaQuery';

/**
 * Hero'nun imza animasyonu: **borc netlestirme**.
 *
 * ANLATTIGI SEY
 * -------------
 * Once bes kisi arasindaki yedi ayri borc ince cizgiler halinde beliriyor —
 * gozle takip edilemeyen, dagilmis bir ag. Sonra bu ag sonuyor ve yerinde uc
 * kalin ok kaliyor: netlestirilmis odemeler. Uygulamanin cekirdek algoritmasi
 * (1.6, greedy/optimal netlestirme) tam olarak bunu yapiyor, yani animasyon bir
 * susleme degil, urunun tek cumlelik ozeti.
 *
 * BIR KERE OYNAR
 * --------------
 * Dongu yok. Gerekce docs/decisions/landing-page.md'de uzun uzun yaziyor; kisa
 * hali: donen bir animasyon, yanindaki basligi ve CTA'yi surekli kendine ceker
 * ve sayfanin asil isini (kayit) yavaslatir. Bir kere oynayip **sonucun
 * uzerinde durmasi** ise ekranda kalici bir sema birakiyor.
 *
 * VERI ORNEK
 * ----------
 * Isimler ve tutarlar sabit ornek veri; bir hesaptan gelmiyorlar. Rastgele
 * uretilmiyor olmalari bilincli: her yenilemede degisen sayilar, ekran
 * goruntusu alan ya da ikinci kez bakan kullanicida "bu gercek mi?" sorusunu
 * uretir.
 *
 * ERISILEBILIRLIK
 * ---------------
 * `role="img"` + tek bir `aria-label`: ekran okuyucu icin bu bir sema, on parca
 * ayri metin degil. Ic metinler (isimler, tutarlar) bu yuzden duyurulmuyor.
 */

interface Point {
  x: number;
  y: number;
}

interface Person extends Point {
  initials: string;
  name: string;
}

/** Ornek grup. Konumlar viewBox (0 0 560 320) icinde elle dengelendi. */
const PEOPLE: readonly Person[] = [
  { initials: 'D', name: 'Deniz', x: 82, y: 84 },
  { initials: 'E', name: 'Ece', x: 282, y: 48 },
  { initials: 'B', name: 'Baris', x: 478, y: 100 },
  { initials: 'C', name: 'Can', x: 396, y: 252 },
  { initials: 'M', name: 'Mert', x: 128, y: 240 },
];

/** Netlestirmeden **once**: yedi ayri borc. Kim kime, tutar onemli degil. */
const DEBTS: readonly [number, number, number][] = [
  // [kaynak, hedef, egrilik]
  [0, 1, 26],
  [1, 2, 22],
  [2, 3, 18],
  [3, 4, 26],
  [4, 0, 22],
  [0, 2, -34],
  [1, 3, 30],
];

/** Netlestirmeden **sonra**: uc odeme. */
const TRANSFERS: readonly { from: number; to: number; amount: string; bend: number }[] = [
  { from: 4, to: 1, amount: '240 ₺', bend: 34 },
  { from: 3, to: 0, amount: '85 ₺', bend: -30 },
  { from: 2, to: 1, amount: '60 ₺', bend: 20 },
];

const NODE_RADIUS = 24;

/** Ince cizgilerin sonme degeri: silinmiyorlar, **arka plana dusuyorlar**. */
const FADED = 0.13;

const lengthOf = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y) || 1;

/** `a`dan `b` yonunde `pad` kadar ilerlemis nokta — cizgi dugumun icine girmesin. */
const trim = (a: Point, b: Point, pad: number): Point => {
  const length = lengthOf(a, b);
  return { x: a.x + ((b.x - a.x) / length) * pad, y: a.y + ((b.y - a.y) / length) * pad };
};

/** Iki nokta arasinda, orta noktasi dikeyde `bend` kadar kaydirilmis egri. */
const controlOf = (a: Point, b: Point, bend: number): Point => {
  const length = lengthOf(a, b);
  return {
    x: (a.x + b.x) / 2 + ((a.y - b.y) / length) * bend,
    y: (a.y + b.y) / 2 + ((b.x - a.x) / length) * bend,
  };
};

const curveOf = (a: Point, b: Point, bend: number): string => {
  const control = controlOf(a, b, bend);
  return `M ${a.x} ${a.y} Q ${control.x} ${control.y} ${b.x} ${b.y}`;
};

/** Kuadratik egrinin orta noktasi (t = 0.5) — tutar etiketi buraya oturuyor. */
const midpointOf = (a: Point, b: Point, bend: number): Point => {
  const control = controlOf(a, b, bend);
  return { x: 0.25 * a.x + 0.5 * control.x + 0.25 * b.x, y: 0.25 * a.y + 0.5 * control.y + 0.25 * b.y };
};

const LandingNetting = () => {
  const reducedMotion = usePrefersReducedMotion();

  /*
    Hareket kapaliyken animasyonun **sonucu** ciziliyor: ince ag sonuk, uc ok
    ve tutarlar yerinde. Bosluk birakmak ya da yalnizca ilk kareyi gostermek,
    hareketi kapatan kullaniciya eksik bir sayfa vermek olurdu.
  */
  const debtGroup = reducedMotion
    ? { animate: { opacity: FADED } }
    : {
        initial: { opacity: 1 },
        animate: { opacity: FADED },
        transition: { delay: 1.75, duration: 0.7, ease: 'easeInOut' as const },
      };

  return (
    <svg
      viewBox="0 0 560 320"
      className="landing-netting h-auto w-full"
      role="img"
      aria-label="Bes kisi arasindaki yedi ayri borc, netlestirilerek uc odemeye iniyor"
    >
      <defs>
        <marker
          id="landing-arrowhead"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-rose)" />
        </marker>
      </defs>

      {/* ---------------------------------------------- once: dagilmis borclar */}
      <motion.g {...debtGroup} fill="none" stroke="var(--color-ink-muted)" strokeWidth={1.5}>
        {DEBTS.map(([from, to, bend], index) => (
          <motion.path
            key={`${from}-${to}`}
            d={curveOf(PEOPLE[from], PEOPLE[to], bend)}
            /*
              Kesikli cizgi (`strokeDasharray`) YOK: `pathLength` animasyonu
              zaten `stroke-dasharray`/`dashoffset` uzerinden calisiyor, elle
              yazilan bir desen onu eziyor ve cizgi hic cizilmiyor.
            */
            /*
              `pathLength` ile ciziliyor: cizgi dugumden dugume **buyuyor**,
              yani "borc olustu" hareketi yonlu. Opaklikla belirmek ayni seyi
              anlatmazdi.
            */
            initial={reducedMotion ? false : { pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.75 }}
            transition={
              reducedMotion
                ? { duration: 0 }
                : { duration: 0.5, delay: 0.25 + index * 0.09, ease: 'easeOut' }
            }
          />
        ))}
      </motion.g>

      {/* ------------------------------------------------ sonra: uc net odeme */}
      <g fill="none" stroke="var(--color-rose)" strokeWidth={3.5} strokeLinecap="round">
        {TRANSFERS.map((transfer, index) => {
          const from = trim(PEOPLE[transfer.from], PEOPLE[transfer.to], NODE_RADIUS + 8);
          const to = trim(PEOPLE[transfer.to], PEOPLE[transfer.from], NODE_RADIUS + 12);

          return (
            <motion.path
              key={`${transfer.from}-${transfer.to}`}
              d={curveOf(from, to, transfer.bend)}
              markerEnd="url(#landing-arrowhead)"
              initial={reducedMotion ? false : { pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={
                reducedMotion
                  ? { duration: 0 }
                  : { duration: 0.65, delay: 2 + index * 0.16, ease: 'easeOut' }
              }
            />
          );
        })}
      </g>

      {/* --------------------------------------------------------- kisiler */}
      <g>
        {PEOPLE.map((person, index) => (
          <motion.g
            key={person.name}
            initial={reducedMotion ? false : { opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={
              reducedMotion ? { duration: 0 } : { duration: 0.35, delay: index * 0.07, ease: 'easeOut' }
            }
            style={{ transformOrigin: `${person.x}px ${person.y}px` }}
          >
            <circle
              cx={person.x}
              cy={person.y}
              r={NODE_RADIUS}
              fill="var(--color-blush)"
              stroke="var(--color-rose)"
              strokeOpacity={0.35}
            />
            <text
              x={person.x}
              y={person.y + 5}
              textAnchor="middle"
              fontSize={15}
              fontWeight={600}
              fill="var(--color-ink)"
            >
              {person.initials}
            </text>
            <text
              x={person.x}
              y={person.y + NODE_RADIUS + 16}
              textAnchor="middle"
              fontSize={12}
              fill="var(--color-ink-muted)"
            >
              {person.name}
            </text>
          </motion.g>
        ))}
      </g>

      {/* ------------------------------------------------------ tutar etiketleri */}
      <g>
        {TRANSFERS.map((transfer, index) => {
          const from = trim(PEOPLE[transfer.from], PEOPLE[transfer.to], NODE_RADIUS + 8);
          const to = trim(PEOPLE[transfer.to], PEOPLE[transfer.from], NODE_RADIUS + 12);
          const mid = midpointOf(from, to, transfer.bend);

          return (
            <motion.g
              key={transfer.amount}
              initial={reducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={
                reducedMotion ? { duration: 0 } : { duration: 0.4, delay: 2.55 + index * 0.12 }
              }
            >
              {/* Cizginin uzerinde okunabilsin diye zemin. */}
              <rect
                x={mid.x - 27}
                y={mid.y - 13}
                width={54}
                height={26}
                rx={13}
                fill="var(--color-cream)"
                stroke="var(--color-rose)"
                strokeOpacity={0.25}
              />
              <text
                x={mid.x}
                y={mid.y + 5}
                textAnchor="middle"
                fontSize={13}
                fontWeight={600}
                fill="var(--color-rose)"
              >
                {transfer.amount}
              </text>
            </motion.g>
          );
        })}
      </g>
    </svg>
  );
};

export default LandingNetting;
