import type { DatabaseSync as SqliteDatabase } from "node:sqlite";
import { hashPassword } from "./password";

const fs = process.getBuiltinModule("fs");
const path = process.getBuiltinModule("path");
const { randomUUID } = process.getBuiltinModule("crypto");

const { DatabaseSync: DatabaseSyncCtor } = process.getBuiltinModule(
  "node:sqlite",
) as typeof import("node:sqlite");

/**
 * Parkline database. Uses Node 22's built-in SQLite driver so the project can
 * run without a C compiler or an external database server.
 */
export const DATA_DIR =
  process.env.PARKLINE_DATA_DIR || path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "parkline.db");

export type Tariffs = {
  carFirstHour: number;
  carNextHour: number;
  motorFirstHour: number;
  motorNextHour: number;
  graceMinutes: number;
  lostTicketFee: number;
};

export const DEFAULT_TARIFFS: Tariffs = {
  carFirstHour: 5000,
  carNextHour: 3000,
  motorFirstHour: 2000,
  motorNextHour: 1500,
  graceMinutes: 10,
  lostTicketFee: 50000,
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL,
  avatar_url TEXT,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  device_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  area TEXT,
  gate_direction TEXT,
  camera_url TEXT,
  camera_snapshot_url TEXT,
  capabilities TEXT NOT NULL DEFAULT '{}',
  secret_hash TEXT,
  last_seen_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS parking_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  vehicle_type TEXT NOT NULL,
  zone TEXT,
  occupied INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_no TEXT NOT NULL UNIQUE,
  qr_token TEXT NOT NULL UNIQUE,
  plate_number TEXT NOT NULL DEFAULT '',
  vehicle_type TEXT NOT NULL DEFAULT 'Mobil',
  entry_at TEXT NOT NULL,
  exit_at TEXT,
  status TEXT NOT NULL DEFAULT 'parked',
  base_fee INTEGER NOT NULL DEFAULT 0,
  fee INTEGER NOT NULL DEFAULT 0,
  payment_method TEXT,
  paid_at TEXT,
  receipt_no TEXT,
  shift_id INTEGER,
  entry_device_code TEXT,
  exit_device_code TEXT,
  membership_id INTEGER,
  slot_id INTEGER,
  override_note TEXT,
  fee_override INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS login_attempts (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  first_attempt_at TEXT NOT NULL,
  locked_until TEXT
);

CREATE TABLE IF NOT EXISTS shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  opening_cash INTEGER NOT NULL DEFAULT 0,
  closing_cash INTEGER,
  expected_cash INTEGER NOT NULL DEFAULT 0,
  difference INTEGER,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS membership_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  duration_days INTEGER NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,
  benefit_type TEXT NOT NULL DEFAULT 'free',
  benefit_value INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  plan_id INTEGER,
  expires_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS member_vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL,
  plate_number TEXT NOT NULL UNIQUE,
  vehicle_type TEXT NOT NULL DEFAULT 'Mobil',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  method TEXT NOT NULL,
  shift_id INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS device_commands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  correlation_id TEXT NOT NULL UNIQUE,
  device_code TEXT NOT NULL,
  command_type TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  ticket_no TEXT,
  phase TEXT NOT NULL DEFAULT 'entry',
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TEXT NOT NULL,
  acknowledged_at TEXT,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS exit_operations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_no TEXT NOT NULL UNIQUE,
  ticket_id INTEGER,
  status TEXT NOT NULL DEFAULT 'waiting',
  last_error TEXT,
  warnings TEXT,
  resolved_by INTEGER,
  resolved_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS overrides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  override_type TEXT NOT NULL,
  ticket_no TEXT,
  amount INTEGER,
  reason TEXT NOT NULL,
  approved_by INTEGER,
  approved_by_name TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS entry_events (
  event_id TEXT PRIMARY KEY,
  ticket_no TEXT NOT NULL,
  device_code TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS backups (
  id TEXT PRIMARY KEY,
  backup_type TEXT NOT NULL,
  label TEXT NOT NULL,
  checksum TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_paid_at ON tickets(paid_at);
CREATE INDEX IF NOT EXISTS idx_tickets_entry_at ON tickets(entry_at);
CREATE INDEX IF NOT EXISTS idx_commands_device ON device_commands(device_code, status);
CREATE INDEX IF NOT EXISTS idx_commands_ticket ON device_commands(ticket_no);
CREATE INDEX IF NOT EXISTS idx_members_expires ON members(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`;

let cached: SqliteDatabase | null = null;

export function getDb(): SqliteDatabase {
  if (cached) return cached;

  const globalRef = globalThis as unknown as { __parklineDb?: SqliteDatabase };
  if (globalRef.__parklineDb) {
    cached = globalRef.__parklineDb;
    return cached;
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSyncCtor(DB_FILE);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA);

  // Lightweight migration for databases created before command phases existed.
  const commandColumns = db
    .prepare("PRAGMA table_info(device_commands)")
    .all() as Array<{ name: string }>;
  if (!commandColumns.some((column) => column.name === "phase")) {
    db.exec(
      "ALTER TABLE device_commands ADD COLUMN phase TEXT NOT NULL DEFAULT 'entry'",
    );
  }

  const ticketColumns = db
    .prepare("PRAGMA table_info(tickets)")
    .all() as Array<{ name: string }>;
  if (!ticketColumns.some((column) => column.name === "fee_override")) {
    db.exec(
      "ALTER TABLE tickets ADD COLUMN fee_override INTEGER NOT NULL DEFAULT 0",
    );
  }

  const userColumns = db
    .prepare("PRAGMA table_info(users)")
    .all() as Array<{ name: string }>;
  if (!userColumns.some((column) => column.name === "status")) {
    db.exec(
      "ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'",
    );
  }

  seed(db);
  cached = db;
  globalRef.__parklineDb = db;
  return db;
}

export function transaction<T>(db: SqliteDatabase, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* ignore rollback failure */
    }
    throw error;
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function dateKey(value: string | Date = new Date()): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function feeFor(vehicle: string, minutes: number, tariffs: Tariffs): number {
  const hours = Math.max(
    1,
    Math.ceil(Math.max(0, minutes - tariffs.graceMinutes) / 60),
  );
  if (vehicle === "Motor") {
    return tariffs.motorFirstHour + (hours - 1) * tariffs.motorNextHour;
  }
  return tariffs.carFirstHour + (hours - 1) * tariffs.carNextHour;
}

function seed(db: SqliteDatabase) {
  const existing = db.prepare("SELECT COUNT(*) AS count FROM users").get() as {
    count: number;
  };
  if (Number(existing.count) > 0) return;

  const now = new Date();
  const iso = now.toISOString();
  const insertUser = db.prepare(
    "INSERT INTO users (email, password_hash, display_name, role, avatar_url, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  insertUser.run(
    "admin@parkline.id",
    hashPassword("admin123"),
    "Admin Parkline",
    "admin",
    null,
    iso,
  );
  insertUser.run(
    "supervisor@parkline.id",
    hashPassword("supervisor123"),
    "Supervisor Shift",
    "supervisor",
    null,
    iso,
  );
  insertUser.run(
    "kasir@parkline.id",
    hashPassword("kasir123"),
    "Kasir Utama",
    "cashier",
    null,
    iso,
  );
  insertUser.run(
    "operator@parkline.id",
    hashPassword("operator123"),
    "Operator Gate",
    "operator",
    null,
    iso,
  );
  insertUser.run(
    "viewer@parkline.id",
    hashPassword("viewer123"),
    "Viewer Operasional",
    "viewer",
    null,
    iso,
  );

  const insertSetting = db.prepare(
    "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
  );
  insertSetting.run("tariffs", JSON.stringify(DEFAULT_TARIFFS));
  insertSetting.run(
    "site",
    JSON.stringify({
      name: "Parkline",
      timezone: "Asia/Makassar",
      currency: "IDR",
    }),
  );

  const insertDevice = db.prepare(
    `INSERT INTO devices
      (device_code, name, device_type, status, area, gate_direction, camera_url, camera_snapshot_url, capabilities, secret_hash, last_seen_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const health = JSON.stringify({
    sensor: "ok",
    camera: "ok",
    printer: "ok",
    barrier: "ok",
  });
  const devices = [
    [
      "GATE-IN-001",
      "Gate Masuk Utama",
      "gate",
      "active",
      "Pintu Utama",
      "in",
      null,
      null,
      JSON.stringify({
        cameraDeviceCode: "CAM-IN-001",
        printerDeviceCode: "PRINTER-IN-001",
        health: JSON.parse(health),
      }),
      hashPassword("gate-in-demo-secret"),
      null,
    ],
    [
      "GATE-OUT-001",
      "Gate Keluar Utama",
      "gate",
      "active",
      "Pintu Utama",
      "out",
      null,
      null,
      JSON.stringify({
        cameraDeviceCode: "CAM-OUT-001",
        printerDeviceCode: "PRINTER-OUT-001",
        health: JSON.parse(health),
      }),
      hashPassword("gate-out-demo-secret"),
      null,
    ],
    [
      "KASIR-001",
      "Kasir Utama",
      "cashier",
      "active",
      "Lobi",
      null,
      null,
      null,
      JSON.stringify({ health: { printer: "ok" } }),
      hashPassword("kasir-demo-secret"),
      null,
    ],
    [
      "CAM-IN-001",
      "Kamera Gate Masuk",
      "camera",
      "active",
      "Pintu Utama",
      null,
      null,
      null,
      JSON.stringify({ health: { camera: "ok" } }),
      hashPassword("cam-in-demo-secret"),
      null,
    ],
    [
      "CAM-OUT-001",
      "Kamera Gate Keluar",
      "camera",
      "active",
      "Pintu Utama",
      null,
      null,
      null,
      JSON.stringify({ health: { camera: "ok" } }),
      hashPassword("cam-out-demo-secret"),
      null,
    ],
    [
      "PRINTER-IN-001",
      "Printer Tiket Masuk",
      "printer",
      "active",
      "Pintu Utama",
      null,
      null,
      null,
      JSON.stringify({ health: { printer: "ok" } }),
      hashPassword("printer-in-demo-secret"),
      null,
    ],
    [
      "PRINTER-OUT-001",
      "Printer Struk Keluar",
      "printer",
      "active",
      "Pintu Utama",
      null,
      null,
      null,
      JSON.stringify({ health: { printer: "ok" } }),
      hashPassword("printer-out-demo-secret"),
      null,
    ],
    [
      "SENSOR-IN-001",
      "Sensor Kendaraan Masuk",
      "sensor",
      "active",
      "Pintu Utama",
      null,
      null,
      null,
      JSON.stringify({ health: { sensor: "ok" } }),
      hashPassword("sensor-in-demo-secret"),
      null,
    ],
  ] as const;
  for (const device of devices) {
    insertDevice.run(
      device[0],
      device[1],
      device[2],
      device[3],
      device[4],
      device[5],
      device[6],
      device[7],
      device[8],
      device[9],
      device[10],
      iso,
      iso,
    );
  }

  const insertPlan = db.prepare(
    "INSERT INTO membership_plans (name, description, duration_days, price, benefit_type, benefit_value, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
  );
  insertPlan.run(
    "Harian",
    "Akses parkir gratis selama satu hari.",
    1,
    10000,
    "free",
    0,
    iso,
  );
  insertPlan.run(
    "Bulanan",
    "Parkir gratis tanpa batas selama 30 hari.",
    30,
    150000,
    "free",
    0,
    iso,
  );
  insertPlan.run(
    "Diskon 50%",
    "Potongan 50% dari tarif normal selama 30 hari.",
    30,
    100000,
    "discount_percent",
    50,
    iso,
  );
  insertPlan.run(
    "Tarif Flat",
    "Tarif tetap Rp3.000 per kunjungan selama 30 hari.",
    30,
    75000,
    "flat_rate",
    3000,
    iso,
  );

  const expires = new Date(now.getTime() + 30 * 86400000).toISOString();
  db.prepare(
    "INSERT INTO members (member_code, name, phone, email, status, plan_id, expires_at, created_at) VALUES (?, ?, ?, ?, 'active', 2, ?, ?)",
  ).run(
    "MBR-0001",
    "Budi Santoso",
    "0812-3456-7890",
    "budi@example.com",
    expires,
    iso,
  );
  db.prepare(
    "INSERT INTO member_vehicles (member_id, plate_number, vehicle_type, active, created_at) VALUES (1, ?, 'Mobil', 1, ?)",
  ).run("DD 1234 AB", iso);

  const insertSlot = db.prepare(
    "INSERT INTO parking_slots (code, vehicle_type, zone, occupied) VALUES (?, ?, ?, 0)",
  );
  for (let i = 1; i <= 40; i += 1) {
    insertSlot.run(`M-${String(i).padStart(2, "0")}`, "Mobil", "Zona M");
    insertSlot.run(`B-${String(i).padStart(2, "0")}`, "Motor", "Zona B");
  }

  const insertTicket = db.prepare(
    `INSERT INTO tickets
      (ticket_no, qr_token, plate_number, vehicle_type, entry_at, exit_at, status, base_fee, fee, payment_method, paid_at, receipt_no, shift_id, entry_device_code, exit_device_code, membership_id, slot_id, override_note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertPayment = db.prepare(
    "INSERT INTO payments (ticket_id, amount, method, shift_id, created_at) VALUES (?, ?, ?, ?, ?)",
  );
  const makeQr = () =>
    `PKR1.${randomUUID().replace(/-/g, "")}${randomUUID().replace(/-/g, "").slice(0, 8)}`;
  const plates = [
    "DD 5678 CD",
    "DD 9012 EF",
    "DN 3456 GH",
    "DD 7788 IJ",
    "DD 2233 KL",
    "DD 4455 MN",
    "DD 6677 OP",
    "DD 8899 QR",
  ];

  const seqByDay: Record<string, number> = {};
  const nextSeq = (key: string) => {
    seqByDay[key] = (seqByDay[key] || 0) + 1;
    return seqByDay[key];
  };

  for (let day = 0; day < 7; day += 1) {
    const count = day === 0 ? 7 : 6 + (day % 3) * 2;
    for (let i = 0; i < count; i += 1) {
      let entry: Date;
      if (day === 0) {
        entry = new Date(now.getTime() - (i + 1) * 43 * 60000);
      } else {
        const base = new Date(now.getTime() - day * 86400000);
        base.setUTCHours(7 + ((i * 2) % 13), (i * 17) % 60, 0, 0);
        entry = base;
      }
      const duration = 20 + ((i * 37 + day * 13) % 220);
      let exit = new Date(entry.getTime() + duration * 60000);
      if (exit.getTime() > now.getTime() - 5 * 60000) {
        exit = new Date(now.getTime() - 5 * 60000);
      }
      if (exit.getTime() <= entry.getTime()) {
        entry = new Date(exit.getTime() - 30 * 60000);
      }
      const minutes = Math.max(
        1,
        Math.round((exit.getTime() - entry.getTime()) / 60000),
      );
      const isMemberTicket = day === 0 && i === 0;
      const vehicle = isMemberTicket
        ? "Mobil"
        : i % 4 === 3
          ? "Motor"
          : "Mobil";
      const plate = isMemberTicket ? "DD 1234 AB" : plates[(day * 3 + i) % plates.length];
      const key = dateKey(entry);
      const seq = nextSeq(key);
      const baseFee = feeFor(vehicle, minutes, DEFAULT_TARIFFS);
      const fee = isMemberTicket ? 0 : baseFee;
      const method = isMemberTicket
        ? "member"
        : (["cash", "qris", "card"] as const)[(day + i) % 3];
      const ticketNo = `PKR-${key}-${String(seq).padStart(4, "0")}`;
      const receiptNo = `RCP-${key}-${String(seq).padStart(4, "0")}`;
      const result = insertTicket.run(
        ticketNo,
        makeQr(),
        plate,
        vehicle,
        entry.toISOString(),
        exit.toISOString(),
        "paid",
        baseFee,
        fee,
        method,
        exit.toISOString(),
        receiptNo,
        null,
        "GATE-IN-001",
        "GATE-OUT-001",
        isMemberTicket ? 1 : null,
        null,
        isMemberTicket ? "Member bulanan - gratis" : null,
        entry.toISOString(),
      );
      insertPayment.run(
        Number(result.lastInsertRowid),
        fee,
        method,
        null,
        exit.toISOString(),
      );
    }
  }

  const parked = [
    {
      ticketNo: "PKR-DEMO-0001",
      plate: "DD 9999 ZZ",
      vehicle: "Mobil",
      minutes: 130,
      slot: "M-05",
    },
    {
      ticketNo: "PKR-DEMO-0002",
      plate: "DD 8888 YY",
      vehicle: "Mobil",
      minutes: 45,
      slot: "M-06",
    },
    {
      ticketNo: "PKR-DEMO-0003",
      plate: "DD 7777 XX",
      vehicle: "Motor",
      minutes: 305,
      slot: "B-01",
    },
    {
      ticketNo: "PKR-DEMO-0004",
      plate: "DD 1234 AB",
      vehicle: "Mobil",
      minutes: 190,
      slot: "M-07",
    },
  ];
  for (const item of parked) {
    const entry = new Date(now.getTime() - item.minutes * 60000);
    const slot = db
      .prepare("SELECT id FROM parking_slots WHERE code = ?")
      .get(item.slot) as { id: number };
    insertTicket.run(
      item.ticketNo,
      makeQr(),
      item.plate,
      item.vehicle,
      entry.toISOString(),
      null,
      "parked",
      0,
      0,
      null,
      null,
      null,
      null,
      "GATE-IN-001",
      null,
      item.ticketNo === "PKR-DEMO-0004" ? 1 : null,
      Number(slot.id),
      null,
      entry.toISOString(),
    );
    db.prepare("UPDATE parking_slots SET occupied = 1 WHERE id = ?").run(
      Number(slot.id),
    );
  }

  const overrideCount = db.prepare("SELECT COUNT(*) AS count FROM overrides").get() as {
    count: number;
  };
  if (Number(overrideCount.count) === 0) {
    const insertOverride = db.prepare(
      "INSERT INTO overrides (override_type, ticket_no, amount, reason, approved_by, approved_by_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    insertOverride.run(
      "fee_waiver",
      "PKR-DEMO-0001",
      5000,
      "Kendaraan keluar darurat, biaya dibebaskan oleh supervisor.",
      1,
      "Admin Parkline",
      new Date(now.getTime() - 86400000).toISOString(),
    );
    insertOverride.run(
      "lost_ticket",
      null,
      50000,
      "Tiket hilang, dikenakan tarif tiket hilang.",
      1,
      "Admin Parkline",
      new Date(now.getTime() - 2 * 86400000).toISOString(),
    );
  }
}
