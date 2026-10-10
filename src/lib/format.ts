import { CURRENCIES, type Currency } from "./labels.js";

const nf2 = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 });

export function money(cents: number | null | undefined, currency: Currency): string {
  if (cents == null) return "";
  return `${CURRENCIES[currency]}${nf2.format(cents / 100)}`;
}

/** Form alanında gösterim: 124990 → "1249,90". */
export function moneyInput(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function num(n: number | null | undefined): string {
  return n == null ? "" : nf.format(n);
}

/** 2048 GB → "2 TB", 500 → "500 GB". */
export function capacity(gb: number | null | undefined): string {
  if (gb == null) return "";
  if (gb >= 1000 && gb % 1000 === 0) return `${gb / 1000} TB`;
  if (gb >= 1024 && gb % 1024 === 0) return `${gb / 1024} TB`;
  return `${nf.format(gb)} GB`;
}

const dateFmt = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function date(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d);
}

export function dateTime(iso: string): string {
  return dateTimeFmt.format(new Date(iso));
}

const rtf = new Intl.RelativeTimeFormat("tr-TR", { numeric: "auto" });

export function relative(iso: string, from = Date.now()): string {
  const diff = (new Date(iso).getTime() - from) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return "az önce";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return date(iso);
}

/** Yenileme tarihine kalan gün (geçmişse negatif). */
export function daysUntil(isoDate: string, from = new Date()): number {
  const target = new Date(`${isoDate}T00:00:00`);
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}
