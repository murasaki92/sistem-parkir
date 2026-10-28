import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "../../../lib/db";
import { methodNotAllowed, requireUser } from "../../../lib/api";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (methodNotAllowed(req, res, ["GET"])) return;
  const user = requireUser(req, res, ["admin", "supervisor"]);
  if (!user) return;

  const rows = getDb()
    .prepare("SELECT * FROM overrides ORDER BY created_at DESC LIMIT 100")
    .all() as any[];

  return res.status(200).json(
    rows.map((row) => ({
      id: Number(row.id),
      overrideType: row.override_type,
      ticketNo: row.ticket_no,
      amount: row.amount === null ? null : Number(row.amount),
      reason: row.reason,
      approvedBy: row.approved_by ? Number(row.approved_by) : null,
      approvedByName: row.approved_by_name,
      createdAt: row.created_at,
    })),
  );
}
