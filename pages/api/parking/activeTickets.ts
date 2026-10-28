import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "../../../lib/db";
import { methodNotAllowed, requireUser } from "../../../lib/api";
import { buildQuote, type TicketRow } from "../../../lib/parking";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (methodNotAllowed(req, res, ["GET"])) return;
  const user = requireUser(req, res, ["admin", "supervisor", "cashier", "operator", "viewer"]);
  if (!user) return;

  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM tickets WHERE status = 'parked' ORDER BY entry_at ASC")
    .all() as TicketRow[];

  return res.status(200).json(
    rows.map((ticket) => {
      const quote = buildQuote(db, ticket);
      return {
        id: Number(ticket.id),
        ticketNo: ticket.ticket_no,
        qrToken: ticket.qr_token,
        plateNumber: ticket.plate_number,
        vehicleType: ticket.vehicle_type,
        entryAt: ticket.entry_at,
        minutes: quote.minutes,
        currentFee: quote.fee,
        membership: quote.membership,
      };
    }),
  );
}
