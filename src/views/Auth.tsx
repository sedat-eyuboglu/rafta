import type { FC } from "hono/jsx";
import { raw } from "hono/html";
import { Icon } from "./components/ui.js";
import { Layout } from "./Layout.js";

const CodeInput: FC<{ error?: string | undefined; recovery?: boolean }> = ({ error, recovery }) => (
  <div class={`field ${error ? "has-error" : ""}`}>
    <label for="f-code">{recovery ? "Authenticator kodu ya da kurtarma kodu" : "Authenticator'daki 6 haneli kod"}</label>
    <input
      id="f-code"
      name="code"
      class="mono code-input"
      inputmode={recovery ? "text" : "numeric"}
      autocomplete="one-time-code"
      autocapitalize="off"
      spellcheck={false}
      maxlength={recovery ? 20 : 7}
      placeholder="123456"
      required
      autofocus
      data-autosubmit
      aria-invalid={error ? "true" : undefined}
      {...(error ? { "aria-describedby": "e-code" } : {})}
    />
    {error ? (
      <p class="field-error" id="e-code" role="alert">
        {error}
      </p>
    ) : null}
  </div>
);

export const LoginPage: FC<{ next: string; error?: string | undefined; days: number }> = (p) => (
  <Layout title="Giriş" bare>
    <div class="auth-card panel">
      <div class="auth-icon" aria-hidden="true">
        <Icon name="shield" size={22} />
      </div>
      <h1>Giriş</h1>
      <p class="muted">Telefonundaki authenticator uygulamasında "Rafta" için görünen kodu yaz.</p>
      <form method="post" action="/login" class="auth-form" autocomplete="off">
        <input type="hidden" name="next" value={p.next} />
        <CodeInput error={p.error} recovery />
        <button type="submit" class="btn btn-primary btn-block">
          Giriş yap
        </button>
      </form>
      <p class="auth-note">Bu cihaz {p.days} gün boyunca açık kalır.</p>
      <details class="auth-help">
        <summary>Authenticator'a ulaşamıyorum</summary>
        <p>
          Kurulumda verilen <b>kurtarma kodlarından</b> birini (örn. <code>abcde-fgh23</code>) yukarıdaki alana yazabilirsin.
          Her kod bir kez kullanılır.
        </p>
        <p>
          Kurtarma kodların da yoksa sunucuda şu komutla authenticator sıfırlanır ve yeni kurulum bağlantısı verilir.
          Kayıtlı şifrelerin silinmez:
        </p>
        <pre>
          <code>docker exec -u node rafta node dist/cli.js reset-2fa</code>
        </pre>
      </details>
    </div>
  </Layout>
);

export const SetupNeededPage: FC = () => (
  <Layout title="Kurulum" bare>
    <div class="auth-card panel">
      <div class="auth-icon" aria-hidden="true">
        <Icon name="shield" size={22} />
      </div>
      <h1>Kurulum bağlantısı gerekli</h1>
      <p>
        Rafta artık authenticator koduyla korunuyor. İlk kurulum için sunucu loglarında yazan tek kullanımlık bağlantıyı aç:
      </p>
      <pre>
        <code>docker logs rafta 2&gt;&amp;1 | grep setup</code>
      </pre>
      <p class="muted">
        Bağlantının süresi dolduysa uygulamayı yeniden başlat ya da şunu çalıştır:{" "}
        <code>docker exec -u node rafta node dist/cli.js reset-2fa</code>
      </p>
    </div>
  </Layout>
);

export interface EnrollProps {
  mode: "setup" | "reenroll";
  qrSvg: string;
  secret: string;
  action: string;
  token?: string;
  error?: string | undefined;
}

/** QR + elle girilecek anahtar + onay kodu. İlk kurulumda ve telefon değişince kullanılır. */
export const EnrollPage: FC<EnrollProps> = (p) => (
  <Layout title={p.mode === "setup" ? "Kurulum" : "Authenticator'ı yeniden bağla"} bare={p.mode === "setup"} section="security">
    <div class="auth-card auth-wide panel">
      <h1>{p.mode === "setup" ? "Rafta'yı authenticator'a bağla" : "Authenticator'ı yeniden bağla"}</h1>
      {p.mode === "reenroll" ? (
        <p class="muted">Onayladığın anda eski telefondaki Rafta kodu geçersiz olur. Açık cihazlar açık kalır.</p>
      ) : null}
      <ol class="enroll-steps">
        <li>
          <b>Google Authenticator</b>'ı (ya da Microsoft Authenticator, 2FAS, Aegis…) aç, <b>+</b> ile
          <b> QR kodu tara</b>.
          <div class="enroll-qr">
            <div class="qr" role="img" aria-label="Authenticator için QR kodu">
              {raw(p.qrSvg)}
            </div>
            <div class="enroll-key">
              <p class="muted">QR taranamıyorsa bu anahtarı elle gir:</p>
              <code class="secret-key">{p.secret.match(/.{1,4}/g)?.join(" ")}</code>
              <button type="button" class="btn btn-sm" data-copy={p.secret}>
                <Icon name="copy" size={14} />
                Anahtarı kopyala
              </button>
              <p class="muted small">
                İpucu: Aynı QR'ı ikinci bir telefona ya da bir parola yöneticisine de okutursan yedeğin olur.
              </p>
            </div>
          </div>
        </li>
        <li>
          Uygulamada çıkan 6 haneli kodu yaz:
          <form method="post" action={p.action} class="auth-form" autocomplete="off">
            {p.token ? <input type="hidden" name="token" value={p.token} /> : null}
            <CodeInput error={p.error} />
            <button type="submit" class="btn btn-primary btn-block">
              Onayla
            </button>
          </form>
        </li>
      </ol>
      {p.mode === "reenroll" ? (
        <p>
          <a class="link" href="/security">
            Vazgeç
          </a>
        </p>
      ) : null}
    </div>
  </Layout>
);

/** Kurtarma kodları yalnızca üretildikleri anda gösterilir. */
export const RecoveryCodesPage: FC<{ codes: string[]; continueHref: string; fresh: boolean }> = (p) => {
  const text = `Rafta kurtarma kodları (${new Date().toISOString().slice(0, 10)})\nHer kod bir kez kullanılır.\n\n${p.codes.join("\n")}\n`;
  return (
    <Layout title="Kurtarma kodları" bare={p.fresh} section="security">
      <div class="auth-card auth-wide panel">
        <div class="auth-icon" aria-hidden="true">
          <Icon name="key" size={22} />
        </div>
        <h1>{p.fresh ? "Kurulum tamam. Son adım: kurtarma kodları" : "Yeni kurtarma kodları"}</h1>
        <p>
          Telefonun kaybolur ya da authenticator silinirse bu kodlardan biriyle giriş yaparsın. <b>Her kod bir kez</b>{" "}
          kullanılır. Bir daha gösterilmeyecekler, şimdi güvenli bir yere kaydet (yazdır, indir ya da başka bir parola
          yöneticisine koy).
          {p.fresh ? null : " Eski kodlar artık geçersiz."}
        </p>
        <ul class="recovery-codes">
          {p.codes.map((c) => (
            <li>
              <code>{c}</code>
            </li>
          ))}
        </ul>
        <div class="recovery-actions">
          <a class="btn" href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`} download="rafta-kurtarma-kodlari.txt">
            <Icon name="download" size={14} />
            İndir (.txt)
          </a>
          <button type="button" class="btn" data-copy={text}>
            <Icon name="copy" size={14} />
            Kopyala
          </button>
          <button type="button" class="btn" data-print>
            <Icon name="printer" size={14} />
            Yazdır
          </button>
        </div>
        <a class="btn btn-primary btn-block" href={p.continueHref}>
          Kaydettim, devam et
        </a>
      </div>
    </Layout>
  );
};

export const SecurityPage: FC<{ remaining: number; sessions: number; days: number; flash?: string | undefined }> = (
  p,
) => (
  <Layout title="Güvenlik" section="security" flash={p.flash}>
    <div class="page-head">
      <h1>Güvenlik</h1>
    </div>
    <div class="security-grid">
      <section class="panel pad-lg">
        <h2>Authenticator</h2>
        <p class="muted">
          Giriş yalnızca authenticator koduyla yapılır; şifre yok. Giriş yapılan cihaz {p.days} gün açık kalır.
        </p>
        <p>Telefon değiştirdiysen ya da Rafta kaydını sildiysen yeni bir QR ile yeniden bağla.</p>
        <a class="btn" href="/security/authenticator">
          <Icon name="shield" size={14} />
          Yeniden bağla
        </a>
      </section>
      <section class={`panel pad-lg ${p.remaining <= 3 ? "warn" : ""}`}>
        <h2>Kurtarma kodları</h2>
        <p>
          <b>{p.remaining}</b> kullanılmamış kod kaldı.
          {p.remaining <= 3 ? " Azaldı; yenilerini üretip kaydetmen iyi olur." : null}
        </p>
        <p class="muted">Yeni kod üretince eskilerin hepsi geçersiz olur.</p>
        <form method="post" action="/security/recovery-codes">
          <button type="submit" class="btn" data-confirm="Eski kodlar geçersiz olacak, onayla">
            <Icon name="key" size={14} />
            Yeni kodlar üret
          </button>
        </form>
      </section>
      <section class="panel pad-lg">
        <h2>Açık cihazlar</h2>
        <p>
          <b>{p.sessions}</b> cihazda oturum açık.
        </p>
        <p class="muted">Bir cihazını kaybettiysen diğer tüm cihazlardan çıkış yap; bu cihaz açık kalır.</p>
        <form method="post" action="/security/sessions">
          <button type="submit" class="btn btn-danger-ghost" data-confirm="Diğer cihazlardan çıkışı onayla">
            <Icon name="logout" size={14} />
            Diğer cihazlardan çıkış yap
          </button>
        </form>
      </section>
      <section class="panel pad-lg">
        <h2>Son çare</h2>
        <p class="muted">
          Hem authenticator hem kurtarma kodları kaybolursa sunucuda bu komut girişi sıfırlar ve yeni kurulum bağlantısı
          verir. Kayıtlı sunucular ve şifreler silinmez.
        </p>
        <pre>
          <code>docker exec -u node rafta node dist/cli.js reset-2fa</code>
        </pre>
      </section>
    </div>
  </Layout>
);
