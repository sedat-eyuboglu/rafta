import { describe, expect, it } from "vitest";
import { baseServer, idFrom, setup } from "./helpers.js";

describe("sunucu CRUD", () => {
  it("ekler, listeler, detayını gösterir", async () => {
    const { post, get } = setup();
    const res = await post("/servers", [
      ...baseServer({ hostname: "web-01", tags: "web, kritik", monthly_cost: "1.249,90" }),
      ["ip_address", "203.0.113.10"],
      ["ip_kind", "public"],
      ["ip_label", "eth0"],
      ["ip_address", "10.0.0.10"],
      ["ip_kind", "private"],
      ["ip_label", ""],
      ["ip_primary", "1"],
    ]);
    expect(res.status).toBe(303);
    const id = idFrom(res);

    const list = await (await get("/")).text();
    expect(list).toContain("web-01");
    expect(list).toContain("10.0.0.10"); // birincil adres listede
    expect(list).toContain("₺1.249,90");

    const detail = await (await get(`/servers/${id}`)).text();
    expect(detail).toContain("203.0.113.10");
    expect(detail).toContain("ssh 10.0.0.10");
    expect(detail).toContain("Sunucu eklendi");
  });

  it("hatalı formu 422 ile, girilen değerleri koruyarak geri gösterir", async () => {
    const { post } = setup();
    const res = await post("/servers", [
      ...baseServer({ hostname: "bad host", role: "korunacak rol" }),
      ["ip_address", "300.1.1.1"],
      ["ip_kind", "public"],
    ]);
    expect(res.status).toBe(422);
    const html = await res.text();
    expect(html).toContain("korunacak rol");
    expect(html).toContain("300.1.1.1");
    expect(html).toContain("Geçerli bir IPv4/IPv6");
  });

  it("aynı hostname'i büyük/küçük harf farkıyla da reddeder", async () => {
    const { post } = setup();
    await post("/servers", baseServer({ hostname: "db-01" }));
    const res = await post("/servers", baseServer({ hostname: "DB-01" }));
    expect(res.status).toBe(422);
    expect(await res.text()).toContain("zaten var");
  });

  it("güncellemede değişen alanları geçmişe yazar; değişiklik yoksa yazmaz", async () => {
    const { post, get, db } = setup();
    const id = idFrom(await post("/servers", baseServer({ ram_gb: "8", tags: "a" })));

    const same = await post(`/servers/${id}`, baseServer({ ram_gb: "8", tags: "a" }));
    expect(same.headers.get("location")).toContain("ok=unchanged");

    const changed = await post(`/servers/${id}`, baseServer({ ram_gb: "16", status: "maintenance", tags: "a, b" }));
    expect(changed.headers.get("location")).toContain("ok=saved");

    const rows = db.prepare("SELECT field, old_value, new_value FROM history WHERE server_id = ? AND action = 'update'").all(id);
    expect(rows).toEqual(
      expect.arrayContaining([
        { field: "status", old_value: "Aktif", new_value: "Bakımda" },
        { field: "ram_gb", old_value: "8 GB", new_value: "16 GB" },
        { field: "tags", old_value: "a", new_value: "a, b" },
      ]),
    );
    expect(rows).toHaveLength(3);
    expect(await (await get(`/servers/${id}`)).text()).toContain("Bakımda");
  });

  it("siler; IP, etiket ve erişim bilgileri de gider, geçmiş kalır", async () => {
    const { post, get, db } = setup();
    const id = idFrom(
      await post("/servers", [...baseServer({ tags: "tek" }), ["ip_address", "10.0.0.1"], ["ip_kind", "private"]]),
    );
    await post(`/servers/${id}/credentials`, { label: "SSH", username: "root", secret: "x" });
    const res = await post(`/servers/${id}/delete`, {});
    expect(res.status).toBe(303);
    expect((await get(`/servers/${id}`)).status).toBe(404);
    const count = (t: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
    expect(count("ip_addresses")).toBe(0);
    expect(count("credentials")).toBe(0);
    expect(count("tags")).toBe(0);
    expect(db.prepare("SELECT action FROM history WHERE server_id = ? ORDER BY id DESC").get(id)).toEqual({
      action: "delete",
    });
  });
});

describe("liste filtreleri", () => {
  it("arama, ortam/durum filtresi ve sıralama çalışır; htmx isteğine yalnızca sonuçları döner", async () => {
    const { post, get } = setup();
    await post("/servers", [...baseServer({ hostname: "alpha", os_name: "Debian", cpu_cores: "2" }), ["ip_address", "10.1.1.1"], ["ip_kind", "private"]]);
    await post("/servers", baseServer({ hostname: "beta", environment: "dev", cpu_cores: "16", tags: "ci" }));
    await post("/servers", baseServer({ hostname: "gamma", status: "retired", cpu_cores: "8" }));

    const names = (html: string) => [...html.matchAll(/class="host-link" href="[^"]+">([^<]+)</g)].map((m) => m[1]);

    expect(names(await (await get("/?q=10.1.1")).text())).toEqual(["alpha"]);
    expect(names(await (await get("/?q=debian")).text())).toEqual(["alpha"]);
    expect(names(await (await get("/?q=ci")).text())).toEqual(["beta"]);
    expect(names(await (await get("/?env=dev")).text())).toEqual(["beta"]);
    expect(names(await (await get("/?status=active&status=retired")).text())).toEqual(["alpha", "beta", "gamma"]);
    expect(names(await (await get("/?sort=cpu&dir=desc")).text())).toEqual(["beta", "gamma", "alpha"]);
    // LIKE joker karakterleri düz metin olarak aranır
    expect(names(await (await get("/?q=%25")).text())).toEqual([]);

    const partial = await (await get("/?q=alpha", { "hx-request": "true", "hx-target": "results" })).text();
    expect(partial.startsWith('<section id="results"')).toBe(true);
    expect(partial).toContain('hx-swap-oob="true"');
  });
});

describe("erişim bilgileri", () => {
  it("şifreyi şifreli saklar, yalnızca istenince çözer, geçmişe yazmaz", async () => {
    const { post, get, db } = setup();
    const id = idFrom(await post("/servers", baseServer()));
    const res = await post(`/servers/${id}/credentials`, { label: "SSH root", username: "root", secret: "Çok-Gizli-123" });
    expect(res.status).toBe(303);

    const row = db.prepare("SELECT id, secret_enc FROM credentials").get() as { id: number; secret_enc: Buffer };
    expect(row.secret_enc.includes(Buffer.from("Çok-Gizli-123"))).toBe(false);

    const detail = await (await get(`/servers/${id}`)).text();
    expect(detail).not.toContain("Çok-Gizli-123");

    const secret = await get(`/servers/${id}/credentials/${row.id}/secret`);
    expect(await secret.text()).toBe("Çok-Gizli-123");
    expect(secret.headers.get("cache-control")).toBe("no-store");

    // Boş şifre alanı düzenlemede mevcut şifreyi korur
    await post(`/servers/${id}/credentials/${row.id}`, { label: "SSH root", username: "admin", secret: "" });
    expect(await (await get(`/servers/${id}/credentials/${row.id}/secret`)).text()).toBe("Çok-Gizli-123");

    await post(`/servers/${id}/credentials/${row.id}`, { label: "SSH root", username: "admin", secret: "yeni" });
    expect(await (await get(`/servers/${id}/credentials/${row.id}/secret`)).text()).toBe("yeni");

    const history = JSON.stringify(db.prepare("SELECT * FROM history").all());
    expect(history).not.toContain("Çok-Gizli-123");
    expect(history).not.toContain('"yeni"');
    expect(history).toContain("şifre değişti");
  });

  it("başka sunucunun erişim bilgisine sunucu id'si değiştirilerek ulaşılamaz", async () => {
    const { post, get, db } = setup();
    const a = idFrom(await post("/servers", baseServer({ hostname: "a" })));
    const b = idFrom(await post("/servers", baseServer({ hostname: "b" })));
    await post(`/servers/${a}/credentials`, { label: "x", secret: "s" });
    const cid = (db.prepare("SELECT id FROM credentials").get() as { id: number }).id;
    expect((await get(`/servers/${b}/credentials/${cid}/secret`)).status).toBe(404);
  });

  it("htmx ile hatalı form 422 + form parçası döner, girilen şifreyi geri basmaz", async () => {
    const { post } = setup();
    const id = idFrom(await post("/servers", baseServer()));
    const res = await post(`/servers/${id}/credentials`, { label: "", secret: "gizli-deger" }, { "hx-request": "true" });
    expect(res.status).toBe(422);
    const html = await res.text();
    expect(html.startsWith("<form")).toBe(true);
    expect(html).not.toContain("gizli-deger");
  });
});

describe("şifreler", () => {
  const pwId = (res: Response) => Number(/[?&]new=(\d+)/.exec(res.headers.get("location") ?? "")?.[1]);

  it("şifreli saklar, listede göstermez, yalnızca istenince çözer", async () => {
    const { post, get, db } = setup();
    const res = await post("/passwords", { title: "Gmail", username: "ben@example.com", secret: "Gizli-Şifre-42" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("ok=pw_added");
    const id = pwId(res);

    const row = db.prepare("SELECT secret_enc FROM passwords WHERE id = ?").get(id) as { secret_enc: Buffer };
    expect(row.secret_enc.includes(Buffer.from("Gizli-Şifre-42"))).toBe(false);

    const html = await (await get("/passwords")).text();
    expect(html).toContain("Gmail");
    expect(html).toContain("ben@example.com");
    expect(html).not.toContain("Gizli-Şifre-42");

    const secret = await get(`/passwords/${id}/secret`);
    expect(await secret.text()).toBe("Gizli-Şifre-42");
    expect(secret.headers.get("cache-control")).toBe("no-store");
  });

  it("başlığa yapıştırılan adresi adres alanına taşır, şemasız adresi tamamlar", async () => {
    const { post, db } = setup();
    await post("/passwords", { title: "https://www.github.com/login", username: "ornek", secret: "x" });
    await post("/passwords", { title: "", url: "turkiye.gov.tr", secret: "y" });
    await post("/passwords", { title: "Modem", url: "192.168.1.1", secret: "z" });
    expect(db.prepare("SELECT title, url FROM passwords ORDER BY id").all()).toEqual([
      { title: "github.com", url: "https://www.github.com/login" },
      { title: "turkiye.gov.tr", url: "https://turkiye.gov.tr" },
      { title: "Modem", url: "http://192.168.1.1" },
    ]);
  });

  it("başlıksız kaydı reddeder; htmx'te yalnızca formu döner ve şifreyi geri basmaz", async () => {
    const { post } = setup();
    const res = await post("/passwords", { title: "", username: "u", secret: "gizli-deger" }, { "hx-request": "true" });
    expect(res.status).toBe(422);
    const html = await res.text();
    expect(html.startsWith('<form id="quick-add"')).toBe(true);
    expect(html).toContain('value="u"');
    expect(html).not.toContain("gizli-deger");

    const plain = await post("/passwords", { title: "", secret: "gizli-deger" });
    expect(plain.status).toBe(422);
    const page = await plain.text();
    expect(page).not.toContain("gizli-deger");
    expect(page).toContain("şifre alanı temizlendi");
  });

  it("javascript: gibi adresleri kabul etmez", async () => {
    const { post } = setup();
    expect((await post("/passwords", { title: "x", url: "javascript:alert(1)" })).status).toBe(422);
  });

  it("düzenler: boş şifre mevcut şifreyi korur, silme kutusu şifreyi kaldırır; siler", async () => {
    const { post, get } = setup();
    const id = pwId(await post("/passwords", { title: "Banka", username: "123", secret: "eski" }));

    const edit = await get(`/passwords/${id}/edit`, { "hx-request": "true" });
    expect(await edit.text()).toContain('value="Banka"');

    await post(`/passwords/${id}`, { title: "Banka", username: "456", secret: "" });
    expect(await (await get(`/passwords/${id}/secret`)).text()).toBe("eski");
    await post(`/passwords/${id}`, { title: "Banka", username: "456", secret: "yeni" });
    expect(await (await get(`/passwords/${id}/secret`)).text()).toBe("yeni");
    await post(`/passwords/${id}`, { title: "Banka", username: "456", secret: "", clear_secret: "1" });
    expect(await (await get(`/passwords/${id}/secret`)).text()).toBe("");

    expect((await post(`/passwords/${id}/delete`, {})).headers.get("location")).toContain("ok=pw_deleted");
    expect((await get(`/passwords/${id}/secret`)).status).toBe(404);
    expect((await get(`/passwords/${id}/edit`)).status).toBe(404);
  });

  it("arar; sunucu erişim bilgileri de listede ve aramada görünür", async () => {
    const { post, get } = setup();
    await post("/passwords", { title: "Gmail", username: "ben@example.com" });
    await post("/passwords", { title: "Netflix", username: "aile" });
    const sid = idFrom(await post("/servers", baseServer({ hostname: "db-01" })));
    await post(`/servers/${sid}/credentials`, { label: "SSH root", username: "root", secret: "s" });

    const all = await (await get("/passwords")).text();
    expect(all).toContain("Netflix");
    expect(all).toContain("db-01");
    expect(all).toContain(`/servers/${sid}/credentials/`);

    const partial = await (await get("/passwords?q=gmail", { "hx-request": "true", "hx-target": "vault-results" })).text();
    expect(partial.startsWith('<section id="vault-results"')).toBe(true);
    expect(partial).toContain("Gmail");
    expect(partial).not.toContain("Netflix");
    expect(partial).not.toContain("db-01");

    const byHost = await (await get("/passwords?q=db-01")).text();
    expect(byHost).toContain("SSH root");
    expect(byHost).not.toContain("Netflix");
  });

  it("başka origin'den şifre eklemeyi reddeder", async () => {
    const { post } = setup();
    expect((await post("/passwords", { title: "x" }, { origin: "https://evil.example" })).status).toBe(403);
  });
});

describe("güvenlik", () => {
  it("başka origin'den gelen POST'u reddeder", async () => {
    const { post } = setup();
    expect((await post("/servers", baseServer(), { origin: "https://evil.example" })).status).toBe(403);
    expect((await post("/servers", baseServer(), { "sec-fetch-site": "cross-site" })).status).toBe(403);
  });

  it("ters vekil arkasında (https origin, http uygulama) aynı host'u kabul eder", async () => {
    const { post } = setup();
    const res = await post("/servers", baseServer(), { origin: "https://rafta.lan", host: "rafta.lan" });
    expect(res.status).toBe(303);
  });

  it("kullanıcı girdisini HTML olarak kaçışlar", async () => {
    const { post, get } = setup();
    const id = idFrom(await post("/servers", baseServer({ role: "<script>alert(1)</script>" })));
    const html = await (await get(`/servers/${id}`)).text();
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("CSP başlığı gönderir", async () => {
    const { get } = setup();
    expect((await get("/")).headers.get("content-security-policy")).toContain("script-src 'self'");
  });
});

describe("dışa aktarma ve yedek", () => {
  it("CSV'yi BOM, ';' ayırıcı ve formül kaçışıyla üretir; filtreyi uygular", async () => {
    const { post, get } = setup();
    await post("/servers", baseServer({ hostname: "a", notes: "=HYPERLINK(\"x\")" }));
    await post("/servers", baseServer({ hostname: "b", environment: "dev" }));
    const res = await get("/export.csv?env=prod");
    const bytes = Buffer.from(await res.arrayBuffer());
    const csv = bytes.toString("utf8");
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="rafta-sunucular-.+\.csv"/);
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // Excel için UTF-8 BOM
    expect(csv.split("\r\n")[0]).toContain("Hostname;Rol;Ortam");
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).not.toMatch(/\r\nb;/);
  });

  it("tutarlı bir SQLite yedeği indirir", async () => {
    const { post, get } = setup();
    await post("/servers", baseServer());
    const res = await get("/backup");
    expect(res.status).toBe(200);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 15).toString()).toBe("SQLite format 3");
  });

  it("statik dosyaları önbellek başlıklarıyla, bilinmeyenleri 404 ile sunar", async () => {
    const { get } = setup();
    const css = await get("/static/app.css?v=x");
    expect(css.status).toBe(200);
    expect(css.headers.get("cache-control")).toContain("immutable");
    expect((await get("/static/../package.json")).status).toBe(404);
    expect((await get("/static/fonts/ibm-plex-sans-latin-ext-400-normal.woff2")).status).toBe(200);
  });
});
