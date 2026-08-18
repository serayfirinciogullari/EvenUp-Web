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

/**
 * Besgenin merkezi ve yaricapi. Koordinatlar **elle** dengelendiginde ust dugum
 * bir turlu yerine oturmuyordu: kenarlar esit degildi, tepedeki kisi asagi
 * kaymis gorunuyordu. Artik tek dogru kaynagi burasi, koseler hesaplaniyor.
 */
const CENTER: Point = { x: 220, y: 178 };
const RADIUS = 124;

/** Duzgun besgenin kosesi: 0 = tepe, sonrasi saat yonunde 72 derece araliklarla. */
const cornerOf = (corner: number): Point => {
  const angle = ((corner * 72 - 90) * Math.PI) / 180;
  return { x: CENTER.x + RADIUS * Math.cos(angle), y: CENTER.y + RADIUS * Math.sin(angle) };
};

/**
 * Ornek grup. Dizi sirasi = besgende saat yonu; boylece asagidaki DEBTS
 * listesindeki ardisik ciftler ([0,1], [1,2], ...) tam olarak besgenin
 * kenarlarina denk geliyor.
 */
const PEOPLE: readonly Person[] = [
  { initials: 'D', name: 'Deniz', ...cornerOf(4) },
  { initials: 'E', name: 'Ece', ...cornerOf(0) },
  { initials: 'B', name: 'Baris', ...cornerOf(1) },
  { initials: 'C', name: 'Can', ...cornerOf(2) },
  { initials: 'M', name: 'Mert', ...cornerOf(3) },
];

/**
 * Netlestirmeden **once**: yedi ayri borc. Bes tanesi besgenin kenari ve duz
 * ciziliyor (egrilik 0) — kenarlarin esitligi ancak duz cizgide gozle
 * gorulur. Kalan ikisi kosegen; onlar merkeze dogru hafifce buzuluyor ki
 * birbirlerinin ve dugumlerin uzerinden gecmesinler.
 */
const DEBTS: readonly [number, number, number][] = [
  // [kaynak, hedef, egrilik]
  [0, 1, 0],
  [1, 2, 0],
  [2, 3, 0],
  [3, 4, 0],
  [4, 0, 0],
  [0, 2, 30],
  [1, 3, 28],
];

/**
 * Netlestirmeden **sonra**: uc odeme. Egrilikler besgenin **disina** dogru:
 * kalin oklar boylece sonuk agin uzerine binmek yerine disariya aciliyor,
 * tutar etiketleri de bos alana oturuyor.
 */
const TRANSFERS: readonly { from: number; to: number; amount: string; bend: number }[] = [
  { from: 4, to: 1, amount: '240 ₺', bend: -26 },
  { from: 3, to: 0, amount: '85 ₺', bend: -26 },
  { from: 2, to: 1, amount: '60 ₺', bend: 24 },
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

/**
 * Isim etiketinin dugume gore dikey yeri. Hepsi **altta** oldugunda tepedeki
 * kisinin adi, ona gelen iki kalin okun tam uzerine dusuyordu; etiket merkezden
 * disari dogru kacinca hem okla hem kenarla cakisma bitiyor.
 */
const labelOffsetOf = (person: Person): number =>
  person.y > CENTER.y ? NODE_RADIUS + 16 : -(NODE_RADIUS + 10);

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
      viewBox="0 0 440 340"
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
      <motion.g
        {...debtGroup}
        fill="none"
        stroke="var(--color-ink-muted)"
        strokeWidth={1.5}
        strokeLinecap="round"
      >
        {DEBTS.map(([from, to, bend], index) => {
          /*
            Cizgi dugum merkezinden degil, **cemberin disindan** basliyor:
            merkezden cizildiginde uclar dairelerin altinda kayboluyor ve ag
            dagilmis degil, kirli gorunuyordu.
          */
          const start = trim(PEOPLE[from], PEOPLE[to], NODE_RADIUS + 6);
          const end = trim(PEOPLE[to], PEOPLE[from], NODE_RADIUS + 6);

          return (
            <motion.path
              key={`${from}-${to}`}
              d={curveOf(start, end, bend)}
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
          );
        })}
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
              y={person.y + labelOffsetOf(person)}
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
