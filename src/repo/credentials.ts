import { now, type DB } from "../db/index.js";
import type { SecretBox } from "../lib/crypto.js";
import type { CredentialInput } from "../lib/validation.js";
import { recordHistory } from "./history.js";
import { touchServer } from "./servers.js";
import type { CredentialRow } from "./types.js";

// Şifreli değer listelerde asla seçilmez; yalnızca revealSecret ile tek tek çözülür.
const COLS = "id, server_id, label, username, secret_enc IS NOT NULL AS has_secret, url, notes, created_at, updated_at";

export function listCredentials(db: DB, serverId: number): CredentialRow[] {
  return db
    .prepare(`SELECT ${COLS} FROM credentials WHERE server_id = ? ORDER BY label COLLATE NOCASE, id`)
    .all(serverId) as CredentialRow[];
}

export function getCredential(db: DB, serverId: number, id: number): CredentialRow | undefined {
  return db.prepare(`SELECT ${COLS} FROM credentials WHERE id = ? AND server_id = ?`).get(id, serverId) as
    | CredentialRow
    | undefined;
}

export function revealSecret(db: DB, box: SecretBox, serverId: number, id: number): string | undefined {
  const row = db.prepare("SELECT secret_enc FROM credentials WHERE id = ? AND server_id = ?").get(id, serverId) as
    | { secret_enc: Buffer | null }
    | undefined;
  if (!row) return undefined;
  return row.secret_enc ? box.decrypt(row.secret_enc) : "";
}

function hostnameOf(db: DB, serverId: number): string | undefined {
  return (db.prepare("SELECT hostname FROM servers WHERE id = ?").get(serverId) as { hostname: string } | undefined)
    ?.hostname;
}

export function createCredential(db: DB, box: SecretBox, serverId: number, input: CredentialInput): number | undefined {
  return db.transaction(() => {
    const hostname = hostnameOf(db, serverId);
    if (!hostname) return undefined;
    const ts = now();
    const enc = input.secret ? box.encrypt(input.secret) : null;
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO credentials (server_id, label, username, secret_enc, url, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(serverId, input.label, input.username, enc, input.url, input.notes, ts, ts);
    recordHistory(db, serverId, hostname, [{ action: "update", field: "credential", new: describe(input) }], ts);
    touchServer(db, serverId, ts);
    return Number(lastInsertRowid);
  })();
}

export function updateCredential(
  db: DB,
  box: SecretBox,
  serverId: number,
  id: number,
  input: CredentialInput,
): boolean {
  return db.transaction(() => {
    const before = getCredential(db, serverId, id);
    const hostname = hostnameOf(db, serverId);
    if (!before || !hostname) return false;

    const changed: string[] = [];
    if (before.label !== input.label) changed.push("ad");
    if (before.username !== input.username) changed.push("kullanıcı adı");
    if (before.url !== input.url) changed.push("adres");
    if (before.notes !== input.notes) changed.push("not");
    if (input.secret !== undefined) {
      const old = revealSecret(db, box, serverId, id) ?? "";
      if (old !== input.secret) changed.push(input.secret === "" ? "şifre silindi" : "şifre değişti");
    }
    if (changed.length === 0) return true;

    const ts = now();
    db.prepare(
      `UPDATE credentials SET label = ?, username = ?, url = ?, notes = ?, updated_at = ? WHERE id = ? AND server_id = ?`,
    ).run(input.label, input.username, input.url, input.notes, ts, id, serverId);
    if (input.secret !== undefined) {
      db.prepare("UPDATE credentials SET secret_enc = ? WHERE id = ?").run(
        input.secret ? box.encrypt(input.secret) : null,
        id,
      );
    }
    // Şifre değerleri asla geçmişe yazılmaz; yalnızca neyin değiştiği.
    recordHistory(
      db,
      serverId,
      hostname,
      [{ action: "update", field: "credential", old: describe(before), new: `${describe(input)} — ${changed.join(", ")}` }],
      ts,
    );
    touchServer(db, serverId, ts);
    return true;
  })();
}

export function deleteCredential(db: DB, serverId: number, id: number): boolean {
  return db.transaction(() => {
    const before = getCredential(db, serverId, id);
    const hostname = hostnameOf(db, serverId);
    if (!before || !hostname) return false;
    db.prepare("DELETE FROM credentials WHERE id = ? AND server_id = ?").run(id, serverId);
    const ts = now();
    recordHistory(db, serverId, hostname, [{ action: "update", field: "credential", old: describe(before) }], ts);
    touchServer(db, serverId, ts);
    return true;
  })();
}

function describe(c: { label: string; username: string }): string {
  return c.username ? `${c.label} (${c.username})` : c.label;
}
