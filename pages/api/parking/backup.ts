import type { NextApiRequest, NextApiResponse } from "next";
import type { DatabaseSync } from "node:sqlite";
import { getDb, nowIso, transaction } from "../../../lib/db";
import { asString, fail, methodNotAllowed, requireUser } from "../../../lib/api";

const { createHash, randomUUID } = process.getBuiltinModule("crypto");

const TABLES = [
  "devices",
  "parking_slots",
  "tickets",
  "shifts",
  "membership_plans",
  "members",
  "member_vehicles",
  "payments",
  "device_commands",
  "exit_operations",
  "overrides",
  "entry_events",
  "settings",
] as const;

type TableName = (typeof TABLES)[number];

type Snapshot = {
  app: "parkline";
  version: 1;
  createdAt: string;
  tables: Partial<Record<TableName, Record<string, unknown>[]>>;
};

function createSnapshot(db: DatabaseSync): Snapshot {
  const tables: Partial<Record<TableName, Record<string, unknown>[]>> = {};
  for (const table of TABLES) {
    const rows = db.prepare(`SELECT * FROM ${table}`).all() as Record<
      string,
      unknown
    >[];
    if (table === "devices") {
      tables[table] = rows.map((row) => {
        const copy = { ...row };
        delete copy.secret_hash;
        return copy;
      });
    } else {
      tables[table] = rows;
    }
  }
  return {
    app: "parkline",
    version: 1,
    createdAt: nowIso(),
    tables,
  };
}

function rowCount(snapshot: Snapshot): number {
  return Object.values(snapshot.tables).reduce(
    (total, rows) => total + (rows?.length || 0),
    0,
  );
}

function checksum(snapshot: Snapshot): string {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

function saveSnapshot(
  db: DatabaseSync,
  snapshot: Snapshot,
  type: "manual" | "scheduled",
  label: string,
) {
  const id = `BKP-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;
  const hash = checksum(snapshot);
  const count = rowCount(snapshot);
  const createdAt = nowIso();
  db.prepare(
    `INSERT INTO backups (id, backup_type, label, checksum, row_count, payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, type, label, hash, count, JSON.stringify(snapshot), createdAt);
  return {
    id,
    backupType: type,
    label,
    checksum: hash,
    rowCount: count,
    createdAt,
  };
}

function restoreSnapshot(db: DatabaseSync, snapshot: Snapshot) {
  if (
    !snapshot ||
    snapshot.app !== "parkline" ||
    !snapshot.tables ||
    typeof snapshot.tables !== "object"
  ) {
    throw new Error("File backup bukan snapshot Parkline yang valid.");
  }

  const secrets = new Map<string, string | null>();
  const deviceSecrets = db
    .prepare("SELECT device_code, secret_hash FROM devices")
    .all() as Array<{ device_code: string; secret_hash: string | null }>;
  for (const row of deviceSecrets) secrets.set(row.device_code, row.secret_hash);

  const columnCache = new Map<string, string[]>();
  const columnsFor = (table: string) => {
    if (columnCache.has(table)) return columnCache.get(table)!;
    const info = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
      name: string;
    }>;
    const columns = info.map((column) => column.name);
    columnCache.set(table, columns);
    return columns;
  };

  db.exec("PRAGMA foreign_keys = OFF;");
  try {
    transaction(db, () => {
      for (const table of TABLES) {
        const rows = snapshot.tables[table];
        if (!Array.isArray(rows)) continue;
        db.prepare(`DELETE FROM ${table}`).run();

        if (!rows.length) continue;
        const columns = columnsFor(table);
        for (const row of rows) {
          const keys = Object.keys(row).filter(
            (key) => columns.includes(key) && key !== "secret_hash",
          );
          if (!keys.length) continue;
          const values = keys.map((key) => {
            const value = row[key];
            if (value === undefined || value === null) return null;
            if (
              typeof value === "string" ||
              typeof value === "number" ||
              typeof value === "bigint" ||
              value instanceof Uint8Array
            ) {
              return value;
            }
            return JSON.stringify(value);
          });
          db.prepare(
            `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${keys
              .map(() => "?")
              .join(", ")})`,
          ).run(...values);
        }
      }

      // Device secrets are intentionally not part of backups. Keep the current
      // firmware credentials when the same device code is restored.
      const restoreSecret = db.prepare(
        "UPDATE devices SET secret_hash = ? WHERE device_code = ?",
      );
      for (const [code, secret] of secrets) {
        if (secret) restoreSecret.run(secret, code);
      }
    });
  } finally {
    db.exec("PRAGMA foreign_keys = ON;");
  }
}

function ensureScheduledBackup(db: DatabaseSync) {
  const localNow = new Date(Date.now() + 8 * 3600000);
  const today = localNow.toISOString().slice(0, 10);
  const existing = db
    .prepare(
      "SELECT id FROM backups WHERE backup_type = 'scheduled' AND date(created_at, '+8 hours') = ? LIMIT 1",
    )
    .get(today);
  if (existing) return;
  // Runs after 02:00 server time, once per day, lazily when the tab is opened.
  if (localNow.getUTCHours() < 2) return;
  saveSnapshot(db, createSnapshot(db), "scheduled", "Backup otomatis harian");
}

function listBackups(db: DatabaseSync) {
  const rows = db
    .prepare(
      "SELECT id, backup_type, label, checksum, row_count, created_at FROM backups ORDER BY created_at DESC",
    )
    .all() as Array<{
    id: string;
    backup_type: string;
    label: string;
    checksum: string;
    row_count: number;
    created_at: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    backupType: row.backup_type,
    label: row.label,
    checksum: row.checksum,
    rowCount: Number(row.row_count),
    createdAt: row.created_at,
  }));
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (methodNotAllowed(req, res, ["GET", "POST"])) return;
  const user = requireUser(req, res, ["admin", "supervisor"]);
  if (!user) return;

  const db = getDb();

  if (req.method === "GET") {
    const id = asString(req.query.id);
    if (id) {
      const row = db
        .prepare("SELECT payload FROM backups WHERE id = ?")
        .get(id) as { payload: string } | undefined;
      if (!row) return fail(res, 404, "Backup tidak ditemukan.");
      return res.status(200).json(JSON.parse(row.payload));
    }
    ensureScheduledBackup(db);
    return res.status(200).json(listBackups(db));
  }

  const body = (req.body || {}) as Record<string, unknown>;
  const action = asString(body.action);

  if (action === "create") {
    const label = asString(body.label);
    if (label.length < 3) return fail(res, 400, "Label backup minimal 3 karakter.");
    const backup = saveSnapshot(db, createSnapshot(db), "manual", label);
    return res.status(201).json({ ok: true, backup });
  }

  if (action === "restore" || action === "restore_file") {
    let snapshot: Snapshot;
    if (action === "restore") {
      const backupId = asString(body.backupId);
      if (!backupId) return fail(res, 400, "ID backup wajib diisi.");
      const row = db
        .prepare("SELECT payload FROM backups WHERE id = ?")
        .get(backupId) as { payload: string } | undefined;
      if (!row) return fail(res, 404, "Backup tidak ditemukan.");
      snapshot = JSON.parse(row.payload) as Snapshot;
    } else {
      if (!body.backup || typeof body.backup !== "object") {
        return fail(res, 400, "File backup tidak valid.");
      }
      snapshot = body.backup as Snapshot;
    }

    try {
      restoreSnapshot(db, snapshot);
    } catch (error) {
      return fail(
        res,
        400,
        error instanceof Error ? error.message : "Restore gagal.",
      );
    }
    return res.status(200).json({ ok: true, backups: listBackups(db) });
  }

  return fail(res, 400, "Aksi backup tidak dikenal.");
}
