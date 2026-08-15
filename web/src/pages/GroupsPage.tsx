import useAuth from '../hooks/useAuth';

/**
 * Grup listesi — hala iskelet. 2.1 rota/oturum altyapisini, 2.2 giris ve kayit
 * ekranlarini kurdu; veri cekme (`GET /groups`) sonraki goreve ait.
 */
const GroupsPage = () => {
  const { user } = useAuth();

  return (
    <section>
      <h1>Gruplar</h1>
      <p>Hos geldin, {user?.name}.</p>
      <p className="placeholder">Grup listesi sonraki gorevde baglanacak (GET /groups).</p>
    </section>
  );
};

export default GroupsPage;
