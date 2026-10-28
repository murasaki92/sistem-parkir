import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "../../../lib/db";
import { asString, methodNotAllowed, requireUser } from "../../../lib/api";
import { mapCommand } from "../../../lib/parking";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (methodNotAllowed(req, res, ["GET"])) return;
  const user = requireUser(req, res);
  if (!user) return;

  const ticketNo = asString(req.query.ticketNo).toUpperCase();
  if (!ticketNo) return res.status(200).json({ commands: [] });

  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM device_commands WHERE ticket_no = ? AND phase = 'exit' ORDER BY id ASC",
    )
    .all(ticketNo) as any[];

  const operation = db
    .prepare("SELECT * FROM exit_operations WHERE ticket_no = ?")
    .get(ticketNo) as any;

  return res.status(200).json({
    commands: rows.map(mapCommand),
    operation: operation
      ? {
          status: operation.status,
          lastError: operation.last_error,
          warnings: operation.warnings ? JSON.parse(operation.warnings) : [],
        }
      : null,
  });
}
