import type { FC } from "hono/jsx";
import { capacity, date, dateTime, daysUntil, money, num, relative } from "../lib/format.js";
import { FIELD_LABELS, IP_KINDS, SERVER_TYPES } from "../lib/labels.js";
import type { Errors } from "../lib/validation.js";
import { groupByEvent } from "../repo/history.js";
import type { CredentialRow, HistoryRow, Server } from "../repo/types.js";
import { CopyButton, EnvBadge, Field, Icon, StatusDot, describedBy } from "./components/ui.js";
import { Layout } from "./Layout.js";

export interface DetailProps {
  server: Server;
  credentials: CredentialRow[];
  history: HistoryRow[];
  flash?: string | undefined;
}

/** Birincil adres + ilk kullanıcı adı ile hazır SSH komutu. */
function sshCommand(s: Server, creds: CredentialRow[]): string | undefined {
  const ip = s.ips[0]?.address.split("/")[0];
  if (!ip) return undefined;
  const user = creds.find((c) => /ssh/i.test(c.label) && c.username)?.username;
  const target = user ? `${user}@${ip}` : ip;
  return s.ssh_port === 22 ? `ssh ${target}` : `ssh -p ${s.ssh_port} ${target}`;
}

export const ServerDetailPage: FC<DetailProps> = ({ server: s, credentials, history, flash }) => {
  const ssh = sshCommand(s, credentials);
  return (
    <Layout title={s.hostname} flash={flash}>
      <div class="page-head detail-head">
        <a class="back" href="/">
          <Icon name="back" />
          Sunucular
        </a>
        <div class="detail-title">
          <div class="detail-title-main">
            <h1 class="asset-label">{s.hostname}</h1>
            <div class="detail-badges">
              <StatusDot status={s.status} label />
              <EnvBadge env={s.environment} />
            </div>
            {s.role ? <p class="detail-role">{s.role}</p> : null}
          </div>
          <div class="detail-actions">
            <a class="btn" href={`/servers/${s.id}/edit`} data-shortcut="e">
              <Icon name="pencil" />
              Düzenle
            </a>
            <button type="button" class="btn btn-danger-ghost" data-open-dialog="delete-dialog">
              <Icon name="trash" />
              Sil
            </button>
          </div>
        </div>
      </div>

      <div class="detail-grid">
        <div class="detail-main">
          <section class="panel" aria-labelledby="h-network">
            <header class="panel-head">
              <h2 id="h-network">Ağ</h2>
            </header>
            {s.ips.length ? (
              <ul class="ip-list">
                {s.ips.map((ip) => (
                  <li>
                    <code>{ip.address}</code>
                    <CopyButton value={ip.address.split("/")[0]!} label={`${ip.address} kopyala`} />
                    <span class={`ip-kind kind-${ip.kind}`}>{IP_KINDS[ip.kind]}</span>
                    {ip.label ? <span class="sub">{ip.label}</span> : null}
                    {ip.is_primary && s.ips.length > 1 ? <span class="primary-mark">birincil</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p class="muted pad">IP adresi girilmemiş.</p>
            )}
            {ssh ? (
              <div class="ssh">
                <Icon name="terminal" />
                <code>{ssh}</code>
                <CopyButton value={ssh} label="SSH komutunu kopyala" />
              </div>
            ) : null}
          </section>

          <CredentialsPanel serverId={s.id} credentials={credentials} />

          {s.notes ? (
            <section class="panel" aria-labelledby="h-notes">
              <header class="panel-head">
                <h2 id="h-notes">Notlar</h2>
              </header>
              <div class="notes">{s.notes}</div>
            </section>
          ) : null}

          <HistoryPanel history={history} />
        </div>

        <aside class="detail-side">
          <SpecSheet s={s} />
        </aside>
      </div>

      <dialog id="delete-dialog" class="dialog" aria-labelledby="delete-title">
        <form method="post" action={`/servers/${s.id}/delete`}>
          <h2 id="delete-title">{s.hostname} silinsin mi?</h2>
          <p>
            Sunucu{credentials.length ? `, ${credentials.length} erişim bilgisi` : ""} ve IP adresleriyle birlikte kalıcı
            olarak silinir. Değişiklik geçmişinde silindiğine dair kayıt kalır.
          </p>
          <div class="dialog-actions">
            <button type="button" class="btn btn-ghost" data-close-dialog>
              Vazgeç
            </button>
            <button type="submit" class="btn btn-danger">
              Sunucuyu sil
            </button>
          </div>
        </form>
      </dialog>
      <dialog id="credential-dialog" class="dialog dialog-wide" aria-label="Erişim bilgisi">
        <div id="credential-dialog-body" />
      </dialog>
    </Layout>
  );
};

const SpecSheet: FC<{ s: Server }> = ({ s }) => {
  const renewal = s.renewal_date ? daysUntil(s.renewal_date) : null;
  const os = [s.os_name, s.os_version].filter(Boolean).join(" ");
  const rows: [string, unknown][][] = [
    [
      ["Tip", s.type ? SERVER_TYPES[s.type] : null],
      ["CPU", s.cpu_cores ? `${s.cpu_cores} çekirdek` : null],
      ["RAM", s.ram_gb ? `${num(s.ram_gb)} GB` : null],
      ["Disk", s.disk_gb ? capacity(s.disk_gb) : null],
      ["Depolama", s.storage_note || null],
      ["İşletim sistemi", os || null],
    ],
    [
      ["Sağlayıcı", s.provider || null],
      ["Konum", s.location || null],
      ["Rack", s.rack || null],
    ],
    [
      ["Sorumlu", s.owner || null],
      ["Aylık maliyet", s.monthly_cost_cents != null ? money(s.monthly_cost_cents, s.currency) : null],
      [
        "Yenileme",
        s.renewal_date ? (
          <>
            {date(s.renewal_date)}
            {renewal != null && renewal <= 30 && s.status !== "retired" ? (
              <span class={`due ${renewal < 0 ? "overdue" : ""}`}>
                {renewal < 0 ? `${-renewal} gün geçti` : renewal === 0 ? "bugün" : `${renewal} gün kaldı`}
              </span>
            ) : null}
          </>
        ) : null,
      ],
    ],
  ];
  const titles = ["Donanım", "Konum", "Sahiplik"];
  return (
    <div class="spec-sheet">
      {rows.map((group, i) => {
        const filled = group.filter(([, v]) => v != null);
        return (
          <section aria-labelledby={`spec-${i}`}>
            <h2 id={`spec-${i}`}>{titles[i]}</h2>
            {filled.length ? (
              <dl>
                {filled.map(([k, v]) => (
                  <div>
                    <dt>{k}</dt>
                    <dd>{v as string}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p class="muted">Bilgi girilmemiş.</p>
            )}
          </section>
        );
      })}
      {s.tags.length ? (
        <section aria-labelledby="spec-tags">
          <h2 id="spec-tags">Etiketler</h2>
          <p class="tags">
            {s.tags.map((t) => (
              <a class="tag" href={`/?tag=${encodeURIComponent(t)}`}>
                {t}
              </a>
            ))}
          </p>
        </section>
      ) : null}
      <p class="timestamps">
        <span title={dateTime(s.created_at)}>Eklendi {date(s.created_at)}</span>
        <span title={dateTime(s.updated_at)}>Güncellendi {relative(s.updated_at)}</span>
      </p>
    </div>
  );
};

export const CredentialsPanel: FC<{ serverId: number; credentials: CredentialRow[] }> = ({ serverId, credentials }) => (
  <section class="panel" id="credentials" aria-labelledby="h-creds">
    <header class="panel-head">
      <h2 id="h-creds">Erişim bilgileri</h2>
      <a
        class="btn btn-ghost btn-sm"
        href={`/servers/${serverId}/credentials/new`}
        hx-get={`/servers/${serverId}/credentials/new`}
        hx-target="#credential-dialog-body"
        data-dialog="credential-dialog"
      >
        <Icon name="plus" size={14} />
        Ekle
      </a>
    </header>
    {credentials.length === 0 ? (
      <p class="muted pad">
        SSH, panel, iDRAC/iLO gibi giriş bilgilerini buraya ekle. Şifreler veritabanında şifrelenmiş saklanır.
      </p>
    ) : (
      <ul class="cred-list">
        {credentials.map((c) => (
          <li class="cred">
            <div class="cred-label">
              <Icon name="key" size={14} />
              <span>{c.label}</span>
            </div>
            <div class="cred-user">
              {c.username ? (
                <>
                  <code>{c.username}</code>
                  <CopyButton value={c.username} label="Kullanıcı adını kopyala" />
                </>
              ) : (
                <span class="none">kullanıcı adı yok</span>
              )}
            </div>
            <div class="cred-secret">
              {c.has_secret ? (
                <>
                  <span class="secret" data-secret-for={c.id}>
                    <code class="masked" aria-label="Gizli şifre">
                      ••••••••••
                    </code>
                  </span>
                  <button
                    type="button"
                    class="icon-btn"
                    data-reveal={`/servers/${serverId}/credentials/${c.id}/secret`}
                    aria-label="Şifreyi göster"
                    title="Göster"
                  >
                    <Icon name="eye" size={14} class="i-show" />
                    <Icon name="eyeOff" size={14} class="i-hide" />
                  </button>
                  <button
                    type="button"
                    class="icon-btn copy"
                    data-copy-url={`/servers/${serverId}/credentials/${c.id}/secret`}
                    aria-label="Şifreyi kopyala"
                    title="Şifreyi kopyala"
                  >
                    <Icon name="copy" size={14} />
                  </button>
                </>
              ) : (
                <span class="none">şifre yok</span>
              )}
            </div>
            <div class="cred-actions">
              {c.url ? (
                <a class="icon-btn" href={c.url} target="_blank" rel="noopener noreferrer" title={c.url} aria-label="Adresi aç">
                  <Icon name="external" size={14} />
                </a>
              ) : null}
              <a
                class="icon-btn"
                href={`/servers/${serverId}/credentials/${c.id}/edit`}
                hx-get={`/servers/${serverId}/credentials/${c.id}/edit`}
                hx-target="#credential-dialog-body"
                data-dialog="credential-dialog"
                aria-label={`${c.label} düzenle`}
                title="Düzenle"
              >
                <Icon name="pencil" size={14} />
              </a>
            </div>
            {c.notes ? <p class="cred-notes">{c.notes}</p> : null}
          </li>
        ))}
      </ul>
    )}
  </section>
);

export interface CredentialFormProps {
  serverId: number;
  credId?: number;
  hasSecret?: boolean;
  values: Record<string, string>;
  errors: Errors;
  /** Dialog içinde mi (htmx) yoksa tam sayfa mı (JS yok) gösteriliyor. */
  standalone?: boolean;
  hostname: string;
}

export const CredentialForm: FC<CredentialFormProps> = (p) => {
  const isEdit = p.credId != null;
  const action = isEdit ? `/servers/${p.serverId}/credentials/${p.credId}` : `/servers/${p.serverId}/credentials`;
  return (
    <form
      method="post"
      action={action}
      hx-post={action}
      hx-target="#credential-dialog-body"
      class="cred-form"
      autocomplete="off"
    >
      <h2>{isEdit ? "Erişim bilgisini düzenle" : `${p.hostname} için erişim bilgisi`}</h2>
      <div class="form-grid cols-2">
        <Field label="Ne için" name="label" error={p.errors.label} class="span-all">
          <input
            id="f-label"
            name="label"
            value={p.values.label ?? ""}
            list="dl-cred-labels"
            placeholder="SSH root, iDRAC, Plesk paneli…"
            required
            autofocus
            aria-invalid={p.errors.label ? "true" : undefined}
            {...describedBy("label", p.errors.label)}
          />
          <datalist id="dl-cred-labels">
            {["SSH", "SSH root", "iDRAC", "iLO", "IPMI", "Kontrol paneli", "Veritabanı", "Hypervisor"].map((v) => (
              <option value={v} />
            ))}
          </datalist>
        </Field>
        <Field label="Kullanıcı adı" name="username" error={p.errors.username}>
          <input
            id="f-username"
            name="username"
            value={p.values.username ?? ""}
            class="mono"
            spellcheck={false}
            autocomplete="off"
          />
        </Field>
        <Field
          label="Şifre"
          name="secret"
          error={p.errors.secret}
          hint={isEdit && p.hasSecret ? "Değiştirmek istemiyorsan boş bırak." : undefined}
        >
          <div class="input-group">
            <input
              id="f-secret"
              name="secret"
              type="password"
              class="mono"
              autocomplete="new-password"
              spellcheck={false}
              placeholder={isEdit && p.hasSecret ? "••••••••  (kayıtlı)" : ""}
              {...describedBy("secret", p.errors.secret, isEdit && p.hasSecret ? "1" : undefined)}
            />
            <button type="button" class="icon-btn" data-toggle-password="f-secret" aria-label="Şifreyi göster/gizle">
              <Icon name="eye" size={14} />
            </button>
            <button type="button" class="icon-btn" data-generate-password="f-secret" title="Güçlü şifre üret" aria-label="Güçlü şifre üret">
              <Icon name="key" size={14} />
            </button>
          </div>
        </Field>
        {isEdit && p.hasSecret ? (
          <label class="check span-all">
            <input type="checkbox" name="clear_secret" value="1" />
            Kayıtlı şifreyi sil
          </label>
        ) : null}
        <Field label="Adres" name="url" error={p.errors.url} class="span-all">
          <input
            id="f-url"
            name="url"
            type="url"
            value={p.values.url ?? ""}
            placeholder="https://10.0.0.5:8443"
            aria-invalid={p.errors.url ? "true" : undefined}
            {...describedBy("url", p.errors.url)}
          />
        </Field>
        <Field label="Not" name="notes" error={p.errors.notes} class="span-all">
          <textarea id="f-notes" name="notes" rows={2}>
            {p.values.notes ?? ""}
          </textarea>
        </Field>
      </div>
      <div class="dialog-actions">
        {/* Kaydet DOM'da ilk submit butonu olmalı: alanda Enter'a basınca varsayılan buton o çalışır,
            sil değil. Görsel sıra CSS'te (order). */}
        <button type="submit" class="btn btn-primary">
          {isEdit ? "Kaydet" : "Ekle"}
        </button>
        {isEdit ? (
          <button
            type="submit"
            class="btn btn-danger-ghost push-left"
            formaction={`/servers/${p.serverId}/credentials/${p.credId}/delete`}
            hx-post={`/servers/${p.serverId}/credentials/${p.credId}/delete`}
            hx-trigger="confirmed"
            data-confirm="Silmeyi onayla"
          >
            <Icon name="trash" size={14} />
            Sil
          </button>
        ) : null}
        {p.standalone ? (
          <a class="btn btn-ghost" href={`/servers/${p.serverId}`}>
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

/** JS kapalıyken erişim bilgisi formu tam sayfa olarak gösterilir. */
export const CredentialFormPage: FC<CredentialFormProps> = (p) => (
  <Layout title="Erişim bilgisi">
    <div class="page-head">
      <a class="back" href={`/servers/${p.serverId}`}>
        <Icon name="back" />
        {p.hostname}
      </a>
    </div>
    <div class="panel pad-lg narrow">
      <CredentialForm {...p} standalone />
    </div>
  </Layout>
);

const HistoryPanel: FC<{ history: HistoryRow[] }> = ({ history }) => {
  const groups = groupByEvent(history);
  return (
    <section class="panel" aria-labelledby="h-history">
      <header class="panel-head">
        <h2 id="h-history">Değişiklik geçmişi</h2>
      </header>
      {groups.length === 0 ? (
        <p class="muted pad">Kayıt yok.</p>
      ) : (
        <ol class="timeline">
          {groups.map((g) => (
            <li>
              <time datetime={g.at} title={dateTime(g.at)}>
                {relative(g.at)}
              </time>
              <ul>
                {g.rows.map((r) => (
                  <HistoryItem r={r} />
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
};

/** Çok satırlı alanlarda yalnızca çıkan ve eklenen satırlar gösterilir. */
const LineDiff: FC<{ oldValue: string; newValue: string }> = ({ oldValue, newValue }) => {
  const before = oldValue ? oldValue.split("\n") : [];
  const after = newValue ? newValue.split("\n") : [];
  const removed = before.filter((l) => !after.includes(l));
  const added = after.filter((l) => !before.includes(l));
  if (!removed.length && !added.length && before.length) {
    return <div class="h-diff"><span class="none">yalnızca sıra değişti</span></div>;
  }
  return (
    <div class="h-diff">
      {removed.map((l) => (
        <del>{l || " "}</del>
      ))}
      {added.map((l) => (
        <ins>{l || " "}</ins>
      ))}
      {!after.length ? <span class="none">boşaltıldı</span> : null}
    </div>
  );
};

const HistoryItem: FC<{ r: HistoryRow }> = ({ r }) => {
  if (r.action === "create") return <li class="h-create">Sunucu eklendi</li>;
  if (r.action === "delete") return <li class="h-delete">Sunucu silindi</li>;
  if (r.field === "credential") {
    if (r.old_value && r.new_value)
      return (
        <li>
          Erişim bilgisi güncellendi: <b>{r.new_value}</b>
        </li>
      );
    if (r.new_value)
      return (
        <li>
          Erişim bilgisi eklendi: <b>{r.new_value}</b>
        </li>
      );
    return (
      <li>
        Erişim bilgisi silindi: <b>{r.old_value}</b>
      </li>
    );
  }
  const label = FIELD_LABELS[r.field ?? ""] ?? r.field;
  const multiline = r.field === "ips" || r.field === "notes";
  return (
    <li class={multiline ? "h-block" : undefined}>
      <span class="h-field">{label}</span>
      {multiline ? (
        <LineDiff oldValue={r.old_value ?? ""} newValue={r.new_value ?? ""} />
      ) : (
        <span class="h-inline">
          {r.old_value ? <del>{r.old_value}</del> : <span class="none">boş</span>}
          <span aria-hidden="true">→</span>
          <span class="sr-only">yeni değer</span>
          {r.new_value ? <ins>{r.new_value}</ins> : <span class="none">boş</span>}
        </span>
      )}
    </li>
  );
};
