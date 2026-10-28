import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "../../../lib/db";
import { methodNotAllowed, requireUser } from "../../../lib/api";
import { listAuditLogs } from "../../../lib/audit";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (methodNotAllowed(req, res, ["GET"])) return;
  const user = requireUser(req, res, ["admin", "supervisor"]);
  if (!user) return;

  const limit = Number(req.query.limit);
  const query = typeof req.query.q === "string" ? req.query.q : "";
  return res.status(200).json(
    listAuditLogs(getDb(), {
      limit: Number.isFinite(limit) ? limit : 200,
      query,
    }),
  );
}
