import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "../../../lib/db";
import { asString, fail, methodNotAllowed, requireUser } from "../../../lib/api";
import { findTicket } from "../../../lib/parking";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (methodNotAllowed(req, res, ["POST"])) return;
  const user = requireUser(req, res, ["cashier", "admin", "supervisor"]);
  if (!user) return;

  const ticketNo = asString(req.body?.ticketNo);
  const rawPlate = asString(req.body?.plateNumber).toUpperCase();
  if (!ticketNo) return fail(res, 400, "Nomor tiket wajib diisi.");
  if (!rawPlate) return fail(res, 400, "Nomor plat wajib diisi.");
  if (!/^[A-Z0-9]{1,4}[\s-]?[0-9]{1,5}[\s-]?[A-Z]{0,3}$/.test(rawPlate)) {
    return fail(res, 400, "Format nomor plat tidak valid.");
  }

  const db = getDb();
  const ticket = findTicket(db, ticketNo);
  if (!ticket) return fail(res, 404, "Tiket tidak ditemukan.");
  if (ticket.status !== "parked") {
    return fail(res, 409, "Nomor plat tidak dapat diubah setelah pembayaran.");
  }

  db.prepare("UPDATE tickets SET plate_number = ? WHERE id = ?").run(
    rawPlate,
    ticket.id,
  );

  return res.status(200).json({
    ok: true,
    ticketNo: ticket.ticket_no,
    plateNumber: rawPlate,
  });
}
