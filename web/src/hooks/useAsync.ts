import { useCallback, useEffect, useRef, useState } from 'react';

import { getErrorMessage } from '../api/client';

/**
 * Sunucudan veri okuyan ekranlarin ortak durumu: yukleniyor / hata / veri.
 *
 * NEDEN KUTUPHANE DEGIL (React Query, SWR...)
 * -------------------------------------------
 * Bu asamada uygulamanin sunucu durumu tek bir ekranda ve iki uc noktada:
 * `GET /groups` ve `GET /groups/:id/balances`. React Query'nin asil kazanci
 * **paylasilan** sunucu durumu — ayni veriyi birden fazla ekranin okumasi,
 * cache gecerliligi, istek tekillestirme, arka planda tazeleme. Hicbiri henuz
 * bir sorun degil; kutuphane su an yalnizca bagimlilik ve ogrenilecek ikinci
 * bir zihinsel model getirirdi.
 *
 * Buna karsilik kutuphanesiz cozumun **gercek** tuzagi var ve bu dosya tam
 * olarak onu kapatiyor: yaris kosulu (asagida). "useState + useEffect yeterli"
 * demek, o tuzagi gormemek demek olurdu.
 *
 * NE ZAMAN KUTUPHANEYE GECILIR
 * ----------------------------
 * Su isaretlerden biri cikinca: (a) ayni veriyi iki ayri ekran okumaya
 * baslayinca (grup detayi 2.4'te ayni gruplari isteyecek), (b) "veri bayat mi"
 * sorusu ortaya cikinca, (c) iyimser guncelleme (optimistic update) gerekince.
 * O noktada degisecek yer bu dosya; cagiran bilesenler `data/error/loading/reload`
 * sozlesmesini korudugu surece dokunulmadan kalir.
 */

export interface AsyncResult<T> {
  data: T | null;
  error: string | null;
  /** Ilk yukleme **ve** yeniden yukleme sirasinda true. */
  loading: boolean;
  reload: () => void;
  /**
   * `data`yi sunucuya gitmeden yerel olarak degistirir (iyimser guncelleme).
   *
   * Bu satirin (c) maddesi tam olarak bunun icin acildi: bir aksiyonun sonucu
   * onceden **biliniyorsa** (ornegin sunucunun donecegi satirin kendisi elimizde),
   * kullaniciyi bir ag gidis-donusu kadar bekletmenin kazanci yok. `reload` gibi
   * `loading`i **tetiklemiyor** — ekran skeleton'a donmez, veri yerinde guncellenir.
   *
   * Fonksiyon hali `T | null` donebilir (`T` degil): veri henuz gelmemisken
   * (`current === null`) bir yama uygulamanin genelde dogru cevabi "hicbir sey
   * yapma" — cagiran taraf `current`i oldugu gibi geri dondurebilsin diye.
   * Gerekce: docs/decisions/optimistic-ui-duzeltme.md.
   */
  mutate: (updater: T | ((current: T | null) => T | null)) => void;
}

export const useAsync = <T>(
  /** `useCallback` ile sabitlenmeli; her render'da degisirse dongu olur. */
  fetcher: () => Promise<T>,
  fallbackMessage: string
): AsyncResult<T> => {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * YARIS KOSULU KORUMASI
   * ---------------------
   * `reload` iki kez arka arkaya cagrilirsa (ornegin grup olusturduktan sonra
   * kullanici hemen tekrar olusturursa) iki istek ucar ve **hangisinin once
   * donecegi garanti degildir**. Koruma olmasaydi eski cevap yeni cevabin
   * uzerine yazabilir ve liste bir onceki halinde donup kalirdi — ustelik
   * hicbir hata gorunmeden.
   *
   * Her istege artan bir numara veriliyor; yalnizca **en son** istegin cevabi
   * state'e yaziliyor. Ayni sayac unmount sonrasi yaziyi da engelliyor.
   */
  const requestId = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    const id = ++requestId.current;

    setLoading(true);
    setError(null);

    try {
      const result = await fetcher();

      if (mounted.current && id === requestId.current) {
        setData(result);
      }
    } catch (caught) {
      if (mounted.current && id === requestId.current) {
        // Backend'in kendi mesaji; ag hatasi ayri metin alir (`client.ts`).
        setError(getErrorMessage(caught, fallbackMessage));
        setData(null);
      }
    } finally {
      if (mounted.current && id === requestId.current) {
        setLoading(false);
      }
    }
  }, [fallbackMessage, fetcher]);

  useEffect(() => {
    void run();
  }, [run]);

  const mutate = useCallback((updater: T | ((current: T | null) => T | null)) => {
    // Unmount sonrasi yazmayi engelle — `run`daki ayni korumanin karsiligi.
    if (!mounted.current) {
      return;
    }

    setData((current) =>
      typeof updater === 'function' ? (updater as (current: T | null) => T | null)(current) : updater
    );
  }, []);

  return { data, error, loading, reload: () => void run(), mutate };
};

export default useAsync;
