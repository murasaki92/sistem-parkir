import type { NextApiRequest, NextApiResponse } from "next";
import { getDb, nowIso } from "../../../lib/db";
import { asString, fail, methodNotAllowed, requireUser } from "../../../lib/api";
import { hashPassword } from "../../../lib/password";
import { logAudit } from "../../../lib/audit";

const ROLES = ["supervisor", "admin", "cashier", "operator", "viewer"] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type EmployeeRow = {
  id: number;
  email: string;
  password_hash: string;
  display_name: string;
  avatar_url: string | null;
  role: string;
  created_at: string;
  status: string;
};

function mapEmployee(row: EmployeeRow, currentUserId: number) {
  return {
    id: Number(row.id),
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    isSelf: Number(row.id) === currentUserId,
  };
}

function employeeById(id: number): EmployeeRow | null {
  const row = getDb()
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(id) as EmployeeRow | undefined;
  return row ?? null;
}

function activeAdminCount(): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND status = 'active'")
    .get() as { count: number };
  return Number(row.count);
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (methodNotAllowed(req, res, ["GET", "POST"])) return;
  const current = requireUser(req, res, ["admin"]);
  if (!current) return;

  const db = getDb();

  if (req.method === "GET") {
    const rows = db
      .prepare(
        "SELECT * FROM users ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, display_name COLLATE NOCASE",
      )
      .all() as EmployeeRow[];
    return res.status(200).json(rows.map((row) => mapEmployee(row, current.id)));
  }

  const body = (req.body || {}) as Record<string, unknown>;
  const action = asString(body.action);

  if (action === "create") {
    const displayName = asString(body.displayName);
    const email = asString(body.email).toLowerCase();
    const password = asString(body.password);
    const role = asString(body.role);

    if (displayName.length < 2) {
      return fail(res, 400, "Nama karyawan minimal 2 karakter.");
    }
    if (!EMAIL_RE.test(email)) return fail(res, 400, "Format email tidak valid.");
    if (password.length < 8) {
      return fail(res, 400, "Password minimal 8 karakter.");
    }
    if (!ROLES.includes(role as (typeof ROLES)[number])) {
      return fail(res, 400, "Role karyawan tidak valid.");
    }
    const duplicate = db
      .prepare("SELECT id FROM users WHERE LOWER(email) = ?")
      .get(email);
    if (duplicate) return fail(res, 409, "Email sudah digunakan akun lain.");

    const result = db
      .prepare(
        `INSERT INTO users
          (email, password_hash, display_name, role, avatar_url, created_at, status)
         VALUES (?, ?, ?, ?, NULL, ?, 'active')`,
      )
      .run(email, hashPassword(password), displayName, role, nowIso());

    const row = employeeById(Number(result.lastInsertRowid))!;
    logAudit(db, req, current, "employee.create", "employee", row.id, {
      email,
      role,
      status: "active",
    });
    return res.status(201).json({ user: mapEmployee(row, current.id) });
  }

  const userId = Number(body.userId);
  if (!Number.isFinite(userId)) return fail(res, 400, "ID karyawan tidak valid.");
  const target = employeeById(userId);
  if (!target) return fail(res, 404, "Karyawan tidak ditemukan.");

  if (action === "update") {
    const displayName = asString(body.displayName);
    const email = asString(body.email).toLowerCase();
    const role = asString(body.role);
    if (displayName.length < 2) {
      return fail(res, 400, "Nama karyawan minimal 2 karakter.");
    }
    if (!EMAIL_RE.test(email)) return fail(res, 400, "Format email tidak valid.");
    if (!ROLES.includes(role as (typeof ROLES)[number])) {
      return fail(res, 400, "Role karyawan tidak valid.");
    }
    if (target.id === current.id && role !== target.role) {
      return fail(res, 400, "Anda tidak dapat mengubah role akun sendiri.");
    }
    if (
      target.role === "admin" &&
      target.status === "active" &&
      role !== "admin" &&
      activeAdminCount() <= 1
    ) {
      return fail(res, 409, "Minimal harus ada satu Admin aktif.");
    }
    const duplicate = db
      .prepare("SELECT id FROM users WHERE LOWER(email) = ? AND id <> ?")
      .get(email, target.id);
    if (duplicate) return fail(res, 409, "Email sudah digunakan akun lain.");

    db.prepare(
      "UPDATE users SET email = ?, display_name = ?, role = ? WHERE id = ?",
    ).run(email, displayName, role, target.id);
    logAudit(db, req, current, "employee.update", "employee", target.id, {
      email,
      role,
    });
    return res.status(200).json({
      user: mapEmployee(employeeById(target.id)!, current.id),
    });
  }

  if (action === "setStatus") {
    const status = asString(body.status);
    if (!["active", "inactive"].includes(status)) {
      return fail(res, 400, "Status karyawan tidak valid.");
    }
    if (target.id === current.id && status !== "active") {
      return fail(res, 400, "Anda tidak dapat menonaktifkan akun sendiri.");
    }
    if (
      target.role === "admin" &&
      target.status === "active" &&
      status !== "active" &&
      activeAdminCount() <= 1
    ) {
      return fail(res, 409, "Minimal harus ada satu Admin aktif.");
    }
    db.prepare("UPDATE users SET status = ? WHERE id = ?").run(
      status,
      target.id,
    );
    if (status === "inactive") {
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(target.id);
    }
    logAudit(db, req, current, "employee.set_status", "employee", target.id, {
      status,
    });
    return res.status(200).json({
      user: mapEmployee(employeeById(target.id)!, current.id),
    });
  }

  if (action === "resetPassword") {
    const password = asString(body.password);
    if (password.length < 8) {
      return fail(res, 400, "Password minimal 8 karakter.");
    }
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
      hashPassword(password),
      target.id,
    );
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(target.id);
    logAudit(db, req, current, "employee.reset_password", "employee", target.id, {
      signedOut: target.id === current.id,
    });
    return res.status(200).json({
      ok: true,
      signedOut: target.id === current.id,
    });
  }

  return fail(res, 400, "Aksi karyawan tidak dikenal.");
}
