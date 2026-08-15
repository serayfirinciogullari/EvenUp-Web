import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';

/**
 * 404. Layout disinda bir rota oldugu icin cream zemini kendisi kuruyor.
 */
const NotFoundPage = () => (
  <section className="flex min-h-screen flex-col items-center justify-center gap-4 bg-cream px-4 text-center">
    <p className="font-display text-5xl font-semibold text-blush">404</p>
    <h1>Sayfa bulunamadi</h1>
    <p className="max-w-sm text-sm text-ink-muted">
      Aradigin adres tasinmis ya da hic var olmamis olabilir.
    </p>
    <Button asChild className="mt-2">
      <Link to="/groups">Gruplara don</Link>
    </Button>
  </section>
);

export default NotFoundPage;
