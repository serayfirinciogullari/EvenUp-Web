import { Badge } from '@/components/ui/badge';
import useAuth from '../hooks/useAuth';

/** Ayarlar — hala iskelet. Profil bilgisi mevcut oturumdan okunuyor. */
const SettingsPage = () => {
  const { user } = useAuth();

  return (
    <section className="flex flex-col gap-4">
      <h1>Ayarlar</h1>

      {/* Solid: okunan/duzenlenen veri yuzeyi, ozet degil. */}
      <dl className="card-solid divide-y divide-ink/8 p-0 text-sm">
        <div className="flex items-center justify-between gap-4 px-5 py-3.5">
          <dt className="text-ink-muted">Ad</dt>
          <dd className="font-medium text-ink">{user?.name}</dd>
        </div>
        <div className="flex items-center justify-between gap-4 px-5 py-3.5">
          <dt className="text-ink-muted">E-posta</dt>
          <dd className="truncate font-medium text-ink">{user?.email}</dd>
        </div>
        <div className="flex items-center justify-between gap-4 px-5 py-3.5">
          <dt className="text-ink-muted">Rol</dt>
          <dd>
            <Badge variant="outline" className="border-rose/30 bg-rose/8 text-rose">
              {user?.role}
            </Badge>
          </dd>
        </div>
      </dl>

      <p className="placeholder text-sm text-ink-muted">Profil duzenleme sonraki adimda.</p>
    </section>
  );
};

export default SettingsPage;
