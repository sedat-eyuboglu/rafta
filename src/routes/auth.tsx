import { Hono, type Context, type MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import QRCode from "qrcode";
import type { Env } from "../app.js";
import {
  checkSetupToken,
  confirmPendingTotp,
  countSessions,
  createSession,
  deleteOtherSessions,
  deleteSession,
  isAuthConfigured,
  pendingTotpSecret,
  regenerateRecoveryCodes,
  remainingRecoveryCodes,
  touchSession,
  verifyLogin,
} from "../repo/auth.js";
import { otpauthUri } from "../lib/totp.js";
import { EnrollPage, LoginPage, RecoveryCodesPage, SecurityPage, SetupNeededPage } from "../views/Auth.js";
import { flashFor, isHtmx, page } from "./render.js";

const COOKIE = "rafta_session";

const isPublic = (path: string) =>
  path === "/healthz" || path === "/login" || path === "/setup" || path === "/favicon.ico" || path.startsWith("/static/");

/** Yalnızca site içi göreli adreslere dönülür (açık yönlendirme olmasın). */
function safeNext(raw: unknown): string {
  return typeof raw === "string" && /^\/(?![/\\])/.test(raw) && !raw.startsWith("/login") ? raw : "/";
}

/**
 * Tek kullanıcı, tek giriş kapısı. Hatalı denemeler süreç belleğinde sayılır: 5 dakikada en fazla
 * 5 hatalı kod. 6 haneli kodda tahmin şansı deneme başına ~3/1.000.000 olduğundan bu yeterli.
 */
class Throttle {
  #failures: number[] = [];
  constructor(
    readonly max = 5,
    readonly windowMs = 5 * 60_000,
  ) {}
  /** Bekleme gerekiyorsa kalan saniye, yoksa 0. */
  wait(now = Date.now()): number {
    this.#failures = this.#failures.filter((t) => now - t < this.windowMs);
    if (this.#failures.length < this.max) return 0;
    return Math.ceil((this.#failures[0]! + this.windowMs - now) / 1000);
  }
  fail(now = Date.now()) {
    this.#failures.push(now);
  }
}

const waitMessage = (s: number) => `Çok fazla hatalı deneme. ${s > 90 ? `${Math.ceil(s / 60)} dakika` : `${s} saniye`} sonra tekrar dene.`;

function startSession(c: Context<Env>) {
  const token = createSession(c.var.db, c.var.sessionDays, c.req.header("user-agent") ?? "");
  const https = new URL(c.req.url).protocol === "https:" || c.req.header("x-forwarded-proto") === "https";
  setCookie(c, COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: https,
    maxAge: c.var.sessionDays * 86400,
  });
}

/** Giriş yapılmamış isteği giriş (ya da ilk kurulum) sayfasına yönlendirir. */
export function requireAuth(): MiddlewareHandler<Env> {
  return async (c, next) => {
    if (isPublic(c.req.path)) return next();
    if (touchSession(c.var.db, getCookie(c, COOKIE))) return next();

    const target = isAuthConfigured(c.var.db)
      ? `/login${c.req.method === "GET" && c.req.path !== "/" ? `?next=${encodeURIComponent(c.req.path + new URL(c.req.url).search)}` : ""}`
      : "/setup";
    if (isHtmx(c)) {
      c.header("HX-Redirect", target);
      return c.body(null, 401);
    }
    if (c.req.method === "GET" && !c.req.path.endsWith("/secret")) return c.redirect(target, 302);
    return c.text("Oturum gerekli.", 401);
  };
}

async function qrSvg(uri: string) {
  return QRCode.toString(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });
}

async function renderEnroll(
  c: Context<Env>,
  mode: "setup" | "reenroll",
  extra: { token?: string; error?: string },
  status: 200 | 422 | 429 = 200,
) {
  const secret = pendingTotpSecret(c.var.db, c.var.box);
  const host = (c.req.header("x-forwarded-host") ?? c.req.header("host") ?? "rafta").split(",")[0]!.trim().split(":")[0]!;
  const svg = await qrSvg(otpauthUri(secret, host));
  return page(
    c,
    <EnrollPage
      mode={mode}
      qrSvg={svg}
      secret={secret}
      action={mode === "setup" ? "/setup" : "/security/authenticator"}
      {...extra}
    />,
    status,
  );
}

export function authRoutes() {
  const routes = new Hono<Env>();
  const throttle = new Throttle();

  // ---- İlk kurulum (loglardaki tek kullanımlık bağlantıyla) ----------------------------
  routes.get("/setup", async (c) => {
    if (isAuthConfigured(c.var.db)) return c.redirect("/", 302);
    const token = c.req.query("token");
    if (!checkSetupToken(c.var.db, token)) return page(c, <SetupNeededPage />, 403);
    c.header("Cache-Control", "no-store");
    return renderEnroll(c, "setup", { token: token! });
  });

  routes.post("/setup", async (c) => {
    if (isAuthConfigured(c.var.db)) return c.redirect("/", 303);
    const body = await c.req.parseBody();
    const token = typeof body.token === "string" ? body.token : undefined;
    if (!checkSetupToken(c.var.db, token)) return page(c, <SetupNeededPage />, 403);
    const wait = throttle.wait();
    if (wait) return renderEnroll(c, "setup", { token: token!, error: waitMessage(wait) }, 429);
    if (!confirmPendingTotp(c.var.db, c.var.box, String(body.code ?? ""))) {
      throttle.fail();
      return renderEnroll(c, "setup", { token: token!, error: "Kod tutmadı. Uygulamadaki güncel kodu yaz." }, 422);
    }
    startSession(c);
    c.header("Cache-Control", "no-store");
    return page(c, <RecoveryCodesPage codes={regenerateRecoveryCodes(c.var.db)} continueHref="/" fresh />);
  });

  // ---- Giriş / çıkış ---------------------------------------------------------------
  routes.get("/login", (c) => {
    if (!isAuthConfigured(c.var.db)) return c.redirect("/setup", 302);
    const next = safeNext(c.req.query("next"));
    if (touchSession(c.var.db, getCookie(c, COOKIE))) return c.redirect(next, 302);
    return page(c, <LoginPage next={next} days={c.var.sessionDays} />);
  });

  routes.post("/login", async (c) => {
    if (!isAuthConfigured(c.var.db)) return c.redirect("/setup", 303);
    const body = await c.req.parseBody();
    const next = safeNext(body.next);
    const fail = (error: string, status: 422 | 429 = 422) =>
      page(c, <LoginPage next={next} error={error} days={c.var.sessionDays} />, status);

    const wait = throttle.wait();
    if (wait) return fail(waitMessage(wait), 429);
    const result = verifyLogin(c.var.db, c.var.box, String(body.code ?? ""));
    if (result === "invalid") {
      throttle.fail();
      return fail("Kod tutmadı. Uygulamadaki güncel kodu yaz (her 30 saniyede değişir).");
    }
    if (result === "reused") return fail("Bu kod az önce kullanıldı. Uygulamada yeni kodun çıkmasını bekle.");
    startSession(c);
    return c.redirect(result === "recovery" ? "/security?ok=recovery_used" : next, 303);
  });

  routes.post("/logout", (c) => {
    const token = getCookie(c, COOKIE);
    if (token) deleteSession(c.var.db, token);
    deleteCookie(c, COOKIE, { path: "/" });
    return c.redirect("/login", 303);
  });

  // ---- Güvenlik ayarları (giriş gerekli) ------------------------------------------------
  routes.get("/security", (c) =>
    page(
      c,
      <SecurityPage
        remaining={remainingRecoveryCodes(c.var.db)}
        sessions={countSessions(c.var.db)}
        days={c.var.sessionDays}
        flash={flashFor(c)}
      />,
    ),
  );

  routes.post("/security/recovery-codes", (c) => {
    c.header("Cache-Control", "no-store");
    return page(c, <RecoveryCodesPage codes={regenerateRecoveryCodes(c.var.db)} continueHref="/security" fresh={false} />);
  });

  routes.post("/security/sessions", (c) => {
    deleteOtherSessions(c.var.db, getCookie(c, COOKIE));
    return c.redirect("/security?ok=sessions_closed", 303);
  });

  routes.get("/security/authenticator", (c) => {
    c.header("Cache-Control", "no-store");
    return renderEnroll(c, "reenroll", {});
  });

  routes.post("/security/authenticator", async (c) => {
    const body = await c.req.parseBody();
    const wait = throttle.wait();
    if (wait) return renderEnroll(c, "reenroll", { error: waitMessage(wait) }, 429);
    if (!confirmPendingTotp(c.var.db, c.var.box, String(body.code ?? ""))) {
      throttle.fail();
      return renderEnroll(c, "reenroll", { error: "Kod tutmadı. Yeni eklediğin Rafta kaydındaki kodu yaz." }, 422);
    }
    return c.redirect("/security?ok=totp_rebound", 303);
  });

  return routes;
}
