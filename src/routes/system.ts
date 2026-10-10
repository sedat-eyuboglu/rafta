import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import type { Env } from "../app.js";
import { getAsset } from "../assets.js";
import { serversToCsv } from "../lib/csv.js";
import { listServers } from "../repo/servers.js";
import { readFilter } from "./servers.js";

export const systemRoutes = new Hono<Env>();

systemRoutes.get("/healthz", (c) => {
  c.var.db.prepare("SELECT 1").get();
  return c.text("ok");
});

systemRoutes.get("/static/:path{.+}", (c) => {
  const asset = getAsset(c.req.param("path"));
  if (!asset) return c.notFound();
  // ?v= içeren adresler içerik özetine bağlı, değişmez; diğerleri her seferinde doğrulanır.
  c.header("Cache-Control", c.req.query("v") ? "public, max-age=31536000, immutable" : "no-cache");
  c.header("ETag", asset.etag);
  if (c.req.header("if-none-match") === asset.etag) return c.body(null, 304);
  c.header("Content-Type", asset.type);
  return c.body(new Uint8Array(asset.body));
});

systemRoutes.get("/favicon.ico", (c) => c.redirect("/static/favicon.svg", 301));

const stamp = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
};

systemRoutes.get("/export.csv", (c) => {
  const csv = serversToCsv(listServers(c.var.db, readFilter(c)));
  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", `attachment; filename="rafta-sunucular-${stamp()}.csv"`);
  c.header("Cache-Control", "no-store");
  return c.body(csv);
});

/** SQLite online backup API: yazmalar sürerken de tutarlı bir kopya üretir. */
systemRoutes.get("/backup", async (c) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rafta-backup-"));
  const file = path.join(dir, "rafta.db");
  try {
    await c.var.db.backup(file);
    const body = await fs.readFile(file);
    c.header("Content-Type", "application/vnd.sqlite3");
    c.header("Content-Disposition", `attachment; filename="rafta-${stamp()}.db"`);
    c.header("Cache-Control", "no-store");
    return c.body(new Uint8Array(body));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
