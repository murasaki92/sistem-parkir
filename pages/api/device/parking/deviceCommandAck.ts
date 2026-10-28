import type { NextApiRequest, NextApiResponse } from "next";
import { getDb, nowIso } from "../../../../lib/db";
import { methodNotAllowed } from "../../../../lib/api";
import { authenticateDevice } from "../../../../lib/device-auth";
import { mapCommand, refreshExitOperation } from "../../../../lib/parking";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (methodNotAllowed(req, res, ["POST"])) return;
  const device = authenticateDevice(req);
  if (!device) {
    return res.status(401).json({ error: "Kredensial perangkat tidak valid." });
  }

  const commandId = Number(req.body?.commandId);
  const status = String(req.body?.status || "");
  const errorMessage =
    typeof req.body?.errorMessage === "string" ? req.body.errorMessage : null;
  if (!Number.isFinite(commandId)) {
    return res.status(400).json({ error: "ID command tidak valid." });
  }
  if (!["acknowledged", "completed", "failed"].includes(status)) {
    return res.status(400).json({ error: "Status command tidak valid." });
  }

  const db = getDb();
  const command = db
    .prepare("SELECT * FROM device_commands WHERE id = ? AND device_code = ?")
    .get(commandId, device.device_code) as any;
  if (!command) {
    return res.status(404).json({ error: "Command tidak ditemukan untuk perangkat ini." });
  }

  const now = nowIso();
  db.prepare(
    `UPDATE device_commands
        SET status = ?, error_message = ?,
            acknowledged_at = CASE WHEN ? = 'acknowledged' THEN COALESCE(acknowledged_at, ?) ELSE acknowledged_at END,
            completed_at = CASE WHEN ? IN ('completed', 'failed') THEN ? ELSE completed_at END
      WHERE id = ?`,
  ).run(status, errorMessage, status, now, status, now, commandId);

  if (command.ticket_no) {
    refreshExitOperation(db, command.ticket_no);
  }

  const updated = db
    .prepare("SELECT * FROM device_commands WHERE id = ?")
    .get(commandId) as any;

  return res.status(200).json({ ok: true, command: mapCommand(updated) });
}
