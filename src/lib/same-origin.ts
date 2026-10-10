import type { MiddlewareHandler } from "hono";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Login olmadığı için tek CSRF savunması budur: başka bir siteden gelen form/htmx
 * isteklerini reddeder. Şema karşılaştırılmaz, böylece TLS sonlandıran bir ters vekil
 * arkasında (tarayıcı https, uygulama http görür) da çalışır.
 */
export function sameOrigin(): MiddlewareHandler {
  return async (c, next) => {
    if (SAFE.has(c.req.method)) return next();

    const site = c.req.header("sec-fetch-site");
    if (site && site !== "same-origin" && site !== "none") return c.text("Başka siteden gelen istek reddedildi.", 403);

    const origin = c.req.header("origin");
    if (origin && origin !== "null") {
      let originHost: string;
      try {
        originHost = new URL(origin).host;
      } catch {
        return c.text("Geçersiz Origin.", 403);
      }
      const hosts = [c.req.header("x-forwarded-host"), c.req.header("host")]
        .flatMap((h) => (h ? h.split(",") : []))
        .map((h) => h.trim().toLowerCase());
      if (!hosts.includes(originHost.toLowerCase())) return c.text("Başka siteden gelen istek reddedildi.", 403);
    } else if (origin === "null") {
      return c.text("Başka siteden gelen istek reddedildi.", 403);
    }
    return next();
  };
}
