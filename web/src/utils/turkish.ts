/**
 * Turkce ek uretimi — bakiye cumlelerinin okunabilir olmasi icin.
 *
 * NEDEN GEREKLI
 * -------------
 * "Bakiyeler" sekmesinin isi, netlestirme ciktisini (`from_user`, `to_user`,
 * `amount`) **cumleye** cevirmek. Sablon tek: "Sen X'e N ₺ borclusun". Ekin
 * elle "'e" yazilmasi Turkce'de yanlis sonuc verir:
 *
 *     Deniz'e  (dogru)      Deniz'a   (yanlis)
 *     Burak'a  (dogru)      Burak'e   (yanlis)
 *     Ece'ye   (dogru)      Ece'e     (yanlis)
 *
 * Yani ek, ismin **son unlusune** ve son harfin unlu olup olmadigina bagli.
 * Kural ufak ama cumlenin her satirda tekrarlandigi bir ekranda gorunur:
 * "Deniz'a borclusun" yazan bir uygulama, hesabi da yanlis yapiyor gibi durur.
 *
 * KAPSAM
 * ------
 * Yalnizca **yonelme hali** (-e / -a) uretiliyor, cunku ekranda gecen tek ek o.
 * Genel bir Turkce morfoloji katmani yazmak (belirtme, tamlayan, unsuz
 * yumusamasi...) bu ekranin ihtiyacinin cok otesinde olurdu.
 *
 * Ozel isimlerde ek kesme isaretiyle ayrilir; bu yuzden "Ahmet'e" dogru,
 * "Ahmed'e" (unsuz yumusamasi) yanlistir — ozel isimlerde yumusama yazida
 * gosterilmez. Kural bu yuzden ekstra bir istisna gerektirmiyor.
 */

const BACK_VOWELS = 'aıou'; // a, ı, o, u  (kalin unluler)
const FRONT_VOWELS = 'eiöü'; // e, i, ö, ü  (ince unluler)
const VOWELS = BACK_VOWELS + FRONT_VOWELS;

/** Turkce'ye ozgu kucultme: I -> ı, İ -> i. Varsayilan `toLowerCase` bunu bozar. */
const lower = (value: string): string => value.toLocaleLowerCase('tr');

/**
 * Ismin yonelme halli hali: "Deniz" -> "Deniz'e", "Burak" -> "Burak'a",
 * "Ece" -> "Ece'ye".
 *
 * Isim bos ya da hic unlu icermiyorsa (kisaltma, takma ad) ince unlu
 * varsayiliyor: "'e" Turkce'de daha genis bir kumede dogru sonuc verir ve
 * hicbir ek koymamak cumleyi bozardi.
 */
export const dative = (name: string): string => {
  const trimmed = name.trim();

  if (!trimmed) {
    return trimmed;
  }

  const lowered = lower(trimmed);

  let lastVowel = '';
  for (const character of lowered) {
    if (VOWELS.includes(character)) {
      lastVowel = character;
    }
  }

  const suffix = BACK_VOWELS.includes(lastVowel) ? 'a' : 'e';
  // Unluyle biten isimde araya kaynastirma unsuzu girer: "Ece'ye", "Ali'ye".
  const buffer = VOWELS.includes(lowered[lowered.length - 1]) ? 'y' : '';

  return `${trimmed}'${buffer}${suffix}`;
};

export default { dative };
