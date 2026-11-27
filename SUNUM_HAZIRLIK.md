# Stampede: 7 dakikalık sunum hazırlığı

**Tek cümle:** Stampede, uygulamanıza aynı anda dört farklı sabırsız kullanıcı gönderir:

- öfkeli müşteri,
- klavye kullanıcısı,
- mobil kullanıcı,
- meraklı saldırgan.

Neyin kırıldığını canlı gösterir ve her hatayı film şeridi olan bir rapora ve çalıştırılabilir bir Playwright testine çevirir. Kaynak kod, API anahtarı veya internet gerekmez.

---

## Sunumdan 10 dakika önce

1. Terminal:
   ```bash
   cd "/Users/erne/Desktop/Log to LoFi/rageghost" && npm start
   ```
2. Bir prova koşusu yapın: Demo · hatalı, Tam kaos, 4 ajan, 45 sn, seed 11. Sonra demo verisini sıfırlayın:
   ```bash
   curl -X POST http://localhost:7500/api/reset
   ```
3. Tarayıcıda üç sekme hazır olsun:
   - Dashboard: `http://localhost:7400`
   - Demo kasa defteri: `http://localhost:7500/#/orders`
   - Provadan kalan bir `report.html`
4. Tarayıcıyı tam ekran yapın (`Ctrl+Cmd+F`). Dashboard 1440 px genişlikte en iyi görünür; projektör küçükse `Cmd -` ile %90'a indirin.
5. Bildirimleri kapatın (Odak modu). Wi-Fi gerekmez; yalnız biyom.co bölümü internet ister.

---

## 7 dakikalık akış

### 0:00 – 0:40 · Problem
- "Kullanıcılar butona bir kez basmaz. Ödeme bir saniye gecikirse üç kez basar. Yüklenirken geri tuşuna asılır, telefonu yan çevirir. Bazıları fare bile kullanmaz."
- "Testlerimiz ise kibar bir robot: bir kez tıklar, bekler, doğru veriyi girer. Çift tahsilat, kırık mobil sayfa ya da konsola düşen şifre canlıda ortaya çıkıyor."

### 0:40 – 1:10 · Çözüm
- "Stampede bir sürü. Adresi verin, dört farklı kullanıcı tipi aynı anda ayrı sekmelerde siteye girer. Her biri sayfayı kendisi keşfeder, kendi tarzında saldırır."
- "Kırılan her şey tekrar üretilebilir bir rapora ve hazır bir teste dönüşür. Her şey bu bilgisayarda çalışıyor, API anahtarı yok."

### 1:10 – 4:00 · Canlı demo
1. **(1:10)** "Fincan normal görünen bir kahve dükkânı." Sitenin kendisini 3 saniye gösterin.
2. **(1:20)** Dashboard: **Demo · hatalı**, **Tam kaos**, dört ajan seçili, 45 sn, seed **11** → **Sürüyü başlat**.
3. **(1:25 – 2:15)** Konuşmaya devam edin:
   - "Dört sekme, dört farklı insan. Mavi öfkeli müşteri, turkuaz yalnız klavye kullanıyor, pembe telefonda, mor sistemin açığını arıyor."
   - Karolardaki ince çerçeveleri ve yüzdeleri gösterin: "Her elemanın etrafındaki sayı, ajanın oraya basma olasılığı. Kalın olan seçtiği."
   - **Karar grafiğini** gösterin: "Bu ajanın beyni. Solda sayfada gördüğü bölgeler, ortada tarttığı hamleler, sağda sonuç. Rastgele tıklamıyor; para ve giriş bölgelerine öncelik veriyor."
   - Karo kırmızı yanıp sönünce: "Yeni bir yüksek önemli hata."
4. **(2:15)** Kritik kart düşünce kasa defteri sekmesine geçip sayfayı yenileyin: "Aynı müşteriden birden fazla tahsilat."
5. **(2:30)** Kritik karta tıklayın: "Ne anlama geldiği, nasıl düzeltileceği ve kanıtı: aynı tık serisinden çıkan iki başarılı istek."
6. **(2:45)** Mor ajanın (A4) bulgularını gösterin: "Giriş formunu test hesabıyla kendisi doldurdu. Uygulama şifreyi konsola yazmış, API şifre hash'ini tarayıcıya göndermiş. Google ile giriş butonuna hiç dokunmadı; buna kural olarak izin yok."
7. **(3:05)** **HTML rapor**: film şeridini gösterin: "Hatadan iki saniye önce, kırmızı nişanla tık anı ve hata anı." Sonra **Playwright testi**ni açın: "Testi de yazdı. CI'a koyarsanız hata bir daha geri gelemez."
8. **(3:25)** **Demo · düzeltilmiş** ile aynı ayarlarla 30 sn çalıştırın. Beklerken mimariye geçin. Bitince: "Aynı sürü, düzeltilmiş kod: kritik ve yüksek sorun yok."

### 4:00 – 5:00 · Mimari
- "Her ajan Playwright'la sürülen gerçek bir Chromium sekmesi. Senaryo yazılmıyor. Her hamleden önce ajan sayfayı keşfediyor ve elemanları risk sınıfına ayırıyor: ödeme, silme, giriş, üçüncü taraf giriş."
- "Beyin yerel ve seed'li: ağırlıklı seçim, aynı seed aynı hamle sırasını verir. Personalar ağırlıkları değiştiriyor; klavye ajanı fareyi hiç kullanmıyor."
- "Dedektörler şunlara bakıyor:
  - ağ: aynı tık serisinde sunucu farklı yanıt verdiyse çift tahsilattır, aynı yanıtı verdiyse idempotent sayılır;
  - konsol ve API yanıtlarında şifre;
  - çerez bayrakları;
  - sayfa içi ölçümler: taşma, üstü kapalı buton, NaN, takılı spinner, CLS, uzun görev, DOM sızıntısı."
- "Görüntü her ajan için ayrı bir MJPEG akışı. Kararlar Server-Sent Events ile karar grafiğine akıyor. Rapor tek bir HTML dosyası."

### 5:00 – 6:00 · Gerçek site ve güvenlik
- "Canlı sitede tehlikeli değil mi? Güvenli keşif modunda tüm yazma istekleri ağ katmanında engelleniyor. Ödeme, silme ve çıkış butonlarına dokunulmuyor, formlar gönderilmiyor."
- Gösterin: URL'ye biyom.co yazıp **Tam kaos** seçin. Onay kutusu çıkar: "Canlı sitede yazmaya izin vermek bilinçli bir onay ister."
- "Kendi sitemiz biyom.co'yu güvenli modda dört ajanla 25 saniye taradık. 399 istek gitti, bunların arasında yazma isteği yoktu. Kaynak koduna bakmadan bir React hidrasyon hatası ve bir CSP ihlali çıktı."

### 6:00 – 7:00 · Etki ve kapanış
- "Saatler süren manuel 'sabırsız kullanıcı' testi yerine 45 saniye; üstüne bulduğu hata için yazılmış bir test."
- "CLI'da `--fail-on high` ile her PR'da çalışabilir."
- Kapanış: "Kullanıcılarınız sabırsız. Testleriniz de öyle olmalı. Stampede."

---

## Yedek plan: canlı demo yapılamazsa

**Sunumdan önce ekran videosu kaydedin (5 dakika):**
1. `npm start` çalışırken `Cmd+Shift+5` → **Seçili Bölümü Kaydet** → tarayıcı penceresini seçin.
2. Kaydedilecek akış:
   - hatalı demo, 4 ajan, 45 sn (seed 11),
   - kasa defteri,
   - HTML rapordaki film şeridi ve Playwright testi,
   - düzeltilmiş demo, 30 sn.
3. Video masaüstüne kaydedilir. QuickTime'da 1.5x hızla oynatıp üstüne konuşun.
4. `reports/` klasöründen iki HTML raporu açık tutun: hatalı ve düzeltilmiş. İnternet ve sunucu olmadan da açılırlar.

**Sahnede bir şey ters giderse:**
- Bilgisayar zorlanırsa 2 ajanla devam edin (A1 + A4).
- Kritik hata gecikirse: "Kaos seed'li, aynı seed ile tekrar oynatılır" deyip prova raporunu açın.
- Sunucu çökerse `Ctrl+C` ve `npm start`; 5 saniye sürer.

---

## Jüri soruları için hazır cevaplar

- **"gremlins.js, Playwright, Meticulous ya da QA Wolf'tan farkı ne?"**
  - gremlins.js rastgele tıklar ve rapor üretmez.
  - Playwright ve Cypress senaryo yazmanızı ister.
  - Kayıt/yeniden oynatma araçları gerçek oturumlara ve buluta bağlı.
  - Stampede senaryoyu kendi üretir ve insan tiplerini taklit eder. Kararını görünür kılar. Ağ seviyesinde mantık hatalarını yakalar (çift tahsilat, sızan şifre). Her hata için test yazar. Tamamen lokal çalışır.
- **"Yanlış pozitifler?"**
  - Aynı yanıtı tekrar veren sunucu çift gönderim sayılmaz.
  - Formun 400/422 dönmesi sorun sayılmaz.
  - Toast'lar, sabit header'lar ve modal arka planları yok sayılır.
  - Kopyala/paylaş butonları ölü buton sayılmaz.
  - Düzeltilmiş demoda kritik veya yüksek sorun çıkmadığını dört ajanlı uçtan uca testle her seferinde doğruluyoruz.
- **"Canlı sitede güvenli mi?"** Güvenli modda sunucunun hiç POST almadığını ve hiç hesap açılmadığını ölçen bir uçtan uca test var. OAuth butonlarına hiçbir modda basılmıyor.
- **"Giriş arkası sayfalar?"** Test kimliğiyle giriş ve kayıt formlarını kendisi dolduruyor. Kimliği dashboard'dan veya `.env`'den verebilirsiniz, yoksa üretiyor. Kayıtlı oturumla (`storageState`) başlamak sıradaki adım.
- **"Deterministik mi?"** Hamle seçimi seed'li. Ağ zamanlaması doğal olarak değişebilir.
- **"Yapay zekâ nerede?"** Karar motoru yerel bir ağırlıklı model ve karar grafiğinde görünür. Bilinçli olarak anahtarsız ve internetsiz. Sıradaki adım: isteğe bağlı bir LLM planlayıcı (sayfanın erişilebilirlik ağacından tek çağrıyla saldırı planı) ve ekran görüntüsünden görsel hata analizi.
- **"Ölçek?"** CLI headless çalışır. Personalar ayrı tarayıcı bağlamlarında paralel koşar.
- **"Test kapsamı?"** 36 birim testi ve gerçek Chromium'la 5 uçtan uca koşu.

---

## Prova için kopyala-yapıştır prompt

```text
Sen deneyimli bir hackathon jürisi ve sunum koçusun. Projem "Stampede". 7 dakikalık sunumu prova etmeme, slaytları netleştirmeme ve jüri sorularına hazırlanmama yardım et. Türkçe konuş.

Tema: "Geliştiricilerin hayatını kolaylaştıran araç". 8 saatlik, tek kişilik hackathon.

GERÇEKTEN yapılmış olanlar (bunların dışında özellik uydurma; yapılmamış bir şeyi önerirsen "gelecek planı" diye etiketle):
- Herhangi bir URL'de kaynak kod olmadan çalışan bir test aracı. Node.js + Playwright + gerçek Chromium. API anahtarı yok, tamamen lokal, fontlar bile lokal.
- Sürü: aynı anda 4 persona, her biri ayrı tarayıcı bağlamında/sekmede:
  - A1 Öfkeli müşteri: 2–8 hızlı tık, geri/ileri spam, F5, tıklamadan hemen önce ekranı 375px'e daraltma, ödeme anında interneti kesip 3 kez daha basma, aynı sayfayı ikinci sekmede açıp iki yerden ödeme.
  - A2 Klavye kullanıcısı: sadece Tab/Enter/Space/ESC; görünmeyen odak ve klavyeyle ulaşılamayan kontrolleri bulur.
  - A3 Mobil kullanıcı: 390×844 dokunmatik, telefonu çevirme, sekmeyi dondurup uyandırma, hızlı kaydırma.
  - A4 Meraklı saldırgan: URL'deki numaraları değiştirme, gizli form alanlarını ve localStorage/sessionStorage'ı bozma, hafızayı doldurma, XSS/SQL denemeleri.
- Keşif ve beyin: her hamleden önce sayfadaki elemanlar bulunur, bölgelere ayrılır (giriş/kayıt, sepet/ödeme, arama/filtre, form, navigasyon, içerik) ve risk sınıfına konur (ödeme, silme, OAuth, site dışı). Seed'li ağırlıklı seçim yapılır; aynı seed aynı hamle sırasını verir. Dashboard'daki "karar grafiği" seçili ajanın bölgelerini, tarttığı hamleleri olasılıklarıyla ve sonucu canlı gösterir. Sayfada da adaylar olasılık yüzdeli çerçevelerle işaretlenir.
- Otomatik giriş: giriş/kayıt formlarını test kimliğiyle doldurur (dashboard alanı, .env STAMPEDE_EMAIL/STAMPEDE_PASSWORD ya da otomatik üretilen stampede+seed@example.test). Google/Apple/GitHub/SSO "ile giriş" butonlarına hiçbir modda basmaz. Şifre raporda maskelenir.
- Modlar: Güvenli keşif (yazma istekleri ağ katmanında engellenir, ödeme/silme/çıkışa dokunulmaz, form gönderilmez; canlı siteler için), Tam kaos (lokal/staging), Stres (sadece lokal: CPU 4x yavaş, yavaş 3G, Wi-Fi kopması, API yanıtlarını yolda bozma). Canlı sitede Kaos/Stres için açık onay zorunlu.
- Dedektörler: çift gönderim/yarış durumu (sunucu her seferinde farklı yanıt verirse; idempotent tekrar sayılmaz), yakalanmamış JS hatası, konsol hatası, 5xx/4xx/başarısız/yavaş istek, takılı spinner, mobil yatay taşma, üstü kapalı buton, ekranda NaN/undefined, ölü buton, UI donması, CLS, DOM sızıntısı, XSS, konsola/ API yanıtına sızan şifre ve hash, güvensiz oturum çerezi, görünmeyen odak, klavyeyle ulaşılamayan kontrol, bozuk API yanıtında çöken arayüz.
- Dashboard: koyu "operasyon" arayüzü, 4 ajanın canlı MJPEG görüntüsü (büyütülebilir), karar grafiği (canvas), dayanıklılık skoru + geçmiş çizgisi, 6 kategorili karne (Yarış durumu, Hata dayanıklılığı, Mobil & yerleşim, Güvenlik & veri, Performans, Klavye & etkileşim), önem sırasına göre sorunlar, hamle akışı, ağ/konsol anomalileri.
- Rapor: tek dosya HTML (fontlar ve görüntüler gömülü), her hata için film şeridi (~2 sn önce / kırmızı nişanla tık anı / hata anı), adımlar, çözüm önerisi, Markdown, JSON ve her hata için otomatik Playwright TypeScript testi (stampede.spec.ts).
- CLI: `stampede run <url> --mode --personas all --duration --seed --fail-on high` (CI kapısı).
- Demo: "Fincan" kahve dükkânı, 15 kasıtlı hata: çift ödeme, çift sepete ekleme, geri/ileri çökmesi, mobil taşma, ₺NaN, butonu kapatan sohbet balonu, takılı çark ve 500, kupon çökmesi, innerHTML XSS, ölü favori butonu, 1 sn donma, yavaş endpoint, konsola şifre ve passwordHash dönen API, HttpOnly olmayan çerez, çift hesap açma, gizlenmiş odak, klavyeyle açılamayan ürün görseli. ?fixed=1 ile hepsinin düzeltilmiş hali var. "Kasa defteri" çift tahsilatı gösteriyor.
- Ölçülen sonuçlar:
  - Hatalı demoda 30–45 sn'lik 4 ajanlı koşularda 22–27 farklı sorun bulundu; kritik çift ödeme denenen her koşuda yakalandı.
  - Düzeltilmiş demoda 4 ajanla kritik/yüksek sorun çıkmıyor (uçtan uca testle doğrulanıyor).
  - Canlı biyom.co'da 25 sn Güvenli keşif, 4 ajan: 399 istek gitti, aralarında yazma isteği yoktu; React hidrasyon hatası #418 (overlay olmadan da doğrulandı) ve bir CSP ihlali bulundu.
- Testler: 36 birim testi + 5 uçtan uca koşu (tek ajanla çift ödeme, 4 ajanla güvenlik/klavye/mobil bulguları ve film şeridi, güvenli modda sıfır yazma ve sıfır hesap, düzeltilmiş sürümün sürüye dayanması, dashboard SSE + MJPEG + rapor servisi).

Sunum akışı: Problem (0:00–0:40), Çözüm (0:40–1:10), Canlı demo: 4 ajan, karar grafiği, kasa defterinde çift tahsilat, A4'ün şifre sızıntısı, film şeridi, Playwright testi, düzeltilmiş demo (1:10–4:00), Mimari (4:00–5:00), Güvenli mod ve biyom.co (5:00–6:00), Etki ve kapanış (6:00–7:00).

Benden şunları yap:
1. Açılış ve kapanış cümlemi daha akılda kalıcı hale getir (3'er alternatif).
2. 5–6 slaytlık iskelet öner: her slayt için başlık, en fazla 3 madde ve ekranda ne gösterileceği. Canlı demo slaytsız olacak.
3. Benimle 7 dakikalık provayı yap: ben bölüm bölüm anlatacağım, sen süre ve netlik açısından geri bildirim ver.
4. Sert bir jüri gibi bana 10 soru sor (özgünlük, teknik derinlik, yanlış pozitifler, canlı sitede güvenlik, otomatik girişin etiği, iş modeli, ölçek). Cevaplarımı puanla ve daha iyisini öner.
```
