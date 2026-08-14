import useAuth from '../hooks/useAuth';

/**
 * Grup listesi — 2.1'de iskelet. Veri cekme (`GET /groups`) 2.2'de eklenecek;
 * bu asamanin amaci rota ve oturum altyapisinin ayakta oldugunu gostermek.
 */
const GroupsPage = () => {
  const { user } = useAuth();

  return (
    <section>
      <h1>Gruplar</h1>
      <p>Hos geldin, {user?.name}.</p>
      <p className="placeholder">Grup listesi 2.2'de baglanacak (GET /groups).</p>
    </section>
  );
};

export default GroupsPage;
