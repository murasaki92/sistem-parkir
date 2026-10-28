import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "../../../lib/db";
import { methodNotAllowed, requireUser } from "../../../lib/api";

export type PlanRow = {
  id: number;
  name: string;
  description: string | null;
  duration_days: number;
  price: number;
  benefit_type: string;
  benefit_value: number;
  active: number;
  created_at: string;
};

export function mapPlan(row: PlanRow) {
  return {
    id: Number(row.id),
    name: row.name,
    description: row.description,
    durationDays: Number(row.duration_days),
    price: Number(row.price),
    benefitType: row.benefit_type,
    benefitValue: Number(row.benefit_value),
    active: Number(row.active) === 1,
    createdAt: row.created_at,
  };
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (methodNotAllowed(req, res, ["GET"])) return;
  const user = requireUser(req, res, ["admin", "supervisor"]);
  if (!user) return;

  const rows = getDb()
    .prepare("SELECT * FROM membership_plans WHERE active = 1 ORDER BY duration_days, price")
    .all() as PlanRow[];
  return res.status(200).json(rows.map(mapPlan));
}
