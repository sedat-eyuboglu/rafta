# Rafta

Kendi sunucunda çalışan, sade bir **sunucu envanteri ve şifre kasası**. Şifre yok: giriş telefondaki
authenticator koduyla yapılır.

## Rafta nedir?

- Sunucularının kaydını tuttuğun küçük bir web uygulamasıdır: hostname, IP adresleri, donanım, konum, maliyet, notlar.
- Sunuculara ait giriş bilgilerini (SSH, panel, iDRAC/iLO) ve sunuculardan bağımsız kişisel şifrelerini saklar.
- Kendi makinende çalışır. Verilerin tek bir SQLite dosyasında durur, hiçbir yere gönderilmez.
- Tek bir Docker container'ıdır. İnternet bağlantısı ve harici servis gerektirmez.
- Şifre sormaz. Girişte telefonundaki Google Authenticator (ya da benzeri) uygulamanın 6 haneli kodunu istersin.

## Ne için kullanılır?

- Evdeki ya da şirketteki sunucuları, VPS'leri ve sanal makineleri tek listede görmek için.
- "Bu IP hangi makineydi, root şifresi neydi, yenileme ne zaman?" sorularına tek yerden cevap bulmak için.
- Aylık sunucu maliyetini ve yaklaşan yenileme tarihlerini takip etmek için.
- Site, uygulama, modem gibi şifreleri bulut bir parola yöneticisine koymadan kendi sunucunda saklamak için.
- Excel ya da not dosyasında tutulan dağınık envanter ve şifre listelerinin yerine.

## Özellikler

- **Sunucu listesi:** anlık arama (hostname, IP, OS, etiket, not), ortam/durum/sağlayıcı/etiket filtreleri, sıralama,
  durum özeti, aylık maliyet toplamı, yenileme uyarıları.
- **Sunucu kaydı:** birden fazla IP (public, private, yönetim, IPMI), donanım, işletim sistemi, sağlayıcı/konum/rack,
  sorumlu, maliyet (₺/$/€), yenileme tarihi, SSH portu, etiketler, notlar. Hazır `ssh` komutu kopyalanabilir.
- **Erişim bilgileri:** her sunucu için SSH, panel, iDRAC/iLO gibi kullanıcı adı ve şifreler.
- **Şifreler:** sunuculardan bağımsız şifre kasası. Tek satırda ekleme: *ne için*, *kullanıcı adı*, *şifre*, Enter.
  Adres yapıştırınca alanlar kendiliğinden dolar; güçlü şifre üretip panoya kopyalar.
- **Şifresiz giriş:** yalnızca authenticator kodu (TOTP). Giriş yapılan cihaz belirlenen gün kadar açık kalır.
- **Kurtarma:** tek kullanımlık kurtarma kodları ve sunucudan sıfırlama komutu. Authenticator kaybolsa da veri kaybolmaz.
- **Değişiklik geçmişi:** her alanın ne zaman neyden neye değiştiği. Şifre değerleri geçmişe yazılmaz.
- **Dışa aktarma ve yedek:** filtrelenmiş listeyi CSV (Excel uyumlu) indirme, tek tıkla tutarlı veritabanı yedeği.
- **Arayüz:** açık/koyu tema, mobil uyumlu, klavye kısayolları (`/` arama, `N` yeni kayıt, `E` düzenle).
  Arayüz Türkçedir.

## Teknoloji

- **Çalışma ortamı:** Node.js 24, TypeScript.
- **Web:** [Hono](https://hono.dev) ve sunucu tarafında render edilen JSX (`hono/jsx`). Sayfalar JavaScript
  kapalıyken de çalışır.
- **Etkileşim:** [htmx](https://htmx.org) (arama, filtreler, dialoglar) ve küçük bir `app.js`. Frontend derleme
  adımı yok.
- **Veritabanı:** SQLite ([better-sqlite3](https://github.com/WiseLibs/better-sqlite3)), WAL modu, sürümlü şema
  (`PRAGMA user_version`).
- **Doğrulama:** [zod](https://zod.dev).
- **Şifreleme:** AES-256-GCM (`node:crypto`). Her değer ayrı rastgele IV ile şifrelenir.
- **Giriş:** RFC 6238 TOTP (`node:crypto` ile, harici kütüphane yok). QR kod sunucuda
  [qrcode](https://github.com/soldair/node-qrcode) ile SVG olarak üretilir.
- **Test:** [Vitest](https://vitest.dev). Birim testleri ve uçtan uca HTTP testleri.
- **Dağıtım:** çok aşamalı Dockerfile, salt okunur container, root olmayan kullanıcı, healthcheck.
- **Harici kaynak yok:** fontlar (IBM Plex) ve scriptler uygulamanın içinden sunulur; CDN kullanılmaz.

## Hızlı başlangıç

Docker ve Docker Compose yeterli.

```sh
git clone https://github.com/sedat-eyuboglu/rafta.git
cd rafta
cp .env.example .env
sed -i "s|^RAFTA_SECRET_KEY=.*|RAFTA_SECRET_KEY=$(openssl rand -base64 32)|" .env
docker compose up -d --build
docker compose logs rafta | grep setup
```

Son komutun verdiği `/setup?token=...` yolunu `http://localhost:8080` sonuna ekleyip aç. QR'ı telefondaki
authenticator ile tara ve kurtarma kodlarını kaydet.

📖 **Adım adım, ekran ekran anlatım: [docs/kurulum.md](docs/kurulum.md)**

## Production kurulumu

`docker-compose.yml` production için hazırdır. Ek bir dosya gerekmez:

- container dosya sistemi salt okunur, uygulama root olmayan `node` kullanıcısıyla çalışır,
- `restart: unless-stopped` ile makine açılınca kendiliğinden başlar,
- healthcheck tanımlıdır (`docker compose ps` → `healthy`),
- loglar 3 × 10 MB ile sınırlıdır,
- kalıcı her şey `./data` klasöründedir.

### 1. Ayarlar

```sh
cp .env.example .env
sed -i "s|^RAFTA_SECRET_KEY=.*|RAFTA_SECRET_KEY=$(openssl rand -base64 32)|" .env
```

`.env` içinde ağ ayarını seç:

| Kullanım | `.env` |
|---|---|
| Yalnızca bu makine (varsayılan) | `RAFTA_BIND=127.0.0.1` |
| Yerel ağdaki diğer cihazlar da (telefon, laptop) | `RAFTA_BIND=0.0.0.0` |
| Önünde ters vekil (HTTPS) var | `RAFTA_BIND=127.0.0.1`, vekil `127.0.0.1:8080`'e yönlendirir |

### 2. Derle ve başlat

```sh
docker compose up -d --build
docker compose ps                         # healthy olana kadar bekle
docker compose logs rafta | grep setup    # ilk kurulum bağlantısı
```

İlk girişi [kurulum rehberinin 5. adımındaki](docs/kurulum.md#5-authenticatorı-bağla-ilk-giriş) gibi yap.

### 3. İnternete açacaksan HTTPS kullan

Rafta düz HTTP konuşur. Yerel ağda bu kabul edilebilir; internete açacaksan önüne HTTPS sağlayan bir ters vekil koy
ya da yalnızca VPN/Tailscale üzerinden eriş. Örnek [Caddy](https://caddyserver.com) yapılandırması (sertifikayı
kendisi alır):

```caddyfile
rafta.example.com {
	reverse_proxy 127.0.0.1:8080
}
```

Rafta ters vekil arkasında `X-Forwarded-Host` ve `X-Forwarded-Proto` başlıklarıyla çalışır. HTTPS'te oturum çerezi
otomatik olarak `Secure` işaretlenir.

### 4. Güncelleme

```sh
docker exec -u node rafta node dist/cli.js backup /data/yedek-oncesi.db   # önce yedek
git pull
docker compose up -d --build
```

Veritabanı şeması açılışta kendiliğinden güncellenir.

### Hazır imajla çalıştırmak (registry)

İmajı bir makinede derleyip kendi registry'ne gönderiyor, sunucuda yalnızca çalıştırıyorsan
`docker-compose.registry.yml` dosyasını kullan:

```sh
# Derleme makinesinde
docker build -t registry.example.com/rafta:latest .
docker push registry.example.com/rafta:latest

# Sunucuda: dosyayı bir klasöre docker-compose.yml adıyla kopyala, yanına .env koy
#   RAFTA_IMAGE=registry.example.com/rafta
docker compose pull && docker compose up -d
```

## Ayarlar

Tümü `.env` dosyasından okunur (bkz. [`.env.example`](.env.example)).

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `RAFTA_SECRET_KEY` | — | Şifreleri koruyan base64 kodlu 32 baytlık anahtar (`openssl rand -base64 32`). Boşsa `data/secret.key` üretilir. **Kaybolursa şifreler geri gelmez.** |
| `RAFTA_SESSION_DAYS` | `30` | Kodla girildikten sonra cihazın açık kalacağı gün (1–365). |
| `RAFTA_BIND` | `127.0.0.1` | Portun açılacağı adres. Yerel ağ için `0.0.0.0`. |
| `RAFTA_PORT` | `8080` | Makinedeki port. |
| `RAFTA_RESTART` | `unless-stopped` | Docker yeniden başlatma politikası (`always` da olur). |
| `RAFTA_IMAGE` / `RAFTA_TAG` | `rafta` / `latest` | İmaj adı (registry kullanıyorsan). |
| `TZ` | `Europe/Istanbul` | Saat dilimi. |

Container içinde ayrıca `PORT` (8080), `HOST` (0.0.0.0) ve `DB_PATH` (`/data/rafta.db`) kullanılır; değiştirmen gerekmez.

`./data` klasöründekiler:

| Dosya | İçerik |
|---|---|
| `data/rafta.db` (+ `-wal`, `-shm`) | SQLite veritabanı |
| `data/secret.key` | Yalnızca `RAFTA_SECRET_KEY` verilmediyse üretilen anahtar |

## Giriş, kurtarma ve güvenlik

📖 **Giriş ve kurtarma rehberi: [docs/giris-ve-kurtarma.md](docs/giris-ve-kurtarma.md)**
Bu rehberde yeni telefona geçiş, kurtarma kodları, sunucudan sıfırlama, çalınan cihaz ve sık karşılaşılan sorunlar var.

Özet:

- **Giriş:** şifre yok, yalnızca authenticator kodu. Tek kullanıcılıdır.
- **İlk kurulum:** loglara yazılan tek kullanımlık bağlantıyla yapılır. Böylece ağdaki başka biri senden önce kuramaz.
- **Authenticator kaybolursa:** kurtarma koduyla girersin. Kodlar da yoksa sunucuda
  `docker exec -u node rafta node dist/cli.js reset-2fa` girişi sıfırlar. **Veriler silinmez.**
- **Şifreler:** veritabanında AES-256-GCM ile şifrelidir, yalnızca "göster" ya da "kopyala" denince tek tek çözülür.
  Anahtar olmadan veritabanı dosyası şifreleri açığa çıkarmaz.
- **Anahtar:** kaybolursa kayıtlı şifreler geri gelmez. `RAFTA_SECRET_KEY` ya da `data/secret.key` dosyasını
  veritabanı yedeğinden **ayrı** bir yerde sakla. Rafta yanlış anahtarla başlatılırsa açılmayı reddeder.
- **Kaba kuvvete karşı:** aynı kod iki kez kullanılamaz; 5 dakikada 5 hatalı denemeden sonra giriş bekletilir.
- **Oturumlar:** çerez `HttpOnly` ve `SameSite=Lax`'tır. Veritabanında çerezin kendisi değil, SHA-256 özeti tutulur.
- **Web güvenliği:** sıkı Content-Security-Policy, başka sitelerden gelen isteklere karşı Origin/Sec-Fetch-Site
  kontrolü (CSRF), kullanıcı girdisi her yerde HTML olarak kaçışlanır.

### Komut satırı

Rafta'nın çalıştığı sunucuda:

```sh
docker exec -u node rafta node dist/cli.js reset-2fa          # girişi sıfırla, yeni kurulum bağlantısı
docker exec -u node rafta node dist/cli.js setup-link         # kurulum yapılmadıysa yeni bağlantı
docker exec -u node rafta node dist/cli.js logout-all         # tüm cihazlardan çıkış
docker exec -u node rafta node dist/cli.js backup /data/x.db  # tutarlı yedek (./data/x.db)
```

## Yedekleme ve geri yükleme

- **Arayüzden:** üst çubuktaki *Yedek indir* tutarlı bir `rafta-YYYYAAGG-SSDD.db` dosyası indirir. Uygulama çalışırken
  alınabilir.
- **Komut satırından:** `docker exec -u node rafta node dist/cli.js backup /data/yedek.db` (dosya `./data/yedek.db`
  olarak çıkar).
- **Geri yükleme:**

  ```sh
  docker compose down
  cp rafta-20261010-1400.db data/rafta.db && rm -f data/rafta.db-wal data/rafta.db-shm
  docker compose up -d
  ```

  Yedeği alırken kullanılan anahtarla başlatman gerekir.

Yedekte şifreler şifreli durur. Yine de yedekleri ve anahtarı **ayrı yerlerde** sakla: ikisi birlikte ele geçerse
şifreler açılabilir.

## Geliştirme

Node.js 24 gerekir.

```sh
npm install
npm run dev        # http://localhost:8080, veriler ./data altında
npm test           # vitest: doğrulama, şifreleme, TOTP, uçtan uca HTTP testleri
npm run typecheck
npm run build && npm start
npx tsx src/cli.ts reset-2fa    # geliştirmede komut satırı
```

İlk açılışta terminalde kurulum bağlantısı yazar (`/setup?token=...`).
`public/` altındaki CSS/JS dosyaları açılışta belleğe yüklenir; değiştirince sunucuyu yeniden başlat.

### Proje yapısı

```
src/
  index.ts            sunucuyu başlatma, kapanma sinyalleri
  cli.ts              bakım komutları: reset-2fa, logout-all, setup-link, backup
  app.ts              Hono uygulaması, güvenlik başlıkları, rotalar
  assets.ts           statik dosyalar (yalnızca izinli liste, içerik özetli önbellek)
  db/                 SQLite bağlantısı ve sürümlü şema
  repo/               sorgular: sunucular, erişim bilgileri, şifreler, giriş/oturumlar, geçmiş, özet
  lib/                doğrulama (zod), şifreleme, TOTP, CSV, biçimlendirme
  routes/             HTTP rotaları
  views/              sunucu tarafında render edilen JSX sayfalar
public/               app.css, app.js, favicon
docs/                 kurulum ve giriş/kurtarma rehberleri
test/                 vitest testleri
```

Şema değişikliği için `src/db/migrations.ts` dizisinin **sonuna** yeni bir migration ekle; mevcut migration'ları
değiştirme.

### Katkı

Hata bildirimi ve pull request'ler memnuniyetle karşılanır: [issues](https://github.com/sedat-eyuboglu/rafta/issues).
Göndermeden önce `npm test` ve `npm run typecheck` çalıştır. Güvenlik açığı bulursan herkese açık issue açma;
GitHub'ın [özel güvenlik bildirimi](https://github.com/sedat-eyuboglu/rafta/security/advisories/new) ile bildir.

## Lisans

[MIT](LICENSE)
