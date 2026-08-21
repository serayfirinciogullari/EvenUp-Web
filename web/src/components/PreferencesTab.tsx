import { Check } from 'lucide-react';
import { useCallback, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { SettingsCard } from '@/components/SettingsFormParts';
import { ThemeChoice } from '@/components/ThemeToggle';
import { cn } from '@/lib/utils';
import { getErrorMessage } from '../api/client';
import usersApi from '../api/users';
import useAsync from '../hooks/useAsync';

import type { NotificationPrefs } from '../types/models';
import type { ReactNode } from 'react';

/**
 * Ayarlar > Tercihler (2.6 -> 3.18, docs/decisions/3.18-tercihler-sayfasi.md).
 *
 * Tema calisiyor (eskiden de calisiyordu). Dil ve para birimi bilerek
 * yalnizca **gorsel**: tek gercek secenek (Turkce, TL) isaretli, alternatifler
 * tiklanamaz ve neden calismadiklarini soyleyen bir etiket tasiyor — backend'e
 * ya da i18n altyapisina hic dokunulmadi, bu isin kapsami disinda.
 *
 * Bildirimler farkli: uc toggle **gercekten** kaydediliyor
 * (`PUT /users/me/preferences`). Ama kaydedilen sey yalnizca bir tercih —
 * gercek e-posta/push gonderimi ayri bir is (Hafta 4), burada yok.
 */
const PreferencesTab = () => (
  <div className="flex flex-col gap-4">
    <SettingsCard
      id="settings-theme"
      title="Gorunum"
      description="Tema bu cihazda saklanir; hesabiniza bagli degildir."
    >
      <ThemeChoice />
    </SettingsCard>

    <SettingsCard id="settings-language" title="Dil" description="Uygulama dili.">
      <PreferenceChoiceList>
        <PreferenceChoiceRow label="Turkce" selected />
        <PreferenceChoiceRow label="English" note="ceviri hazir degil" />
      </PreferenceChoiceList>
    </SettingsCard>

    <SettingsCard id="settings-currency" title="Para birimi" description="Tutarlarin gosterildigi birim.">
      <PreferenceChoiceList>
        <PreferenceChoiceRow label="Turk lirasi" symbol="₺" selected />
        <PreferenceChoiceRow label="Dolar / Euro" note="desteklenmiyor" />
      </PreferenceChoiceList>
    </SettingsCard>

    <SettingsCard
      id="settings-notifications"
      title="Bildirimler"
      description="Hangi durumlarda haberdar edilmek istedigini sec."
    >
      <NotificationPreferences />
    </SettingsCard>
  </div>
);

/* --------------------------------------------- dil / para birimi (gorsel) */

const PreferenceChoiceList = ({ children }: { children: ReactNode }) => (
  <ul className="flex flex-col gap-2">{children}</ul>
);

/**
 * Tek bir satir: secili (aktif) ya da devre disi (`note` doluysa). Bilerek
 * `<button>`/`role="radio"` degil — hicbir satir tiklanamiyor
 * (`ThemeChoice`teki gercek secimin aksine), yani gercek olmayan bir
 * etkilesim ima etmemeli.
 */
const PreferenceChoiceRow = ({
  label,
  symbol,
  selected = false,
  note,
}: {
  label: string;
  symbol?: string;
  selected?: boolean;
  note?: string;
}) => (
  <li
    className={cn(
      'flex items-center justify-between rounded-lg border px-3 py-2 text-sm',
      selected ? 'border-rose/35 bg-rose/10 font-medium text-rose' : 'border-ink/12 text-ink-muted'
    )}
  >
    <span className="flex items-center gap-2">
      {symbol && <span aria-hidden>{symbol}</span>}
      {label}
    </span>
    {selected ? (
      <span className="flex items-center gap-1 text-xs">
        <Check className="size-3.5" aria-hidden />
        Secili
      </span>
    ) : (
      note && (
        <Badge variant="secondary" className="text-ink-muted">
          {note}
        </Badge>
      )
    )}
  </li>
);

/* ------------------------------------------------------------ bildirimler */

const NOTIFICATION_ROWS: {
  key: keyof NotificationPrefs;
  title: string;
  description: string;
}[] = [
  {
    key: 'email_enabled',
    title: 'E-posta bildirimi',
    description: 'Yeni harcama ve odeme istegi.',
  },
  {
    key: 'push_enabled',
    title: 'Anlik bildirim',
    description: 'Onay bekleyen odemeler.',
  },
  {
    key: 'weekly_digest_enabled',
    title: 'Haftalik ozet',
    description: 'Pazar aksami tek e-posta.',
  },
];

/**
 * Uc toggle, tek bir jsonb kolonuna (`notification_prefs`) kaydediliyor.
 *
 * NEDEN HER TIKLAMADA TAM GOVDE GONDERILIYOR
 * -------------------------------------------
 * Backend `PUT /users/me/preferences`i **tam durum** olarak okuyor
 * (`UpdateProfileInput`teki gibi) — tek bir anahtari degistirmek isteyen bir
 * tiklama bile ucunun tamamini (guncel + degismeyen iki alan) geri yolluyor.
 *
 * NEDEN TIKLAYINCA HEMEN ISARETLENMIYOR (iyimser degil)
 * ---------------------------------------------------------
 * Ekrandaki durum her zaman **sunucudan donen** cevap: PUT basarili olunca
 * `mutate` yerel durumu cevaptaki degerle yaziyor (iyimser bir on-tahmin
 * degil). `updateProfile`teki "yerel state'e yazip kaydedildi dememek"
 * ilkesiyle ayni (bkz. ProfileTab).
 */
const NotificationPreferences = () => {
  const fetchPrefs = useCallback(() => usersApi.getPreferences(), []);
  const prefsQuery = useAsync<NotificationPrefs>(fetchPrefs, 'Bildirim tercihleri alinamadi');

  const [savingKey, setSavingKey] = useState<keyof NotificationPrefs | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const toggle = async (key: keyof NotificationPrefs) => {
    const current = prefsQuery.data;
    if (!current || savingKey) {
      return;
    }

    const next = { ...current, [key]: !current[key] };
    setSavingKey(key);
    setSaveError(null);

    try {
      const saved = await usersApi.updatePreferences(next);
      prefsQuery.mutate(saved);
    } catch (caught) {
      setSaveError(getErrorMessage(caught, 'Tercih kaydedilemedi'));
    } finally {
      setSavingKey(null);
    }
  };

  if (prefsQuery.loading && !prefsQuery.data) {
    return (
      <div className="flex flex-col gap-3">
        {NOTIFICATION_ROWS.map((row) => (
          <Skeleton key={row.key} className="skeleton-line h-11 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (prefsQuery.error && !prefsQuery.data) {
    return (
      <div className="state-box state-box--error rounded-lg border border-destructive/25 p-4 text-center text-sm">
        <p className="text-destructive">{prefsQuery.error}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={prefsQuery.reload}>
          Tekrar dene
        </Button>
      </div>
    );
  }

  const prefs = prefsQuery.data;

  if (!prefs) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      {NOTIFICATION_ROWS.map((row) => (
        <div
          key={row.key}
          className="flex items-center justify-between gap-4 rounded-lg border border-ink/12 px-3 py-2.5"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">{row.title}</p>
            <p className="text-sm text-ink-muted">{row.description}</p>
          </div>
          <Switch
            checked={prefs[row.key]}
            disabled={savingKey !== null}
            onCheckedChange={() => void toggle(row.key)}
            aria-label={row.title}
          />
        </div>
      ))}

      {saveError && (
        <p
          className="form-error rounded-md border border-destructive/25 bg-destructive/8 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {saveError}
        </p>
      )}
    </div>
  );
};

export default PreferencesTab;
