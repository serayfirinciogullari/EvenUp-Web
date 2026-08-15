# Görsel kimlik — tasarım sistemi

Bu dosya EvenUp'ın görsel kimliğinde alınan kararları ve gerekçelerini kaydeder.
Kod referansları gerçek dosyalardan.

**Kapsam:** yalnızca sunum katmanı. API çağrıları, form mantığı, route guard'ları,
`useAsync`, `utils/validation`, `utils/balance`, `utils/money` — hiçbiri değişmedi.
2.1, 2.2 ve 2.3'ün tüm testleri aynı iddialarla geçiyor (iki test sorgusu hariç,
aşağıda).

---

## Kurulan altyapı

| Paket / dosya | Rolü |
| --- | --- |
| `tailwindcss` v4 + `@tailwindcss/vite` | Utility katmanı, `@theme` ile token'lar |
| `shadcn/ui` (radix-nova) | button, card, input, dialog, dropdown-menu, avatar, badge, skeleton, sonner, label |
| `motion` (framer-motion'ın devamı) | Sayfa geçişleri ve hover mikro-etkileşimleri |
| Magic UI (kopyalanan kaynak) | `ShineBorder`, `NumberTicker`, `AnimatedGradientText` |
| `web/src/index.css` | Token'lar, yüzey varyantları, hareket kuralları |
| `web/src/components/GlassCard.tsx` | Glass yüzey + imza çerçeve |
| `web/src/components/AuthShell.tsx` | Giriş/kayıt ortak çerçevesi |

Magic UI bileşenleri npm paketi olarak değil, **kaynak dosya olarak** projeye
alındı (`npx shadcn add https://magicui.design/r/<component>.json` — resmî
registry, dosyayı `src/components/ui/` altına yazar). Kod artık bizim; nitekim
`NumberTicker` bu yüzden değiştirilebildi (aşağıda).

---

## Paletteki çelişki ve verilen karar

Görev metninde token listesi `rose: #7A4A56` diyor; erişilebilirlik kısıtı ise
`berry (#8E2A5B)` kontrastının doğrulanmasını istiyor. Bunlar **görünür biçimde
farklı** iki renk (birincisi soluk gül-kahve, ikincisi canlı fuşya).

**Karar: token listesi esas alındı — `rose: #7A4A56`.** Gerekçe: token bloğu
doğrudan uygulama talimatı ("tailwind.config'e şu renkleri isimleriyle ekle"),
`berry` ise yalnızca düzyazıda geçiyor ve `rose` satırındaki "yazılacak revizyon
notu" ibaresi paletin revize edildiğine işaret ediyor.

**İkisi de AA geçiyor**, yani erişilebilirlik tie-breaker değil:

```
rose  #7A4A56 üzerine beyaz .... 7.14:1  ✓
berry #8E2A5B üzerine beyaz .... 7.98:1  ✓
```

Renk tek bir token'da (`--color-rose` + `--primary`), yani fikir değişirse
düzeltme iki satır. Berry tercih ediliyorsa `web/src/index.css` içindeki
`--color-rose` ve `--primary` değerlerini değiştirmek yeterli.

---

## İki kanal kuralı

Paletin tasarım fikri tek cümlede: **sıcaklık ile otorite ayrı kanallardan
verilir.**

| Kanal | Taşıyıcı | Nerede |
| --- | --- | --- |
| Sıcaklık | rose / blush / lilac | Buton, link, aktif nav, odak halkası, kart parıltısı |
| Otorite | ink `#2A1418` + Fraunces | Yalnızca başlıklar (h1/h2) |

Bu yüzden **rose bir başlık rengi değil.** Başlıkta kullanılsaydı iki kanal
birbirine karışır, marka rengi "her yerde olan renk" haline gelir ve
*tıklanabilir olanı işaret etme* gücünü kaybederdi. Kullanıcının "neye
basabilirim?" sorusunun cevabı renkten okunabilmeli.

Aynı sebeple `AnimatedGradientText` **sadece marka alanında** (üst bardaki logo
ve auth ekranının tepesi). Her başlıkta kullanılsaydı marka işareti olmaktan
çıkardı — görevin açıkça kaçınmak istediği "AI yaptı" hissi tam olarak buradan
doğuyor.

### Tipografi

Fraunces yalnızca `h1`/`h2` ve logoda; `h3` ve altında Inter kalıyor. Display
fontu küçük boyutlarda okunurluğu düşürür ve "her şey başlık" hissi verir.
Kural CSS'te `@layer base` içinde kodlandı, sayfalarda elle uygulanmıyor.

---

## Kontrast ölçümleri (WCAG 2.1 AA)

Hesaplananlar, normal metin eşiği 4.5:1:

| Kombinasyon | Oran | Sonuç |
| --- | --- | --- |
| rose `#7A4A56` üzerine beyaz (birincil buton) | **7.14:1** | ✓ |
| ink `#2A1418` metin / cream zemin | **15.92:1** | ✓ |
| rose `#7A4A56` metin / cream zemin (link) | **6.56:1** | ✓ |
| ink-muted `#6B5257` metin / cream zemin | **6.49:1** | ✓ |
| signal-positive `#1E7A5C` üzerine beyaz | **5.26:1** | ✓ |
| signal-negative `#B3261E` üzerine beyaz | **6.54:1** | ✓ |
| signal-positive `#1E7A5C` metin / cream | **4.83:1** | ✓ |
| signal-negative `#B3261E` metin / cream | **6.00:1** | ✓ |
| **lilac `#B8A0C4` üzerine beyaz** | **2.37:1** | **✗** |

**Bulgu: `lilac` metin rengi olarak kullanılamaz.** Görevde ikincil aksan olarak
"grafik/veri renklendirmesi, hover" diye tanımlanmış ve o kullanımlar geçerli —
ama bir yazı rengi olarak AA'yı geçmiyor. Kısıt kodda korunuyor: `lilac` hiçbir
yerde `color:` değeri olarak geçmiyor, yalnızca gradyan durağı (`--chart-2`,
logo gradyanının uç rengi, glass parıltı) olarak kullanılıyor.

`ink-muted` (`#6B5257`) bu yüzden var: ikincil metin için lilac yerine kullanılan,
AA geçen soluk ton.

### Odak göstergesi

shadcn'in `focus-visible:ring-*` varsayılanı **bozulmadı**. Üstüne bir taban
kural eklendi (`:focus-visible { outline: 2px solid rose }`) ki shadcn dışı
öğeler de (ham `<a>`, `<button>`) odakta görünür kalsın. Odak halkasının rose
olması iki kanal kuralıyla tutarlı: odak da bir etkileşim durumu.

---

## Yüzey ayrımı: `.card-glass` / `.card-solid`

Ayrım **içeriğe göre**, görünüme göre değil:

| Yüzey | Ne için | Nerede |
| --- | --- | --- |
| **Glass** | *Özet / durum* — bir şeyin sonucunu gösterir | Grup kartı (net bakiye özeti taşıyor), boş durum kartı, ileride "Bakiyeler" sekmesi |
| **Solid** | *İşlem / veri* — okunan ya da doldurulan alanlar | Login/register form kartı, "Yeni Grup" modalı, ayarlar listesi, ileride harcama satırları |

İkisi de `index.css` içinde `@utility` olarak tanımlı. Sayfa sayfa elle
yazılsaydı (blur değeri, saydamlık, kenar rengi) zamanla birbirinden ayrışır ve
"hangi kart glass?" sorusu her ekranda yeniden tartışılırdı — projede tekrarlanan
**tek kapı** deseni.

### İmza parıltı yalnızca glass'ta

`ShineBorder` doğrudan sayfalarda çağrılmıyor; tek girişi `GlassCard` bileşeni.
Serbest bırakılsaydı bir süre sonra butonlarda ve form kartlarında da belirir,
imza olmaktan çıkıp gürültüye dönüşürdü. Kural bileşende kodlandı:
**parıltı = glass; glass = özet/durum yüzeyi.** Solid tarafın karşılığı yok,
bilerek — ekleyeceği bir imza öğesi yok, doğrudan `.card-solid` kullanıyor.

### Mobil performans: blur dar ekranda kapalı

`backdrop-filter` altındaki her pikseli her karede yeniden örnekler. Maliyeti tek
bir elemanda göze batmaz ama **grup kartı bir listede N kez tekrarlanıyor** —
düşük güçlü telefonlarda kaydırma takılmasının klasik kaynağı.

Bu yüzden blur yalnızca `≥768px`'te açılıyor. Dar ekranda aynı kart blur'suz ama
aynı gradyanla render ediliyor; görsel fark neredeyse yok, maliyet farkı büyük.
Üretilen CSS'te doğrulandı:

```css
@media (width>=768px){.card-glass{-webkit-backdrop-filter:blur(14px)saturate(1.15);…}}
```

Ayrıca `prefers-reduced-transparency: reduce` altında cam efekti tamamen kapanıp
düz beyaza dönüyor: saydam yüzeyler bazı kullanıcılarda okumayı zorlaştırır.

> **Ölçülmedi:** gerçek bir cihazda performans profili çıkarılmadı. Yapılan şey
> bilinen maliyetin kaynağını kesmek ve bunu üretilen CSS'te doğrulamak.

---

## Hareket: orta yoğunluk

| Nerede | Ne | Süre |
| --- | --- | --- |
| Sayfa geçişi | fade + 8px yukarı kayma (`AnimatePresence mode="wait"`) | 180ms |
| Auth kartı girişi | fade + 12px kayma | 250ms |
| Grup kartları | kademeli giriş (stagger), **en fazla 6 kart** gecikmeli | 200ms |
| Kart hover | 3px kalkma (yay) | — |
| Glass çerçeve | `ShineBorder`, `motion-safe:` ile | 14s döngü |

**Yok olanlar:** sürekli hareket eden arka plan, parçacık sistemi, sonsuz dönen
öğe. Auth ekranındaki iki renk lekesi **statik gradyan** — hareketsiz.

Kart hover'ında ölçek (`scale`) yerine kalkma (`y`) seçildi: ızgara içinde ölçek
büyütmek komşu kartlarla çakışır.

Stagger'ın 6 kartla sınırlanması: uzun listelerde gecikme birikip son kartlar
geç görünmesin.

`prefers-reduced-motion: reduce` altında **her şey** duruyor — global CSS kuralı
tüm animasyon ve geçişleri 0.01ms'ye indiriyor, `ShineBorder` zaten
`motion-safe:` ile geliyor.

---

## `NumberTicker` neden değiştirildi

Magic UI'nin özgün sürümü bu projeye olduğu gibi konulamazdı. Dört değişiklik
yapıldı (dosyanın başında da yazılı):

1. **Biçimlendirme dışarıdan geliyor (`format` prop).** Özgün sürüm
   `Intl.NumberFormat("en-US")` ile yazıyordu: `"105"`. Bizim biçimimiz
   `"105,00 ₺"` ve kaynağı `utils/money.ts` — **tek kapı**. Ticker kendi başına
   para biçimlendirseydi projede ikinci bir para biçimlendirme yolu açılırdı.
2. **Değer tam sayı kuruş.** Ondalık sayı hiç girmiyor; ara karelerde bile
   yuvarlama hatası oluşamaz (1.5/2.3'teki kuruş disiplini).
3. **İlk render'da animasyon yok, yalnızca değişimde var.** Özgün sürüm görünür
   olunca 0'dan sayıyordu. Görevin istediği şey "bakiye **değiştiğinde**
   animasyonlu geçmesi"; ilk açılışta her bakiyenin sıfırdan sayılması hem
   gürültü olurdu hem de bir an için **yanlış bir tutar** göstermek demekti —
   bir gider uygulamasında kabul edilemez.
4. **`useInView` kaldırıldı.** Kartlar zaten ekranda; IntersectionObserver
   bağımlılığı gereksiz kırılganlık üretiyordu.

**Erişilebilirlik:** metin `aria-live` ile duyurulmuyor. Hızla değişen bir sayıyı
ekran okuyucuya akıtmak faydalı değil, gürültüdür; son değer DOM'da durduğu için
talep üzerine doğru okunur.

Bir uygulama ayrıntısı: ilk metin `useRef` ile sabitleniyor. React'in her
render'da `format(value)` yazmasına izin verilseydi, değer değiştiği anda React
son değeri basar, hemen ardından yay eski değerden başlayıp üzerine yazardı —
sayı bir an ileri gidip geri dönerdi.

---

## Toast nerede kullanılıyor, nerede kullanılmıyor

`sonner` kuruldu ve `<Toaster />` rota ağacının **dışında** mount edildi (bir
bildirim, onu tetikleyen sayfadan sonra da ayakta kalmalı).

Tek kullanım yeri: **grup oluşturma başarısı.** Modal kapandığı için mesajı
gösterecek görünür bir slot kalmıyor — toast tam olarak bu boşluk için.

Kart içi aksiyonlarda (davet linki kopyalama) toast **kullanılmadı**: orada
zaten görünür bir slot var ve `role="status"` ile yerinde gösteriliyor. Eylemin
yanında duran bir geri bildirim, ekranın köşesine uçan bir bildirimden daha
iyi — kullanıcının gözü zaten oradadır.

---

## Testler: ne değişti, ne değişmedi

**56 test (varsayılan) + 20 test (gerçek backend) aynen geçiyor.** Fonksiyonel
hiçbir iddia değişmedi.

İki test **sorgusu** güncellendi — iddialar aynı, hedef değişti:

| Test | Neden |
| --- | --- |
| `ayni anda gelen ikinci gonderim elenir` | Modal artık Radix Dialog ile **portal**'da render ediliyor, yani RTL'in `container`'ının dışında. `container.querySelector('.modal form')` → `screen.getByRole('dialog').querySelector('form')`. Rol tabanlı sorgu sınıf adına bağlı olmadığı için daha sağlam. |
| `Escape ile kapanir` | Escape dinleyicisi artık Radix'te ve `document` üzerinde. `window`a gönderilen olay `document`'e kabarcıklanmaz. `fireEvent.keyDown(window, …)` → `fireEvent.keyDown(document.body, …)`; gerçek kullanıcının tuşlaması da odaktaki öğeden başlar. |

Ayrıca `src/test/setup.ts`'e jsdom'da bulunmayan tarayıcı API'leri eklendi:
`matchMedia`, `ResizeObserver`, `IntersectionObserver`, `scrollIntoView`,
pointer capture. Hepsi **etkisiz varsayılan** dönüyor; özellikle
`matches: false` seçildi ki bileşenler tam animasyonlu yolu seçsin — tersi
seçilseydi testler uygulamanın gerçek varsayılan davranışını sınamamış olurdu.

Sınıf kancaları (`.balance--credit|debt|settled`, `.group-card__amount`,
`.modal`, `aria-label="Gruplar yukleniyor"`) bilerek korundu.

---

## Doğrulama

```
web/  npm test           -> 56/56
      npm run test:api   -> 20/20   (backend ayaktayken)
      npm run build      -> temiz
      npm run lint       -> temiz
```

Üretilen CSS üzerinde doğrulananlar: `card-glass` / `card-solid` utility'leri,
blur'un `@media (width>=768px)` içinde olması, `prefers-reduced-motion` ve
`prefers-reduced-transparency` blokları, tüm marka token'ları, Fraunces/Inter
referansları, `balance--*` tonları, shine keyframe'leri.

> **Görsel doğrulama yapılmadı.** Tarayıcı otomasyonu bu oturumda mevcut
> değildi; ekranların gerçekte nasıl göründüğü gözle kontrol edilmedi. Dev
> sunucusu ayakta (`npm run dev`) ve HTTP 200 dönüyor, font `<link>`leri
> serviste — ama "güzel duruyor mu" sorusunun cevabı verilmedi.

---

## Açık kalan noktalar

- **Bundle 596 kB (gzip 191 kB)** — görsel kimlik öncesi 294 kB'dı. Artış
  `motion` + Radix kaynaklı ve Vite 500 kB eşiğinde uyarı veriyor. Rota bazlı
  kod bölme (`React.lazy`) doğal çözüm; bu görevin kapsamı dışındaydı.
- **Karanlık tema yok.** shadcn'in `.dark` bloğu duruyor ama marka paletine
  çevrilmedi; şu an açık tema tek geçerli görünüm.
- **`AnimatedGradientText` metni gradyanla boyanıyor** (`text-transparent` +
  `bg-clip-text`). Zorunlu renk modunda (Windows high contrast) bu tür metin
  görünmez kalabilir; logo için kabul edilebilir bir risk ama bir `@media
  (forced-colors: active)` geri dönüşü eklenmeli.
- **Görsel regresyon testi yok.** Sınıf ve token kontrolleri CSS çıktısı
  üzerinden elle yapıldı; kalıcı bir koruma (snapshot / Playwright) yok.
- **Gerçek cihazda performans profili çıkarılmadı** — blur kısıtı tasarımla
  konuldu, ölçümle değil.
