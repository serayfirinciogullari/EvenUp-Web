import { useCallback, useEffect, useRef, useState } from 'react';

import { getErrorMessage } from '../api/client';
import expensesApi from '../api/expenses';

import type { Expense, Pagination } from '../types/models';

/**
 * Harcama listesi + "daha fazla yukle".
 *
 * NEDEN `useAsync` DEGIL
 * ----------------------
 * `useAsync` her cevabi bir oncekinin **yerine** yazar; burada ikinci sayfa
 * oncekinin **ustune** ekleniyor. Yani biriken bir liste, tek bir `data`
 * alanina sigmiyor. Yaris korumasi ise aynen `useAsync`'ten devralindi
 * (artan istek numarasi + unmount kontrolu, bkz. docs/decisions/2.3.md).
 *
 * NEDEN SAYFA NUMARASI DEGIL "DAHA FAZLA YUKLE"
 * --------------------------------------------
 * Harcama listesi zaman sirali bir akis; kullanicinin sordugu soru "3. sayfada
 * ne vardi" degil, "daha eskiye gidince ne var". Sayfa numaralari ayrica
 * offset sayfalamanin kayma sorununu gorunur kilardi: yeni bir harcama
 * eklendiginde tum pencere bir satir kayar ve 2. sayfanin ilk satiri 1. sayfada
 * gorunmus olan satir olur.
 *
 * Ayni kayma sorunu **bizde de var** ve su sekilde kapatiliyor: harcama
 * eklendikten sonra `reload()` cagriliyor, yani liste 1. sayfadan bastan
 * kuruluyor. Yeni satiri elde tutulan listeye eklemek daha ucuz olurdu ama
 * biriken sayfalarla arasindaki sira/tekrar iliskisi bozulurdu.
 */

export interface ExpenseFeed {
  expenses: Expense[];
  pagination: Pagination | null;
  /** Ilk yukleme ya da bastan yukleme. */
  loading: boolean;
  /** Yalnizca "daha fazla yukle" istegi. Ayri tutuluyor: mevcut liste ekranda kalir. */
  loadingMore: boolean;
  error: string | null;
  reload: () => void;
  loadMore: () => void;
}

/**
 * Sayfa boyutu backend'in varsayilanindan (20) kucuk: bu ekranda liste bir
 * sekmenin icinde duruyor ve 20 satir ilk bakista bakiye ozetini ekrandan
 * itiyor. Ust sinir yine backend'de (`MAX_PAGE_SIZE`).
 */
export const EXPENSE_PAGE_SIZE = 10;

export const useExpenseFeed = (groupId: string): ExpenseFeed => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
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

  const load = useCallback(
    async (page: number, mode: 'replace' | 'append') => {
      const id = ++requestId.current;

      if (mode === 'replace') {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);

      try {
        const result = await expensesApi.listExpenses(groupId, {
          page,
          limit: EXPENSE_PAGE_SIZE,
        });

        if (!mounted.current || id !== requestId.current) {
          return;
        }

        setExpenses((current) =>
          mode === 'append' ? [...current, ...result.expenses] : result.expenses
        );
        setPagination(result.pagination);
      } catch (caught) {
        if (!mounted.current || id !== requestId.current) {
          return;
        }

        setError(getErrorMessage(caught, 'Harcamalar yuklenemedi'));

        // "Daha fazla" istegi patlarsa elde olan liste ekranda kalir: kullanici
        // gordugu satirlari kaybetmemeli, yalnizca yeni sayfa gelmemis olur.
        if (mode === 'replace') {
          setExpenses([]);
          setPagination(null);
        }
      } finally {
        if (mounted.current && id === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [groupId]
  );

  useEffect(() => {
    void load(1, 'replace');
  }, [load]);

  return {
    expenses,
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

export default useExpenseFeed;
