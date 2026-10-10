import type { DB } from "../db/index.js";
import type { Currency, Environment, Status } from "../lib/labels.js";

export interface Stats {
  total: number;
  byStatus: Partial<Record<Status, number>>;
  byEnvironment: Partial<Record<Environment, number>>;
  /** Emekli sunucular hariç aylık maliyet toplamı, para birimine göre. */
  monthlyCost: Partial<Record<Currency, number>>;
  /** Önümüzdeki 30 gün içinde (veya geçmişte) yenilemesi olan, emekli olmayan sunucular. */
  renewalsDue: { id: number; hostname: string; renewal_date: string }[];
}

export function getStats(db: DB, today = new Date()): Stats {
  const total = (db.prepare("SELECT COUNT(*) AS n FROM servers").get() as { n: number }).n;
  const count = (col: "status" | "environment") =>
    Object.fromEntries(
      (db.prepare(`SELECT ${col} AS k, COUNT(*) AS n FROM servers GROUP BY ${col}`).all() as { k: string; n: number }[]).map(
        (r) => [r.k, r.n],
      ),
    );
  const monthlyCost = Object.fromEntries(
    (
      db
        .prepare(
          `SELECT currency AS k, SUM(monthly_cost_cents) AS n FROM servers
           WHERE monthly_cost_cents IS NOT NULL AND status <> 'retired' GROUP BY currency`,
        )
        .all() as { k: string; n: number }[]
    ).map((r) => [r.k, r.n]),
  );
  const limit = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const renewalsDue = db
    .prepare(
      `SELECT id, hostname, renewal_date FROM servers
       WHERE renewal_date IS NOT NULL AND renewal_date <= ? AND status <> 'retired'
       ORDER BY renewal_date`,
    )
    .all(iso(limit)) as Stats["renewalsDue"];
  return { total, byStatus: count("status"), byEnvironment: count("environment"), monthlyCost, renewalsDue };
}
