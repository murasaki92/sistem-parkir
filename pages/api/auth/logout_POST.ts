import type { NextApiRequest, NextApiResponse } from "next";
import { clearSessionCookie, destroySession, SESSION_COOKIE } from "../../../lib/auth";
import { methodNotAllowed } from "../../../lib/api";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (methodNotAllowed(req, res, ["POST"])) return;
  destroySession(req.cookies?.[SESSION_COOKIE]);
  res.setHeader("Set-Cookie", clearSessionCookie());
  return res.status(200).json({ ok: true });
}
