import { ComingSoonNote, SettingsCard } from '@/components/SettingsFormParts';

/**
 * Ayarlar > Hesap (2.6, yeniden tasarim -> docs/decisions/ayarlar-sayfasi.md).
 *
 * Tamamen placeholder: hesap kapatma/veri disa aktarma gibi bir ic nokta
 * henuz yok. `çalışan her şeyi taşı, mevcut olmayan şeyler için placeholder
 * yap` kuralinin ikinci yarisi — burada tasinacak bir sey yok.
 */
const AccountTab = () => (
  <SettingsCard
    id="settings-account"
    title="Hesap"
    description="Hesap yonetimi secenekleri burada olacak."
  >
    <ComingSoonNote>Yakinda gelecek.</ComingSoonNote>
  </SettingsCard>
);

export default AccountTab;
