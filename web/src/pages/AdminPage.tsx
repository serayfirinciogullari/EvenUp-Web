/**
 * Admin paneli — 2.1'de iskelet.
 *
 * Bu sayfaya erisim `AdminRoute` ile kisitlanir ama o yalnizca UX'tir:
 * asil koruma backend'deki `requireAdmin` (bkz. docs/decisions/2.1.md).
 */
const AdminPage = () => (
  <section>
    <h1>Admin</h1>
    <p className="placeholder">
      Kullanici listesi, devre disi birakma ve istatistikler sonraki adimda
      baglanacak (GET /admin/users, /admin/groups, /admin/stats).
    </p>
  </section>
);

export default AdminPage;
