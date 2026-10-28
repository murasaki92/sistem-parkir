import type { NextApiRequest, NextApiResponse } from "next";
import { getDb, nowIso } from "../../../lib/db";
import { asInt, asString, fail, methodNotAllowed, requireUser } from "../../../lib/api";
import { expectedCash, mapShift, openShiftForUser } from "../../../lib/parking";
import { logAudit } from "../../../lib/audit";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (methodNotAllowed(req, res, ["POST"])) return;
  const user = requireUser(req, res, ["cashier", "admin", "supervisor"]);
  if (!user) return;

  const db = getDb();
  const shift = openShiftForUser(db, user.id);
  if (!shift) return fail(res, 409, "Tidak ada shift kasir yang terbuka.");

  const closingCash = asInt(req.body?.closingCash, -1);
  if (closingCash < 0) {
    return fail(res, 400, "Saldo akhir kas tidak valid.");
  }

  const expected = expectedCash(db, shift.id);
  const difference = closingCash - expected;
  const notes = asString(req.body?.notes) || null;
  const closedAt = nowIso();

  db.prepare(
    `UPDATE shifts
        SET closed_at = ?, closing_cash = ?, expected_cash = ?, difference = ?, notes = ?, status = 'closed'
      WHERE id = ?`,
  ).run(closedAt, closingCash, expected, difference, notes, shift.id);

  const row = db.prepare("SELECT * FROM shifts WHERE id = ?").get(shift.id) as any;
  logAudit(db, req, user, "shift.close", "shift", shift.id, {
    closingCash,
    expectedCash: expected,
    difference,
  });
  return res.status(200).json(mapShift(db, row));
}
