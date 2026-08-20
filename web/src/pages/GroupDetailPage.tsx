import { ArrowLeft, Plus, Settings, Users } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import AddExpenseModal from '@/components/AddExpenseModal';
import BalancesTab from '@/components/BalancesTab';
import ExpensesTab from '@/components/ExpensesTab';
import GlassCard from '@/components/GlassCard';
import GroupSettingsModal from '@/components/GroupSettingsModal';
import MembersTab from '@/components/MembersTab';
import SettleUpModal from '@/components/SettleUpModal';
import { Button } from '@/components/ui/button';
import { NumberTicker } from '@/components/ui/number-ticker';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import groupsApi from '../api/groups';
import settlementsApi from '../api/settlements';
import { useGroupsData } from '../hooks/useAppData';
import useAsync from '../hooks/useAsync';
import useAuth from '../hooks/useAuth';
import useExpenseFeed from '../hooks/useExpenseFeed';
import { viewForUser } from '../utils/balance';
import { groupPath } from '../utils/groupPath';
import { formatCentsAbsolute } from '../utils/money';

import type { SettleTarget } from '@/components/SettleUpModal';
import type {
  BalanceResult,
  GroupDetail,
  Settlement,
  SettlementListResult,
  SettlementView,
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

        {/* Kendi net durumu baslikta: kullanicinin ilk sordugu soru bu. */}
        {myBalance && (
          <p
            className={`group-detail__balance balance--${myBalance.tone} flex flex-col gap-0.5 rounded-lg border-l-4 px-3 py-2`}
          >
            <NumberTicker
              value={myBalance.cents}
              format={formatCentsAbsolute}
              className="group-card__amount text-xl font-semibold"
            />
            <span className="text-xs text-ink-muted">{myBalance.label}</span>
          </p>
        )}

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
            settlements={settlements}
            currentUserId={currentUserId}
            nameOf={nameOf}
            onSettle={setSettleTarget}
            onResolved={refreshAll}
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
