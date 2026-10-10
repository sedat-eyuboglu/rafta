import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, totpCode, totpCounter, verifyTotp } from "../src/lib/totp.js";
import { createSetupToken, resetAuth } from "../src/repo/auth.js";
import { cookieFrom, setup } from "./helpers.js";

const nextCode = (secret: string, step = 1) => totpCode(secret, totpCounter() + step);

describe("TOTP", () => {
  it("RFC 6238 test vektörlerini üretir", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    expect(secret).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(totpCode(secret, totpCounter(59_000))).toBe("287082");
    expect(totpCode(secret, totpCounter(1111111109_000))).toBe("081804");
    expect(base32Decode("gezd gnbv gy3t qojq gezd gnbv gy3t qojq").toString()).toBe("12345678901234567890");
  });

  it("bir önceki/sonraki kodu kabul eder, daha uzağını ve bozuk girişi reddeder", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    const t = 1111111109_000;
    const c = totpCounter(t);
    expect(verifyTotp(secret, totpCode(secret, c - 1), t)).toBe(c - 1);
    expect(verifyTotp(secret, totpCode(secret, c + 1).replace(/^(\d{3})/, "$1 "), t)).toBe(c + 1);
    expect(verifyTotp(secret, totpCode(secret, c + 2), t)).toBeUndefined();
    expect(verifyTotp(secret, "12345", t)).toBeUndefined();
  });
});

describe("giriş koruması", () => {
  it("oturumsuz istekleri girişe yönlendirir; sağlık kontrolü ve statik dosyalar açık", async () => {
    const { get, post } = setup({ auth: "configured" });
    expect((await get("/")).headers.get("location")).toBe("/login");
    expect((await get("/passwords?q=x")).headers.get("location")).toBe("/login?next=%2Fpasswords%3Fq%3Dx");
    expect((await get("/backup")).status).toBe(302);
    expect((await get("/passwords/1/secret")).status).toBe(401);
    expect((await post("/passwords", { title: "x" })).status).toBe(401);
    const htmx = await get("/passwords", { "hx-request": "true" });
    expect(htmx.status).toBe(401);
    expect(htmx.headers.get("hx-redirect")).toBe("/login?next=%2Fpasswords");
    expect((await get("/healthz")).status).toBe(200);
    expect((await get("/static/app.css")).status).toBe(200);
  });

  it("geçersiz/eski oturum çerezini kabul etmez", async () => {
    const { get } = setup({ auth: "configured" });
    expect((await get("/", { cookie: "rafta_session=uydurma" })).status).toBe(302);
  });

  it("kod ile girer, cihazı gün sayısı kadar hatırlar, aynı kodu ikinci kez kabul etmez", async () => {
    const { app, post, secret } = setup({ auth: "configured" });
    const code = nextCode(secret);
    const res = await post("/login", { code, next: "/passwords" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/passwords");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain(`Max-Age=${30 * 86400}`);

    const page = await app.request("/passwords", { headers: { cookie: cookieFrom(res) } });
    expect(page.status).toBe(200);

    const again = await post("/login", { code });
    expect(again.status).toBe(422);
    expect(await again.text()).toContain("az önce kullanıldı");
  });

  it("yanlış kodu reddeder ve 5 hatadan sonra bekletir", async () => {
    const { post, secret } = setup({ auth: "configured" });
    for (let i = 0; i < 5; i++) expect((await post("/login", { code: "000000" })).status).toBe(422);
    const blocked = await post("/login", { code: nextCode(secret) });
    expect(blocked.status).toBe(429);
    expect(await blocked.text()).toContain("Çok fazla hatalı deneme");
  });

  it("başka siteye yönlendirmez", async () => {
    const { post, secret } = setup({ auth: "configured" });
    const res = await post("/login", { code: nextCode(secret), next: "//evil.example/x" });
    expect(res.headers.get("location")).toBe("/");
  });

  it("çıkış oturumu kapatır", async () => {
    const { app, post, secret } = setup({ auth: "configured" });
    const cookie = cookieFrom(await post("/login", { code: nextCode(secret) }));
    await app.request("/logout", {
      method: "POST",
      headers: { cookie, origin: "http://localhost", host: "localhost" },
    });
    expect((await app.request("/", { headers: { cookie } })).status).toBe(302);
  });
});

describe("ilk kurulum", () => {
  it("bağlantı olmadan kurulum sayfası açılmaz; bağlantıyla QR gösterir, kodla onaylanınca kurtarma kodları verir", async () => {
    const { db, get, post, app } = setup({ auth: "none" });
    expect((await get("/")).headers.get("location")).toBe("/setup");
    expect((await get("/setup")).status).toBe(403);
    expect((await get("/setup?token=yanlis")).status).toBe(403);

    const token = createSetupToken(db);
    const html = await (await get(`/setup?token=${token}`)).text();
    expect(html).toContain("<svg");
    const secret = /data-copy="([A-Z2-7]+)"/.exec(html)?.[1];
    expect(secret).toBeTruthy();

    expect((await post("/setup", { token, code: "000000" })).status).toBe(422);
    const ok = await post("/setup", { token, code: totpCode(secret!, totpCounter()) });
    expect(ok.status).toBe(200);
    const codes = [...(await ok.text()).matchAll(/<code>([a-z2-7]{5}-[a-z2-7]{5})<\/code>/g)].map((m) => m[1]);
    expect(codes).toHaveLength(10);
    expect((await app.request("/", { headers: { cookie: cookieFrom(ok) } })).status).toBe(200);

    // Kurulum bir kez yapılır; bağlantı tekrar kullanılamaz.
    expect((await get(`/setup?token=${token}`)).headers.get("location")).toBe("/");
  });
});

describe("kurtarma", () => {
  async function enrolled() {
    const ctx = setup({ auth: "none" });
    const token = createSetupToken(ctx.db);
    const html = await (await ctx.get(`/setup?token=${token}`)).text();
    const secret = /data-copy="([A-Z2-7]+)"/.exec(html)![1]!;
    const res = await ctx.post("/setup", { token, code: totpCode(secret, totpCounter()) });
    const codes = [...(await res.text()).matchAll(/<code>([a-z2-7]{5}-[a-z2-7]{5})<\/code>/g)].map((m) => m[1]!);
    return { ...ctx, secret, codes, cookie: cookieFrom(res) };
  }

  it("kurtarma koduyla girer; kod bir kez kullanılır, büyük harf/boşluk fark etmez", async () => {
    const { post, codes } = await enrolled();
    const res = await post("/login", { code: ` ${codes[0]!.toUpperCase()} ` });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/security?ok=recovery_used");
    expect((await post("/login", { code: codes[0]! })).status).toBe(422);
    expect((await post("/login", { code: codes[1]!.replace("-", "") })).status).toBe(303);
    // l/o/b yerine 1/0/8 yazılsa da tutar
    expect((await post("/login", { code: codes[2]!.replace(/l/g, "1").replace(/o/g, "0").replace(/b/g, "8") })).status).toBe(303);
  });

  it("yeni kurtarma kodları eskileri geçersiz kılar", async () => {
    const { app, post, codes, cookie } = await enrolled();
    const res = await app.request("/security/recovery-codes", {
      method: "POST",
      headers: { cookie, origin: "http://localhost", host: "localhost" },
    });
    const fresh = [...(await res.text()).matchAll(/<code>([a-z2-7]{5}-[a-z2-7]{5})<\/code>/g)].map((m) => m[1]!);
    expect(fresh).toHaveLength(10);
    expect((await post("/login", { code: codes[0]! })).status).toBe(422);
    expect((await post("/login", { code: fresh[0]! })).status).toBe(303);
  });

  it("authenticator yeni telefona bağlanınca eski anahtar çalışmaz", async () => {
    const { app, post, secret, cookie } = await enrolled();
    const h = { cookie, origin: "http://localhost", host: "localhost" };
    const html = await (await app.request("/security/authenticator", { headers: h })).text();
    const fresh = /data-copy="([A-Z2-7]+)"/.exec(html)![1]!;
    expect(fresh).not.toBe(secret);
    const body = new URLSearchParams({ code: totpCode(fresh, totpCounter()) });
    const res = await app.request("/security/authenticator", {
      method: "POST",
      body,
      headers: { ...h, "content-type": "application/x-www-form-urlencoded" },
    });
    expect(res.headers.get("location")).toBe("/security?ok=totp_rebound");
    expect((await post("/login", { code: nextCode(secret) })).status).toBe(422);
    expect((await post("/login", { code: nextCode(fresh) })).status).toBe(303);
  });

  it("komut satırından sıfırlama: oturumlar kapanır, veriler kalır, kurulum yeniden açılır", async () => {
    const { db, app, get, cookie } = await enrolled();
    const h = { cookie, origin: "http://localhost", host: "localhost", "content-type": "application/x-www-form-urlencoded" };
    await app.request("/passwords", { method: "POST", body: new URLSearchParams({ title: "Gmail", secret: "s" }), headers: h });

    const token = resetAuth(db);
    expect((await app.request("/", { headers: { cookie } })).headers.get("location")).toBe("/setup");
    expect((await get(`/setup?token=${token}`)).status).toBe(200);
    expect(db.prepare("SELECT title FROM passwords").all()).toEqual([{ title: "Gmail" }]);
  });

  it("diğer cihazlardan çıkış bu cihazı açık bırakır", async () => {
    const { app, post, secret, cookie } = await enrolled();
    const other = cookieFrom(await post("/login", { code: nextCode(secret) }));
    await app.request("/security/sessions", { method: "POST", headers: { cookie, origin: "http://localhost", host: "localhost" } });
    expect((await app.request("/", { headers: { cookie } })).status).toBe(200);
    expect((await app.request("/", { headers: { cookie: other } })).status).toBe(302);
  });
});
