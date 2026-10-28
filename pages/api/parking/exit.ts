import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "../../../lib/db";
import { asString, fail, methodNotAllowed, requireUser } from "../../../lib/api";
import { buildQuote, findTicket } from "../../../lib/parking";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (methodNotAllowed(req, res, ["POST"])) return;
  const user = requireUser(req, res);
  if (!user) return;

  const ticketNo = asString(req.body?.ticketNo);
  if (!ticketNo) return fail(res, 400, "Nomor tiket atau token QR wajib diisi.");

  const db = getDb();
  const ticket = findTicket(db, ticketNo);
  if (!ticket) return fail(res, 404, "Tiket tidak ditemukan.");
  if (ticket.status === "paid" || ticket.status === "exited") {
    return fail(res, 409, "Tiket ini sudah dibayar dan kendaraan sudah keluar.");
  }
  if (ticket.status === "cancelled") {
    return fail(res, 409, "Tiket ini sudah dibatalkan.");
  }

  const quote = buildQuote(db, ticket);
  return res.status(200).json({
    ...quote,
    entryAt: ticket.entry_at,
    status: ticket.status,
  });
}
