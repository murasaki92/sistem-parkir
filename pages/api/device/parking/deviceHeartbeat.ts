import type { NextApiRequest, NextApiResponse } from "next";
import { getDb, nowIso } from "../../../../lib/db";
import { methodNotAllowed } from "../../../../lib/api";
import { authenticateDevice } from "../../../../lib/device-auth";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (methodNotAllowed(req, res, ["POST"])) return;
  const device = authenticateDevice(req);
  if (!device) {
    return res.status(401).json({ error: "Kredensial perangkat tidak valid." });
  }

  const body = (req.body || {}) as Record<string, unknown>;
  let capabilities: Record<string, any> = {};
  try {
    capabilities = JSON.parse(device.capabilities || "{}");
  } catch {
    capabilities = {};
  }
  if (body.health && typeof body.health === "object") {
    capabilities.health = body.health;
  }
  if (body.firmwareVersion) capabilities.firmwareVersion = body.firmwareVersion;
  if (body.ipAddress) capabilities.ipAddress = body.ipAddress;
  if (body.status) capabilities.reportedStatus = body.status;

  const db = getDb();
  db.prepare(
    "UPDATE devices SET last_seen_at = ?, capabilities = ?, updated_at = ? WHERE id = ?",
  ).run(nowIso(), JSON.stringify(capabilities), nowIso(), device.id);

  return res.status(200).json({
    ok: true,
    serverTime: nowIso(),
    deviceCode: device.device_code,
  });
}
