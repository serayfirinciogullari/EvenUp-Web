import type { ReactNode } from 'react';

/**
 * Ayarlar sekmelerinin ortak kucuk parcalari (2.6 -> Ayarlar yeniden tasarimi).
 *
 * Profil, Guvenlik, Tercihler ve Hesap sekmeleri ayri dosyalarda (route'lar
 * URL'den adreslenebilir olsun diye, bkz. App.tsx) ama gorsel kabuklari ayni
 * kalmali. Tek dosyada tekrarlamak yerine burada paylasiliyor.
 */

/** Formlarin ortak kabugu: baslik + aciklama + govde. */
export const SettingsCard = ({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}) => (
  // Solid: kullanicinin okudugu/doldurdugu yuzey. Glass ozet icin (gorsel kimlik).
  <section aria-labelledby={id} className="card-solid p-5 sm:p-6">
    <h2 id={id}>{title}</h2>
    <p className="mt-1 mb-5 text-sm text-ink-muted">{description}</p>
    {children}
  </section>
);

/** Alan altindaki hata satiri — LoginPage/RegisterPage ile ayni bicim. */
export const FieldError = ({ id, message }: { id: string; message?: string }) =>
  message ? (
    <p className="field-error text-sm text-destructive" id={id}>
      {message}
    </p>
  ) : null;

export const FormError = ({ message }: { message: string | null }) =>
  message ? (
    <p
      className="form-error rounded-md border border-destructive/25 bg-destructive/8 px-3 py-2 text-sm text-destructive"
      role="alert"
    >
      {message}
    </p>
  ) : null;

/** Henuz yapilmamis bir sekmenin tek satirlik karsiligi (Tercihler'in bir
 *  bolumu, ya da Hesap sekmesinin tamami). */
export const ComingSoonNote = ({ children }: { children: ReactNode }) => (
  <p className="rounded-lg border border-dashed border-ink/15 px-4 py-3 text-sm text-ink-muted">
    {children}
  </p>
);
