import type { NextApiRequest, NextApiResponse } from "next";
import { getDb, nowIso } from "../../../lib/db";
import { asInt, asString, fail, methodNotAllowed, requireUser } from "../../../lib/api";
import { mapPlan, type PlanRow } from "./membershipPlans";

const BENEFIT_TYPES = ["free", "discount_percent", "flat_rate"];

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (methodNotAllowed(req, res, ["GET", "POST"])) return;
  const user = requireUser(req, res, ["admin", "supervisor"]);
  if (!user) return;

  const db = getDb();

  if (req.method === "GET") {
    const rows = db
      .prepare("SELECT * FROM membership_plans ORDER BY active DESC, duration_days, price")
      .all() as PlanRow[];
    return res.status(200).json(rows.map(mapPlan));
  }

  const body = (req.body || {}) as Record<string, unknown>;
  const action = asString(body.action);

  if (action === "create" || action === "update") {
    const name = asString(body.name);
    const description = asString(body.description) || null;
    const durationDays = asInt(body.durationDays, 0);
    const price = asInt(body.price, 0);
    const benefitType = asString(body.benefitType, "free");
    const benefitValue = asInt(body.benefitValue, 0);
    if (!name) return fail(res, 400, "Nama paket wajib diisi.");
    if (durationDays < 1) return fail(res, 400, "Durasi minimal 1 hari.");
    if (price < 0 || benefitValue < 0) {
      return fail(res, 400, "Harga dan nilai manfaat tidak valid.");
    }
    if (!BENEFIT_TYPES.includes(benefitType)) {
      return fail(res, 400, "Jenis manfaat tidak valid.");
    }
    if (benefitType === "discount_percent" && benefitValue > 100) {
      return fail(res, 400, "Diskon tidak boleh melebihi 100%.");
    }

    if (action === "create") {
      const result = db
        .prepare(
          `INSERT INTO membership_plans
            (name, description, duration_days, price, benefit_type, benefit_value, active, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
        )
        .run(
          name,
          description,
          durationDays,
          price,
          benefitType,
          benefitValue,
          nowIso(),
        );
      const row = db
        .prepare("SELECT * FROM membership_plans WHERE id = ?")
        .get(Number(result.lastInsertRowid)) as PlanRow;
      return res.status(201).json(mapPlan(row));
    }

    const id = asInt(body.id, 0);
    if (!id) return fail(res, 400, "ID paket tidak valid.");
    const existing = db
      .prepare("SELECT * FROM membership_plans WHERE id = ?")
      .get(id) as PlanRow | undefined;
    if (!existing) return fail(res, 404, "Paket membership tidak ditemukan.");
    db.prepare(
      `UPDATE membership_plans
          SET name = ?, description = ?, duration_days = ?, price = ?,
              benefit_type = ?, benefit_value = ?
        WHERE id = ?`,
    ).run(
      name,
      description,
      durationDays,
      price,
      benefitType,
      benefitValue,
      id,
    );
    const row = db
      .prepare("SELECT * FROM membership_plans WHERE id = ?")
      .get(id) as PlanRow;
    return res.status(200).json(mapPlan(row));
  }

  if (action === "toggle") {
    const id = asInt(body.id, 0);
    if (!id) return fail(res, 400, "ID paket tidak valid.");
    const active = body.active ? 1 : 0;
    db.prepare("UPDATE membership_plans SET active = ? WHERE id = ?").run(
      active,
      id,
    );
    const row = db
      .prepare("SELECT * FROM membership_plans WHERE id = ?")
      .get(id) as PlanRow | undefined;
    if (!row) return fail(res, 404, "Paket membership tidak ditemukan.");
    return res.status(200).json(mapPlan(row));
  }

  return fail(res, 400, "Aksi paket membership tidak dikenal.");
}
