# Kurulum rehberi

Bu rehber Rafta'yı sıfırdan kurmayı ve ilk girişi yapmayı adım adım anlatır. Yaklaşık 10 dakika sürer.

Kurulumdan sonra günlük kullanım, yeni telefona geçiş ve authenticator kaybolursa yapılacaklar için:
**[Giriş ve kurtarma rehberi](giris-ve-kurtarma.md)**

## İçindekiler

1. [Gerekenler](#1-gerekenler)
2. [Kodu indir](#2-kodu-indir)
3. [Ayarları hazırla](#3-ayarları-hazırla)
4. [Başlat](#4-başlat)
5. [Authenticator'ı bağla (ilk giriş)](#5-authenticatorı-bağla-ilk-giriş)
6. [Kurtarma kodlarını kaydet](#6-kurtarma-kodlarını-kaydet)
7. [Anahtarı yedekle](#7-anahtarı-yedekle)
8. [Sonraki adımlar](#8-sonraki-adımlar)
9. [Kurulumda sorun çıkarsa](#kurulumda-sorun-çıkarsa)

---

## 1. Gerekenler

- **Bir sunucu ya da bilgisayar:** Linux sunucu, ev sunucusu, NAS ya da Raspberry Pi (64 bit). x86-64 ve ARM64 desteklenir.
- **Docker** ve **Docker Compose** eklentisi. Kontrol et:

  ```sh
  docker --version
  docker compose version
  ```

- **Telefonda bir authenticator uygulaması:** Google Authenticator, Microsoft Authenticator, 2FAS, Aegis ya da
  TOTP destekleyen bir parola yöneticisi (Bitwarden, 1Password, KeePassXC…).
- `git` ve `openssl` (çoğu Linux'ta hazır gelir).

Rafta internete bağlanmaz ve dışarıdan dosya indirmez; internetsiz bir ağda da çalışır (yalnızca imajı derlerken
npm paketleri indirilir).

## 2. Kodu indir

```sh
git clone https://github.com/KULLANICI/rafta.git
cd rafta
```

Bu klasör aynı zamanda çalışma klasörün olacak. Veriler buradaki `data/` klasöründe tutulur.

## 3. Ayarları hazırla

Örnek ayar dosyasını kopyala ve şifreleme anahtarını üret:

```sh
cp .env.example .env
sed -i "s|^RAFTA_SECRET_KEY=.*|RAFTA_SECRET_KEY=$(openssl rand -base64 32)|" .env
```

> **Bu anahtar çok önemli.** Kayıtlı bütün şifreler bununla şifrelenir. Kaybolursa şifreler **geri gelmez**.
> [7. adımda](#7-anahtarı-yedekle) yedekleyeceğiz.
>
> Anahtar vermezsen Rafta ilk açılışta `data/secret.key` dosyasını kendisi üretir. Bu da çalışır; o zaman o dosyayı
> yedeklersin.

`.env` dosyasında değiştirmek isteyebileceğin diğer ayarlar:

| Ayar | Ne işe yarar | Örnek |
|---|---|---|
| `RAFTA_BIND` | Kim erişebilir? `127.0.0.1` yalnızca bu makine, `0.0.0.0` ağdaki diğer cihazlar da | Telefondan da girmek için `0.0.0.0` |
| `RAFTA_PORT` | Tarayıcıda kullanacağın port | `8080` |
| `RAFTA_SESSION_DAYS` | Kodla girdikten sonra cihaz kaç gün açık kalsın | `30` |
| `TZ` | Saat dilimi | `Europe/Istanbul` |

Telefonundan da kullanmak istiyorsan `RAFTA_BIND=0.0.0.0` yap. İnternete açmak için önce
[README > Production](../README.md#production-kurulumu) bölümüne bak.

## 4. Başlat

```sh
docker compose up -d --build
```

İlk derleme birkaç dakika sürebilir. Sonra durumu kontrol et; `STATUS` sütununda `healthy` görmelisin
(ilk 10–20 saniye `starting` yazabilir):

```sh
docker compose ps
```

## 5. Authenticator'ı bağla (ilk giriş)

Rafta'da şifre yoktur. Giriş, telefondaki authenticator uygulamasının ürettiği 6 haneli kodla yapılır. İlk bağlama
için Rafta loglara **tek kullanımlık bir kurulum bağlantısı** yazar. Böylece aynı ağdaki başka biri kurulumu senden
önce yapamaz.

**5.1. Kurulum bağlantısını al:**

```sh
docker compose logs rafta | grep setup
```

Şuna benzer bir satır göreceksin:

```
rafta  | [rafta]   /setup?token=Q7mZ2rT9vK4pW8nX1bY6cD3fH5jL0sA
```

**5.2. Bağlantıyı tarayıcıda aç.** Rafta'nın adresinin sonuna bu yolu ekle:

```
http://SUNUCU-ADRESİ:8080/setup?token=Q7mZ2rT9vK4pW8nX1bY6cD3fH5jL0sA
```

- Aynı makinedeysen: `http://localhost:8080/setup?token=...`
- Ağdaki başka bir cihazdan: `http://192.168.1.50:8080/setup?token=...` (sunucunun IP'si)

Bağlantı 24 saat geçerlidir. Kurulum yapılana kadar Rafta'nın bütün sayfaları kurulum ekranına yönlenir.

**5.3. QR kodu tara.** Ekranda bir QR kod ve yanında uzun bir anahtar görürsün.

1. Telefonda authenticator uygulamasını aç.
2. **+** (ekle) düğmesine bas ve **QR kodu tara**'yı seç.
3. Ekrandaki QR'ı okut. Uygulamada **Rafta** adında bir kayıt belirir ve her 30 saniyede değişen 6 haneli bir kod
   gösterir.

QR okunmuyorsa uygulamada **Kurulum anahtarı gir**'i seç ve QR'ın yanındaki anahtarı yaz (hesap adı: Rafta,
tür: zamana dayalı).

> **İpucu (önerilir):** Aynı QR'ı şimdi ikinci bir cihaza da okut: ikinci telefon, tablet ya da bir parola
> yöneticisi. İkisi de aynı kodu üretir; biri kaybolursa diğeriyle girersin.

**5.4. Kodu yaz.** Uygulamadaki 6 haneli kodu sayfadaki kutuya yaz. 6. haneyi yazınca form kendiliğinden gönderilir.

"Kod tutmadı" uyarısı alırsan telefonun saatinin otomatik ayarlı olduğundan emin ol ve güncel kodu tekrar yaz.

## 6. Kurtarma kodlarını kaydet

Kod doğruysa ekranda **10 kurtarma kodu** çıkar (`abcde-fgh23` gibi).

- Telefonun kaybolur ya da authenticator silinirse bu kodlardan biriyle giriş yaparsın. Her kod bir kez çalışır.
- **Bunlar bir daha gösterilmez.** Şimdi kaydet:
  - **İndir (.txt)** ile dosya olarak indir,
  - **Yazdır** ile kâğıda dök, ya da
  - **Kopyala** ile başka bir parola yöneticisine yapıştır.
- Kurtarma kodlarını Rafta'nın içine kaydetme: Rafta'ya giremediğin gün onlara da ulaşamazsın.

Kaydettikten sonra **Kaydettim, devam et**'e bas. Rafta açılır. Bu cihaz 30 gün boyunca kod sormaz.

## 7. Anahtarı yedekle

Kurtarılamayan tek şey şifreleme anahtarıdır. Şimdi bir kopyasını Rafta'nın çalıştığı makinenin **dışında** sakla:

- 3\. adımda `.env`'e koyduysan: `.env` dosyasındaki `RAFTA_SECRET_KEY=` satırı.
- Koymadıysan: `data/secret.key` dosyası.

```sh
grep RAFTA_SECRET_KEY .env      # ya da: cat data/secret.key
```

Bu değeri kurtarma kodlarınla aynı güvenli yere (başka bir parola yöneticisi, şifreli USB, kâğıt) kaydet.

| Kaybedersen ne olur? | |
|---|---|
| Telefon / authenticator | Kurtarma koduyla ya da sunucudan sıfırlayarak girersin. Veri kaybı yok. |
| Kurtarma kodları | Sunucudan sıfırlarsın (`reset-2fa`). Veri kaybı yok. |
| **Şifreleme anahtarı** | **Kayıtlı şifreler kalıcı olarak çözülemez.** |

## 8. Sonraki adımlar

- **Şifre ekle:** üstteki **Şifreler** sekmesi. Tek satıra *ne için*, *kullanıcı adı*, *şifre* yaz ve Enter'a bas.
- **Sunucu ekle:** **Sunucular** sekmesi → **Yeni sunucu** (ya da `N` tuşu).
- **Telefondan gir:** aynı adresi telefonda aç ve o anki 6 haneli kodu yaz.
- **Güvenlik ayarları:** üst çubuktaki kalkan simgesi. Burada yeni telefona geçiş, yeni kurtarma kodları ve diğer
  cihazlardan çıkış var.
- **Düzenli yedek:** [README > Yedekleme](../README.md#yedekleme-ve-geri-yükleme).
- **Güncelleme:**

  ```sh
  git pull
  docker compose up -d --build
  ```

---

## Kurulumda sorun çıkarsa

**`docker compose logs rafta | grep setup` hiçbir şey göstermiyor.**
- Container çalışıyor mu? `docker compose ps`. Çalışmıyorsa `docker compose logs rafta` ile hatayı gör.
- Kurulum zaten yapılmış olabilir. O zaman `http://SUNUCU-ADRESİ:8080` adresini aç; giriş ekranı gelir.
- Logu kaçırdıysan yeni bağlantı üret:

  ```sh
  docker exec -u node rafta node dist/cli.js setup-link
  ```

**Bağlantıyı açınca "Kurulum bağlantısı gerekli" diyor.**
Bağlantının süresi dolmuş (24 saat) ya da uygulama yeniden başladığı için yenisi üretilmiş. Yukarıdaki
`setup-link` komutuyla yeni bağlantı al.

**Başka bir cihazdan adrese ulaşamıyorum.**
- `.env`'de `RAFTA_BIND=0.0.0.0` olmalı. Değiştirdiysen: `docker compose up -d`.
- Sunucunun güvenlik duvarında port açık mı? (örn. `sudo ufw allow 8080/tcp`)

**"Port is already allocated" hatası.**
8080 başka bir uygulamada kullanılıyor. `.env`'de `RAFTA_PORT=8090` gibi boş bir port seç ve tekrar başlat.

**Container sürekli yeniden başlıyor, logda "Şifreleme anahtarı bu veritabanıyla eşleşmiyor".**
Veritabanı başka bir anahtarla oluşturulmuş. Eski anahtarı `.env`'e (`RAFTA_SECRET_KEY`) ya da `data/secret.key`
dosyasına geri koy. Rafta yanlış anahtarla bozuk veri göstermek yerine açılmayı reddeder.

**"RAFTA_SECRET_KEY base64 kodlu 32 bayt olmalı" hatası.**
Anahtarı elle yazdıysan eksik ya da fazla karakter olabilir. `openssl rand -base64 32` ile yeniden üret. Bunu
yalnızca henüz şifre kaydetmediysen yap; kayıtlı veri varsa eski anahtar gerekir.

**Docker snap ile kurulu (Ubuntu) ve container başlamıyor.**
`docker-compose.yml`'deki `security_opt: no-new-privileges` satırını açtıysan kapat; snap'in AppArmor profili
buna izin vermiyor.

**"Kod tutmadı" diyor ama kod doğru.**
Telefonun ve sunucunun saati doğru olmalı. Telefonda otomatik tarih/saati aç; sunucuda `timedatectl` ile kontrol et.
