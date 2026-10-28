import type { DatabaseSync } from "node:sqlite";
import { dateKey, DEFAULT_TARIFFS, nowIso, type Tariffs } from "./db";

const { randomUUID } = process.getBuiltinModule("crypto");

export type TicketRow = {
  id: number;
  ticket_no: string;
  qr_token: string;
  plate_number: string;
  vehicle_type: string;
  entry_at: string;
  exit_at: string | null;
  status: string;
  base_fee: number;
  fee: number;
  payment_method: string | null;
  paid_at: string | null;
  receipt_no: string | null;
  shift_id: number | null;
  entry_device_code: string | null;
  exit_device_code: string | null;
  membership_id: number | null;
  slot_id: number | null;
  override_note: string | null;
  fee_override: number;
  created_at: string;
};

export type DeviceRow = {
  id: number;
  device_code: string;
  name: string;
  device_type: string;
  status: string;
  area: string | null;
  gate_direction: string | null;
  camera_url: string | null;
  camera_snapshot_url: string | null;
  capabilities: string;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

export function normalizePlate(value: string): string {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function normalizeTicketCode(value: string): string {
  return String(value || "").trim().toUpperCase();
}

export function getTariffs(db: DatabaseSync): Tariffs {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = 'tariffs'")
    .get() as { value: string } | undefined;
  if (!row) return DEFAULT_TARIFFS;
  try {
    return { ...DEFAULT_TARIFFS, ...(JSON.parse(row.value) as Tariffs) };
  } catch {
    return DEFAULT_TARIFFS;
  }
}

export function findTicket(
  db: DatabaseSync,
  code: string,
): TicketRow | null {
  const normalized = normalizeTicketCode(code);
  if (!normalized) return null;
  const row = db
    .prepare(
      "SELECT * FROM tickets WHERE UPPER(ticket_no) = ? OR UPPER(qr_token) = ? LIMIT 1",
    )
    .get(normalized, normalized) as TicketRow | undefined;
  return row ?? null;
}

export function findTicketById(
  db: DatabaseSync,
  id: number,
): TicketRow | null {
  const row = db.prepare("SELECT * FROM tickets WHERE id = ?").get(id) as
    | TicketRow
    | undefined;
  return row ?? null;
}

export function findActiveMembership(
  db: DatabaseSync,
  plateNumber: string,
): {
  memberId: number;
  memberName: string;
  planId: number;
  planName: string;
  benefitType: string;
  benefitValue: number;
  expiresAt: string;
} | null {
  const plate = normalizePlate(plateNumber);
  if (!plate) return null;
  const row = db
    .prepare(
      `SELECT m.id AS member_id, m.name AS member_name, m.expires_at,
              p.id AS plan_id, p.name AS plan_name, p.benefit_type, p.benefit_value
         FROM member_vehicles v
         JOIN members m ON m.id = v.member_id
         JOIN membership_plans p ON p.id = m.plan_id
        WHERE REPLACE(UPPER(v.plate_number), ' ', '') = ?
          AND v.active = 1
          AND m.status = 'active'
          AND p.active = 1
          AND m.expires_at > ?
        LIMIT 1`,
    )
    .get(plate, nowIso()) as
    | {
        member_id: number;
        member_name: string;
        expires_at: string;
        plan_id: number;
        plan_name: string;
        benefit_type: string;
        benefit_value: number;
      }
    | undefined;
  if (!row) return null;
  return {
    memberId: Number(row.member_id),
    memberName: row.member_name,
    planId: Number(row.plan_id),
    planName: row.plan_name,
    benefitType: row.benefit_type,
    benefitValue: Number(row.benefit_value),
    expiresAt: row.expires_at,
  };
}

export type TicketQuote = {
  ticketNo: string;
  plateNumber: string;
  vehicleType: string;
  minutes: number;
  hours: number;
  baseFee: number;
  fee: number;
  membership: {
    memberId: number;
    memberName: string;
    planId: number;
    planName: string;
    expiresAt: string;
  } | null;
};

export function buildQuote(
  db: DatabaseSync,
  ticket: TicketRow,
  at: Date = new Date(),
): TicketQuote {
  const tariffs = getTariffs(db);
  const entryMs = Date.parse(ticket.entry_at);
  const minutes = Math.max(
    0,
    Math.floor((at.getTime() - (Number.isNaN(entryMs) ? at.getTime() : entryMs)) / 60000),
  );
  const hours = Math.max(
    1,
    Math.ceil(Math.max(0, minutes - tariffs.graceMinutes) / 60),
  );
  const first =
    ticket.vehicle_type === "Motor"
      ? tariffs.motorFirstHour
      : tariffs.carFirstHour;
  const next =
    ticket.vehicle_type === "Motor"
      ? tariffs.motorNextHour
      : tariffs.carNextHour;
  const baseFee = first + (hours - 1) * next;

  const member = findActiveMembership(db, ticket.plate_number);
  let fee = baseFee;
  if (member) {
    if (member.benefitType === "free") fee = 0;
    else if (member.benefitType === "discount_percent") {
      fee = Math.max(
        0,
        Math.round((baseFee * (100 - member.benefitValue)) / 100),
      );
    } else if (member.benefitType === "flat_rate") {
      fee = Math.max(0, Math.round(member.benefitValue));
    }
  }

  if (Number(ticket.fee_override) === 1) {
    fee = Number(ticket.fee);
  }

  return {
    ticketNo: ticket.ticket_no,
    plateNumber: ticket.plate_number,
    vehicleType: ticket.vehicle_type,
    minutes,
    hours,
    baseFee,
    fee,
    membership: member
      ? {
          memberId: member.memberId,
          memberName: member.memberName,
          planId: member.planId,
          planName: member.planName,
          expiresAt: member.expiresAt,
        }
      : null,
  };
}

export function mapDevice(row: DeviceRow) {
  let capabilities: Record<string, unknown> = {};
  try {
    capabilities = JSON.parse(row.capabilities || "{}");
  } catch {
    capabilities = {};
  }
  return {
    id: Number(row.id),
    deviceCode: row.device_code,
    name: row.name,
    deviceType: row.device_type,
    status: row.status,
    area: row.area,
    gateDirection: row.gate_direction,
    cameraUrl: row.camera_url,
    cameraSnapshotUrl: row.camera_snapshot_url,
    capabilities,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapCommand(row: {
  id: number;
  correlation_id: string;
  device_code: string;
  command_type: string;
  payload: string;
  ticket_no: string | null;
  status: string;
  attempts: number;
  error_message: string | null;
  created_at: string;
}) {
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(row.payload || "{}");
  } catch {
    payload = {};
  }
  return {
    id: String(row.id),
    correlationId: row.correlation_id,
    deviceCode: row.device_code,
    commandType: row.command_type,
    payload,
    ticketNo: row.ticket_no,
    status: row.status,
    attempts: Number(row.attempts),
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}

export function queueCommand(
  db: DatabaseSync,
  options: {
    deviceCode: string;
    commandType: string;
    payload?: Record<string, unknown>;
    ticketNo?: string | null;
    phase?: "entry" | "exit";
  },
): string {
  const correlationId = randomUUID();
  db.prepare(
    `INSERT INTO device_commands
      (correlation_id, device_code, command_type, payload, ticket_no, phase, status, attempts, error_message, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, NULL, ?)`,
  ).run(
    correlationId,
    options.deviceCode,
    options.commandType,
    JSON.stringify(options.payload || {}),
    options.ticketNo ?? null,
    options.phase || "entry",
    nowIso(),
  );
  return correlationId;
}

/**
 * Recomputes the state of an exit operation after a device command changes.
 */
export function refreshExitOperation(
  db: DatabaseSync,
  ticketNo: string,
): void {
  const commands = db
    .prepare(
      "SELECT command_type, status, error_message FROM device_commands WHERE ticket_no = ? AND phase = 'exit'",
    )
    .all(ticketNo) as Array<{
    command_type: string;
    status: string;
    error_message: string | null;
  }>;
  if (!commands.length) return;

  const failed = commands.filter((command) => command.status === "failed");
  // The barrier is the only command that blocks the vehicle. Camera/printer
  // are supporting devices: their pending state must not keep the car inside.
  const barrierCommands = commands.filter(
    (command) => command.command_type === "barrier_open",
  );
  const barrierDone =
    barrierCommands.length === 0 ||
    barrierCommands.every((command) => command.status === "completed");
  const status = failed.length
    ? "attention"
    : barrierDone
      ? "completed"
      : "waiting";
  const lastError = failed.length
    ? failed[0].error_message || `Perintah ${failed[0].command_type} gagal`
    : null;
  const warnings = failed.length
    ? JSON.stringify(
        failed.map((command) => `${command.command_type} gagal`),
      )
    : null;

  db.prepare(
    `UPDATE exit_operations
        SET status = ?, last_error = ?, warnings = ?, updated_at = ?
      WHERE ticket_no = ?`,
  ).run(status, lastError, warnings, nowIso(), ticketNo);
}

export function ticketDisplay(row: TicketRow) {
  return {
    id: Number(row.id),
    ticketNo: row.ticket_no,
    qrToken: row.qr_token,
    plateNumber: row.plate_number,
    vehicleType: row.vehicle_type,
    entryAt: row.entry_at,
    exitAt: row.exit_at,
    status: row.status,
    fee: Number(row.fee),
    paymentMethod: row.payment_method,
    paidAt: row.paid_at,
    receiptNo: row.receipt_no,
  };
}

export function openShiftForUser(db: DatabaseSync, userId: number) {
  return db
    .prepare("SELECT * FROM shifts WHERE user_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1")
    .get(userId) as
    | {
        id: number;
        user_id: number;
        opened_at: string;
        closed_at: string | null;
        opening_cash: number;
        closing_cash: number | null;
        expected_cash: number;
        difference: number | null;
        notes: string | null;
        status: string;
      }
    | undefined;
}

export function expectedCash(db: DatabaseSync, shiftId: number): number {
  const shift = db
    .prepare("SELECT opening_cash FROM shifts WHERE id = ?")
    .get(shiftId) as { opening_cash: number } | undefined;
  if (!shift) return 0;
  const row = db
    .prepare(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE shift_id = ? AND method = 'cash'",
    )
    .get(shiftId) as { total: number };
  return Number(shift.opening_cash) + Number(row.total);
}

export function mapShift(
  db: DatabaseSync,
  row:
    | {
        id: number;
        user_id: number;
        opened_at: string;
        closed_at: string | null;
        opening_cash: number;
        closing_cash: number | null;
        expected_cash: number;
        difference: number | null;
        notes: string | null;
        status: string;
      }
    | undefined,
) {
  if (!row) return null;
  const isOpen = row.status === "open";
  const expected = isOpen ? expectedCash(db, row.id) : Number(row.expected_cash);
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    openingCash: Number(row.opening_cash),
    closingCash: row.closing_cash === null ? null : Number(row.closing_cash),
    expectedCash: expected,
    difference: row.difference === null ? null : Number(row.difference),
    notes: row.notes,
    status: row.status,
  };
}

export function nextTicketNumber(db: DatabaseSync, at = new Date()): string {
  const key = dateKey(at);
  const prefix = `PKR-${key}-`;
  const rows = db
    .prepare("SELECT ticket_no FROM tickets WHERE ticket_no LIKE ?")
    .all(`${prefix}%`) as Array<{ ticket_no: string }>;
  let max = 0;
  for (const row of rows) {
    const seq = Number(row.ticket_no.slice(prefix.length));
    if (Number.isFinite(seq) && seq > max) max = seq;
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

export function nextReceiptNumber(db: DatabaseSync, at = new Date()): string {
  const key = dateKey(at);
  const prefix = `RCP-${key}-`;
  const rows = db
    .prepare("SELECT receipt_no FROM tickets WHERE receipt_no LIKE ?")
    .all(`${prefix}%`) as Array<{ receipt_no: string }>;
  let max = 0;
  for (const row of rows) {
    const seq = Number(row.receipt_no.slice(prefix.length));
    if (Number.isFinite(seq) && seq > max) max = seq;
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

export function makeQrToken(): string {
  return `PKR1.${randomUUID().replace(/-/g, "")}${randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

export function assignSlot(
  db: DatabaseSync,
  vehicleType: string,
): { id: number; code: string } | null {
  const slot = db
    .prepare(
      "SELECT id, code FROM parking_slots WHERE vehicle_type = ? AND occupied = 0 ORDER BY code LIMIT 1",
    )
    .get(vehicleType) as { id: number; code: string } | undefined;
  if (!slot) return null;
  db.prepare("UPDATE parking_slots SET occupied = 1 WHERE id = ?").run(
    Number(slot.id),
  );
  return { id: Number(slot.id), code: slot.code };
}

export function releaseSlot(db: DatabaseSync, slotId: number | null): void {
  if (!slotId) return;
  db.prepare("UPDATE parking_slots SET occupied = 0 WHERE id = ?").run(slotId);
}
