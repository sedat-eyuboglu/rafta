import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkgDir = (name: string) => path.dirname(require.resolve(`${name}/package.json`));

interface Asset {
  body: Buffer;
  type: string;
  etag: string;
}

const TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

/** Yayınlanan dosyaların tam listesi; istekten gelen yol asla diske gitmez. */
function sources(): Record<string, string> {
  const files: Record<string, string> = {
    "app.css": path.join(root, "public/app.css"),
    "app.js": path.join(root, "public/app.js"),
    "theme.js": path.join(root, "public/theme.js"),
    "favicon.svg": path.join(root, "public/favicon.svg"),
    "htmx.min.js": path.join(pkgDir("htmx.org"), "dist/htmx.min.js"),
  };
  for (const family of ["sans", "mono"]) {
    const dir = path.join(pkgDir(`@fontsource/ibm-plex-${family}`), "files");
    for (const subset of ["latin", "latin-ext"]) {
      for (const weight of [400, 500, 600]) {
        const name = `ibm-plex-${family}-${subset}-${weight}-normal.woff2`;
        files[`fonts/${name}`] = path.join(dir, name);
      }
    }
  }
  return files;
}

const assets = new Map<string, Asset>();
let version = "";

export function loadAssets(): void {
  assets.clear();
  const hash = crypto.createHash("sha256");
  for (const [name, file] of Object.entries(sources())) {
    const body = fs.readFileSync(file);
    const etag = `"${crypto.createHash("sha1").update(body).digest("base64url").slice(0, 16)}"`;
    assets.set(name, { body, type: TYPES[path.extname(name)] ?? "application/octet-stream", etag });
    hash.update(name).update(body);
  }
  version = hash.digest("hex").slice(0, 10);
}

export function getAsset(name: string): Asset | undefined {
  return assets.get(name);
}

/** Önbellek kırıcı sürüm parametresiyle asset adresi. */
export function asset(name: string): string {
  return `/static/${name}?v=${version}`;
}
