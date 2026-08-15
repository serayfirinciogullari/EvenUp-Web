import { useCallback, useState } from 'react';

import groupsApi from '../api/groups';
import GroupCard from '../components/GroupCard';
import NewGroupModal from '../components/NewGroupModal';
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
 */
const GroupsPage = () => {
  const { user } = useAuth();

  const fetchGroups = useCallback(() => groupsApi.listGroups(), []);
  const groups = useAsync<GroupSummary[]>(fetchGroups, 'Gruplar yuklenemedi');

  const [modalOpen, setModalOpen] = useState(false);

  return (
    <section className="groups-page">
      <header className="groups-page__head">
        <h1>Gruplar</h1>
        <button type="button" onClick={() => setModalOpen(true)}>
          Yeni Grup
        </button>
      </header>

      {groups.loading && <GroupListSkeleton />}

      {!groups.loading && groups.error && (
        <div className="state-box state-box--error" role="alert">
          <p>{groups.error}</p>
          <button type="button" onClick={groups.reload}>
            Tekrar dene
          </button>
        </div>
      )}

      {!groups.loading && !groups.error && groups.data?.length === 0 && (
        <div className="state-box">
          <p>Henuz bir grubun yok.</p>
          <p className="placeholder">
            Bir ev, tatil ya da proje icin grup olustur; harcamalari paylasmaya baslayin.
          </p>
          <button type="button" onClick={() => setModalOpen(true)}>
            Ilk grubunu olustur
          </button>
        </div>
      )}

      {!groups.loading && !groups.error && groups.data && groups.data.length > 0 && (
        <div className="group-grid">
          {groups.data.map((group) => (
            <GroupCard key={group.id} group={group} currentUserId={user?.id ?? ''} />
          ))}
        </div>
      )}

      {modalOpen && (
        <NewGroupModal
          onClose={() => setModalOpen(false)}
          // Yeni grubu listeye elle eklemek yerine listeyi tazeliyoruz:
          // `GET /groups` satiri `role`, `joined_at` ve `member_count` gibi
          // alanlari da tasiyor; `POST /groups` cevabi yalnizca grup satirini
          // donuyor. Elle eklemek eksik bir kart uretirdi.
          onCreated={groups.reload}
        />
      )}
    </section>
  );
};

/** Iskelet kartlar: sayfa yuklenirken yukseklik atlamasini (layout shift) onler. */
const GroupListSkeleton = () => (
  <div className="group-grid" aria-busy="true" aria-label="Gruplar yukleniyor">
    {[0, 1, 2].map((index) => (
      <article className="group-card group-card--skeleton" key={index}>
        <span className="skeleton-line skeleton-line--title" />
        <span className="skeleton-line skeleton-line--short" />
        <span className="skeleton-line" />
      </article>
    ))}
  </div>
);

export default GroupsPage;
