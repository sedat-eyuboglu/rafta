import type { FC } from "hono/jsx";
import { capacity, daysUntil, money, num } from "../lib/format.js";
import { ENVIRONMENTS, STATUSES, type Currency, type Environment, type Status } from "../lib/labels.js";
import type { ListFilter, SortKey } from "../repo/servers.js";
import type { Stats } from "../repo/stats.js";
import type { Server } from "../repo/types.js";
import { CopyButton, EnvBadge, Icon, StatusDot } from "./components/ui.js";
import { Layout } from "./Layout.js";

export interface ListProps {
  servers: Server[];
  filter: ListFilter;
  stats: Stats;
  providers: string[];
  tags: string[];
  flash?: string | undefined;
}

/** Filtre durumunu sorgu dizgesine çevirir; `patch` ile tek alan değiştirilebilir. */
export function filterQuery(f: ListFilter, patch: Partial<ListFilter> = {}): string {
  const m = { ...f, ...patch };
  const qs = new URLSearchParams();
  if (m.q) qs.set("q", m.q);
  for (const e of m.environment ?? []) qs.append("env", e);
  for (const s of m.status ?? []) qs.append("status", s);
  if (m.provider) qs.set("provider", m.provider);
  if (m.tag) qs.set("tag", m.tag);
  if (m.sort && m.sort !== "hostname") qs.set("sort", m.sort);
  if (m.sort && m.dir === "desc") qs.set("dir", "desc");
  const s = qs.toString();
  return s ? `?${s}` : "";
}

const isFiltered = (f: ListFilter) =>
  !!(f.q || f.environment?.length || f.status?.length || f.provider || f.tag);

export const ServerListPage: FC<ListProps> = (p) => (
  <Layout title="Sunucular" flash={p.flash}>
    <Overview stats={p.stats} />
    <form
      id="filters"
      class="toolbar"
      action="/"
      method="get"
      role="search"
      hx-get="/"
      hx-target="#results"
      hx-swap="outerHTML"
      hx-trigger="input changed delay:250ms from:#q, change, submit"
      hx-sync="this:replace"
      hx-push-url="true"
    >
      <div class="search">
        <Icon name="search" />
        <input
          id="q"
          type="search"
          name="q"
          value={p.filter.q ?? ""}
          placeholder="Hostname, IP, OS, etiket, not…"
          aria-label="Sunucularda ara"
          autocomplete="off"
          spellcheck={false}
          data-shortcut="/"
        />
        <kbd class="hide-sm">/</kbd>
      </div>
      <div class="filter-row">
        <fieldset class="chips">
          <legend>Ortam</legend>
          {(Object.keys(ENVIRONMENTS) as Environment[]).map((e) => (
            <label class="chip">
              <input type="checkbox" name="env" value={e} checked={p.filter.environment?.includes(e)} />
              <span>{ENVIRONMENTS[e]}</span>
            </label>
          ))}
        </fieldset>
        <fieldset class="chips">
          <legend>Durum</legend>
          {(Object.keys(STATUSES) as Status[]).map((s) => (
            <label class="chip">
              <input type="checkbox" name="status" value={s} checked={p.filter.status?.includes(s)} />
              <span>
                <span class={`led led-${s}`} aria-hidden="true" />
                {STATUSES[s]}
              </span>
            </label>
          ))}
        </fieldset>
        {p.providers.length ? (
          <label class="select-filter">
            <span>Sağlayıcı</span>
            <select name="provider">
              <option value="">Tümü</option>
              {p.providers.map((v) => (
                <option value={v} selected={v === p.filter.provider}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {p.tags.length ? (
          <label class="select-filter">
            <span>Etiket</span>
            <select name="tag">
              <option value="">Tümü</option>
              {p.tags.map((v) => (
                <option value={v} selected={v === p.filter.tag}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <noscript>
          <button class="btn" type="submit">
            Uygula
          </button>
        </noscript>
      </div>
      <SortState filter={p.filter} />
    </form>
    <Results servers={p.servers} filter={p.filter} total={p.stats.total} />
  </Layout>
);

/** Sıralama, filtre formuyla birlikte gönderilsin diye gizli alanlarda tutulur. */
export const SortState: FC<{ filter: ListFilter; oob?: boolean }> = ({ filter, oob }) => (
  <span id="sort-state" hidden {...(oob ? { "hx-swap-oob": "true" } : {})}>
    {filter.sort && filter.sort !== "hostname" ? <input type="hidden" name="sort" value={filter.sort} /> : null}
    {filter.dir === "desc" ? <input type="hidden" name="dir" value="desc" /> : null}
  </span>
);

const Overview: FC<{ stats: Stats }> = ({ stats }) => {
  if (stats.total === 0) return null;
  const order: Status[] = ["active", "maintenance", "offline", "retired"];
  let x = 0;
  const costs = Object.entries(stats.monthlyCost) as [Currency, number][];
  return (
    <section class="overview" aria-label="Özet">
      <div class="overview-main">
        <h1 class="overview-count">
          {stats.total} <span>sunucu</span>
        </h1>
        <svg class="status-bar" viewBox={`0 0 ${stats.total} 1`} preserveAspectRatio="none" aria-hidden="true">
          {order.map((s) => {
            const n = stats.byStatus[s] ?? 0;
            const rect = n ? <rect class={`seg-${s}`} x={x} y="0" width={n} height="1" /> : null;
            x += n;
            return rect;
          })}
        </svg>
        <ul class="legend">
          {order
            .filter((s) => stats.byStatus[s])
            .map((s) => (
              <li>
                <a href={`/?status=${s}`}>
                  <span class={`led led-${s}`} aria-hidden="true" />
                  {STATUSES[s]} <b>{stats.byStatus[s]}</b>
                </a>
              </li>
            ))}
        </ul>
      </div>
      <dl class="overview-facts">
        <div>
          <dt>Ortamlar</dt>
          <dd class="env-counts">
            {(Object.keys(ENVIRONMENTS) as Environment[])
              .filter((e) => stats.byEnvironment[e])
              .map((e) => (
                <a href={`/?env=${e}`}>
                  {ENVIRONMENTS[e]} <b>{stats.byEnvironment[e]}</b>
                </a>
              ))}
          </dd>
        </div>
        {costs.length ? (
          <div>
            <dt>Aylık maliyet</dt>
            <dd class="costs">
              {costs.map(([c, cents]) => (
                <span>{money(cents, c)}</span>
              ))}
            </dd>
          </div>
        ) : null}
      </dl>
      {stats.renewalsDue.length ? (
        <div class="renewals" role="note">
          <Icon name="alert" />
          <span>Yenileme yaklaşıyor:</span>
          <ul>
            {stats.renewalsDue.map((r) => {
              const d = daysUntil(r.renewal_date);
              return (
                <li>
                  <a href={`/servers/${r.id}`}>{r.hostname}</a>{" "}
                  <span class={d < 0 ? "overdue" : ""}>
                    {d < 0 ? `${-d} gün geçti` : d === 0 ? "bugün" : `${d} gün`}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
};

const SortHeader: FC<{ label: string; sort: SortKey; filter: ListFilter; class?: string }> = (p) => {
  const active = (p.filter.sort ?? "hostname") === p.sort;
  const dir = active && p.filter.dir !== "desc" ? "desc" : "asc";
  const href = `/${filterQuery(p.filter, { sort: p.sort, dir })}` || "/";
  return (
    <th
      scope="col"
      class={p.class}
      aria-sort={active ? (p.filter.dir === "desc" ? "descending" : "ascending") : undefined}
    >
      <a href={href} hx-get={href} hx-target="#results" hx-swap="outerHTML" hx-push-url="true" class="sort">
        {p.label}
        <span class="sort-arrow" aria-hidden="true">
          {active ? (p.filter.dir === "desc" ? "↓" : "↑") : ""}
        </span>
      </a>
    </th>
  );
};

export const Results: FC<{ servers: Server[]; filter: ListFilter; total: number; oob?: boolean }> = (p) => {
  const filtered = isFiltered(p.filter);
  const exportHref = `/export.csv${filterQuery(p.filter)}`;
  return (
    <section id="results" class="results" aria-live="polite">
      {p.oob ? <SortState filter={p.filter} oob /> : null}
      {p.total === 0 ? (
        <div class="empty">
          <div class="empty-rack" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <h2>Raf henüz boş</h2>
          <p>İlk sunucunu ekle; hostname, IP adresleri ve erişim bilgileri tek yerde dursun.</p>
          <a class="btn btn-primary" href="/servers/new">
            <Icon name="plus" />
            Sunucu ekle
          </a>
        </div>
      ) : p.servers.length === 0 ? (
        <div class="empty">
          <h2>Bu filtrelere uyan sunucu yok</h2>
          <p>Aramayı kısaltmayı ya da filtreleri kaldırmayı dene.</p>
          <a class="btn" href="/">
            Filtreleri temizle
          </a>
        </div>
      ) : (
        <>
          <div class="results-head">
            <p>
              {filtered ? (
                <>
                  <b>{p.servers.length}</b> / {p.total} sunucu gösteriliyor ·{" "}
                  <a href="/" class="link">
                    filtreleri temizle
                  </a>
                </>
              ) : (
                <>
                  <b>{p.servers.length}</b> sunucu
                </>
              )}
            </p>
            <a class="btn btn-ghost btn-sm" href={exportHref} download>
              <Icon name="download" size={14} />
              CSV indir
            </a>
          </div>
          <div class="table-wrap">
            <table class="servers">
              <thead>
                <tr>
                  <SortHeader label="Hostname" sort="hostname" filter={p.filter} />
                  <th scope="col">IP</th>
                  <SortHeader label="Ortam" sort="environment" filter={p.filter} />
                  <SortHeader label="İşletim sistemi" sort="os" filter={p.filter} class="col-os" />
                  <SortHeader label="CPU" sort="cpu" filter={p.filter} class="num" />
                  <SortHeader label="RAM" sort="ram" filter={p.filter} class="num" />
                  <SortHeader label="Disk" sort="disk" filter={p.filter} class="num col-disk" />
                  <SortHeader label="Sağlayıcı" sort="provider" filter={p.filter} class="col-provider" />
                  <SortHeader label="Aylık" sort="cost" filter={p.filter} class="num col-cost" />
                  <th scope="col" class="col-tags">
                    Etiketler
                  </th>
                </tr>
              </thead>
              <tbody>
                {p.servers.map((s) => (
                  <Row s={s} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
};

const Row: FC<{ s: Server }> = ({ s }) => {
  const primary = s.ips[0];
  const os = [s.os_name, s.os_version].filter(Boolean).join(" ");
  return (
    <tr class={s.status === "retired" ? "is-retired" : undefined}>
      <td class="host" data-label="Hostname">
        <div class="host-inner">
        <StatusDot status={s.status} />
        <div>
          <a class="host-link" href={`/servers/${s.id}`}>
            {s.hostname}
          </a>
          {s.role ? <span class="role">{s.role}</span> : null}
        </div>
        </div>
      </td>
      <td class="ip" data-label="IP">
        {primary ? (
          <span class="ip-cell">
            <code>{primary.address}</code>
            <CopyButton value={primary.address.split("/")[0]!} label={`${primary.address} kopyala`} />
            {s.ips.length > 1 ? (
              <span class="more" title={s.ips.slice(1).map((i) => i.address).join("\n")}>
                +{s.ips.length - 1}
              </span>
            ) : null}
          </span>
        ) : (
          <span class="none">—</span>
        )}
      </td>
      <td data-label="Ortam">
        <EnvBadge env={s.environment} />
      </td>
      <td class="col-os" data-label="OS">
        {os || <span class="none">—</span>}
      </td>
      <td class="num" data-label="CPU">
        {s.cpu_cores ? `${s.cpu_cores} çekirdek` : <span class="none">—</span>}
      </td>
      <td class="num" data-label="RAM">
        {s.ram_gb ? `${num(s.ram_gb)} GB` : <span class="none">—</span>}
      </td>
      <td class="num col-disk" data-label="Disk">
        {s.disk_gb ? capacity(s.disk_gb) : <span class="none">—</span>}
      </td>
      <td class="col-provider" data-label="Sağlayıcı">
        {s.provider || s.location ? (
          <>
            {s.provider}
            {s.location ? <span class="sub">{s.location}</span> : null}
          </>
        ) : (
          <span class="none">—</span>
        )}
      </td>
      <td class="num col-cost" data-label="Aylık">
        {s.monthly_cost_cents != null ? money(s.monthly_cost_cents, s.currency) : <span class="none">—</span>}
      </td>
      <td class="col-tags" data-label="Etiketler">
        {s.tags.length ? (
          <span class="tags">
            {s.tags.map((t) => (
              <span class="tag">{t}</span>
            ))}
          </span>
        ) : null}
      </td>
    </tr>
  );
};
