import type { NextApiRequest } from "next";
import type { DatabaseSync } from "node:sqlite";
import { getDb } from "./db";
import { verifyPassword } from "./password";
import type { DeviceRow } from "./parking";

export type AuthenticatedDevice = DeviceRow & { parsedCapabilities: Record<string, any> };

/**
 * Validates x-device-code / x-device-secret headers used by gate firmware and
 * the built-in simulator. Returns null when credentials are missing/invalid.
 */
export function authenticateDevice(
  req: NextApiRequest,
  db: DatabaseSync = getDb(),
): AuthenticatedDevice | null {
  const code = String(req.headers["x-device-code"] || "").trim().toUpperCase();
  const secret = String(req.headers["x-device-secret"] || "").trim();
  if (!code || !secret) return null;

  const row = db
    .prepare("SELECT * FROM devices WHERE UPPER(device_code) = ? LIMIT 1")
    .get(code) as (DeviceRow & { secret_hash: string | null }) | undefined;
  if (!row || row.status !== "active" || !row.secret_hash) return null;
  if (!verifyPassword(secret, row.secret_hash)) return null;

  let parsedCapabilities: Record<string, any> = {};
  try {
    parsedCapabilities = JSON.parse(row.capabilities || "{}");
  } catch {
    parsedCapabilities = {};
  }
  return { ...row, parsedCapabilities };
}
