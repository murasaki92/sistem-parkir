import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { getDb } from "../../../lib/db";
import {
  createSessionToken,
  sessionCookie,
  toPublicUser,
} from "../../../lib/auth";
import { fail, methodNotAllowed } from "../../../lib/api";
import { verifyPassword } from "../../../lib/password";

const bodySchema = z.object({
  email: z.string().email("Format email tidak valid"),
  password: z.string().min(1, "Password wajib diisi"),
});

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (methodNotAllowed(req, res, ["POST"])) return;

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 400, parsed.error.errors[0]?.message || "Data tidak valid");
  }

  const db = getDb();
  const row = db
    .prepare("SELECT * FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1")
    .get(parsed.data.email) as
    | {
        id: number;
        email: string;
        password_hash: string;
        display_name: string;
        avatar_url: string | null;
        role: "supervisor" | "admin" | "cashier" | "operator" | "viewer";
      }
    | undefined;

  if (!row || !verifyPassword(parsed.data.password, row.password_hash)) {
    return fail(res, 401, "Email atau password salah.");
  }

  const token = createSessionToken(Number(row.id));
  res.setHeader("Set-Cookie", sessionCookie(token));
  return res.status(200).json({ user: toPublicUser(row) });
}
