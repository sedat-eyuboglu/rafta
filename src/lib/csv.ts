import { ENVIRONMENTS, IP_KINDS, SERVER_TYPES, STATUSES } from "./labels.js";
import type { Server } from "../repo/types.js";

// Türkçe Excel ';' ayırıcı bekler; BOM, UTF-8 karakterlerin doğru açılmasını sağlar.
const SEP = ";";

function cell(value: unknown): string {
  if (value == null) return "";
  let s = String(value);
  // Formül enjeksiyonu: hücre =, +, -, @ ile başlıyorsa Excel onu formül olarak çalıştırır.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /["\n\r;,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const decimal = (n: number | null) => (n == null ? "" : String(n).replace(".", ","));

const COLUMNS: [string, (s: Server) => unknown][] = [
  ["Hostname", (s) => s.hostname],
  ["Rol", (s) => s.role],
  ["Ortam", (s) => ENVIRONMENTS[s.environment]],
  ["Durum", (s) => STATUSES[s.status]],
  ["Tip", (s) => (s.type ? SERVER_TYPES[s.type] : "")],
  ["IP adresleri", (s) => s.ips.map((ip) => `${ip.address} (${IP_KINDS[ip.kind]})`).join(", ")],
  ["SSH portu", (s) => s.ssh_port],
  ["CPU çekirdek", (s) => s.cpu_cores],
  ["RAM (GB)", (s) => decimal(s.ram_gb)],
  ["Disk (GB)", (s) => s.disk_gb],
  ["Depolama notu", (s) => s.storage_note],
  ["Sağlayıcı", (s) => s.provider],
  ["Konum", (s) => s.location],
  ["Rack", (s) => s.rack],
  ["İşletim sistemi", (s) => s.os_name],
  ["OS sürümü", (s) => s.os_version],
  ["Sorumlu", (s) => s.owner],
  ["Aylık maliyet", (s) => (s.monthly_cost_cents == null ? "" : decimal(s.monthly_cost_cents / 100))],
  ["Para birimi", (s) => (s.monthly_cost_cents == null ? "" : s.currency)],
  ["Yenileme tarihi", (s) => s.renewal_date],
  ["Etiketler", (s) => s.tags.join(", ")],
  ["Notlar", (s) => s.notes],
  ["Oluşturulma", (s) => s.created_at],
  ["Güncellenme", (s) => s.updated_at],
];

export function serversToCsv(servers: Server[]): string {
  const lines = [COLUMNS.map(([h]) => cell(h)).join(SEP)];
  for (const s of servers) lines.push(COLUMNS.map(([, get]) => cell(get(s))).join(SEP));
  return "﻿" + lines.join("\r\n") + "\r\n";
}
