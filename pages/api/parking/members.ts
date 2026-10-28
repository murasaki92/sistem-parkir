import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "../../../lib/db";
import { methodNotAllowed, requireUser } from "../../../lib/api";

type MemberRow = {
  id: number;
  member_code: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: string;
  plan_id: number | null;
  expires_at: string | null;
  plan_name: string | null;
  duration_days: number | null;
};

function subscriptionStatus(member: MemberRow): string {
  if (member.status !== "active") return member.status;
  if (!member.expires_at) return "inactive";
  return Date.parse(member.expires_at) > Date.now() ? "active" : "expired";
}

export function listMembers() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT m.*, p.name AS plan_name, p.duration_days
         FROM members m
         LEFT JOIN membership_plans p ON p.id = m.plan_id
        ORDER BY m.name COLLATE NOCASE`,
    )
    .all() as MemberRow[];

  return rows.map((member) => {
    const vehicles = db
      .prepare(
        "SELECT id, plate_number, vehicle_type, active FROM member_vehicles WHERE member_id = ? ORDER BY id",
      )
      .all(member.id) as Array<{
      id: number;
      plate_number: string;
      vehicle_type: string;
      active: number;
    }>;
    const firstActive =
      vehicles.find((vehicle) => Number(vehicle.active) === 1) || vehicles[0];
    return {
      id: Number(member.id),
      memberCode: member.member_code,
      name: member.name,
      phone: member.phone,
      email: member.email,
      status: member.status,
      planId: member.plan_id ? Number(member.plan_id) : null,
      planName: member.plan_name,
      durationDays: member.duration_days,
      expiresAt: member.expires_at,
      subscriptionStatus: subscriptionStatus(member),
      plateNumber: firstActive?.plate_number || null,
      vehicles: vehicles.map((vehicle) => ({
        id: Number(vehicle.id),
        plateNumber: vehicle.plate_number,
        vehicleType: vehicle.vehicle_type,
        active: Number(vehicle.active) === 1,
      })),
    };
  });
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (methodNotAllowed(req, res, ["GET"])) return;
  const user = requireUser(req, res, ["admin", "supervisor"]);
  if (!user) return;
  return res.status(200).json(listMembers());
}
