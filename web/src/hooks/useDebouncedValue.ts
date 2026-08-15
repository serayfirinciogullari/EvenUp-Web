import { useEffect, useState } from 'react';

/**
 * Bir degeri gecikmeli olarak yansitir. Arama kutusu icin.
 *
 * NEDEN GEREKLI
 * -------------
 * Arama **sunucu tarafinda** yapiliyor (`GET /admin/users?search=`), cunku liste
 * sayfalanmis: elde yalnizca ilk 20 satir varken istemcide filtrelemek "aradigin
 * kisi 3. sayfada olsaydi bulunamazdi" demek olurdu.
 *
 * Sunucu tarafinda arama ise her tus vurusunda bir istek riski getirir. "ece"
 * yazmak uc istek eder ve bunlarin **hangisinin once donecegi garanti degildir**:
 * "e" sorgusunun gec donen cevabi, "ece" sonucunun uzerine yazilabilir.
 *
 * Gecikme iki sorunu birden kucultur (istek sayisi + yaris penceresi); yarisin
 * kendisi ayrica `useAsync` icindeki istek numarasiyla kapatiliyor. Yani bu hook
 * bir optimizasyon, dogruluk garantisi degil — garanti `useAsync`'te.
 */
export const useDebouncedValue = <T>(value: T, delayMs = 300): T => {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);

    // Deger yeniden degisirse onceki zamanlayici iptal: yalnizca kullanicinin
    // yazmayi biraktigi an istek atilir.
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
};

export default useDebouncedValue;
