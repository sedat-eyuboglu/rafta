import { describe, expect, it } from "vitest";
import { normalizeIp, parseMoney, parseServerForm, parseTags } from "../src/lib/validation.js";

describe("parseMoney", () => {
  it("Türkçe ve noktalı biçimleri kuruşa çevirir", () => {
    expect(parseMoney("1.249,90")).toBe(124990);
    expect(parseMoney("1249,9")).toBe(124990);
    expect(parseMoney("1249.90")).toBe(124990);
    expect(parseMoney("₺ 15")).toBe(1500);
    expect(parseMoney("")).toBeNull();
  });
  it("geçersiz tutarı reddeder", () => {
    expect(parseMoney("abc")).toBeUndefined();
    expect(parseMoney("-5")).toBeUndefined();
    expect(parseMoney("1,234")).toBeUndefined();
  });
});

describe("normalizeIp", () => {
  it("IPv4, IPv6 ve CIDR kabul eder", () => {
    expect(normalizeIp(" 10.0.0.1 ")).toBe("10.0.0.1");
    expect(normalizeIp("2A01:4F8::1")).toBe("2a01:4f8::1");
    expect(normalizeIp("10.0.0.0/24")).toBe("10.0.0.0/24");
    expect(normalizeIp("2001:db8::/48")).toBe("2001:db8::/48");
  });
  it("geçersiz adresleri reddeder", () => {
    expect(normalizeIp("999.1.1.1")).toBeNull();
    expect(normalizeIp("10.0.0.0/33")).toBeNull();
    expect(normalizeIp("example.com")).toBeNull();
    expect(normalizeIp("10.0.0.1/24/1")).toBeNull();
  });
});

describe("parseTags", () => {
  it("tekrarları büyük/küçük harf duyarsız temizler, boşlukları tireye çevirir", () => {
    expect(parseTags("web, Web, kritik altyapı,, db")).toEqual(["web", "kritik-altyapı", "db"]);
  });
});

describe("parseServerForm", () => {
  const base = { hostname: "db-01", environment: "prod", status: "active" };

  it("geçerli formu dönüştürür ve ilk IP'yi birincil yapar", () => {
    const r = parseServerForm({
      ...base,
      ram_gb: "0,5",
      monthly_cost: "10,50",
      ssh_port: "",
      ip_address: ["", "10.0.0.5", "10.0.0.6"],
      ip_kind: ["public", "private", "mgmt"],
      ip_label: ["", "", "bmc"],
      ip_primary: "0",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.ram_gb).toBe(0.5);
    expect(r.value.monthly_cost_cents).toBe(1050);
    expect(r.value.ssh_port).toBe(22);
    expect(r.value.ips.map((i) => [i.address, i.is_primary])).toEqual([
      ["10.0.0.5", true],
      ["10.0.0.6", false],
    ]);
  });

  it("alan bazında hata döndürür", () => {
    const r = parseServerForm({
      hostname: "bad host",
      environment: "nope",
      status: "active",
      cpu_cores: "1.5",
      ssh_port: "70000",
      renewal_date: "2026-13-40",
      ip_address: ["10.0.0.1", "10.0.0.1"],
      ip_kind: ["public", "public"],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(
      ["cpu_cores", "environment", "hostname", "ip_1", "renewal_date", "ssh_port"].sort(),
    );
  });
});
