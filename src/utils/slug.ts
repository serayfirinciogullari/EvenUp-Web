/**
 * Grup adindan adres parcasi (slug) uretir.
 *
 * NEDEN AD DOGRUDAN ADRESTE KULLANILAMAZ
 * --------------------------------------
 * "Ev Arkadaslari" adresin icinde `Ev%20Arkada%C5%9Flar%C4%B1` olurdu:
 * paylasilan link okunmaz, kirilgan (kopyalanirken bolunur) ve buyuk/kucuk
 * harf farkiyla iki ayri adres uretir. Slug bu uc sorunu birden kapatiyor.
 *
 * TURKCE HARFLER ICIN AYRI HARITA
 * -------------------------------
 * `normalize('NFD')` tek basina yetmiyor: `ç`/`ö`/`ü` aksanli latin harfler
 * oldugu icin ayrisip `c`/`o`/`u`ya duser ama `ı` ve `ş` **ayri kod
 * noktalari**; NFD onlara dokunmaz ve `[^a-z0-9]` filtresi ikisini de silerdi.
 * "Isik Grubu" -> "sk-grubu" gibi. Bu yuzden once elle esleme yapiliyor.
 *
 * `İ` ozellikle haritada: `'İ'.toLowerCase()` JS'te `i` + birlesik nokta
 * uretir, yani lowercase'ten sonra ikinci bir temizlik gerekirdi.
 */

const TURKISH_LETTERS: Record<string, string> = {
  ç: 'c',
  Ç: 'c',
  ğ: 'g',
  Ğ: 'g',
  ı: 'i',
  İ: 'i',
  ö: 'o',
  Ö: 'o',
  ş: 's',
  Ş: 's',
  ü: 'u',
  Ü: 'u',
};

/**
 * Adres cubugunda okunabilir kalan bir ust sinir. `groups.name` 120 karaktere
 * kadar cikabiliyor; slug kolonu daha genis (160) cunku cakisma eki (`-12`)
 * bu sinirin **ustune** biniyor.
 */
export const MAX_SLUG_LENGTH = 120;

/**
 * Adin tamami islevsiz karakterlerden olustugunda (yalnizca emoji, noktalama
 * ya da latin disi bir alfabe) kullanilir. Bos slug uretmek, `/groups/` gibi
 * hicbir gruba karsilik gelmeyen bir adres demek olurdu.
 */
export const SLUG_FALLBACK = 'grup';

export const slugify = (name: string): string => {
  const latinized = [...name].map((char) => TURKISH_LETTERS[char] ?? char).join('');

  const slug = latinized
    .normalize('NFD')
    // Birlesik aksan isaretleri (NFD'nin ayirdigi ikinci kod noktalari).
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    // Kirpma tam bir tirenin uzerine denk gelmis olabilir.
    .replace(/-+$/, '');

  return slug || SLUG_FALLBACK;
};

export default slugify;
