import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import type { DB } from "./db/index.js";
import type { SecretBox } from "./lib/crypto.js";
import { sameOrigin } from "./lib/same-origin.js";
import { authRoutes, requireAuth } from "./routes/auth.js";
import { credentialRoutes } from "./routes/credentials.js";
import { passwordRoutes } from "./routes/passwords.js";
import { serverRoutes } from "./routes/servers.js";
import { systemRoutes } from "./routes/system.js";
import { renderError } from "./routes/render.js";

export interface AppDeps {
  db: DB;
  box: SecretBox;
  /** Girişten sonra cihazın açık kalacağı gün (varsayılan 30). */
  sessionDays?: number;
}

export type Env = { Variables: Required<AppDeps> };

export function createApp(deps: AppDeps) {
  const app = new Hono<Env>();

  app.use(
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        objectSrc: ["'none'"],
      },
      // Uygulama düz HTTP üzerinden de çalışabilmeli (yerel ağ); HSTS'yi ters vekil koysun.
      strictTransportSecurity: false,
      referrerPolicy: "same-origin",
    }),
  );
  app.use(sameOrigin());
  app.use(async (c, next) => {
    c.set("db", deps.db);
    c.set("box", deps.box);
    c.set("sessionDays", deps.sessionDays ?? 30);
    await next();
  });
  app.use(requireAuth());

  app.route("/", authRoutes());
  app.route("/", systemRoutes);
  app.route("/", serverRoutes);
  app.route("/", credentialRoutes);
  app.route("/", passwordRoutes);

  app.notFound((c) => renderError(c, 404, "Sayfa bulunamadı", "Aradığın kayıt silinmiş ya da adres yanlış olabilir."));
  app.onError((err, c) => {
    console.error(err);
    return renderError(c, 500, "Beklenmeyen bir hata oluştu", "İşlem tamamlanamadı. Ayrıntılar sunucu loglarında.");
  });

  return app;
}
