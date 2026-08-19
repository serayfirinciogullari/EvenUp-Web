# Aktivite akışı

Sidebar'daki "Aktivite" sekmesi artık kullanıcının **tüm** gruplarındaki olayların
(harcama eklendi/düzenlendi, ödeme bildirildi/onaylandı/reddedildi) tarihe göre
gruplanmış, birleşik akışı. Önceki sürüm yalnızca bir sayıydı (`pendingSettlementsCount`);
bu doküman o sayının gerçek bir akışa nasıl dönüştüğünü ve en önemlisi **onay bekleyen
banner'ın neden akışın içinde değil, sabit ve ayrı** olduğunu kaydediyor.

## Ne değişti

| Dosya | Değişiklik |
| --- | --- |
| `src/db/migrations/15_expense_edits.ts` | **Yeni** — harcama düzenleme geçmişi |
| `src/models/activity.model.ts` | **Yeni** — 5 dallı `UNION ALL`, sabit sorgu sayısı |
| `src/services/activity.service.ts` | **Yeni** — kapsam (uyelik) + sayfalama + grup adı eşleme |
| `src/controllers/activity.controller.ts`, `src/routes/activity.routes.ts` | **Yeni** — `GET /activity` |
| `src/models/expense.model.ts`, `src/services/expense.service.ts` | Güncelleme her başarılı UPDATE'te `expense_edits`e satır yazıyor |
| `src/models/group.model.ts` | **Yeni** — `listMembershipNames` (id+ad, N+1 yok) |
| `src/models/settlement.model.ts`, `src/services/settlement.service.ts`, `src/controllers/settlement.controller.ts`, `src/routes/settlement.routes.ts` | **Yeni** — `GET /settlements/pending` (yalnızca alacaklı) |
| `web/src/pages/ActivityPage.tsx` | Tek istatistik kutusu → banner + gün gruplu akış |
| `web/src/components/PendingApprovalBanner.tsx` | **Yeni** — sabit banner |
| `web/src/hooks/useActivityFeed.ts`, `web/src/api/activity.ts` | **Yeni** — sayfalanmış akış |
| `web/src/utils/activity.ts`, `web/src/utils/datetime.ts` | **Yeni** — rozet/cümle/gün gruplama yardımcıları |

## 1. Banner neden akışın içinde değil, sabit ve ayrı

Akış bir **geçmiş** anlatıyor: "ne oldu?". Banner ise bir **iş emri**: "şimdi benden ne
bekleniyor?" İki soru aynı listeye karıştırılırsa banner, zaman sırasındaki yerine göre
aşağı kayar — yani en çok ihtiyaç duyulduğu anda (eski bir onay uzun süredir bekliyorken)
en görünmez olduğu yere düşer. Sabit konum bu ilişkiyi tersine çeviriyor: bekleyen bir
şey olduğu sürece ekranda, akışta ne kadar aşağı inilirse inilsin.

Bu yüzden veri kaynağı da ayrı: `GET /settlements/pending` akıştan (`GET /activity`)
bağımsız bir uç. Birleştirilseydi akışın 2. ve 3. sayfasında da aynı bekleyen listesi
tekrar tekrar taşınırdı — "daha fazla yükle" her tıklamada değişmeyecek bir veriyi
yeniden gönderirdi. Ayrı olması ayrıca onaydan sonra **yalnızca banner'ı** tazelemeyi de
mümkün kılıyor.

Banner **yalnızca iş varken** çiziliyor; boş halde "bekleyen yok" yazan kalıcı bir şerit
bırakmak, sabit bir alanı hiçbir şey söylemeyen bir bantla doldururdu. Birden fazla
bekleyen kayıt varsa da hepsi alt alta dizilmiyor — en eskisi gösterilip geri kalanı
sayıyla bildiriliyor (`· onay bekleyen N kayıt daha var`); hepsini basmak sabit bölgeyi
büyüterek akışı ekrandan iterdi, "sabit" olmasının anlamı kalmazdı. Sıralama en eskiden
başlıyor: bir onay ne kadar uzun süre beklediyse o kadar acil.

## 2. Neden yeni bir "olaylar" tablosu yok — akış bir sorgu

Beş olay türünün dördü zaten kayıtlı: harcama eklendi (`expenses.created_at`), ödeme
bildirildi/onaylandı/reddedildi (`settlements.created_at/confirmed_at/rejected_at`).
Bunları ayrıca bir `activity_events` tablosuna yazmak iki maliyet getirirdi: (1) tablo
yalnızca yazıldığı andan sonrasını bilir, akış uygulamanın **bugüne kadarki** geçmişini
göstermek yerine boş açılırdı; (2) bir harcama eklenip olay satırı yazılmazsa (ya da
tersi) iki tablo birbirini yalanlardı. Bu yüzden akış beş `SELECT`in `UNION ALL`iyle
kurulan **türetilmiş bir görünüm**, kendi tablosu olan bir kayıt değil.

Tek istisna düzenleme: `expenses.updated_at` yalnızca "bir şey değişti" der, eski tutarın
ne olduğunu bilmez (UPDATE üzerine yazar). "Ece, Temizlik tutarını 210,00 → 195,00 olarak
düzeltti" cümlesindeki sol taraf hiçbir yerde durmuyordu — `expense_edits` (migration 15)
tam olarak o kayıp yarım için açıldı. Bu migration'dan önceki düzenlemeler için satır
üretilemiyor; geriye dönük veri kurtarılamaz, kabul edilen bilinçli sınır bu.

Sorgu sayısı kullanıcının grup sayısından **bağımsız**, sabit üç: üyelik+grup adları,
olayların sayfası, toplam sayı. Aktör/karşı taraf adları birleşimin dışında tek bir join
ile ekleniyor; her dalda ayrı `users` join'i aynı işi beş kez yaptırırdı.

## 3. Cümle neden backend'de değil, istemcide kuruluyor

Backend olayın **malzemesini** gönderiyor (kim, kime, ne kadar, öncesi/sonrası),
cümlenin kendisini değil. İki sebep: (1) aynı olay okuyan kişiye göre farklı cümle —
aktör okuyucunun kendisiyse "Sen ... ekledin", değilse "Ece ... ekledi"; bu bir görünüm
kararı. (2) Türkçe ekler `utils/turkish.ts`'te tek yerde üretiliyor; cümleyi backend
kursaydı aynı kuralın ikinci bir kopyası orada da yaşar, ikisi zamanla ayrışırdı.

Bununla bağlantılı bir düzeltme: `duzelt`/`yap` gibi sessiz ünsüzle biten fiil
köklerinde ek sessizleşmesi (`t+d → t+t`) uygulanmıyordu ("duzeltdi" yazıyordu, doğrusu
"düzeltti"). Dosyanın kendisi `settlement_rejected` dalında bu kuralı zaten doğru
uyguluyordu ("reddetti"); `editedSentence` ve bilinmeyen-tür varsayılanı aynı kurala
uydurulup tutarlı hâle getirildi.
