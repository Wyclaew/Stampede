# Stampede kullanım kılavuzu

Stampede, web uygulamanızı **aynı anda en fazla 8 sabırsız kullanıcıyla** test eder. 7 farklı kullanıcı tipi var; her tipten 1–3 kopya seçebilirsiniz. Her kullanıcı ayrı bir tarayıcı sekmesinde çalışır, sayfayı kendisi keşfeder ve kendi tarzında saldırır. Stampede bu sırada tarayıcıyı izler ve kırılan her şeyi üç çıktıya çevirir:

- ekran görüntülü bir rapor,
- hatadan hemen önceki anları gösteren bir "film şeridi",
- hatayı birebir tekrar eden, çalıştırılabilir bir Playwright testi.

Kaynak koda veya buluta ihtiyaç yok, her şey sizin bilgisayarınızda çalışır. İsterseniz Gemini ile AI özellikleri açılır (bölüm 4b).

GitHub: https://github.com/Wyclaew/rageghost (isim değişikliği için bkz. bölüm 8)

---

## 1. Elle yapmanız gerekenler

| Ne | Gerekli mi? | Açıklama |
| --- | --- | --- |
| Node.js 21+ | Evet | Bu makinede Node 24 kurulu. Başka makinede `node -v` ile kontrol edin. |
| `npm install` | Yeni makinede bir kez | Playwright, Chromium ve fontları kurar. Bu makinede yapıldı. İnternet ister. |
| Gemini anahtarı | İsteğe bağlı | AI özellikleri için proje klasöründe `.env` dosyası açıp `GEMINI_API_KEY=...` yazın (bölüm 4b). Anahtarı kimseyle paylaşmayın; `.env` git'e girmez. |
| Kök klasör adı | İsteğe bağlı | Klasör hâlâ `rageghost`. Değiştirmek için bölüm 8. |
| İzinler | Hayır | Özel bir macOS izni gerekmez. |

> Hackathon'dan **önce** `npm install` yapılmış olsun. AI kapalıyken demo tamamen internetsiz çalışır.

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
  AI (Gemini)    açık (.env GEMINI_API_KEY)   veya   kapalı
```

- Port doluysa araç otomatik olarak bir sonraki boş portu kullanır ve terminale doğru adresi yazar.
- Durdurmak için `Ctrl+C`. Açık ajan pencereleri önce düzgünce kapatılır, sonra çıkılır. Tarayıcı açılmasın derseniz: `npm start -- --no-open`.

---

## 3. Ekranı okumak

Ekranda açıklama metinleri yok; her bölümün yanındaki **(i)** düğmesinin üstüne gelin veya tıklayın.

**Sol: Görev**

- **Hedef adres** ve kısayollar: Demo · hatalı, Demo · düzgün, biyom.co.
- **Mod:** Güvenli, Kaos, Stres (bölüm 5).
- **Sürü:** 7 kullanıcı tipi; her birinin yanındaki `−` `+` ile 0–3 adet. Toplam en fazla 8 (sağ üstteki sayaç).
- **Test kimliği:** giriş/kayıt formlarına yazılacak e-posta ve şifre. Boşsa otomatik üretilir.
- **Süre**, **seed** ve üç anahtar:
  - **Pencereleri göster:** her ajan için gerçek bir Chrome penceresi açar. Pencereler ekranı ızgara halinde paylaşır (4 ajan 2×2, 8 ajan 4×2). Başlarken farenizi ekranın en üstüne (menü çubuğuna) taşırız. Ajan imleçleri sizin farenizi dinlemez; farenizi pencerelere götürseniz de ajanlar bozulmaz.
  - **Demoyu sıfırla:** yalnız dahili demoda görünür. Her başlatmada önceki siparişler, hesaplar ve sepet silinir.
  - **AI (Gemini):** anahtar varsa açılabilir (bölüm 4b).

**Orta: Sürü ve karar grafiği**

- Her ajanın sekmesi canlı akar. İmleçler kendi renginde bir ok ve kod etiketiyle görünür. Hedefe hızlanarak gidip yavaşlayarak durur; tıklarken küçülür.
- Ajan sayfaya her baktığında aday elemanların etrafında ince çerçeveler ve **olasılık yüzdeleri** belirir; kalın olan seçilen hedeftir. Bulunan hata kırmızı çerçeve ve etiketle işaretlenir.
- Karoya tıklamak o ajanı seçer, sağ üstteki düğme büyütür. Seçili ajan daha net, diğerleri hafif çözünürlükte akar (performans için).
- **Karar grafiği:**
  - **Tümü:** bütün ajanların son kararı tek ekranda, her biri kendi renginde. Akış sırası: hedef aldığı sayfa bölgesi, seçtiği hamle (yanında en olası 6 adayın dağılımı), sonuç. Sinyaller çizgiler boyunca akar; sonuç kutularındaki renkli çubuk hangi ajanın ne kadar katkı verdiğini gösterir.
  - **A1, A2 …:** o ajanın tarttığı bütün adaylar ve yüzdeleri.
  - "AI" işaretli hamleler Gemini planından gelir.

**Sağ: Dayanıklılık**

- Genel skor (0–100) ve skor geçmişi çizgisi.
- Önem sayaçları: Kritik ◆, Yüksek ▲, Orta ●, Düşük □.
- Kategori karnesi: Yarış durumu, Hata dayanıklılığı, Mobil & yerleşim, Güvenlik & veri, Performans, Klavye & etkileşim.
- AI paneli (açıksa): saldırı planı adımları (biten adım işaretlenir), koşu sonunda kök neden özeti ve öncelikli düzeltmeler.
- Sekmeler:
  - **Sorunlar:** karta tıklayınca anlamı, çözümü ve kanıtı açılır.
  - **Hamleler:** tüm ajanların hamle akışı.
  - **Ağ · konsol:** 5xx, engellenen istekler, JS hataları, **GİRİŞ** satırları (kayıt ve giriş sonucu) ve AI durumları.

Koşu bitince **Rapor** kutusu çıkar: HTML rapor, Playwright testleri (`stampede.spec.ts`), Markdown ve JSON.

---

## 4. Ajanlar (personalar)

| Ajan | Ekran | Ne yapar | Tipik bulduğu |
| --- | --- | --- | --- |
| Öfkeli müşteri | 1280×800 | Ödeme ve gönder butonlarına 2–8 kez basar, geri/ileri spamlar, F5'e basar. Tıklamadan hemen önce ekranı 375 px'e daraltır. Öderken interneti kesip 3 kez daha basar. Aynı sayfayı ikinci sekmede açıp iki yerden öder. | Çift ödeme, yarış durumu, taşma |
| Klavye kullanıcısı | 1280×800 | Fareye hiç dokunmaz. Tab ile gezer, Enter/Space ile tetikler, ESC spamlar. | Görünmeyen odak, klavyeyle açılamayan kontroller |
| Mobil kullanıcı | 390×844, dokunmatik | Parmakla basar, telefonu çevirir, sekmeyi arka plana atıp uyandırır, hızlı kaydırır. | Mobil taşma, üstü kapalı butonlar, CLS |
| Meraklı saldırgan | 1280×800 | URL'deki numaraları değiştirir, gizli form alanlarını ve tarayıcı hafızasını bozar, XSS/SQL denemeleri yazar. | XSS, hassas veri sızıntısı |
| Yarıda bırakan | 1280×800 | Forma yazar, başka sayfaya geçer, geri döner ve yazdıklarının durup durmadığını kontrol eder. Yarıda yeniler. | Form verisi kaybı |
| Yavaş bağlantı | 1280×800 | Yavaş 3G ve 4 kat yavaş işlemci. Bir şey olmadığını sanıp 1 saniye sonra yine basar. | Yavaş istek, takılı spinner, gecikmeli çift gönderim |
| Hızlı gezgin (bot) | 1280×800 | Bağlantıları beklemeden art arda açar, URL'leri dener. | Kırık linkler, 404/500, yavaş sayfalar |

- Aynı tipten 2–3 kopya seçebilirsiniz; örneğin 3 öfkeli müşteri gerçek eşzamanlı yük oluşturur. Kopyalar A1…A8 kodu ve farklı renk alır.
- Her ajan kendi tarayıcı bağlamında çalışır: ayrı çerez, ayrı oturum, ayrı hafıza.

### Otomatik giriş (test kimliği)

- Ajan sayfada şifre alanı olan bir form görürse önce onu dener.
- Form hem "Kayıt" hem "Giriş" butonu içeriyorsa ve hesap henüz yoksa **önce kayıt olur, sonra aynı kimlikle giriş yapar**. Sonuç Ağ · konsol sekmesinde `GİRİŞ` satırı olarak görünür; ör. "Giriş denendi: sayfa: Hoş geldin …".
- Kimlik şu sırayla belirlenir:
  1. Dashboard'daki alanlar
  2. `.env` dosyasındaki `STAMPEDE_EMAIL` ve `STAMPEDE_PASSWORD`
  3. Hiçbiri yoksa her koşuya özel otomatik bir kimlik: `stampede+<seed>@example.test`
- Öfkeli müşteri gönder butonuna 2–3 kez basar, böylece çift kayıt hatasını da yakalar.
- **Google, Apple, GitHub, Microsoft, Facebook, SSO ve "… ile giriş" butonlarına hiçbir modda basılmaz.** Bu adreslere giden bağlantılar ağ katmanında engellenir.
- Şifre raporda, JSON'da ve ağ kayıtlarında `••••••` olarak maskelenir. Üretilen test şifreyi `process.env.STAMPEDE_PASSWORD` ile okur.
- Güvenli modda form doldurulur ama **gönderilmez**.

### 4b. AI özellikleri (Gemini, isteğe bağlı)

Kurulum: proje klasöründe `.env` adında bir dosya açın (örnek: `.env.example`) ve şunu yazın:

```
GEMINI_API_KEY=buraya-anahtarınız
```

Sonra `npm start`'ı yeniden başlatın. Dashboard'un sağ üstünde "AI hazır" yazar. İsterseniz `GEMINI_MODEL=` ile modeli seçebilirsiniz. Model bulunamazsa araç uygun bir "flash" modelini kendisi seçer.

| Özellik | Ne zaman | Ne yapar |
| --- | --- | --- |
| Saldırı planlayıcı | Koşu başında, tek istek | İlk sayfanın sadeleştirilmiş yapısını gönderir, her persona için 6–10 adımlık bir plan alır. Plan adımlarına uyan hamlelerin ağırlığı 5 kat artar. Plan koşuyu bekletmez; gelince devreye girer. |
| Görsel inceleme | Koşu sonunda | Her ajanın son ekran görüntüsüne bakar; üst üste binen metin, kesik buton, okunmayan kontrast gibi görsel kusurları "AI görsel inceleme bulgusu" olarak ekler (en fazla Orta önem). |
| Kök neden özeti | Koşu sonunda | Bütün bulguları ortak kök nedenlere gruplar, öncelikli düzeltme listesi çıkarır. Dashboard'daki AI panelinde ve HTML raporun en üstünde görünür. |

Notlar:
- AI açıkken sayfa özeti ve ekran görüntüleri Google'a gönderilir. Gizli bir sitede istemiyorsanız **AI (Gemini)** anahtarını kapatın veya CLI'da `--no-ai` kullanın.
- Anahtar yalnız istek başlığında gider; URL'ye, loglara ve raporlara yazılmaz.
- AI çağrısı başarısız olursa koşu devam eder; uyarı AI panelinde görünür.

---

## 5. Modlar: hangi siteye hangisi?

| Mod | Ne zaman | Ne yapar | Ne yapmaz |
| --- | --- | --- | --- |
| **Güvenli keşif** | Canlı siteler (biyom.co) | Tıklar, gezer, yazar, ekranı sarsar, geri/ileri yapar, hafızayı bozar (yalnız kendi sekmesinde) | POST/PUT/PATCH/DELETE isteklerini **ağ seviyesinde engeller**. Öde/satın al/gönder/kaydol/sil/çıkış butonlarına dokunmaz. Formları göndermez. Site dışına çıkmaz. |
| **Tam kaos** | Lokal, staging, demo | Her şey: ödeme butonlarına çoklu tık, gerçek giriş/kayıt, Enter spam, bağlantı kesme, ikinci sekme | Sil/çıkış butonlarına basmaz |
| **Stres** | Sadece lokal | ×8 tık, CPU 4 kat yavaş, yavaş 3G, Wi-Fi kopması, **API yanıtlarını yolda bozma** (null, boş, yarım JSON, 2000 elemanlı liste), sil butonları dahil | — |

Canlı bir sitede Tam kaos veya Stres seçerseniz bir onay kutusu çıkar. Kutuyu işaretlemeden çalıştırma başlamaz.

### biyom.co (veya herhangi bir canlı site) adım adım

1. Dashboard'da **biyom.co** kısayoluna basın. Mod otomatik olarak Güvenli olur.
2. İsterseniz "Hızlı gezgin (bot)" ekleyin; kırık linkleri toplar. Süre 60–120 sn.
3. **Başlat**.
4. "engellenen" sayacı, güvenli modun durdurduğu yazma isteklerini gösterir. Ayrıntısı **Ağ ve konsol** sekmesinde.

Terminalden aynı şey:

```bash
node bin/stampede.js run https://biyom.co --mode safe --personas rage,keyboard,mobile,snoop,bot --duration 90
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

1. **Demo · hatalı**, **Kaos**, varsayılan dört ajan, 45 sn, seed **11** → **Başlat**. (Demo verileri otomatik sıfırlanır.)
2. Koşu bitince demo sitesinde **Kasa defteri** (`/#/orders`) sayfasını açın. Aynı ödemenin birden fazla kez tahsil edildiğini görürsünüz.
3. **Demo · düzgün** ile aynı ayarları tekrar çalıştırın. Kritik ve yüksek sorun çıkmaz; bunu otomatik test de doğruluyor.

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
| Geri gelince form verisi kayboldu | Orta | Forma yazılan metin, başka sayfaya geçip dönünce silinmiş | Taslağı sessionStorage/URL'de tut |
| AI görsel inceleme bulgusu | Orta/Düşük | Gemini ekran görüntüsünde görsel kusur gördü (model çıktısı, gözle doğrulayın) | Ekranı o genişlikte açıp düzelt |
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
| Bilgisayar yavaşladı | Daha az ajan seçin (4 yeterince etkileyici); "Pencereleri göster"i kapatın; Stres yerine Kaos kullanın. |
| "Google Chrome for Testing quit unexpectedly" | Sunucu, ajan pencereleri açıkken zorla kapatılınca olur (ör. terminal kapatıldı). Artık `Ctrl+C` önce tarayıcıyı düzgün kapatıyor. Uyarıyı "Ignore" ile kapatın. |
| AI kapalı görünüyor | `.env` dosyasında `GEMINI_API_KEY=...` satırı olmalı; ekledikten sonra `npm start`'ı yeniden başlatın. |
| Giriş yapılamadı | Ağ · konsol sekmesindeki `GİRİŞ` satırı sayfanın verdiği mesajı gösterir. Kendi sitenizde kayıtlı bir test hesabı varsa Test kimliği alanlarına girin. |
| "Zaten çalışan bir sürü var" | **Durdur**'a basın, rapor yazılınca yeniden başlatın. |
| Canlı sitede Kaos başlamıyor | Bilinçli bir güvenlik önlemi. Onay kutusunu işaretleyin ya da Güvenli keşif'i seçin. |
| Giriş formu doldurulmadı | Sayfada görünür bir şifre alanı olmalı. Güvenli modda form doldurulur ama gönderilmez. |
| Bot koruması | **Tarayıcı pencerelerini de göster**, Güvenli keşif. |
| Demo sonuçları birikti | `curl -X POST http://localhost:7500/api/reset` veya `npm start`'ı yeniden başlatın. |
| Testler | `npm test` (46 birim test, ~1 sn), `npm run test:e2e` (6 uçtan uca koşu, ~4 dk) |

---

## 10. Proje yapısı

```
bin/stampede.js         Terminal / CI aracı
scripts/start.js        Tek komutla demo + dashboard
src/engine/             Sürü: session, agent, strategy, personas, actions, detectors, safety
src/ai/gemini.js        İsteğe bağlı Gemini: planlayıcı, görsel inceleme, kök neden özeti
src/util/desktop.js     Görünür pencere ızgarası ve imleç park etme (macOS)
src/engine/inject/      Sayfaya enjekte edilen ajan katmanı ve ölçüm fonksiyonları
src/server/             API, Server-Sent Events, ajan başına MJPEG canlı görüntü
src/report/             HTML/MD/JSON rapor + Playwright TypeScript test üretici
public/                 Dashboard (karar grafiği: public/brain.js)
demo/                   Hatalı "Fincan" kahve dükkânı (+ ?fixed=1)
test/unit, test/e2e     Otomatik testler
```
