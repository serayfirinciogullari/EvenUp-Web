import { useContext } from 'react';

import { AppDataContext } from '../context/AppDataContext';

import type { AppDataValue } from '../context/AppDataContext';

/**
 * Paylasilan sunucu durumuna erisim (`useAuth` ile ayni desen).
 *
 * Saglayici disinda cagrilirsa sessizce bos veri donmek yerine hata firlatir:
 * aksi halde "sidebar neden hep bos?" seklinde teshisi zor bir hataya
 * donusurdu. Saglayici `ProtectedRoute` altinda, yani bu hook yalnizca korunan
 * sayfalarda kullanilabilir — landing ve auth ekranlarinda cagrilmamali.
 */
export const useAppData = (): AppDataValue => {
  const context = useContext(AppDataContext);

  if (!context) {
    throw new Error('useAppData yalnizca <AppDataProvider> icinde kullanilabilir');
  }

  return context;
};

/** Grup listesi — sidebar kisayollari ve Gruplarim sayfasi ayni nesneyi okur. */
export const useGroupsData = (): AppDataValue['groups'] => useAppData().groups;

/** Home ozeti — Home kartlari ve sidebar rozeti ayni nesneyi okur. */
export const useSummaryData = (): AppDataValue['summary'] => useAppData().summary;

export default useAppData;
