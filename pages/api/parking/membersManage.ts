import type { NextApiRequest, NextApiResponse } from "next";
import { getDb, nowIso, transaction } from "../../../lib/db";
import { asInt, asString, fail, methodNotAllowed, requireUser } from "../../../lib/api";
import { listMembers } from "./members";
import { logAudit } from "../../../lib/audit";

type PlanRow = {
  id: number;
  name: string;
  duration_days: number;
  active: number;
};

function planById(id: number): PlanRow | null {
  const row = getDb()
    .prepare("SELECT id, name, duration_days, active FROM membership_plans WHERE id = ?")
    .get(id) as PlanRow | undefined;
  return row ?? null;
}

function nextMemberCode(): string {
  const db = getDb();
  const rows = db
    .prepare("SELECT member_code FROM members WHERE member_code LIKE 'MBR-%'")
    .all() as Array<{ member_code: string }>;
  let max = 0;
  for (const row of rows) {
    const value = Number(row.member_code.replace("MBR-", ""));
    if (Number.isFinite(value) && value > max) max = value;
  }
  return `MBR-${String(max + 1).padStart(4, "0")}`;
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (methodNotAllowed(req, res, ["POST"])) return;
  const user = requireUser(req, res, ["admin", "supervisor"]);
  if (!user) return;

  const db = getDb();
  const body = (req.body || {}) as Record<string, unknown>;
  const action = asString(body.action);

  if (action === "create") {
    const name = asString(body.name);
    const phone = asString(body.phone) || null;
    const email = asString(body.email) || null;
    const plateNumber = asString(body.plateNumber).toUpperCase();
    const vehicleType = asString(body.vehicleType, "Mobil");
    const planId = asInt(body.planId, 0);
    if (!name) return fail(res, 400, "Nama member wajib diisi.");
    if (!plateNumber) return fail(res, 400, "Nomor plat wajib diisi.");
    if (!["Mobil", "Motor"].includes(vehicleType)) {
      return fail(res, 400, "Jenis kendaraan tidak valid.");
    }
    const plan = planById(planId);
    if (!plan || Number(plan.active) !== 1) {
      return fail(res, 400, "Paket membership tidak tersedia.");
    }
    const duplicate = db
      .prepare("SELECT id FROM member_vehicles WHERE UPPER(plate_number) = ?")
      .get(plateNumber);
    if (duplicate) return fail(res, 409, "Nomor plat sudah terdaftar.");

    const expiresAt = new Date(
      Date.now() + Number(plan.duration_days) * 86400000,
    ).toISOString();
    const createdAt = nowIso();
    const memberCode = nextMemberCode();

    const id = transaction(db, () => {
      const result = db
        .prepare(
          `INSERT INTO members (member_code, name, phone, email, status, plan_id, expires_at, created_at)
           VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`,
        )
        .run(memberCode, name, phone, email, planId, expiresAt, createdAt);
      const memberId = Number(result.lastInsertRowid);
      db.prepare(
        "INSERT INTO member_vehicles (member_id, plate_number, vehicle_type, active, created_at) VALUES (?, ?, ?, 1, ?)",
      ).run(memberId, plateNumber, vehicleType, createdAt);
      return memberId;
    });

    logAudit(db, req, user, "member.create", "member", id, {
      memberCode,
      planId,
      plateNumber,
      vehicleType,
    });
    return res.status(201).json({
      ok: true,
      memberId: id,
      members: listMembers(),
    });
  }

  const memberId = asInt(body.memberId, 0);
  if (!memberId) return fail(res, 400, "ID member tidak valid.");
  const member = db
    .prepare("SELECT * FROM members WHERE id = ?")
    .get(memberId) as any;
  if (!member) return fail(res, 404, "Member tidak ditemukan.");

  if (action === "update") {
    const name = asString(body.name, member.name);
    if (!name) return fail(res, 400, "Nama member wajib diisi.");
    const status = asString(body.status, member.status);
    if (!["active", "inactive", "blocked"].includes(status)) {
      return fail(res, 400, "Status member tidak valid.");
    }
    db.prepare(
      "UPDATE members SET name = ?, phone = ?, email = ?, status = ? WHERE id = ?",
    ).run(
      name,
      asString(body.phone) || null,
      asString(body.email) || null,
      status,
      memberId,
    );
    logAudit(db, req, user, "member.update", "member", memberId, { status });
    return res.status(200).json({ ok: true, members: listMembers() });
  }

  if (action === "add_vehicle") {
    const plateNumber = asString(body.plateNumber).toUpperCase();
    const vehicleType = asString(body.vehicleType, "Mobil");
    if (!plateNumber) return fail(res, 400, "Nomor plat wajib diisi.");
    if (!["Mobil", "Motor"].includes(vehicleType)) {
      return fail(res, 400, "Jenis kendaraan tidak valid.");
    }
    const duplicate = db
      .prepare("SELECT id FROM member_vehicles WHERE UPPER(plate_number) = ?")
      .get(plateNumber);
    if (duplicate) return fail(res, 409, "Nomor plat sudah terdaftar.");
    db.prepare(
      "INSERT INTO member_vehicles (member_id, plate_number, vehicle_type, active, created_at) VALUES (?, ?, ?, 1, ?)",
    ).run(memberId, plateNumber, vehicleType, nowIso());
    logAudit(db, req, user, "member.add_vehicle", "member", memberId, {
      plateNumber,
      vehicleType,
    });
    return res.status(201).json({ ok: true, members: listMembers() });
  }

  if (action === "toggle_vehicle") {
    const vehicleId = asInt(body.vehicleId, 0);
    const active = body.active ? 1 : 0;
    if (!vehicleId) return fail(res, 400, "ID kendaraan tidak valid.");
    db.prepare(
      "UPDATE member_vehicles SET active = ? WHERE id = ? AND member_id = ?",
    ).run(active, vehicleId, memberId);
    logAudit(db, req, user, "member.toggle_vehicle", "member", memberId, {
      vehicleId,
      active: Boolean(active),
    });
    return res.status(200).json({ ok: true, members: listMembers() });
  }

  if (action === "renew") {
    const plan = planById(asInt(body.planId, 0));
    if (!plan || Number(plan.active) !== 1) {
      return fail(res, 400, "Paket membership tidak tersedia.");
    }
    const currentExpiry = member.expires_at ? Date.parse(member.expires_at) : 0;
    const base = currentExpiry > Date.now() ? currentExpiry : Date.now();
    const expiresAt = new Date(
      base + Number(plan.duration_days) * 86400000,
    ).toISOString();
    db.prepare(
      "UPDATE members SET plan_id = ?, expires_at = ?, status = 'active' WHERE id = ?",
    ).run(plan.id, expiresAt, memberId);
    logAudit(db, req, user, "member.renew", "member", memberId, {
      planId: plan.id,
      expiresAt,
    });
    return res.status(200).json({
      ok: true,
      expiresAt,
      members: listMembers(),
    });
  }

  if (action === "cancel") {
    db.prepare(
      "UPDATE members SET status = 'inactive', expires_at = NULL WHERE id = ?",
    ).run(memberId);
    logAudit(db, req, user, "member.cancel", "member", memberId, null);
    return res.status(200).json({ ok: true, members: listMembers() });
  }

  return fail(res, 400, "Aksi membership tidak dikenal.");
}
