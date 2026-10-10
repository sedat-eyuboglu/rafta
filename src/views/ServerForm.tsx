import type { FC } from "hono/jsx";
import { moneyInput } from "../lib/format.js";
import { CURRENCIES, ENVIRONMENTS, IP_KINDS, SERVER_TYPES, STATUSES } from "../lib/labels.js";
import type { Errors, IpRow } from "../lib/validation.js";
import type { Server } from "../repo/types.js";
import { Datalist, Field, Icon, Options, describedBy } from "./components/ui.js";
import { Layout } from "./Layout.js";

export type FormValues = Record<string, string>;

export interface Suggestions {
  providers: string[];
  locations: string[];
  osNames: string[];
  owners: string[];
  tags: string[];
}

export interface FormProps {
  mode: "new" | "edit";
  id?: number;
  hostname?: string;
  values: FormValues;
  ips: IpRow[];
  primary: number;
  errors: Errors;
  suggestions: Suggestions;
}

export const EMPTY_VALUES: FormValues = { environment: "prod", status: "active", currency: "TRY", ssh_port: "22" };

export function serverToValues(s: Server): { values: FormValues; ips: IpRow[]; primary: number } {
  const v = (x: string | number | null) => (x == null ? "" : String(x));
  return {
    values: {
      hostname: s.hostname,
      role: s.role,
      environment: s.environment,
      status: s.status,
      type: v(s.type),
      cpu_cores: v(s.cpu_cores),
      ram_gb: s.ram_gb == null ? "" : String(s.ram_gb).replace(".", ","),
      disk_gb: v(s.disk_gb),
      storage_note: s.storage_note,
      provider: s.provider,
      location: s.location,
      rack: s.rack,
      os_name: s.os_name,
      os_version: s.os_version,
      owner: s.owner,
      monthly_cost: moneyInput(s.monthly_cost_cents),
      currency: s.currency,
      renewal_date: v(s.renewal_date),
      ssh_port: String(s.ssh_port),
      notes: s.notes,
      tags: s.tags.join(", "),
    },
    ips: s.ips.map((ip) => ({ address: ip.address, kind: ip.kind, label: ip.label })),
    primary: Math.max(
      0,
      s.ips.findIndex((ip) => ip.is_primary),
    ),
  };
}

export const ServerFormPage: FC<FormProps> = (p) => {
  const title = p.mode === "new" ? "Yeni sunucu" : `${p.hostname} düzenle`;
  const action = p.mode === "new" ? "/servers" : `/servers/${p.id}`;
  const cancel = p.mode === "new" ? "/" : `/servers/${p.id}`;
  const errorCount = Object.keys(p.errors).length;
  return (
    <Layout title={title}>
      <div class="page-head">
        <a class="back" href={cancel}>
          <Icon name="back" />
          {p.mode === "new" ? "Sunucular" : p.hostname}
        </a>
        <h1>{p.mode === "new" ? "Yeni sunucu" : "Sunucuyu düzenle"}</h1>
      </div>
      <form class="server-form" method="post" action={action} novalidate>
        {errorCount ? (
          <div class="form-alert" role="alert" tabindex={-1} data-autofocus>
            <Icon name="alert" />
            <span>
              {errorCount === 1 ? "Bir alan" : `${errorCount} alan`} düzeltilmeli. Kayıt yapılmadı; girdiklerin
              duruyor.
            </span>
          </div>
        ) : null}
        <GeneralSection {...p} />
        <NetworkSection {...p} />
        <HardwareSection {...p} />
        <LocationSection {...p} />
        <OwnershipSection {...p} />
        <section class="form-section">
          <div class="form-section-head">
            <h2>Notlar</h2>
            <p>Kurulum adımları, bağımlılıklar, dikkat edilecekler.</p>
          </div>
          <div class="form-grid">
            <Field label="Notlar" name="notes" error={p.errors.notes} class="span-all">
              <textarea id="f-notes" name="notes" rows={6} {...describedBy("notes", p.errors.notes)}>
                {p.values.notes ?? ""}
              </textarea>
            </Field>
          </div>
        </section>
        <div class="form-actions">
          <a class="btn btn-ghost" href={cancel}>
            Vazgeç
          </a>
          <button class="btn btn-primary" type="submit">
            {p.mode === "new" ? "Sunucuyu ekle" : "Değişiklikleri kaydet"}
          </button>
        </div>
      </form>
    </Layout>
  );
};

type SectionProps = FormProps;

const input = (p: SectionProps, name: string, attrs: Record<string, unknown> = {}) => (
  <input
    id={`f-${name}`}
    name={name}
    value={p.values[name] ?? ""}
    aria-invalid={p.errors[name] ? "true" : undefined}
    {...describedBy(name, p.errors[name], attrs["data-hint"] as string | undefined)}
    {...attrs}
  />
);

const GeneralSection: FC<SectionProps> = (p) => (
  <section class="form-section">
    <div class="form-section-head">
      <h2>Genel</h2>
      <p>Sunucuyu nasıl tanıdığın ve şu anki hali.</p>
    </div>
    <div class="form-grid">
      <Field label="Hostname" name="hostname" error={p.errors.hostname} class="span-2">
        {input(p, "hostname", {
          required: true,
          autocomplete: "off",
          spellcheck: false,
          class: "mono",
          placeholder: "web-01.example.com",
          autofocus: p.mode === "new",
        })}
      </Field>
      <Field label="Rol" name="role" error={p.errors.role} class="span-2">
        {input(p, "role", { placeholder: "Nginx reverse proxy, PostgreSQL primary…" })}
      </Field>
      <Field label="Ortam" name="environment" error={p.errors.environment} class="span-2">
        <div class="segmented" role="radiogroup" aria-label="Ortam">
          {Object.entries(ENVIRONMENTS).map(([k, v]) => (
            <label>
              <input type="radio" name="environment" value={k} checked={p.values.environment === k} />
              <span>{v}</span>
            </label>
          ))}
        </div>
      </Field>
      <Field label="Durum" name="status" error={p.errors.status}>
        <select id="f-status" name="status">
          <Options options={STATUSES} value={p.values.status ?? ""} />
        </select>
      </Field>
      <Field label="Etiketler" name="tags" error={p.errors.tags} hint="Virgülle ayır: web, kritik, yedekli">
        {input(p, "tags", { list: "dl-tags", autocomplete: "off", "data-hint": "1", "data-tags": "" })}
        <Datalist id="dl-tags" values={p.suggestions.tags} />
      </Field>
    </div>
  </section>
);

const NetworkSection: FC<SectionProps> = (p) => {
  const rows = p.ips.length ? p.ips : [{ address: "", kind: "public", label: "" }];
  return (
    <section class="form-section">
      <div class="form-section-head">
        <h2>Ağ</h2>
        <p>Birden fazla adres girebilirsin. Birincil adres listede ve SSH komutunda kullanılır.</p>
      </div>
      <div class="form-grid">
        <div class="span-all">
          <table class="ip-editor">
            <thead>
              <tr>
                <th scope="col">Adres</th>
                <th scope="col">Tür</th>
                <th scope="col">Açıklama</th>
                <th scope="col" class="center">
                  Birincil
                </th>
                <th scope="col">
                  <span class="sr-only">Sil</span>
                </th>
              </tr>
            </thead>
            <tbody data-ip-rows>
              {rows.map((row, i) => (
                <IpEditorRow row={row} index={i} primary={i === p.primary} error={p.errors[`ip_${i}`]} />
              ))}
            </tbody>
          </table>
          <template id="ip-row-template">
            <IpEditorRow row={{ address: "", kind: "private", label: "" }} index={0} primary={false} />
          </template>
          <button type="button" class="btn btn-ghost btn-sm" data-add-ip>
            <Icon name="plus" size={14} />
            Adres ekle
          </button>
        </div>
        <Field label="SSH portu" name="ssh_port" error={p.errors.ssh_port}>
          {input(p, "ssh_port", { inputmode: "numeric", class: "mono", placeholder: "22" })}
        </Field>
      </div>
    </section>
  );
};

const IpEditorRow: FC<{ row: IpRow; index: number; primary: boolean; error?: string | undefined }> = (p) => (
  <>
    <tr class={p.error ? "has-error" : undefined}>
      <td data-label="Adres">
        <input
          name="ip_address"
          value={p.row.address}
          class="mono"
          placeholder="203.0.113.10"
          autocomplete="off"
          spellcheck={false}
          aria-label="IP adresi"
          aria-invalid={p.error ? "true" : undefined}
        />
      </td>
      <td data-label="Tür">
        <select name="ip_kind" aria-label="Adres türü">
          <Options options={IP_KINDS} value={p.row.kind} />
        </select>
      </td>
      <td data-label="Açıklama">
        <input name="ip_label" value={p.row.label} placeholder="eth0, VLAN 20…" aria-label="Açıklama" />
      </td>
      <td class="center" data-label="Birincil">
        <input type="radio" name="ip_primary" value={String(p.index)} checked={p.primary} aria-label="Birincil adres" />
      </td>
      <td>
        <button type="button" class="icon-btn" data-remove-ip aria-label="Bu adresi kaldır" title="Kaldır">
          <Icon name="x" size={14} />
        </button>
      </td>
    </tr>
    {p.error ? (
      <tr class="row-error">
        <td colspan={5}>
          <p class="field-error">{p.error}</p>
        </td>
      </tr>
    ) : null}
  </>
);

const HardwareSection: FC<SectionProps> = (p) => (
  <section class="form-section">
    <div class="form-section-head">
      <h2>Donanım ve işletim sistemi</h2>
    </div>
    <div class="form-grid">
      <Field label="Tip" name="type" error={p.errors.type}>
        <select id="f-type" name="type">
          <Options options={SERVER_TYPES} value={p.values.type ?? ""} empty="Belirtilmedi" />
        </select>
      </Field>
      <Field label="CPU çekirdek" name="cpu_cores" error={p.errors.cpu_cores}>
        {input(p, "cpu_cores", { inputmode: "numeric", placeholder: "8" })}
      </Field>
      <Field label="RAM (GB)" name="ram_gb" error={p.errors.ram_gb}>
        {input(p, "ram_gb", { inputmode: "decimal", placeholder: "32" })}
      </Field>
      <Field label="Disk (GB)" name="disk_gb" error={p.errors.disk_gb}>
        {input(p, "disk_gb", { inputmode: "numeric", placeholder: "500" })}
      </Field>
      <Field label="Depolama notu" name="storage_note" error={p.errors.storage_note} class="span-2">
        {input(p, "storage_note", { placeholder: "2 × 1 TB NVMe, RAID 1" })}
      </Field>
      <Field label="İşletim sistemi" name="os_name" error={p.errors.os_name}>
        {input(p, "os_name", { list: "dl-os", placeholder: "Ubuntu" })}
        <Datalist id="dl-os" values={p.suggestions.osNames} />
      </Field>
      <Field label="Sürüm" name="os_version" error={p.errors.os_version}>
        {input(p, "os_version", { placeholder: "24.04 LTS" })}
      </Field>
    </div>
  </section>
);

const LocationSection: FC<SectionProps> = (p) => (
  <section class="form-section">
    <div class="form-section-head">
      <h2>Sağlayıcı ve konum</h2>
    </div>
    <div class="form-grid">
      <Field label="Sağlayıcı" name="provider" error={p.errors.provider}>
        {input(p, "provider", { list: "dl-providers", placeholder: "Hetzner, AWS, ofis…" })}
        <Datalist id="dl-providers" values={p.suggestions.providers} />
      </Field>
      <Field label="Konum" name="location" error={p.errors.location}>
        {input(p, "location", { list: "dl-locations", placeholder: "FSN1, eu-central-1, İstanbul DC" })}
        <Datalist id="dl-locations" values={p.suggestions.locations} />
      </Field>
      <Field label="Rack / ünite" name="rack" error={p.errors.rack}>
        {input(p, "rack", { placeholder: "R12 / U24" })}
      </Field>
    </div>
  </section>
);

const OwnershipSection: FC<SectionProps> = (p) => (
  <section class="form-section">
    <div class="form-section-head">
      <h2>Sahiplik ve maliyet</h2>
    </div>
    <div class="form-grid">
      <Field label="Sorumlu" name="owner" error={p.errors.owner}>
        {input(p, "owner", { list: "dl-owners", placeholder: "Kişi ya da ekip" })}
        <Datalist id="dl-owners" values={p.suggestions.owners} />
      </Field>
      <Field label="Aylık maliyet" name="monthly_cost" error={p.errors.monthly_cost_cents}>
        <div class="input-group">
          <input
            id="f-monthly_cost"
            name="monthly_cost"
            value={p.values.monthly_cost ?? ""}
            inputmode="decimal"
            placeholder="1249,90"
            aria-invalid={p.errors.monthly_cost_cents ? "true" : undefined}
            {...describedBy("monthly_cost", p.errors.monthly_cost_cents)}
          />
          <select name="currency" aria-label="Para birimi">
            {Object.entries(CURRENCIES).map(([k, sym]) => (
              <option value={k} selected={p.values.currency === k}>
                {sym} {k}
              </option>
            ))}
          </select>
        </div>
      </Field>
      <Field label="Yenileme tarihi" name="renewal_date" error={p.errors.renewal_date} hint="Sözleşme, lisans ya da fatura dönemi">
        {input(p, "renewal_date", { type: "date", "data-hint": "1" })}
      </Field>
    </div>
  </section>
);
