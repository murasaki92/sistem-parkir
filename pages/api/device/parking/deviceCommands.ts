import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "../../../../lib/db";
import { methodNotAllowed } from "../../../../lib/api";
import { authenticateDevice } from "../../../../lib/device-auth";
import { mapCommand } from "../../../../lib/parking";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (methodNotAllowed(req, res, ["GET"])) return;
  const device = authenticateDevice(req);
  if (!device) {
    return res.status(401).json({ error: "Kredensial perangkat tidak valid." });
  }

  const requested = Number(req.query.limit);
  const limit = Number.isFinite(requested)
    ? Math.min(50, Math.max(1, Math.trunc(requested)))
    : 10;

  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM device_commands
        WHERE device_code = ? AND status IN ('pending', 'acknowledged')
        ORDER BY id ASC LIMIT ?`,
    )
    .all(device.device_code, limit) as any[];

  return res.status(200).json({ commands: rows.map(mapCommand) });
}
