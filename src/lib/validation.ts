import net from "node:net";
import { z } from "zod";
import { CURRENCIES, ENVIRONMENTS, IP_KINDS, SERVER_TYPES, STATUSES, keys } from "./labels.js";

export type FormBody = Record<string, string | File | (string | File)[]>;
export type Errors = Record<string, string>;
export type Result<T> = { ok: true; value: T } | { ok: false; errors: Errors };

const str = (body: FormBody, key: string): string => {
  const v = body[key];
  const first = Array.isArray(v) ? v[0] : v;
  return typeof first === "string" ? first.trim() : "";
};
const list = (body: FormBody, key: string): string[] => {
  const v = body[key] ?? body[`${key}[]`];
  if (v === undefined) return [];
  return (Array.isArray(v) ? v : [v]).map((x) => (typeof x === "string" ? x.trim() : ""));
};

const text = (max: number) => z.string().max(max, `En fazla ${max} karakter.`);
const emptyToNull = (v: unknown) => (v === "" ? null : v);
const optInt = (min: number, max: number, msg: string) =>
  z.preprocess(
    emptyToNull,
    z.coerce.number({ error: msg }).int(msg).min(min, msg).max(max, msg).nullable(),
  );

export const HOSTNAME_RE = /^(?=.{1,253}$)[A-Za-z0-9_](?:[A-Za-z0-9_.-]*[A-Za-z0-9_])?$/;

/** "1.249,90" / "1249,90" / "1249.90" → kuruş. Boş → null. */
export function parseMoney(input: string): number | null | undefined {
  let s = input.replace(/\s|₺|\$|€/g, "");
  if (s === "") return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return undefined;
  return Math.round(Number(s) * 100);
}

/** IPv4/IPv6, isteğe bağlı CIDR önekiyle. Geçersizse null. */
export function normalizeIp(input: string): string | null {
  const [addr = "", prefix, ...rest] = input.trim().split("/");
  if (rest.length) return null;
  const family = net.isIP(addr);
  if (!family) return null;
  if (prefix !== undefined) {
    const max = family === 4 ? 32 : 128;
    if (!/^\d{1,3}$/.test(prefix) || Number(prefix) > max) return null;
    return `${addr.toLowerCase()}/${Number(prefix)}`;
  }
  return addr.toLowerCase();
}

export function parseTags(input: string): string[] {
  const seen = new Map<string, string>();
  for (const raw of input.split(/[,\n]/)) {
    const t = raw.trim().replace(/\s+/g, "-");
    if (t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  }
  return [...seen.values()];
}

const serverSchema = z.object({
  hostname: z
    .string()
    .min(1, "Hostname gerekli.")
    .regex(HOSTNAME_RE, "Yalnızca harf, rakam, nokta, tire ve alt çizgi kullanılabilir."),
  role: text(200),
  environment: z.enum(keys(ENVIRONMENTS), { error: "Ortam seçin." }),
  status: z.enum(keys(STATUSES), { error: "Durum seçin." }),
  type: z.preprocess(emptyToNull, z.enum(keys(SERVER_TYPES), { error: "Geçersiz tip." }).nullable()),
  cpu_cores: optInt(1, 4096, "1 ile 4096 arasında tam sayı girin."),
  ram_gb: z.preprocess(
    (v) => (v === "" ? null : typeof v === "string" ? v.replace(",", ".") : v),
    z.coerce
      .number({ error: "Sayı girin." })
      .positive("Sıfırdan büyük olmalı.")
      .max(1_048_576, "Çok büyük.")
      .nullable(),
  ),
  disk_gb: optInt(1, 10_000_000, "Pozitif tam sayı girin (GB)."),
  storage_note: text(200),
  provider: text(100),
  location: text(100),
  rack: text(50),
  os_name: text(100),
  os_version: text(50),
  owner: text(100),
  monthly_cost_cents: z.number().int().nonnegative().nullable(),
  currency: z.enum(keys(CURRENCIES), { error: "Para birimi seçin." }),
  renewal_date: z.preprocess(
    emptyToNull,
    z.iso.date({ error: "Tarih YYYY-AA-GG biçiminde olmalı." }).nullable(),
  ),
  ssh_port: z.preprocess(
    (v) => (v === "" ? 22 : v),
    z.coerce.number({ error: "Port 1–65535 arası olmalı." }).int("Port 1–65535 arası olmalı.").min(1, "Port 1–65535 arası olmalı.").max(65535, "Port 1–65535 arası olmalı."),
  ),
  notes: text(20_000),
  tags: z.array(text(40)).max(30, "En fazla 30 etiket."),
});

export type ServerFields = Omit<z.infer<typeof serverSchema>, "tags">;
export interface IpInput {
  address: string;
  kind: keyof typeof IP_KINDS;
  label: string;
  is_primary: boolean;
}
export interface ServerInput extends ServerFields {
  tags: string[];
  ips: IpInput[];
}

/** Formdan gelen IP satırları; hatalı formu yeniden göstermek için ham haliyle de kullanılır. */
export interface IpRow {
  address: string;
  kind: string;
  label: string;
}

export function readIpRows(body: FormBody): { rows: IpRow[]; primary: number } {
  const addrs = list(body, "ip_address");
  const kinds = list(body, "ip_kind");
  const labels = list(body, "ip_label");
  const rows = addrs.map((address, i) => ({ address, kind: kinds[i] ?? "private", label: labels[i] ?? "" }));
  const primary = Number(str(body, "ip_primary") || 0);
  return { rows, primary: Number.isInteger(primary) ? primary : 0 };
}

export function parseServerForm(body: FormBody): Result<ServerInput> {
  const errors: Errors = {};

  const cost = parseMoney(str(body, "monthly_cost"));
  if (cost === undefined) errors.monthly_cost_cents = "Tutarı 1249,90 gibi girin.";

  const parsed = serverSchema.safeParse({
    hostname: str(body, "hostname"),
    role: str(body, "role"),
    environment: str(body, "environment"),
    status: str(body, "status"),
    type: str(body, "type"),
    cpu_cores: str(body, "cpu_cores"),
    ram_gb: str(body, "ram_gb"),
    disk_gb: str(body, "disk_gb"),
    storage_note: str(body, "storage_note"),
    provider: str(body, "provider"),
    location: str(body, "location"),
    rack: str(body, "rack"),
    os_name: str(body, "os_name"),
    os_version: str(body, "os_version"),
    owner: str(body, "owner"),
    monthly_cost_cents: cost ?? null,
    currency: str(body, "currency") || "TRY",
    renewal_date: str(body, "renewal_date"),
    ssh_port: str(body, "ssh_port"),
    notes: str(body, "notes"),
    tags: parseTags(str(body, "tags")),
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "_");
      errors[key] ??= issue.message;
    }
  }

  const { rows, primary } = readIpRows(body);
  const ips: IpInput[] = [];
  const seen = new Set<string>();
  rows.forEach((row, i) => {
    if (row.address === "" && row.label === "") return; // boş satır
    const address = normalizeIp(row.address);
    if (!address) {
      errors[`ip_${i}`] = "Geçerli bir IPv4/IPv6 adresi girin (isteğe bağlı /önek ile).";
      return;
    }
    if (seen.has(address)) {
      errors[`ip_${i}`] = "Bu adres zaten listede.";
      return;
    }
    seen.add(address);
    const kind = (row.kind in IP_KINDS ? row.kind : "private") as IpInput["kind"];
    if (row.label.length > 60) errors[`ip_${i}`] = "Açıklama en fazla 60 karakter.";
    ips.push({ address, kind, label: row.label, is_primary: i === primary });
  });
  if (ips.length && !ips.some((ip) => ip.is_primary)) ips[0]!.is_primary = true;

  if (Object.keys(errors).length || !parsed.success) return { ok: false, errors };
  const { tags, ...fields } = parsed.data;
  return { ok: true, value: { ...fields, tags, ips } };
}

export interface CredentialInput {
  label: string;
  username: string;
  /** undefined = mevcut şifreyi koru (düzenlemede alan boş bırakıldı). */
  secret: string | undefined;
  url: string;
  notes: string;
}

const credentialSchema = z.object({
  label: z.string().min(1, "Ne için olduğunu yazın (örn. SSH root, iDRAC).").max(80, "En fazla 80 karakter."),
  username: text(200),
  url: z.union([z.literal(""), z.url({ error: "Geçerli bir adres girin (https://…)." }).max(500)]),
  notes: text(2000),
});

export function parseCredentialForm(body: FormBody, isEdit: boolean): Result<CredentialInput> {
  const parsed = credentialSchema.safeParse({
    label: str(body, "label"),
    username: str(body, "username"),
    url: str(body, "url"),
    notes: str(body, "notes"),
  });
  const errors: Errors = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) errors[String(issue.path[0] ?? "_")] ??= issue.message;
  }
  const secret = readSecret(body, isEdit, errors);
  if (!parsed.success || Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { ...parsed.data, secret } };
}

/** Şifre alanı: undefined = mevcut şifreyi koru, "" = şifre yok/silindi. */
function readSecret(body: FormBody, isEdit: boolean, errors: Errors): string | undefined {
  // Şifrede baştaki/sondaki boşluklar anlamlı olabilir; kırpılmaz.
  const rawSecret = body.secret;
  const secretStr = typeof rawSecret === "string" ? rawSecret : "";
  if (secretStr.length > 4000) errors.secret = "Çok uzun.";
  if (str(body, "clear_secret") === "1") return "";
  if (secretStr !== "") return secretStr;
  return isEdit ? undefined : "";
}

export interface PasswordInput {
  title: string;
  username: string;
  /** undefined = mevcut şifreyi koru (düzenlemede alan boş bırakıldı). */
  secret: string | undefined;
  url: string;
  notes: string;
}

const DOMAIN_RE = /^(?:https?:\/\/)?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::\d{1,5})?(?:[/?#]\S*)?$/i;
const IPV4_HOST_RE = /^(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?(?:[/?#]\S*)?$/;

/** "github.com/login" → "https://github.com/login", "192.168.1.1" → "http://192.168.1.1". */
export function normalizeUrl(input: string): string {
  if (input === "" || /^[a-z][a-z0-9+.-]*:\/\//i.test(input)) return input;
  if (IPV4_HOST_RE.test(input)) return `http://${input}`;
  return DOMAIN_RE.test(input) ? `https://${input}` : input;
}

const looksLikeAddress = (s: string) => !/\s/.test(s) && (DOMAIN_RE.test(s) || IPV4_HOST_RE.test(s));

function siteName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

const passwordSchema = z.object({
  title: z.string().min(1, "Ne için olduğunu yazın (örn. Gmail, e-Devlet, banka).").max(120, "En fazla 120 karakter."),
  username: text(200),
  url: z.union([
    z.literal(""),
    z.url({ protocol: /^https?$/, error: "Geçerli bir adres girin (örn. github.com)." }).max(500, "En fazla 500 karakter."),
  ]),
  notes: text(2000),
});

/**
 * Eklemeyi kolaylaştırmak için: başlığa adres yapıştırılırsa adres alanına taşınır ve
 * başlık site adı olur; başlık boş ama adres doluysa başlık adresten türetilir.
 */
export function parsePasswordForm(body: FormBody, isEdit: boolean): Result<PasswordInput> {
  let title = str(body, "title");
  let url = normalizeUrl(str(body, "url"));
  if (!url && looksLikeAddress(title)) {
    url = normalizeUrl(title);
    title = siteName(url) || title;
  }
  if (!title && url) title = siteName(url);
  const parsed = passwordSchema.safeParse({ title, username: str(body, "username"), url, notes: str(body, "notes") });
  const errors: Errors = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) errors[String(issue.path[0] ?? "_")] ??= issue.message;
  }
  const secret = readSecret(body, isEdit, errors);
  if (!parsed.success || Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { ...parsed.data, secret } };
}
