import { now, type DB } from "../db/index.js";
import type { HistoryRow } from "./types.js";

export interface HistoryEntry {
  action: HistoryRow["action"];
  field?: string;
  old?: string | null;
  new?: string | null;
}

export function recordHistory(db: DB, serverId: number, hostname: string, entries: HistoryEntry[], at = now()) {
  const stmt = db.prepare(
    "INSERT INTO history (server_id, hostname, at, action, field, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  for (const e of entries) {
    stmt.run(serverId, hostname, at, e.action, e.field ?? null, e.old ?? null, e.new ?? null);
  }
}

export function serverHistory(db: DB, serverId: number, limit = 200): HistoryRow[] {
  return db
    .prepare("SELECT * FROM history WHERE server_id = ? ORDER BY at DESC, id ASC LIMIT ?")
    .all(serverId, limit) as HistoryRow[];
}

/** Aynı anda yapılan değişiklikleri tek bir olay altında toplar. */
export function groupByEvent(rows: HistoryRow[]): { at: string; rows: HistoryRow[] }[] {
  const groups: { at: string; rows: HistoryRow[] }[] = [];
  for (const row of rows) {
    const last = groups.at(-1);
    if (last && last.at === row.at) last.rows.push(row);
    else groups.push({ at: row.at, rows: [row] });
  }
  return groups;
}
