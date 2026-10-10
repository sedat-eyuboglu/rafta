import type { Child, FC } from "hono/jsx";
import type { Errors } from "../lib/validation.js";
import type { PasswordRow, ServerCredentialRow } from "../repo/types.js";
import { CopyButton, Field, Icon, describedBy } from "./components/ui.js";
import { Layout } from "./Layout.js";

export interface VaultProps {
  passwords: PasswordRow[];
  serverCredentials: ServerCredentialRow[];
  /** Arama yapılmamış haldeki toplam şifre sayısı. */
  total: number;
  q: string;
  usernames: string[];
  add: QuickAddProps;
  /** Az önce eklenen kayıt; listede vurgulanır. */
  newId?: number | undefined;
  flash?: string | undefined;
}

export const PasswordsPage: FC<VaultProps> = (p) => (
  <Layout title="Şifreler" section="passwords" flash={p.flash}>
    <div class="page-head vault-head">
      <h1>Şifreler</h1>
      <p class="muted">Siteler, uygulamalar, cihazlar… Şifreler veritabanında şifrelenmiş saklanır.</p>
    </div>
    <QuickAdd {...p.add} />
    <datalist id="dl-usernames">
      {p.usernames.map((u) => (
        <option value={u} />
      ))}
    </datalist>
    {p.total || p.serverCredentials.length || p.q ? (
      <form
        class="toolbar vault-toolbar"
        action="/passwords"
        method="get"
        role="search"
        hx-get="/passwords"
        hx-target="#vault-results"
        hx-swap="outerHTML"
        hx-trigger="input changed delay:200ms from:#vault-q, submit"
        hx-sync="this:replace"
        hx-push-url="true"
      >
        <div class="search">
          <Icon name="search" />
          <input
            id="vault-q"
            type="search"
            name="q"
            value={p.q}
            placeholder="Site, kullanıcı adı, adres, not…"
            aria-label="Şifrelerde ara"
            autocomplete="off"
            spellcheck={false}
            data-shortcut="/"
          />
          <kbd class="hide-sm">/</kbd>
        </div>
      </form>
    ) : null}
    <VaultResults {...p} />
    <dialog id="password-dialog" class="dialog dialog-wide" aria-label="Şifre">
      <div id="password-dialog-body" />
    </dialog>
  </Layout>
);

export const VaultResults: FC<Pick<VaultProps, "passwords" | "serverCredentials" | "total" | "q" | "newId">> = (p) => (
  <section id="vault-results" class="vault-results" aria-live="polite">
    {p.total === 0 && !p.q ? (
      <div class="panel empty vault-empty">
        <h2>Henüz şifre yok</h2>
        <p>Yukarıdaki satıra ne için olduğunu, kullanıcı adını ve şifreyi yazıp Enter'a bas. Hepsi bu.</p>
      </div>
    ) : p.passwords.length === 0 ? (
      <div class="panel empty vault-empty">
        <h2>"{p.q}" ile eşleşen şifre yok</h2>
        <p>
          <a class="link" href="/passwords">
            Aramayı temizle
          </a>
        </p>
      </div>
    ) : (
      <section class="panel" aria-labelledby="h-vault">
        <header class="panel-head">
          <h2 id="h-vault">
            {p.q ? `${p.passwords.length} / ${p.total} şifre` : `${p.total} şifre`}
          </h2>
        </header>
        <ul class="cred-list vault-list">
          {p.passwords.map((pw) => (
            <PasswordItem pw={pw} isNew={pw.id === p.newId} />
          ))}
        </ul>
      </section>
    )}
    {p.serverCredentials.length ? (
      <section class="panel" aria-labelledby="h-server-creds">
        <header class="panel-head">
          <h2 id="h-server-creds">Sunucu erişim bilgileri</h2>
          <span class="muted panel-note hide-sm">Düzenlemek için sunucu sayfasına git</span>
        </header>
        <ul class="cred-list vault-list">
          {p.serverCredentials.map((c) => (
            <ServerCredentialItem c={c} />
          ))}
        </ul>
      </section>
    ) : null}
  </section>
);

const hostOf = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/** Göster/gizle + kopyala; app.js `.cred-secret` içindeki `[data-reveal]` butonunu bekler. */
const SecretCell: FC<{ has: boolean; url: string }> = ({ has, url }) => (
  <div class="cred-secret">
    {has ? (
      <>
        <span class="secret">
          <code class="masked" aria-label="Gizli şifre">
            ••••••••••
          </code>
        </span>
        <button type="button" class="icon-btn" data-reveal={url} aria-label="Şifreyi göster" title="Göster">
          <Icon name="eye" size={14} class="i-show" />
          <Icon name="eyeOff" size={14} class="i-hide" />
        </button>
        <button type="button" class="icon-btn copy" data-copy-url={url} aria-label="Şifreyi kopyala" title="Şifreyi kopyala">
          <Icon name="copy" size={14} />
        </button>
      </>
    ) : (
      <span class="none">şifre yok</span>
    )}
  </div>
);

const UserCell: FC<{ username: string }> = ({ username }) => (
  <div class="cred-user">
    {username ? (
      <>
        <code>{username}</code>
        <CopyButton value={username} label="Kullanıcı adını kopyala" />
      </>
    ) : (
      <span class="none">kullanıcı adı yok</span>
    )}
  </div>
);

const OpenLink: FC<{ url: string }> = ({ url }) =>
  url ? (
    <a class="icon-btn" href={url} target="_blank" rel="noopener noreferrer" title={url} aria-label="Adresi aç">
      <Icon name="external" size={14} />
    </a>
  ) : null;

const PasswordItem: FC<{ pw: PasswordRow; isNew: boolean }> = ({ pw, isNew }) => (
  <li class={isNew ? "cred is-new" : "cred"} id={`pw-${pw.id}`}>
    <div class="cred-label">
      <span class="site-mark" aria-hidden="true">
        {(pw.title.match(/[\p{L}\p{N}]/u)?.[0] ?? "•").toLocaleUpperCase("tr-TR")}
      </span>
      <span class="cred-title">
        <span>{pw.title}</span>
        {pw.url && hostOf(pw.url) !== pw.title ? <span class="sub">{hostOf(pw.url)}</span> : null}
      </span>
    </div>
    <UserCell username={pw.username} />
    <SecretCell has={!!pw.has_secret} url={`/passwords/${pw.id}/secret`} />
    <div class="cred-actions">
      <OpenLink url={pw.url} />
      <a
        class="icon-btn"
        href={`/passwords/${pw.id}/edit`}
        hx-get={`/passwords/${pw.id}/edit`}
        hx-target="#password-dialog-body"
        aria-label={`${pw.title} düzenle`}
        title="Düzenle"
      >
        <Icon name="pencil" size={14} />
      </a>
    </div>
    {pw.notes ? <p class="cred-notes">{pw.notes}</p> : null}
  </li>
);

const ServerCredentialItem: FC<{ c: ServerCredentialRow }> = ({ c }) => (
  <li class="cred">
    <div class="cred-label">
      <span class="site-mark server-mark" aria-hidden="true">
        <Icon name="server" size={14} />
      </span>
      <span class="cred-title">
        <span>{c.label}</span>
        <span class="sub mono">{c.hostname}</span>
      </span>
    </div>
    <UserCell username={c.username} />
    <SecretCell has={!!c.has_secret} url={`/servers/${c.server_id}/credentials/${c.id}/secret`} />
    <div class="cred-actions">
      <OpenLink url={c.url} />
      <a class="icon-btn" href={`/servers/${c.server_id}#credentials`} aria-label={`${c.hostname} sunucusuna git`} title="Sunucuya git">
        <Icon name="server" size={14} />
      </a>
    </div>
  </li>
);

// ---- Hızlı ekleme ------------------------------------------------------------------

export interface QuickAddProps {
  values: Record<string, string>;
  errors: Errors;
  /** Sayfa açılınca ilk alana odaklan (az önce kayıt eklendiyse ya da hiç kayıt yoksa). */
  focus?: boolean;
}

const QuickField: FC<{ name: string; label: string; error?: string | undefined; class?: string; children: Child }> = (
  p,
) => (
  <div class={`field ${p.error ? "has-error" : ""} ${p.class ?? ""}`}>
    <label for={`qa-${p.name}`} class="sr-only">
      {p.label}
    </label>
    {p.children}
    {p.error ? (
      <p class="field-error" id={`qe-${p.name}`}>
        {p.error}
      </p>
    ) : null}
  </div>
);

const qaInvalid = (errors: Errors, name: string) =>
  errors[name] ? { "aria-invalid": "true", "aria-describedby": `qe-${name}` } : {};

export const QuickAdd: FC<QuickAddProps> = ({ values, errors, focus }) => {
  const moreOpen = !!(values.url || values.notes || errors.url || errors.notes);
  return (
    <form
      id="quick-add"
      class="panel quick-add"
      method="post"
      action="/passwords"
      hx-post="/passwords"
      hx-target="this"
      hx-swap="outerHTML"
      autocomplete="off"
    >
      <h2 class="sr-only">Yeni şifre ekle</h2>
      <div class="quick-row">
        <QuickField name="title" label="Ne için" error={errors.title}>
          <input
            id="qa-title"
            name="title"
            value={values.title ?? ""}
            placeholder="Ne için? (Gmail, github.com, modem…)"
            data-shortcut="n"
            autofocus={focus || !!errors.title}
            {...qaInvalid(errors, "title")}
          />
        </QuickField>
        <QuickField name="username" label="Kullanıcı adı veya e-posta" error={errors.username}>
          <input
            id="qa-username"
            name="username"
            value={values.username ?? ""}
            class="mono"
            list="dl-usernames"
            placeholder="Kullanıcı adı / e-posta"
            spellcheck={false}
            autocomplete="off"
            {...qaInvalid(errors, "username")}
          />
        </QuickField>
        <QuickField name="secret" label="Şifre" error={errors.secret}>
          <div class="input-group">
            <input
              id="qa-secret"
              name="secret"
              type="password"
              class="mono"
              placeholder="Şifre"
              autocomplete="new-password"
              spellcheck={false}
              autofocus={!!errors.secret && !errors.title}
              {...qaInvalid(errors, "secret")}
            />
            <button type="button" class="icon-btn" data-toggle-password="qa-secret" aria-label="Şifreyi göster/gizle" title="Göster/gizle">
              <Icon name="eye" size={14} />
            </button>
            <button
              type="button"
              class="icon-btn"
              data-generate-password="qa-secret"
              data-copy-generated
              title="Güçlü şifre üret (panoya da kopyalanır)"
              aria-label="Güçlü şifre üret"
            >
              <Icon name="key" size={14} />
            </button>
          </div>
        </QuickField>
        <button type="submit" class="btn btn-primary quick-submit">
          <Icon name="plus" />
          Ekle
        </button>
      </div>
      <details class="quick-more" open={moreOpen}>
        <summary>Adres ve not ekle</summary>
        <div class="form-grid cols-2">
          <QuickField name="url" label="Adres" error={errors.url}>
            <input
              id="qa-url"
              name="url"
              value={values.url ?? ""}
              placeholder="Adres (örn. github.com/login)"
              inputmode="url"
              spellcheck={false}
              {...qaInvalid(errors, "url")}
            />
          </QuickField>
          <QuickField name="notes" label="Not" error={errors.notes}>
            <input id="qa-notes" name="notes" value={values.notes ?? ""} placeholder="Not (güvenlik sorusu, PIN ipucu…)" />
          </QuickField>
        </div>
      </details>
      <p class="quick-hint hide-sm">
        İpucu: Başlığa adres yapıştırırsan (github.com/login gibi) adres alanı kendiliğinden dolar.{" "}
        <kbd>N</kbd> ile buraya gelirsin, <kbd>Enter</kbd> kaydeder.
      </p>
    </form>
  );
};

// ---- Düzenleme ---------------------------------------------------------------------

export interface PasswordFormProps {
  id: number;
  hasSecret: boolean;
  values: Record<string, string>;
  errors: Errors;
  /** Dialog içinde mi (htmx) yoksa tam sayfa mı (JS yok) gösteriliyor. */
  standalone?: boolean;
}

export const PasswordForm: FC<PasswordFormProps> = (p) => {
  const action = `/passwords/${p.id}`;
  return (
    <form method="post" action={action} hx-post={action} hx-target="#password-dialog-body" class="cred-form" autocomplete="off">
      <h2>Şifreyi düzenle</h2>
      <div class="form-grid cols-2">
        <Field label="Ne için" name="title" error={p.errors.title} class="span-all">
          <input
            id="f-title"
            name="title"
            value={p.values.title ?? ""}
            required
            autofocus
            aria-invalid={p.errors.title ? "true" : undefined}
            {...describedBy("title", p.errors.title)}
          />
        </Field>
        <Field label="Kullanıcı adı" name="username" error={p.errors.username}>
          <input
            id="f-username"
            name="username"
            value={p.values.username ?? ""}
            class="mono"
            list="dl-usernames"
            spellcheck={false}
            autocomplete="off"
          />
        </Field>
        <Field
          label="Şifre"
          name="secret"
          error={p.errors.secret}
          hint={p.hasSecret ? "Değiştirmek istemiyorsan boş bırak." : undefined}
        >
          <div class="input-group">
            <input
              id="f-secret"
              name="secret"
              type="password"
              class="mono"
              autocomplete="new-password"
              spellcheck={false}
              placeholder={p.hasSecret ? "••••••••  (kayıtlı)" : ""}
              {...describedBy("secret", p.errors.secret, p.hasSecret ? "1" : undefined)}
            />
            <button type="button" class="icon-btn" data-toggle-password="f-secret" aria-label="Şifreyi göster/gizle">
              <Icon name="eye" size={14} />
            </button>
            <button
              type="button"
              class="icon-btn"
              data-generate-password="f-secret"
              data-copy-generated
              title="Güçlü şifre üret (panoya da kopyalanır)"
              aria-label="Güçlü şifre üret"
            >
              <Icon name="key" size={14} />
            </button>
          </div>
        </Field>
        {p.hasSecret ? (
          <label class="check span-all">
            <input type="checkbox" name="clear_secret" value="1" />
            Kayıtlı şifreyi sil
          </label>
        ) : null}
        <Field label="Adres" name="url" error={p.errors.url} class="span-all">
          <input
            id="f-url"
            name="url"
            value={p.values.url ?? ""}
            inputmode="url"
            placeholder="github.com/login"
            spellcheck={false}
            aria-invalid={p.errors.url ? "true" : undefined}
            {...describedBy("url", p.errors.url)}
          />
        </Field>
        <Field label="Not" name="notes" error={p.errors.notes} class="span-all">
          <textarea id="f-notes" name="notes" rows={3}>
            {p.values.notes ?? ""}
          </textarea>
        </Field>
      </div>
      <div class="dialog-actions">
        {/* Kaydet DOM'da ilk submit butonu olmalı: alanda Enter'a basınca varsayılan buton o çalışır,
            sil değil. Görsel sıra CSS'te (order). */}
        <button type="submit" class="btn btn-primary">
          Kaydet
        </button>
        <button
          type="submit"
          class="btn btn-danger-ghost push-left"
          formaction={`/passwords/${p.id}/delete`}
          hx-post={`/passwords/${p.id}/delete`}
          hx-trigger="confirmed"
          data-confirm="Silmeyi onayla"
        >
          <Icon name="trash" size={14} />
          Sil
        </button>
        {p.standalone ? (
          <a class="btn btn-ghost" href="/passwords">
            Vazgeç
          </a>
        ) : (
          <button type="button" class="btn btn-ghost" data-close-dialog>
            Vazgeç
          </button>
        )}
      </div>
    </form>
  );
};

/** JS kapalıyken düzenleme formu tam sayfa olarak gösterilir. */
export const PasswordFormPage: FC<PasswordFormProps> = (p) => (
  <Layout title="Şifreyi düzenle" section="passwords">
    <div class="page-head">
      <a class="back" href="/passwords">
        <Icon name="back" />
        Şifreler
      </a>
    </div>
    <div class="panel pad-lg narrow">
      <PasswordForm {...p} standalone />
    </div>
  </Layout>
);
