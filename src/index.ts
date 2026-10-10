import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadAssets } from "./assets.js";
import { loadConfig } from "./config.js";
import { openDatabase } from "./db/index.js";
import { SecretBox, resolveKey, verifyKey } from "./lib/crypto.js";
import { createSetupToken, isAuthConfigured } from "./repo/auth.js";

const config = loadConfig();
const db = openDatabase(config.dbPath);
const box = new SecretBox(resolveKey(config.secretKey, config.keyFile));
verifyKey(db, box);
loadAssets();

const app = createApp({ db, box, sessionDays: config.sessionDays });
const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`[rafta] http://${info.address}:${info.port} — veritabanı: ${config.dbPath}`);
  if (!isAuthConfigured(db)) {
    // Her açılışta yenisi üretilir; 24 saat geçerlidir.
    console.log(
      `[rafta] Giriş henüz kurulmadı. Authenticator'ı bağlamak için Rafta adresinin sonuna şunu ekleyip aç:\n` +
        `[rafta]   /setup?token=${createSetupToken(db)}\n` +
        `[rafta] Örnek: http://SUNUCU:PORT/setup?token=...`,
    );
  }
});

function shutdown(signal: string) {
  console.log(`[rafta] ${signal} alındı, kapatılıyor`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
