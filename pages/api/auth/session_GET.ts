import type { NextApiRequest, NextApiResponse } from "next";
import { getCurrentUser } from "../../../lib/auth";
import { fail, methodNotAllowed } from "../../../lib/api";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (methodNotAllowed(req, res, ["GET"])) return;
  const user = getCurrentUser(req);
  if (!user) return fail(res, 401, "Belum masuk.");
  return res.status(200).json({ user });
}
