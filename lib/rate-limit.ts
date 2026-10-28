import type { NextApiRequest } from "next";
import type { DatabaseSync } from "node:sqlite";
import { nowIso } from "./db";

const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export function loginAttemptKey(req: NextApiRequest, email: string): string {
  const forwarded = req.headers["x-forwarded-for"];
  const ip =
    (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown";
  return `${ip}|${String(email || "").trim().toLowerCase()}`;
}

type AttemptRow = {
  key: string;
  attempts: number;
  first_attempt_at: string;
  locked_until: string | null;
};

export function checkLoginAllowed(
  db: DatabaseSync,
  key: string,
): { allowed: boolean; retryAfterSeconds?: number } {
  const row = db
    .prepare("SELECT * FROM login_attempts WHERE key = ?")
    .get(key) as AttemptRow | undefined;
  if (!row) return { allowed: true };

  const now = Date.now();
  if (row.locked_until) {
    const until = Date.parse(row.locked_until);
    if (until > now) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((until - now) / 1000)),
      };
    }
    db.prepare("DELETE FROM login_attempts WHERE key = ?").run(key);
    return { allowed: true };
  }

  const first = Date.parse(row.first_attempt_at);
  if (!Number.isFinite(first) || now - first > WINDOW_MS) {
    db.prepare("DELETE FROM login_attempts WHERE key = ?").run(key);
    return { allowed: true };
  }

  if (Number(row.attempts) >= MAX_ATTEMPTS) {
    const until = new Date(now + LOCK_MS).toISOString();
    db.prepare("UPDATE login_attempts SET locked_until = ? WHERE key = ?").run(
      until,
      key,
    );
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(LOCK_MS / 1000),
    };
  }

  return { allowed: true };
}

export function recordLoginFailure(db: DatabaseSync, key: string): void {
  const now = Date.now();
  const row = db
    .prepare("SELECT * FROM login_attempts WHERE key = ?")
    .get(key) as AttemptRow | undefined;

  if (!row) {
    db.prepare(
      "INSERT INTO login_attempts (key, attempts, first_attempt_at, locked_until) VALUES (?, 1, ?, NULL)",
    ).run(key, nowIso());
    return;
  }

  const first = Date.parse(row.first_attempt_at);
  const attempts =
    !Number.isFinite(first) || now - first > WINDOW_MS
      ? 1
      : Number(row.attempts) + 1;
  const firstAttempt =
    attempts === 1 ? nowIso() : row.first_attempt_at;
  const lockedUntil =
    attempts >= MAX_ATTEMPTS
      ? new Date(now + LOCK_MS).toISOString()
      : null;

  db.prepare(
    "UPDATE login_attempts SET attempts = ?, first_attempt_at = ?, locked_until = ? WHERE key = ?",
  ).run(attempts, firstAttempt, lockedUntil, key);

  // Keep the table from growing indefinitely.
  db.prepare("DELETE FROM login_attempts WHERE first_attempt_at < ?").run(
    new Date(now - 24 * 60 * 60 * 1000).toISOString(),
  );
}

export function recordLoginSuccess(db: DatabaseSync, key: string): void {
  db.prepare("DELETE FROM login_attempts WHERE key = ?").run(key);
}
