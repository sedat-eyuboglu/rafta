import path from "node:path";

export interface Config {
  port: number;
  host: string;
  dbPath: string;
  /** base64 32 bayt; boşsa veri klasöründe anahtar dosyası kullanılır. */
  secretKey: string | undefined;
  keyFile: string;
  /** Authenticator koduyla girildikten sonra cihazın kaç gün açık kalacağı. */
  sessionDays: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const dbPath = path.resolve(env.DB_PATH ?? "./data/rafta.db");
  const port = Number(env.PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT geçersiz: ${env.PORT}`);
  }
  const sessionDays = Number(env.RAFTA_SESSION_DAYS || 30);
  if (!Number.isInteger(sessionDays) || sessionDays < 1 || sessionDays > 365) {
    throw new Error(`RAFTA_SESSION_DAYS 1 ile 365 arasında tam sayı olmalı: ${env.RAFTA_SESSION_DAYS}`);
  }
  return {
    port,
    host: env.HOST ?? "0.0.0.0",
    dbPath,
    secretKey: env.RAFTA_SECRET_KEY?.trim() || undefined,
    keyFile: path.join(path.dirname(dbPath), "secret.key"),
    sessionDays,
  };
}
