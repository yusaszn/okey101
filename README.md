# Okey 101 Online

Tarayıcıdan oynanan, 4 kişilik online Okey 101. Sunucu gerektirmez: oda kuran oyuncunun tarayıcısı oyunu yönetir, diğerleri PeerJS (WebRTC) ile doğrudan ona bağlanır. Bu yüzden GitHub Pages gibi statik bir yerde çalışır.

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

## Puanlama (otomatik)

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

- Oyunu kurucunun tarayıcısı yönetir. Kurucu sekmeyi kapatırsa oda kapanır.
- Kopan oyuncu aynı isimle aynı linke girerse yerine geri döner. O arada yerine bot oynar.
- Bağlantı için ücretsiz PeerJS sunucusu kullanılır. Çok nadiren bazı kurumsal/okul ağlarında bağlantı kurulamayabilir.

## Dosyalar

- `js/rules.js`: taşlar, per/çift kontrolü, otomatik dizme
- `js/engine.js`: oyun akışı, puanlama, botlar
- `js/app.js`: oda sistemi (PeerJS) ve arayüz
- `css/style.css`: görünüm
