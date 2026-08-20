import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldError, FormError, SettingsCard } from '@/components/SettingsFormParts';
import usersApi from '../api/users';
import useAuth from '../hooks/useAuth';
import useAuthForm from '../hooks/useAuthForm';
import { maskEmail } from '../utils/maskEmail';
import { MAX_AVATAR_BYTES, validateProfileForm } from '../utils/validation';

import type { ProfileFormValues } from '../utils/validation';
import type { ChangeEvent } from 'react';

/**
 * Ayarlar > Profil (2.6, yeniden tasarim -> docs/decisions/ayarlar-sayfasi.md).
 *
 * ISIM YANINDA IKI YENI ALAN: FOTOGRAF VE TAKMA AD
 * -------------------------------------------------
 * Fotograf dogrudan base64 `data:image/...;base64,...` olarak forma yaziliyor
 * ve `PUT /users/me`e o sekilde gidiyor (bkz. migration 18, auth.service.ts).
 * Boyut/bicim once burada (aninda geri bildirim), sonra backend'de (asil
 * sinir) kontrol ediliyor.
 *
 * Takma ad (`handle`) kisi bazli takma isimlerden (member_nicknames) AYRI:
 * bu, kullanicinin **kendi** hesabina verdigi tek, herkese ayni gorunen ad.
 *
 * BASARININ KANITI: STATE DEGIL, SUNUCUDAN GERI OKUMA
 * -----------------------------------------------------
 * Kaydedildikten sonra `refreshUser()` cagriliyor; ekranda (ve sidebar'daki
 * kullanici blogunda) gorunen deger `GET /auth/me`den geri okunan degerdir.
 */

const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png'];

/** Ad-soyaddan iki harflik bas harf — Sidebar'daki `initialsOf` ile ayni kural. */
const initialsOf = (name: string | undefined): string => {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return '?';
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
};

const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error as unknown);
    reader.readAsDataURL(file);
  });

const ProfileTab = () => {
  const { user, refreshUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Backend'in `handle_taken`/bicim hatalari `fieldErrors.avatar`a dusmuyor
  // (avatar `useAuthForm`in string alanlarindan biri degil bir dosya secimi);
  // secim aninda yakalanan hatalar bu yerel state'te.
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const handleProfileSubmit = useCallback(
    async (values: ProfileFormValues) => {
      await usersApi.updateProfile({
        name: values.name.trim(),
        handle: values.handle.trim().toLowerCase() || null,
        avatar: values.avatar || null,
      });
      // Cevaptaki `user`i dogrudan kullanmak yerine sunucudan geri okuyoruz;
      // gerekcesi dosyanin basinda.
      await refreshUser();
      toast.success('Profil guncellendi');
    },
    [refreshUser]
  );

  const form = useAuthForm<ProfileFormValues>({
    // ProtectedRoute altindayiz: buraya gelindiginde `user` yuklenmis durumda.
    initialValues: {
      name: user?.name ?? '',
      handle: user?.handle ?? '',
      avatar: user?.avatar ?? '',
    },
    validate: validateProfileForm,
    onSubmit: handleProfileSubmit,
    fallbackMessage: 'Profil guncellenemedi',
  });

  // Degismemis bir profili kaydetmek bosuna bir istek; buton da bunu soyluyor.
  const unchanged =
    form.values.name.trim() === (user?.name ?? '') &&
    form.values.handle.trim().toLowerCase() === (user?.handle ?? '') &&
    form.values.avatar === (user?.avatar ?? '');

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Ayni dosya art arda iki kez secilebilsin diye input hemen sifirlanir.
    event.target.value = '';

    if (!file) {
      return;
    }

    setAvatarError(null);

    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      setAvatarError('Yalnizca JPG veya PNG yuklenebilir');
      return;
    }

    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError('Fotograf en fazla 2MB olabilir');
      return;
    }

    form.setField('avatar', await readAsDataUrl(file));
  };

  const handleRemoveAvatar = () => {
    setAvatarError(null);
    form.setField('avatar', '');
  };

  return (
    <SettingsCard
      id="settings-profile"
      title="Profil"
      description="Adiniz gruplarda ve harcama listelerinde bu sekilde gorunur."
    >
      <form onSubmit={form.handleSubmit} noValidate className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar size="lg" className="size-16">
            {form.values.avatar && <AvatarImage src={form.values.avatar} alt="" />}
            <AvatarFallback className="bg-rose text-base font-semibold text-cream">
              {initialsOf(user?.name)}
            </AvatarFallback>
          </Avatar>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                Fotograf yukle
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRemoveAvatar}
                disabled={!form.values.avatar}
              >
                Kaldir
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={(event) => void handleFileChange(event)}
                aria-label="Fotograf yukle"
              />
            </div>
            <p className="text-xs text-ink-muted">JPG veya PNG - en fazla 2MB.</p>
            <FieldError id="avatar-error" message={avatarError ?? form.fieldErrors.avatar} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="name">Gorunen ad</Label>
            <Input
              id="name"
              name="name"
              value={form.values.name}
              onChange={(event) => form.setField('name', event.target.value)}
              autoComplete="name"
              aria-invalid={form.fieldErrors.name ? true : undefined}
              aria-describedby={form.fieldErrors.name ? 'name-error' : undefined}
              disabled={form.pending}
            />
            <FieldError id="name-error" message={form.fieldErrors.name} />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="handle">Takma ad</Label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-ink-muted">
                @
              </span>
              <Input
                id="handle"
                name="handle"
                value={form.values.handle}
                onChange={(event) => form.setField('handle', event.target.value)}
                className="pl-6"
                aria-invalid={form.fieldErrors.handle ? true : undefined}
                aria-describedby={form.fieldErrors.handle ? 'handle-error' : undefined}
                disabled={form.pending}
              />
            </div>
            <FieldError id="handle-error" message={form.fieldErrors.handle} />
          </div>
        </div>

        {/*
          E-posta **gosteriliyor ama duzenlenemiyor** ve deger maskeleniyor:
          e-posta ayni zamanda giris kimligi, degistirmek dogrulama akisi ister.
        */}
        <div className="grid max-w-xs gap-1.5">
          <Label htmlFor="email">E-posta</Label>
          <div className="flex items-center gap-2">
            <Input id="email" name="email" value={maskEmail(user?.email ?? '')} readOnly />
            <Badge variant="outline" className="border-rose/30 bg-rose/8 text-rose">
              GIZLI
            </Badge>
          </div>
        </div>

        {/*
          Takma ad carpismasinda backend govde mesaji ile `details.handle`
          **ayni cumle**; ikisini birden gostermek tek bir hatayi iki kez
          soylemek olurdu (Guvenlik sekmesindeki mevcut sifre hatasiyla ayni
          gerekce).
        */}
        <FormError message={form.fieldErrors.handle ? null : form.formError} />

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={form.pending || unchanged}>
            {form.pending ? 'Kaydediliyor...' : 'Kaydet'}
          </Button>
          {unchanged && !form.pending && (
            <span className="text-sm text-ink-muted">Kaydedilmemis degisiklik yok.</span>
          )}
        </div>
      </form>
    </SettingsCard>
  );
};

export default ProfileTab;
