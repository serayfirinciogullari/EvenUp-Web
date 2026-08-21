import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import ConfirmDialog from '@/components/ConfirmDialog';
import { SettingsCard } from '@/components/SettingsFormParts';
import { Button } from '@/components/ui/button';
import { getErrorMessage } from '../api/client';
import usersApi from '../api/users';
import { useAuth } from '../hooks/useAuth';

/**
 * Ayarlar > Hesap (2.6 -> 3.17, docs/decisions/3.17-hesap-silme.md).
 *
 * Iki kart: "Oturumu kapat" (bu cihazi cikarir, veri kalir) ve "Hesabi sil"
 * (tehlike stili — kirmizi vurgu, onay modali arkasinda).
 *
 * "OTURUMU KAPAT" NEDEN MEVCUT LOGOUT MANTIGINI TEKRAR YAZMIYOR
 * -----------------------------------------------------------------
 * `Sidebar.tsx`teki `UserMenu.handleLogout` ile birebir ayni iki satir
 * (`logout()` + `navigate('/login', {replace:true})`); burada da aynen
 * cagriliyor, farkli bir "cikis" kavrami yok.
 */
const AccountTab = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const confirmDelete = async () => {
    setDeletePending(true);
    setDeleteError(null);

    try {
      await usersApi.requestDeletion();
      // Backend `is_active`i aninda kapatir; "aninda logout" burada, istemci
      // tarafinda uygulaniyor — sunucunun elinde token'i gecersiz kilacak bir
      // mekanizma yok (bkz. docs/decisions/3.17-hesap-silme.md).
      logout();
      toast.success('Hesabinizin silinmesi talep edildi. 30 gun icinde geri alabilirsiniz.');
      navigate('/login', { replace: true });
    } catch (caught) {
      setDeleteError(getErrorMessage(caught, 'Silme talebi gonderilemedi'));
      setDeletePending(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <SettingsCard
        id="settings-account-logout"
        title="Oturumu kapat"
        description="Bu cihazdaki oturum kapanir, verilerin silinmez."
      >
        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={handleLogout}>
            Oturumu kapat
          </Button>
        </div>
      </SettingsCard>

      <section
        aria-labelledby="settings-account-delete"
        className="card-solid border border-destructive/30 p-5 sm:p-6"
      >
        <h2 id="settings-account-delete" className="text-destructive">
          Hesabi sil
        </h2>
        <p className="mt-1 mb-5 text-sm text-ink-muted">
          Acik bakiyen varsa grup arkadaslarin bunu gormeye devam eder. Silme talebi 30 gun icinde
          geri alinabilir.
        </p>
        <div className="flex justify-end">
          <Button type="button" variant="destructive" onClick={() => setDeleteOpen(true)}>
            Hesabi sil
          </Button>
        </div>
      </section>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(next) => {
          setDeleteOpen(next);
          if (!next) {
            setDeleteError(null);
          }
        }}
        title="Hesabi sil"
        description="Acik bakiyen varsa grup arkadaslarin bunu gormeye devam eder. Silme talebi 30 gun icinde geri alinabilir. Bu sure sonunda hesabin kalici olarak anonimlestirilir."
        confirmLabel="Hesabi sil"
        tone="destructive"
        pending={deletePending}
        error={deleteError}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
};

export default AccountTab;
