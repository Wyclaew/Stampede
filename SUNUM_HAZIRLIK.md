# 🎤 RageGhost — 7 Dakikalık Sunum Hazırlığı

**Tek cümle:** RageGhost, uygulamanıza dünyanın en sabırsız kullanıcısı gibi saldıran görünür bir "hayalet". Bulduğu her hatayı ekran görüntülü bir rapora ve otomatik bir Playwright regresyon testine çevirir. Kaynak kod, API anahtarı veya internet gerekmez.

---

## Sunumdan 10 dakika önce (kontrol listesi)

1. Terminal: `cd "/Users/erne/Desktop/Log to LoFi/rageghost"` ve ardından `npm start`. Dashboard açılsın.
2. Prova koşusu yapın (Demo hatalı, Tam Kaos, 45 sn, seed 7). Sonra demo verisini sıfırlayın:
   ```bash
   curl -X POST http://localhost:7500/api/reset
   ```
3. Tarayıcıda 3 sekme hazır olsun:
   - Sekme 1: Dashboard `http://localhost:7400`
   - Sekme 2: Demo kasa defteri `http://localhost:7500/#/orders`
   - Sekme 3: Prova koşusundan kalan bir `report.html`
4. Ekran yakınlaştırması: dashboard'da `Cmd +` ile %110–125. Jüri skor ve kartları okuyabilsin.
5. Wi-Fi gerekmez. biyom.co bölümü internet ister; bağlantı yoksa o bölümü hazır raporla anlatın.
6. Bildirimleri kapatın (Odak modu).

---

## 7 dakikalık akış

### 0:00 – 0:45 · Problem (hikâye ile açın)
- "Kullanıcılarınız butona bir kez basmaz. Ödeme 1 saniye gecikirse üç kez basar. Sayfa yüklenirken geri tuşuna asılır. Telefonu yan çevirir."
- "Testlerimiz ise kibar bir robot gibi davranıyor: bir kez tıklıyor, bekliyor, doğru veriyi giriyor. Gerçek hatalar bu yüzden canlıda çıkıyor: çift tahsilat, kaybolan sepet, mobilde kırık sayfa."
- "Bu hataları bulmak için ya kaynak koda girip test yazmanız ya da QA ekibine saatlerce tıklatmanız gerekiyor."

### 0:45 – 1:15 · Çözüm
- "RageGhost'u tanıtayım: sabırsız hayalet kullanıcı. Herhangi bir URL verin. Sayfayı kendi keşfeder, en sabırsız insan gibi saldırır, tarayıcıyı izler. Hatayı **tekrar üretilebilir rapora** ve **çalıştırılabilir teste** çevirir."
- "Her şey lokal. API anahtarı yok, internet yok."

### 1:15 – 4:00 · Canlı demo (asıl şov)
1. **(1:15)** Dashboard'ı gösterin. "Bu Fincan, normal görünen bir kahve dükkânı." Demo sitesini 3 saniye gösterin.
2. **(1:30)** **🐞 Demo (hatalı)**, **Tam Kaos**, 45 sn, seed **7**. **Hayaleti Salıver**.
3. **(1:35 – 2:20)** Anlatın, sessiz kalmayın:
   - "Hayalet imleci görüyorsunuz. Konuşma balonunda ne yaptığını söylüyor: ÇİFT TIK, ÖFKE TIKI ×4, EKRAN SARSINTISI."
   - Ekran 375 piksele küçüldüğünde: "Telefona geçti. Promosyon şeridi taştı, hayalet kırmızı çerçeveyle işaretledi."
   - Kırmızı yanıp sönme olduğunda: "Yeni yüksek önemli bir hata."
   - **Kritik** kart düştüğünde: "Öde butonuna üst üste bastı. Sunucu ödemeyi iki kez aldı."
4. **(2:20)** Sekme 2'ye geçin, kasa defterini yenileyin: "İşte: aynı müşteriden iki tahsilat. Bu gerçek hayatta para iadesi ve müşteri kaybı demek."
5. **(2:40)** Dashboard'a dönün, kritik karta tıklayın: "Ne anlama geldiği, nasıl düzeltileceği (Idempotency-Key, butonu kilitleme) ve kanıt: aynı tık serisinden çıkan iki başarılı POST ve aralarındaki milisaniye farkı."
6. **(3:00)** **📄 HTML rapor**'u açın. Ekran görüntüsü ve adımları gösterin, sonra **Playwright regresyon testi**ni açın: "Hayalet hatayı bulmakla kalmadı, testini de yazdı. Bunu CI'a koyarsanız hata bir daha geri gelemez."
7. **(3:25)** **✅ Demo (düzeltilmiş)**'i 20–30 sn çalıştırın. Beklerken mimariye geçebilirsiniz. Sonuç: "Aynı saldırı, düzeltilmiş kod: kritik yok, skor yeşil."

### 4:00 – 5:00 · Mimari (kısa ve net)
- "Playwright ile gerçek Chromium sürüyoruz. Ama test senaryosu yok. Motor her hamleden önce sayfayı **keşfediyor**: butonlar, formlar, linkler. Her elemanı **risk sınıfına** ayırıyor: ödeme, silme, gezinme, girdi."
- "**Strateji**: seed'li, ağırlıklı seçim. Önce paranın döndüğü butonlar, sonra görülmemiş sayfalar. Aynı 12 'Sepete ekle' butonu tek aday sayılıyor."
- "**Dedektörler**: ağ (aynı aksiyon içinde tekrarlanan başarılı POST çift gönderimdir), konsol ve JS hataları, sayfa içi ölçümler (yatay taşma, `elementFromPoint` ile üstü kapalı butonlar, ekranda `NaN`, 6 saniyeyi geçen spinner, 500 ms üstü long task)."
- "**Görsel katman**: sayfaya Shadow DOM içinde, `pointer-events: none` ile hayalet çiziyoruz. Uygulamayı etkilemiyor. Canlı görüntü Chrome DevTools Protocol screencast'i ile SSE üzerinden dashboard'a akıyor."
- "**Çıktı**: HTML, Markdown ve JSON rapor ve Playwright spec. CLI'da `--fail-on high` ile CI kapısı olarak çalışıyor."

### 5:00 – 6:00 · Gerçek dünya + güvenlik
- "Canlı sitelerde tehlikeli olmaz mı? **Güvenli Keşif** modu tüm POST/PUT/DELETE isteklerini ağ katmanında engeller. Öde, sil, çıkış butonlarına dokunmaz. Site dışına çıkmaz."
- Gösterin: URL'ye `https://biyom.co` yazıp **Tam Kaos** seçin. Onay kutusu çıkar: "Canlı sitede yazma isteklerine izin vermek bilinçli bir onay ister."
- "Kendi sitemiz biyom.co'yu güvenli modda 25 saniye taradık. Kaynak koduna dokunmadan bir React hidrasyon hatası ve bir CSP ihlali çıktı." (İnternet varsa 20 sn canlı çalıştırın. Yoksa hazır raporu gösterin.)

### 6:00 – 7:00 · Etki ve kapanış
- "Geliştiriciye kazandırdığı: saatler süren manuel 'sabırsız kullanıcı' testleri yerine 45 saniye, ve hata için hazır yazılmış bir regresyon testi."
- "Sırada: CI GitHub Action'ı, oturum açılmış akışlar, isteğe bağlı yapay zekâ ile kök neden özeti (çekirdek ürün yine anahtarsız kalacak)."
- Kapanış: "Kullanıcılarınız sabırsız. Testleriniz de öyle olmalı. RageGhost."

---

## Yedek plan: canlı demo yapılamazsa

**Sunumdan önce ekran videosu kaydedin (5 dk):**
1. `npm start` çalışırken `Cmd + Shift + 5` ile **Seçili Bölümü Kaydet**'i seçin, tarayıcı penceresini seçin.
2. Akışı kaydedin: hatalı demo 45 sn (seed 7), kasa defteri, HTML rapor, Playwright testi, düzeltilmiş demo 30 sn.
3. Video `Masaüstü`ne kaydedilir. QuickTime ile 1.5x hızda oynatıp üzerine konuşabilirsiniz.
4. Ayrıca `reports/` klasöründeki son HTML raporlarını yedek olarak açık tutun. İnternet ve sunucu olmadan da açılırlar.

**Canlı demo sırasında bir şey ters giderse:**
- Hayalet bir hatayı bulmakta gecikirse: "Kaos rastgele, seed ile tekrar oynatılabilir" deyip prova raporunu (Sekme 3) açın.
- Sunucu çökerse: `Ctrl+C`, `npm start`. 5 saniye sürer.
- Port çakışırsa araç otomatik başka port seçer. Terminaldeki adresi kullanın.

---

## Jüri soruları için hazır cevaplar

- **"Mevcut araçlardan (Playwright, Cypress, gremlins.js) farkı ne?"** Playwright ve Cypress senaryo yazmanızı ister. RageGhost senaryoyu kendi üretir ve bulduğu hata için senaryoyu (spec) yazar. Monkey test araçları rastgele tıklar ve "bir şey kırıldı" der. RageGhost ise ödeme butonlarını önceliklendirir, hatayı sınıflandırır, ekran görüntüsü, adımlar ve test üretir. Çift gönderim gibi ağ seviyesindeki mantık hatalarını da yakalar.
- **"Yanlış pozitif oranı?"** Gürültüyü düşürmek için şunları yaptık: telemetri istekleri sayılmaz. Çift gönderim yalnızca aynı tık patlamasından gelen başarılı isteklerde sayılır. Toast ve sabit header gibi bilinçli katmanlar yok sayılır. Ölü buton yalnızca ilk etkileşimde ve JS hatası yoksa raporlanır. Düzeltilmiş demoda kritik veya yüksek sorun çıkmadığını otomatik testle doğruluyoruz.
- **"Canlı sitede güvenli mi?"** Güvenli modda yazma istekleri ağ katmanında engellenir. Bunu sunucunun hiç POST almadığını ölçen bir uçtan uca testle doğruluyoruz.
- **"Deterministik mi?"** Hamle seçimi seed'li, aynı seed aynı hamle sırasını verir. Ağ zamanlaması doğal olarak değişebilir.
- **"Giriş gerektiren sayfalar?"** Şimdilik herkese açık sayfalar. Sıradaki adım: kayıtlı oturum (Playwright `storageState`) ile çalıştırmak.
- **"Neden yapay zekâ kullanmadınız?"** Çekirdek ürünü anahtarsız, internetsiz ve deterministik tutmak için. Keşif ve sınıflandırma kurallarla yapılıyor. Yapay zekâ ileride kök neden özeti için isteğe bağlı eklenebilir.
- **"Ölçeklenir mi?"** Motor CLI olarak headless çalışır. CI'da `--fail-on high` ile her PR'da koşabilir.
- **"Ne kadar sürede yaptınız?"** Hackathon süresinde, tek kişi. Testler: 24 birim testi ve 4 uçtan uca test (gerçek Chromium).

---

## Prova için kopyala-yapıştır prompt

Aşağıdaki bloğu sunumdan hemen önce yeni bir sohbete yapıştırın:

```text
Sen deneyimli bir hackathon jürisi ve sunum koçusun. Benim projem "RageGhost — Sabırsız Hayalet Kullanıcı". 7 dakikalık sunumu prova etmeme, slaytları netleştirmeme ve jüri sorularına hazırlanmama yardım et. Türkçe konuş.

Hackathon teması: "Geliştiricilerin hayatını kolaylaştıran araç". 8 saatlik tek kişilik hackathon.

Projede GERÇEKTEN yapılmış olanlar (bunların dışında özellik uydurma):
- Herhangi bir URL'de kaynak kod olmadan çalışan, Playwright + gerçek Chromium ile sürülen bir "sabırsız kullanıcı" motoru. Node.js, harici API anahtarı yok, tamamen lokal.
- Keşif: her hamleden önce sayfadaki butonlar, linkler, form alanları ve select'ler bulunuyor ve risk sınıfına ayrılıyor (ödeme/işlem, silme/çıkış, gezinme, girdi, hassas alan, site dışı).
- Seed'li ağırlıklı strateji: önce para döndüren butonlar (Öde, Sepete ekle), görülmemiş sayfalar. Aynı etiketli butonlar tek aday sayılıyor. Aynı seed aynı hamle sırasını veriyor.
- Kaos aksiyonları: öfke tıkı (2–8 hızlı tık), kaotik yazı (emoji, Arapça/RTL, Türkçe karakter, 320 karakter, SQL tırnağı, XSS denemesi, negatif/dev sayılar), çift Enter, select karıştırma, geri/ileri spam, ekran boyutu sarsıntısı (320–1440 px), scroll çılgınlığı, klavye ezme, F5 spam, Wi-Fi kopması (stres modu), CPU 4x yavaşlatma (stres modu).
- Dedektörler: çift gönderim/yarış durumu (aynı tık serisinde aynı POST'un 2+ kez başarılı olması; para ile ilgiliyse Kritik), yakalanmamış JS hatası, konsol hatası, 5xx/4xx/başarısız/yavaş istek (>3 sn), takılı spinner (>6 sn), mobil yatay taşma (taşan elemanı buluyor), üstü kapalı buton (elementFromPoint), ekranda NaN/undefined/[object Object], ölü buton, UI donması (long task ≥500 ms), XSS çalışması, beyaz ekran, sekme çökmesi.
- 3 mod: Güvenli Keşif (POST/PUT/PATCH/DELETE ağ katmanında engellenir, ödeme/silme butonlarına dokunulmaz, site dışına çıkılmaz; canlı siteler için), Tam Kaos (lokal/staging), Stres/Yıkım (sadece lokal). Canlı sitede Kaos/Stres için açık onay zorunlu.
- Görsellik: sayfaya Shadow DOM ile enjekte edilen animasyonlu hayalet imleç (kızgın kaşlı), tık dalgaları, ×N tık rozeti, konuşma balonları, bulunan hatayı sayfada kırmızı/turuncu çerçeveyle işaretleme. CDP screencast ile dashboard'a canlı görüntü (SSE).
- Dashboard: URL, mod seçimi, süre, seed, gerçek tarayıcı penceresi seçeneği, canlı görüntü, dayanıklılık skoru göstergesi (0–100, A–F), önem sayaçları, sorun kartları (anlamı, düzeltme önerisi, kanıt), canlı aksiyon akışı, ağ ve konsol anomalileri.
- Rapor: tek dosya HTML (ekran görüntüleri gömülü, tekrar üretme adımları, düzeltme önerisi), Markdown, JSON ve her hata için otomatik üretilmiş Playwright regresyon testi (rageghost.spec.js).
- CLI: `rageghost run <url> --mode --duration --seed --fail-on high` (CI'da hata bulunursa çıkış kodu 1).
- Dahili demo: "Fincan" kahve dükkânı. 10 kasıtlı hata var: çift ödeme (buton kilitlenmiyor, idempotency yok), sepete çift ekleme, geri/ileri sonrası history.state null hatası ve NaN rozet, mobilde taşan promosyon şeridi ve kargo tablosu, adet alanında ₺NaN, mobilde ödeme butonunu kapatan sohbet balonu, hata sonrası takılan global spinner, geçersiz kuponda çökme, innerHTML XSS, işlevsiz favori butonu, 1 sn ana thread kilidi, 3.4 sn yavaş endpoint, özel karakterde 500. `?fixed=1` ile hepsinin düzeltilmiş hali var. "Kasa defteri" sayfası çift tahsilatı gösteriyor.
- Ölçülen sonuçlar: hatalı demoda 45 sn'de 10–18 farklı sorun, kritik çift ödeme denenen tüm koşularda yakalandı. Düzeltilmiş demoda kritik/yüksek sorun yok, skor 93. Canlı biyom.co'da 25 sn Güvenli Keşif: React hidrasyon hatası #418 (overlay olmadan da oluştuğu doğrulandı) ve bir CSP ihlali bulundu; 0 yazma isteği gönderildi.
- Testler: 24 birim testi + 4 uçtan uca test (gerçek Chromium: hatalı demoda kritik hatayı bulma, güvenli modda sunucuya hiç POST gitmemesi, düzeltilmiş sürümde ciddi hata çıkmaması, dashboard SSE akışı + rapor servisi).
- Tek komut: `npm start` (dashboard :7400 + demo :7500, port doluysa otomatik sonraki port).

Planlanan sunum akışı: Problem (0:00–0:45), Çözüm (0:45–1:15), Canlı demo: hatalı demo, kasa defterinde çift tahsilat, kritik kart, HTML rapor, Playwright testi, düzeltilmiş demo (1:15–4:00), Mimari (4:00–5:00), Güvenli mod ve biyom.co (5:00–6:00), Etki ve kapanış (6:00–7:00).

Benden şunları iste ve yap:
1. Önce açılış cümlemi ve kapanış cümlemi daha akılda kalıcı hale getir (3'er alternatif).
2. 5–6 slaytlık bir iskelet öner (her slayt için başlık + en fazla 3 madde + ekranda ne gösterileceği). Canlı demo slaytsız olacak.
3. Benimle 7 dakikalık provayı yap: ben bölüm bölüm anlatacağım, sen süre ve netlik açısından geri bildirim ver.
4. Sonra sert bir jüri gibi bana 10 soru sor (teknik derinlik, özgünlük, yanlış pozitifler, güvenlik, iş modeli, ölçeklenebilirlik). Cevaplarımı puanla ve daha iyi cevap öner.
Sadece yukarıdaki gerçek özelliklere dayan. Yapılmamış bir şeyi yapılmış gibi önermeyi, onu "gelecek planı" olarak etiketle.
```
