/**
 * E-posta adresini Ayarlar > Profil'de gostermek icin maskeler.
 *
 * E-posta duzenlenemez bir alan (giris kimligi, degistirmek dogrulama akisi
 * ister) ama tamamen gizlenmesi de yanlis olurdu — kullanici hangi hesapta
 * oldugunu bir bakista dogrulayabilmeli. Maskeleme ikisinin ortasi: ilk harf +
 * alan adinin uzantisi goruniyor, gerisi gizli.
 *
 * `d****@****.dev` -> `deniz@evenup.dev`
 */
export const maskEmail = (email: string): string => {
  const atIndex = email.indexOf('@');
  if (atIndex <= 0) {
    return email;
  }

  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);
  const dotIndex = domain.lastIndexOf('.');
  const tld = dotIndex >= 0 ? domain.slice(dotIndex) : '';

  return `${local[0]}****@****${tld}`;
};

export default maskEmail;
