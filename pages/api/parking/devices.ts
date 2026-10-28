import type { NextApiRequest, NextApiResponse } from "next";
import { getDb, nowIso } from "../../../lib/db";
import { asString, fail, methodNotAllowed, requireUser } from "../../../lib/api";
import { mapDevice, type DeviceRow } from "../../../lib/parking";

function getDevice(id: number): DeviceRow | null {
  const row = getDb()
    .prepare("SELECT * FROM devices WHERE id = ?")
    .get(id) as DeviceRow | undefined;
  return row ?? null;
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (methodNotAllowed(req, res, ["GET", "POST"])) return;
  const user = requireUser(req, res);
  if (!user) return;

  const db = getDb();

  if (req.method === "GET") {
    const rows = db
      .prepare("SELECT * FROM devices ORDER BY device_code")
      .all() as DeviceRow[];
    return res.status(200).json(rows.map(mapDevice));
  }

  if (user.role !== "admin" && user.role !== "supervisor") {
    return fail(res, 403, "Hanya Admin atau Supervisor yang dapat mengelola perangkat.");
  }

  const body = (req.body || {}) as Record<string, unknown>;
  const action = asString(body.action, "create");

  if (action === "setStatus") {
    const id = Number(body.id);
    const status = asString(body.status);
    if (!Number.isFinite(id) || !["active", "inactive", "maintenance"].includes(status)) {
      return fail(res, 400, "Perangkat atau status tidak valid.");
    }
    const existing = getDevice(id);
    if (!existing) return fail(res, 404, "Perangkat tidak ditemukan.");
    db.prepare("UPDATE devices SET status = ?, updated_at = ? WHERE id = ?").run(
      status,
      nowIso(),
      id,
    );
    return res.status(200).json(mapDevice(getDevice(id)!));
  }

  if (action !== "create" && action !== "update") {
    return fail(res, 400, "Aksi perangkat tidak dikenal.");
  }

  const deviceCode = asString(body.deviceCode).toUpperCase();
  const name = asString(body.name);
  const deviceType = asString(body.deviceType, "gate");
  const status = asString(body.status, "active");
  const area = asString(body.area) || null;
  const gateDirection = asString(body.gateDirection) || null;
  const cameraUrl = asString(body.cameraUrl) || null;
  const cameraSnapshotUrl = asString(body.cameraSnapshotUrl) || null;

  if (!deviceCode || !name) {
    return fail(res, 400, "Kode dan nama perangkat wajib diisi.");
  }
  if (!["gate", "cashier", "controller", "camera", "printer", "sensor"].includes(deviceType)) {
    return fail(res, 400, "Jenis perangkat tidak valid.");
  }
  if (!["active", "inactive", "maintenance"].includes(status)) {
    return fail(res, 400, "Status perangkat tidak valid.");
  }

  let capabilities: Record<string, unknown> = {};
  if (body.capabilities && typeof body.capabilities === "object") {
    capabilities = { ...(body.capabilities as Record<string, unknown>) };
    delete capabilities.health;
  }

  if (action === "create") {
    const duplicate = db
      .prepare("SELECT id FROM devices WHERE UPPER(device_code) = ?")
      .get(deviceCode);
    if (duplicate) return fail(res, 409, "Kode perangkat sudah digunakan.");
    const result = db
      .prepare(
        `INSERT INTO devices
          (device_code, name, device_type, status, area, gate_direction, camera_url, camera_snapshot_url, capabilities, secret_hash, last_seen_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
      )
      .run(
        deviceCode,
        name,
        deviceType,
        status,
        area,
        gateDirection,
        cameraUrl,
        cameraSnapshotUrl,
        JSON.stringify(capabilities),
        nowIso(),
        nowIso(),
      );
    return res.status(201).json(mapDevice(getDevice(Number(result.lastInsertRowid))!));
  }

  const id = Number(body.id);
  if (!Number.isFinite(id)) return fail(res, 400, "ID perangkat tidak valid.");
  const existing = getDevice(id);
  if (!existing) return fail(res, 404, "Perangkat tidak ditemukan.");

  const duplicate = db
    .prepare("SELECT id FROM devices WHERE UPPER(device_code) = ? AND id <> ?")
    .get(deviceCode, id);
  if (duplicate) return fail(res, 409, "Kode perangkat sudah digunakan.");

  let existingCapabilities: Record<string, unknown> = {};
  try {
    existingCapabilities = JSON.parse(existing.capabilities || "{}");
  } catch {
    existingCapabilities = {};
  }
  // Merge instead of replacing so heartbeat health/firmware data survives edits.
  const mergedCapabilities = { ...existingCapabilities, ...capabilities };

  db.prepare(
    `UPDATE devices
        SET device_code = ?, name = ?, device_type = ?, status = ?, area = ?,
            gate_direction = ?, camera_url = ?, camera_snapshot_url = ?,
            capabilities = ?, updated_at = ?
      WHERE id = ?`,
  ).run(
    deviceCode,
    name,
    deviceType,
    status,
    area,
    gateDirection,
    cameraUrl,
    cameraSnapshotUrl,
    JSON.stringify(mergedCapabilities),
    nowIso(),
    id,
  );

  return res.status(200).json(mapDevice(getDevice(id)!));
}
