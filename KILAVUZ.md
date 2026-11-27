# 👻 RageGhost Kullanım Kılavuzu

RageGhost, web uygulamanıza **dünyanın en sabırsız kullanıcısı** gibi saldıran bir test aracıdır. Ödeme butonuna üst üste basar, sayfa yüklenirken geri/ileri yapar, ekranı telefondan masaüstüne sarsar, form alanlarına emoji, çok uzun metin, XSS denemesi yazar. Bu sırada tarayıcıyı izler. Bulduğu her hatayı **ekran görüntülü, adım adım tekrar üretilebilir bir rapora** ve **çalıştırılabilir bir Playwright testine** çevirir.

- Kaynak koda ihtiyaç yok: herhangi bir URL'de çalışır.
- Tamamen lokal: API anahtarı, bulut, internet gerekmez (canlı siteyi test etmek hariç).
- GitHub: https://github.com/Wyclaew/rageghost

---

## 1. Elle yapmanız gerekenler

| Ne | Gerekli mi? | Açıklama |
| --- | --- | --- |
| Node.js 21 veya üstü | Evet | Bu makinede Node 24 kurulu. Başka makinede `node -v` ile kontrol edin. |
| `npm install` | Yeni makinede bir kez | Playwright'ı kurar ve Chromium'u kontrol eder. Bu makinede zaten yapıldı. |
| GitHub push | Hayır | Repo oluşturuldu ve kod gönderildi. Yeni değişiklik yaparsanız `git push` yeterli. |
| İzinler | Hayır | Özel bir macOS izni gerekmez. Tarayıcı Playwright'ın kendi Chromium'udur. |

> İlk kurulum internet ister (Chromium indirme, ~150 MB). Sonrasında demo tamamen internetsiz çalışır. Hackathon'dan **önce** `npm install` yapılmış olsun.

---

## 2. Çalıştırma (tek komut)

```bash
cd "/Users/erne/Desktop/Log to LoFi/rageghost"
```

```bash
npm start
```

Terminalde şunu görürsünüz ve tarayıcı otomatik açılır:

```
  👻  RageGhost hazır
  Dashboard      http://localhost:7400
  Demo (hatalı)  http://localhost:7500
  Demo (düzgün)  http://localhost:7500/?fixed=1
```

- Port doluysa araç otomatik olarak bir sonraki boş portu kullanır (7401, 7501 …) ve doğru adresi yazar.
- Durdurmak için terminalde `Ctrl+C`.
- Tarayıcı açılmasın istiyorsanız: `npm start -- --no-open`.

---

## 3. Dahili hatalı demo uygulamayı test etme (adım adım)

Demo uygulama **Fincan** adlı bir kahve dükkânı. İçine bilerek 10 gerçekçi hata konuldu. Her hatanın düzeltilmiş hali `?fixed=1` adresinde.

1. Dashboard'da **🐞 Demo (hatalı)** düğmesine basın (URL kutusu `http://localhost:7500/` olur).
2. Mod olarak **🌪️ Tam Kaos** seçin.
3. Süre: **45 sn**. Seed alanına **7** yazın (aynı senaryoyu tekrar oynatmak için; boş bırakırsanız rastgele).
4. **👻 Hayaleti Salıver**'e basın.
5. İzleyin:
   - Soldaki pencerede hayalet imleç sayfada dolaşır, tıklarken dalga efekti ve `×3` rozeti çıkar, konuşma balonunda ne yaptığını söyler.
   - Bir hata bulunduğunda sayfada kırmızı/turuncu bir çerçeve ile işaretlenir ve pencere kırmızı yanıp söner.
   - Sağda skor düşer, sorun kartları önem sırasına göre dizilir. Karta tıklayınca açıklama, düzeltme önerisi ve kanıt açılır.
6. Bitince **Rapor hazır** kutusu çıkar:
   - **📄 HTML rapor**: paylaşılabilir tek dosya, ekran görüntüleri içinde.
   - **🧪 Playwright testleri**: her hata için otomatik üretilmiş regresyon testi.
   - **MD / JSON**: issue'ya yapıştırmak veya başka araçlara vermek için.
7. Çift ödemeyi kendi gözünüzle görmek için demo uygulamada **Kasa defteri** sayfasını açın: `http://localhost:7500/#/orders`. Aynı ödemenin birden fazla kez tahsil edildiğini göreceksiniz.
8. Şimdi **✅ Demo (düzeltilmiş)** seçip aynı ayarlarla tekrar çalıştırın. Kritik veya yüksek sorun çıkmaz, skor 85'in üstüne çıkar (bizim koşularımızda 93, A). "Önce / sonra" karşılaştırması budur.

Demo verilerini sıfırlamak için `npm start`'ı yeniden başlatın veya:

```bash
curl -X POST http://localhost:7500/api/reset
```

### Demo'daki kasıtlı hatalar

| # | Hata | Hayaletin bulduğu sorun tipi |
| --- | --- | --- |
| 1 | Öde butonu istek sürerken kilitlenmiyor, sunucuda idempotency yok | Çift gönderim (Kritik) |
| 1b | Sepete ekle hızlı tıklamada birden çok istek | Çift gönderim (Yüksek) |
| 2 | Geri/ileri yapınca `history.state` null, sayfa çöküyor; sepet rozeti `NaN` | JS hatası + Bozuk veri |
| 3 | Promosyon şeridi ve kargo tablosu mobilde taşıyor | Yatay taşma |
| 4 | Adet alanına "abc" yazınca toplam `₺NaN` | Bozuk veri gösterimi |
| 5 | Mobilde "Yardım lazım mı?" balonu butonların üstünü kapatıyor | Üstü kapalı eleman |
| 6 | Arama hata verince global yükleniyor çarkı hiç durmuyor | Takılı spinner |
| 7 | Geçersiz kuponda kod çöküyor | JS hatası |
| 8 | Arama metni `innerHTML` ile basılıyor | XSS (Kritik) |
| 9 | Favori (♡) butonunun hiçbir işlevi yok | Ölü buton |
| 10 | "Fiyat (artan)" sıralaması ana thread'i 1 sn kilitliyor; öneriler 3.4 sn sürüyor; özel karakterli arama 500 | Arayüz donması, yavaş istek, 5xx |

Her koşu rastgelelik içerir. Bizim 45 saniyelik koşularımızda 10 ile 18 arası farklı sorun bulundu. Strateji son haline geldikten sonra denediğimiz 5 koşunun hepsinde kritik çift ödeme yakalandı.

---

## 4. Kendi sitenizi (biyom.co) veya herhangi bir siteyi güvenle test etme

### Hangi modu seçmeliyim?

| Mod | Ne zaman? | Ne yapar? | Ne yapmaz? |
| --- | --- | --- | --- |
| 🛡️ **Güvenli Keşif** | **Canlı siteler (biyom.co)** | Tıklar (normal butonlar, sekmeler, linkler), ekranı sarsar, geri/ileri yapar, alanlara yazar, scroll eder | POST/PUT/PATCH/DELETE isteklerini **ağ seviyesinde engeller**. Öde, satın al, gönder, kaydol, sil, çıkış gibi butonlara **hiç dokunmaz**. Şifre ve kart alanlarına yazmaz. Site dışına çıkmaz. |
| 🌪️ **Tam Kaos** | Lokal, staging, demo | Her şeyi yapar: ödeme butonlarına çoklu tık, Enter spam, form gönderme | Sil/çıkış butonlarına dokunmaz |
| 💥 **Stres / Yıkım** | Sadece lokal | ×8 tık, CPU 4 kat yavaşlatma, Wi-Fi kopması, sil butonları dahil | — |

**Kural:** Canlı bir sitede Kaos veya Stres seçerseniz dashboard bir onay kutusu gösterir. Kutuyu işaretlemeden çalıştırma başlamaz. Canlı sitede veri değiştirebilecek her şey bu onaya bağlıdır.

### biyom.co için adımlar

1. Dashboard'da **🌐 biyom.co** düğmesine basın (mod otomatik Güvenli Keşif olur).
2. Süre: 60–120 sn.
3. **Hayaleti Salıver**.
4. "engellenen" sayacı, güvenli modun durdurduğu yazma isteklerini gösterir. **Ağ & Konsol** sekmesinde hangilerinin engellendiğini görürsünüz.

Terminalden aynı şey:

```bash
node bin/rageghost.js run https://biyom.co --mode safe --duration 90
```

Bizim yaptığımız 25 saniyelik Güvenli Keşif denemesinde biyom.co'da şunlar çıktı:

- Bir React hidrasyon hatası (#418). Aracın etkisini dışlamak için sayfayı overlay olmadan ayrıca açtık; hata yine oluştu. Yani sitenin kendi hatası.
- Bir Content-Security-Policy ihlali (Cloudflare beacon script'i engelleniyor).
- "Kimler için" butonu için bir ölü buton uyarısı. Bunu doğrulamadık. Bu buton yalnızca hover ile menü açıyorsa yanlış pozitif olabilir.

### Güvenli mod notları

- Güvenli modda bir sayfa, engellenen bir istek yüzünden hata verebilir. Böyle hatalar otomatik olarak "Düşük" önemde işaretlenir ve açıklamaya *"Güvenli modun engellediği bir istekten kaynaklanıyor olabilir"* notu eklenir.
- Giriş gerektiren sayfalar desteklenmez. Hayalet sadece herkese açık sayfaları gezer.
- Cloudflare gibi bot korumaları headless tarayıcıyı engelleyebilir. Bu durumda **Gerçek tarayıcı penceresi** kutusunu işaretleyin.

---

## 5. Sorun tipleri: ne anlama geliyor?

| Sorun | Önem | Anlamı | Tipik çözüm |
| --- | --- | --- | --- |
| Çift gönderim / yarış durumu | Kritik (para) / Yüksek | Aynı yazma isteği tek bir sabırsız tık serisinde 2+ kez başarılı oldu | Butonu istek boyunca disable et, `Idempotency-Key`, sunucuda tekilleştir |
| XSS: girilen kod çalıştı | Kritik | Yazılan HTML sayfada çalıştı | `textContent` kullan, sanitize et, CSP |
| Yakalanmamış JavaScript hatası | Yüksek | Sayfa çöktü veya yarım kaldı | null kontrolü, try/catch, hata durumu arayüzü |
| Sunucu hatası (5xx) | Yüksek | Beklenmedik girdi sunucuyu düşürdü | Girdi doğrulama, 400 dönmek |
| Takılı spinner | Yüksek | Yükleniyor göstergesi kaybolmuyor | `finally` ile kapat, zaman aşımı |
| Bozuk veri gösterimi | Yüksek/Orta | Ekranda `NaN`, `undefined`, `[object Object]` | Değer doğrulama, varsayılan değer |
| Yatay taşma | Yüksek/Orta | Mobilde yatay scroll, içerik kesik | `min-width` / `nowrap` kaldır, `max-width: 100%` |
| Üstü kapalı eleman | Yüksek (CTA) / Orta | Yüzen widget bir butonun üstünü kapatıyor | Widget'ı taşı, güvenli boşluk bırak |
| Arayüz donması | Yüksek/Orta | Ana thread ≥ 500 ms kilitli | İşi böl, Web Worker |
| Konsol hatası | Orta | `console.error` çağrıldı | Kaynağında ele al |
| İstemci hatası (4xx) | Orta/Düşük | Kırık API çağrısı veya kaynak | Linki / endpoint'i düzelt |
| Başarısız istek | Orta/Düşük | Bağlantı, DNS veya CORS hatası | Erişilebilirlik, yeniden deneme |
| Yavaş istek | Düşük/Orta | İstek 3 sn'den uzun sürdü | Önbellek, iskelet ekran |
| Ölü buton | Düşük | Tık sonrası DOM, ağ, URL ve scroll değişmedi | İşlev bağla veya disabled göster |
| Beyaz ekran / sekme çökmesi | Yüksek / Kritik | Render çöktü / tarayıcı çöktü | Error boundary, bellek profili |

### Sayaçlar ve skor

- **Dayanıklılık skoru (0–100):** 100'den başlar. Her farklı sorun önemine göre puan düşürür: Kritik −25, Yüksek −12, Orta −5, Düşük −2. Not: A ≥ 90, B ≥ 75, C ≥ 55, D ≥ 30, altı F.
- **aksiyon:** hayaletin yaptığı hamle sayısı (bir öfke tıkı serisi = 1 aksiyon).
- **tık:** toplam fare tıklaması.
- **istek:** sayfanın yaptığı toplam ağ isteği.
- **engellenen:** Güvenli modda durdurulan yazma istekleri.
- **sayfa:** gezilen farklı sayfa/rota sayısı.
- Karttaki **3×** gibi sayı, aynı sorunun kaç kez tekrarlandığını gösterir.

### Rapor dosyaları

Her koşu `reports/<tarih>_<site>_<mod>/` klasörüne yazılır:

- `report.html`: tek dosyalık, paylaşılabilir rapor.
- `rageghost.spec.js`: Playwright testleri. Kendi projenizde çalıştırmak için:
  ```bash
  npm i -D @playwright/test && npx playwright test rageghost.spec.js
  ```
  Hata düzeltilene kadar test kırmızı kalır, düzeltilince yeşile döner. Böylece hata geri gelirse yakalanır.
- `report.md`: GitHub issue'ya yapıştırmak için.
- `report.json`: ham veri.

**Seed:** Raporda yazan seed ile aynı hamle dizisi tekrar oynatılır: `--seed 915838`. Zamanlama farkları yüzünden sonuç birebir aynı olmayabilir, ama hamle sırası aynıdır.

### CI'da kullanmak

```bash
node bin/rageghost.js run http://localhost:3000 --mode chaos --duration 60 --fail-on high
```

Yüksek veya kritik sorun bulunursa çıkış kodu 1 olur ve pipeline kırılır.

---

## 6. Sorun giderme (hackathon sırasında)

| Belirti | Çözüm |
| --- | --- |
| `npm start` "Port … aralığı dolu" diyor | `PORT=8400 DEMO_PORT=8500 npm start` |
| "Tarayıcı başlatılamadı" | `npx playwright install chromium` (internet gerekir) veya Google Chrome kurun. Araç Chrome'u otomatik dener. |
| Canlı görüntü boş kalıyor | Sayfa hiç değişmiyorsa kare gelmez, birkaç saniye bekleyin. Ya da **Gerçek tarayıcı penceresi** kutusunu işaretleyin. |
| Dashboard "Bağlantı koptu" | Sunucu durmuş olabilir. Terminalde `npm start`'ı yeniden çalıştırıp sayfayı yenileyin. |
| "Zaten çalışan bir hayalet var" | **■ Durdur**'a basın, rapor yazılınca yeniden başlatın. |
| Canlı sitede Kaos başlamıyor | Bu bilinçli bir güvenlik önlemi. Onay kutusunu işaretleyin veya Güvenli Keşif'i seçin. |
| Site hiç sorun vermedi | Süreyi artırın (120 sn). Staging ortamında Tam Kaos deneyin. |
| Bot koruması / Cloudflare sayfası | **Gerçek tarayıcı penceresi** kutusunu işaretleyin, Güvenli Keşif kullanın. |
| Demo'da sonuçlar birikti | `curl -X POST http://localhost:7500/api/reset` veya `npm start`'ı yeniden başlatın. |
| Testleri çalıştırmak | `npm test` (birim, ~1 sn), `npm run test:e2e` (gerçek tarayıcı, ~2 dk) |

---

## 7. Proje yapısı

```
bin/rageghost.js        Terminal / CI aracı
scripts/start.js        Tek komutla demo + dashboard
src/engine/             Keşif, strateji, kaos aksiyonları, dedektörler, güvenlik modları
src/engine/inject/      Sayfaya enjekte edilen hayalet overlay ve ölçüm fonksiyonları
src/server/             Dashboard API + canlı yayın (Server-Sent Events)
src/report/             HTML/MD/JSON rapor + Playwright test üretici
public/                 Dashboard arayüzü
demo/                   Hatalı "Fincan" kahve dükkânı (+ ?fixed=1 düzeltilmiş hali)
test/unit, test/e2e     Otomatik testler
```
