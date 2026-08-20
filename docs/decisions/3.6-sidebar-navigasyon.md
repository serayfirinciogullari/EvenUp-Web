# Sol sidebar navigasyonu

Üst yatay bar sol sidebar'a taşındı. Bu dosya alınan kararları kaydeder: paylaşılan
sunucu durumunun neden ortaya çıktığını, grup renginin neden türetildiğini ve
"Aktivite" sayfasının kapsamının neden dar tutulduğunu.

## Ne değişti

| Dosya                                     | Değişiklik                                                    |
| ----------------------------------------- | -------------------------------------------------------------- |
| `web/src/components/Sidebar.tsx`          | **Yeni** — üç hâlli sidebar (geniş / dar / mobil katman)         |
| `web/src/components/Layout.tsx`           | Üst bar → sidebar + içerik; mobil hamburger ve karartma          |
| `web/src/context/AppDataContext.ts`       | **Yeni** — paylaşılan sunucu durumu sözleşmesi                   |
| `web/src/context/AppDataProvider.tsx`     | **Yeni** — grup listesi + home özeti, tek yerde                  |
| `web/src/hooks/useAppData.ts`             | **Yeni** — `useGroupsData`, `useSummaryData`                     |
| `web/src/hooks/useSidebarCollapsed.ts`    | **Yeni** — daralt/genişlet tercihi (localStorage)                |
| `web/src/utils/groupColor.ts`             | **Yeni** — grup id'sinden türetilen renk                         |
| `web/src/pages/ActivityPage.tsx`          | **Yeni** — `/activity`                                           |
| `web/src/pages/HomePage.tsx`              | Kendi `useAsync`'i yerine paylaşılan özet                        |
| `web/src/pages/GroupsPage.tsx`            | Kendi `useAsync`'i yerine paylaşılan liste                       |
| `web/src/index.css`                       | Aktif satır çizgisi, dar hâldeki isim ipucu                      |
| `web/src/components/sidebar.test.tsx`     | **Yeni** — 23 test                                               |

Sayfaların içeriği değişmedi: Home, Gruplarım, Grup Detay, Ayarlar ve grup oluşturma
modalı aynı. `<main>` hâlâ `max-w-5xl` ve ortalanmış; hiçbir sayfa sidebar'ı bilmiyor.

## Neden dikey eksen

Yatay bar dört hedefte zaten sıkışıyordu: dar ekranda Admin ve Ayarlar nav'dan
çıkarılıp hesap menüsüne gizleniyordu (bkz. eski `Layout.tsx` yorumu). Grup
kısayolları için hiç yer yoktu — yatayda her yeni öğe diğerlerinin yerini alır.
Dikeyde liste uzar, sıkışmaz.

## Paylaşılan sunucu durumu — sidebar bunu zorunlu kıldı

`useAsync`'in kendi dosyasındaki not, kütüphaneye (React Query) geçiş işaretlerinden
birini şöyle tarif ediyordu: *"aynı veriyi iki ayrı ekran okumaya başlayınca"*.
Sidebar tam olarak o anı getirdi:

| Veri                     | Okuyanlar                                       |
| ------------------------ | ----------------------------------------------- |
| `GET /groups`            | Gruplarım sayfası **+** sidebar grup kısayolları |
| `GET /users/me/home-summary` | Home kartları **+** sidebar Aktivite rozeti  |

Her biri kendi `useAsync`'ini kullansaydı iki sonuç doğardı: sayfa başına iki kat
istek, ve daha kötüsü — kullanıcı grup oluşturduğunda sayfadaki liste tazelenir,
**sidebar eski listede kalırdı**.

Çözüm `AppDataProvider`: `ProtectedRoute`'un altında, `Layout`'un dışında. Korunan
alana girildiğinde iki istek bir kez atılıyor; sayfa geçişleri yeni istek üretmiyor
çünkü `Layout` mount'ta kalıyor. Landing ve auth ekranları bu ağacın dışında, yani
oralarda hiçbir şey çekilmiyor.

Kütüphane yerine context: ihtiyaç hâlâ dar (iki uç nokta, tek tüketici ağacı, arka
planda tazeleme yok) ve `AuthProvider` ile aynı deseni tekrar ediyor — projeye ikinci
bir zihinsel model girmiyor. Tüketiciler `data/error/loading/reload` sözleşmesini
görmeye devam ediyor, yani kütüphane kararı geldiğinde değişecek yer yine tek dosya.

**Tazelemenin görünür karşılığı:** `NewGroupModal`'ın `onCreated`'ı hâlâ tek bir
`groups.reload`. Artık o tek çağrı hem sayfayı hem sidebar'ı güncelliyor; ikinci bir
istek, olay yayını ya da elle state kopyalama yok. Testte sabitlendi: grup
oluşturduktan sonra `listGroups` toplam **2** kez çağrılıyor.

Gruptan çıkma akışı bugün yok (ne uç nokta ne arayüz). Eklendiğinde yapılacak tek şey
aynı `reload`u çağırmak.

### Bedeli: testler artık iki uç noktayı da mock'lamak zorunda

Sidebar her korunan sayfada olduğu için `GET /groups` ve `GET /users/me/home-summary`
artık her korunan sayfada tetikleniyor. `admin.test`, `settings.test`,
`groupDetail.test` ve `groups.test` dosyalarına eksik mock'lar eklendi. Mock'lanmasaydı
jsdom gerçek bir istek dener; ayakta bir sunucu varsa sahte token 401 döner, merkezî
401 yönetimi oturumu düşürür ve testler **sonraki dosyaya taşan** biçimde kırmızı
yanardı.

Ayrıca `findBy*` bekleme süresi 1sn → 5sn (`test/setup.ts`). Ağaç ağırlaştı; paralel
koşan dokuz dosyada bazı testler kod bozuk olduğu için değil, makine meşgul olduğu için
düşüyordu. Süre uzatmak yavaş testi gizlemiyor — geçen test yine ilk fırsatta geçiyor.

## Grup rengi: türetiliyor, saklanmıyor

`groups` tablosunda `color` sütunu **yok** (migration 00–12 ve tüm `src/` tarandı).
Renk `utils/groupColor.ts` içinde grup `id`'sinden deterministik olarak üretiliyor:
aynı grup her cihazda, her oturumda aynı rengi alıyor; ne migration ne ek istek
gerekiyor. Sütun ileride eklenirse değişecek tek yer o dosya — sidebar hiç değişmez.

`id` seçildi, `name` değil: ad değiştirilebiliyor ve renk ada bağlı olsaydı ad
değişince renk de değişir, kullanıcının kurduğu eşleşme bozulurdu.

**Palet tek aile.** Altı ton da rose → lilac yayında; sarı, yeşil, mavi yok. İki
gerekçe:

1. Marka kuralı (`index.css`): sıcaklık kanalı rose ailesinden gelir. Rastgele hue'lar
   sidebar'ı bir renk cetveline çevirirdi.
2. Sinyal renkleri (yeşil/kırmızı) **yalnızca anlam taşıyan yerlerde** kullanılıyor —
   bakiye rakamı, rozet. Bir grup noktası yeşil olsaydı yanındaki bakiye yeşiliyle aynı
   dili konuşur ve "bu grup dengede" gibi okunurdu.

Tonlar orta koyulukta: hem cream (#FAF4F2) hem koyu tema zemini (#1A1114) üzerinde
ayırt ediliyorlar, dolayısıyla palet temaya göre değişmiyor. Nokta zaten dekoratif —
bilgiyi yanındaki grup adı taşıyor, renk yalnızca aramayı hızlandırıyor. Kontenjan/üye
sayısı bilerek gösterilmiyor: kısayolun işi ada ve renge bakıp tıklatmak.

## Yükseklik, kaydırma ve blok düzeni

Kap tam olarak `h-screen` (100vh) ve **tek** kaydırma alanı: `overflow-y-auto` yalnızca
`<aside>` üzerinde. İç blokların hiçbirinde kendi `overflow`u yok. Sonuç: içerik sığdığı
sürece hiçbir çubuk görünmüyor, taşarsa **tek** çubuk çıkıyor — iç içe iki kaydırma
alanı değil.

İlk sürümde grup listesi `flex-1 overflow-y-auto` taşıyordu ve kullanıcı bloğu `mt-auto`
ile dibe yapışıktı. İki hatası vardı: (1) az grubu olan kullanıcıda listeyle avatar
arasında kocaman bir boşluk kalıyordu, (2) grup listesi kendi içinde kayabildiği için
sidebar sığdığı hâlde ikinci bir çubuk çıkabiliyordu. Şimdi blokların hiçbiri esnemiyor
ve hiçbiri itilmiyor; kullanıcı menüsü grup listesinin doğal devamı olarak hemen altında
duruyor.

Testte sabitlendi: kabın doğrudan çocuklarında `flex-1`/`mt-auto` yok, kabın içinde
ikinci bir `overflow-y-auto` yok, ve hesap menüsü grup `nav`ının hemen sonraki kardeşinin
içinde. (jsdom ölçü hesaplamadığı için "çubuk göründü mü" ölçülemiyor; ölçülebilen şey
kuralın kendisi.)

### Dar hâlde alttaki yatay çubuk

Dar (ikon-only) hâlde sidebar'ın altında kalıcı bir **yatay** kaydırma çubuğu çıkıyordu.
Sebep dikey taşma değildi: isim ipucu (`.sidebar__tip`) mutlak konumla satırın sağına,
sidebar'ın dışına taşıyordu. CSS'te bir eksen `visible` dışı bir değer alırsa **diğeri de**
`auto`ya döner — yani `overflow-y: auto` yazmak yatay ekseni de kaydırılabilir yapıyor ve
dışarı taşan o balon çubuğu doğuruyordu.

İki adımda kapatıldı:

1. CSS balonu kaldırıldı; ipucu artık yerel `title` özniteliğiyle veriliyor (yalnızca dar
   hâlde — geniş hâlde ad zaten satırda yazıyor). Erişilebilir ad hâlâ `sr-only` metinden
   geliyor, yani hiçbir bilgi kaybı yok.
2. Kaba `overflow-x: clip` eklendi; aynı hatanın tekrarına karşı duruyor. `hidden` değil
   `clip`: `clip` programatik kaydırmayı da kapatır.

Radix menüsü `body`ye portal edildiği için `clip` onu etkilemiyor.

## Daralt/genişlet kontrolü üstte

Kontrol markanın yanında (dar hâlde altında), `sticky top-0` bir başlık bloğunda: liste
uzayıp sidebar kaydığında yerinde kalıyor. İlk sürümde en alttaydı — kullanıcının en çok
kullandığı düğmeyi, grup listesi uzadıkça aşağı kayan bir yere koymak yanlıştı.

## Hesap menüsü: üç ikon değil, tek avatar

Alt blokta önce üç ayrı kontrol vardı (avatar, tema ikonu, çıkış ikonu). Üçü de aynı şey
hakkında — hesap — ve dar hâlde alt alta üç satır demekti. Şimdi tek bir tetikleyici
(avatar; geniş hâlde ad/e-posta ile birlikte) ve shadcn `DropdownMenu`: tema hızlı geçişi
+ çıkış.

`ThemeToggle`'ın View Transitions animasyonu menüye taşınmadı: o efekt tıklanan noktadan
dışarı açılıyor ve menü öğesi tıklanır tıklanmaz kayboluyor — daire yok olan bir öğeden
büyürdü. Menüde düz bir geçiş var; etiketi yine **eylemi** anlatıyor ("Koyu temaya geç").
Üç seçenekli tam kontrol (Açık/Koyu/Sistem) yerinde duruyor: Ayarlar sayfası. İkisi aynı
tercihi yazıyor, `settings.test` bunu doğruluyor.

Testlerde Radix menüsü `pointerdown` ile açılıyor; `click` tek başına yetmiyor.

## Aktif hâl iki kanaldan

Aktif satır hem zemin (`bg-rose/10`) hem sol kenar çizgisi taşıyor. Yalnızca renk
kullanılsaydı renk körlüğü olan kullanıcıda "neredeyim" sorusu cevapsız kalırdı —
projede tekrar eden kural: renk bilgiyi taşımaz, yalnızca hızlandırır.

Çizgi `::before` ile; `border-left` satırın genişliğini değiştirir ve aktif satır bir
piksel kayardı.

## Dar hâl: ad gizleniyor, kaldırılmıyor

İkon-only hâlde etiket `sr-only` ile gizleniyor. Yerine `aria-label` yazmak da olurdu
ama o zaman ad iki yerde tanımlı olur ve biri günün birinde diğerinden ayrışırdı. Bu
hâliyle ekran okuyucu ve klavye kullanıcısı için hiçbir şey değişmiyor; testler de
`getByRole('link', { name: 'Ana Sayfa' })` ile her iki hâlde de çalışıyor.

İsim ipucu yerel `title` özniteliğiyle: erişilebilir ad zaten `sr-only` metinden
geliyor, ipucu yalnızca işaretleme cihazıyla görünen bir kolaylık. Önce CSS balonu
denendi ve alttaki yatay çubuğa yol açtı (yukarıda).

Rozet dar hâlde ikonun üstüne biniyor: satırda yer yok ama bekleyen ödeme sayısı
kaybolmamalı.

## Mobil: tek sidebar, iki kopya değil

Dar ekranda sidebar ekran dışında bekliyor (`-translate-x-full`) ve hamburger ile
üstüne açılıyor. **İkinci bir kopya çizilmiyor.** İki kopya olsaydı aynı bağlantılar
DOM'da iki kez bulunur, ekran okuyucu hepsini iki kez duyurur ve her test sorgusu
"birden fazla eşleşme" hatası verirdi. Testte sabitlendi: `complementary` rolü tam
olarak bir tane.

Katman rota değişince kapanıyor — hem `NavLink`'in `onClick`inde hem `useEffect` ile.
Tek başına `onClick` yetmezdi: sayfa içindeki bir bağlantı ya da geri tuşu da rotayı
değiştirebiliyor ve katman açık kalırdı.

Daralt/genişlet kontrolü mobilde gizli: telefonda ekranın üstüne açılan bir katmanın
ikon-only olmasının kazancı yok, kullanıcı oraya isim okumaya geliyor.

Tercih `localStorage`'da (`evenup.sidebar`) ve `useState` **başlatıcısında** okunuyor,
efektte değil: efektte okunsaydı sayfa bir kare geniş çizilir, sonra daralırdı.

## Aktivite sayfasının kapsamı bilerek dar

Sidebar'daki rozet bir yere gitmeli. Gerçek bir aktivite akışı (kim ne zaman harcama
ekledi, kim ödedi) **gruplar arası** bir uç nokta ister; backend'de böyle bir şey yok.
`GET /users/me/home-summary` yalnızca `pendingSettlementsCount` döndürüyor.

`/activity` bugün tam olarak o sayıyı ve onunla ne yapılacağını gösteriyor, üstünde de
"Yakında" rozetiyle akışın geleceği yazıyor. Alternatifler daha kötüydü: (a) hiçbir yere
gitmeyen bir nav öğesi bırakmak, (b) her grubun harcama akışını tek tek çekip istemcide
birleştirmek — grup sayısı kadar istek ve sayfa açılışında görünür gecikme.

Akış yazıldığında değişecek yer yalnızca `ActivityPage.tsx`; sidebar öğesi ve rozet
olduğu gibi kalır.

## Doğrulama

- `web/src/components/sidebar.test.tsx` — 23 test: dört ana hedef ve Admin'in yalnızca
  admin'de çıkması; aktif sayfanın `aria-current` ile işaretlenmesi; grup kısayollarının
  türetilmiş renkleri ve doğru detaya gitmesi; **listenin bir kez istenmesi** (sidebar
  kendi isteğini atmıyor); grup oluşturunca sidebar'ın tazelenmesi; rozetin aynı özetten
  beslenmesi; daralt/genişletin `localStorage`'da kalıcı olması ve dar hâlde erişilebilir
  adın korunması; mobil katmanın tek kopya olması ve gezinince kapanması; kabın 100vh +
  tek kaydırma alanı olması; blok düzeninde esneme/itme bulunmaması; kontrolün üst blokta
  durması; hesap menüsünün tek tetikleyici olup açılınca tema ve çıkışı vermesi.
- `routes.test.tsx` nav bağlantısı adı `Gruplar` → `Gruplarim` olarak güncellendi;
  `settings.test.tsx` kullanıcı adını artık sidebar'da arıyor.
- `settings.test.tsx` tema hızlı geçişi artık hesap menüsünden tetikleniyor.
- Tüm web paketi: **225 test** geçiyor (iki ardışık koşuda da yeşil).
  `tsc --noEmit`, `oxlint`, `vite build` temiz.
