import type { Child, FC } from "hono/jsx";
import { asset } from "../assets.js";
import { Icon } from "./components/ui.js";

// 422 (doğrulama hatası) yanıtları da yerine konsun; htmx varsayılanı 4xx'i yok sayar.
const HTMX_CONFIG = JSON.stringify({
  includeIndicatorStyles: false,
  allowScriptTags: false,
  allowEval: false,
  historyCacheSize: 10,
  responseHandling: [
    { code: "204", swap: false },
    { code: "[23]..", swap: true },
    { code: "422", swap: true },
    { code: "[45]..", swap: false, error: true },
  ],
});

export type Section = "servers" | "passwords" | "security";

export const Layout: FC<{
  title: string;
  children: Child;
  flash?: string | undefined;
  section?: Section;
  /** Giriş/kurulum sayfaları: menü ve işlemler gizlenir. */
  bare?: boolean;
}> = (p) => (
  <html lang="tr">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{p.title === "Sunucular" ? "Rafta" : `${p.title} · Rafta`}</title>
      <meta name="color-scheme" content="light dark" />
      <meta name="htmx-config" content={HTMX_CONFIG} />
      <link rel="icon" href={asset("favicon.svg")} type="image/svg+xml" />
      <script src={asset("theme.js")}></script>
      <link rel="stylesheet" href={asset("app.css")} />
      <script src={asset("htmx.min.js")} defer></script>
      <script src={asset("app.js")} defer></script>
    </head>
    <body hx-boost="false">
      <a class="skip" href="#main">
        İçeriğe geç
      </a>
      <header class="topbar">
        <div class="topbar-inner">
          <a class="brand" href="/" aria-label="Rafta — sunucu listesi">
            <span class="brand-mark" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span class="brand-name">rafta</span>
          </a>
          {p.bare ? (
            <span class="sections" />
          ) : (
            <nav class="sections" aria-label="Bölümler">
              <a href="/" aria-current={(p.section ?? "servers") === "servers" ? "page" : undefined}>
                <Icon name="server" />
                <span>Sunucular</span>
              </a>
              <a href="/passwords" aria-current={p.section === "passwords" ? "page" : undefined}>
                <Icon name="key" />
                <span>Şifreler</span>
              </a>
            </nav>
          )}
          <nav class="topbar-actions" aria-label="Genel">
            {p.bare ? null : (
              <>
                <a class="btn btn-ghost" href="/backup" title="Veritabanının tutarlı bir kopyasını indir">
                  <Icon name="database" />
                  <span class="hide-sm">Yedek indir</span>
                </a>
                <a
                  class="icon-btn"
                  href="/security"
                  title="Güvenlik: authenticator, kurtarma kodları, oturumlar"
                  aria-label="Güvenlik"
                  aria-current={p.section === "security" ? "page" : undefined}
                >
                  <Icon name="shield" />
                </a>
                <form method="post" action="/logout" class="inline-form">
                  <button type="submit" class="icon-btn" title="Bu cihazda çıkış yap" aria-label="Çıkış yap">
                    <Icon name="logout" />
                  </button>
                </form>
              </>
            )}
            <button type="button" class="icon-btn theme-toggle" data-theme-toggle aria-label="Tema: sistem">
              <Icon name="monitor" class="t-system" />
              <Icon name="sun" class="t-light" />
              <Icon name="moon" class="t-dark" />
            </button>
            {p.bare || p.section === "passwords" || p.section === "security" ? null : (
              <a class="btn btn-primary" href="/servers/new" data-shortcut="n">
                <Icon name="plus" />
                <span>
                  Yeni sunucu<kbd class="hide-sm">N</kbd>
                </span>
              </a>
            )}
          </nav>
        </div>
      </header>
      <main id="main" class="page">
        {p.flash ? (
          <div class="flash" role="status">
            <Icon name="check" />
            <span>{p.flash}</span>
          </div>
        ) : null}
        {p.children}
      </main>
      <div class="toast" id="toast" role="status" aria-live="polite" hidden />
    </body>
  </html>
);
