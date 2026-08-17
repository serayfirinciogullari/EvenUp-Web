# Home ızgarası ve Gruplar boş durumu

Bu dosya iki düzeltmenin kararlarını kaydeder: Home'daki carousel'in kaldırılıp sabit
ızgaraya geçilmesi ve Gruplarım ekranının boş durumunun kendi ekranı hâline gelmesi.
2.7'de alınan carousel kararının bir kısmı burada **geri alınıyor**; hangi kısmının ve
neden geri alındığı aşağıda.

## Ne değişti

| Dosya                                     | Değişiklik                                                      |
| ----------------------------------------- | --------------------------------------------------------------- |
| `web/src/pages/HomePage.tsx`              | Carousel → sabit ızgara; dikey ortalama kaldırıldı               |
| `web/src/components/HomeCarousel.tsx`     | **Silindi**                                                      |
| `web/src/components/ui/carousel.tsx`      | **Silindi** (shadcn/embla primitifi; başka kullanıcısı yoktu)     |
| `web/src/components/HomeStatCard.tsx`     | Glass kart → koyu gradyanlı karo                                  |
| `web/src/components/HomeFeatureCard.tsx`  | Solid kart → tam genişlikte koyu gradyanlı karo                   |
| `web/src/utils/homeCards.ts`              | "Sıra kuralı" yerine içerik hesabı; 6 kart → 2 karo + 1 tanıtım   |
| `web/src/components/GroupsEmptyState.tsx` | **Yeni** — karşılama kartı + "Grup nedir?" + 2x2 özellik ızgarası |
| `web/src/pages/GroupsPage.tsx`            | Tek satırlık boş durum → `GroupsEmptyState`                       |
| `web/src/index.css`                       | `home-tile--*`, `home-cta`, `welcome-card` kuralları              |
| `web/src/pages/home.test.tsx`             | Carousel testleri → ızgara + renk kuralı + "carousel kalmadı"     |
| `web/src/pages/groups.test.tsx`           | Boş durum bloğu (3 test)                                          |

`embla-carousel-react` bağımlılığı `package.json`'da duruyor ama artık hiçbir yerden
import edilmiyor; ağaç sarsılınca (tree-shaking) pakete girmiyor. Bilerek silinmedi —
kaldırmak kilit dosyasını da değiştirir ve bu görevin konusu değil.

## 1. Carousel neden kaldırıldı

2.7'de carousel'in **otomatik kaymaması** doğru bir karardı ve o karar hâlâ geçerli:
kişisel para verisi kullanıcının elinden alınmamalı. Yanlış olan, en baştan bir carousel
seçilmiş olmasıydı.

**Mekanik, içerikten büyüktü.** Ekranda üç kutuluk içerik vardı; onu göstermek için
bir slider motoru (embla), ok butonları, nokta göstergeleri ve swipe alanı taşınıyordu.
Kullanıcının okumaya başlamadan önce cevaplaması gereken bir soru doğuyordu: "kaç kart
var, hepsini gördüm mü?" Bu soru Home'un işine ait değil.

**Kartların yarısı her zaman ekran dışındaydı.** Altı kartın üçü ilk bakışta
görünmüyordu ve kullanıcıların çoğu üçüncü karttan sonrasını hiç açmaz. Yani içeriğin
yarısı, taşıdığı mekanik kadar bile iş yapmıyordu. Sabit ızgarada her şey ilk bakışta
görünüyor; "sıralama kuralı" diye bir karara da gerek kalmıyor çünkü sıra düzenin
kendisinden okunuyor.

**Az dikkat dağıtıcı, daha modern.** Yatay kaydırma bir gezinme jesti; Home'un tek
istediği jest ise aşağıdaki CTA'ya basmak. İki gezinme yolu yan yana durduğunda ikisi de
zayıflıyordu.

Kart sayısı bu yüzden altıdan üçe indi. "Aktif olduğun grup" sayısı bir kutuyu hak
edecek kadar önemli değildi ama veriyi atmak da doğru olmazdı: CTA'nın altındaki
cümleye taşındı ("3 grupta aktifsin · kim kime ne kadar borçlu, hepsi orada"). Diğer iki
tanıtım kartı (takma isimler, hatırlatma) düştü — ikisi de uygulamanın içinde zaten
keşfedilebilir yerler ve tanıtım karosu CTA ile yarışmamalı.

Dikey ortalama da kalktı. O ortalama, tek satırlık carousel'in ekranın üst yarısında asılı
kalmasını gizlemek içindi. Izgara sayfayı doğal olarak dolduruyor; ortalama artık içeriği
başlıktan koparmaktan başka bir şey yapmazdı ve diğer üç ekranın üstten başlama
davranışıyla da çelişirdi.

## 2. Tek renk ailesi kuralı

**Kural:** Home'daki üç karo da tek bir renk ailesinden boyanır (rose → ink). Karolar
arasındaki fark yalnızca **koyuluk ve gradyan yönüdür**.

```
net bakiye     linear-gradient(135deg, #3D1F26, #2A1418)   en koyu
bu ay harcanan linear-gradient(135deg, #4A2530, #2A1418)
AI fiş tarama  linear-gradient(135deg, #5C2E3D, #3D1F26)   en açık
CTA            linear-gradient(90deg,  #7A4A56, #B87B8C)   tek aydınlık yüzey
```

Önceki hâlde her kart kendi pastel zeminini taşıyordu: bir yeşil, bir mavi, bir lila.
Sonuç "hazır şablon" hissiydi. Bunun teknik bir açıklaması var: **birden çok hue aynı
anda eşit doygunlukta kullanıldığında hiyerarşi kurulamaz.** Dört ayrı renk ailesi
birbirine göre "daha önemli" olamaz, çünkü aralarında sıralanabilir bir eksen yoktur —
göz hangisine önce gideceğini rastgele seçer. Tek ailede eksen var: koyuluk. Net bakiye
en koyu ve en geniş kutuda, tanıtım en açık ve en alttaki kutuda; CTA ise sayfadaki tek
aydınlık yüzey olduğu için göz oraya gidiyor. Aynı sayfa artık kasıtlı, daha premium
duruyor — çünkü gerçekten bir düzen var, dekorasyon değil.

Bu kural mevcut "iki kanal" ilkesinin (bkz. `gorsel-kimlik.md`) devamı: sıcaklık rose
ailesinden gelir, otorite ink'ten. Home karoları ikisinin arasındaki gradyandan başka
bir şey değil.

### Sinyal rengi: zemine değil, yalnızca sayıya

1.6 ve 2.3'te kurulan ilke — **sinyal renkleri marka paletinden bağımsızdır** — burada
metin düzeyinde yaşıyor:

- Alacak/borç rengi **rakamın** rengidir (`.home-tile--credit` / `--debt`).
- Karonun zemini **hiçbir koşulda** sinyal rengine boyanmaz.

Zemine taşınsaydı bir bakiye karosu bir uyarı kutusuna dönüşürdü: "230,00 ₺ alacaklısın"
yeşil bir panelde durunca, okunan şey bilgi değil bildirim olur. Üstelik üç karo yine üç
ayrı renge dağılır ve yukarıdaki tek aile kuralı ilk veri geldiğinde çökerdi.

Koyu karolar için ayrı bir sinyal çifti tanımlandı (`--home-tile-positive: #7EDCB4`,
`--home-tile-negative: #E4847A`). Mevcut `--color-signal-*` değerleri cream zemin için
seçilmişti ve koyu karo üzerinde okunmuyor. Ölçülen kontrastlar (WCAG 2.1 AA, eşik 4.5:1):

```
#F7ECE9 metin / #5C2E3D (en açık karo) ....... 10.55:1 ✓
#D6BDC0 açıklama / #5C2E3D .................... 6.79:1 ✓
#7EDCB4 rakam / #3D1F26 ....................... 9.82:1 ✓
#E4847A rakam / #3D1F26 ....................... 5.79:1 ✓
```

Karo zeminleri iki temada da aynı koyu gradyan olduğu için üzerlerindeki metin
token'lardan değil sabit değerlerden geliyor; `--color-ink` kullanılsaydı açık temada
koyu metin koyu zemine düşerdi.

CTA'nın gradyanında bir ödün var ve kayda geçiyor: beyaz metin sol uçta 7.14:1
(`#7A4A56`), orta noktada ~4.75:1, en açık uçta ise 3.36:1 alıyor. Bu yüzden buton
içeriği ortalanmış durumda; o bandın en açık kısmına yalnızca ok ikonu taşabiliyor ve
grafik ögelerin eşiği 3:1.

### Kart içi boşluk

Önceki kartlarda `min-h-72` (288px) vardı ve içerik onu doldurmuyordu: rakam, boş bir
alanın ortasında asılı duruyordu. Yeni karolarda yükseklik içeriğe yakın (`min-h-36`,
sabit yükseklik yok) ve iç düzen `justify-between`: etiket tepede, rakam ortada,
açıklama altta. Metin sarınca karo büyüyebiliyor — taban değer, tavan değil.

## 3. Gruplar boş durumu

Eski boş durum tek satırdı: "Henüz bir grubun yok." Doğru ama işe yaramaz. Kullanıcı o
anda uygulamayı büyük ihtimalle ilk kez görüyor ve "grup"un bu uygulamada ne anlama
geldiğini bilmiyor. **Boş ekran, uygulamanın en çok anlatması gereken andır**; bir hata
mesajı gibi davranması için sebep yok.

Üç blok, bu sırayla:

1. **Karşılama kartı** — pastel gradyan (`120deg, #F4C6D8, #E4D2E8, #D9E4F0`), sol tarafta
   `rgba(255,255,255,0.5)` zeminli yuvarlak ikon rozeti, sağda başlık + açıklama ve tek
   bir eylem: "İlk grubunu oluştur".
2. **"Grup nedir?"** — ortalanmış, küçük, harf aralıklı, gri bir bölüm ayracı ve iki
   cümlelik tanım.
3. **2x2 özellik ızgarası** — grubun içinde ne olduğu.

Sıra bilinçli: **önce eylem, sonra açıklama.** Kullanıcıların çoğu ne yapacağını zaten
biliyor ve açıklamayı okumadan butona basar; açıklamayı tepeye koymak onları bekletmek
olurdu. Buton dolgusu ink (#2A1418) — pastel zeminde rose bir buton yeterince
ayrışmıyordu, ikisi de açık ve aynı sıcaklıkta. Siyah/beyaz değil ink: palet dışına
çıkmadan en yüksek kontrast (15.92:1).

Karşılama kartının zemini iki temada da aynı pastel olduğu için metin rengi de sabit ink.
Base katmanındaki `h2 { color: var(--color-ink) }` kuralı koyu temada metni açığa
çevireceği için kart kendi rengini `color: inherit` ile dayatıyor.

### "Yakında" rozetleri — dört kutunun ikisi

Özellik kutuları gerçek özelliklere referans veriyor:

| Kutu               | Durum   | Bugün ne var                                             |
| ------------------ | ------- | -------------------------------------------------------- |
| Sohbet & fişler    | Yakında | Grup içi sohbet henüz yok                                 |
| Harcama kalemleri  | Yakında | Harcama elle ekleniyor, eşit/özel bölüşme çalışıyor (1.5) |
| Bakiyeler          | Var     | Netleştirme + ödeme onayı (1.6, 1.7)                      |
| Grup ayarları      | Var     | Davet linki, üye listesi, takma isim (1.4, 2.9)           |

İlk iki kutu istenen içeriği anlatıyor ama rozetle işaretli. Gerekçe: boş bir ekranda
var olmayan özellikleri varmış gibi anlatmak, kullanıcının uygulamada karşılaşacağı ilk
yalan olurdu — ve ilk dakikada kurulan güven, sonradan geri kazanılmıyor. Aynı desen
Home'daki tanıtım karosunda da var (`to: null` → "Yakında" + bildirim).

Metinler uygulamanın geri kalanıyla aynı yazım kuralını izliyor: arayüz dizeleri
aksansız ASCII ("hos geldin", "Ilk grubunu olustur"). Karar bu görevde alınmadı, mevcut
kod tabanının kuralı; testler de bu dizeleri arıyor.

## 4. Doğrulama

- `web/src/pages/home.test.tsx` — 17 test. Ayrı bir blok carousel'in **geri gelmediğini**
  koruyor: nokta göstergesi, ok butonu, `role="group"` slide'ları ve
  `aria-roledescription="carousel"` hiç bulunmamalı.
- Renk kuralı testi sınıf düzeyinde: jsdom stil dosyası yüklemediği için gerçek zemin
  rengi ölçülemiyor; her karonun `home-tile--{balance|spend|feature}` yüzeylerinden
  birini taşıdığı ve zemin boyayan `.balance--*` ailesinin ızgarada hiç geçmediği
  doğrulanıyor.
- `web/src/pages/groups.test.tsx` — boş durum bloğu: 0 grupta karşılama ekranı + dört
  kutu + iki "Yakında" rozeti, butonun modalı açması, 1+ grupta boş durumun hiç
  görünmemesi.
- Üretim derlemesinde (`dist/assets/*.css`) beş gradyanın da istenen değerlerle
  bulunduğu kontrol edildi; Home karolarında yeşil/mavi/lila zemin yok.
- Tüm web paketi: 190 test geçiyor.
