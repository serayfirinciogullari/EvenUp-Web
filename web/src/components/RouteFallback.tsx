import { Loader2 } from 'lucide-react';

/**
 * Guard'lar karar veremezken (oturum dogrulanirken) gosterilen ara ekran.
 * Ayri bir bilesen: uc guard'in ayni bekleme davranisini paylasmasi icin.
 *
 * `role="status"` + `aria-live="polite"` korunuyor; donen ikon `aria-hidden`
 * cunku bilgiyi metin tasiyor.
 */
const RouteFallback = ({ label }: { label: string }) => (
  <div
    className="route-fallback flex min-h-screen flex-col items-center justify-center gap-3 bg-cream text-ink-muted"
    role="status"
    aria-live="polite"
  >
    <Loader2 className="size-5 animate-spin text-rose" aria-hidden />
    <span className="text-sm">{label}</span>
  </div>
);

export default RouteFallback;
