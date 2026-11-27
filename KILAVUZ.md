# Stampede kullanım kılavuzu

Stampede, web uygulamanızı **aynı anda dört farklı sabırsız kullanıcıyla** test eder. Her kullanıcı ayrı bir tarayıcı sekmesinde çalışır, sayfayı kendisi keşfeder ve kendi tarzında saldırır. Bu sırada Stampede tarayıcıyı izler ve kırılan her şeyi üç şeye çevirir:

- ekran görüntülü bir rapor,
- hatadan hemen önceki anları gösteren bir "film şeridi",
- hatayı birebir tekrar eden, çalıştırılabilir bir Playwright testi.

Kaynak koda, API anahtarına veya buluta ihtiyaç yok. Her şey sizin bilgisayarınızda çalışır.

GitHub: https://github.com/Wyclaew/rageghost (isim değişikliği için bkz. bölüm 8)

---

## 1. Elle yapmanız gerekenler

| Ne | Gerekli mi? | Açıklama |
| --- | --- | --- |
| Node.js 21+ | Evet | Bu makinede Node 24 kurulu. Başka makinede `node -v` ile kontrol edin. |
| `npm install` | Yeni makinede bir kez | Playwright, Chromium ve fontları kurar. Bu makinede yapıldı. İnternet ister. |
| Kök klasör adı | İsteğe bağlı | Klasör hâlâ `rageghost`. Değiştirmek için bölüm 8'e bakın. |
| İzinler | Hayır | Özel bir macOS izni gerekmez. |

> Hackathon'dan **önce** `npm install` yapılmış olsun. Sonrasında demo tamamen internetsiz çalışır.

---

## 2. Çalıştırma

```bash
cd "/Users/erne/Desktop/Log to LoFi/rageghost"
```

```bash
npm start
```

Tarayıcı kendiliğinden açılır:

```
  Stampede hazır
  Dashboard      http://localhost:7400
  Demo (hatalı)  http://localhost:7500
  Demo (düzgün)  http://localhost:7500/?fixed=1
```

- Port doluysa araç otomatik olarak bir sonraki boş portu kullanır ve terminale doğru adresi yazar.
- Durdurmak için `Ctrl+C`. Tarayıcı açılmasın derseniz: `npm start -- --no-open`.

---

## 3. Ekranı okumak

Dashboard üç sütundan oluşur.

**Sol: Görev**

- **Hedef adres:** "Demo · hatalı", "Demo · düzeltilmiş" ve "biyom.co" kısayolları.
- **Mod:** Güvenli keşif, Tam kaos veya Stres (bölüm 5).
- **Sürü:** hangi ajanların çalışacağını seçersiniz.
- **Test kimliği:** giriş/kayıt formlarına yazılacak e-posta ve şifre.
- **Süre ve seed.**

**Orta: Sürü ve karar grafiği**

- Her ajanın sekmesi canlı akar. Ajanların imleci kendi renginde bir ok ve kod etiketiyle görünür (A1 RAGE, A2 KEYS, A3 TOUCH, A4 SNOOP).
- Ajan sayfaya her baktığında tıklamayı düşündüğü elemanların etrafında ince çerçeveler ve **olasılık yüzdeleri** belirir. Kalın olan seçilen hedeftir.
- Bulunan hata sayfada kırmızı çerçeve ve etiketle işaretlenir.
- Bir karoya tıklamak o ajanı seçer. Sağ üstteki büyüt düğmesi o ajanı büyük gösterir.
- **Karar grafiği** seçili ajanın beynidir ve üç sütundan oluşur:
  - **Gördüğü bölgeler:** giriş/kayıt, sepet/ödeme, arama/filtre, form, navigasyon, içerik.
  - **Tarttığı hamleler:** ağırlıklı adaylar ve yüzdeleri.
  - **Sonuç:** sayfa tepki verdi, ağ isteği gitti, sorun bulundu ya da tepki yok.

  Seçilen hamle ajan renginde bir sinyalle akar, sonucu sağ sütunda yanar.

**Sağ: Dayanıklılık**

- Genel skor (0–100) ve skor geçmişi çizgisi.
- Önem sayaçları: Kritik ◆, Yüksek ▲, Orta ●, Düşük □. Renk körleri için şekil de var.
- **Kategori karnesi:** Yarış durumu, Hata dayanıklılığı, Mobil & yerleşim, Güvenlik & veri, Performans, Klavye & etkileşim.
- Sekmeler:
  - **Sorunlar:** önem sırasına göre. Karta tıklayınca anlamı, çözümü ve kanıtı açılır.
  - **Hamleler:** tüm ajanların hamle akışı.
  - **Ağ ve konsol:** 5xx, engellenen istekler, JS hataları.

Koşu bitince **Rapor** kutusu çıkar: HTML rapor, Playwright testleri (`stampede.spec.ts`), Markdown ve JSON.

---

## 4. Ajanlar (personalar)

| Kod | Ajan | Ekran | Ne yapar | Tipik bulduğu |
| --- | --- | --- | --- | --- |
| A1 | Öfkeli müşteri | 1280×800 | Ödeme ve gönder butonlarına 2–8 kez basar, geri/ileri spamlar, F5'e basar. Tıklamadan hemen önce ekranı 375 px'e daraltır. Öderken interneti koparıp 3 kez daha basar. Aynı sayfayı ikinci sekmede açıp iki yerden öder. | Çift ödeme, yarış durumu, taşma |
| A2 | Klavye kullanıcısı | 1280×800 | Fareye hiç dokunmaz. Tab ile gezer, Enter/Space ile tetikler, ESC spamlar. | Görünmeyen odak, klavyeyle açılamayan kontroller, ölü butonlar |
| A3 | Mobil kullanıcı | 390×844, dokunmatik | Parmakla basar, telefonu yan çevirir, sekmeyi arka plana atıp uyandırır, hızlı kaydırır. | Mobil taşma, üstü kapalı butonlar, CLS |
| A4 | Meraklı saldırgan | 1280×800 | URL'deki numaraları değiştirir (`/siparis/104` yerine 105, 0, -1). Gizli form alanlarını ve tarayıcı hafızasını bozar. Formlara XSS/SQL denemeleri yazar. | XSS, hassas veri sızıntısı, bozuk hafızada çökme |

Her ajan kendi tarayıcı bağlamında (ayrı çerez/oturum) çalışır. Tek ajan seçmek daha hafiftir; dördü birden en etkileyici görüntüyü verir.

### Otomatik giriş (test kimliği)

- Bir ajan sayfada şifre alanı olan bir giriş veya kayıt formu görürse önce onu dener.
- Formu test kimliğiyle doldurur. Kayıt formlarında her denemede `adres+a1-1@…` gibi yeni bir e-posta kullanır. Öfkeli müşteri gönder butonuna 2–3 kez basar.
- Kimlik şu sırayla belirlenir:
  1. Dashboard'daki e-posta/şifre alanları
  2. `.env` veya ortam değişkenleri: `STAMPEDE_EMAIL`, `STAMPEDE_PASSWORD`
  3. İkisi de yoksa otomatik üretilen `stampede+<seed>@example.test` ve rastgele bir şifre
- **Google, Apple, GitHub, Microsoft, Facebook, SSO ve "… ile giriş / ile devam" butonlarına hiçbir modda basılmaz.** Bu adreslere giden bağlantılar da ağ katmanında engellenir.
- Şifre raporda, JSON'da ve ağ kayıtlarında `••••••` olarak maskelenir. Üretilen Playwright testi şifreyi `process.env.STAMPEDE_PASSWORD` ile okur.
- Güvenli keşif modunda form doldurulur ama **gönderilmez**.

---

## 5. Modlar: hangi siteye hangisi?

| Mod | Ne zaman | Ne yapar | Ne yapmaz |
| --- | --- | --- | --- |
| **Güvenli keşif** | Canlı siteler (biyom.co) | Tıklar, gezer, yazar, ekranı sarsar, geri/ileri yapar, hafızayı bozar (yalnız kendi sekmesinde) | POST/PUT/PATCH/DELETE isteklerini **ağ seviyesinde engeller**. Öde/satın al/gönder/kaydol/sil/çıkış butonlarına dokunmaz. Formları göndermez. Site dışına çıkmaz. |
| **Tam kaos** | Lokal, staging, demo | Her şey: ödeme butonlarına çoklu tık, gerçek giriş/kayıt, Enter spam, bağlantı kesme, ikinci sekme | Sil/çıkış butonlarına basmaz |
| **Stres** | Sadece lokal | ×8 tık, CPU 4 kat yavaş, yavaş 3G, Wi-Fi kopması, **API yanıtlarını yolda bozma** (null, boş, yarım JSON, 2000 elemanlı liste), sil butonları dahil | — |

Canlı bir sitede Tam kaos veya Stres seçerseniz bir onay kutusu çıkar. Kutuyu işaretlemeden çalıştırma başlamaz.

### biyom.co (veya herhangi bir canlı site) adım adım

1. Dashboard'da **biyom.co** kısayoluna basın. Mod otomatik olarak Güvenli keşif olur.
2. Dört ajanı seçili bırakın. Süre 60–120 sn olsun.
3. **Sürüyü başlat**.
4. "engellenen" sayacı, güvenli modun durdurduğu yazma isteklerini gösterir. Ayrıntısı **Ağ ve konsol** sekmesinde.

Terminalden aynı şey:

```bash
node bin/stampede.js run https://biyom.co --mode safe --personas all --duration 90
```

Güncel sürümle biyom.co'da 25 saniyelik bir Güvenli keşif yaptık. Sonuç:

- 399 istek gitti, bunların arasında yazma isteği yok.
- Bir **React hidrasyon hatası (#418)** bulundu. Overlay olmadan ayrıca açıp doğruladık; sitenin kendi hatası.
- Bir **CSP ihlali** bulundu: Cloudflare beacon script'i engelleniyor.
- Aynı koşuda bir modalın arka planı ve "Kopyala" butonu yanlış alarm verdi. Bu iki yanlış pozitif sınıfını hemen düzelttik. Düzeltmeden sonra biyom.co'yu tekrar taramadık.

### Canlı site notları

- Güvenli modda bazı sayfalar engellenen bir istek yüzünden hata verebilir. Böyle hatalar otomatik "Düşük" önemde gelir ve açıklamada bunu belirtir.
- Cloudflare gibi bot korumaları headless tarayıcıyı durdurursa **Tarayıcı pencerelerini de göster** kutusunu işaretleyin.

---

## 6. Dahili hatalı demo ("Fincan" kahve dükkânı)

1. **Demo · hatalı**, **Tam kaos**, dört ajan, 45 sn, seed **11** → **Sürüyü başlat**.
2. Koşu bitince demo sitesinde **Kasa defteri** (`/#/orders`) sayfasını açın. Aynı ödemenin birden fazla kez tahsil edildiğini görürsünüz.
3. **Demo · düzeltilmiş** ile aynı ayarları tekrar çalıştırın. Kritik ve yüksek sorun çıkmaz; bunu otomatik test de doğruluyor.

Demo verisini sıfırlamak için:

```bash
curl -X POST http://localhost:7500/api/reset
```

| # | Kasıtlı hata | Yakalayan | Sorun tipi |
| --- | --- | --- | --- |
| 1 | Öde butonu istek sürerken kilitlenmiyor, idempotency yok | A1 | Çift gönderim (Kritik) |
| 2 | Sepete ekle çoklu istek | A1, A3 | Çift gönderim |
| 3 | Geri/ileri sonrası `history.state` null; rozet `NaN` | A1, A4 | JS hatası, bozuk veri |
| 4 | Promosyon şeridi ve kargo tablosu mobilde taşıyor | A1, A3 | Yatay taşma |
| 5 | Adet alanına "abc" → `₺NaN` | A1, A3 | Bozuk veri |
| 6 | Mobilde "Canlı destek" butonları kapatıyor | A3 | Üstü kapalı eleman |
| 7 | Arama hatasında global çark hiç durmuyor; özel karakter 500 | hepsi | Takılı spinner, 5xx |
| 8 | Geçersiz kuponda kod çöküyor | A1, A3 | JS hatası |
| 9 | Arama metni `innerHTML` ile basılıyor | A4 | XSS (Kritik) |
| 10 | Favori butonu işlevsiz; sıralama 1 sn kilitliyor; öneriler 3.4 sn | A1, A2 | Ölü buton, donma, yavaş istek |
| 11 | Giriş denemesi şifreyle birlikte konsola yazılıyor; API `passwordHash` dönüyor | A1, A3, A4 | Hassas veri sızıntısı |
| 12 | Oturum çerezi HttpOnly değil | hepsi | Güvensiz çerez |
| 13 | "Hesap oluştur" çift tıkta iki hesap açıyor | A1 | Çift gönderim |
| 14 | Odak çerçevesi tamamen gizlenmiş | A2 | Görünmeyen odak |
| 15 | Ürün görseli tıklanıyor ama klavyeyle açılamıyor | A2 | Klavyeyle ulaşılamayan kontrol |

Bizim 30–45 saniyelik 4 ajanlı koşularımızda 22–27 farklı sorun bulundu. Kritik çift ödeme denediğimiz her koşuda yakalandı.

---

## 7. Sorun tipleri ve sayaçlar

| Sorun | Önem | Anlamı | Tipik çözüm |
| --- | --- | --- | --- |
| Çift gönderim / yarış durumu | Kritik (para) / Yüksek | Tek bir sabırsız tık serisinde aynı yazma isteği 2+ kez işlendi ve sunucu her seferinde farklı yanıt verdi. Aynı yanıtı tekrar veren (idempotent) sunucu sorun sayılmaz. | Butonu kilitle, Idempotency-Key, sunucuda tekilleştir |
| XSS | Kritik | Yazılan HTML sayfada kod olarak çalıştı | `textContent`, sanitize, CSP |
| Hassas veri sızıntısı | Yüksek | Şifre/token konsola düştü veya API şifre hash'i gibi alanlar döndü | Loglamayın, yanıtı beyaz listeyle daraltın |
| Yakalanmamış JS hatası | Yüksek | Sayfa çöktü | null kontrolü, try/catch |
| Bozuk API yanıtına dayanıksız arayüz | Yüksek | Stres modunda bozulan yanıtla arayüz çöktü | Şema doğrulama, varsayılan değer |
| Sunucu hatası (5xx) | Yüksek | Beklenmedik girdi sunucuyu düşürdü | Girdi doğrulama, 400 dönmek |
| Takılı spinner | Yüksek | Yükleniyor göstergesi kaybolmuyor | `finally` ile kapat |
| Bozuk veri gösterimi | Yüksek/Orta | Ekranda `NaN`, `undefined` | Değer doğrulama |
| Yatay taşma | Yüksek/Orta | Mobilde yatay scroll | `min-width`/`nowrap` kaldır |
| Üstü kapalı eleman | Yüksek/Orta | Yüzen widget butonu kapatıyor | Widget'ı taşı |
| Beklenmedik yer kayması (CLS) | Yüksek/Orta | İçerik kullanıcı bir şey yapmadan kaydı | Geç yüklenen bloklara yer ayır |
| Arayüz donması | Yüksek/Orta | Ana thread ≥ 500 ms kilitli | İşi böl, Web Worker |
| DOM sızıntısı | Orta | Aynı ekranda eleman sayısı hep artıyor | Eski elemanları temizle |
| Görünmeyen klavye odağı | Orta | Tab ile gelinen elemanda çerçeve yok | `:focus-visible` stili |
| Klavyeyle ulaşılamayan kontrol | Orta | `cursor:pointer` olan bir div Tab ile odaklanamıyor | `<button>` veya `role` + `tabindex` |
| Güvensiz çerez | Orta/Düşük | Oturum çerezi HttpOnly/Secure/SameSite değil | Çerez bayraklarını ekle |
| Konsol hatası, 4xx, başarısız istek | Orta/Düşük | Uygulama hata bildirdi | Kaynağında ele al |
| Yavaş istek | Düşük/Orta | İstek 3 sn'den uzun sürdü | Önbellek, iskelet ekran |
| Ölü buton | Düşük | Tıklama sonrası hiçbir şey değişmedi. Kopyala/paylaş/indir hariç tutulur. | İşlev bağla veya disabled göster |

Formun hatalı girdiye 400/409/422/429 dönmesi **doğru davranıştır**, sorun sayılmaz.

### Skorlar

- **Dayanıklılık (0–100):** 100'den başlar. Her farklı sorun önemine göre puan düşürür: Kritik −25, Yüksek −12, Orta −5, Düşük −2. Notlar: A ≥ 90, B ≥ 75, C ≥ 55, D ≥ 30, altı F.
- **Kategori karnesi:** her kategori kendi sorunlarıyla 100'den düşer.
- **Sayaçlar:**
  - hamle: bir öfke tıkı serisi 1 hamle sayılır
  - tık: toplam tıklama
  - istek: tüm ağ istekleri
  - engellenen: güvenli modda durdurulan yazma istekleri
  - sayfa: gezilen farklı sayfa/rota sayısı
- Karttaki `7×`, aynı sorunun kaç kez tekrarlandığıdır.

### Rapor dosyaları

Her koşu `reports/<tarih>_<site>_<mod>/` klasörüne yazılır:

- `report.html`: tek dosya, internetsiz açılır. İçinde fontlar, karne, ajan tablosu ve her hata için film şeridi var. Film şeridi üç kareden oluşur: ~2 sn önce, kırmızı nişanla tık anı, hata anı. Altında adımlar, çözüm ve test bulunur.
- `stampede.spec.ts`: her hata için bir Playwright testi. Kendi projenizde çalıştırmak için:
  ```bash
  npm i -D @playwright/test && npx playwright test stampede.spec.ts
  ```
  Hata düzeltilene kadar test kırmızı kalır, düzeltilince yeşile döner.
- `report.md` (GitHub issue'ya yapıştırmak için) ve `report.json` (ham veri).

**Seed:** aynı seed ve ajanlarla aynı hamle sırası tekrar oynatılır. Ağ zamanlaması yüzünden sonuçlar birebir aynı olmayabilir.

### CI kapısı

```bash
node bin/stampede.js run http://localhost:3000 --mode chaos --personas all --duration 60 --fail-on high
```

Yüksek veya kritik bir sorun bulunursa çıkış kodu 1 olur ve pipeline kırılır.

---

## 8. Kök klasörü ve repoyu yeniden adlandırma

Kod içinde her şey "Stampede". Kök klasörün ve GitHub reposunun adı hâlâ `rageghost`. Değiştirmek için önce sunucuyu durdurun (`Ctrl+C`), sonra:

```bash
cd "/Users/erne/Desktop/Log to LoFi" && mv rageghost stampede
```

```bash
cd "/Users/erne/Desktop/Log to LoFi/stampede" && gh repo rename stampede --yes
```

İkinci komut GitHub'daki repoyu yeniden adlandırır ve yerel `origin` adresini günceller. Eski adres GitHub tarafından yönlendirilir.

---

## 9. Sorun giderme

| Belirti | Çözüm |
| --- | --- |
| "Port … aralığı dolu" | `PORT=8400 DEMO_PORT=8500 npm start` |
| "Tarayıcı başlatılamadı" | `npx playwright install chromium` (internet ister) veya Google Chrome kurun. Araç Chrome'u otomatik dener. |
| Karolar boş kalıyor | Sayfa değişmedikçe kare gelmez, birkaç saniye bekleyin. Ya da **Tarayıcı pencerelerini de göster** kutusunu işaretleyin. |
| Bilgisayar yavaşladı | Daha az ajan seçin (2 ajan yeterince etkileyici) veya Stres yerine Tam kaos kullanın. |
| "Zaten çalışan bir sürü var" | **Durdur**'a basın, rapor yazılınca yeniden başlatın. |
| Canlı sitede Kaos başlamıyor | Bilinçli bir güvenlik önlemi. Onay kutusunu işaretleyin ya da Güvenli keşif'i seçin. |
| Giriş formu doldurulmadı | Sayfada görünür bir şifre alanı olmalı. Güvenli modda form doldurulur ama gönderilmez. |
| Bot koruması | **Tarayıcı pencerelerini de göster**, Güvenli keşif. |
| Demo sonuçları birikti | `curl -X POST http://localhost:7500/api/reset` veya `npm start`'ı yeniden başlatın. |
| Testler | `npm test` (36 birim test, ~1 sn), `npm run test:e2e` (5 uçtan uca koşu, ~3 dk) |

---

## 10. Proje yapısı

```
bin/stampede.js         Terminal / CI aracı
scripts/start.js        Tek komutla demo + dashboard
src/engine/             Sürü: session, agent, strategy, personas, actions, detectors, safety
src/engine/inject/      Sayfaya enjekte edilen ajan katmanı ve ölçüm fonksiyonları
src/server/             API, Server-Sent Events, ajan başına MJPEG canlı görüntü
src/report/             HTML/MD/JSON rapor + Playwright TypeScript test üretici
public/                 Dashboard (karar grafiği: public/brain.js)
demo/                   Hatalı "Fincan" kahve dükkânı (+ ?fixed=1)
test/unit, test/e2e     Otomatik testler
```
