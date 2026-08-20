import { dayKeyOf, formatDayGroup } from './datetime';
import { formatCents, parseAmountToCents } from './money';
import { dative } from './turkish';

import type { ActivityEvent, ActivityKind, GroupLastActivity } from '../types/models';

/**
 * Aktivite akisinin gosterim kurallari: rozet, cumle ve gun gruplama.
 *
 * NEDEN CUMLE ISTEMCIDE KURULUYOR
 * -------------------------------
 * Backend olayin **malzemesini** gonderiyor (kim, kime, ne kadar, oncesi/sonrasi),
 * cumlenin kendisini degil. Iki sebep:
 *
 *   1. **"Sen" ayrimi.** Ayni olay, okuyan kisiye gore farkli bir cumle: aktor
 *      okuyucunun kendisiyse "Sen ... ekledin", degilse "Serenad ... ekledi".
 *      Bu bir gorunum karari ve `BalancesTab` zaten ayni ayrimi yapiyor.
 *   2. **Turkce ekler tek yerde.** `utils/turkish.ts` yonelme halini uretiyor
 *      ("Baris'a", "Ece'ye"). Cumleyi backend kursaydi ayni kuralin ikinci bir
 *      kopyasi orada da yasardi ve ikisi zamanla ayrisirdi.
 *
 * Sonuc: backend'in isi veri, buranin isi dil.
 */

/**
 * Uc harfli rozetler.
 *
 * NEDEN KISALTMA — TAM KELIME DEGIL
 * ---------------------------------
 * Rozet her satirin **solunda, sabit genislikte** duruyor ve listenin isi
 * satirlari tararken tur farkini bir bakista gostermek. Tam kelimeler
 * ("Eklendi", "Duzenlendi", "Onaylandi") uc ayri genislikte kutu uretir; goz
 * hizalanacak bir kenar bulamaz ve satirlarin baslangici titrer. Uc harf ise
 * her turde ayni kareye sigiyor.
 *
 * Kisaltmalar ayrica cumleyi tekrar etmiyor: satirin metni zaten "ekledi"
 * diyor, rozet o kelimenin ikinci kopyasi degil bir **simge**. Bu yuzden tek
 * baslarina okunmalari da gerekmiyor — anlam yanindaki cumlede.
 *
 * ASCII: kod tabaninin geri kalanindaki arayuz metinleriyle ayni yazim
 * ("Odemeler", "Aciklama"). Aksanli tek kelime olmak istemiyorlar.
 */
export const ACTIVITY_BADGES: Record<ActivityKind, string> = {
  expense_created: 'EKL',
  expense_edited: 'DUZ',
  settlement_created: 'ODE',
  settlement_confirmed: 'ONY',
  settlement_rejected: 'RED',
};

/** Ekran okuyucu icin rozetin acilimi; kisaltma tek basina anlasilmaz. */
export const ACTIVITY_BADGE_TITLES: Record<ActivityKind, string> = {
  expense_created: 'Harcama eklendi',
  expense_edited: 'Harcama duzenlendi',
  settlement_created: 'Odeme isaretlendi',
  settlement_confirmed: 'Odeme onaylandi',
  settlement_rejected: 'Odeme reddedildi',
};

/** Rozet turune gore zemin. Bilgi rengi tasimiyor — kisaltma zaten yazili,
 *  ton yalnizca goze tur farkini hizli gostermek icin (bkz. 2.3 kurali).
 *  `components/ActivityRow.tsx` kullaniyor; ikisi ayni yerde kalsin diye
 *  diger rozet sabitleriyle (`ACTIVITY_BADGES`, `ACTIVITY_BADGE_TITLES`)
 *  birlikte burada. */
export const ACTIVITY_BADGE_TONE: Record<ActivityKind, string> = {
  expense_created: 'bg-ink/6 text-ink-muted',
  expense_edited: 'bg-ink/6 text-ink-muted',
  settlement_created: 'bg-amber-surface text-amber border border-amber/25',
  settlement_confirmed: 'bg-signal-positive/10 text-signal-positive',
  settlement_rejected: 'bg-signal-negative/10 text-signal-negative',
};

const amountOf = (value: string | null): number | null =>
  value === null ? null : parseAmountToCents(value);

/**
 * Duzenleme cumlesi.
 *
 * Uc ayri durum var cunku "duzenleme" tek bir sey degil: tutar degismis
 * olabilir, yalnizca ad degismis olabilir, ya da ikisi de ayni kalip kategori
 * veya odeyen degismis olabilir (backend her basarili guncelleme icin bir
 * gecmis satiri yaziyor). Hepsine ayni metni yazmak — ornegin her seferinde
 * tutar oku gostermek — degismemis bir tutari degismis gibi gosterirdi.
 */
const editedSentence = (event: ActivityEvent, subject: string, suffix: string): string => {
  const previousCents = amountOf(event.previous_amount);
  const currentCents = amountOf(event.amount);
  const name = event.description ?? 'harcama';

  const amountChanged =
    previousCents !== null && currentCents !== null && previousCents !== currentCents;

  if (amountChanged) {
    /*
      "duzelt" sessiz (t) ile bitiyor: Turkce'de sessiz sonrasi gelen ek
      sessizlesir (t+d -> t+t), yani dogru cekim "duzeltti"/"duzelttin"dir —
      asagidaki dosyanin "reddetti"/"reddettin" satirlariyla ayni kural.
      `suffix` ("di"/"din") sesli ya da sonor unsuzla biten koklerde (ekle,
      adlandir, duzenle) oldugu gibi kullanilabiliyor; burada d->t cevriliyor.
    */
    const assimilated = suffix.replace('d', 't');
    return `${subject} ${name} tutarini ${formatCents(previousCents)} -> ${formatCents(
      currentCents
    )} olarak duzelt${assimilated}`;
  }

  const renamed =
    event.previous_description !== null &&
    event.description !== null &&
    event.previous_description !== event.description;

  if (renamed) {
    return `${subject} ${event.previous_description} harcamasini ${event.description} olarak yeniden adlandir${suffix}`;
  }

  // Tutar da ad da ayni: degisen sey kategori ya da odeyen. Neyin degistigini
  // iddia etmiyoruz — gecmis satiri o ayrimi tasimiyor.
  return `${subject} ${name} harcamasini duzenle${suffix}`;
};

/**
 * Olayin tek cumlelik anlatimi.
 *
 * `currentUserId` cumlenin oznesini belirliyor: kullanicinin kendi yaptigi is
 * "Sen ... ekledin", baskasininki "Serenad ... ekledi". Odeme olaylarinda
 * ucuncu bir hal daha var — olay kullaniciyi **karsi taraf** olarak
 * ilgilendiriyor olabilir ("Zeynep odemeni onayladi"); o durumda kullanici
 * cumlenin nesnesi.
 */
export const activitySentence = (event: ActivityEvent, currentUserId: string): string => {
  const iAmActor = event.actor_id === currentUserId;
  const iAmCounterparty = event.counterparty_id === currentUserId;

  const actor = iAmActor ? 'Sen' : event.actor_name;
  // Turkce'de ozne 2. tekil sahis olunca fiil de degisiyor: "ekledin" / "ekledi".
  const suffix = iAmActor ? 'din' : 'di';
  const other = event.counterparty_name ?? 'bilinmeyen kisi';

  switch (event.kind) {
    case 'expense_created':
      return `${actor} ${event.description ?? 'harcama'} ekle${suffix}`;

    case 'expense_edited':
      return editedSentence(event, actor, suffix);

    case 'settlement_created':
      if (iAmActor) {
        return `Sen ${dative(other)} odeme isaretledin`;
      }
      if (iAmCounterparty) {
        return `${event.actor_name} sana odeme isaretledi`;
      }
      return `${event.actor_name}, ${dative(other)} odeme isaretledi`;

    case 'settlement_confirmed':
      if (iAmCounterparty) {
        return `${event.actor_name} odemeni onayladi`;
      }
      if (iAmActor) {
        return `Sen ${other} odemesini onayladin`;
      }
      return `${event.actor_name}, ${other} odemesini onayladi`;

    case 'settlement_rejected':
      if (iAmCounterparty) {
        return `${event.actor_name} odemeni reddetti`;
      }
      if (iAmActor) {
        return `Sen ${other} odemesini reddettin`;
      }
      return `${event.actor_name}, ${other} odemesini reddetti`;

    default:
      /*
        Bilinmeyen tur: backend yeni bir olay ekleyip istemci guncellenmemis
        olabilir. Satiri hic cizmemek akista sessiz bir bosluk birakirdi;
        grup adi ve tutar yine dogru, yalnizca fiil bilinmiyor.
        "yap" da sessiz (p) ile bitiyor -> ayni sessizlesme kurali ("yapti"/
        "yaptin"), bkz. editedSentence icindeki "duzelt" gerekcesi.
      */
      return `${actor} bir islem yap${suffix.replace('d', 't')}`;
  }
};

/**
 * `GroupLastActivity`i (gruplar listesi karti) `activitySentence`in bekledigi
 * `ActivityEvent` seklina tasir.
 *
 * Kartin cumleyi kendi kelimeleriyle kurmasi yerine bunu kullanmasinin
 * gerekcesi `activitySentence`inkiyle ayni: cumle tek yerde. `id`, `group_id`,
 * `group_name`, `previous_*` alanlari kartta yok ve `activitySentence` onlari
 * hic okumuyor — bos birakilmalari guvenli.
 */
export const lastActivitySentence = (
  activity: GroupLastActivity,
  currentUserId: string
): string =>
  activitySentence(
    {
      id: '',
      kind: activity.kind,
      occurred_at: activity.occurred_at,
      group_id: '',
      group_name: '',
      actor_id: activity.actor_id,
      actor_name: activity.actor_name,
      counterparty_id: activity.counterparty_id,
      counterparty_name: activity.counterparty_name,
      amount: activity.amount,
      previous_amount: null,
      description: activity.description,
      previous_description: null,
    },
    currentUserId
  );

export interface ActivityDayGroup {
  /** Yerel takvim gunu — React anahtari. */
  key: string;
  /** "BUGUN" / "DUN" / "17 AGUSTOS". */
  label: string;
  events: ActivityEvent[];
}

/**
 * Olaylari **gelis sirasini bozmadan** gunlere ayirir.
 *
 * Liste backend'den zaten en yeniden eskiye sirali geliyor; burada yeniden
 * siralama yapilmiyor, yalnizca ardisik ayni gunler tek baslik altinda
 * toplaniyor. Yeniden siralamak, backend'in uc anahtarli kesin siralamasini
 * (occurred_at, event_id, kind) istemcide daha zayif bir kurala cevirirdi.
 *
 * `now` disaridan verilebiliyor: "BUGUN" basligi saate bagli ve testlerin
 * gercek zamana bagimli olmamasi gerekiyor (`formatExpenseDate` ile ayni desen).
 */
export const groupByDay = (
  events: readonly ActivityEvent[],
  now: Date = new Date()
): ActivityDayGroup[] => {
  const groups: ActivityDayGroup[] = [];

  for (const event of events) {
    const key = dayKeyOf(event.occurred_at);
    const last = groups[groups.length - 1];

    if (last && last.key === key) {
      last.events.push(event);
    } else {
      groups.push({ key, label: formatDayGroup(event.occurred_at, now), events: [event] });
    }
  }

  return groups;
};

export default {
  ACTIVITY_BADGES,
  ACTIVITY_BADGE_TITLES,
  activitySentence,
  lastActivitySentence,
  groupByDay,
};
