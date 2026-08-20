import { ArrowRight, TriangleAlert } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import ActivityRow from '@/components/ActivityRow';
import CloseAccountDialog from '@/components/CloseAccountDialog';
import GroupCard from '@/components/GroupCard';
import HomeFeatureCard from '@/components/HomeFeatureCard';
import HomeNetStatusCard from '@/components/HomeNetStatusCard';
import HomeStatCard from '@/components/HomeStatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import activityApi from '../api/activity';
import { getErrorMessage } from '../api/client';
import settlementsApi from '../api/settlements';
import { useGroupsData, useSummaryData } from '../hooks/useAppData';
import useAsync from '../hooks/useAsync';
import useAuth from '../hooks/useAuth';
import { dative } from '../utils/turkish';
import { RECEIPT_TILE, buildNetStatus, buildSpendTile } from '../utils/homeCards';
import { centsToApiAmount, formatCents, parseAmountToCents } from '../utils/money';

import type {
  ActivityEvent,
  ActivityListResult,
  Contact,
  GroupSummary,
  PendingApproval,
  PendingDebt,
} from '../types/models';
import type { HomeNetStatus, HomeStatTile } from '../utils/homeCards';

/** Ana sayfadaki "Son hareketler" kac kayit gosteriyor — Aktivite sayfasinin
 *  tam akisi degil, bir onizleme (bkz. docs/decisions/3.15-home-son-hareketler.md). */
const RECENT_ACTIVITY_LIMIT = 5;

/**
 * Home — giris sonrasi ilk ekran.
 *
 * SAYFANIN AMACI: TUTMAK DEGIL, YONLENDIRMEK
 * ------------------------------------------
 * Home bir vitrin degil bir **giris holu**. Kullanici bu uygulamaya borcunu
 * gormeye geliyor; Home'un isi o yolu kisaltmak, uzatmak degil.
 *
 * IZGARANIN ALTI: CTA DEGIL, "SENI BEKLEYENLER"
 * -----------------------------------------------
 * Eskiden burada genel bir "Gruplarini Gor" butonu vardi. Kullanicinin asil
 * sorusu "hangi grubum var" degil "su an ne yapmam gerekiyor" oldugu icin
 * buton, somut bir eylem listesiyle (onay bekleyen odemeler + odemem gereken
 * netlesmis bakiyeler) degistirildi — bkz. docs/decisions/3.13-home-seni-bekleyenler.md.
 * Bekleyen hicbir sey yoksa bolum tamamen gizleniyor; bos bir "her sey
 * yolunda" kutusu Home'un ana isine (ozet + yonlendirme) hicbir sey katmiyor.
 *
 * CAROUSEL KALDIRILDI
 * -------------------
 * Onceki surumde ayni icerik bir carousel icindeydi: ok butonlari, nokta
 * gostergeleri, swipe. Uc kutuluk bir icerik icin bunlarin hepsi **gereksiz
 * mekanikti** — kullanici okumadan once "kac kart var, hepsini gordum mu?"
 * sorusuna takiliyordu ve kartlarin yarisi her zaman ekran disindaydi. Sabit
 * izgarada her sey ilk bakista gorunuyor, tiklanacak hicbir gezinme ogesi yok.
 * Ayrintili gerekce: docs/decisions/home-ve-bos-durum-duzeltme.md.
 *
 * HATA DURUMU SAYFAYI DUSURMUYOR
 * ------------------------------
 * Ozet cekilemezse sayfa hata ekranina donmuyor: karsilama ve tanitim karosu
 * ayakta kaliyor, yalnizca kisisel karolarin yerinde kucuk bir uyari cikiyor.
 * "Seni bekleyenler" de dogal olarak gizli kaliyor — ozet olmadan hangi
 * satirlarin gosterilecegi bilinmiyor, uydurmak yanlis olurdu.
 *
 * EN ALTTA: "GRUPLAR", GRUPLARIM'DAKI AYNI KART
 * -------------------------------------------------
 * "Seni bekleyenler"in altinda tum gruplarin listesi var — Gruplarim
 * sayfasindaki **ayni** `GroupCard` bileseniyle, ikinci bir kopyasi
 * yazilmadan (bkz. docs/decisions/3.14-home-gruplar-bolumu.md). Veri de ayni
 * yerden: `useGroupsData()`, `AppDataProvider`in zaten tuttugu paylasilan
 * `GET /groups` sonucu — Home'un kendi istegini atmasi ikinci bir ag
 * gidis-donusu ve sidebar'daki grup kisayollarindan ayrisma riski demekti.
 *
 * EN ALTTA: "SON HAREKETLER", AKTIVITE SAYFASINDAKI AYNI SATIR
 * ------------------------------------------------------------------
 * `GroupCard` ile ayni ilke: yeni bir satir bileseni yazilmadi,
 * `components/ActivityRow.tsx` Aktivite sayfasindan buraya tasindi ve iki
 * yer de oradan import ediyor (bkz. docs/decisions/3.15-home-son-hareketler.md).
 * Veri de yeni bir uc nokta degil — **ayni** `GET /activity`, yalnizca
 * `limit=5` ile (Aktivite sayfasi `useActivityFeed` uzerinden sayfalanmis tam
 * akisi cekiyor; burasi "daha fazla yukle" gerektirmeyen tek seferlik kucuk
 * bir istek, o yuzden dogrudan `useAsync` kullanildi).
 */
const HomePage = () => {
  const { user } = useAuth();

  /*
    Ozet artik sayfaya degil `AppDataProvider`a ait: ayni veriyi sidebar'daki
    bekleyen odeme rozeti de okuyor. Sayfa kendi istegini atsaydi Home her
    acildiginda ayni uc noktaya ikinci bir istek gitmis olurdu.
  */
  const summary = useSummaryData();
  const groups = useGroupsData();

  const fetchRecentActivity = useCallback(
    () => activityApi.listActivity({ limit: RECENT_ACTIVITY_LIMIT }),
    []
  );
  const recentActivity = useAsync<ActivityListResult>(fetchRecentActivity, 'Son hareketler alinamadi');

  const netStatus = useMemo(() => buildNetStatus(summary.data), [summary.data]);
  const spendTile = useMemo(() => buildSpendTile(summary.data), [summary.data]);

  const pending = summary.data?.pendingSettlementsCount ?? 0;

  return (
    /*
      Sayfa artik dikey olarak ortalanmiyor. Onceki surumde carousel tek satir
      oldugu icin ekranin alt yarisi bos kaliyordu ve `min-h` + `justify-center`
      ile bu bosluk kapatiliyordu. Izgara ekranin dogal akisini zaten dolduruyor;
      ortalama burada icerigi yukaridan koparmaktan baska bir sey yapmazdi ve
      diger uc ekranin (Gruplar, Ayarlar, Admin) ustten baslama davranisiyla da
      celisirdi.
    */
    <section className="home-page flex flex-col gap-6">
      <header className="home-page__head">
        {/*
          Ad gelmeden once iskelet: "Merhaba, undefined" ya da bir kare
          boyunca bos bir baslik gostermektense yer tutmak dogru. `user`
          `/auth/me` cevabindan gelir ve genelde sayfadan once hazirdir.
        */}
        {user ? (
          <h1 className="home-page__greeting">Merhaba, {user.name}</h1>
        ) : (
          <Skeleton className="skeleton-line skeleton-line--title h-8 w-52" />
        )}
        <p className="mt-1 text-sm text-ink-muted">
          Ozetine goz at, sonra gruplarindaki hesaplara don.
        </p>
      </header>

      {/* Uyari basligin hemen altinda: bir bildirim orada beklenir. */}
      {pending > 0 && <PendingBanner count={pending} />}

      {/*
        Ozet okunamadiysa izgara yine ciziliyor — yalnizca kisisel karolar
        eksik — ama neden eksik olduklari soyleniyor. Sessizce iki karo
        gostermemek "ozetin yok" izlenimi verirdi.
      */}
      {!summary.loading && summary.error && (
        <div
          className="state-box state-box--error card-solid border-destructive/30 p-4 text-sm"
          role="alert"
        >
          <p className="text-destructive">{summary.error}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={summary.reload}>
            Tekrar dene
          </Button>
        </div>
      )}

      {summary.loading ? (
        <HomeGridSkeleton />
      ) : (
        <HomeGrid netStatus={netStatus} spendTile={spendTile} />
      )}

      {!summary.loading && summary.data && (
        <PendingForYou
          approvals={summary.data.pendingApprovals}
          debts={summary.data.pendingDebts}
          onChanged={summary.reload}
        />
      )}

      {!groups.loading && groups.error && (
        <div
          className="state-box state-box--error card-solid border-destructive/30 p-4 text-sm"
          role="alert"
        >
          <p className="text-destructive">{groups.error}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={groups.reload}>
            Tekrar dene
          </Button>
        </div>
      )}

      {groups.loading && <GroupsSectionSkeleton />}

      {!groups.loading && groups.data && groups.data.length > 0 && (
        <GroupsSection
          groups={groups.data}
          currentUserId={user?.id ?? ''}
          onExpenseAdded={groups.reload}
        />
      )}

      {!recentActivity.loading && recentActivity.error && (
        <div
          className="state-box state-box--error card-solid border-destructive/30 p-4 text-sm"
          role="alert"
        >
          <p className="text-destructive">{recentActivity.error}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={recentActivity.reload}>
            Tekrar dene
          </Button>
        </div>
      )}

      {recentActivity.loading && <RecentActivitySkeleton />}

      {!recentActivity.loading && recentActivity.data && recentActivity.data.events.length > 0 && (
        <RecentActivitySection events={recentActivity.data.events} currentUserId={user?.id ?? ''} />
      )}
    </section>
  );
};

/**
 * Sabit izgara.
 *
 * DUZEN
 * -----
 *   ust satir : genis karo (net durum) + dar karo (bu ay harcanan)
 *   alt satir : tam genislikte tanitim karosu
 *
 * Genislik farki `sm:grid-cols-3` + `col-span-2` ile: net durum sayfanin
 * tasidigi **asil** sayi, dolayisiyla daha genis kutuyu o aliyor. Esit iki
 * kutu olsaydi ikisi de "esit onemde" okunurdu.
 *
 * Dar ekranda tek sutuna dusuyor ve sira aynen korunuyor.
 *
 * Kisisel karolar yoksa (ozet okunamadi) izgara tek elemanli kaliyor: tanitim
 * karosu tam genislikte, tek basina. Yer tutan bos kutu birakilmiyor.
 */
const HomeGrid = ({
  netStatus,
  spendTile,
}: {
  netStatus: HomeNetStatus | null;
  spendTile: HomeStatTile | null;
}) => (
  <div
    className="home-grid grid gap-4 sm:grid-cols-3"
    role="region"
    aria-label="Ozetin ve oneriler"
  >
    {netStatus && (
      <div className="sm:col-span-2">
        <HomeNetStatusCard status={netStatus} />
      </div>
    )}

    {spendTile && (
      <div>
        <HomeStatCard tile={spendTile} />
      </div>
    )}

    <div className="sm:col-span-3">
      <HomeFeatureCard tile={RECEIPT_TILE} />
    </div>
  </div>
);

/**
 * Yukleme iskeleti.
 *
 * Kutu olculeri gercek izgarayla **ayni** (`sm:col-span-*`, `min-h-36`): ozet
 * gelince sayfa ziplamiyor, karolar yerinde doluyor.
 */
const HomeGridSkeleton = () => (
  <div className="home-grid grid gap-4 sm:grid-cols-3" aria-busy="true" aria-label="Ozet yukleniyor">
    <Skeleton className="min-h-36 rounded-xl sm:col-span-2" />
    <Skeleton className="min-h-36 rounded-xl" />
    <Skeleton className="min-h-24 rounded-xl sm:col-span-3" />
  </div>
);

/**
 * Bekleyen odeme uyarisi.
 *
 * Hangi gruba gidecegini **bilmiyoruz**: ozet ucu yalnizca sayi donuyor, grup
 * kirilimi yok. Bu yuzden hedef `/groups` — kullanici hangi grupta oldugunu
 * orada bir bakista goruyor. Rastgele bir gruba gondermek, yanlis gruba
 * goturmenin yarisindan fazla ihtimalle mumkun oldugu icin daha kotu olurdu.
 */
const PendingBanner = ({ count }: { count: number }) => (
  <Link
    to="/groups"
    className="home-banner card-solid flex items-center gap-3 border-rose/25 bg-rose/6 p-3 text-sm transition-colors hover:bg-rose/10"
  >
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-rose/12">
      <TriangleAlert className="size-4 text-rose" aria-hidden />
    </span>

    <span className="min-w-0 flex-1 text-ink">
      <strong className="font-semibold">{count} bekleyen odemen var.</strong>{' '}
      <span className="text-ink-muted">Onay bekleyenleri gruplarindan gorebilirsin.</span>
    </span>

    <ArrowRight className="size-4 shrink-0 text-rose" aria-hidden />
  </Link>
);

/**
 * "Seni bekleyenler" — izgaranin altinda, eski CTA'nin yerinde.
 *
 * Iki turden satir tek listede birlesiyor: ONY (onayimi bekleyen bir odeme —
 * `pendingApprovals`, Aktivite sayfasindaki `PendingApprovalBanner` ile ayni
 * uc noktadan) ve BRC (odemem gereken netlesmis bir bakiye — `pendingDebts`,
 * `summary.service.ts`teki grup-bazli netlestirmeden). Onay once geliyor:
 * bir karar benden bekliyor, borc ise dogrudan tek tikla kapatilabiliyor.
 *
 * Ikisi de bosken bolum hic cizilmiyor — gerekce yukarida, bilesenin
 * basindaki dosya yorumunda.
 */
const PendingForYou = ({
  approvals,
  debts,
  onChanged,
}: {
  approvals: PendingApproval[];
  debts: PendingDebt[];
  onChanged: () => void;
}) => {
  if (approvals.length === 0 && debts.length === 0) {
    return null;
  }

  return (
    <section className="home-pending flex flex-col gap-3">
      <h2 className="text-lg">Seni bekleyenler</h2>

      <ul className="flex flex-col gap-2">
        {approvals.map((approval) => (
          <ApprovalRow key={approval.id} approval={approval} onChanged={onChanged} />
        ))}
        {debts.map((debt) => (
          <DebtRow key={`${debt.group_id}-${debt.to_user}`} debt={debt} onChanged={onChanged} />
        ))}
      </ul>
    </section>
  );
};

/**
 * ONY satiri: birinin "odedim" diye isaretledigi, benim onayimi bekleyen bir
 * kayit. Aksiyonlar Aktivite sayfasindaki `PendingApprovalBanner`le **ayni**
 * uc noktalari kullaniyor (`confirmSettlement`/`rejectSettlement`); farkli
 * olan yalnizca gorunum (banner tek kayit, burada liste satiri).
 *
 * Basari sonrasi yerel bir yama atilmiyor — `onChanged` (`summary.reload`)
 * tum ozeti sunucudan yeniden okuyor: bu satirin kaybolmasi, toplam bakiye ve
 * sidebar rozeti ayni anda, ayni kaynaktan degisiyor (bkz. dosyanin basindaki
 * "SUNUCUDAN GERI OKUMA" ilkesi, docs/decisions/2.6.md).
 */
const ApprovalRow = ({
  approval,
  onChanged,
}: {
  approval: PendingApproval;
  onChanged: () => void;
}) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cents = parseAmountToCents(approval.amount) ?? 0;

  const resolve = (action: 'confirm' | 'reject') => {
    if (busy) {
      return;
    }

    setBusy(true);
    setError(null);

    const request =
      action === 'confirm'
        ? settlementsApi.confirmSettlement(approval.id)
        : settlementsApi.rejectSettlement(approval.id);

    void request
      .then(() => onChanged())
      .catch((caught: unknown) => {
        setError(getErrorMessage(caught, 'Odeme guncellenemedi'));
        setBusy(false);
      });
  };

  return (
    <li className="home-pending-row card-solid flex flex-wrap items-start justify-between gap-3 p-3.5">
      <div className="flex min-w-0 items-start gap-3">
        <span
          className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-amber/25 bg-amber-surface text-[0.65rem] font-semibold tracking-wide text-amber"
          title="Onay bekleniyor"
        >
          ONY
        </span>

        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">
            {approval.from_name}, sana {formatCents(cents)} odedigini isaretledi
          </p>
          <p className="mt-0.5 text-xs text-ink-muted">{approval.group_name} · onayin bekleniyor</p>
          {error && (
            <p className="field-error mt-1 text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => resolve('reject')}>
          Itiraz Et
        </Button>
        <Button type="button" size="sm" disabled={busy} onClick={() => resolve('confirm')}>
          Onayla
        </Button>
      </div>
    </li>
  );
};

/**
 * BRC satiri: bir grupta net borclu oldugum, **netlesmis** (optimalNetting/
 * greedyNetting transferi) bir bakiye. "Kisiler" sayfasindaki
 * `ContactGroupBalance.net_balance` ile KARISTIRILMAMALI — bu ikili bir
 * toplam degil, grubun kendi netlestirme algoritmasinin urettigi transfer
 * (gerekce: docs/decisions/3.13-home-seni-bekleyenler.md).
 *
 * "Hesabi kapat" Kisiler sayfasindaki **ayni** `CloseAccountDialog`i
 * kullaniyor — ikinci bir kopya yazilmadi. Diyalog bir `Contact` bekliyor;
 * burada tek gruplu, bu satirdan uretilen sentetik bir kisi veriliyor.
 * `slug` ve ust seviye `nickname` bu diyalogda hic okunmuyor (yalnizca
 * Kisiler'deki ayri "ortak gruplar" diyalogu `slug` kullaniyor), bos
 * birakilmalari zararsiz.
 */
const DebtRow = ({ debt, onChanged }: { debt: PendingDebt; onChanged: () => void }) => {
  const [open, setOpen] = useState(false);
  const cents = parseAmountToCents(debt.amount) ?? 0;

  /*
    `PendingDebt.amount` her zaman pozitif bir buyukluk (`Transfer.amount` >
    0). `ContactGroupBalance.net_balance` ise tersi isaret kuralini kullaniyor
    ("Pozitif = kisi borclu", yani karsi taraf bana borcluysa pozitif) — burada
    BEN borcluyum, o yuzden negatife cevriliyor. `CloseAccountDialog` bu
    isarete bakarak "odeyecegim" / "bana borclu" ayrimini yapiyor. `formatCents`
    **degil** `centsToApiAmount` kullaniliyor: sonuc `CloseAccountDialog`
    icinde `parseAmountToCents`ten tekrar geciyor, o da NUMERIC bicimi
    ("-85.00") bekliyor, gosterim metnini ("-85,00 ₺") degil.
  */
  const negatedBalance = centsToApiAmount(-cents);

  const contact: Contact = {
    user_id: debt.to_user,
    name: debt.to_user_name,
    nickname: null,
    net_balance: negatedBalance,
    shared_groups: [
      {
        id: debt.group_id,
        name: debt.group_name,
        slug: '',
        nickname: null,
        net_balance: negatedBalance,
      },
    ],
  };

  return (
    <li className="home-pending-row card-solid flex flex-wrap items-start justify-between gap-3 p-3.5">
      <div className="flex min-w-0 items-start gap-3">
        <span
          className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-signal-negative/20 bg-signal-negative/10 text-[0.65rem] font-semibold tracking-wide text-signal-negative"
          title="Netlesmis borc"
        >
          BRC
        </span>

        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">
            {dative(debt.to_user_name)} {formatCents(cents)} borcun var
          </p>
          <p className="mt-0.5 text-xs text-ink-muted">{debt.group_name} · netlesmis tutar</p>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0 border-rose/25 text-rose hover:bg-rose/10 hover:text-rose"
        onClick={() => setOpen(true)}
      >
        Hesabi kapat
      </Button>

      <CloseAccountDialog open={open} onOpenChange={setOpen} contact={contact} onDone={onChanged} />
    </li>
  );
};

/**
 * "Gruplar" — Gruplarim sayfasindakiyle **ayni** liste, **ayni** `GroupCard`.
 * Ikinci bir kart bileseni yazilmadi; gerekce docs/decisions/3.14-home-gruplar-bolumu.md.
 *
 * Grup yoksa bolum hic cizilmiyor — "Seni bekleyenler"le ayni kural: bos bir
 * baslik + rozet, Home'un ana isine hicbir sey katmazdi ve `/groups` zaten
 * kendi bos-durum ekranini gosteriyor.
 */
const GroupsSection = ({
  groups,
  currentUserId,
  onExpenseAdded,
}: {
  groups: GroupSummary[];
  currentUserId: string;
  onExpenseAdded: () => void;
}) => (
  <section className="home-groups flex flex-col gap-3">
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-lg">Gruplar</h2>
      <Badge variant="outline" className="border-ink/15 bg-ink/5 text-ink-muted">
        {groups.length} grup
      </Badge>
    </div>

    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <GroupCard
          key={group.id}
          group={group}
          currentUserId={currentUserId}
          onExpenseAdded={onExpenseAdded}
        />
      ))}
    </div>
  </section>
);

/** Yukleme iskeleti — `GroupCard`in kabaca yuksekligiyle ayni, ziplama olmasin. */
const GroupsSectionSkeleton = () => (
  <div className="flex flex-col gap-3" aria-busy="true" aria-label="Gruplar yukleniyor">
    {[0, 1].map((index) => (
      <div className="group-card card-glass flex items-center gap-4 p-5" key={index}>
        <Skeleton className="skeleton-line h-10 w-10 shrink-0 rounded-full" />
        <div className="flex-1">
          <Skeleton className="skeleton-line skeleton-line--title h-5 w-2/5" />
          <Skeleton className="skeleton-line skeleton-line--short mt-2 h-3 w-3/5" />
        </div>
        <Skeleton className="skeleton-line h-10 w-24 rounded-lg" />
      </div>
    ))}
  </div>
);

/**
 * "Son hareketler" — Aktivite sayfasindaki `ActivityRow`in **ayni** hali,
 * gunlere bolunmeden duz bir liste olarak (Aktivite'nin `groupByDay`si burada
 * yok — bu bir onizleme, sayfalanmis bir gecmis degil).
 */
const RecentActivitySection = ({
  events,
  currentUserId,
}: {
  events: ActivityEvent[];
  currentUserId: string;
}) => (
  <section className="home-recent-activity flex flex-col gap-3">
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-lg">Son hareketler</h2>
      <Link to="/activity" className="text-sm text-rose hover:underline">
        Tumunu gor
      </Link>
    </div>

    <ul className="flex flex-col gap-2">
      {events.map((event) => (
        <ActivityRow key={event.id} event={event} currentUserId={currentUserId} />
      ))}
    </ul>
  </section>
);

/** Yukleme iskeleti — `ActivityRow`in kabaca yuksekligiyle ayni. */
const RecentActivitySkeleton = () => (
  <div className="flex flex-col gap-2" aria-busy="true" aria-label="Son hareketler yukleniyor">
    {[0, 1, 2].map((index) => (
      <div className="activity-row card-solid flex justify-between gap-3 p-3.5" key={index}>
        <div className="flex w-full items-center gap-3">
          <Skeleton className="size-9 shrink-0 rounded-lg" />
          <div className="flex w-full flex-col gap-2">
            <Skeleton className="skeleton-line h-4 w-3/5" />
            <Skeleton className="skeleton-line h-3 w-1/4" />
          </div>
        </div>
        <Skeleton className="skeleton-line h-5 w-16 shrink-0" />
      </div>
    ))}
  </div>
);

export default HomePage;
