import crypto from "node:crypto";
import fs from "node:fs";
import type { DB } from "../db/index.js";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;
const VERSION = 1;

/** Erişim bilgisi şifrelerini AES-256-GCM ile şifreler. Format: [ver(1) | iv(12) | tag(16) | ciphertext]. */
export class SecretBox {
  readonly #key: Buffer;

  constructor(key: Buffer) {
    if (key.length !== 32) throw new Error("Şifreleme anahtarı 32 bayt olmalı.");
    this.#key = key;
  }

  /** Anahtarın kendisini açığa çıkarmayan, doğrulama amaçlı kısa iz. */
  get fingerprint(): string {
    return crypto.createHmac("sha256", this.#key).update("rafta-key-check").digest("hex").slice(0, 32);
  }

  encrypt(plain: string): Buffer {
    const iv = crypto.randomBytes(IV_LEN);
    const cipher = crypto.createCipheriv(ALGO, this.#key, iv);
    const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), body]);
  }

  decrypt(blob: Buffer): string {
    if (blob.length < 1 + IV_LEN + TAG_LEN || blob[0] !== VERSION) {
      throw new Error("Şifreli veri biçimi tanınmadı.");
    }
    const iv = blob.subarray(1, 1 + IV_LEN);
    const tag = blob.subarray(1 + IV_LEN, 1 + IV_LEN + TAG_LEN);
    const body = blob.subarray(1 + IV_LEN + TAG_LEN);
    const decipher = crypto.createDecipheriv(ALGO, this.#key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  }
}

export function parseKey(b64: string): Buffer {
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) {
    throw new Error(
      "RAFTA_SECRET_KEY base64 kodlu 32 bayt olmalı. Üretmek için: openssl rand -base64 32",
    );
  }
  return key;
}

/** Env'deki anahtarı, yoksa anahtar dosyasını kullanır; o da yoksa yenisini üretir. */
export function resolveKey(
  secretKey: string | undefined,
  keyFile: string,
  log: (msg: string) => void = console.warn,
): Buffer {
  if (secretKey) return parseKey(secretKey);
  if (fs.existsSync(keyFile)) return parseKey(fs.readFileSync(keyFile, "utf8").trim());
  const key = crypto.randomBytes(32);
  fs.writeFileSync(keyFile, key.toString("base64") + "\n", { mode: 0o600, flag: "wx" });
  log(
    `[rafta] RAFTA_SECRET_KEY tanımlı değil; yeni anahtar üretildi: ${keyFile}\n` +
      `[rafta] Bu dosyayı kaybederseniz kayıtlı şifreler çözülemez. Yedeğini ayrı bir yerde saklayın.`,
  );
  return key;
}

/**
 * İlk açılışta anahtar izini kaydeder; sonraki açılışlarda farklı bir anahtar
 * verilmişse şifreler sessizce bozuk görünmesin diye uygulamayı durdurur.
 */
export function verifyKey(db: DB, box: SecretBox): void {
  const row = db.prepare("SELECT value FROM meta WHERE key = 'key_fingerprint'").get() as
    | { value: string }
    | undefined;
  if (!row) {
    db.prepare("INSERT INTO meta (key, value) VALUES ('key_fingerprint', ?)").run(box.fingerprint);
    return;
  }
  if (row.value !== box.fingerprint) {
    throw new Error(
      "Şifreleme anahtarı bu veritabanıyla eşleşmiyor. Veritabanını oluşturan RAFTA_SECRET_KEY " +
        "(veya secret.key dosyası) ile başlatın.",
    );
  }
}
