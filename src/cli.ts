// Sunucu üzerinde çalıştırılan bakım komutları. Docker'da:
//   docker exec -u node rafta node dist/cli.js <komut>
import { loadConfig } from "./config.js";
import { openDatabase } from "./db/index.js";
import { createSetupToken, deleteOtherSessions, isAuthConfigured, resetAuth } from "./repo/auth.js";

const COMMANDS: Record<string, string> = {
  "reset-2fa": "Authenticator'ı, kurtarma kodlarını ve tüm oturumları siler; yeni kurulum bağlantısı verir. Sunucular ve şifreler silinmez.",
  "setup-link": "Giriş henüz kurulmadıysa yeni bir kurulum bağlantısı verir.",
  "logout-all": "Tüm cihazlardaki oturumları kapatır.",
  "backup <dosya>": "Veritabanının tutarlı bir kopyasını alır (örn. /data/yedek.db).",
};

function usage(): never {
  console.log("Kullanım: node dist/cli.js <komut>\n");
  for (const [cmd, desc] of Object.entries(COMMANDS)) console.log(`  ${cmd.padEnd(16)} ${desc}`);
  process.exit(1);
}

const [cmd, arg] = process.argv.slice(2);
if (!cmd) usage();

const db = openDatabase(loadConfig().dbPath);
const link = (token: string) => `/setup?token=${token}`;

try {
  switch (cmd) {
    case "reset-2fa": {
      const token = resetAuth(db);
      console.log("Authenticator ve tüm oturumlar sıfırlandı. Sunucular ve şifreler yerinde.");
      console.log(`Rafta adresinin sonuna şunu ekleyip aç (24 saat geçerli):\n  ${link(token)}`);
      break;
    }
    case "setup-link":
      if (isAuthConfigured(db)) {
        console.log("Giriş zaten kurulu. Sıfırlamak için: reset-2fa");
        process.exitCode = 1;
      } else {
        console.log(`Rafta adresinin sonuna şunu ekleyip aç (24 saat geçerli):\n  ${link(createSetupToken(db))}`);
      }
      break;
    case "logout-all":
      console.log(`${deleteOtherSessions(db)} oturum kapatıldı.`);
      break;
    case "backup":
      if (!arg) usage();
      await db.backup(arg);
      console.log(`Yedek alındı: ${arg}`);
      break;
    default:
      usage();
  }
} finally {
  db.close();
}
