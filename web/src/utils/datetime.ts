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

/**
 * Yalnizca tarih: "15 Agustos 2026".
 *
 * Tablo hucreleri icin. `formatExpenseDate`ten farki saatin ve "Bugun/Dun"
 * kisayolunun olmamasi: kayit tarihi bir **kimlik bilgisi**, akista bir olay
 * degil; "Dun" yazan bir hucre siralamayi okumayi zorlastirir.
 */
export const formatDate = (value: string): string => {
  const date = parseIso(value);

  if (!date) {
    return 'Tarih bilinmiyor';
  }

  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
};

/**
 * Yalnizca saat: "08:40".
 *
 * Aktivite akisinda tarih zaten grup basliginda yaziyor ("BUGUN", "17 AGUSTOS");
 * satirin tekrar etmesi gereken tek sey gun **icindeki** sira. `formatExpenseDate`
 * bu ekranda her satira "Bugun" yazdirirdi.
 */
export const formatTime = (value: string): string => {
  const date = parseIso(value);

  if (!date) {
    return '--:--';
  }

  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/**
 * Aktivite akisinda ayni gunun olaylarini toplayan **anahtar**: "2026-08-17".
 *
 * Gruplama ISO metninin ilk 10 karakteriyle yapilamaz: o deger UTC'ye gore ve
 * kullanicinin saat diliminde gece yarisina yakin bir olay bir onceki/sonraki
 * gune duserdi. Anahtar bu yuzden **yerel** takvim gununden uretiliyor — basligi
 * ureten `formatDayGroup` de ayni yerel gune bakiyor, yani baslik ile grup her
 * zaman ayni gunu gosteriyor.
 */
export const dayKeyOf = (value: string): string => {
  const date = parseIso(value);

  if (!date) {
    return 'gecersiz';
  }

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/**
 * Aktivite akisindaki gun basligi: "BUGUN", "DUN", "17 AGUSTOS".
 *
 * Buyuk harf gosterimi CSS'e (`text-transform`) birakilmadi: baslik metni
 * testlerde ve ekran okuyucuda da bu haliyle okunuyor, yani gorunum degil
 * icerik. Ay adlari `MONTHS` uzerinden geldigi icin ASCII kaliyor ve Turkce'ye
 * ozgu buyutme (i -> İ) sorunu hic dogmuyor.
 */
export const formatDayGroup = (value: string, now: Date = new Date()): string => {
  const date = parseIso(value);

  if (!date) {
    return 'TARIH BILINMIYOR';
  }

  const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);

  if (dayDiff === 0) {
    return 'BUGUN';
  }

  if (dayDiff === 1) {
    return 'DUN';
  }

  // Yil yalnizca farkliysa yaziliyor: "17 AGUSTOS" bu yil icin yeterince acik,
  // gecen yilin ayni gunu ise yilsiz gosterilseydi bugunle karisirdi.
  const year = date.getFullYear() === now.getFullYear() ? '' : ` ${date.getFullYear()}`;

  return `${date.getDate()} ${MONTHS[date.getMonth()].toUpperCase()}${year}`;
};

/**
 * Gruplar listesi kartindaki "son hareket ne zaman oldu" metni: "az once",
 * "12 dakika once", "3 saat once", "dun", "4 gun once".
 *
 * `formatExpenseDate`ten farkli bir olcek: o "Bugun 14:32" gibi **saat**
 * gosteriyor, bu ise gecen **sureyi**. Kart listesinde onemli olan "ne kadar
 * once" (goz gezdirirken en tazeyi bulmak), tam saat degil — bkz.
 * docs/decisions/gruplar-kart-tasarimi.md.
 *
 * Bir haftadan eskiye gecince tarihe donuyor (`formatDate`): "18 gun once"
 * gibi buyuk sayilar okumayi degil, tarihi zihinde canlandirmayi zorlastirir.
 */
export const formatRelativeTime = (value: string, now: Date = new Date()): string => {
  const date = parseIso(value);

  if (!date) {
    return 'Tarih bilinmiyor';
  }

  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) {
    return 'az once';
  }

  if (diffMin < 60) {
    return `${diffMin} dakika once`;
  }

  const diffHour = Math.floor(diffMin / 60);

  if (diffHour < 24) {
    return `${diffHour} saat once`;
  }

  const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);

  if (dayDiff === 1) {
    return 'dun';
  }

  if (dayDiff < 7) {
    return `${dayDiff} gun once`;
  }

  return formatDate(value);
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

export default {
  parseIso,
  formatExpenseDate,
  formatDate,
  formatTime,
  dayKeyOf,
  formatDayGroup,
  formatRelativeTime,
  formatFullDate,
};
