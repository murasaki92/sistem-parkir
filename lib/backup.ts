import type { DatabaseSync } from "node:sqlite";
import { nowIso, transaction } from "./db";
import { getSiteSettings, timezoneModifier } from "./parking";

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

export type Snapshot = {
  app: "parkline";
  version: 1;
  createdAt: string;
  tables: Partial<Record<TableName, Record<string, unknown>[]>>;
};

export function createSnapshot(db: DatabaseSync): Snapshot {
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

export function saveSnapshot(
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

  if (type === "scheduled") {
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
    db.prepare(
      "DELETE FROM backups WHERE backup_type = 'scheduled' AND created_at < ?",
    ).run(cutoff);
  }

  return {
    id,
    backupType: type,
    label,
    checksum: hash,
    rowCount: count,
    createdAt,
  };
}

export function restoreSnapshot(db: DatabaseSync, snapshot: Snapshot) {
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

export function getBackupPayload(
  db: DatabaseSync,
  id: string,
): Snapshot | null {
  const row = db
    .prepare("SELECT payload FROM backups WHERE id = ?")
    .get(id) as { payload: string } | undefined;
  if (!row) return null;
  return JSON.parse(row.payload) as Snapshot;
}

export function listBackups(db: DatabaseSync) {
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

export function ensureScheduledBackup(db: DatabaseSync): boolean {
  const site = getSiteSettings(db);
  const tz = timezoneModifier(site.timezoneOffsetHours);
  const localNow = new Date(
    Date.now() + site.timezoneOffsetHours * 3600000,
  );
  const today = localNow.toISOString().slice(0, 10);
  const existing = db
    .prepare(
      `SELECT id FROM backups WHERE backup_type = 'scheduled' AND date(created_at, '${tz}') = ? LIMIT 1`,
    )
    .get(today);
  if (existing) return false;
  if (localNow.getUTCHours() < 2) return false;
  saveSnapshot(db, createSnapshot(db), "scheduled", "Backup otomatis harian");
  return true;
}

/**
 * Long-running processes check once an hour so automatic backups no longer
 * depend on someone opening the Backup tab.
 */
export function startBackupScheduler(db: DatabaseSync): void {
  const globalRef = globalThis as unknown as {
    __parklineBackupScheduler?: ReturnType<typeof setInterval>;
  };
  if (globalRef.__parklineBackupScheduler) return;

  const run = () => {
    try {
      ensureScheduledBackup(db);
    } catch (error) {
      console.error("[parkline] scheduled backup failed", error);
    }
  };
  const startup = setTimeout(run, 15_000);
  startup.unref?.();
  const timer = setInterval(run, 60 * 60 * 1000);
  timer.unref?.();
  globalRef.__parklineBackupScheduler = timer;
}
