# Oyun Odası — Okey 101 · Renk Fırtınası · Pis Yedili · Blackjack

Tarayıcıdan oynanan online oyun odası: **Okey 101**, **Renk Fırtınası**, **Pis Yedili** ve **Blackjack**. Oda kalıcıdır: oyun bitince lobiye dönülür, yeni oda kurmadan başka oyuna geçilir. Sesli sohbet oda boyunca açık kalır. Sunucu gerektirmez: oda kuran oyuncunun tarayıcısı oyunu yönetir, diğerleri PeerJS (WebRTC) ile doğrudan ona bağlanır. Bu yüzden GitHub Pages gibi statik bir yerde çalışır.

## Nasıl oynanır

1. Adını yaz, **Oda Kur**'a bas.
2. Çıkan linki (ya da 5 harfli oda kodunu) arkadaşlarına gönder.
3. Boş koltuklara istersen bot ekle, 4 kişi olunca **Oyunu Başlat**.

- Taşları ıstakada sürükleyerek diz. Boşlukla ayrılmış her grup bir per sayılır.
- **Seri Diz** / **Çift Diz** perleri otomatik dizer. Açmaya yetip yetmediği ekranda yazar.
- **El Aç**: ıstakadaki geçerli perlerin toplamı en az 101 olmalı, ya da en az 5 çift olmalı.
- **İşleme**: elini açtıktan sonra bir taşı masadaki bir pere sürükle (ya da taşı seçip pere tıkla). Okeyli bir perde okeyin yerine geçen gerçek taşı koyarsan okeyi alırsın.
- Taş atmak için taşı sağdaki kutuya sürükle ya da seçip **At**'a bas.
- Soldaki oyuncunun attığı taşı alırsan o tur kullanmak zorundasın. Kullanamazsan **Geri Ver** (101 ceza).

## Oda ve lobi

- Kurucu lobide oyunu seçer (Okey 101: 4 kişi, Renk Fırtınası ve Pis Yedili: 2-4, Blackjack: 1-4) ve başlatır. Başlat'a basınca herkes salondaki sehpanın başına toplanır, 3-2-1 geri sayımla oyun açılır. Boş koltuklara bot eklenebilir.
- Oyun bitince "Lobiye Dön" ile aynı odada başka oyuna geçilir. Oyun sürerken gelen kişi lobide bekler.
- **Sesli sohbet** odaya girince otomatik açılır (mikrofon izni ister). Sessize alma ve sesten çıkma yan panelde.
- **Görünüm**: yan panelden masa ve ıstaka rengi seçilir, her oyuncunun kendi tarayıcısında hatırlanır.
- Kurucu sayfayı yenilerse oda ve oyun kaldığı yerden devam eder; diğer oyuncular kendiliğinden yeniden bağlanır.

## Salon (lobi)

Lobi, odadaki herkesin tombul karakteriyle dolaştığı bir ev salonudur (botlar da dolaşır).

- **WASD / Oklar**: yürü · **Boşluk**: yakındakini tut / bırak · **Shift** (veya F): it, birini tutarken basarsan fırlat · **1-6**: ifade
- Tutulan kişi yön tuşlarına basarak debelenir ve kurtulur. İtilen ya da fırlatılan sersemler.
- Saksılar, lamba ve vazo çarpınca devrilir; "Salonu Topla" hepsini yerine koyar.
- Sağ üstteki 🙂 Karakterim düğmesinden renk ve şapka seçilir. Oyun seçimi, sohbet, ses, oda ve görünüm de sağ üstteki düğmelerdedir; telefonda ☰ menüde toplanır.
- Telefonda ekrandaki joystick ve Tut / İt düğmeleri kullanılır, kamera karakterini takip eder.

## Renk Fırtınası

Bize özgü renkli kart oyunu (2-4 kişi). Pembe, turuncu, yeşil ve mor renklerde 1-9 sayılar ve özel kartlar. Aynı renk ya da aynı sayı/simge atılır.

- ❄ **Dondur**: sıradaki atlanır · 💣 **Bomba**: diğer herkes 1 kart çeker · 🌪 **Kasırga**: herkes elini sıradakine verir
- 🌈 **Gökkuşağı**: renk seçersin · ⚡ **Şimşek**: renk seçip bir daha oynarsın
- Tek kart kalınca "Son Kart!" de; demezsen yakalanırsın (+2 kart).
- Elini bitiren, diğerlerinin elindeki kartlar kadar puan alır (sayılar kendi değeri, özel 15, Gökkuşağı/Şimşek 25). En yüksek puan önde.

## Pis Yedili

7: sıradaki 3 kart çeker (7'ler üst üste biner) · 8: sıradaki atlanır · 10: yön değişir · Vale: her kartın üstüne gider, rengi seçer. Tek kart kalınca "Son Kart!" denmezse yakalanan 2 kart çeker. Kalan kartlar ceza puanı; en düşük puan önde.

## Blackjack

Herkes krupiyeye karşı oynar, 1000 çiple başlar. Blackjack 3:2 öder, krupiye 17'de durur, ilk iki kartta ikiye katlanabilir.

## Okey 101 Puanlama (otomatik)

| Durum | Puan |
|---|---|
| Bitiren | −101 (okey atarak bitirirse −202) |
| Elini açmayan | +202 |
| Elini açan | Elinde kalan taşların toplamı |
| Yerden alıp kullanamama | +101 ceza |

Okey atarak ya da çiftten bitirilirse diğerlerinin cezası 2 katına çıkar. En düşük toplam puan önde.

## Bilgisayarda çalıştırma

```bash
python -m http.server 8101
```

Sonra tarayıcıda `http://localhost:8101` adresini aç.

## GitHub Pages'e yükleme

1. GitHub'da yeni bir repo aç ve bu klasördeki dosyaları yükle.
2. Repo'da **Settings → Pages → Branch: main / root** seç ve kaydet.
3. Birkaç dakika sonra oyun `https://KULLANICI.github.io/REPO/` adresinde açılır.

## Bilinmesi gerekenler

- Oyunu kurucunun tarayıcısı yönetir. Kurucu sekmeyi kapatırsa oda kapanır; aynı linki 12 saat içinde tekrar açarsa oda geri gelir.
- Kopan oyuncu aynı isimle aynı linke girerse yerine geri döner. O arada yerine bot oynar.
- Bağlantı için ücretsiz PeerJS sunucusu kullanılır. Çok nadiren bazı kurumsal/okul ağlarında bağlantı kurulamayabilir.

## Dosyalar

- `js/app.js`: oda sistemi (PeerJS), lobi, sohbet, tema, yeniden bağlanma
- `js/voice.js`: sesli sohbet
- `js/salon.js`: salon lobisi (fizik, karakterler, kontroller)
- `js/rules.js`, `js/engine.js`, `js/okey-ui.js`: Okey 101 kuralları, motoru ve arayüzü
- `js/firtina.js`: Renk Fırtınası
- `js/cards.js`, `js/yedili.js`, `js/blackjack.js`: iskambil oyunları
- `css/style.css`: görünüm ve temalar

Yeni sürüm yayınlarken üç yerde aynı numarayı artır: `index.html` içindeki `?v=N`, `version.json` ve `js/app.js` içindeki `APP_VERSION`. Böylece eski sayfa önbellekte kalmış oyuncular otomatik yenilenir.
