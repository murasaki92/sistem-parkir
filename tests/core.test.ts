import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.PARKLINE_DATA_DIR = fs.mkdtempSync(
  path.join(os.tmpdir(), "parkline-test-"),
);
process.env.PARKLINE_SEED_DEMO = "true";

test("parking utility helpers normalize input and timezones", async () => {
  const { normalizePlate, normalizeTicketCode, timezoneModifier } =
    await import("../lib/parking");
  assert.equal(normalizePlate("dd 1234 ab"), "DD1234AB");
  assert.equal(normalizePlate("B-1234-XYZ"), "B1234XYZ");
  assert.equal(normalizeTicketCode("  pkr-1 "), "PKR-1");
  assert.equal(timezoneModifier(8), "+8 hours");
  assert.equal(timezoneModifier(-5), "-5 hours");
  assert.equal(timezoneModifier(0), "+0 hours");
});

test("seed data, site settings and parking quotes work", async () => {
  const { getDb } = await import("../lib/db");
  const { buildQuote, findTicket, getSiteSettings } = await import(
    "../lib/parking"
  );
  const db = getDb();

  const users = db.prepare("SELECT COUNT(*) AS count FROM users").get() as {
    count: number;
  };
  const devices = db.prepare("SELECT COUNT(*) AS count FROM devices").get() as {
    count: number;
  };
  const slots = db
    .prepare("SELECT COUNT(*) AS count FROM parking_slots")
    .get() as { count: number };
  assert.equal(Number(users.count), 5);
  assert.equal(Number(devices.count), 8);
  assert.equal(Number(slots.count), 90);
  const heavySlots = db
    .prepare(
      "SELECT COUNT(*) AS count FROM parking_slots WHERE vehicle_type = 'Bus/Truk'",
    )
    .get() as { count: number };
  assert.equal(Number(heavySlots.count), 10);
  assert.equal(getSiteSettings(db).timezoneOffsetHours, 8);
  assert.equal(getSiteSettings(db).timezoneLabel, "WITA");

  const entry = new Date(Date.now() - 125 * 60000).toISOString();
  db.prepare(
    `INSERT INTO tickets
      (ticket_no, qr_token, plate_number, vehicle_type, entry_at, status, base_fee, fee, created_at)
     VALUES (?, ?, ?, 'Mobil', ?, 'parked', 0, 0, ?)`,
  ).run("TEST-QUOTE-1", "PKR1.TESTQUOTE1", "DD 1111 AA", entry, entry);

  const regular = findTicket(db, "TEST-QUOTE-1");
  assert.ok(regular);
  const quote = buildQuote(db, regular!);
  assert.equal(quote.hours, 2);
  assert.equal(quote.baseFee, 8000);
  assert.equal(quote.fee, 8000);

  db.prepare(
    `INSERT INTO tickets
      (ticket_no, qr_token, plate_number, vehicle_type, entry_at, status, base_fee, fee, created_at)
     VALUES (?, ?, ?, 'Mobil', ?, 'parked', 0, 0, ?)`,
  ).run("TEST-QUOTE-2", "PKR1.TESTQUOTE2", "DD 1234 AB", entry, entry);

  const member = findTicket(db, "TEST-QUOTE-2");
  assert.ok(member);
  const memberQuote = buildQuote(db, member!);
  assert.equal(memberQuote.baseFee, 8000);
  assert.equal(memberQuote.fee, 0);
  assert.equal(memberQuote.membership?.planName, "Bulanan");

  db.prepare(
    `INSERT INTO tickets
      (ticket_no, qr_token, plate_number, vehicle_type, entry_at, status, base_fee, fee, created_at)
     VALUES (?, ?, ?, 'Bus/Truk', ?, 'parked', 0, 0, ?)`,
  ).run("TEST-QUOTE-3", "PKR1.TESTQUOTE3", "DD 3333 BB", entry, entry);

  const heavy = findTicket(db, "TEST-QUOTE-3");
  assert.ok(heavy);
  const heavyQuote = buildQuote(db, heavy!);
  assert.equal(heavyQuote.vehicleType, "Bus/Truk");
  assert.equal(heavyQuote.baseFee, 17000);
  assert.equal(heavyQuote.fee, 17000);
});
