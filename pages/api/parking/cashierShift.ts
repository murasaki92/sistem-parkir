import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "../../../lib/db";
import { methodNotAllowed, requireUser } from "../../../lib/api";
import { mapShift, openShiftForUser } from "../../../lib/parking";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (methodNotAllowed(req, res, ["GET"])) return;
  const user = requireUser(req, res, ["cashier", "admin", "supervisor"]);
  if (!user) return;

  const db = getDb();
  const current = mapShift(db, openShiftForUser(db, user.id));
  const history = (
    db
      .prepare(
        "SELECT * FROM shifts WHERE user_id = ? ORDER BY id DESC LIMIT 10",
      )
      .all(user.id) as any[]
  ).map((row) => mapShift(db, row));

  return res.status(200).json({ current, history });
}
