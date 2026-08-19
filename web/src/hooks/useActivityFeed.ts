import { useCallback, useEffect, useRef, useState } from 'react';

import activityApi from '../api/activity';
import { getErrorMessage } from '../api/client';

import type { ActivityEvent, Pagination } from '../types/models';

/**
 * Aktivite akisi + "daha fazla yukle".
 *
 * `useExpenseFeed` ile ayni desen ve ayni gerekce: `useAsync` her cevabi bir
 * oncekinin **yerine** yazar, burada ise ikinci sayfa oncekinin **ustune**
 * ekleniyor. Yaris korumasi da oradan devralindi (artan istek numarasi +
 * unmount kontrolu, bkz. docs/decisions/2.3.md).
 *
 * NEDEN AYRI BIR HOOK — `useExpenseFeed` GENELLESTIRILMEDI
 * --------------------------------------------------------
 * Iki hook'un iskeleti ayni ama sozlesmeleri farkli: harcama akisi bir **grup
 * ID'si** aliyor ve o gruba bagli, aktivite akisi hicbir parametre almiyor
 * (hedef token'in sahibi). Ortak bir `usePagedFeed<T>(fetcher)` yazmak
 * mumkundu; su an iki cagiranla soyutlama, kazandirdigi satirdan daha fazla
 * dolayli okuma uretirdi. Ucuncu bir sayfalanmis liste ciktiginda dogru hamle
 * o soyutlamayi yazmak olur.
 */

export interface ActivityFeed {
  events: ActivityEvent[];
  pagination: Pagination | null;
  /** Ilk yukleme ya da bastan yukleme. */
  loading: boolean;
  /** Yalnizca "daha fazla yukle". Ayri tutuluyor: mevcut liste ekranda kalir. */
  loadingMore: boolean;
  error: string | null;
  reload: () => void;
  loadMore: () => void;
}

/**
 * Sayfa boyutu backend'in varsayilanina (20) esit. Harcama akisinda 10'a
 * dusurulmustu cunku liste bir sekmenin icinde duruyordu ve bakiye ozetini
 * ekrandan itiyordu; burada liste **sayfanin kendisi**, kisaltmanin bir kazanci
 * yok. Ust sinir yine backend'de (`MAX_PAGE_SIZE`).
 */
export const ACTIVITY_PAGE_SIZE = 20;

export const useActivityFeed = (): ActivityFeed => {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestId = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async (page: number, mode: 'replace' | 'append') => {
    const id = ++requestId.current;

    if (mode === 'replace') {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    setError(null);

    try {
      const result = await activityApi.listActivity({ page, limit: ACTIVITY_PAGE_SIZE });

      if (!mounted.current || id !== requestId.current) {
        return;
      }

      setEvents((current) => (mode === 'append' ? [...current, ...result.events] : result.events));
      setPagination(result.pagination);
    } catch (caught) {
      if (!mounted.current || id !== requestId.current) {
        return;
      }

      setError(getErrorMessage(caught, 'Aktiviteler yuklenemedi'));

      // "Daha fazla" istegi patlarsa elde olan liste ekranda kalir: kullanici
      // gordugu satirlari kaybetmemeli, yalnizca yeni sayfa gelmemis olur.
      if (mode === 'replace') {
        setEvents([]);
        setPagination(null);
      }
    } finally {
      if (mounted.current && id === requestId.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    void load(1, 'replace');
  }, [load]);

  return {
    events,
    pagination,
    loading,
    loadingMore,
    error,
    reload: () => void load(1, 'replace'),
    loadMore: () => {
      if (pagination?.has_next && !loadingMore) {
        void load(pagination.page + 1, 'append');
      }
    },
  };
};

export default useActivityFeed;
