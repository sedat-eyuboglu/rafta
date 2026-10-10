import { now, type DB } from "../db/index.js";
import { capacity, money, num, date } from "../lib/format.js";
import {
  ENVIRONMENTS,
  IP_KINDS,
  SERVER_TYPES,
  STATUSES,
  type Environment,
  type Status,
} from "../lib/labels.js";
import type { ServerFields, ServerInput } from "../lib/validation.js";
import { recordHistory, type HistoryEntry } from "./history.js";
import type { IpRecord, Server, ServerRow } from "./types.js";

// Her sıralama bir ifade listesi; yön hepsine uygulanır, boş değerler hep sonda kalır.
export const SORTS = {
  hostname: ["s.hostname COLLATE NOCASE"],
  environment: ["CASE s.environment WHEN 'prod' THEN 0 WHEN 'staging' THEN 1 WHEN 'test' THEN 2 ELSE 3 END"],
  status: ["CASE s.status WHEN 'active' THEN 0 WHEN 'maintenance' THEN 1 WHEN 'offline' THEN 2 ELSE 3 END"],
  os: ["NULLIF(s.os_name, '') COLLATE NOCASE", "s.os_version"],
  cpu: ["s.cpu_cores", "s.ram_gb"],
  ram: ["s.ram_gb", "s.cpu_cores"],
  disk: ["s.disk_gb"],
  provider: ["NULLIF(s.provider, '') COLLATE NOCASE", "NULLIF(s.location, '') COLLATE NOCASE"],
  cost: ["CASE WHEN s.monthly_cost_cents IS NOT NULL THEN s.currency END", "s.monthly_cost_cents"],
  updated: ["s.updated_at"],
} as const;
export type SortKey = keyof typeof SORTS;

export interface ListFilter {
  q?: string;
  environment?: Environment[];
  status?: Status[];
  provider?: string;
  tag?: string;
  sort?: SortKey;
  dir?: "asc" | "desc";
}

const FIELDS: (keyof ServerFields)[] = [
  "hostname",
  "role",
  "environment",
  "status",
  "type",
  "cpu_cores",
  "ram_gb",
  "disk_gb",
  "storage_note",
  "provider",
  "location",
  "rack",
  "os_name",
  "os_version",
  "owner",
  "monthly_cost_cents",
  "currency",
  "renewal_date",
  "ssh_port",
  "notes",
];

export const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export class HostnameTakenError extends Error {
  constructor(hostname: string) {
    super(`"${hostname}" adında bir sunucu zaten var.`);
  }
}

export function listServers(db: DB, f: ListFilter = {}): Server[] {
  const where: string[] = [];
  const params: Record<string, unknown> = {};

  const q = f.q?.trim();
  if (q) {
    params.q = `%${likeEscape(q)}%`;
    where.push(`(
      s.hostname LIKE @q ESCAPE '\\' OR s.role LIKE @q ESCAPE '\\' OR s.os_name LIKE @q ESCAPE '\\'
      OR s.os_version LIKE @q ESCAPE '\\' OR s.provider LIKE @q ESCAPE '\\' OR s.location LIKE @q ESCAPE '\\'
      OR s.owner LIKE @q ESCAPE '\\' OR s.notes LIKE @q ESCAPE '\\' OR s.rack LIKE @q ESCAPE '\\'
      OR EXISTS (SELECT 1 FROM ip_addresses i WHERE i.server_id = s.id AND i.address LIKE @q ESCAPE '\\')
      OR EXISTS (SELECT 1 FROM server_tags st JOIN tags t ON t.id = st.tag_id
                 WHERE st.server_id = s.id AND t.name LIKE @q ESCAPE '\\')
    )`);
  }
  if (f.environment?.length) {
    params.envs = JSON.stringify(f.environment);
    where.push("s.environment IN (SELECT value FROM json_each(@envs))");
  }
  if (f.status?.length) {
    params.statuses = JSON.stringify(f.status);
    where.push("s.status IN (SELECT value FROM json_each(@statuses))");
  }
  if (f.provider) {
    params.provider = f.provider;
    where.push("s.provider = @provider COLLATE NOCASE");
  }
  if (f.tag) {
    params.tag = f.tag;
    where.push(
      "EXISTS (SELECT 1 FROM server_tags st JOIN tags t ON t.id = st.tag_id WHERE st.server_id = s.id AND t.name = @tag)",
    );
  }

  const sort = f.sort && f.sort in SORTS ? SORTS[f.sort] : SORTS.hostname;
  const dir = f.dir === "desc" ? "DESC" : "ASC";
  const order = sort.map((expr) => `${expr} ${dir} NULLS LAST`).join(", ");

  const rows = db
    .prepare(
      `SELECT s.* FROM servers s ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY ${order}, s.hostname COLLATE NOCASE ASC`,
    )
    .all(params) as ServerRow[];
  return attachRelations(db, rows);
}

export function getServer(db: DB, id: number): Server | undefined {
  const row = db.prepare("SELECT * FROM servers WHERE id = ?").get(id) as ServerRow | undefined;
  return row ? attachRelations(db, [row])[0] : undefined;
}

function attachRelations(db: DB, rows: ServerRow[]): Server[] {
  if (rows.length === 0) return [];
  const ids = JSON.stringify(rows.map((r) => r.id));
  const ips = db
    .prepare(
      `SELECT id, server_id, address, kind, label, is_primary FROM ip_addresses
       WHERE server_id IN (SELECT value FROM json_each(?))
       ORDER BY is_primary DESC, position, id`,
    )
    .all(ids) as IpRecord[];
  const tags = db
    .prepare(
      `SELECT st.server_id, t.name FROM server_tags st JOIN tags t ON t.id = st.tag_id
       WHERE st.server_id IN (SELECT value FROM json_each(?)) ORDER BY t.name COLLATE NOCASE`,
    )
    .all(ids) as { server_id: number; name: string }[];

  const byId = new Map<number, Server>(rows.map((r) => [r.id, { ...r, ips: [], tags: [] }]));
  for (const ip of ips) byId.get(ip.server_id)?.ips.push(ip);
  for (const t of tags) byId.get(t.server_id)?.tags.push(t.name);
  return [...byId.values()];
}

function assertHostnameFree(db: DB, hostname: string, exceptId?: number) {
  const row = db
    .prepare("SELECT id FROM servers WHERE hostname = ? COLLATE NOCASE AND id IS NOT ?")
    .get(hostname, exceptId ?? null);
  if (row) throw new HostnameTakenError(hostname);
}

export function createServer(db: DB, input: ServerInput): number {
  return db.transaction(() => {
    assertHostnameFree(db, input.hostname);
    const ts = now();
    const cols = [...FIELDS, "created_at", "updated_at"];
    const values: Record<string, unknown> = { created_at: ts, updated_at: ts };
    for (const f of FIELDS) values[f] = input[f];
    const { lastInsertRowid } = db
      .prepare(`INSERT INTO servers (${cols.join(", ")}) VALUES (${cols.map((c) => `@${c}`).join(", ")})`)
      .run(values);
    const id = Number(lastInsertRowid);
    writeIps(db, id, input.ips);
    writeTags(db, id, input.tags);
    recordHistory(db, id, input.hostname, [{ action: "create" }], ts);
    return id;
  })();
}

/** Değişen alanları geçmişe yazar; hiçbir şey değişmediyse updated_at'e dokunmaz. */
export function updateServer(db: DB, id: number, input: ServerInput): boolean {
  return db.transaction(() => {
    const before = getServer(db, id);
    if (!before) return false;
    assertHostnameFree(db, input.hostname, id);

    const changes: HistoryEntry[] = [];
    for (const f of FIELDS) {
      const oldV = displayValue(f, before);
      const newV = displayValue(f, input);
      if (oldV !== newV) changes.push({ action: "update", field: f, old: oldV, new: newV });
    }
    const ipsBefore = ipSummary(before.ips.map((ip) => ({ ...ip, is_primary: !!ip.is_primary })));
    const ipsAfter = ipSummary(input.ips);
    if (ipsBefore !== ipsAfter) changes.push({ action: "update", field: "ips", old: ipsBefore, new: ipsAfter });
    const tagsBefore = [...before.tags].sort().join(", ");
    const tagsAfter = [...input.tags].sort().join(", ");
    if (tagsBefore.toLowerCase() !== tagsAfter.toLowerCase())
      changes.push({ action: "update", field: "tags", old: tagsBefore, new: tagsAfter });

    if (changes.length === 0) return true;

    const ts = now();
    const values: Record<string, unknown> = { id, updated_at: ts };
    for (const f of FIELDS) values[f] = input[f];
    db.prepare(
      `UPDATE servers SET ${FIELDS.map((f) => `${f} = @${f}`).join(", ")}, updated_at = @updated_at WHERE id = @id`,
    ).run(values);
    db.prepare("DELETE FROM ip_addresses WHERE server_id = ?").run(id);
    writeIps(db, id, input.ips);
    db.prepare("DELETE FROM server_tags WHERE server_id = ?").run(id);
    writeTags(db, id, input.tags);
    pruneTags(db);
    recordHistory(db, id, input.hostname, changes, ts);
    return true;
  })();
}

export function deleteServer(db: DB, id: number): boolean {
  return db.transaction(() => {
    const row = db.prepare("SELECT hostname FROM servers WHERE id = ?").get(id) as
      | { hostname: string }
      | undefined;
    if (!row) return false;
    db.prepare("DELETE FROM servers WHERE id = ?").run(id);
    pruneTags(db);
    recordHistory(db, id, row.hostname, [{ action: "delete" }]);
    return true;
  })();
}

/** Bir sunucunun updated_at alanını günceller (ör. erişim bilgisi değiştiğinde). */
export function touchServer(db: DB, id: number, ts = now()): void {
  db.prepare("UPDATE servers SET updated_at = ? WHERE id = ?").run(ts, id);
}

function writeIps(db: DB, serverId: number, ips: ServerInput["ips"]) {
  const stmt = db.prepare(
    "INSERT INTO ip_addresses (server_id, address, kind, label, is_primary, position) VALUES (?, ?, ?, ?, ?, ?)",
  );
  ips.forEach((ip, i) => stmt.run(serverId, ip.address, ip.kind, ip.label, ip.is_primary ? 1 : 0, i));
}

function writeTags(db: DB, serverId: number, tags: string[]) {
  const upsert = db.prepare("INSERT INTO tags (name) VALUES (?) ON CONFLICT(name) DO NOTHING");
  const find = db.prepare("SELECT id FROM tags WHERE name = ?");
  const link = db.prepare("INSERT OR IGNORE INTO server_tags (server_id, tag_id) VALUES (?, ?)");
  for (const name of tags) {
    upsert.run(name);
    const { id } = find.get(name) as { id: number };
    link.run(serverId, id);
  }
}

function pruneTags(db: DB) {
  db.prepare("DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM server_tags)").run();
}

function ipSummary(ips: { address: string; kind: string; label: string; is_primary: boolean }[]): string {
  return ips
    .map((ip) => {
      const kind = IP_KINDS[ip.kind as keyof typeof IP_KINDS] ?? ip.kind;
      return `${ip.address} (${kind}${ip.label ? `, ${ip.label}` : ""})${ip.is_primary ? " *" : ""}`;
    })
    .join("\n");
}

/** Geçmişte gösterilecek okunabilir değer. */
function displayValue(field: keyof ServerFields, s: ServerFields): string {
  const v = s[field];
  if (v == null || v === "") return "";
  switch (field) {
    case "environment":
      return ENVIRONMENTS[s.environment];
    case "status":
      return STATUSES[s.status];
    case "type":
      return s.type ? SERVER_TYPES[s.type] : "";
    case "ram_gb":
      return `${num(s.ram_gb)} GB`;
    case "disk_gb":
      return capacity(s.disk_gb);
    case "monthly_cost_cents":
      return money(s.monthly_cost_cents, s.currency);
    case "renewal_date":
      return date(s.renewal_date);
    default:
      return String(v);
  }
}

/** Filtre çipleri ve form önerileri için mevcut değerler. */
export function distinctValues(db: DB) {
  const col = (c: "provider" | "location" | "os_name" | "owner") =>
    (
      db
        .prepare(`SELECT DISTINCT ${c} AS v FROM servers WHERE ${c} <> '' ORDER BY ${c} COLLATE NOCASE`)
        .all() as { v: string }[]
    ).map((r) => r.v);
  const tags = (
    db
      .prepare(
        `SELECT t.name AS v, COUNT(*) AS n FROM tags t JOIN server_tags st ON st.tag_id = t.id
         GROUP BY t.id ORDER BY n DESC, t.name COLLATE NOCASE`,
      )
      .all() as { v: string; n: number }[]
  ).map((r) => r.v);
  return {
    providers: col("provider"),
    locations: col("location"),
    osNames: col("os_name"),
    owners: col("owner"),
    tags,
  };
}
