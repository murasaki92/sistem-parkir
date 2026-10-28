import type { NextApiRequest, NextApiResponse } from "next";
import { getDb, nowIso } from "../../../lib/db";
import { methodNotAllowed, requireUser } from "../../../lib/api";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (methodNotAllowed(req, res, ["GET"])) return;
  const user = requireUser(req, res);
  if (!user) return;

  const db = getDb();
  const now = nowIso();
  const cutoff = new Date(Date.now() - 90_000).toISOString();

  db.prepare(
    `UPDATE exit_operations
        SET status = 'attention',
            last_error = COALESCE(last_error, 'Perangkat tidak merespons dalam 90 detik.'),
            updated_at = ?
      WHERE status = 'waiting' AND updated_at < ?`,
  ).run(now, cutoff);

  const operations = db
    .prepare(
      "SELECT * FROM exit_operations WHERE status IN ('waiting', 'attention') ORDER BY id DESC LIMIT 50",
    )
    .all() as any[];

  const result = operations.map((operation) => {
    const failed = db
      .prepare(
        "SELECT correlation_id, command_type, error_message FROM device_commands WHERE ticket_no = ? AND phase = 'exit' AND status = 'failed'",
      )
      .all(operation.ticket_no) as Array<{
      correlation_id: string;
      command_type: string;
      error_message: string | null;
    }>;
    let warnings: string[] = [];
    try {
      warnings = operation.warnings ? JSON.parse(operation.warnings) : [];
    } catch {
      warnings = [];
    }
    return {
      id: Number(operation.id),
      ticketNo: operation.ticket_no,
      status: operation.status,
      lastError: operation.last_error,
      warnings,
      failedCommands: failed.map((command) => ({
        correlationId: command.correlation_id,
        commandType: command.command_type,
        errorMessage: command.error_message,
      })),
      createdAt: operation.created_at,
      updatedAt: operation.updated_at,
    };
  });

  return res.status(200).json({ operations: result });
}
