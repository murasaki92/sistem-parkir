import type { NextApiRequest, NextApiResponse } from "next";
import { getCurrentUser, type Role, type SessionUser } from "./auth";

export function fail(
  res: NextApiResponse,
  status: number,
  error: string,
): void {
  res.status(status).json({ error });
}

export function methodNotAllowed(
  req: NextApiRequest,
  res: NextApiResponse,
  allowed: string[],
): boolean {
  if (allowed.includes(req.method || "")) return false;
  res.setHeader("Allow", allowed.join(", "));
  fail(res, 405, `Method ${req.method} tidak didukung`);
  return true;
}

export function requireUser(
  req: NextApiRequest,
  res: NextApiResponse,
  roles?: Role[],
): SessionUser | null {
  const user = getCurrentUser(req);
  if (!user) {
    fail(res, 401, "Sesi login tidak valid. Silakan masuk kembali.");
    return null;
  }
  if (roles && !roles.includes(user.role)) {
    fail(res, 403, "Anda tidak memiliki akses untuk tindakan ini.");
    return null;
  }
  return user;
}

export function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

export function asInt(value: unknown, fallback = 0): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.trunc(number);
}
