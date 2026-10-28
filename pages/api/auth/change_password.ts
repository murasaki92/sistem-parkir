import type { NextApiRequest, NextApiResponse } from "next";
import { getDb, transaction } from "../../../lib/db";
import { fail, methodNotAllowed, requireUser } from "../../../lib/api";
import { createSessionToken, sessionCookie } from "../../../lib/auth";
import { hashPassword, verifyPassword } from "../../../lib/password";
import { logAudit } from "../../../lib/audit";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (methodNotAllowed(req, res, ["POST"])) return;
  const user = requireUser(req, res);
  if (!user) return;

  const currentPassword =
    typeof req.body?.currentPassword === "string"
      ? req.body.currentPassword
      : "";
  const newPassword =
    typeof req.body?.newPassword === "string" ? req.body.newPassword : "";

  if (!currentPassword) {
    return fail(res, 400, "Password saat ini wajib diisi.");
  }
  if (newPassword.length < 8) {
    return fail(res, 400, "Password baru minimal 8 karakter.");
  }
  if (newPassword === currentPassword) {
    return fail(res, 400, "Password baru harus berbeda dari password saat ini.");
  }

  const db = getDb();
  const row = db
    .prepare("SELECT password_hash FROM users WHERE id = ?")
    .get(user.id) as { password_hash: string } | undefined;
  if (!row || !verifyPassword(currentPassword, row.password_hash)) {
    return fail(res, 401, "Password saat ini salah.");
  }

  const token = transaction(db, () => {
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
      hashPassword(newPassword),
      user.id,
    );
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
    return createSessionToken(user.id);
  });

  logAudit(db, req, user, "auth.change_password", "user", user.id, null);
  res.setHeader("Set-Cookie", sessionCookie(token));
  return res.status(200).json({ ok: true, user });
}
