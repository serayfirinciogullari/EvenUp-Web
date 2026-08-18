# Bölüşüm sadeleştirmesi: yüzde kaldırıldı, "Kaça Böl" eklendi

Harcama ekleme akışındaki üç bölüşüm tipinden biri (**yüzde**) kaldırıldı, yerine
**"Kaça Böl"** adında yeni bir akış geldi. "Eşit" ve "Özel tutar" hiç dokunulmadan
duruyor.

En önemli kısım tek cümlede: **"Kaça Böl" backend'de yeni bir bölüşüm tipi değil.**
Arayüzde ayrı bir seçenek gibi görünüyor, istekte `equal` olarak çıkıyor.

## Ne değişti

| Dosya                                          | Değişiklik                                                        |
| ---------------------------------------------- | ----------------------------------------------------------------- |
| `src/services/split.service.ts`                | `splitByPercentage`, `PercentageSplitInput` silindi; tip listesi ikiye indi |
| `src/services/expense.service.ts`              | `splitDetails` içindeki yüzde dalı ve validasyonu silindi          |
| `src/utils/money.ts`                           | `parsePercentageToBasisPoints`, `formatBasisPoints` silindi (çağıran kalmadı) |
| `src/types/models.ts`                          | `ExpenseSplitType = 'equal' \| 'exact'`                            |
| `src/db/migrations/14_drop_percentage_split_type.ts` | **Yeni** — enum'dan `percentage` kaldırıldı                  |
| `web/src/utils/split.ts`                       | `validatePercentage` → `validateCount`; `SplitMode`, `toApiSplitType` eklendi |
| `web/src/utils/money.ts`                       | Yüzde ↔ baz puan çevrimleri silindi                                |
| `web/src/components/AddExpenseModal.tsx`       | "Kaça Böl" akışı: bölen seçimi + tam sayıda kişi işaretleme        |
| `web/src/components/ExpensesTab.tsx`           | Listede yüzde etiketi kalmadı                                      |
| `tests/split.service.test.ts`                  | Yüzde testleri yerine "tip artık tanınmıyor" testi                 |
| `web/src/pages/groupDetail.test.tsx`           | Yüzde testleri yerine 7 "Kaça Böl" testi                           |

## Yüzde neden kaldırıldı

**Girdi maliyeti, kullanım sıklığıyla orantısızdı.** Yüzdeli bölüşüm, kullanıcıdan
her katılımcı için ayrı bir sayı istiyordu ve bu sayıların **toplamının tam 100
olması** şarttı. Üç kişilik en yaygın senaryoda bunun tam karşılığı `33.33 + 33.33 +
33.33 = %99.99` — yani formun en doğal girdisi geçersiz. Kullanıcı ya birine
`33.34` yazacaktı ya da "Eşit bölüşüm"e dönecekti. İkinci seçenek zaten doğru olan,
ilkiyse yüzdeyi elle eşitlemeye çalışmak: iki durumda da yüzde, eşit bölüşümün daha
zahmetli bir yolu oluyordu.

**Geriye kalan gerçek kullanım da "özel tutar" ile karşılanıyor.** Yüzdenin eşit
bölüşümden ayrıldığı senaryo asimetrik paylardı (%70 / %30 gibi). Ama o senaryoda
kullanıcının kafasındaki sayı çoğu zaman zaten tutar — "ben 210 verdim, o 90" —
yüzde ise araya giren bir çeviri adımı. `exact` bu ihtiyacı doğrudan ve tek adımda
karşılıyor; üstelik yuvarlama sorusu hiç doğmuyor (yüzdede `%33.33 × 300 TL` kuruş
artığı üretir, tutarda üretmez).

**Bakım yükü sessizdi ama gerçekti.** Yüzde, sistemde para dışında **ikinci bir tam
sayı birimi** (baz puan) getiriyordu: `parsePercentageToBasisPoints`,
`formatBasisPoints`, `basisPointsToApiPercentage`, ayrı bir "toplam 10000 mi?"
kuralı ve bunun frontend'de bir kopyası. Bunların hepsi tek bir bölüşüm tipi için
vardı. Kaldırılmasıyla iki taraftan da yaklaşık 150 satır ve bir birim kavramı
düştü; `distributeByWeights` (en büyük artık yöntemi) ise yerinde duruyor, çünkü
onu eşit bölüşüm de kullanıyor.

## "Kaça Böl" neden ayrı bir tip gibi sunuluyor

Kullanıcının kafasındaki cümle şu: **"hesabı 4'e bölelim"**. Bu cümle "bu kişileri
işaretle, aralarında eşit bölünsün"den farklı bir sıra izliyor — önce **sayı**
söyleniyor, kişiler sonra. Restoran hesabı, taksi, ortak hediye: hepsinde önce
"kaça bölüyoruz" konuşulur.

Eşit bölüşümün mevcut formu bu sırayı desteklemiyordu. Orada tek soru "kim dahil"di
ve bölen sayısı, işaretlenen kişilerin **sonucu** olarak ortaya çıkıyordu. Sekiz
kişilik bir grupta "4'e bölelim" diyen kullanıcı, dört kişiyi işaretlerken kaç tane
işaretlediğini kendi sayıyordu; beşincisine yanlışlıkla dokunması hiçbir uyarı
üretmiyordu, çünkü "5 kişi arasında eşit bölüşüm" de tamamen geçerli bir istekti.

"Kaça Böl" bu sayımı forma yaptırıyor:

1. **Kaça bölünsün?** — 2'den grup üye sayısına kadar tek bir seçim.
2. **Kimler?** — işaret kutuları; **tam olarak** o sayıda kişi seçilene kadar form
   gönderilmiyor.

Yani eklenen şey yeni bir hesap değil, **kullanıcının söylediği sayının
doğrulanması**. Değer de tam olarak burada: "4'e böleceğim" niyeti artık formda
yazılı duruyor ve yanlış sayıda seçim sessizce kabul edilmiyor.

### Azı da fazlası da neden reddediliyor

Eksik seçim zaten bariz bir hata. Fazlası da reddediliyor çünkü "4'e böl" + 5 kişi
işaretli, aynı anda iki farklı niyet demek ve hangisinin kazandığı belirsiz.
Fazlalığı sessizce kırpmak (ilk dördünü almak gibi) kullanıcının görmediği bir karar
olurdu — harcamanın kime yazıldığı ise tam da görmesi gereken şey. Hata mesajı bu
yüzden "seçim geçersiz" demiyor, ne yapılacağını söylüyor: *"3 kişiye bölünecek: 1
kişi daha seç"* / *"2 kişiye bölünecek: 1 kişinin işaretini kaldır"*.

Alt sınır 2 (`MIN_SPLIT_COUNT`): 1'e bölmek bölüşüm değil, harcamayı tek kişiye
yazmak. Üst sınır grup üye sayısı — olmayan kişiye pay çıkarılamaz. İki kişiden az
üyesi olan grupta seçenek hiç gösterilmiyor; gösterip devre dışı bırakmak, çözümü
olmayan bir engeli ekranda tutmak olurdu.

## Arka planda neden mevcut eşit bölüşüm çağrılıyor

"Kaça Böl" için backend'e yeni bir tip eklenmedi. İstek şu şekilde çıkıyor:

```json
{ "splitType": "equal", "splitDetails": { "participants": ["<id>", "<id>", "<id>"] } }
```

Gerekçe: **"N'e böl" bir hesaplama yöntemi değil, bir seçim akışı.** Kullanıcı
seçimi bitirdiğinde geriye kalan iş — "şu kişiler arasında eşit böl, kuruş artığını
kimseye iki kez verme" — `splitEqual` ile birebir aynı iş. Yeni bir tip eklemek,
`distributeByWeights`'i çağıran ikinci bir sarmalayıcı, ikinci bir doğrulama yolu ve
`expense_split_type` enum'unda üçüncü bir değer demekti; hepsi de aynı sonucu
üretecek şekilde.

Bunun somut bedeli, iki kod yolunun **zamanla ayrışması** olurdu: kuruş artığının
kime gittiği (`userId` sıralı tie-break) bugün tek bir fonksiyonda tanımlı ve
frontend önizlemesi de onu birebir taklit ediyor. İkinci bir yol, o davranışın
kopyalandığı ve bir gün birinin güncellenip diğerinin unutulduğu yer olurdu.

**Kabul edilen sonuç:** "Kaça Böl" ile eklenen bir harcama, harcamalar listesinde
**"Eşit"** etiketiyle görünür; "3'e bölündü" bilgisi saklanmaz. Bu bilinçli:
kaydedilen şey gerçekten de eşit bölüşüm, "kaça bölündüğü" ise girişi kolaylaştıran
bir form adımı — harcamanın kalıcı bir özelliği değil. Katılımcı sayısı zaten
paylardan okunuyor (üç pay = üç kişi), yani hiçbir bilgi kaybolmuyor.

### İki ayrı seçim durumu

`AddExpenseModal` içinde "Eşit/Özel tutar"ın işaret kutuları (`rows[].included`) ile
"Kaça Böl"ün seçimi (`countSelection`) **ayrı** tutuluyor. Aynı duruma bağlansalardı,
"Eşit"te varsayılan olarak herkes işaretli olduğu için "Kaça Böl"e geçen kullanıcı
formu daha ilk anda hatalı bulurdu: *"2 kişiye bölünecek, 4 kişi seçildi"*. İki
listenin kutuları aynı görünüyor ama aynı soruyu sormuyor — biri "bu kişi dahil mi",
diğeri "bu kişi o N kişiden biri mi". Ekran okuyucu için de ayrı okunuyorlar
(`"Ece dahil"` / `"Ece secili"`).

Kişi başı tutar önizlemesi `count` modunda **yalnızca seçim tamamlanınca**
gösteriliyor: 3'e bölünecek bir harcamada 2 kişi işaretliyken "50,00 ₺" yazmak,
kaydedilmeyecek bir tutarı kaydedilecekmiş gibi göstermek olurdu.

## Veritabanı: enum'dan da silindi

`expense_split_type` enum'u `('equal', 'exact')` oldu (migration 14). Enum'da
bırakmak "kod kabul etmiyor ama veritabanı ediyor" durumu üretirdi; elle atılan bir
`INSERT` ya da ileride yazılacak bir script, uygulamanın artık okuyamadığı bir satır
oluşturabilirdi.

Var olan `percentage` satırları **`exact`** olarak güncelleniyor, `equal` olarak
değil. Payların kendisine dokunulmuyor — kimse bir kuruş kazanmıyor ya da
kaybetmiyor, değişen tek şey satırın "hangi yöntemle bölündü" etiketi. `equal`
yazmak yanlış olurdu: %70/%30 bölünmüş bir harcamayı "eşit bölündü" diye
etiketlemek, ekranda görünen paylarla çelişen bir cümle üretirdi. `exact` ise
doğruyu söylüyor — o satırın payları kişi başına hesaplanmış sabit tutarlar.

PostgreSQL enum'dan değer silmeyi desteklemediği için yol yeni tipi kurup kolonu ona
taşımak: `DROP DEFAULT` → `UPDATE` → yeni tip → `ALTER COLUMN ... USING` → eski tipi
düşür → yeniden adlandır → `SET DEFAULT`.

`down` enum değerini geri getirir ama **veriyi geri getiremez**: hangi satırın
eskiden `percentage` olduğu bilgisi `up` içinde kayboluyor (yüzdeler zaten hiçbir
zaman saklanmıyordu, yalnızca paylar). Kabul edilmiş bir kayıp; saklanan pay
tutarları değişmediği için geri alma sonrasında da hesaplar doğru.

## Kapsam dışı bırakılanlar

**Bildirim.** "Kaça Böl" ile eklenen harcama, grup sohbeti akışında (`group_messages`)
zaten diğer harcamalarla aynı şekilde görünüyor — akış harcamanın nasıl girildiğine
değil, oluştuğuna bakıyor. Bu yeterli kabul edildi; push bildirimi ayrı bir iş
(Hafta 4) ve burada yazılmadı.

**Sohbetten "kaça böl".** `ai.service` içindeki `create_expense` aracı hâlâ yalnızca
`splitType: 'equal'` üretiyor ve katılımcıları doğrudan listeliyor; doğal dilden
"4'e bölelim" cümlesini bölen sayısına çevirmek bu değişikliğin kapsamında değil.
Zaten arka planda aynı uca düştüğü için ileride eklenmesi yeni bir tip gerektirmez.

## Geçersiz kalan bölümler

- `docs/decisions/1.5.md` ve `docs/decisions/2.4.md` yüzdeli bölüşümü anlatıyor;
  o bölümler artık geçerli değil. Baz puan (`basisPoints`) kavramı kod tabanında
  kalmadı.
- `docs/decisions/00_ozet.md` içindeki bölüşüm tipi tablosu da yüzdeyi listeliyor;
  güncel kaynak bu dosya.

## Testler

- **Backend** (`tests/split.service.test.ts`): yüzde blokları silindi. Yerine
  `SPLIT_TYPES`'ın tam olarak `['equal', 'exact']` olduğu ve eski istemcilerden
  gelebilecek `percentage` gövdesinin `SplitError` fırlattığı doğrulanıyor. Ayrıca
  "Kaça Böl"ün arka plan davranışı — N kişilik listeyle `equal` — ayrı bir testte.
- **Frontend** (`web/src/pages/groupDetail.test.tsx`): 7 yeni test — varsayılan
  bölen 2 ve seçimin boş başlaması, seçeneklerin `2..üye sayısı` olması, eksik
  seçimde isteğin durması, fazla seçimin de reddedilmesi, önizlemenin yalnızca tam
  seçimde görünmesi, gövdenin `equal` + katılımcı listesi olarak gitmesi, mod
  değiştirmenin "Eşit" seçimini bozmaması. Ayrıca yüzde seçeneğinin ekranda
  bulunmadığı doğrulanıyor.
- Birim: `validateCount` (az / tam / fazla) ve `toSplitDetails('count', ...)`.
