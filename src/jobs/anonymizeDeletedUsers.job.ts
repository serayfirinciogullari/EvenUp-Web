import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import cron from 'node-cron';

import config from '../config/env';
import userModel from '../models/user.model';
import logger from '../utils/logger';
import { DELETION_GRACE_DAYS } from '../services/auth.service';

/**
 * Gunluk gorev: 30 gunu asmis silme taleplerini kalici hale getirir
 * (bkz. docs/decisions/3.17-hesap-silme.md).
 *
 * NEDEN AYRI BIR SERVIS DEGIL, NODE-CRON
 * -------------------------------------------
 * Gorev tek, hafif ve **bu API sureciyle ayni veritabanina** yaziyor; ayri
 * bir worker/servis kurmak (kuyruk, ikinci bir deploy hedefi) bu asamada
 * orantisiz olurdu. `node-cron` kucuk bir bagimlilik, `server.ts` icinde
 * calisan sureci zamanlamaktan baska bir sey yapmiyor.
 *
 * NEDEN `server.ts`TE BASLATILIYOR, `app.ts`TE DEGIL
 * -------------------------------------------------------
 * Testler `app.ts`i dogrudan import eder (`request(app)`, bkz. tests/*.test.ts);
 * `app.ts` hicbir yan etki baslatmaz. Zamanlama `server.ts`te (yalnizca
 * `npm run dev`/`npm start` ile calisan gercek surec) kaldigi icin testler
 * arka planda gercek bir zamanlayici calistirmiyor.
 */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Tek calistirma — cron sarmalayicisindan ayri tutuluyor ki testler zamanlama
 * mekanizmasina hic dokunmadan bu fonksiyonu dogrudan cagirabilsin.
 */
export const runAnonymizeExpiredDeletions = async (): Promise<number> => {
  const cutoff = new Date(Date.now() - DELETION_GRACE_DAYS * MS_PER_DAY);

  // Butun bu calistirmada anonimlestirilen satirlar **ayni** hash'i paylasir;
  // gerekce user.model.ts -> anonymizeExpiredDeletions'ta.
  const passwordHash = await bcrypt.hash(randomUUID(), config.bcryptSaltRounds);

  const affected = await userModel.anonymizeExpiredDeletions(cutoff, passwordHash);

  if (affected > 0) {
    logger.info(`${affected} hesap anonimlestirildi (30 gunluk silme suresi doldu).`);
  }

  return affected;
};

/** Sunucu surecinde bir kez cagrilir (bkz. server.ts). Her gun gece yarisi
 *  (sunucu saatiyle) calisir — sik bir islem degil, gunde bir yeterli. */
export const scheduleAnonymizeExpiredDeletions = (): void => {
  cron.schedule('0 0 * * *', () => {
    void runAnonymizeExpiredDeletions().catch((error: unknown) => {
      logger.error('Hesap anonimlestirme gorevi basarisiz:', error);
    });
  });
};
