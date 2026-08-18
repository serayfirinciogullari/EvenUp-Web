import { ArrowRight, BellRing, CheckCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

import GlassCard from '@/components/GlassCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useSummaryData } from '../hooks/useAppData';

/**
 * Aktivite — sidebar'daki rozetin acildigi sayfa.
 *
 * KAPSAM BILINCLI OLARAK DAR
 * --------------------------
 * Gercek bir aktivite akisi (kim ne zaman harcama ekledi, kim odedi) icin
 * **gruplar arasi** bir uc nokta gerekiyor; backend'de boyle bir sey yok.
 * `GET /users/me/home-summary` yalnizca bir sayi donuyor:
 * `pendingSettlementsCount`. Bu sayfa bugun tam olarak o sayiyi ve onunla ne
 * yapilacagini gosteriyor.
 *
 * Alternatifler daha kotuydu: (a) sidebar'da hicbir yere gitmeyen bir oge
 * birakmak, (b) her grubun harcama akisini tek tek cekip istemcide birlestirmek
 * — grup sayisi kadar istek ve sayfa acilisinda gorunur bir gecikme demekti.
 *
 * Akis yazildiginda degisecek yer yalnizca bu dosya; sidebar ogesi ve rozet
 * oldugu gibi kalir.
 */
const ActivityPage = () => {
  const summary = useSummaryData();
  const pending = summary.data?.pendingSettlementsCount ?? 0;

  return (
    <section className="activity-page">
      <header className="activity-page__head">
        <h1>Aktivite</h1>
        <p className="mt-0.5 text-sm text-ink-muted">
          Onayini bekleyen odemeler ve gruplarindaki son durum.
        </p>
      </header>

      {summary.loading && <Skeleton className="mt-6 h-28 w-full rounded-xl" />}

      {!summary.loading && summary.error && (
        <div
          className="state-box state-box--error card-solid mt-6 border-destructive/30 p-6 text-center"
          role="alert"
        >
          <p className="text-sm text-destructive">{summary.error}</p>
          <Button variant="outline" className="mt-3" onClick={summary.reload}>
            Tekrar dene
          </Button>
        </div>
      )}

      {!summary.loading && !summary.error && (
        <GlassCard as="section" className="mt-6 flex items-center gap-4 p-6">
          <span
            className={
              'flex size-11 shrink-0 items-center justify-center rounded-full ' +
              (pending > 0 ? 'bg-rose/12' : 'bg-ink/5')
            }
          >
            {pending > 0 ? (
              <BellRing className="size-5 text-rose" aria-hidden />
            ) : (
              <CheckCheck className="size-5 text-ink-muted" aria-hidden />
            )}
          </span>

          <div className="min-w-0 flex-1">
            {/*
              Sayi metinle birlikte: rozetteki rakamin tek basina ne anlama
              geldigi ancak burada aciklaniyor.
            */}
            <h2 className="text-lg">
              {pending > 0 ? `${pending} bekleyen odeme` : 'Bekleyen odeme yok'}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              {pending > 0
                ? 'Onay bekleyen odemeler ilgili grubun Odemeler sekmesinde duruyor.'
                : 'Onayini bekleyen bir odeme yok. Yeni bir hesap acildiginda burada gorunur.'}
            </p>
          </div>

          {pending > 0 && (
            <Button asChild variant="outline" className="shrink-0">
              <Link to="/groups">
                Gruplara git
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
          )}
        </GlassCard>
      )}

      {/*
        Dogrudan soyleniyor: burasi bir akis degil, bir ozet. Ekranda gorunen
        bir bosluk icin "yakinda" demek, kullanicinin eksik sandigi seyi
        aciklamanin en ucuz yolu.
      */}
      <div className="mt-4 flex items-center gap-2 text-sm text-ink-muted">
        <Badge variant="outline" className="border-ink/15 text-ink-muted">
          Yakinda
        </Badge>
        <p>Harcama ve odeme akisinin tamami — kim ne zaman ne yapti — bu sayfaya gelecek.</p>
      </div>
    </section>
  );
};

export default ActivityPage;
