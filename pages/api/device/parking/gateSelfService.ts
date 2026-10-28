import type { NextApiRequest, NextApiResponse } from "next";
import { getDb, nowIso, transaction } from "../../../../lib/db";
import { asString, methodNotAllowed } from "../../../../lib/api";
import { authenticateDevice } from "../../../../lib/device-auth";
import {
  assignSlot,
  findTicket,
  makeQrToken,
  nextTicketNumber,
  queueCommand,
  releaseSlot,
} from "../../../../lib/parking";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (methodNotAllowed(req, res, ["POST"])) return;
  const device = authenticateDevice(req);
  if (!device) {
    return res.status(401).json({ error: "Kredensial perangkat tidak valid." });
  }
  if (device.device_type !== "gate" || device.gate_direction !== "in") {
    return res.status(403).json({ error: "Perangkat ini bukan Gate Masuk." });
  }

  const body = (req.body || {}) as Record<string, unknown>;
  const eventId = asString(body.eventId);
  const vehicleType = asString(body.vehicleType, "Mobil");
  const plateNumber = asString(body.plateNumber).toUpperCase();
  if (eventId.length < 6 || eventId.length > 160) {
    return res.status(400).json({ error: "eventId tidak valid." });
  }
  if (!["Mobil", "Motor", "Bus/Truk"].includes(vehicleType)) {
    return res.status(400).json({ error: "Jenis kendaraan tidak valid." });
  }

  const db = getDb();
  const existing = db
    .prepare("SELECT ticket_no FROM entry_events WHERE event_id = ?")
    .get(eventId) as { ticket_no: string } | undefined;
  if (existing) {
    const ticket = findTicket(db, existing.ticket_no);
    if (!ticket) {
      return res.status(500).json({ error: "Tiket untuk event ini tidak ditemukan." });
    }
    const slot = ticket.slot_id
      ? (db
          .prepare("SELECT code FROM parking_slots WHERE id = ?")
          .get(ticket.slot_id) as { code: string } | undefined)
      : undefined;
    return res.status(200).json({
      ticketNo: ticket.ticket_no,
      qrToken: ticket.qr_token,
      slot: slot?.code || "",
      idempotent: true,
      entryAt: ticket.entry_at,
    });
  }

  const slot = assignSlot(db, vehicleType);
  if (!slot) {
    return res.status(409).json({ error: `Slot ${vehicleType} penuh.` });
  }

  const entryAt = nowIso();
  const ticketNo = nextTicketNumber(db, new Date());
  const qrToken = makeQrToken();
  let commandCount = 0;

  try {
    transaction(db, () => {
      db.prepare(
        `INSERT INTO tickets
          (ticket_no, qr_token, plate_number, vehicle_type, entry_at, exit_at,
           status, base_fee, fee, payment_method, paid_at, receipt_no, shift_id,
           entry_device_code, exit_device_code, membership_id, slot_id, override_note, created_at)
         VALUES (?, ?, ?, ?, ?, NULL, 'parked', 0, 0, NULL, NULL, NULL, NULL, ?, NULL, NULL, ?, NULL, ?)`,
      ).run(
        ticketNo,
        qrToken,
        plateNumber,
        vehicleType,
        entryAt,
        device.device_code,
        slot.id,
        entryAt,
      );

      db.prepare(
        "INSERT INTO entry_events (event_id, ticket_no, device_code, created_at) VALUES (?, ?, ?, ?)",
      ).run(eventId, ticketNo, device.device_code, entryAt);

      queueCommand(db, {
        deviceCode: device.device_code,
        commandType: "barrier_open",
        payload: { ticketNo, slot: slot.code, vehicleType, entry: true },
        ticketNo,
      });
      commandCount += 1;

      if (device.parsedCapabilities.printerDeviceCode) {
        const printer = db
          .prepare(
            "SELECT device_code FROM devices WHERE UPPER(device_code) = ? AND status = 'active' AND device_type = 'printer' LIMIT 1",
          )
          .get(
            String(device.parsedCapabilities.printerDeviceCode).toUpperCase(),
          ) as { device_code: string } | undefined;
        if (printer) {
          queueCommand(db, {
            deviceCode: printer.device_code,
            commandType: "printer_print",
            payload: { ticketNo, slot: slot.code, vehicleType, entry: true },
            ticketNo,
          });
          commandCount += 1;
        }
      }

      if (device.parsedCapabilities.cameraDeviceCode) {
        const camera = db
          .prepare(
            "SELECT device_code FROM devices WHERE UPPER(device_code) = ? AND status = 'active' AND device_type = 'camera' LIMIT 1",
          )
          .get(
            String(device.parsedCapabilities.cameraDeviceCode).toUpperCase(),
          ) as { device_code: string } | undefined;
        if (camera) {
          queueCommand(db, {
            deviceCode: camera.device_code,
            commandType: "camera_snapshot",
            payload: { ticketNo, slot: slot.code, entry: true },
            ticketNo,
          });
          commandCount += 1;
        }
      }
    });
  } catch (error) {
    releaseSlot(db, slot.id);
    // Another request may have registered the same event concurrently.
    const raced = db
      .prepare("SELECT ticket_no FROM entry_events WHERE event_id = ?")
      .get(eventId) as { ticket_no: string } | undefined;
    if (raced) {
      const ticket = findTicket(db, raced.ticket_no);
      return res.status(200).json({
        ticketNo: ticket?.ticket_no || raced.ticket_no,
        qrToken: ticket?.qr_token,
        slot: slot.code,
        idempotent: true,
      });
    }
    throw error;
  }

  return res.status(201).json({
    ticketNo,
    qrToken,
    slot: slot.code,
    idempotent: false,
    entryAt,
    commandCount,
  });
}
