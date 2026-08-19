import activityModel from '../models/activity.model';
import groupModel from '../models/group.model';
import { buildPagination, parsePagination } from '../utils/pagination';

import type { ActivityKind, ActivityRow } from '../models/activity.model';
import type { PageQuery, Pagination } from '../utils/pagination';

/**
 * Aktivite akisi — kullanicinin **tum** gruplarindaki olaylar, tek listede.
 *
 * `summary.service` ile ayni ailedeki ikinci toplu uc nokta: soru yine "bu
 * kullanicinin butun gruplari birlikte ne durumda?" ama cevabin sekli farkli.
 * Ozet bir **an**i anlatiyor (su anki bakiye, bu ayki harcama), akis bir
 * **gecmisi**. Bu yuzden ayri bir servis: ozete sayfalanmis bir olay listesi
 * eklemek onu hem onbelleklenemez hem de iki farkli soruyu yanitlayan bir uc
 * nokta yapardi.
 *
 * YETKI
 * -----
 * Grup bazli uc noktalardaki `requireMembership` kapisinin buradaki karsiligi
 * filtreleme: olaylar yalnizca `listMembershipNames`ten donen gruplar icinde
 * araniyor. Uyesi olunmayan bir grubun olayi sorgunun **sonucuna hic girmiyor**
 * — sonradan elenmiyor, en basta WHERE'e giriyor. Adres de bir kullanici ID'si
 * tasimiyor: hedef her zaman token'in sahibi (`/users/me/*` ile ayni gerekce).
 */

/** Arayuzdeki uc harfli rozetlerin karsiligi olan tur listesi (bkz. ActivityKind). */
export interface ActivityEvent {
  /**
   * Olayin tekil kimligi: `kind` + kaynak satirin ID'si.
   *
   * Yalnizca satir ID'si yetmezdi — ayni odeme kaydi hem "bildirildi" hem
   * "onaylandi" olayi uretiyor ve ikisi de `settlements.id` tasiyor. Arayuzde
   * ayni React anahtarina sahip iki satir olurdu.
   */
  id: string;
  kind: ActivityKind;
  occurred_at: Date;
  group_id: string;
  group_name: string;
  actor_id: string;
  actor_name: string;
  /** Odeme olaylarinda karsi taraf; harcama olaylarinda `null`. */
  counterparty_id: string | null;
  counterparty_name: string | null;
  /** Olayin tutari. Duzenlemede **yeni** tutar. NUMERIC metni. */
  amount: string;
  /**
   * Duzenlemeden onceki tutar; yalnizca `expense_edited` icin dolu.
   *
   * Tutar degismediginde (yalnizca kategori ya da odeyen degistiginde) bu alan
   * `amount` ile **esit** doner, `null` degil. Bilincli: alan depolanan gecmisi
   * oldugu gibi yansitiyor, "degisti mi" yorumunu yapmiyor. Cumleyi kuran
   * arayuz iki degeri karsilastirip hangi metni yazacagina kendisi karar verir
   * (bkz. docs/decisions/aktivite-akisi.md).
   */
  previous_amount: string | null;
  /** Harcamanin aciklamasi; odeme olaylarinda `null`. Duzenlemede **yeni** ad. */
  description: string | null;
  previous_description: string | null;
}

export interface ActivityListResult {
  events: ActivityEvent[];
  pagination: Pagination;
}

export type ActivityListQuery = PageQuery;

/**
 * GET /activity?page=1&limit=20
 *
 * Sorgu sayisi **sabit** (3), kullanicinin grup sayisindan bagimsiz:
 * uyelikler + olay sayfasi + toplam sayi. Grup adlari da ilk sorgudan geliyor,
 * yani olay satirlarini adla zenginlestirmek ek gidis-donus uretmiyor.
 */
const listActivity = async (
  userId: string,
  query: ActivityListQuery = {}
): Promise<ActivityListResult> => {
  const page = parsePagination(query);

  const groups = await groupModel.listMembershipNames(userId);
  const groupNames = new Map(groups.map((group) => [group.id, group.name]));

  const { events, total } = await activityModel.listForGroups(
    groups.map((group) => group.id),
    { limit: page.limit, offset: page.offset }
  );

  return {
    events: events.map(toPublicEvent(groupNames)),
    pagination: buildPagination(page, total),
  };
};

/**
 * Ham satiri API gorunumune cevirir.
 *
 * Grup adi burada, sorguda degil: birlesimin her dalina `groups` join'i eklemek
 * ayni adi bes kez okurdu ve ad zaten uyelik sorgusundan elde. Eslemede
 * bulunmayan bir `group_id` **imkansiz** — olaylar zaten o grup listesiyle
 * filtrelendi; yine de `??` ile savunuluyor, cunku alternatif ekrana
 * "undefined" yazmak olurdu.
 */
const toPublicEvent =
  (groupNames: ReadonlyMap<string, string>) =>
  (row: ActivityRow): ActivityEvent => ({
    id: `${row.kind}:${row.event_id}`,
    kind: row.kind,
    occurred_at: row.occurred_at,
    group_id: row.group_id,
    group_name: groupNames.get(row.group_id) ?? 'Bilinmeyen grup',
    actor_id: row.actor_id,
    actor_name: row.actor_name,
    counterparty_id: row.counterparty_id,
    counterparty_name: row.counterparty_name,
    amount: row.amount,
    previous_amount: row.previous_amount,
    description: row.description,
    previous_description: row.previous_description,
  });

export default { listActivity };

export { listActivity };
