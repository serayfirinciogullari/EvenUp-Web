import { ComingSoonNote, SettingsCard } from '@/components/SettingsFormParts';
import { ThemeChoice } from '@/components/ThemeToggle';

/**
 * Ayarlar > Tercihler (2.6, yeniden tasarim -> docs/decisions/ayarlar-sayfasi.md).
 *
 * Tema secici tasindi ve **calisiyor** (eskiden calisiyordu, mockup'taki dil/
 * para birimi/bildirimler henuz yok). Ikisi ayni sekmede ama ayri bloklar:
 * biri gercek bir kontrol, digeri bir vaat degil.
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

    <SettingsCard
      id="settings-other-preferences"
      title="Dil, para birimi ve bildirimler"
      description="Bu tercihler henuz uygulanmiyor."
    >
      <ComingSoonNote>Yakinda gelecek.</ComingSoonNote>
    </SettingsCard>
  </div>
);

export default PreferencesTab;
