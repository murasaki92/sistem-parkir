import type { NextApiRequest, NextApiResponse } from "next";
import { getDb, nowIso } from "../../../lib/db";
import { fail, methodNotAllowed, requireUser } from "../../../lib/api";
import { hashPassword } from "../../../lib/password";
import type { DeviceRow } from "../../../lib/parking";

const { randomBytes } = process.getBuiltinModule("crypto");

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (methodNotAllowed(req, res, ["POST"])) return;
  const user = requireUser(req, res, ["admin", "supervisor"]);
  if (!user) return;

  const id = Number(req.body?.deviceId);
  if (!Number.isFinite(id)) return fail(res, 400, "ID perangkat tidak valid.");

  const db = getDb();
  const device = db
    .prepare("SELECT * FROM devices WHERE id = ?")
    .get(id) as DeviceRow | undefined;
  if (!device) return fail(res, 404, "Perangkat tidak ditemukan.");

  const secret = randomBytes(24).toString("base64url");
  db.prepare("UPDATE devices SET secret_hash = ?, updated_at = ? WHERE id = ?").run(
    hashPassword(secret),
    nowIso(),
    id,
  );

  return res.status(200).json({
    deviceCode: device.device_code,
    secret,
  });
}
