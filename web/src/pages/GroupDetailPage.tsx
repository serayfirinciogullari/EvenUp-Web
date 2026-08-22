import { ArrowLeft, Check, Plus, Settings, Users, X } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import AddExpenseModal from '@/components/AddExpenseModal';
import BalancesTab from '@/components/BalancesTab';
import ExpensesTab from '@/components/ExpensesTab';
import GlassCard from '@/components/GlassCard';
import GroupSettingsModal from '@/components/GroupSettingsModal';
import HomeNetStatusCard from '@/components/HomeNetStatusCard';
import MembersTab from '@/components/MembersTab';
import SettleUpModal from '@/components/SettleUpModal';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import groupsApi from '../api/groups';
import settlementsApi from '../api/settlements';
import { useGroupsData, useSummaryData } from '../hooks/useAppData';
import useAsync from '../hooks/useAsync';
import useAuth from '../hooks/useAuth';
import useExpenseFeed from '../hooks/useExpenseFeed';
import { getErrorMessage } from '../api/client';
import { viewForUser } from '../utils/balance';
import { formatExpenseDate } from '../utils/datetime';
import { groupPath } from '../utils/groupPath';
import { PILL_LABEL } from '../utils/homeCards';
import { formatCents, formatCentsAbsolute, parseAmountToCents } from '../utils/money';
import { dative } from '../utils/turkish';

import type { SettleTarget } from '@/components/SettleUpModal';
import type { BalanceTone } from '../utils/balance';
import type { HomeNetStatus } from '../utils/homeCards';
import type {
  BalanceResult,
  GroupDetail,
  GroupMonthlySummary,
  Settlement,
  SettlementListResult,
  SettlementView,
  Transfer,
} from '../types/models';

/**
 * Grup detayi — uygulamanin uctan uca akisi burada tamamlaniyor:
 *
 *     harcama ekle -> bakiye guncellenir -> "odedim" -> karsi taraf onaylar
 *     -> bakiye kapanir
 *
 * VERIYI SAYFA TUTUYOR, SEKMELER DEGIL
 * ------------------------------------
 * Dort istek de (grup, harcamalar, bakiye, odemeler) bu bilesende. Sekmeler
 * yalnizca gorunum. Gerekce: **harcama eklemek bakiyeyi degistirir.** Veriyi
 * sekmeler tutsaydi, "Harcamalar" sekmesindeki bir ekleme "Odemeler"
 * sekmesindeki veriyi bayat birakirdi — ustelik o sekme o an ekranda olmadigi
 * icin fark edilmeden. Sekme icerigi zaten aciklip kapandiginda unmount olur;
 * o durumda veri de silinir ve her gecis yeniden istek demek olurdu.
 *
 * Mutasyondan sonra **elle guncelleme yok, yeniden istek var** (`refreshAll`).
 * Bakiye netlestirmenin sonucu; yeni harcamanin bakiyeye etkisini istemcide
 * hesaplamak, backend'deki 1.6 algoritmasinin ikinci bir kopyasini yazmak
 * olurdu. Gerekce docs/decisions/2.4.md.
 */
const GroupDetailPage = () => {
  /*
    Adresteki grup anahtari: normalde slug (`ev-arkadaslari`), eski linklerde
    uuid. Ikisi de oldugu gibi backend'e gidiyor — cozumleme tek kapida
    yapiliyor (src/middlewares/group.middleware.ts), yani bu sayfanin once
    uuid'ye cevirmek icin fazladan bir istek atmasi gerekmiyor.
    Rota kaliba gore parametre hep var; tip tarafinda `string | undefined`.
  */
  const { groupKey = '' } = useParams<{ groupKey: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const currentUserId = user?.id ?? '';

  /*
    Grup listesi paylasilan durumda (`AppDataProvider`): sidebar'daki grup
    kisayollari da onu okuyor. Grup silinince/yeniden adlandirilinca tek bir
    `reload` ikisini de tazeler — ikinci bir istek ya da olay gerekmez.
  */
  const groups = useGroupsData();

  const fetchDetail = useCallback(() => groupsApi.getGroup(groupKey), [groupKey]);
  const detail = useAsync<GroupDetail>(fetchDetail, 'Grup bilgileri yuklenemedi');

  const fetchBalances = useCallback(() => groupsApi.getGroupBalances(groupKey), [groupKey]);
  const balances = useAsync<BalanceResult>(fetchBalances, 'Bakiye alinamadi');

  /*
    Yalnizca bekleyen kayitlar isteniyor: bu ekranda gecmis odeme dokumu degil,
    "aksiyon bekleyen ne var" sorusu var. Onaylanmis kayitlar zaten bakiyenin
    icinde gorunuyor.
  */
  const fetchSettlements = useCallback(
    () => settlementsApi.listSettlements(groupKey, { status: 'pending', limit: 50 }),
    [groupKey]
  );
  const settlements = useAsync<SettlementListResult>(
    fetchSettlements,
    'Bekleyen odemeler alinamadi'
  );

  /**
   * "Bu ay" ozet karti. `HomeSummary.monthlySpend` ile KARISTIRILMAMALI — o
   * kullanicinin **tum** gruplarinin toplami, bu tek bir grubun icinde
   * (bkz. docs/decisions/3.19-grup-detay-ust-blok.md).
   */
  const fetchMonthlySummary = useCallback(
    () => groupsApi.getGroupMonthlySummary(groupKey),
    [groupKey]
  );
  const monthlySummary = useAsync<GroupMonthlySummary>(
    fetchMonthlySummary,
    'Bu ayki ozet alinamadi'
  );

  const feed = useExpenseFeed(groupKey);

  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [settleTarget, setSettleTarget] = useState<SettleTarget | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const members = useMemo(() => detail.data?.members ?? [], [detail.data]);

  /**
   * Ad cozumleme: uye listesi + bakiye satirlarindaki adlar.
   *
   * Takma isim varsa o kazaniyor — kullanici birine ad verdiyse onu her yerde
   * o adla gormeli. Gercek ad kaybolmuyor, "Kisiler" sekmesinde yaninda duruyor.
   * Backend de bakiye satirlarinda ayni onceligi uyguluyor; burasi ayni kurali
   * uye listesinden gelen adlar icin tekrarliyor.
   */
  const nameOf = useMemo(() => {
    const names = new Map(
      members.map((member) => [member.user_id, member.nickname ?? member.name])
    );

    for (const balance of balances.data?.balances ?? []) {
      if (balance.name && !names.has(balance.user_id)) {
        // Gruptan cikarilmis ama gecmis harcamasi duran uye: uye listesinde yok,
        // bakiye listesinde var. Adsiz birakmak "undefined sana borclu" demekti.
        names.set(balance.user_id, balance.name);
      }
    }

    return (userId: string) => names.get(userId) ?? 'Eski uye';
  }, [members, balances.data]);

  /**
   * Harcama/odeme sonrasi tek tazeleme kapisi. Ucu birden yenileniyor cunku
   * bir harcama hem listeyi hem bakiyeyi, bir odeme hem bakiyeyi hem bekleyen
   * kayitlari degistirir; hangisinin degistigini cagiran tarafa sordurmak,
   * bir gun birinin unutulmasi demekti.
   *
   * Ref uzerinden: `reload` fonksiyonlari her render'da yeniden uretiliyor, ama
   * `refreshAll` kimligi sabit kalmali — modal'lara prop olarak gidiyor ve her
   * render'da degisen bir prop, modal'in iceriden yaptigi karsilastirmalari
   * bozardi. Ref hem sabit kimligi hem de **guncel** kapanislari veriyor.
   */
  const refresh = useRef<() => void>(() => {});
  refresh.current = () => {
    feed.reload();
    balances.reload();
    settlements.reload();
    // Yeni harcama "Bu ay" toplamini da degistiriyor; odeme kaydi degistirmiyor
    // (odeme bir harcama degil) ama tek kapidan gectigi icin ayrica dallanmiyoruz.
    monthlySummary.reload();
  };

  const refreshAll = useCallback(() => refresh.current(), []);

  /**
   * "Ode" akisi — IYIMSER GUNCELLEME, `refreshAll`in bilincli istisnasi.
   *
   * Yukaridaki genel kural (2.4) "elle guncelleme yok, yeniden istek var"
   * cunku bakiye netlestirmenin sonucu ve onu istemcide hesaplamak backend
   * algoritmasinin ikinci bir kopyasi olurdu. Burada o risk **yok**: bir
   * kayit `pending` acildiginda net bakiye degismiyor (1.7 — onaylanana kadar
   * hicbir seyi etkilemiyor), yani netlestirme kopyalanmiyor. Yapilan tek sey
   * iki **bilinen** satiri yerlestirmek:
   *
   *   - Transferler listesinden ayni (borclu, alacakli) ciftini kaldirmak.
   *     Rastgele bir tahmin degil: backend zaten bu cifte ikinci bir bekleyen
   *     kayda izin vermiyor (409 "zaten bekleyen bir kayit var"), yani "Ode"
   *     butonu bu satirda tekrar calismayacakti — satiri kaldirmak yalnizca
   *     bunu **gorunur** kiliyor.
   *   - Bekleyen odemeler listesine sunucunun donduru GERCEK satiri (id, tutar,
   *     created_at) eklemek. Yalnizca ekrandaki isimler (`from_name`/`to_name`)
   *     yerelde tamamlaniyor — `POST /settlements` onlari tasimiyor, ama ikisi
   *     de zaten elimizde (kendi adimiz + `SettleTarget.name`).
   *
   * Bilerek arkadan bir `reload()` da tetiklenmiyor: `useAsync.reload` `loading`u
   * true yapar ve `BalancesTab` o an skeleton'a doner — tam da "aninda kalksin"
   * isteginin tersini yapardi. Sunucuyla olasi sapma (ör. ayni anda baska bir
   * uyenin islem yapmasi) sayfa bir sonraki dogal yenilemede kendiliginden
   * kapanir; ayni kabul `AppDataProvider`in oturum-basi-tek-istek modelinde de var.
   * Gerekce: docs/decisions/optimistic-ui-duzeltme.md.
   */
  const handleSettlementCreated = (settlement: Settlement) => {
    const creditorName = settleTarget?.name ?? nameOf(settlement.to_user);

    balances.mutate((current) =>
      current
        ? {
            ...current,
            transfers: current.transfers.filter(
              (transfer) =>
                !(
                  transfer.from_user === settlement.from_user &&
                  transfer.to_user === settlement.to_user
                )
            ),
          }
        : current
    );

    settlements.mutate((current) => {
      const row: SettlementView = {
        ...settlement,
        from_name: user?.name ?? 'Sen',
        to_name: creditorName,
      };

      if (!current) {
        return {
          settlements: [row],
          pagination: {
            page: 1,
            limit: 50,
            total: 1,
            total_pages: 1,
            has_next: false,
            has_previous: false,
          },
        };
      }

      return {
        settlements: [row, ...current.settlements],
        pagination: { ...current.pagination, total: current.pagination.total + 1 },
      };
    });
  };

  if (detail.loading) {
    return <GroupDetailSkeleton />;
  }

  if (detail.error || !detail.data) {
    return (
      <section className="flex flex-col gap-3">
        <BackLink />
        <div className="state-box state-box--error card-solid p-8 text-center" role="alert">
          <p className="text-sm text-destructive">{detail.error ?? 'Grup bulunamadi'}</p>
          <Button variant="outline" className="mt-3" onClick={detail.reload}>
            Tekrar dene
          </Button>
        </div>
      </section>
    );
  }

  const { group, role } = detail.data;
  const myBalance = balances.data ? viewForUser(balances.data.balances, currentUserId) : null;
  const netStatus = balances.data && myBalance
    ? buildGroupNetStatus(myBalance, currentUserId, balances.data.transfers, nameOf)
    : null;
  const pendingSettlements = (settlements.data?.settlements ?? []).filter(
    (settlement) => settlement.status === 'pending'
  );

  return (
    <section className="group-detail flex flex-col gap-4">
      <BackLink />

      <GlassCard as="header" className="group-detail__head flex flex-wrap gap-4 p-5">
        <div className="min-w-0 flex-1">
          <h1 className="truncate">{group.name}</h1>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-muted">
            <Users className="size-3.5 shrink-0" aria-hidden />
            {members.length} uye
            {group.description ? ` · ${group.description}` : ''}
          </p>
        </div>

        <div className="flex items-start gap-2">
          {/* Ayarlar yalnizca owner'a gorunur — uye acsa backend zaten 403
              dondurur, butonu gizlemek calismayacak bir aksiyonu gostermemek. */}
          {role === 'owner' && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setSettingsOpen(true)}
              aria-label="Grup ayarlari"
            >
              <Settings className="size-4" aria-hidden />
            </Button>
          )}
          <Button onClick={() => setExpenseModalOpen(true)}>
            <Plus className="size-4" aria-hidden />
            Harcama Ekle
          </Button>
        </div>
      </GlassCard>

      {/*
        Net durum + bekleyen onay + "Bu ay" ozeti: uc sekmede de ORTAK, `Tabs`in
        DISINDA duruyor — sekme degisince kaybolmuyor, yalnizca altindaki icerik
        degisiyor (bkz. docs/decisions/3.19-grup-detay-ust-blok.md).
      */}
      <div className="group-detail__overview flex flex-wrap items-stretch gap-4">
        {netStatus && (
          <HomeNetStatusCard
            status={netStatus}
            label="Bu gruptaki net durumun"
            className="min-w-64 flex-[2]"
          />
        )}

        {(pendingSettlements.length > 0 || monthlySummary.data) && (
          <div className="flex min-w-64 flex-[3] flex-wrap gap-4">
            {pendingSettlements.length > 0 && (
              <PendingSettlementsCard
                settlements={pendingSettlements}
                currentUserId={currentUserId}
                onResolved={refreshAll}
                className="min-w-64 flex-1"
              />
            )}

            <MonthlySummaryCard summary={monthlySummary} className="min-w-56 flex-1" />
          </div>
        )}
      </div>

      <Tabs defaultValue="expenses" className="group-detail__tabs">
        <TabsList>
          <TabsTrigger value="expenses">Harcamalar</TabsTrigger>
          <TabsTrigger value="balances">
            Odemeler
            {/* Aksiyon bekleyen kayit varsa sekmeye sayi dusuyor: kullanici
                sekmeyi acmadan da onay bekledigini gorsun. */}
            {pendingForMe(settlements.data, currentUserId) > 0 && (
              <span className="tabs__badge ml-1.5 rounded-full bg-cream px-1.5 text-xs text-rose">
                {pendingForMe(settlements.data, currentUserId)}
              </span>
            )}
          </TabsTrigger>
          {/* Kisiler ucuncu sirada: harcama ve bakiye gunluk isler, uye
              listesi ara sira bakilan bir yer. Sekme sirasi kullanim
              sikligini yansitiyor. */}
          <TabsTrigger value="members">Kisiler</TabsTrigger>
        </TabsList>

        <TabsContent value="expenses">
          <ExpensesTab
            feed={feed}
            currentUserId={currentUserId}
            onAddExpense={() => setExpenseModalOpen(true)}
          />
        </TabsContent>

        <TabsContent value="balances">
          <BalancesTab
            balances={balances}
            currentUserId={currentUserId}
            nameOf={nameOf}
            onSettle={setSettleTarget}
          />
        </TabsContent>

        <TabsContent value="members">
          <MembersTab
            groupId={groupKey}
            groupName={group.name}
            members={members}
            currentUserId={currentUserId}
            viewerRole={role}
            balances={balances.data?.balances ?? []}
            /*
              Takma isim degisince **grup detayi** tazeleniyor (`refreshAll`
              degil): uye listesi orada. Bakiye de tazeleniyor cunku backend
              bakiye satirlarindaki adlara da takma ismi uyguluyor — ikisi
              ayri istek, ikisi de eskiyor.
            */
            onNicknameChanged={() => {
              detail.reload();
              balances.reload();
            }}
            /*
              Uye cikarilinca hem uye listesi (grup detayi) hem bakiye
              degisiyor: cikan kisinin gecmis harcamalari duruyor ama artik
              net hesaba yeni bir sekilde katkida bulunmuyor olabilir.
            */
            onMemberRemoved={() => {
              detail.reload();
              balances.reload();
            }}
          />
        </TabsContent>
      </Tabs>

      <AddExpenseModal
        open={expenseModalOpen}
        onOpenChange={setExpenseModalOpen}
        groupId={groupKey}
        members={members}
        currentUserId={currentUserId}
        onCreated={refreshAll}
      />

      <SettleUpModal
        open={settleTarget !== null}
        onOpenChange={(next) => {
          if (!next) {
            setSettleTarget(null);
          }
        }}
        groupId={groupKey}
        target={settleTarget}
        onCreated={handleSettlementCreated}
      />

      {role === 'owner' && (
        <GroupSettingsModal
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          group={group}
          onUpdated={(updated) => {
            groups.reload();

            /*
              Ad degistiyse slug de degisti: sayfanin durdugu adres artik
              hicbir gruba cozulmuyor ve `detail.reload()` 403 alirdi. Adresi
              duzeltmek tazelemenin yerine geciyor — `fetchDetail` anahtara
              bagli oldugu icin istek yeni adresle kendiliginden tekrarlaniyor.
            */
            if (updated.slug === groupKey) {
              detail.reload();
              return;
            }

            navigate(groupPath(updated), { replace: true });
          }}
          onDeleted={() => {
            groups.reload();
            navigate('/groups');
          }}
        />
      )}
    </section>
  );
};

/** Kullanicinin **onaylamasi gereken** kayit sayisi (alacakli oldugu bekleyenler). */
const pendingForMe = (data: SettlementListResult | null, userId: string): number =>
  (data?.settlements ?? []).filter(
    (settlement) => settlement.status === 'pending' && settlement.to_user === userId
  ).length;

/**
 * Ust bloktaki net durum karosunun altinda cikan oneri cumlesi
 * ("Serenad'a 135,00 ₺ odeyerek bu grubu kapatabilirsin.").
 *
 * `balances.data.transfers` netlestirmenin urettigi **minimal** transfer
 * kumesi (1.6); "borcun var" durumunda genelde tek bir hedefe tek bir transfer
 * dusuyor. Uc veya daha fazla uyeli karisik bir grupta ayni kisinin birden
 * fazla transferi olabilir — o durumda isim vermeden genel bir cumleye
 * duşuyoruz, cunku "kime once" sorusunun tek bir dogru cevabi yok.
 */
const groupSuggestionSentence = (
  tone: BalanceTone,
  currentUserId: string,
  transfers: readonly Transfer[],
  nameOf: (userId: string) => string
): string => {
  if (tone === 'debt') {
    const mine = transfers.filter((transfer) => transfer.from_user === currentUserId);

    if (mine.length === 1) {
      const amount = formatCentsAbsolute(parseAmountToCents(mine[0].amount) ?? 0);
      return `${dative(nameOf(mine[0].to_user))} ${amount} odeyerek bu grubu kapatabilirsin.`;
    }

    return 'Borcunu odeyerek bu grubu kapatabilirsin.';
  }

  if (tone === 'credit') {
    const mine = transfers.filter((transfer) => transfer.to_user === currentUserId);

    if (mine.length === 1) {
      const amount = formatCentsAbsolute(parseAmountToCents(mine[0].amount) ?? 0);
      return `${nameOf(mine[0].from_user)} sana ${amount} odeyince bu grup kapanir.`;
    }

    return 'Sana borclu olanlar odeyince bu grup kapanir.';
  }

  return 'Bu grupta acik bir hesap yok.';
};

/**
 * `HomeNetStatusCard`in bekledigi sekle donusum. Home'daki `buildNetStatus`
 * ile ayni gorsel dili paylasiyor (`PILL_LABEL`, isaretli tutar) ama farkli
 * girdiden besleniyor: `HomeSummary` degil, tek bir grubun bakiye satiri +
 * transfer listesi.
 */
const buildGroupNetStatus = (
  balance: { tone: BalanceTone; cents: number },
  currentUserId: string,
  transfers: readonly Transfer[],
  nameOf: (userId: string) => string
): HomeNetStatus => ({
  tone: balance.tone,
  value: formatCents(balance.cents),
  pillLabel: PILL_LABEL[balance.tone],
  sentence: groupSuggestionSentence(balance.tone, currentUserId, transfers, nameOf),
});

/**
 * "Onayin bekleniyor" karti — eskiden `BalancesTab` icindeydi (yalnizca
 * Odemeler sekmesinde gorunuyordu), simdi ust ortak blokta: onay bekleyen bir
 * kayit varken hangi sekmede olursan ol gorunmeli, yalnizca Odemeler'e
 * girildiginde degil (bkz. docs/decisions/3.19-grup-detay-ust-blok.md).
 *
 * Icerik ve davranis TASINMADAN ONCEKIYLE AYNI — yalnizca konum ve zemin
 * degisti (amber vurgusu, `GroupCard`teki bekleyen rozetiyle ayni renk
 * dili: `border-amber/25 bg-amber-surface text-amber`).
 */
const PendingSettlementsCard = ({
  settlements,
  currentUserId,
  onResolved,
  className,
}: {
  settlements: SettlementView[];
  currentUserId: string;
  onResolved: () => void;
  className?: string;
}) => (
  <section
    className={`balances__pending rounded-xl border border-amber/25 bg-amber-surface p-5 ${className ?? ''}`}
  >
    <p className="text-xs font-medium tracking-[0.12em] text-amber uppercase">Onayin bekleniyor</p>

    <ul className="mt-3 flex flex-col gap-2">
      {settlements.map((settlement) => (
        <PendingSettlementRow
          key={settlement.id}
          settlement={settlement}
          currentUserId={currentUserId}
          onResolved={onResolved}
        />
      ))}
    </ul>
  </section>
);

const PendingSettlementRow = ({
  settlement,
  currentUserId,
  onResolved,
}: {
  settlement: SettlementView;
  currentUserId: string;
  onResolved: () => void;
}) => {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sidebar/Aktivite rozeti icin: bkz. asagidaki `resolve` yorumu.
  const summary = useSummaryData();

  const cents = parseAmountToCents(settlement.amount) ?? 0;
  const iAmCreditor = settlement.to_user === currentUserId;
  const iAmDebtor = settlement.from_user === currentUserId;

  const resolve = (action: 'confirm' | 'reject') => {
    if (pending) {
      return;
    }

    setPending(true);
    setError(null);

    const request =
      action === 'confirm'
        ? settlementsApi.confirmSettlement(settlement.id)
        : settlementsApi.rejectSettlement(settlement.id);

    void request
      .then(() => {
        // Bakiye ve liste yeniden isteniyor: onaydan sonra net bakiye degisir ve
        // elde guncellemek, "sunucuda ne oldu" ile "ekranda ne yaziyor" ayrisma
        // riskini acardi.
        onResolved();

        /*
          Sidebar/Aktivite rozeti AYRI bir kural izliyor: sayfa acilinca ya da
          `onResolved` tetiklenince DEGIL, yalnizca kullanici Onayla/Reddet'e
          BASTIGINDA ve yerel olarak azaliyor — sunucuya gidip tekrar sormuyor.
          `Math.max(0, ...)`: birden fazla sekmede ayni kayit kapatilmaya
          calisilirsa sayac eksiye dusmesin. Gerekce:
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
        setPending(false);
      });
  };

  return (
    <li className="pending-row rounded-lg border border-amber/20 bg-cream/40 px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="pending-row__sentence text-sm">
          {iAmCreditor
            ? `${settlement.from_name} sana ${formatCents(cents)} odedigini bildirdi`
            : iAmDebtor
              ? `${dative(settlement.to_name)} ${formatCents(cents)} odedigini bildirdin`
              : `${settlement.from_name} ${dative(settlement.to_name)} ${formatCents(cents)} odedigini bildirdi`}
          <span className="ml-1 text-xs text-ink-muted">
            · {formatExpenseDate(settlement.created_at)}
          </span>
        </p>

        {/* Onay/red yalnizca alacakliya ait (backend: ONLY_CREDITOR). */}
        {iAmCreditor ? (
          <span className="flex shrink-0 gap-2">
            <Button type="button" size="sm" disabled={pending} onClick={() => resolve('confirm')}>
              <Check className="size-4" aria-hidden />
              Onayla
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => resolve('reject')}
            >
              <X className="size-4" aria-hidden />
              Reddet
            </Button>
          </span>
        ) : (
          <span className="shrink-0 text-xs text-ink-muted" role="status">
            Onay bekleniyor
          </span>
        )}
      </div>

      {error && (
        <p className="field-error mt-1.5 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </li>
  );
};

/**
 * "Bu ay" ozet karti: toplam harcama, senin payin, senin odedigin.
 * `HomeStatTile`/`HomeNetStatusCard`den bilerek ayri bir bicim — burasi
 * yonlu bir durum degil, uc satirlik duz bir dokum.
 */
const MonthlySummaryCard = ({
  summary,
  className,
}: {
  summary: { data: GroupMonthlySummary | null; loading: boolean; error: string | null };
  className?: string;
}) => {
  if (summary.loading && !summary.data) {
    return (
      <div className={`card-solid flex flex-col gap-2 p-5 ${className ?? ''}`} aria-busy="true">
        <Skeleton className="skeleton-line h-3 w-16" />
        <Skeleton className="skeleton-line h-4 w-full" />
        <Skeleton className="skeleton-line h-4 w-full" />
        <Skeleton className="skeleton-line h-4 w-full" />
      </div>
    );
  }

  if (!summary.data) {
    return null;
  }

  const rows: { label: string; cents: number }[] = [
    { label: 'Toplam harcama', cents: parseAmountToCents(summary.data.totalSpend) ?? 0 },
    { label: 'Senin payin', cents: parseAmountToCents(summary.data.myShare) ?? 0 },
    { label: 'Senin odedigin', cents: parseAmountToCents(summary.data.myPaid) ?? 0 },
  ];

  return (
    <div className={`card-solid flex flex-col gap-2 p-5 ${className ?? ''}`}>
      <p className="text-xs font-medium tracking-[0.12em] text-ink-muted uppercase">Bu ay</p>

      {rows.map((row) => (
        <p key={row.label} className="flex items-center justify-between gap-3 text-sm">
          <span className="text-ink-muted">{row.label}</span>
          <span className="font-semibold text-ink">{formatCents(row.cents)}</span>
        </p>
      ))}
    </div>
  );
};

const BackLink = () => (
  <Link
    to="/groups"
    className="group-detail__back inline-flex w-fit items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-rose"
  >
    <ArrowLeft className="size-4" aria-hidden />
    Gruplar
  </Link>
);

const GroupDetailSkeleton = () => (
  <section className="flex flex-col gap-4" aria-busy="true" aria-label="Grup yukleniyor">
    <div className="card-glass flex flex-col gap-2 p-5">
      <Skeleton className="skeleton-line skeleton-line--title h-6 w-1/3" />
      <Skeleton className="skeleton-line skeleton-line--short h-3 w-1/5" />
    </div>
    <Skeleton className="skeleton-line h-9 w-56 rounded-lg" />
    <div className="card-solid flex flex-col gap-2 p-4">
      <Skeleton className="skeleton-line h-4 w-2/5" />
      <Skeleton className="skeleton-line h-4 w-1/4" />
    </div>
  </section>
);

export default GroupDetailPage;
