import crypto from "node:crypto";
import { createApp } from "../src/app.js";
import { loadAssets } from "../src/assets.js";
import { openDatabase } from "../src/db/index.js";
import { SecretBox, verifyKey } from "../src/lib/crypto.js";
import { totpCode, totpCounter } from "../src/lib/totp.js";
import { confirmPendingTotp, createSession, pendingTotpSecret } from "../src/repo/auth.js";

/**
 * Varsayılan olarak authenticator kurulu ve oturum açık bir uygulama döner.
 * `{ auth: "none" }`: giriş hiç kurulmamış; `{ auth: "configured" }`: kurulu ama oturum yok.
 */
export function setup(opts: { auth?: "session" | "configured" | "none" } = {}) {
  const auth = opts.auth ?? "session";
  loadAssets();
  const db = openDatabase(":memory:");
  const box = new SecretBox(crypto.randomBytes(32));
  verifyKey(db, box);
  const app = createApp({ db, box, sessionDays: 30 });
  const ORIGIN = "http://localhost";

  let secret = "";
  let cookie = "";
  if (auth !== "none") {
    secret = pendingTotpSecret(db, box);
    // Kurulumda kullanılan kod "kullanıldı" sayılır; testler bir sonraki kodla girer.
    confirmPendingTotp(db, box, totpCode(secret, totpCounter() - 1));
    if (auth === "session") cookie = `rafta_session=${createSession(db, 30)}`;
  }

  const withCookie = (headers: Record<string, string>) => (cookie ? { cookie, ...headers } : headers);
  const post = (path: string, fields: [string, string][] | Record<string, string>, headers: Record<string, string> = {}) => {
    const body = new URLSearchParams(Array.isArray(fields) ? fields : Object.entries(fields));
    return app.request(path, {
      method: "POST",
      body,
      headers: withCookie({ "content-type": "application/x-www-form-urlencoded", origin: ORIGIN, host: "localhost", ...headers }),
    });
  };
  const get = (path: string, headers: Record<string, string> = {}) => app.request(path, { headers: withCookie(headers) });

  return { db, box, app, post, get, secret };
}

export const baseServer = (overrides: Record<string, string> = {}): [string, string][] =>
  Object.entries({
    hostname: "web-01",
    role: "Nginx",
    environment: "prod",
    status: "active",
    currency: "TRY",
    ...overrides,
  });

export const idFrom = (res: Response) => Number(/\/servers\/(\d+)/.exec(res.headers.get("location") ?? "")?.[1]);

/** Set-Cookie başlığından istek için "ad=değer" çıkarır. */
export const cookieFrom = (res: Response) => res.headers.get("set-cookie")?.split(";")[0] ?? "";
