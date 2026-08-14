import useAuth from '../hooks/useAuth';

/** Ayarlar — 2.1'de iskelet. Profil bilgisi mevcut oturumdan okunuyor. */
const SettingsPage = () => {
  const { user } = useAuth();

  return (
    <section>
      <h1>Ayarlar</h1>
      <dl>
        <dt>Ad</dt>
        <dd>{user?.name}</dd>
        <dt>E-posta</dt>
        <dd>{user?.email}</dd>
        <dt>Rol</dt>
        <dd>{user?.role}</dd>
      </dl>
      <p className="placeholder">Profil duzenleme sonraki adimda.</p>
    </section>
  );
};

export default SettingsPage;
