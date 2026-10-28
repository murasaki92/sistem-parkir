import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "../../../lib/db";
import { asString, fail, methodNotAllowed, requireUser } from "../../../lib/api";
import { logAudit } from "../../../lib/audit";
import {
  createSnapshot,
  ensureScheduledBackup,
  getBackupPayload,
  listBackups,
  restoreSnapshot,
  saveSnapshot,
  type Snapshot,
} from "../../../lib/backup";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (methodNotAllowed(req, res, ["GET", "POST"])) return;
  const user = requireUser(req, res, ["admin", "supervisor"]);
  if (!user) return;

  const db = getDb();

  if (req.method === "GET") {
    const id = asString(req.query.id);
    if (id) {
      const payload = getBackupPayload(db, id);
      if (!payload) return fail(res, 404, "Backup tidak ditemukan.");
      return res.status(200).json(payload);
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
    logAudit(db, req, user, "backup.create", "backup", backup.id, {
      label,
      rowCount: backup.rowCount,
    });
    return res.status(201).json({ ok: true, backup });
  }

  if (action === "restore" || action === "restore_file") {
    let snapshot: Snapshot;
    if (action === "restore") {
      const backupId = asString(body.backupId);
      if (!backupId) return fail(res, 400, "ID backup wajib diisi.");
      const payload = getBackupPayload(db, backupId);
      if (!payload) return fail(res, 404, "Backup tidak ditemukan.");
      snapshot = payload;
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
    logAudit(
      db,
      req,
      user,
      action === "restore" ? "backup.restore" : "backup.restore_file",
      "backup",
      action === "restore" ? asString(body.backupId) : null,
      { source: action === "restore" ? "stored" : "file" },
    );
    return res.status(200).json({ ok: true, backups: listBackups(db) });
  }

  return fail(res, 400, "Aksi backup tidak dikenal.");
}
