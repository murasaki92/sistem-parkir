import type { NextApiRequest, NextApiResponse } from "next";
import { getDb, nowIso, transaction } from "../../../lib/db";
import { asString, fail, methodNotAllowed, requireUser } from "../../../lib/api";
import {
  buildQuote,
  findTicket,
  nextReceiptNumber,
  openShiftForUser,
  queueCommand,
  refreshExitOperation,
  releaseSlot,
  type DeviceRow,
} from "../../../lib/parking";
import { getTariffs } from "../../../lib/parking";

const METHODS = ["cash", "qris", "card"];

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (methodNotAllowed(req, res, ["POST"])) return;
  const user = requireUser(req, res, ["cashier", "admin", "supervisor"]);
  if (!user) return;

  const db = getDb();
  const ticketNo = asString(req.body?.ticketNo);
  const paymentMethod = asString(req.body?.paymentMethod, "cash").toLowerCase();
  const paymentReference = asString(req.body?.paymentReference).slice(0, 120);
  const exitDeviceCode = asString(req.body?.exitDeviceCode).toUpperCase();
  const receiptPrinterDeviceCode = asString(
    req.body?.receiptPrinterDeviceCode,
  ).toUpperCase();

  if (!ticketNo) return fail(res, 400, "Nomor tiket wajib diisi.");
  if (!METHODS.includes(paymentMethod)) {
    return fail(res, 400, "Metode pembayaran tidak valid.");
  }

  const shift = openShiftForUser(db, user.id);
  if (!shift) {
    return fail(
      res,
      409,
      "Shift kasir belum dibuka. Buka shift sebelum menerima pembayaran.",
    );
  }

  const ticket = findTicket(db, ticketNo);
  if (!ticket) return fail(res, 404, "Tiket tidak ditemukan.");
  if (ticket.status !== "parked") {
    return fail(res, 409, "Tiket ini sudah diproses sebelumnya.");
  }

  let exitDevice: DeviceRow | null = null;
  if (exitDeviceCode) {
    exitDevice =
      (db
        .prepare(
          "SELECT * FROM devices WHERE UPPER(device_code) = ? AND status = 'active' AND device_type = 'gate' AND gate_direction = 'out' LIMIT 1",
        )
        .get(exitDeviceCode) as DeviceRow | undefined) ?? null;
    if (!exitDevice) {
      return fail(res, 400, "Gate keluar yang dipilih tidak aktif atau tidak ditemukan.");
    }
  }

  let printerDevice: DeviceRow | null = null;
  if (receiptPrinterDeviceCode) {
    printerDevice =
      (db
        .prepare(
          "SELECT * FROM devices WHERE UPPER(device_code) = ? AND status = 'active' AND device_type = 'printer' LIMIT 1",
        )
        .get(receiptPrinterDeviceCode) as DeviceRow | undefined) ?? null;
    if (!printerDevice) {
      return fail(res, 400, "Printer struk yang dipilih tidak aktif.");
    }
  }

  const quote = buildQuote(db, ticket);
  const paidAt = nowIso();
  const receiptNo = nextReceiptNumber(db, new Date());
  const membershipId = quote.membership?.memberId ?? null;

  const result = transaction(db, () => {
    db.prepare(
      `UPDATE tickets
          SET status = 'paid', exit_at = ?, fee = ?, base_fee = ?,
              payment_method = ?, payment_reference = ?, paid_at = ?, receipt_no = ?, shift_id = ?,
              exit_device_code = ?, membership_id = ?
        WHERE id = ?`,
    ).run(
      paidAt,
      quote.fee,
      quote.baseFee,
      paymentMethod,
      paymentReference || null,
      paidAt,
      receiptNo,
      shift.id,
      exitDevice ? exitDevice.device_code : null,
      membershipId,
      ticket.id,
    );

    db.prepare(
      "INSERT INTO payments (ticket_id, amount, method, reference, shift_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(
      ticket.id,
      quote.fee,
      paymentMethod,
      paymentReference || null,
      shift.id,
      paidAt,
    );

    releaseSlot(db, ticket.slot_id);

    let commandCount = 0;
    if (exitDevice) {
      queueCommand(db, {
        deviceCode: exitDevice.device_code,
        commandType: "barrier_open",
        payload: {
          ticketNo: ticket.ticket_no,
          plateNumber: ticket.plate_number,
          fee: quote.fee,
        },
        ticketNo: ticket.ticket_no,
        phase: "exit",
      });
      commandCount += 1;

      let capabilities: Record<string, any> = {};
      try {
        capabilities = JSON.parse(exitDevice.capabilities || "{}");
      } catch {
        capabilities = {};
      }

      if (capabilities.cameraDeviceCode) {
        const camera = db
          .prepare(
            "SELECT device_code FROM devices WHERE UPPER(device_code) = ? AND status = 'active' LIMIT 1",
          )
          .get(String(capabilities.cameraDeviceCode).toUpperCase()) as
          | { device_code: string }
          | undefined;
        if (camera) {
          queueCommand(db, {
            deviceCode: camera.device_code,
            commandType: "camera_snapshot",
            payload: { ticketNo: ticket.ticket_no },
            ticketNo: ticket.ticket_no,
            phase: "exit",
          });
          commandCount += 1;
        }
      }

      if (!printerDevice && capabilities.printerDeviceCode) {
        const linked = db
          .prepare(
            "SELECT * FROM devices WHERE UPPER(device_code) = ? AND status = 'active' AND device_type = 'printer' LIMIT 1",
          )
          .get(String(capabilities.printerDeviceCode).toUpperCase()) as
          | DeviceRow
          | undefined;
        if (linked) printerDevice = linked;
      }
    }

    if (printerDevice) {
      queueCommand(db, {
        deviceCode: printerDevice.device_code,
        commandType: "printer_print",
        payload: {
          ticketNo: ticket.ticket_no,
          receiptNo,
          fee: quote.fee,
          plateNumber: ticket.plate_number,
        },
        ticketNo: ticket.ticket_no,
        phase: "exit",
      });
      commandCount += 1;
    }

    db.prepare(
      `INSERT INTO exit_operations
        (ticket_no, ticket_id, status, last_error, warnings, resolved_by, resolved_reason, created_at, updated_at)
       VALUES (?, ?, ?, NULL, NULL, NULL, NULL, ?, ?)`,
    ).run(
      ticket.ticket_no,
      ticket.id,
      commandCount > 0 ? "waiting" : "completed",
      paidAt,
      paidAt,
    );

    return { commandCount };
  });

  if (result.commandCount > 0) {
    refreshExitOperation(db, ticket.ticket_no);
  }

  const tariffs = getTariffs(db);
  return res.status(200).json({
    ticketNo: ticket.ticket_no,
    receiptNo,
    fee: quote.fee,
    baseFee: quote.baseFee,
    paymentMethod,
    paymentReference: paymentReference || null,
    paidAt,
    membership: quote.membership,
    minutes: quote.minutes,
    hours: quote.hours,
    commandCount: result.commandCount,
    lostTicketFee: tariffs.lostTicketFee,
  });
}
