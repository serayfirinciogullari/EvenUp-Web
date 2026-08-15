/**
 * Tarih gosterimi.
 *
 * `Intl.DateTimeFormat` yerine elle bicimlendiriliyor — `utils/money.ts` ile
 * ayni gerekce: Intl ciktisi calisma ortamina gore degisir (ay adinin kisalmasi,
 * bolunmez bosluk, "14 Ağu 2026" ile "14 Ağustos 2026" farki) ve hem testler
 * hem de kullanicinin gordugu metin ortama bagimli olurdu.
 *
 * Ay adlari kod tabaninin geri kalaniyla ayni yazimda (ASCII): arayuz metinleri
 * boyunca aksanli harf kullanilmiyor.
 */

const MONTHS = [
  'Ocak',
  'Subat',
  'Mart',
  'Nisan',
  'Mayis',
  'Haziran',
  'Temmuz',
  'Agustos',
  'Eylul',
  'Ekim',
  'Kasim',
  'Aralik',
];

const pad = (value: number): string => value.toString().padStart(2, '0');

const startOfDay = (date: Date): number =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * ISO 8601 metnini `Date`e cevirir. Bozuk/eksik degerde `null` doner: sessizce
 * `Invalid Date` gostermek ekrana "NaN Ocak NaN" yazmak demekti.
 */
export const parseIso = (value: string): Date | null => {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * Harcama satirinda gosterilen "ne zaman" metni.
 *
 * Bugun ve dun icin saat one cikiyor ("Bugun 14:32"): yeni eklenen bir
 * harcamada kullanicinin sordugu sey tarih degil, "az once eklenen bu mu".
 * Daha eski kayitlarda saat gurultu, tarih anlamli.
 *
 * `now` disaridan verilebiliyor — testler saate bagimli olmasin diye.
 */
export const formatExpenseDate = (value: string, now: Date = new Date()): string => {
  const date = parseIso(value);

  if (!date) {
    return 'Tarih bilinmiyor';
  }

  const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;

  if (dayDiff === 0) {
    return `Bugun ${time}`;
  }

  if (dayDiff === 1) {
    return `Dun ${time}`;
  }

  const year = date.getFullYear() === now.getFullYear() ? '' : ` ${date.getFullYear()}`;

  return `${date.getDate()} ${MONTHS[date.getMonth()]}${year}`;
};

/** Tam tarih — `<time title=...>` icin; kisaltilmis metnin arkasindaki gercek deger. */
export const formatFullDate = (value: string): string => {
  const date = parseIso(value);

  if (!date) {
    return 'Tarih bilinmiyor';
  }

  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
};

export default { parseIso, formatExpenseDate, formatFullDate };
