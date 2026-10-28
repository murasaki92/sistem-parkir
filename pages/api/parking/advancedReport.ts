import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "../../../lib/db";
import { asString, fail, methodNotAllowed, requireUser } from "../../../lib/api";
import { getSiteSettings, timezoneModifier } from "../../../lib/parking";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (methodNotAllowed(req, res, ["GET"])) return;
  const user = requireUser(req, res, ["admin", "supervisor", "operator", "viewer"]);
  if (!user) return;

  const db = getDb();
  const site = getSiteSettings(db);
  const tz = timezoneModifier(site.timezoneOffsetHours);
  const today = new Date(
    Date.now() + site.timezoneOffsetHours * 3600000,
  )
    .toISOString()
    .slice(0, 10);
  const from = asString(req.query.from, today);
  const to = asString(req.query.to, today);
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return fail(res, 400, "Format tanggal harus YYYY-MM-DD.");
  }
  if (from > to) return fail(res, 400, "Tanggal awal tidak boleh melebihi tanggal akhir.");

  const paid = db
    .prepare(
      `SELECT COALESCE(SUM(fee), 0) AS revenue, COUNT(*) AS transactions
         FROM tickets
        WHERE status = 'paid' AND date(paid_at, '${tz}') BETWEEN ? AND ?`,
    )
    .get(from, to) as { revenue: number; transactions: number };

  const parked = db
    .prepare("SELECT COUNT(*) AS count FROM tickets WHERE status = 'parked'")
    .get() as { count: number };

  const membershipFree = db
    .prepare(
      `SELECT COUNT(*) AS count FROM tickets
        WHERE status = 'paid' AND membership_id IS NOT NULL AND fee = 0
          AND date(paid_at, '${tz}') BETWEEN ? AND ?`,
    )
    .get(from, to) as { count: number };

  const overrides = db
    .prepare(
      `SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount
         FROM overrides WHERE date(created_at, '${tz}') BETWEEN ? AND ?`,
    )
    .get(from, to) as { count: number; amount: number };

  const reported = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
         FROM payments WHERE date(created_at, '${tz}') BETWEEN ? AND ?`,
    )
    .get(from, to) as { total: number };

  const revenue = Number(paid.revenue);
  const transactions = Number(paid.transactions);
  const expectedRevenue = revenue;
  const reportedPaymentTotal = Number(reported.total);

  const paymentMethods: Record<string, number> = {
    cash: 0,
    qris: 0,
    card: 0,
  };
  const methodRows = db
    .prepare(
      `SELECT method, COALESCE(SUM(amount), 0) AS total
         FROM payments WHERE date(created_at, '${tz}') BETWEEN ? AND ?
        GROUP BY method`,
    )
    .all(from, to) as Array<{ method: string; total: number }>;
  for (const row of methodRows) {
    paymentMethods[row.method] = Number(row.total);
  }

  const entryByHour = new Map<string, number>();
  const exitByHour = new Map<string, number>();
  const revenueByHour = new Map<string, number>();

  const entryRows = db
    .prepare(
      `SELECT strftime('%H', entry_at, '${tz}') AS hour, COUNT(*) AS count
         FROM tickets WHERE date(entry_at, '${tz}') BETWEEN ? AND ?
        GROUP BY hour`,
    )
    .all(from, to) as Array<{ hour: string; count: number }>;
  for (const row of entryRows) {
    if (row.hour) entryByHour.set(row.hour, Number(row.count));
  }

  const exitRows = db
    .prepare(
      `SELECT strftime('%H', paid_at, '${tz}') AS hour, COUNT(*) AS count, COALESCE(SUM(fee), 0) AS revenue
         FROM tickets WHERE status = 'paid' AND date(paid_at, '${tz}') BETWEEN ? AND ?
        GROUP BY hour`,
    )
    .all(from, to) as Array<{ hour: string; count: number; revenue: number }>;
  for (const row of exitRows) {
    if (row.hour) {
      exitByHour.set(row.hour, Number(row.count));
      revenueByHour.set(row.hour, Number(row.revenue));
    }
  }

  const hourly = Array.from({ length: 24 }, (_, index) => {
    const hour = String(index).padStart(2, "0");
    return {
      hour,
      entries: entryByHour.get(hour) || 0,
      exits: exitByHour.get(hour) || 0,
      revenue: revenueByHour.get(hour) || 0,
    };
  });

  const vehicleTypes: Record<string, number> = {};
  const vehicleRows = db
    .prepare(
      `SELECT vehicle_type, COUNT(*) AS count
         FROM tickets WHERE date(entry_at, '${tz}') BETWEEN ? AND ?
        GROUP BY vehicle_type`,
    )
    .all(from, to) as Array<{ vehicle_type: string; count: number }>;
  for (const row of vehicleRows) {
    vehicleTypes[row.vehicle_type] = Number(row.count);
  }

  return res.status(200).json({
    range: { from, to },
    summary: {
      revenue,
      transactions,
      averagePaid: transactions ? Math.round(revenue / transactions) : 0,
      parked: Number(parked.count),
      membershipFree: Number(membershipFree.count),
      overrideCount: Number(overrides.count),
      overrideAmount: Number(overrides.amount),
    },
    reconciliation: {
      expectedRevenue,
      reportedPaymentTotal,
      difference: reportedPaymentTotal - expectedRevenue,
    },
    paymentMethods,
    hourly,
    vehicleTypes,
  });
}
