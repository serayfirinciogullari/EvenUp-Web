import { useCallback, useMemo } from 'react';

import groupsApi from '../api/groups';
import summaryApi from '../api/summary';
import useAsync from '../hooks/useAsync';
import { AppDataContext } from './AppDataContext';

import type { AppDataValue } from './AppDataContext';
import type { GroupSummary, HomeSummary } from '../types/models';
import type { ReactNode } from 'react';

/**
 * Paylasilan sunucu durumunun saglayicisi (gerekce: `AppDataContext.ts`).
 *
 * Iki istek burada, **bir kez** atiliyor: kullanici korunan alana girdiginde.
 * Sayfalar arasi gezinme yeni istek uretmiyor — `Layout` mount'ta kaliyor,
 * dolayisiyla saglayici da kaliyor.
 *
 * TAZELEME KIMDE
 * --------------
 * `reload` cagirmak tuketicinin isi. Su an tek cagiran, grup olusturma
 * modalinin `onCreated`i: liste hem sayfada hem sidebar'da ayni anda
 * guncelleniyor cunku ikisi ayni `AsyncResult`i okuyor. Elle state'e grup
 * eklemek yerine yeniden istemenin gerekcesi degismedi (`GET /groups` satiri
 * `role`, `joined_at`, `member_count` tasiyor; `POST /groups` cevabi tasimiyor).
 */
const AppDataProvider = ({ children }: { children: ReactNode }) => {
  const fetchGroups = useCallback(() => groupsApi.listGroups(), []);
  const fetchSummary = useCallback(() => summaryApi.getHomeSummary(), []);

  const groups = useAsync<GroupSummary[]>(fetchGroups, 'Gruplar yuklenemedi');
  const summary = useAsync<HomeSummary>(fetchSummary, 'Ozet yuklenemedi');

  const value = useMemo<AppDataValue>(() => ({ groups, summary }), [groups, summary]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
};

export { AppDataProvider };
export default AppDataProvider;
