import crypto from "node:crypto";

// RFC 6238 TOTP: Google Authenticator ve benzerleriyle uyumlu (SHA-1, 6 hane, 30 sn).
const PERIOD = 30;
const DIGITS = 6;
/** Saat kaymasına tolerans: bir önceki ve bir sonraki kod da kabul edilir. */
const WINDOW = 1;
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) throw new Error("Geçersiz base32 karakteri.");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 160 bit rastgele anahtar, base32 olarak. */
export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

export const totpCounter = (now = Date.now()) => Math.floor(now / 1000 / PERIOD);

export function totpCode(secret: string, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const bin = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(bin % 10 ** DIGITS).padStart(DIGITS, "0");
}

/** "123 456" gibi boşluklu girişleri de kabul eder. Geçerliyse kodun sayaç değerini döner. */
export function verifyTotp(secret: string, input: string, now = Date.now()): number | undefined {
  const code = input.replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return undefined;
  const current = totpCounter(now);
  for (let d = -WINDOW; d <= WINDOW; d++) {
    const expected = totpCode(secret, current + d);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(code))) return current + d;
  }
  return undefined;
}

export function otpauthUri(secret: string, account: string, issuer = "Rafta"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const qs = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: String(DIGITS), period: String(PERIOD) });
  return `otpauth://totp/${label}?${qs}`;
}
