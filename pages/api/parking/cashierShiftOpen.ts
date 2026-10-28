import type { NextApiRequest, NextApiResponse } from "next";
import { getDb, nowIso } from "../../../lib/db";
import { asInt, fail, methodNotAllowed, requireUser } from "../../../lib/api";
import {
  mapShift,
  openShiftForUser,
} from "../../../lib/parking";
import { logAudit } from "../../../lib/audit";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (methodNotAllowed(req, res, ["POST"])) return;
  const user = requireUser(req, res, ["cashier", "admin", "supervisor"]);
  if (!user) return;

  const db = getDb();
  if (openShiftForUser(db, user.id)) {
    return fail(res, 409, "Masih ada shift kasir yang terbuka.");
  }

  const openingCash = asInt(req.body?.openingCash, -1);
  if (openingCash < 0) {
    return fail(res, 400, "Saldo awal kas tidak valid.");
  }

  const openedAt = nowIso();
  const result = db
    .prepare(
      `INSERT INTO shifts
        (user_id, opened_at, closed_at, opening_cash, closing_cash, expected_cash, difference, notes, status, created_at)
       VALUES (?, ?, NULL, ?, NULL, ?, NULL, NULL, 'open', ?)`,
    )
    .run(user.id, openedAt, openingCash, openingCash, openedAt);

  const row = db
    .prepare("SELECT * FROM shifts WHERE id = ?")
    .get(Number(result.lastInsertRowid)) as any;

  logAudit(db, req, user, "shift.open", "shift", row.id, {
    openingCash,
  });
  return res.status(201).json(mapShift(db, row));
}
