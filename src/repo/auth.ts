import crypto from "node:crypto";
import { now, type DB } from "../db/index.js";
import type { SecretBox } from "../lib/crypto.js";
import { base32Encode, generateTotpSecret, verifyTotp } from "../lib/totp.js";

// Tek kullanıcılı giriş: şifre yok, yalnızca authenticator kodu (TOTP).
// Kalıcı durum `meta` tablosunda: totp_secret, totp_pending (şifreli), totp_last_counter, setup_token.

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

function getMeta(db: DB, key: string): string | undefined {
  return (db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined)?.value;
}
function setMeta(db: DB, key: string, value: string): void {
  db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(
    key,
    value,
  );
}
function delMeta(db: DB, ...keys: string[]): void {
  const stmt = db.prepare("DELETE FROM meta WHERE key = ?");
  for (const k of keys) stmt.run(k);
}

const encryptMeta = (box: SecretBox, plain: string) => box.encrypt(plain).toString("base64");
const decryptMeta = (box: SecretBox, b64: string) => box.decrypt(Buffer.from(b64, "base64"));

export function isAuthConfigured(db: DB): boolean {
  return getMeta(db, "totp_secret") !== undefined;
}

// ---- Kurulum bağlantısı ------------------------------------------------------------

const SETUP_TTL_MS = 24 * 3600 * 1000;

/** Yeni tek kullanımlık kurulum anahtarı üretir (öncekini geçersiz kılar). */
export function createSetupToken(db: DB): string {
  const token = crypto.randomBytes(24).toString("base64url");
  setMeta(db, "setup_token", JSON.stringify({ hash: sha256(token), expires: Date.now() + SETUP_TTL_MS }));
  return token;
}

export function checkSetupToken(db: DB, token: string | undefined): boolean {
  const raw = getMeta(db, "setup_token");
  if (!raw || !token) return false;
  const { hash, expires } = JSON.parse(raw) as { hash: string; expires: number };
  if (Date.now() > expires) return false;
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(sha256(token)));
}

// ---- Authenticator anahtarı ------------------------------------------------------------

/** Kurulum/yeniden bağlama sırasında QR'da gösterilen, henüz onaylanmamış anahtar. */
export function pendingTotpSecret(db: DB, box: SecretBox): string {
  const raw = getMeta(db, "totp_pending");
  if (raw) return decryptMeta(box, raw);
  const secret = generateTotpSecret();
  setMeta(db, "totp_pending", encryptMeta(box, secret));
  return secret;
}

/** Bekleyen anahtarı, ondan üretilmiş bir kodla onaylayıp etkinleştirir. */
export function confirmPendingTotp(db: DB, box: SecretBox, code: string): boolean {
  const raw = getMeta(db, "totp_pending");
  if (!raw) return false;
  const secret = decryptMeta(box, raw);
  const counter = verifyTotp(secret, code);
  if (counter === undefined) return false;
  db.transaction(() => {
    setMeta(db, "totp_secret", raw);
    setMeta(db, "totp_last_counter", String(counter));
    delMeta(db, "totp_pending", "setup_token");
  })();
  return true;
}

export type LoginResult = "ok" | "recovery" | "invalid" | "reused";

/**
 * 6 haneli authenticator kodu ya da kurtarma kodu. Aynı authenticator kodu iki kez
 * kullanılamaz (ağı dinleyen biri yakaladığı kodu tekrar gönderemesin).
 */
export function verifyLogin(db: DB, box: SecretBox, input: string): LoginResult {
  const raw = getMeta(db, "totp_secret");
  if (!raw) return "invalid";
  const compact = input.replace(/[\s-]/g, "");
  if (/^\d{6}$/.test(compact)) {
    const counter = verifyTotp(decryptMeta(box, raw), compact);
    if (counter === undefined) return "invalid";
    if (counter <= Number(getMeta(db, "totp_last_counter") ?? -1)) return "reused";
    setMeta(db, "totp_last_counter", String(counter));
    return "ok";
  }
  return useRecoveryCode(db, compact) ? "recovery" : "invalid";
}

// ---- Kurtarma kodları ---------------------------------------------------------------

/** Kodlarda 0, 1, 8 yoktur; elle yazarken o/l/b ile karıştırılırsa yine tutsun. */
const normalizeRecovery = (s: string) =>
  s
    .toLowerCase()
    .replace(/0/g, "o")
    .replace(/1/g, "l")
    .replace(/8/g, "b")
    .replace(/[^a-z2-7]/g, "");

/** Eski kodları siler, 10 yeni kod üretir. Kodlar yalnızca bu anda düz metin olarak görülür. */
export function regenerateRecoveryCodes(db: DB): string[] {
  const codes = Array.from({ length: 10 }, () => {
    const c = base32Encode(crypto.randomBytes(7)).slice(0, 10).toLowerCase();
    return `${c.slice(0, 5)}-${c.slice(5)}`;
  });
  db.transaction(() => {
    db.prepare("DELETE FROM recovery_codes").run();
    const ins = db.prepare("INSERT INTO recovery_codes (code_hash) VALUES (?)");
    for (const c of codes) ins.run(sha256(normalizeRecovery(c)));
  })();
  return codes;
}

function useRecoveryCode(db: DB, input: string): boolean {
  const code = normalizeRecovery(input);
  if (code.length !== 10) return false;
  return (
    db.prepare("UPDATE recovery_codes SET used_at = ? WHERE code_hash = ? AND used_at IS NULL").run(now(), sha256(code))
      .changes === 1
  );
}

export function remainingRecoveryCodes(db: DB): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM recovery_codes WHERE used_at IS NULL").get() as { n: number }).n;
}

// ---- Oturumlar -----------------------------------------------------------------------

export function createSession(db: DB, days: number, userAgent = ""): string {
  const token = crypto.randomBytes(32).toString("base64url");
  const ts = new Date();
  const expires = new Date(ts.getTime() + days * 86400_000);
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(ts.toISOString());
  db.prepare(
    "INSERT INTO sessions (token_hash, created_at, expires_at, last_seen_at, user_agent) VALUES (?, ?, ?, ?, ?)",
  ).run(sha256(token), ts.toISOString(), expires.toISOString(), ts.toISOString(), userAgent.slice(0, 300));
  return token;
}

/** Geçerli bir oturumsa true. Son görülme zamanını en fazla 10 dakikada bir günceller. */
export function touchSession(db: DB, token: string | undefined): boolean {
  if (!token) return false;
  const hash = sha256(token);
  const row = db.prepare("SELECT expires_at, last_seen_at FROM sessions WHERE token_hash = ?").get(hash) as
    | { expires_at: string; last_seen_at: string }
    | undefined;
  if (!row) return false;
  const ts = Date.now();
  if (Date.parse(row.expires_at) <= ts) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hash);
    return false;
  }
  if (ts - Date.parse(row.last_seen_at) > 10 * 60_000) {
    db.prepare("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?").run(new Date(ts).toISOString(), hash);
  }
  return true;
}

export function deleteSession(db: DB, token: string): void {
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
}

/** `except` verilirse o oturum (bu cihaz) açık kalır. Kapatılan oturum sayısını döner. */
export function deleteOtherSessions(db: DB, except?: string): number {
  if (!except) return db.prepare("DELETE FROM sessions").run().changes;
  return db.prepare("DELETE FROM sessions WHERE token_hash <> ?").run(sha256(except)).changes;
}

export function countSessions(db: DB): number {
  return (
    db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE expires_at > ?").get(new Date().toISOString()) as { n: number }
  ).n;
}

/** Sunucu komut satırından kurtarma: authenticator ve tüm oturumlar silinir, kurulum yeniden açılır. */
export function resetAuth(db: DB): string {
  return db.transaction(() => {
    delMeta(db, "totp_secret", "totp_pending", "totp_last_counter");
    db.prepare("DELETE FROM sessions").run();
    db.prepare("DELETE FROM recovery_codes").run();
    return createSetupToken(db);
  })();
}

/** Giriş yapmışken authenticator'ı yeni bir telefona bağlamak için yeni bekleyen anahtar başlatır. */
export function startReenroll(db: DB): void {
  delMeta(db, "totp_pending");
}
