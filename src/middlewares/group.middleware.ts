import groupModel from '../models/group.model';
import { isUuid } from '../utils/uuid';

import type { RequestParamHandler } from 'express';

/**
 * `/groups/:id` altindaki adres parcasini uuid'ye cevirir.
 *
 * NEDEN BURADA, SERVIS KATMANINDA DEGIL
 * -------------------------------------
 * Grup baglamli **her** uc nokta ayni parametreyi aliyor: harcamalar, mesajlar,
 * bakiyeler, davet, uye cikarma... Cozumleme servislere yayilsaydi her biri
 * `requireMembership`ten sonra elindeki degeri "uuid mi slug mi" diye bilmek
 * zorunda kalirdi; kacirilan tek bir yer, slug metnini uuid kolonuna sorgu
 * olarak gonderip 500 uretirdi.
 *
 * `router.param` bu isi HTTP sinirinda **bir kez** yapiyor: controller'lar ve
 * servisler ellerine her zaman uuid geldigini varsaymaya devam ediyor, yani
 * bu ozellik icin degismediler.
 *
 * BULUNAMAYAN SLUG NEDEN HATA DEGIL
 * ---------------------------------
 * Burada 404 atsaydik uc nokta bir **varlik oracle**'ina donusurdu: saldirgan
 * slug deneyerek hangi gruplarin var oldugunu ogrenirdi (1.4'teki karar).
 * Bunun yerine parametre oldugu gibi birakiliyor; asagida `requireMembership`
 * onu uuid olarak tanimaz ve "grup yok" ile "senin degil" icin ayni 403'u
 * doner. Yani cozumlenemeyen slug, olmayan gruptan ayirt edilemez.
 *
 * Uuid gelen istekler sorguya hic girmiyor: eski linkler ve istemcinin
 * cevaptan aldigi id'lerle yaptigi cagrilar ek bir gidis-donus odemiyor.
 */
export const resolveGroupParam: RequestParamHandler = (req, res, next, value) => {
  if (typeof value !== 'string' || isUuid(value)) {
    next();
    return;
  }

  groupModel
    .findBySlug(value)
    .then((group) => {
      if (group) {
        req.params.id = group.id;
      }

      next();
    })
    .catch(next);
};

export default resolveGroupParam;
