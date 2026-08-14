/**
 * Guard'lar karar veremezken (oturum dogrulanirken) gosterilen ara ekran.
 * Ayri bir bilesen: uc guard'in ayni bekleme davranisini paylasmasi ve
 * ileride iskelet ekrana (skeleton) donmesi kolay olsun.
 */
const RouteFallback = ({ label }: { label: string }) => (
  <div className="route-fallback" role="status" aria-live="polite">
    {label}
  </div>
);

export default RouteFallback;
