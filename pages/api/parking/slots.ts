import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "../../../lib/db";
import { methodNotAllowed, requireUser } from "../../../lib/api";

type SlotRow = {
  id: number;
  code: string;
  vehicle_type: string;
  zone: string | null;
  occupied: number;
  ticket_no: string | null;
  plate_number: string | null;
  entry_at: string | null;
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (methodNotAllowed(req, res, ["GET"])) return;
  const user = requireUser(req, res);
  if (!user) return;

  const rows = getDb()
    .prepare(
      `SELECT s.id, s.code, s.vehicle_type, s.zone, s.occupied,
              t.ticket_no, t.plate_number, t.entry_at
         FROM parking_slots s
         LEFT JOIN tickets t ON t.slot_id = s.id AND t.status = 'parked'
        ORDER BY s.code`,
    )
    .all() as SlotRow[];

  const slots = rows.map((row) => ({
    id: Number(row.id),
    code: row.code,
    vehicleType: row.vehicle_type,
    zone: row.zone,
    occupied: Number(row.occupied) === 1 || Boolean(row.ticket_no),
    ticketNo: row.ticket_no,
    plateNumber: row.plate_number,
    entryAt: row.entry_at,
  }));

  const byType: Record<
    string,
    { total: number; occupied: number; available: number }
  > = {};
  for (const slot of slots) {
    const bucket = (byType[slot.vehicleType] ||= {
      total: 0,
      occupied: 0,
      available: 0,
    });
    bucket.total += 1;
    if (slot.occupied) bucket.occupied += 1;
    else bucket.available += 1;
  }

  return res.status(200).json({
    slots,
    summary: {
      total: slots.length,
      occupied: slots.filter((slot) => slot.occupied).length,
      available: slots.filter((slot) => !slot.occupied).length,
      byType,
    },
  });
}
