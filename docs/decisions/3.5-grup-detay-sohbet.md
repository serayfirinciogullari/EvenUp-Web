# Grup Detay — Sohbet Tabanlı Akış (3.5)

Grup detayı artık bir **mesaj feed'i**: harcamalar, AI netleştirme soruları ve
(ileride) fiş referansları tek bir zaman çizelgesinde akar. Bu doküman üç kararı
gerekçelendirir: (1) neden "net cümlede direkt oluştur, belirsizde sor" ayrımı,
(2) neden manuel form ile chat aynı alt fonksiyonu paylaşıyor, (3) fiş akışıyla
(3.5.2) nasıl bütünleşiyor.

İlgili kod:

- Tablo: `src/db/migrations/13_group_messages.ts`, tipler `src/types/models.ts`
- Veri erişimi: `src/models/message.model.ts`
- Doğal dil ayrıştırma: `src/services/ai.service.ts` (Anthropic tool use)
- Orkestrasyon: `src/services/message.service.ts`
- Ortak feed kancası: `src/services/expense.service.ts` (`createExpense`/`deleteExpense`)
- Uçlar: `POST /groups/:id/messages`, `GET /groups/:id/messages`

---

## 1. Neden "net cümlede oluştur, belirsizde sor" — tek yönlü tahmin değil

Doğal dil harcama ekleme iki uçlu bir risk taşır: **yanlış harcama sessizce
oluşursa** kimse fark etmeden birinin bakiyesi bozulur; **hiç oluşmazsa** özellik
işe yaramaz. İkisi arasındaki çizgiyi modele bırakıyoruz ama _serbest metin
ayrıştırma_ ile değil, Anthropic'in **tool use** özelliğiyle.

Modelden JSON metni isteyip parse etmek yerine iki araç tanımlanır ve
`tool_choice: { type: 'any' }` ile model **ikisinden birini seçmeye zorlanır**:

- `create_expense` — mesaj net/tamamlanabilir (tutar belli, kim dahil anlaşılıyor).
- `ask_clarification` — mesaj belirsiz (tutar yok, "herkese" derken kim dahil
  belli değil, bir isim birden fazla kişiye uyuyor…). **Harcama oluşturulmaz**,
  kullanıcıya tek bir soru sorulur.

Neden bu tasarım:

- **Çıktı her zaman yapısal.** `tool_choice: any` sayesinde cevap ya geçerli bir
  harcama çağrısı ya da bir sorudur; arada yarım JSON, "elbette, işte harcamanız:"
  gibi bir önsöz ya da serbest metin olamaz. Metin ayrıştırıp regex/parse
  denemekten çok daha güvenilir.
- **Belirsizlik oluşturmaya değil, sormaya döner.** "Bir şey harcadım" gibi bir
  mesajda model tahmin yürütüp 0 TL'lik ya da uydurma bir harcama yaratmaz;
  `ask_clarification` çağırır. Yani hata durumunda **güvenli taraf**: eksik bilgi
  yeni bir soru üretir, hatalı bir borç değil.
- **Kritik parça isim/katılımcı eşleştirme.** "Ece'ye", "bana ve Kerem'e"
  ifadelerini yanlış kişiye bağlamak sessiz bir finansal hatadır. Bu yüzden
  varsayılan model **Sonnet** (`config.anthropicModel`, `ANTHROPIC_MODEL` ile
  değiştirilebilir); iş metin-only olsa da eşleştirme hatası riski Haiku'yu riskli
  kılıyor. Model yalnızca sistem mesajında verilen `userId` değerlerini
  kullanabilir; uydurduğu bir id `ai.service` içinde elenip yok sayılır, böylece
  halüsinasyon 400'e dönüşmez.
- **Kullanıcının metni asla kaybolmaz.** Sıra: önce `user_text` feed'e yazılır,
  _sonra_ AI çağrılır. AI ya da harcama oluşturma patlasa bile kullanıcının yazdığı
  mesaj feed'de durur; istemci tekrar deneyebilir.

Chat üzerinden yalnızca **eşit bölüşme** (`splitType: 'equal'`) destekleniyor:
`create_expense` aracının pay-başı tutar/yüzde taşıyacak bir alanı yok, olması da
doğal dilde hataya açık olurdu. Pay-başı tutar/yüzde gerektiren bölüşmeler
**forma** bırakıldı (form değişmeden çalışıyor).

---

## 2. Neden manuel form ve chat aynı alt fonksiyonu paylaşıyor

Bir harcama üç yoldan oluşabilir: **manuel form** (1.5), **doğal dil mesajı** (bu
iş) ve **fiş onayı** (3.5.2, ertelendi). Üçünün de feed'e `expense_created` satırı
düşürmesi gerekir. Bu satırı üç yerde ayrı ayrı yazmak, birinde kural değişince
(ör. hangi alanların özete gireceği) diğerlerinin sessizce geride kalması demekti.

Karar: **feed satırı `expense.service.createExpense` içinde, tek bir yerden
yazılır.** Chat yolu harcama oluşturmayı yeniden yazmaz; aynı `createExpense`'i
çağırır. Yani:

- `POST /groups/:id/expenses` (form) → `expenseController.create` → `createExpense`
- `POST /groups/:id/messages` (chat) → `message.service` → **aynı** `createExpense`

`createExpense` harcamayı oluşturduktan sonra `messageModel.insertExpenseCreated`
çağırır. Böylece harcama nereden gelirse gelsin feed satırı **tek kod yolundan**
üretilir (DRY). Testte bu bilerek doğrulanıyor: manuel formdan eklenen harcama da
feed'de `expense_created` olarak görünüyor ve form yolu AI'ya hiç dokunmuyor —
"iki ayrı kod yolu yok" iddiası test edilir (`tests/messages.test.ts`).

"Geri al" da aynı simetriyle çalışır: `DELETE /expenses/:id` →
`deleteExpense` harcamayı soft-delete edince `messageModel.softDeleteByExpenseId`
ile ilgili feed kartını da işaretler.

### Neden feed'de soft delete (hard delete değil)

Harcama silinince `expense_created` satırı **soft delete** ile işaretlenir, satır
silinmez. Gerekçe:

- **Kod tabanının her yeriyle tutarlı.** Gruplar, harcamalar, hepsi soft delete;
  feed'in ayrı davranması yeni bir istisna olurdu.
- **Tersine çevrilebilirlik simetrisi.** Harcamanın soft delete'i geri
  alınabilir; feed satırı da `deleted_at` ile işaretlendiği için harcama geri
  gelirse mesaj da geri getirilebilir. Hard delete bu kapıyı kalıcı kapatırdı.
- **Açık ve test edilebilir.** "Harcamayı silince feed'deki kart da kalkıyor"
  doğrudan gözlemlenebilir bir yazma; bir JOIN yan etkisine güvenmekten net.

`GET /groups/:id/messages` feed'i en yeni üstte, sayfalanmış döner ve
`expense_created` satırlarına **canlı harcamanın özetini** (tutar, açıklama,
kategori, ödeyen, ekleyen) JOIN ile ekler. Böylece istemci feed için ayrıca
`GET /expenses/:id` çağırmak zorunda kalmaz. `created_by`/`paid_by` özete
konur ki arayüz "geri al" butonunu 1.5 kuralına göre (yalnızca ekleyen ya da
grup sahibi) gösterebilsin — silme yetkisini yine `DELETE /expenses/:id`
sunucuda uygular.

Gönderen adı feed'e **konmadı**: grup detay ucu (`GET /groups/:id`) üyeleri
adları ve kişiye özel takma isimleriyle zaten döndüğünden istemci `sender_id`'yi
yerelde isme çevirebilir; takma isimler kişiye özel olduğu için feed'de tek bir
"gönderen adı" tutmak zaten yanlış olurdu.

---

## 3. Fiş akışıyla (3.5.2) bütünleşme — ertelendi ama dikiş hazır

Fiş tarama akışı (3.5.2) bu işin kapsamı dışında bırakıldı; ama şema ve tipler o
akış geldiğinde **yeniden şekillendirilmeyecek** biçimde hazırlandı:

- `group_message_type` enum'unda `receipt_draft_ref` değeri **şimdiden var**.
- `group_messages.receipt_draft_id` kolonu **şimdiden var** (nullable). Ancak
  `receipt_drafts` tablosu henüz olmadığı için buna **foreign key yok**. 3.5.2
  migration'ı yalnızca `receipt_draft_id -> receipt_drafts.id` FK'sini ekleyecek.
- `message.model` içinde `insertReceiptDraftRef` yardımcısı yazıldı ama henüz
  hiçbir yerden çağrılmıyor.

Böylece 3.5.2 geldiğinde tek yapılacak: bir fiş taslağı oluşunca
`insertReceiptDraftRef` çağırmak (frontend feed'de "fiş yüklendi, düzenleniyor…"
kartını gösterebilsin) ve FK'yi eklemek. Draft onaylanıp gerçek harcamaya
dönüşünce, **2. maddedeki ortak fonksiyon** (`createExpense`) `expense_created`
satırını zaten ekleyecek — fiş yolu için ayrı bir feed kodu yazmaya gerek
kalmayacak. Dikiş bu yüzden "temiz": yeni akış mevcut ortak noktaya bağlanır,
feed şeması değişmez.

### Tip ↔ dolu kolon tutarlılığı DB'de zorlanır

`group_messages` üzerinde bir CHECK (`group_messages_shape_check`) her satır
türünün yalnızca kendi referans kolonunu doldurmasını garanti eder: metin
türlerinde `content` dolu; `expense_created`'da `expense_id` dolu;
`receipt_draft_ref`'te `receipt_draft_id` dolu, diğerleri NULL. Uygulama katmanı da
bunu sağlar; DB'deki CHECK, ileride elle SQL ya da yeni bir kod yolu tutarsız satır
yazmaya kalktığında son savunma hattıdır.

---

## Yetki ve kısıtlar (özet)

- İki uç da 1.4'teki `requireMembership`ten geçer: yalnızca grup üyeleri mesaj
  gönderebilir/görebilir; üye olmayan aynı 403'ü alır (varlık sızıntısı yok).
- Doğal dil ucu için `ANTHROPIC_API_KEY` gerekir; yoksa `ai.service` 503 döner ve
  uygulamanın geri kalanı etkilenmez (istemci lazily kurulur, açılışta patlamaz).
- Mesaj boşsa 400; en fazla 2000 karakter.
