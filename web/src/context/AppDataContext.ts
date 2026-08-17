import { createContext } from 'react';

import type { AsyncResult } from '../hooks/useAsync';
import type { GroupSummary, HomeSummary } from '../types/models';

/**
 * Uygulama ici **paylasilan sunucu durumu**.
 *
 * NEDEN ORTAYA CIKTI
 * ------------------
 * `useAsync`in dosya basindaki notu, kutuphaneye (React Query) gecis
 * isaretlerinden birini soyle tarif ediyordu: *"ayni veriyi iki ayri ekran
 * okumaya baslayinca"*. Sidebar tam olarak o ani getirdi:
 *
 *   - grup listesi -> hem `/groups` sayfasi hem sidebar'daki grup kisayollari
 *   - home ozeti   -> hem Home kartlari hem sidebar'daki bekleyen odeme rozeti
 *
 * Her biri kendi `useAsync`ini kullansaydi ayni iki uc noktaya sayfa basina
 * iki kat istek giderdi ve daha kotusu: kullanici grup olusturdugunda liste
 * tazelenir, **sidebar eski listede kalirdi**.
 *
 * NEDEN CONTEXT, NEDEN KUTUPHANE DEGIL
 * ------------------------------------
 * Ihtiyac hala dar: iki uc nokta, tek bir tuketici agaci, arka planda tazeleme
 * yok. Context + mevcut `useAsync`, `AuthProvider` ile ayni deseni tekrar
 * ediyor ve projeye ikinci bir zihinsel model sokmuyor. Kutuphane karari
 * (cache gecerliligi, iyimser guncelleme) gerektiginde degisecek yer yine tek:
 * bu saglayici. Tuketiciler `data/error/loading/reload` sozlesmesini goruyor.
 *
 * KAPSAM
 * ------
 * Saglayici `ProtectedRoute`un **altinda**: istekler yalnizca oturumu acik
 * kullanici icin atiliyor. Landing ya da giris ekranlari bu agacin disinda,
 * dolayisiyla oralarda hicbir sey cekilmiyor.
 */
export interface AppDataValue {
  /** `GET /groups` — sidebar kisayollari ve Gruplarim sayfasi ayni listeyi okur. */
  groups: AsyncResult<GroupSummary[]>;
  /** `GET /users/me/home-summary` — Home kartlari ve sidebar rozeti ayni ozeti okur. */
  summary: AsyncResult<HomeSummary>;
}

export const AppDataContext = createContext<AppDataValue | null>(null);
