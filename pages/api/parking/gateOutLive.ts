import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "../../../lib/db";
import { asString, fail, methodNotAllowed, requireUser } from "../../../lib/api";
import { mapCommand, mapDevice, type DeviceRow } from "../../../lib/parking";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (methodNotAllowed(req, res, ["GET"])) return;
  const user = requireUser(req, res, ["cashier", "admin", "supervisor"]);
  if (!user) return;

  const db = getDb();
  const requested = asString(req.query.deviceCode).toUpperCase();
  const device = (
    requested
      ? db
          .prepare(
            "SELECT * FROM devices WHERE UPPER(device_code) = ? AND device_type = 'gate' AND gate_direction = 'out' LIMIT 1",
          )
          .get(requested)
      : db
          .prepare(
            "SELECT * FROM devices WHERE device_type = 'gate' AND gate_direction = 'out' ORDER BY device_code LIMIT 1",
          )
          .get()
  ) as DeviceRow | undefined;

  if (!device) {
    return fail(res, 404, "Gate keluar tidak ditemukan.");
  }

  const lastSeen = device.last_seen_at ? Date.parse(device.last_seen_at) : NaN;
  const online =
    device.status === "active" &&
    Number.isFinite(lastSeen) &&
    Date.now() - lastSeen <= 45000;

  const commands = db
    .prepare(
      "SELECT * FROM device_commands WHERE device_code = ? ORDER BY id DESC LIMIT 8",
    )
    .all(device.device_code) as any[];
  const mappedCommands = commands.map(mapCommand);

  const recentExits = db
    .prepare(
      `SELECT ticket_no, plate_number, vehicle_type, fee, payment_method,
              payment_reference, paid_at, receipt_no, exit_device_code
         FROM tickets
        WHERE status = 'paid'
          AND (exit_device_code = ? OR exit_device_code IS NULL)
        ORDER BY paid_at DESC
        LIMIT 6`,
    )
    .all(device.device_code) as Array<{
    ticket_no: string;
    plate_number: string;
    vehicle_type: string;
    fee: number;
    payment_method: string | null;
    payment_reference: string | null;
    paid_at: string;
    receipt_no: string | null;
    exit_device_code: string | null;
  }>;

  const parked = db
    .prepare("SELECT COUNT(*) AS count FROM tickets WHERE status = 'parked'")
    .get() as { count: number };

  return res.status(200).json({
    serverTime: new Date().toISOString(),
    device: mapDevice(device),
    online,
    lastHeartbeatSeconds: Number.isFinite(lastSeen)
      ? Math.max(0, Math.round((Date.now() - lastSeen) / 1000))
      : null,
    activeTickets: Number(parked.count),
    barrier:
      mappedCommands.find((command) => command.commandType === "barrier_open") ||
      null,
    commands: mappedCommands,
    recentExits: recentExits.map((ticket) => ({
      ticketNo: ticket.ticket_no,
      plateNumber: ticket.plate_number,
      vehicleType: ticket.vehicle_type,
      fee: Number(ticket.fee),
      paymentMethod: ticket.payment_method,
      paymentReference: ticket.payment_reference,
      paidAt: ticket.paid_at,
      receiptNo: ticket.receipt_no,
      exitDeviceCode: ticket.exit_device_code,
    })),
  });
}
