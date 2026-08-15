import { useParams } from 'react-router-dom';

/**
 * Grup detayi — hala iskelet. Rota parametresinin dogru okundugunu gostermek
 * icin ID ekrana yaziliyor. Uyeler, harcamalar ve "Bakiyeler" sekmesi sonraki
 * goreve ait; o sekme **glass** yuzey olacak (ozet/durum), harcama satirlari
 * **solid** (bkz. index.css yuzey ayrimi).
 */
const GroupDetailPage = () => {
  const { id } = useParams<{ id: string }>();

  return (
    <section className="flex flex-col gap-3">
      <h1>Grup detayi</h1>
      <div className="card-solid p-5">
        <p className="text-sm text-ink-muted">
          Grup ID: <code className="text-ink">{id}</code>
        </p>
        <p className="placeholder mt-2 text-sm text-ink-muted">
          Uyeler, harcamalar ve bakiye sonraki gorevde baglanacak (GET /groups/:id).
        </p>
      </div>
    </section>
  );
};

export default GroupDetailPage;
