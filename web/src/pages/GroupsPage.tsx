import { Plus } from 'lucide-react';
import { motion } from 'motion/react';
import { useCallback, useState } from 'react';

import GroupCard from '@/components/GroupCard';
import GroupsEmptyState from '@/components/GroupsEmptyState';
import NewGroupModal from '@/components/NewGroupModal';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import groupsApi from '../api/groups';
import useAsync from '../hooks/useAsync';
import useAuth from '../hooks/useAuth';

import type { GroupSummary } from '../types/models';

/**
 * Gruplarim ekrani.
 *
 * Dort durum ayri ayri ele aliniyor — yukleniyor / hata / bos / dolu. Ozellikle
 * **bos** ile **hata** ayrimi onemli: ikisini de "grup yok" diye gostermek,
 * sunucuya ulasilamadigi durumda kullaniciya "gruplarin silinmis" izlenimi
 * verirdi.
 *
 * Gorsel kimlik uygulanirken yalnizca sunum katmani degisti; veri akisi
 * (`useAsync`), yenileme stratejisi ve hata metinleri 2.3'teki gibi
 * (bkz. docs/decisions/gorsel-kimlik.md).
 */
const GroupsPage = () => {
  const { user } = useAuth();

  const fetchGroups = useCallback(() => groupsApi.listGroups(), []);
  const groups = useAsync<GroupSummary[]>(fetchGroups, 'Gruplar yuklenemedi');

  const [modalOpen, setModalOpen] = useState(false);

  return (
    <section className="groups-page">
      <header className="groups-page__head flex flex-wrap items-center justify-between gap-3">
        <div>
          {/* Baslik ink + Fraunces; rose burada degil. */}
          <h1>Gruplar</h1>
          <p className="mt-0.5 text-sm text-ink-muted">
            Uyesi oldugun gruplar ve her birindeki net durumun.
          </p>
        </div>

        <Button onClick={() => setModalOpen(true)}>
          <Plus className="size-4" aria-hidden />
          Yeni Grup
        </Button>
      </header>

      {groups.loading && <GroupListSkeleton />}

      {!groups.loading && groups.error && (
        <div
          className="state-box state-box--error card-solid mt-6 border-destructive/30 p-8 text-center"
          role="alert"
        >
          <p className="text-sm text-destructive">{groups.error}</p>
          <Button variant="outline" className="mt-3" onClick={groups.reload}>
            Tekrar dene
          </Button>
        </div>
      )}

      {/*
        Bos durum artik tek satirlik bir mesaj degil, kendi ekrani
        (bkz. GroupsEmptyState). Kosul aynen duruyor: **yalnizca** istek
        basariyla dondu ve dizi bos ise. Hata ile bos ayni sey degil.
      */}
      {!groups.loading && !groups.error && groups.data?.length === 0 && (
        <GroupsEmptyState onCreate={() => setModalOpen(true)} />
      )}

      {!groups.loading && !groups.error && groups.data && groups.data.length > 0 && (
        <div className="group-grid mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.data.map((group, index) => (
            <motion.div
              key={group.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              /*
                Kademeli giris (stagger). Ust sinir 6 kart: uzun listelerde
                gecikme birikip son kartlar gec gorunmesin.
              */
              transition={{ duration: 0.2, delay: Math.min(index, 6) * 0.04, ease: 'easeOut' }}
            >
              <GroupCard group={group} currentUserId={user?.id ?? ''} />
            </motion.div>
          ))}
        </div>
      )}

      <NewGroupModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        /*
          Yeni grubu listeye elle eklemek yerine listeyi tazeliyoruz:
          `GET /groups` satiri `role`, `joined_at` ve `member_count` gibi
          alanlari da tasiyor; `POST /groups` cevabi yalnizca grup satirini
          donuyor. Elle eklemek eksik bir kart uretirdi.
        */
        onCreated={groups.reload}
      />
    </section>
  );
};

/** Iskelet kartlar: veri gelince sayfanin ziplamasini (layout shift) onler. */
const GroupListSkeleton = () => (
  <div
    className="group-grid mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
    aria-busy="true"
    aria-label="Gruplar yukleniyor"
  >
    {[0, 1, 2].map((index) => (
      <div className="group-card card-glass flex flex-col gap-3 p-5" key={index}>
        <Skeleton className="skeleton-line skeleton-line--title h-5 w-3/5" />
        <Skeleton className="skeleton-line skeleton-line--short h-3 w-2/5" />
        <Skeleton className="skeleton-line h-14 w-full rounded-lg" />
      </div>
    ))}
  </div>
);

export default GroupsPage;
