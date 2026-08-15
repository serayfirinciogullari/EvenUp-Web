/**
 * Admin paneli — hala iskelet.
 *
 * Bu sayfaya erisim `AdminRoute` ile kisitlanir ama o yalnizca UX'tir:
 * asil koruma backend'deki `requireAdmin` (bkz. docs/decisions/2.1.md).
 */
const AdminPage = () => (
  <section className="flex flex-col gap-4">
    <h1>Admin</h1>
    <div className="card-solid p-5">
      <p className="placeholder text-sm text-ink-muted">
        Kullanici listesi, devre disi birakma ve istatistikler sonraki adimda baglanacak
        (GET /admin/users, /admin/groups, /admin/stats).
      </p>
    </div>
  </section>
);

export default AdminPage;
