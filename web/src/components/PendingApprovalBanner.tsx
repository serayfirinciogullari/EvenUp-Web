import { Check, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { getErrorMessage } from '../api/client';
import settlementsApi from '../api/settlements';
import { useSummaryData } from '../hooks/useAppData';
import { formatCents, parseAmountToCents } from '../utils/money';

import type { PendingApproval } from '../types/models';

/**
 * Aktivite sayfasinin ust banner'i: **onayimi bekleyen** odeme.
 *
 * NEDEN SAYFANIN USTUNDE VE SABIT
 * -------------------------------
 * Akis bir gecmis; banner ise bir **is emri**. Ikisi ayni listeye karistirilsaydi
 * bekleyen onay, zaman sirasindaki yerine gore asagi kayardi — yani en cok
 * ihtiyac duyuldugu anda (eski bir odeme uzun suredir bekliyorken) en gorunmez
 * oldugu yere duserdi. Sabit konum bu iliskiyi tersine ceviriyor: bekleyen bir
 * sey oldugu surece ekranda, akista ne kadar asagi inilirse inilsin.
 *
 * Kutu **yalnizca is varken** ciziliyor. Bos halde "bekleyen yok" yazan kalici
 * bir seride birakmak, sabit alani hicbir sey soylemeyen bir bantla dolduriirdi;
 * o bilgi zaten akisin kendisinden okunuyor.
 *
 * NEDEN TEK KAYIT GOSTERILIYOR
 * ----------------------------
 * Liste birden fazla olabilir ama banner en eskisini gosterip geri kalanini
 * sayiyla bildiriyor. Hepsini alt alta cizmek, sabit bolgeyi buyuterek akisi
 * ekrandan iterdi — sabit olmasinin anlami da kalmazdi. Sirali ilerleme
 * (birini kapat, sonraki gelsin) ayrica dogru is akisi: her karar tek tek
 * veriliyor.
 *
 * Aksiyonlar yalnizca **alacakli** tarafa acik; bu liste zaten yalnizca
 * kullanicinin alacakli oldugu kayitlari donuyor (`GET /settlements/pending`),
 * yani ekranda calismayacak bir buton hic ciziliyor olmuyor.
 */

interface PendingApprovalBannerProps {
  approvals: PendingApproval[];
  /** Onay/red sonrasi: hem bu liste hem akis yeniden isteniyor. */
  onResolved: () => void;
}

const PendingApprovalBanner = ({ approvals, onResolved }: PendingApprovalBannerProps) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sidebar/Aktivite rozeti icin: bkz. asagidaki `resolve` yorumu.
  const summary = useSummaryData();

  const target = approvals[0];
  const targetId = target?.id;

  /*
    Kayit degisince kilit acilir. `busy`yi istek doner donmez birakmak yanlis
    olurdu: tazeleme henuz gelmemisken ekranda hala **kapatilmis** kayit
    duruyor ve ikinci tiklama ona giderdi (backend 409 doner, kullanici sebepsiz
    bir hata gorurdu). Kilit, veri gercekten degisene kadar sürüyor.
  */
  useEffect(() => {
    setBusy(false);
    setError(null);
  }, [targetId]);

  if (!target) {
    return null;
  }

  const cents = parseAmountToCents(target.amount) ?? 0;
  const remaining = approvals.length - 1;

  const resolve = (action: 'confirm' | 'reject') => {
    if (busy) {
      return;
    }

    setBusy(true);
    setError(null);

    const request =
      action === 'confirm'
        ? settlementsApi.confirmSettlement(target.id)
        : settlementsApi.rejectSettlement(target.id);

    void request
      .then(() => {
        // Bakiye de degistigi icin elde guncelleme yok: dogru olan sunucudan
        // yeniden okumak (BalancesTab'daki `onResolved` ile ayni gerekce).
        onResolved();

        /*
          Sidebar/Aktivite rozeti AYRI bir kural izliyor: sayfa acilinca degil,
          yalnizca Onayla/Reddet'e BASILDIGINDA ve yerelde azaliyor — sunucuya
          gidip tekrar sormuyor. `Math.max(0, ...)`: ayni kayit baska bir
          sekmede de kapatilmaya calisilirsa sayac eksiye dusmesin. Gerekce:
          docs/decisions/optimistic-ui-duzeltme.md.
        */
        summary.mutate((current) =>
          current
            ? { ...current, pendingSettlementsCount: Math.max(0, current.pendingSettlementsCount - 1) }
            : current
        );
      })
      .catch((caught: unknown) => {
        setError(getErrorMessage(caught, 'Odeme guncellenemedi'));
        setBusy(false);
      });
  };

  return (
    <div
      /*
        `top-14 lg:top-0`: mobilde Layout'un kendi ust bari da `sticky top-0`
        (bkz. Layout.tsx) ve banner onun altina yapismali; genis ekranda o bar
        yok, banner sayfanin en ustune oturuyor.
      */
      className="activity-banner sticky top-14 z-20 mb-6 rounded-xl border p-4 lg:top-0"
      role="region"
      aria-label="Onay bekleyen odeme"
    >
      <p className="activity-banner__label text-[0.68rem] font-semibold tracking-[0.14em] uppercase">
        Onayin bekleniyor · En ustte sabit
      </p>

      <p className="activity-banner__text mt-2 font-semibold">
        {target.from_name}, sana {formatCents(cents)} odedigini isaretledi. Onaylayana kadar
        bakiyelere yansimaz.
      </p>

      {/* Hangi grup: liste gruplar arasi, bu bilgi olmadan kayit yerlestirilemez. */}
      <p className="activity-banner__meta mt-1 text-sm">
        {target.group_name}
        {remaining > 0 && ` · onay bekleyen ${remaining} kayit daha var`}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          className="activity-banner__confirm"
          disabled={busy}
          onClick={() => resolve('confirm')}
        >
          <Check className="size-4" aria-hidden />
          Onayla
        </Button>

        <Button
          type="button"
          variant="outline"
          className="activity-banner__dispute"
          disabled={busy}
          onClick={() => resolve('reject')}
        >
          <X className="size-4" aria-hidden />
          Itiraz Et
        </Button>
      </div>

      {error && (
        <p className="field-error mt-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};

export default PendingApprovalBanner;
