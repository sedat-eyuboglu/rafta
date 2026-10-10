import { now, type DB } from "../db/index.js";
import type { SecretBox } from "../lib/crypto.js";
import type { PasswordInput } from "../lib/validation.js";
import { likeEscape } from "./servers.js";
import type { PasswordRow, ServerCredentialRow } from "./types.js";

// Şifreli değer listelerde asla seçilmez; yalnızca revealPassword ile tek tek çözülür.
const COLS = "id, title, username, secret_enc IS NOT NULL AS has_secret, url, notes, created_at, updated_at";

export function listPasswords(db: DB, q?: string): PasswordRow[] {
  const term = q?.trim();
  if (!term) {
    return db.prepare(`SELECT ${COLS} FROM passwords ORDER BY title COLLATE NOCASE, id`).all() as PasswordRow[];
  }
  return db
    .prepare(
      `SELECT ${COLS} FROM passwords
       WHERE title LIKE @q ESCAPE '\\' OR username LIKE @q ESCAPE '\\' OR url LIKE @q ESCAPE '\\' OR notes LIKE @q ESCAPE '\\'
       ORDER BY title COLLATE NOCASE, id`,
    )
    .all({ q: `%${likeEscape(term)}%` }) as PasswordRow[];
}

/** Sunuculara bağlı erişim bilgileri; şifreler sayfasında hepsi bir arada aranabilsin diye. */
export function listServerCredentials(db: DB, q?: string): ServerCredentialRow[] {
  const term = q?.trim();
  const where = term
    ? `WHERE c.label LIKE @q ESCAPE '\\' OR c.username LIKE @q ESCAPE '\\' OR c.url LIKE @q ESCAPE '\\'
       OR c.notes LIKE @q ESCAPE '\\' OR s.hostname LIKE @q ESCAPE '\\'`
    : "";
  return db
    .prepare(
      `SELECT c.id, c.server_id, s.hostname, c.label, c.username, c.secret_enc IS NOT NULL AS has_secret, c.url
       FROM credentials c JOIN servers s ON s.id = c.server_id
       ${where}
       ORDER BY s.hostname COLLATE NOCASE, c.label COLLATE NOCASE, c.id`,
    )
    .all(term ? { q: `%${likeEscape(term)}%` } : {}) as ServerCredentialRow[];
}

export function countPasswords(db: DB): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM passwords").get() as { n: number }).n;
}

/** Daha önce kullanılan kullanıcı adları/e-postalar; yeni kayıtta öneri olarak sunulur. */
export function knownUsernames(db: DB, limit = 50): string[] {
  return (
    db
      .prepare(
        `SELECT username FROM passwords WHERE username <> ''
         GROUP BY username ORDER BY COUNT(*) DESC, MAX(updated_at) DESC LIMIT ?`,
      )
      .all(limit) as { username: string }[]
  ).map((r) => r.username);
}

export function getPassword(db: DB, id: number): PasswordRow | undefined {
  return db.prepare(`SELECT ${COLS} FROM passwords WHERE id = ?`).get(id) as PasswordRow | undefined;
}

export function revealPassword(db: DB, box: SecretBox, id: number): string | undefined {
  const row = db.prepare("SELECT secret_enc FROM passwords WHERE id = ?").get(id) as
    | { secret_enc: Buffer | null }
    | undefined;
  if (!row) return undefined;
  return row.secret_enc ? box.decrypt(row.secret_enc) : "";
}

export function createPassword(db: DB, box: SecretBox, input: PasswordInput): number {
  const ts = now();
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO passwords (title, username, secret_enc, url, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(input.title, input.username, input.secret ? box.encrypt(input.secret) : null, input.url, input.notes, ts, ts);
  return Number(lastInsertRowid);
}

export function updatePassword(db: DB, box: SecretBox, id: number, input: PasswordInput): boolean {
  return db.transaction(() => {
    if (!getPassword(db, id)) return false;
    const ts = now();
    db.prepare("UPDATE passwords SET title = ?, username = ?, url = ?, notes = ?, updated_at = ? WHERE id = ?").run(
      input.title,
      input.username,
      input.url,
      input.notes,
      ts,
      id,
    );
    if (input.secret !== undefined) {
      db.prepare("UPDATE passwords SET secret_enc = ? WHERE id = ?").run(
        input.secret ? box.encrypt(input.secret) : null,
        id,
      );
    }
    return true;
  })();
}

export function deletePassword(db: DB, id: number): boolean {
  return db.prepare("DELETE FROM passwords WHERE id = ?").run(id).changes > 0;
}
