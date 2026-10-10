import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openDatabase } from "../src/db/index.js";
import { SecretBox, parseKey, resolveKey, verifyKey } from "../src/lib/crypto.js";

describe("SecretBox", () => {
  it("şifreler ve geri çözer; her seferinde farklı çıktı üretir", () => {
    const box = new SecretBox(crypto.randomBytes(32));
    const a = box.encrypt("p@ss wörd ✓");
    const b = box.encrypt("p@ss wörd ✓");
    expect(a.equals(b)).toBe(false);
    expect(box.decrypt(a)).toBe("p@ss wörd ✓");
  });

  it("yanlış anahtarla veya bozulmuş veriyle çözmez", () => {
    const box = new SecretBox(crypto.randomBytes(32));
    const other = new SecretBox(crypto.randomBytes(32));
    const blob = box.encrypt("secret");
    expect(() => other.decrypt(blob)).toThrow();
    blob[blob.length - 1]! ^= 1;
    expect(() => box.decrypt(blob)).toThrow();
  });
});

describe("anahtar yönetimi", () => {
  it("geçersiz env anahtarını reddeder", () => {
    expect(() => parseKey("kısa")).toThrow(/32 bayt/);
  });

  it("anahtar yoksa dosya üretir, sonra aynı dosyayı kullanır", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rafta-test-"));
    const file = path.join(dir, "secret.key");
    const k1 = resolveKey(undefined, file, () => {});
    const k2 = resolveKey(undefined, file, () => {});
    expect(k1.equals(k2)).toBe(true);
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    fs.rmSync(dir, { recursive: true });
  });

  it("veritabanı farklı anahtarla açılırsa durur", () => {
    const db = openDatabase(":memory:");
    verifyKey(db, new SecretBox(crypto.randomBytes(32)));
    expect(() => verifyKey(db, new SecretBox(crypto.randomBytes(32)))).toThrow(/eşleşmiyor/);
  });
});
