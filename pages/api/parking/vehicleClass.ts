import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "../../../lib/db";
import { asString, fail, methodNotAllowed, requireUser } from "../../../lib/api";
import { buildQuote, findTicket } from "../../../lib/parking";
import { logAudit } from "../../../lib/audit";

const VEHICLE_TYPES = ["Motor", "Mobil", "Bus/Truk"];

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (methodNotAllowed(req, res, ["POST"])) return;
  const user = requireUser(req, res, ["cashier", "admin", "supervisor"]);
  if (!user) return;

  const ticketNo = asString(req.body?.ticketNo);
  const vehicleType = asString(req.body?.vehicleType);
  if (!ticketNo) return fail(res, 400, "Nomor tiket wajib diisi.");
  if (!VEHICLE_TYPES.includes(vehicleType)) {
    return fail(res, 400, "Kelas kendaraan tidak valid.");
  }

  const db = getDb();
  const ticket = findTicket(db, ticketNo);
  if (!ticket) return fail(res, 404, "Tiket tidak ditemukan.");
  if (ticket.status !== "parked") {
    return fail(res, 409, "Kelas kendaraan tidak dapat diubah setelah pembayaran.");
  }

  const previous = ticket.vehicle_type;
  if (previous !== vehicleType) {
    db.prepare("UPDATE tickets SET vehicle_type = ? WHERE id = ?").run(
      vehicleType,
      ticket.id,
    );
    ticket.vehicle_type = vehicleType;
    logAudit(db, req, user, "ticket.change_class", "ticket", ticket.id, {
      ticketNo: ticket.ticket_no,
      from: previous,
      to: vehicleType,
    });
  }

  return res.status(200).json({
    ...buildQuote(db, ticket),
    entryAt: ticket.entry_at,
    status: ticket.status,
    previousVehicleType: previous,
  });
}
