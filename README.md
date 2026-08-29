# Amaze GO! — Tangled / Unblock Bulmacası 🐛

**▶ Çevrimiçi oyna:** <https://powerprens.github.io/ok-bulmacasi/> (GitHub Pages — telefondan "Ana ekrana ekle" ile uygulama gibi kurulur, çevrimdışı çalışır)
**📦 APK:** [Releases → AmazeGO.apk](https://github.com/powerprens/ok-bulmacasi/releases/download/v1.0/AmazeGO.apk) (Android 7.0+)

[Amaze GO!](https://play.google.com/store/apps/details?id=com.oakever.arrows) oyununun birebir tarayıcı klonu. Google Gemini Pro ile hazırlanan spesifikasyona ve videodaki (yüksek fps ile doğrulanmış) gerçek oynanışa göre yazıldı. Harici kütüphane yok — saf HTML5 Canvas + JavaScript + WebAudio, yalnızca ızgara dizisi matematiği.

## Oynanış ("trafik sıkışıklığı" tarzı sıra bulmacası)

- Tahtada birbirine dolanmış, hareketsiz **renkli kurtlar** (segment zincirleri) var. Kafalarındaki beyaz ok uçları çıkış yönlerini gösterir.
- Bir kurda **dokun**: kafasından tahta kenarına giden **çıkış yolu (escapePath)** başka bir kurt tarafından kapatılmamışsa, kurt o yoldan **solup tahtadan çıkar** (tick tabanlı akıcı animasyon).
- Yolu kapalıysa kurt **reddeder**: titrer, hata sesi çalar, bir **kalp** gider.
- **Yanma hakkı 3**: üçüncü hatalı dokunuşta bölüm sona erer (💔) ve seviye yeniden başlar.
- Amaç: tüm kurtları **doğru sırayla** dokunarak tahtayı temizlemek. Hatasız tamamlarsan 3 ⭐.

## Spesifikasyona uygunluk

- **Worm veri yapısı**: `{ id, color, segments[{x,y}] (index 0 = kafa), escapePath[{x,y}] (kafaya komşu hücreden başlar, grid dışında biter), isExited }`
- **Seviye JSON biçimi**: `{ level, gridSize: {w,h}, worms: [...] }` — üretici birebir bu yapıyı üretir; elle hazırlanmış seviyeler de aynı biçimle yüklenebilir.
- **Kural motoru**: tıklamada `escapePath` boyunca tüm çıkmamış kurtların segmentleri denetlenir; tek bir çakışma bile varsa hareket reddedilir.
- **Kaçış animasyonu**: her tick'te kuyruk `pop`, `escapePath`'ten sonraki koordinat kafaya `unshift` — segments dizisi tamamen boşalınca `isExited = true`.
- Fizik motoru yok, yılan-oyunu mekaniği yok, sürekli hareket döngüsü yok — salt ızgara mantığı.

## Çalıştırma

```bash
node serve.js        # http://localhost:8080
```

Ya da `index.html`'e çift tıkla. **Geliştirici kısayolu:** `#9` → 9. seviye. Yayındaki sürüm: <https://powerprens.github.io/ok-bulmacasi/> — push sonrası ~1 dakikada güncellenir.

## Telefonda oynama

1. Telefon ve bilgisayar **aynı Wi-Fi**'de olsun.
2. `node serve.js` çalıştır — çıktıda `telefondan (aynı Wi-Fi): http://192.168.x.x:8080` benzeri bir adres yazar.
3. O adresi telefonda Chrome/Safari ile aç. (Windows Güvenlik Duvarı için 8080 portu kuralı bir kez eklenmelidir: `netsh advfirewall firewall add rule name="AmazeGO 8080" dir=in action=allow protocol=TCP localport=8080 profile=private` — yönetici terminalinde.)
4. Ana ekrana kısayol: Android Chrome → ⋮ → **Ana ekrana ekle**; iPhone Safari → Paylaş → **Ana Ekrana Ekle** (`manifest.json` + ikonlar hazır).

Not: Bu adres yalnızca yerel Wi-Fi'de ve sunucu açıkken çalışır. Tam PWA kurulumu (çevrimdışı, gerçek uygulama deneyimi) https gerektirir — oyunu GitHub Pages/Netlify gibi bir yere yükleyince telefonda "uygulama gibi" kurulur.

## Android APK

`android/` klasöründe minik bir WebView kabuk projesi var — oyun dosyaları APK'nın içine gömülür, internet gerekmez:

```bash
node _androidpack.js                 # ikonları üret + oyunu assets'e göm (oyun değişince tekrar çalıştır)
cd android
set JAVA_HOME=C:\Users\yusat\jdk17
C:\Users\yusat\gradle-8.10.2\bin\gradle.bat assembleDebug
copy app\build\outputs\apk\debug\app-debug.apk ..\AmazeGO.apk
```

Telefona kurulum: `http://<pc-ip>:8080/AmazeGO.apk` adresinden indir (sunucu açıkken), aç, "bilinmeyen kaynaklar" iznini onayla. Paket: `com.oakever.amazego`, minSdk 24 (Android 7.0+), debug imzalı — Play Store'a koymak istersen release imzası gerekir.

## Dosyalar

| Dosya | Açıklama |
|---|---|
| `index.html` / `style.css` | Arayüz: LEVEL tableti, koyu tema, kazanma paneli, yıldızlar |
| `game.js` | Tamamı: üretici, kural motoru, animasyon, çizim, ses |
| `serve.js` | Bağımlılıksız statik sunucu |
| `test-unblock.js` | 150 seviye: biçim + determinizm + çözülebilirlik + animasyon + Gemini örneği |

## Teknik notlar

- **Çözülebilirlik garantisi**: Kurtlar "çıkış sırasının tersi" yerleştirilir — yeni yerleştirilen kurdun çıkış yolu, daha önce yerleştirilen kurtlara göre açık olmalıdır. Böylece ters yerleşim sırası daima bir çözümdür. Tohumlu RNG → aynı seviye her zaman aynı bulmaca.
- **Zorluk eğrisi**: Seviye 1: 7x7 (~7 kurt) → seviye 70+: 30x30 (~190 kurt). **Şemalı üretim** (<1ms): iç bölge satır satır yatay kurtlarla **%100** dolar, en dıştaki 1 hücrelik halka hep boş kalır (hava + çıkış koridorları orada — boşluk tahtanın kenarında toplanır). Her satırın tek çıkış yönü (sol/sağ) vardır; üst/alt kenar satırlarındaki bazı kurtlar halkadan dikey çıkar. Satırlar bağımsız olduğundan global yerleşim sırası serbestçe karıştırılır → ters sıra daima bir çözümdür.
- **Testler**: her seviyenin JSON biçimi doğrulanır (escapePath kafaya komşu başlar, grid dışında biter, kurtlar üst üste değil), ters sırada kural motoruyla çözülür, animasyon `isExited` ile biter; Gemini'nin kırmızı/mavi engelleme örneği birebir sınanır.

```bash
node test-unblock.js
```
