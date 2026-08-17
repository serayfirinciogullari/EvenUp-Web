# Landing — halka açık tanıtım sayfası (`/`)

Kök adres artık bir tanıtım sayfası. Bu dosya alınan kararları ve gerekçelerini kaydeder;
özellikle iki tanesini: hero animasyonunun neden **bir kez** oynadığını ve "Neden EvenUp"
bölümünün neden bilerek **sakin** bırakıldığını.

## Ne eklendi

| Dosya                                       | Görevi                                                     |
| ------------------------------------------- | ---------------------------------------------------------- |
| `web/src/pages/LandingPage.tsx`             | Beş bölüm, halka açık üst bar, alt bilgi                    |
| `web/src/components/LandingNetting.tsx`     | Hero'nun imza animasyonu (SVG + `pathLength`)               |
| `web/src/components/LandingChatPreview.tsx` | AI sohbetinin **statik** önizlemesi                         |
| `web/src/components/LandingReveal.tsx`      | Scroll'da bir kez beliren blok — sayfanın tek hareket kalıbı |
| `web/src/pages/landing.test.tsx`            | 9 test                                                      |
| `web/src/index.css`                         | `.landing-cta` hover halesi                                  |

Rota değişikliği (`App.tsx`):

| Önce                     | Sonra                | Neden                                    |
| ------------------------ | -------------------- | ---------------------------------------- |
| `/` → `Navigate /home`   | `/` → `LandingPage`  | Kök adres artık ziyaretçinin de gördüğü yer |

`/login`, `/register` ve uygulama içi `/home` **değişmedi**. Giriş sonrası hedef hâlâ
`/home`; `GuestRoute`'un varsayılan yönü de öyle.

## Neden guard yok

Sayfa ne `ProtectedRoute` ne `GuestRoute` altında. İkincisi ilk bakışta mantıklı görünüyor
("girişi olan neden tanıtım görsün?") ama `GuestRoute` bu sayfayı oturumu açık olan herkes
için bir **yönlendirmeye** çevirirdi: paylaşılan bir kök adres linki, giriş yapmış birinde
hiç açılmadan `/home`'a düşerdi. Halka açık bir adresin herkese aynı sayfayı açması
gerekiyor.

Giriş yapmış kullanıcı için fark yalnızca butonlarda: "Giriş yap / Hemen başla" yerine tek
bir "Uygulamaya dön". Bu, `useAuth().status` okunarak yapılıyor — sayfanın kendisi hiçbir
istek atmıyor.

## Hero animasyonu neden bir kez oynar

Animasyon şunu anlatıyor: beş kişi arasındaki **yedi ayrı borç** beliriyor, sonra sönüp
yerini **üç kalın ödeme okuna** bırakıyor. Bu, ürünün çekirdek algoritmasının (1.6,
netleştirme) tek cümlelik özeti — süsleme değil.

Döngüye sokmama kararının üç gerekçesi var:

**1. Dönen bir animasyon, yanındaki metinle yarışır.** Hero'nun asıl işi başlık ve CTA.
İnsan gözü hareketi metne tercih eder; sağdaki şema her 4 saniyede bir yeniden kurulsaydı
kullanıcı başlığı okurken periyodik olarak sağa çekilir, cümleyi baştan başlardı. Sayfanın
tek amacı olan "Hemen başla" tıklaması, bu yüzden geciker.

**2. Anlatının bir sonu var.** Bu bir yükleme göstergesi değil, bir cümle: "dağınıktı,
sadeleşti." Cümlenin sonu ekranda **durmalı**. Döngü, sonucu her seferinde silip yeniden
karmaşaya döndürür — yani izleyene bıraktığı son görüntü "sadeleşti" değil, "yine
karıştı" olur. Şu anki hâlde animasyon bittiğinde ekranda kalıcı bir şema kalıyor: üç ok
ve tutarları. Sonradan bakan biri de hikâyeyi statik hâliyle okuyabiliyor.

**3. Erişilebilirlik ve maliyet.** Sürekli hareket, vestibüler rahatsızlığı olan
kullanıcılar için sorunlu; ayrıca sekme arka planda kalsa bile rAF döngüsü sürer. Bir kez
oynayan animasyon bittiği anda tamamen susuyor.

Uygulama: animasyon mount anında `initial` → `animate` geçişiyle başlıyor, `repeat` yok,
tetikleyici yok. `prefers-reduced-motion` açıkken animasyonun **sonucu** çiziliyor (sönük
ağ + üç ok + tutarlar); boş bırakmak ya da ilk kareyi göstermek, hareketi kapatan
kullanıcıya eksik bir sayfa vermek olurdu.

Not: `pathLength` animasyonu `stroke-dasharray`/`dashoffset` üzerinden çalışıyor, bu
yüzden çizgilerde elle `strokeDasharray` kullanılmıyor — ikisi çakışıyor ve çizgi hiç
çizilmiyor.

## Sayfanın hareket bütçesi

Sayfada tek bir "gösteri" var (hero animasyonu). Geri kalan her şey `LandingReveal`:
18px aşağıdan, 450ms, `once: true`. Tek bileşen olmasının sebebi, beş bölümün kendi
değerlerini yazması hâlinde mesafelerin ve sürelerin zamanla ayrışması — sayfa "her
bölümü ayrı yerden öğrenmiş" gibi görünürdü.

`prefers-reduced-motion` altında `motion.div` hiç mount edilmiyor, düz bir `div`
dönüyor. Buradaki hareket JS ile inline stile yazılıyor; `index.css`'teki global
`transition-duration: 0.01ms` kuralı onu durduramaz, çünkü bir CSS geçişi değil.

## "Neden EvenUp" neden sakin bırakıldı

Sayfanın işi bu bölümde değişiyor. Hero ve "Nasıl çalışır" **ilgi** kurar; burada kurulması
gereken şey **güven**. İkisi aynı araçlarla yapılamaz.

- **Hareket, iddiayı zayıflatır.** "Ödeme, onaylanana kadar kapanmaz" cümlesi bir söz. Söz
  verirken el kol hareketi yapmak, sözü değil hareketi hatırlatır. Kartların sırayla
  uçuşarak gelmesi, buradaki üç maddeyi "özellik reklamı"na çevirirdi; oysa hedef, okuyanın
  durup düşünmesi.
- **Karşılaştırma zaten dikkat ister.** Üç madde de "diğer uygulamalar şöyle, biz böyle"
  yapısında. Bu yapı okuyucudan bir yargı bekliyor; yargı, hareket eden bir yüzeyde
  verilmiyor.
- **Kontrast, sayfanın kendi ritminden geliyor.** Üstteki iki bölüm kademeli ve canlı.
  Aynı sayfada bir bölümün sakinleşmesi, o sakinliği bir işaret hâline getiriyor: "burası
  farklı, burası ciddi."

Uygulama farkı somut: bu bölümde kademeli `delay` yok (tüm blok tek parça olarak bir kez
beliriyor), hover'da kalkma yok, ikon animasyonu yok. Kartlar bile kutu değil, düz bir
liste — çünkü kutulanmış her madde bir "ürün özelliği" gibi okunur.

Rakip ismi geçmiyor ("diğer uygulamalar"). İsim vermek, karşılaştırmayı doğrulanması
gereken bir iddiaya çevirir ve sayfanın işi o değil.

## Kural esnetildi: son CTA'da ShineBorder

`GlassCard.tsx`'te yazılı kural şuydu: **parıltı = glass; glass = özet/durum yüzeyi**, ve
`ShineBorder` yalnızca `GlassCard` üzerinden dağıtılır. Landing'in son CTA'sında bu kural
bilerek bir kez esniyor: buton, hover/odakta beliren bir `ShineBorder` ve altına düşen
sıcak bir hale taşıyor.

Gerekçe: kuralın amacı parıltının her yere yayılmasını önlemekti. Burada yayılma yok —
sayfada tek bir buton var ve sayfanın tek amacı o. Ayrıca parıltı **sabit değil**: sayfa
yüklendiğinde parlamıyor, yalnızca zaten oraya yönelmiş kullanıcıyı karşılıyor. Sabit bir
parıltı, üstündeki metin okunurken gözü butona kilitlerdi.

Hale rengi `--shadow-glow` token'ından: koyu temada bu token siyaha dönüyor (bkz.
`index.css` `.dark` bloğu), yani koyu zeminde pembe bir neon oluşmuyor.

## Dürüstlük işaretleri

AI sohbeti henüz yazılmadı. Landing bunu iki yerde söylüyor: önizlemenin başlığındaki
"Yakında" rozeti ve bölüm metnindeki "Sohbet arayüzü henüz yayında değil — bugün
harcamaları elle ekleyip eşit ya da özel bölüşebiliyorsun" cümlesi. Ekranda görünen bir
şey için "bu bugün var" izlenimi bırakmak, kullanıcının kayıttan sonraki ilk dakikada fark
edeceği bir yanıltma olurdu.

Önizleme **işlevsel değil**: yazma alanı yok, hiçbir istek atılmıyor. Çalışan bir demo,
ziyaretçiyi ürünün yerine demonun içinde tutar ve "denedim, yeterince iyi değil" yargısını
uygulamaya hiç girmeden verdirir.

## Doğrulama

- `web/src/pages/landing.test.tsx` — 9 test: giriş olmadan açılıyor ve `/auth/me`
  çağrılmıyor; uygulama çerçevesi (gezinme, çıkış, hesap menüsü) yok; şema tek bir
  erişilebilir görsel olarak duyuruluyor ve üç ok taşıyor; üç adım metinde de numaralı;
  önizlemede `textbox` yok; "Neden EvenUp" rakip ismi vermiyor; üç "Hemen başla" bağlantısı
  da `/register`'a bakıyor.
- `web/src/routes.test.tsx` — kök adres artık login'e düşmüyor (misafir) ve giriş yapmış
  kullanıcıyı da yönlendirmiyor; ikisinin de doğru butonu görüyor.
- jsdom'da `IntersectionObserver` sahte olduğu için `whileInView` blokları başlangıç
  durumunda kalıyor; testler **ne olduğunu** doğruluyor, **nasıl belirdiğini** değil.
  Hero'nun bir kez oynaması da (rAF + gerçek zaman) testle değil kodun kendisiyle
  garanti: `repeat` yok, tetikleyici mount.
- Tüm web paketi: 202 test geçiyor. `tsc --noEmit`, `oxlint`, `vite build` temiz.
