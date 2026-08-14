import { useParams } from 'react-router-dom';

/**
 * Grup detayi — 2.1'de iskelet.
 * Rota parametresinin dogru okundugunu gostermek icin ID ekrana yaziliyor.
 */
const GroupDetailPage = () => {
  const { id } = useParams<{ id: string }>();

  return (
    <section>
      <h1>Grup detayi</h1>
      <p>
        Grup ID: <code>{id}</code>
      </p>
      <p className="placeholder">
        Uyeler, harcamalar ve bakiye 2.3'te baglanacak (GET /groups/:id).
      </p>
    </section>
  );
};

export default GroupDetailPage;
