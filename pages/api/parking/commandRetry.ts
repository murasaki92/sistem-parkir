import type { NextApiRequest, NextApiResponse } from "next";
import { getDb, nowIso } from "../../../lib/db";
import { asString, fail, methodNotAllowed, requireUser } from "../../../lib/api";
import { mapCommand, refreshExitOperation } from "../../../lib/parking";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (methodNotAllowed(req, res, ["POST"])) return;
  const user = requireUser(req, res, ["cashier", "admin", "supervisor"]);
  if (!user) return;

  const correlationId = asString(req.body?.correlationId);
  if (!correlationId) return fail(res, 400, "ID perintah wajib diisi.");

  const db = getDb();
  const command = db
    .prepare("SELECT * FROM device_commands WHERE correlation_id = ?")
    .get(correlationId) as any;
  if (!command) return fail(res, 404, "Perintah perangkat tidak ditemukan.");

  db.prepare(
    `UPDATE device_commands
        SET status = 'pending', error_message = NULL, attempts = attempts + 1,
            acknowledged_at = NULL, completed_at = NULL
      WHERE correlation_id = ?`,
  ).run(correlationId);

  if (command.ticket_no) {
    db.prepare(
      "UPDATE exit_operations SET status = 'waiting', last_error = NULL, updated_at = ? WHERE ticket_no = ?",
    ).run(nowIso(), command.ticket_no);
    refreshExitOperation(db, command.ticket_no);
  }

  const updated = db
    .prepare("SELECT * FROM device_commands WHERE correlation_id = ?")
    .get(correlationId) as any;

  return res.status(200).json({ ok: true, command: mapCommand(updated) });
}
