import type { NextApiRequest } from "next";
import { DATA_DIR, getDb, nowIso } from "./db";

const fs = process.getBuiltinModule("fs");
const path = process.getBuiltinModule("path");
const { createHmac, randomUUID, timingSafeEqual } = process.getBuiltinModule("crypto");

export type Role =
  | "supervisor"
  | "admin"
  | "cashier"
  | "operator"
  | "viewer";

export type SessionUser = {
  id: number;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  role: Role;
};

export const SESSION_COOKIE = "parkline_session";
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const SECRET_FILE = path.join(DATA_DIR, ".session-secret");

let cachedSecret: string | null = null;

function getSecret(): string {
  if (cachedSecret) return cachedSecret;
  if (process.env.PARKLINE_SECRET) {
    cachedSecret = process.env.PARKLINE_SECRET;
    return cachedSecret;
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  try {
    cachedSecret = fs.readFileSync(SECRET_FILE, "utf8").trim();
  } catch {
    cachedSecret = createHmac("sha256", "parkline-bootstrap")
      .update(`${Date.now()}-${Math.random()}`)
      .digest("hex");
    fs.writeFileSync(SECRET_FILE, cachedSecret, { mode: 0o600 });
  }
  return cachedSecret;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

export function createSessionToken(userId: number): string {
  const db = getDb();
  const sid = randomUUID();
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  db.prepare(
    "INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
  ).run(sid, userId, nowIso(), new Date(expiresAt).toISOString());
  // Opportunistic cleanup of expired sessions.
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(nowIso());

  const payload = Buffer.from(
    JSON.stringify({ uid: userId, sid, exp: expiresAt }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(
  token: string,
): { userId: number; sessionId: string } | null {
  try {
    const [payload, signature] = token.split(".");
    if (!payload || !signature) return null;
    const expected = sign(payload);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { uid?: number; sid?: string; exp?: number };
    if (!parsed.uid || !parsed.sid || !parsed.exp || parsed.exp < Date.now()) {
      return null;
    }
    return { userId: Number(parsed.uid), sessionId: parsed.sid };
  } catch {
    return null;
  }
}

export function destroySession(token: string | undefined): void {
  if (!token) return;
  const decoded = verifySessionToken(token);
  if (!decoded) return;
  getDb().prepare("DELETE FROM sessions WHERE id = ?").run(decoded.sessionId);
}

type UserRow = {
  id: number;
  email: string;
  display_name: string;
  avatar_url: string | null;
  role: Role;
};

export function toPublicUser(row: UserRow): SessionUser {
  return {
    id: Number(row.id),
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url ?? null,
    role: row.role,
  };
}

export function getUserById(id: number): SessionUser | null {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT id, email, display_name, avatar_url, role FROM users WHERE id = ?",
    )
    .get(id) as UserRow | undefined;
  return row ? toPublicUser(row) : null;
}

export function getCurrentUser(req: NextApiRequest): SessionUser | null {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return null;
  const decoded = verifySessionToken(token);
  if (!decoded) return null;
  const db = getDb();
  const session = db
    .prepare("SELECT id FROM sessions WHERE id = ? AND expires_at > ?")
    .get(decoded.sessionId, nowIso());
  if (!session) return null;
  return getUserById(decoded.userId);
}

export function sessionCookie(token: string): string {
  // Enable behind HTTPS by setting PARKLINE_SECURE_COOKIE=1.
  const secure = process.env.PARKLINE_SECURE_COOKIE === "1";
  return [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
