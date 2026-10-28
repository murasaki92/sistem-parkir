#!/usr/bin/env node
/**
 * Full SQLite backup. Creates a consistent copy with VACUUM INTO and keeps the
 * newest 14 files. This is the disaster-recovery counterpart to the operational
 * JSON backups in the admin Backup tab.
 *
 * Usage:
 *   node scripts/backup-db.js
 *   PARKLINE_DATA_DIR=/var/lib/parkline node scripts/backup-db.js
 */
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const dataDir = process.env.PARKLINE_DATA_DIR || path.join(process.cwd(), "data");
const source = path.join(dataDir, "parkline.db");
const targetDir = path.join(dataDir, "full-backups");

if (!fs.existsSync(source)) {
  console.error(`Database tidak ditemukan: ${source}`);
  process.exit(1);
}

fs.mkdirSync(targetDir, { recursive: true });
const stamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace("T", "-")
  .slice(0, 15);
const target = path.join(targetDir, `parkline-${stamp}.db`);

const db = new DatabaseSync(source);
try {
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
} finally {
  db.close();
}

const files = fs
  .readdirSync(targetDir)
  .filter((file) => /^parkline-\d{8}-\d{6}\.db$/.test(file))
  .sort()
  .reverse();
for (const stale of files.slice(14)) {
  fs.unlinkSync(path.join(targetDir, stale));
}

console.log(`Backup database dibuat: ${target}`);
