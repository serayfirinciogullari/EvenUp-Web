# Home özeti — ilk toplu (aggregate) uç nokta

Bu dosya `GET /users/me/home-summary` için alınan kararları ve gerekçelerini kaydeder.
Kod referansları gerçek dosyalardan.

## Ne eklendi

| Dosya                                                       | Görevi                                              |
| ----------------------------------------------------------- | --------------------------------------------------- |
| `src/services/summary.service.ts`                           | Gruplama + toplama; uçtaki tek karar noktası        |
| `src/models/expense.model.ts` (`listForNettingByGroups`)    | N grubun harcama + payları, **iki** sorguda          |
| `src/models/expense.model.ts` (`sumPaidByUserBetween`)      | Aylık toplam, SQL `SUM` ile                          |
| `src/models/settlement.model.ts` (`listConfirmedByGroups`)  | N grubun onaylı ödemeleri, **tek** sorguda           |
| `src/models/settlement.model.ts` (`countPendingForUser`)    | Kullanıcıyı ilgilendiren bekleyen ödeme sayısı       |
| `src/services/balance.service.ts` (`buildNettingInputs`)    | "Onaylı ödeme = sanal harcama" dönüşümü, ortak       |
| `src/utils/money.ts` (`netAmountToCents`)                   | İşaretli tutar → kuruş, tek kapıda                   |
| `tests/homeSummary.test.ts`                                 | 11 test (supertest)                                  |

| Metot + adres                   | Yetki         | Cevap                |
| ------------------------------- | ------------- | -------------------- |
| `GET /users/me/home-summary`    | `requireAuth` | 200 `{ summary }`    |

```json
{
  "summary": {
    "totalNetBalance": "80.00",
    "monthlySpend": "300.00",
    "activeGroupsCount": 3,
    "pendingSettlementsCount": 2
  }
}
```

## Neden ayrı bir uç — mevcut uçlara eklenmedi

Bu projedeki **ilk toplu uç**. Şimdiye kadarki her şey tek bir grubun içindeydi:
`/groups/:id/expenses`, `/groups/:id/balances`, `/groups/:id/settlements`. Home ekranı ters
yönde bakıyor: "bu kullanıcının **tüm** grupları birlikte ne durumda?"

Üç seçenek değerlendirildi.

**A — `GET /groups`'a özet alanları eklemek.** Liste zaten dönüyor, üstüne toplam bakiye
konabilirdi. Reddedildi: o uç bir **liste**, cevabı sayfalanabilir olmalı. Toplam ise
sayfadan bağımsız — ikinci sayfada "toplam bakiye" ne anlama gelir? Ya her sayfada aynı
toplamı tekrar hesaplarsın (istemci hangi sayfadakine güveneceğini bilemez), ya da toplamı
yalnızca ilk sayfada dönersin (cevabın şekli sayfaya göre değişir). İkisi de sözleşmeyi
bulanıklaştırıyor.

**B — `GET /groups/:id/balances`'a `all` gibi bir mod eklemek.** Reddedildi, iki sebeple.
Birincisi adres yalan söylerdi: `:id` yerine `all` yazmak, yol parametresini bir ID olmaktan
çıkarıp bir enum'a çevirir. İkincisi ve asıl olanı — o uç **üyelik kontrolü** arkasında
(`requireMembership`), ve o kontrolün girdisi tek bir `groupId`. "Tüm gruplar" modunda o
kontrol ne yapacaktı? Ya atlanacaktı (yetki kontrolünü bir parametreye bağlamak, 1.4'te
bilerek kaçınılan şey), ya da anlamı değişecekti. Yetki kararı parametreye bağlanmamalı.

**C — Ayrı uç (seçilen).** `/users/me/home-summary`. Adres kaynağı doğru söylüyor: bu veri
hiçbir gruba ait değil, **kullanıcıya** ait. `/users/me` altında olması bir bonus daha
getiriyor — hedef her zaman token'daki kullanıcı, adreste ID yok. Özet kullanıcının bütün
gruplarının mali durumunu kapsadığı için bu önemli: tek bir ID parametresi, kabul edilemez
bir IDOR yüzeyi olurdu (`user.controller.ts`).

Karşı maliyeti kabul edildi: Home açılışı ekstra bir istek atıyor. Alternatifi, mevcut iki
ucu da "bazen özet de döner" hale getirmekti — iki sözleşmeyi birden bulanıklaştırıp
karşılığında bir gidiş-dönüş kazanmak iyi bir takas değil.

## N+1 nasıl önlendi

Doğrudan yazım şöyle olurdu:

```ts
const groups = await groupModel.listForUser(userId);
for (const group of groups) {
  const { expenses, shares } = await expenseModel.listForNetting(group.id); // 2 sorgu
  const confirmed = await settlementModel.listConfirmed(group.id);          // 1 sorgu
  // ...
}
```

10 gruplu bir kullanıcıda **her Home açılışında 30 gidiş-dönüş**. Grup sayısı arttıkça
doğrusal büyür ve en kötü hâli en aktif kullanıcıya denk gelir.

Bunun yerine önce üyelikler tek sorguda okunuyor, sonra ilgili satırlar `WHERE group_id IN
(...)` ile toplu çekiliyor, gruplama **bellekte** yapılıyor:

```
1. group_members ⋈ groups           -> kullanıcının grupları     (listForUser)
2. expenses      WHERE group_id IN  -> tüm grupların harcamaları (listForNettingByGroups)
3. expense_shares WHERE expense_id IN -> o harcamaların payları           "
4. settlements   WHERE group_id IN  -> onaylı ödemeler          (listConfirmedByGroups)
5. expenses      SUM WHERE paid_by  -> aylık toplam             (sumPaidByUserBetween)
6. settlements   COUNT WHERE ...    -> bekleyen sayısı          (countPendingForUser)
```

**Sorgu sayısı grup sayısından bağımsız: 6.** 2–5 birbirinden bağımsız olduğu için
`Promise.all` ile paralel gidiyor. Aynı ilke 1.5'teki `attachShares`'te de var — paylar
harcama başına değil, sayfa başına tek ek sorguyla çekiliyor.

Bellekteki gruplama iki geçişte: `expense_id -> group_id` eşlemesi kuruluyor, sonra paylar
o eşleme üzerinden kovalara dağıtılıyor. Pay satırında `group_id` yok ve olması da gerekmiyor
— bir pay zaten tek bir harcamaya bağlı, harcama da tek bir gruba. Her grup için listeyi
baştan filtrelemek (`confirmed.filter(...)` gibi) sorgu sayısını düşürüp aynı maliyeti
belleğe taşımak olurdu; onun yerine tek geçişte kova.

Bu kural teste bağlandı (`tests/homeSummary.test.ts`): üç gruplu senaryoda her model
fonksiyonunun **tam bir kez** çağrıldığı doğrulanıyor. Biri döngüye alınırsa test kırmızı yanar.

### Ne zaman yetmez

`WHERE group_id IN (...)` listesi büyüdükçe planner bir noktada seq scan'e döner ve bütün
harcamalar belleğe gelir. Kullanıcı başına grup sayısı düşük olduğu için (onlarca, binlerce
değil) bugün sorun değil. Sınıra yaklaşılırsa doğru cevap daha fazla sorgu değil,
**materialized** bir özet tablosu ya da bu ucun önbelleklenmesi olur — ikisi de `summary.service`
sınırının arkasında kalır, uç sözleşmesi değişmez.

## Grup başına ayrı netleştirme — neden tek seferde değil

Bütün grupların harcamalarını tek listeye atıp `calculateNetBalances`'ı bir kez çağırmak
daha kısa olurdu. Yapılmadı: **netleştirme kişiler arası mahsuplaşmadır ve gruplar arasında
mahsuplaşma diye bir şey yoktur.**

A grubunda Ali'ye 100 TL borçlu olmak, B grubunda Ali'nin bana 100 TL borçlu olmasıyla
kapanmaz — ikisi ayrı hesap, ayrı insanlarla paylaşılan ayrı defterler. Tek listede
hesaplasaydık iki grubun payları birbirine karışırdı.

Kullanıcının kendi net toplamı bu özel durumda aynı çıkar (toplama sırası sonucu değiştirmez),
ama doğru olan grup sınırına saygı duymak: bugün yalnızca toplam isteniyor, yarın "hangi
grupta ne kadar" istendiğinde veri zaten doğru şekilde ayrılmış olacak.

## Para

Toplama tam sayı **kuruş** üzerinden; hiçbir yerde float toplanmıyor (1.5/1.6'daki kural).
İki ayrı yol var ve ikisi de `utils/money.ts`'ten geçiyor:

- **totalNetBalance** — her grubun net bakiyesi `netAmountToCents` ile kuruşa çevrilip
  `totalCents` üzerinde toplanıyor, en sonda bir kez `formatCents`. `parseAmountToCents`
  kullanılamıyor çünkü o fonksiyon kullanıcı girdisi için ve deseni **eksi işareti kabul
  etmiyor** — net bakiye ise tanımı gereği negatif olabilir. Ayrı bir kapı olmasının sebebi bu.
- **monthlySpend** — toplam SQL'de alınıyor (`SUM(amount)`). PostgreSQL'in NUMERIC toplamı
  tam ondalık; satırları çekip JS'te toplamak float dünyasına girmek olurdu.

Dışarı çıkan tutarlar NUMERIC ile aynı biçimde **metin** (`"80.00"`), sayı değil — projedeki
her para alanında olduğu gibi. Sayaçlar (`activeGroupsCount`, `pendingSettlementsCount`) sayı.

### Alan adları camelCase — bilinçli bir tutarsızlık

Projedeki diğer cevaplar snake_case (`net_balance`, `member_count`, `expense_count`), çünkü
onlar DB satırlarının şeklini taşıyor. Bu uç hiçbir tabloyu yansıtmıyor; alan adları görevde
camelCase olarak verildi ve öyle bırakıldı. Tutarlılık uğruna snake_case'e çevrilmesi
tercih edilirse tek dokunulacak yer `HomeSummary` arayüzü — hesap mantığı etkilenmez.

## "Bu ay" ne demek

Aralık `[ayın 1'i 00:00, sonraki ayın 1'i 00:00)`. Üst sınır **dışarıda**: ay sonunu "ayın son
günü ≤" diye yazmak, o günün 00:00'dan sonraki kayıtlarını sessizce dışarıda bırakırdı.

Sınırlar **sunucunun yerel saatine** göre üretiliyor (`created_at` timestamptz). Kullanıcı
başka bir saat diliminde ise ay başındaki birkaç saatlik kayma "bu ay" tanımını kaydırabilir.
Bilinçli sadelik: istemciden saat dilimi almak ucu parametreli hâle getirir ve özeti
**önbelleklenemez** kılardı. Gerçekten gerekirse doğru çözüm saat dilimini profilde tutmak —
o zaman da tek yerde, `currentMonthRange`'de değişir.

`monthlySpend` üyelikle **sınırlanmıyor**: kullanıcının bu ay ödediği her harcama sayılıyor,
sonradan ayrıldığı bir gruptaki dahil. Soru "bu ay ne kadar ödedin", "şu an üye olduğun
gruplarda ne kadar ödedin" değil. (Silinmiş harcama ve silinmiş grup yine de hariç — `aliveExpenses`.)

## Boş durumlar

Hiç grubu olmayan kullanıcı hata almaz, tüm alanlar `0` döner. Grup listesi boşken toplu
sorgular **hiç atılmıyor**: `WHERE ... IN ()` zaten hiçbir şey döndürmez, gidip sormanın
anlamı yok (`listForNettingByGroups`, `listConfirmedByGroups` içindeki erken çıkış).

Üyesi olunan ama hiç harcaması olmayan bir grup toplamı bozmaz: `calculateNetBalances`
hiçbir harcaması/payı olmayan kullanıcıyı listeye hiç koymaz, o grup 0 olarak geçilir.

## Bakiyeye ne giriyor

1.7'nin kuralı burada da aynen geçerli: yalnızca **`confirmed`** ödemeler bakiyeyi değiştirir.
`listConfirmedByGroups` bunu bir iş kuralı olarak taşıyor, parametre olarak değil.

`pendingSettlementsCount` bakiyeden tamamen bağımsız bir sayaç — Home'da "bekleyen X ödemen
var" uyarısı için. Kullanıcıyı ilgilendiren derken hem `from_user` hem `to_user` sayılıyor:
biri "başlattığın", diğeri "onayını beklediğim" ödeme. İkisi de kullanıcının görmesi gereken
bir iş.

## Tekrar eden kodun tek kopyaya indirilmesi

"Onaylanmış ödeme = sanal harcama" dönüşümü (1.7) hem `getGroupBalances`'ta hem burada
gerekiyordu. Kopyalanmadı; `balance.service.buildNettingInputs` olarak dışa açılıp iki yerden
çağrılıyor. Gerekçe: iki kopya bırakılsaydı 1.7'nin semantiği bir gün değiştiğinde biri
sessizce eskirdi — ve eskiyen kopyanın belirtisi "bakiye yanlış" olurdu, yani en geç fark
edilen hata türü.

## Testler

`tests/homeSummary.test.ts` — 11 test. Üç model mock'lanıp yerine bellek içi tablolar konuyor;
routing, `requireAuth`, gruplama/toplama mantığı, 1.6'daki netleştirme ve para dönüşümleri
gerçek kod olarak çalışıyor.

Ana senaryo — üç grupta üye olan bir kullanıcı:

| Grup            | Durum                                                  | Net       |
| --------------- | ------------------------------------------------------ | --------- |
| `GROUP_CREDIT`  | Ben 300 ödedim, üçe eşit bölündü                       | `+200.00` |
| `GROUP_DEBT`    | Ali 240 ödedi, ikimize bölündü                         | `-120.00` |
| `GROUP_SETTLED` | Ben 100 ödedim (+50), Ali 50'yi ödedi ve onaylandı     | `   0.00` |
| **Toplam**      |                                                        | `+80.00`  |

Ayrıca: hiç grubu olmayan kullanıcı (tüm alanlar 0), yalnızca borçlu kullanıcı (negatif
toplam dönebiliyor), aylık toplamın ay ve `paid_by` sınırları, onaylı ödemenin bakiyeyi
kapatması, ve **sorgu sayısının grup sayısından bağımsız olduğu**.
