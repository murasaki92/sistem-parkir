import type { NextApiRequest, NextApiResponse } from "next";
import { getDb, nowIso, transaction } from "../../../lib/db";
import { asInt, asString, fail, methodNotAllowed, requireUser } from "../../../lib/api";
import {
  buildQuote,
  findTicket,
  getTariffs,
  nextReceiptNumber,
  queueCommand,
  refreshExitOperation,
  releaseSlot,
  type DeviceRow,
} from "../../../lib/parking";

const TYPES = [
  "barrier_open",
  "fee_waiver",
  "fee_override",
  "lost_ticket",
  "exit_without_ticket",
];

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (methodNotAllowed(req, res, ["POST"])) return;
  const user = requireUser(req, res, ["admin", "supervisor"]);
  if (!user) return;

  const overrideType = asString(req.body?.overrideType);
  const ticketNo = asString(req.body?.ticketNo).toUpperCase();
  const reason = asString(req.body?.reason);
  const amount = req.body?.amount === undefined ? null : asInt(req.body.amount, -1);

  if (!TYPES.includes(overrideType)) {
    return fail(res, 400, "Jenis override tidak valid.");
  }
  if (reason.length < 5) {
    return fail(res, 400, "Alasan override minimal 5 karakter.");
  }
  if (overrideType !== "barrier_open" && !ticketNo) {
    return fail(res, 400, "Nomor tiket wajib diisi untuk override ini.");
  }
  if (overrideType === "fee_override" && (amount === null || amount < 0)) {
    return fail(res, 400, "Tarif baru tidak valid.");
  }

  const db = getDb();
  const ticket = ticketNo ? findTicket(db, ticketNo) : null;
  const tariffs = getTariffs(db);

  if (overrideType === "barrier_open") {
    const requestedCode = asString(req.body?.deviceCode).toUpperCase();
    const device = db
      .prepare(
        requestedCode
          ? "SELECT * FROM devices WHERE UPPER(device_code) = ? AND status = 'active' AND device_type = 'gate' AND gate_direction = 'out' LIMIT 1"
          : "SELECT * FROM devices WHERE status = 'active' AND device_type = 'gate' AND gate_direction = 'out' ORDER BY device_code LIMIT 1",
      )
      .get(...(requestedCode ? [requestedCode] : [])) as DeviceRow | undefined;
    if (!device) return fail(res, 404, "Gate keluar aktif tidak ditemukan.");

    const correlationId = queueCommand(db, {
      deviceCode: device.device_code,
      commandType: "barrier_open",
      payload: { manualOverride: true, reason, ticketNo: ticketNo || null },
      ticketNo: ticketNo || null,
      phase: "exit",
    });
    db.prepare(
      `INSERT INTO overrides
        (override_type, ticket_no, amount, reason, approved_by, approved_by_name, created_at)
       VALUES (?, ?, NULL, ?, ?, ?, ?)`,
    ).run(
      overrideType,
      ticketNo || null,
      reason,
      user.id,
      user.displayName,
      nowIso(),
    );
    return res.status(201).json({ ok: true, correlationId, deviceCode: device.device_code });
  }

  if (!ticket) return fail(res, 404, "Tiket tidak ditemukan.");
  if (ticket.status !== "parked") {
    return fail(res, 409, "Override hanya dapat dilakukan pada tiket yang masih parkir.");
  }

  if (overrideType === "fee_waiver" || overrideType === "fee_override" || overrideType === "lost_ticket") {
    let fee = Number(ticket.fee);
    if (overrideType === "fee_waiver") fee = 0;
    if (overrideType === "fee_override") fee = amount as number;
    if (overrideType === "lost_ticket") fee = tariffs.lostTicketFee;

    db.prepare("UPDATE tickets SET fee = ?, override_note = ?, fee_override = 1 WHERE id = ?").run(
      fee,
      reason,
      ticket.id,
    );
    db.prepare(
      `INSERT INTO overrides
        (override_type, ticket_no, amount, reason, approved_by, approved_by_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      overrideType,
      ticket.ticket_no,
      fee,
      reason,
      user.id,
      user.displayName,
      nowIso(),
    );

    return res.status(200).json({ ok: true, ticketNo: ticket.ticket_no, fee });
  }

  // exit_without_ticket: close the session manually and, when available, open
  // the exit barrier using the same command queue as normal payments.
  const quote = buildQuote(db, ticket);
  const paidAt = nowIso();
  const receiptNo = nextReceiptNumber(db, new Date());
  const gate = db
    .prepare(
      "SELECT * FROM devices WHERE status = 'active' AND device_type = 'gate' AND gate_direction = 'out' ORDER BY device_code LIMIT 1",
    )
    .get() as DeviceRow | undefined;

  transaction(db, () => {
    db.prepare(
      `UPDATE tickets
          SET status = 'paid', exit_at = ?, fee = ?, payment_method = 'override',
              paid_at = ?, receipt_no = ?, exit_device_code = ?, override_note = ?
        WHERE id = ?`,
    ).run(
      paidAt,
      quote.fee,
      paidAt,
      receiptNo,
      gate?.device_code || null,
      reason,
      ticket.id,
    );
    db.prepare(
      "INSERT INTO payments (ticket_id, amount, method, shift_id, created_at) VALUES (?, ?, 'override', NULL, ?)",
    ).run(ticket.id, quote.fee, paidAt);
    releaseSlot(db, ticket.slot_id);

    if (gate) {
      queueCommand(db, {
        deviceCode: gate.device_code,
        commandType: "barrier_open",
        payload: { ticketNo: ticket.ticket_no, manualOverride: true, reason },
        ticketNo: ticket.ticket_no,
        phase: "exit",
      });
      db.prepare(
        `INSERT INTO exit_operations
          (ticket_no, ticket_id, status, last_error, warnings, resolved_by, resolved_reason, created_at, updated_at)
         VALUES (?, ?, 'waiting', NULL, NULL, NULL, NULL, ?, ?)`,
      ).run(ticket.ticket_no, ticket.id, paidAt, paidAt);
    }

    db.prepare(
      `INSERT INTO overrides
        (override_type, ticket_no, amount, reason, approved_by, approved_by_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      overrideType,
      ticket.ticket_no,
      quote.fee,
      reason,
      user.id,
      user.displayName,
      paidAt,
    );
  });

  if (gate) {
    refreshExitOperation(db, ticket.ticket_no);
  }

  return res.status(200).json({
    ok: true,
    ticketNo: ticket.ticket_no,
    fee: quote.fee,
    receiptNo,
  });
}
