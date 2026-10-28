import type { NextApiRequest, NextApiResponse } from "next";
import {
  DEFAULT_TARIFFS,
  getDb,
  nowIso,
  type Tariffs,
} from "../../../lib/db";
import { asInt, asString, fail, methodNotAllowed, requireUser } from "../../../lib/api";
import {
  DEFAULT_SITE_SETTINGS,
  getSiteSettings,
  getTariffs,
  type SiteSettings,
} from "../../../lib/parking";
import { logAudit } from "../../../lib/audit";

const TARIFF_KEYS: Array<keyof Tariffs> = [
  "carFirstHour",
  "carNextHour",
  "motorFirstHour",
  "motorNextHour",
  "busFirstHour",
  "busNextHour",
  "graceMinutes",
  "lostTicketFee",
];

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (methodNotAllowed(req, res, ["GET", "POST"])) return;
  const user = requireUser(req, res, ["admin", "supervisor"]);
  if (!user) return;
  if (req.method === "POST" && user.role !== "admin") {
    return fail(res, 403, "Hanya Admin yang dapat mengubah pengaturan.");
  }

  const db = getDb();

  if (req.method === "GET") {
    return res.status(200).json({
      tariffs: getTariffs(db),
      site: getSiteSettings(db),
    });
  }

  const body = (req.body || {}) as Record<string, any>;
  const input = body.tariffs || {};
  const tariffs: Tariffs = { ...DEFAULT_TARIFFS };
  for (const key of TARIFF_KEYS) {
    const value = asInt(input[key], -1);
    if (value < 0) {
      return fail(res, 400, `Nilai ${key} tidak valid.`);
    }
    tariffs[key] = value;
  }
  if (tariffs.graceMinutes > 240) {
    return fail(res, 400, "Grace period maksimal 240 menit.");
  }
  if (tariffs.carFirstHour === 0 && tariffs.carNextHour === 0) {
    return fail(res, 400, "Tarif mobil tidak boleh seluruhnya nol.");
  }

  const inputSite = body.site || {};
  const offset = asInt(
    inputSite.timezoneOffsetHours,
    DEFAULT_SITE_SETTINGS.timezoneOffsetHours,
  );
  if (offset < -12 || offset > 14) {
    return fail(res, 400, "Offset zona waktu tidak valid.");
  }
  const site: SiteSettings = {
    timezoneOffsetHours: offset,
    timezoneLabel:
      asString(inputSite.timezoneLabel) || DEFAULT_SITE_SETTINGS.timezoneLabel,
  };
  if (site.timezoneLabel.length > 20) {
    return fail(res, 400, "Label zona waktu terlalu panjang.");
  }

  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('tariffs', ?)").run(
    JSON.stringify(tariffs),
  );
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('site', ?)").run(
    JSON.stringify({
      name: "Parkline",
      timezoneOffsetHours: site.timezoneOffsetHours,
      timezoneLabel: site.timezoneLabel,
      currency: "IDR",
      updatedAt: nowIso(),
    }),
  );

  logAudit(db, req, user, "settings.update", "settings", "tariffs", {
    tariffs,
    site,
  });
  return res.status(200).json({ tariffs, site });
}
