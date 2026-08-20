import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { FieldError, FormError, SettingsCard } from '@/components/SettingsFormParts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import usersApi from '../api/users';
import useAuthForm from '../hooks/useAuthForm';
import { validatePasswordForm } from '../utils/validation';

import type { PasswordFormValues } from '../utils/validation';

/**
 * Ayarlar > Guvenlik (2.6, tasindi -> docs/decisions/ayarlar-sayfasi.md).
 *
 * Sifre degistirme, eskiden tek parcali Ayarlar sayfasindaki ucuncu bolumdu;
 * mantik ve kopya birebir ayni tasindi. `PUT /users/me/password` disinda
 * hesaba erisimin baska bir yolu yok, o yuzden bu sekme placeholder degil.
 */
const SecurityTab = () => {
  /*
    Sifre degistikten sonra alanlar temizleniyor; ekranda hicbir iz kalmiyor.
    Bos bir formun yaninda gorunur bir cumle olmazsa kullanici "gonderildi mi,
    sifirlandi mi?" diye kalir — toast o ana kadar sonmus olabilir.
  */
  const [passwordChanged, setPasswordChanged] = useState(false);

  /*
    `onSubmit` basarili olunca formu temizlemesi gerekiyor ama `reset` o
    fonksiyon yazilirken henuz yok (hook'un donusunde). Ref uzerinden gec
    baglaniyor; `reset` zaten kimligi degismeyen bir fonksiyon.
  */
  const resetPasswordForm = useRef<() => void>(() => {});

  const passwordForm = useAuthForm<PasswordFormValues>({
    initialValues: { currentPassword: '', newPassword: '', newPasswordRepeat: '' },
    validate: validatePasswordForm,
    onSubmit: async (values) => {
      await usersApi.changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });

      // Sirasi onemli: once alanlari temizle, sonra basariyi duyur.
      resetPasswordForm.current();
      setPasswordChanged(true);
      toast.success('Sifreniz degistirildi');
    },
    fallbackMessage: 'Sifre degistirilemedi',
  });

  resetPasswordForm.current = passwordForm.reset;

  return (
    <SettingsCard
      id="settings-password"
      title="Sifre degistir"
      description="Guvenlik icin once mevcut sifrenizi dogrulamaniz gerekiyor."
    >
      <form
        onSubmit={passwordForm.handleSubmit}
        noValidate
        className="flex flex-col gap-4"
        // Alanlar temizlendiginde eski basari mesaji ekranda kalmasin.
        onChange={() => setPasswordChanged(false)}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="currentPassword">Mevcut sifre</Label>
          <Input
            id="currentPassword"
            name="currentPassword"
            type="password"
            value={passwordForm.values.currentPassword}
            onChange={(event) => passwordForm.setField('currentPassword', event.target.value)}
            autoComplete="current-password"
            aria-invalid={passwordForm.fieldErrors.currentPassword ? true : undefined}
            aria-describedby={
              passwordForm.fieldErrors.currentPassword ? 'currentPassword-error' : undefined
            }
            disabled={passwordForm.pending}
          />
          <FieldError id="currentPassword-error" message={passwordForm.fieldErrors.currentPassword} />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="newPassword">Yeni sifre</Label>
          <Input
            id="newPassword"
            name="newPassword"
            type="password"
            value={passwordForm.values.newPassword}
            onChange={(event) => passwordForm.setField('newPassword', event.target.value)}
            autoComplete="new-password"
            aria-invalid={passwordForm.fieldErrors.newPassword ? true : undefined}
            aria-describedby={passwordForm.fieldErrors.newPassword ? 'newPassword-error' : undefined}
            disabled={passwordForm.pending}
          />
          <FieldError id="newPassword-error" message={passwordForm.fieldErrors.newPassword} />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="newPasswordRepeat">Yeni sifre (tekrar)</Label>
          <Input
            id="newPasswordRepeat"
            name="newPasswordRepeat"
            type="password"
            value={passwordForm.values.newPasswordRepeat}
            onChange={(event) => passwordForm.setField('newPasswordRepeat', event.target.value)}
            autoComplete="new-password"
            aria-invalid={passwordForm.fieldErrors.newPasswordRepeat ? true : undefined}
            aria-describedby={
              passwordForm.fieldErrors.newPasswordRepeat ? 'newPasswordRepeat-error' : undefined
            }
            disabled={passwordForm.pending}
          />
          <FieldError id="newPasswordRepeat-error" message={passwordForm.fieldErrors.newPasswordRepeat} />
        </div>

        {/*
          Backend "Mevcut sifre hatali" mesajini hem govde mesaji hem de
          `details.currentPassword` olarak doner; ikincisi alanin altina
          dusuyor, birincisi burada. Ayni cumleyi iki kez gostermemek icin
          alan hatasi varken form hatasi gizleniyor.
        */}
        <FormError
          message={passwordForm.fieldErrors.currentPassword ? null : passwordForm.formError}
        />

        {passwordChanged && (
          <p
            className="password-changed rounded-md border border-signal-positive/25 bg-signal-positive/8 px-3 py-2 text-sm text-signal-positive"
            role="status"
          >
            Sifreniz degistirildi. Bu cihazdaki oturumunuz acik kaldi.
          </p>
        )}

        <div>
          <Button type="submit" disabled={passwordForm.pending}>
            {passwordForm.pending ? 'Degistiriliyor...' : 'Sifreyi degistir'}
          </Button>
        </div>
      </form>
    </SettingsCard>
  );
};

export default SecurityTab;
