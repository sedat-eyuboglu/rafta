# Giriş ve kurtarma rehberi

Rafta'da şifre yoktur. Giriş yalnızca telefondaki authenticator uygulamasının ürettiği 6 haneli kodla yapılır
(Google Authenticator, Microsoft Authenticator, 2FAS, Aegis… hepsi olur). Bu belge günlük kullanımı, yeni telefona
geçişi ve **authenticator kaybolursa ne yapılacağını** anlatır.

Rafta'yı ilk kez kuruyorsan önce **[Kurulum rehberi](kurulum.md)**'ne bak.

> **En önemli kural:** Kayıtlı sunucular ve şifreler authenticator'a değil, sunucudaki şifreleme anahtarına
> (`data/secret.key` ya da `RAFTA_SECRET_KEY`) bağlıdır. Authenticator kaybolursa veri kaybolmaz, yalnızca giriş
> kapısı yeniden açılır. **Anahtar kaybolursa ise kayıtlı şifreler geri gelmez.** Anahtarı veritabanı yedeğinden
> ayrı bir yerde sakla.

Komutlar Rafta'nın çalıştığı sunucuda çalıştırılır; `rafta` container adıdır. Örneklerdeki
`http://SUNUCU-ADRESİ:8080` yerine kendi Rafta adresini yaz.

## İçindekiler

- [İlk kurulum](#ilk-kurulum)
- [Günlük kullanım](#günlük-kullanım)
- [Yeni telefona geçmek](#yeni-telefona-geçmek)
- [Authenticator kayboldu ya da silindi](#authenticator-kayboldu-ya-da-silindi)
  - [1. Kurtarma kodu ile giriş](#1-kurtarma-kodu-ile-giriş)
  - [2. Sunucudan sıfırlama (son çare)](#2-sunucudan-sıfırlama-son-çare)
- [Telefon ya da bilgisayar çalındı](#telefon-ya-da-bilgisayar-çalındı)
- [Kurulum bağlantısının süresi doldu](#kurulum-bağlantısının-süresi-doldu)
- [Neyi nerede saklamalı](#neyi-nerede-saklamalı)
- [Komut özeti](#komut-özeti)
- [Sık karşılaşılan durumlar](#sık-karşılaşılan-durumlar)

## İlk kurulum

Giriş kurulana kadar uygulamanın tamamı kapalıdır; her adres kurulum sayfasına yönlenir.

Ayrıntılı, ekran ekran anlatım: [Kurulum rehberi → 5. adım](kurulum.md#5-authenticatorı-bağla-ilk-giriş). Kısaca:

1. Uygulama her açılışta loglara tek kullanımlık bir kurulum bağlantısı yazar (24 saat geçerli):

   ```sh
   docker logs rafta 2>&1 | grep setup
   # [rafta]   /setup?token=...
   ```

2. Rafta adresinin sonuna bu yolu ekleyip tarayıcıda aç:
   `http://SUNUCU-ADRESİ:8080/setup?token=...`
3. Telefonda authenticator uygulamasını aç, **+ → QR kodu tara** ile ekrandaki QR'ı okut.
   QR okunmazsa QR'ın yanındaki anahtarı "kurulum anahtarı gir" seçeneğiyle elle yaz (hesap türü: zamana dayalı).
4. Uygulamada **Rafta** için çıkan 6 haneli kodu sayfaya yaz. 6 hane girilince form kendiliğinden gönderilir.
5. Ekranda **10 kurtarma kodu** çıkar (`abcde-fgh23` biçiminde). **Bunlar bir daha gösterilmez.**
   *İndir (.txt)*, *Kopyala* ya da *Yazdır* ile kaydet, sonra *Kaydettim, devam et*'e bas.

**Önerilen ek yedek:** Kurulum sırasında aynı QR'ı ikinci bir cihaza da okut (eşin/ikinci telefon, tablet ya da
TOTP destekleyen bir parola yöneticisi: Bitwarden, 1Password, KeePassXC…). İkisi de aynı kodu üretir; biri
kaybolursa diğeriyle girersin. Google Authenticator'da Google hesabıyla yedekleme açıksa kodlar yeni telefona da
taşınır.

## Günlük kullanım

- Yeni bir cihazda ya da oturum süresi dolunca Rafta yalnızca o anki 6 haneli kodu sorar.
- Giriş yapılan cihaz **30 gün** açık kalır. Süre `RAFTA_SESSION_DAYS` ile değiştirilir (1–365 gün, bkz. `.env.example`).
- Kod her 30 saniyede değişir. Saat kaymasına karşı bir önceki ve bir sonraki kod da kabul edilir.
- Aynı kod iki kez kullanılamaz. İki cihazdan art arda giriyorsan ikincide yeni kodun çıkmasını bekle.
- 5 dakika içinde 5 hatalı kod girilirse giriş kısa bir süre bekletilir.
- Çıkış: üst çubuktaki çıkış simgesi yalnızca o cihazdan çıkarır.

## Yeni telefona geçmek

Eski telefon hâlâ elindeyse ya da Rafta'da açık bir cihazın varsa:

1. Rafta'da üst çubuktaki **kalkan simgesi → Güvenlik → Yeniden bağla**.
2. Yeni telefonla QR'ı okut, çıkan kodu yaz, *Onayla*.
3. Onayladığın anda eski telefondaki Rafta kodu çalışmaz olur. Açık cihazlar açık kalır.

Hiçbir cihazda oturumun açık değilse önce [kurtarma kodu ile giriş](#1-kurtarma-kodu-ile-giriş) yap, sonra aynı adımları izle.

## Authenticator kayboldu ya da silindi

### 1. Kurtarma kodu ile giriş

1. Giriş ekranında 6 haneli kod yerine kurtarma kodlarından birini yaz. Tire, boşluk ve büyük/küçük harf fark etmez.
   Kodlarda `0`, `1`, `8` yoktur; `o`, `l`, `b` yerine bunları yazsan da kabul edilir.
2. Giriş yapınca Güvenlik sayfası açılır. **Yeniden bağla** ile yeni telefonu bağla.
3. Kullandığın kod artık geçersizdir. Güvenlik sayfası kaç kod kaldığını gösterir; 3 ve altına düşünce
   **Yeni kodlar üret** ile yenilerini al ve kaydet (eski kodların hepsi geçersiz olur).

### 2. Sunucudan sıfırlama (son çare)

Hem authenticator hem kurtarma kodları kaybolduysa sunucuya erişimi olan herkes girişi sıfırlayabilir. Bu işlem
authenticator anahtarını, kurtarma kodlarını ve tüm oturumları siler. **Sunucular ve şifreler silinmez.**

```sh
# Rafta'nın çalıştığı sunucuda
docker exec -u node rafta node dist/cli.js reset-2fa
```

Komut yeni bir kurulum bağlantısı yazar:

```
Authenticator ve tüm oturumlar sıfırlandı. Sunucular ve şifreler yerinde.
Rafta adresinin sonuna şunu ekleyip aç (24 saat geçerli):
  /setup?token=...
```

Bağlantıyı Rafta adresinin sonuna ekleyip aç (`http://SUNUCU-ADRESİ:8080/setup?token=...`) ve
[ilk kurulum](#ilk-kurulum) adımlarını tekrarla. Kurtarma kodları da yeniden üretilir; yenilerini kaydetmeyi unutma.

## Telefon ya da bilgisayar çalındı

Çalınan cihazda Rafta oturumu açık olabilir:

1. Başka bir cihazdan giriş yap (gerekirse kurtarma koduyla).
2. **Güvenlik → Diğer cihazlardan çıkış yap.** Bulunduğun cihaz dışındaki tüm oturumlar kapanır.
3. Çalınan telefonda authenticator da vardıysa **Güvenlik → Yeniden bağla** ile yeni telefona geç.
   Böylece eski telefondaki kod da geçersiz olur.

Hiçbir cihazdan giremiyorsan tüm oturumlar sunucudan da kapatılabilir:

```sh
docker exec -u node rafta node dist/cli.js logout-all
```

## Kurulum bağlantısının süresi doldu

Kurulum bağlantısı 24 saat geçerlidir. Yenisi için:

```sh
docker exec -u node rafta node dist/cli.js setup-link
# ya da uygulamayı yeniden başlat; açılışta yeni bağlantı loglara yazılır
docker restart rafta && sleep 3 && docker logs --since 1m rafta 2>&1 | grep setup
```

## Neyi nerede saklamalı

| Ne | Neden önemli | Nerede saklanmalı |
|---|---|---|
| `data/secret.key` (ya da `RAFTA_SECRET_KEY`) | Kaybolursa kayıtlı şifreler **kalıcı olarak** çözülemez | Veritabanı yedeğinden **ayrı** bir yerde: başka bir parola yöneticisi, şifreli USB |
| Kurtarma kodları | Authenticator kaybolursa girişi açar | Yazdırılmış kâğıt ya da başka bir parola yöneticisi |
| Authenticator (QR) | Günlük giriş | Telefon; mümkünse ikinci bir cihaz ya da bulut yedekli authenticator |
| Veritabanı yedeği | Sunucu bozulursa veri | Başka bir makine/disk. Yedek, anahtar olmadan şifreleri açığa çıkarmaz |

Kurtarma kodlarını Rafta'nın kendi içine kaydetme: Rafta'ya giremediğin anda onlara da ulaşamazsın.

## Komut özeti

Hepsi sunucuda, container çalışırken:

```sh
docker exec -u node rafta node dist/cli.js reset-2fa          # girişi sıfırla, yeni kurulum bağlantısı
docker exec -u node rafta node dist/cli.js setup-link         # kurulum yapılmadıysa yeni bağlantı
docker exec -u node rafta node dist/cli.js logout-all         # tüm cihazlardan çıkış
docker exec -u node rafta node dist/cli.js backup /data/yedek.db   # tutarlı yedek (./data/yedek.db olarak çıkar)
```

`-u node` önemlidir: komut root olarak çalışırsa veri klasöründe root'a ait dosyalar oluşabilir.

## Sık karşılaşılan durumlar

**"Kod tutmadı" diyor ama kod doğru.**
Telefonun saati yanlış olabilir. Telefonda otomatik saat/tarih ayarının açık olduğundan emin ol. Sunucu saati de
doğru olmalı (`timedatectl`).

**"Bu kod az önce kullanıldı" diyor.**
Aynı kod iki kez kabul edilmez. Uygulamada yeni kod çıkınca (en fazla 30 sn) onu yaz.

**"Çok fazla hatalı deneme" diyor.**
Belirtilen süre kadar bekle. Bu süre uygulama yeniden başlatılınca da sıfırlanır.

**Uygulamayı yeniden kurdum / veritabanını geri yükledim, giriş nasıl olacak?**
Authenticator ayarı veritabanında durur. Yedek, authenticator kurulduktan sonra alınmışsa aynı kodla girersin;
daha önce alınmışsa kurulum bağlantısı loglarda çıkar. Her iki durumda da uygulama yedeği alırken kullanılan
anahtarla başlatılmalıdır.
