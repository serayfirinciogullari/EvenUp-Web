/**
 * Grup detay adresi.
 *
 * NEDEN AYRI BIR DOSYA (`utils/invite.ts` -> `joinPath` ile ayni gerekce)
 * ----------------------------------------------------------------------
 * Ayni adresi dort yer kuruyor: grup karti, sidebar kisayollari, davetle
 * katildiktan sonraki yonlendirme ve detay sayfasinin kendi adres duzeltmesi.
 * Sablon dizeyi her birine kopyalamak, adres bicimi degistiginde (bugun oldugu
 * gibi: uuid -> slug) birini atlamak demekti.
 *
 * Backend her iki bicimi de cozuyor (`GET /groups/:idOrSlug`), yani uuid tasiyan
 * eski linkler acilmaya devam ediyor. Yeni link **her zaman** slug ile
 * kuruluyor; uuid'ye dusmek yalnizca bir guvenlik agi.
 */

/** Adres parcasi tasiyan her sey: `Group`, `GroupSummary` ya da ikisinin ozeti. */
export interface GroupAddressable {
  id: string;
  slug?: string | null;
}

export const groupPath = (group: GroupAddressable): string =>
  `/groups/${encodeURIComponent(group.slug || group.id)}`;

export default groupPath;
