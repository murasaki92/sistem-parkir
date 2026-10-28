import type { NextApiRequest, NextApiResponse } from "next";
import { getDb, nowIso } from "../../../lib/db";
import { asString, fail, methodNotAllowed, requireUser } from "../../../lib/api";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (methodNotAllowed(req, res, ["POST"])) return;
  const user = requireUser(req, res, ["admin", "supervisor"]);
  if (!user) return;

  const operationId = Number(req.body?.operationId);
  const reason = asString(req.body?.reason);
  if (!Number.isFinite(operationId)) {
    return fail(res, 400, "ID operasi tidak valid.");
  }
  if (reason.length < 5) {
    return fail(res, 400, "Alasan resolusi minimal 5 karakter.");
  }

  const db = getDb();
  const operation = db
    .prepare("SELECT * FROM exit_operations WHERE id = ?")
    .get(operationId) as any;
  if (!operation) return fail(res, 404, "Operasi Gate Out tidak ditemukan.");

  db.prepare(
    `UPDATE exit_operations
        SET status = 'resolved', resolved_by = ?, resolved_reason = ?, updated_at = ?
      WHERE id = ?`,
  ).run(user.id, reason, nowIso(), operationId);

  return res.status(200).json({ ok: true });
}
