import type { NextApiRequest } from "next";
import type { DatabaseSync } from "node:sqlite";
import type { SessionUser } from "./auth";
import { nowIso } from "./db";

function clientIp(req: NextApiRequest): string {
  const forwarded = req.headers["x-forwarded-for"];
  return (
    (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown"
  );
}

export function logAudit(
  db: DatabaseSync,
  req: NextApiRequest,
  user: SessionUser | null,
  action: string,
  entityType: string,
  entityId?: string | number | null,
  details?: Record<string, unknown> | null,
): void {
  db.prepare(
    `INSERT INTO audit_logs
      (actor_id, actor_name, action, entity_type, entity_id, details, ip, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    user ? user.id : null,
    user ? user.displayName : "system",
    action,
    entityType,
    entityId === undefined || entityId === null ? null : String(entityId),
    details ? JSON.stringify(details) : null,
    clientIp(req),
    nowIso(),
  );
}

export function listAuditLogs(
  db: DatabaseSync,
  options: { limit?: number; query?: string } = {},
) {
  const limit = Math.min(500, Math.max(1, options.limit || 200));
  const query = (options.query || "").trim();
  const rows = query
    ? (db
        .prepare(
          `SELECT * FROM audit_logs
            WHERE actor_name LIKE ? OR action LIKE ? OR entity_type LIKE ?
               OR entity_id LIKE ? OR details LIKE ?
            ORDER BY id DESC LIMIT ?`,
        )
        .all(
          `%${query}%`,
          `%${query}%`,
          `%${query}%`,
          `%${query}%`,
          `%${query}%`,
          limit,
        ) as any[])
    : (db
        .prepare("SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?")
        .all(limit) as any[]);

  return rows.map((row) => {
    let details: Record<string, unknown> | null = null;
    try {
      details = row.details ? JSON.parse(row.details) : null;
    } catch {
      details = null;
    }
    return {
      id: Number(row.id),
      actorId: row.actor_id === null ? null : Number(row.actor_id),
      actorName: row.actor_name,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      details,
      ip: row.ip,
      createdAt: row.created_at,
    };
  });
}
