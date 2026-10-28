#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Parkline end-to-end smoke test.
 *
 * Usage:
 *   npm run dev            # in another terminal
 *   npm run smoke          # defaults to http://localhost:3000
 *   BASE_URL=http://localhost:3100 npm run smoke
 *
 * The script logs in as the seeded admin, opens a shift when needed, issues a
 * ticket through the gate API, pays it, acknowledges the device commands and
 * checks reports/backup. It leaves the database with the smoke-test ticket.
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL || "admin@parkline.id";
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD || "admin123";
const GATE_IN_CODE = process.env.SMOKE_GATE_IN_CODE || "GATE-IN-001";
const GATE_IN_SECRET =
  process.env.SMOKE_GATE_IN_SECRET || "gate-in-demo-secret";
const GATE_OUT_CODE = process.env.SMOKE_GATE_OUT_CODE || "GATE-OUT-001";
const GATE_OUT_SECRET =
  process.env.SMOKE_GATE_OUT_SECRET || "gate-out-demo-secret";

const failures = [];

function check(condition, message) {
  if (!condition) {
    failures.push(message);
    console.error(`  ✗ ${message}`);
    return false;
  }
  console.log(`  ✓ ${message}`);
  return true;
}

async function request(path, options = {}) {
  const { method = "GET", body, cookie, headers = {} } = options;
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: response.status, body: json, headers: response.headers };
}

function sessionCookie(response) {
  const values =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie")].filter(Boolean);
  const raw = values[0] || "";
  return raw.split(";")[0];
}

async function main() {
  console.log(`Parkline smoke test → ${BASE_URL}`);

  console.log("\n1. Authentication");
  const login = await request("/api/auth/login_with_password_POST", {
    method: "POST",
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  check(login.status === 200, "login admin");
  const cookie = sessionCookie(login);
  check(Boolean(cookie), "session cookie diterima");
  if (!cookie) throw new Error("Tidak bisa melanjutkan tanpa cookie sesi.");

  const session = await request("/api/auth/session_GET", { cookie });
  check(
    session.status === 200 && session.body?.user?.role === "admin",
    "sesi mengembalikan user admin",
  );

  console.log("\n2. Shift kasir");
  let shift = await request("/api/parking/cashierShift", { cookie });
  let openedHere = false;
  if (!shift.body?.current) {
    const opened = await request("/api/parking/cashierShiftOpen", {
      method: "POST",
      cookie,
      body: { openingCash: 200000 },
    });
    check(opened.status === 201, "shift dibuka (saldo awal Rp200.000)");
    shift = await request("/api/parking/cashierShift", { cookie });
    openedHere = true;
  } else {
    console.log("  · shift sudah terbuka, memakai shift yang ada");
  }
  check(Boolean(shift.body?.current), "shift aktif tersedia");

  console.log("\n3. Gate masuk & tiket");
  const devices = await request("/api/parking/devices", { cookie });
  check(
    devices.status === 200 && Array.isArray(devices.body) && devices.body.length >= 8,
    "daftar perangkat tersedia",
  );

  const eventId = `smoke-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const deviceHeaders = {
    "x-device-code": GATE_IN_CODE,
    "x-device-secret": GATE_IN_SECRET,
  };
  const entry = await request("/_api/parking/gateSelfService", {
    method: "POST",
    headers: deviceHeaders,
    body: { vehicleType: "Mobil", eventId },
  });
  check(entry.status === 201 && Boolean(entry.body?.ticketNo), "tiket diterbitkan");
  const ticketNo = entry.body?.ticketNo;
  check(Boolean(entry.body?.slot), `slot dialokasikan (${entry.body?.slot})`);

  const duplicate = await request("/_api/parking/gateSelfService", {
    method: "POST",
    headers: deviceHeaders,
    body: { vehicleType: "Mobil", eventId },
  });
  check(
    duplicate.status === 200 &&
      duplicate.body?.idempotent === true &&
      duplicate.body?.ticketNo === ticketNo,
    "eventId idempotent tidak membuat tiket ganda",
  );

  console.log("\n4. Kasir: hitung, plat, bayar");
  const quote = await request("/api/parking/exit", {
    method: "POST",
    cookie,
    body: { ticketNo },
  });
  check(
    quote.status === 200 && Number(quote.body?.fee) >= 0,
    `tagihan dihitung (Rp${quote.body?.fee?.toLocaleString("id-ID")})`,
  );

  const plate = await request("/api/parking/plateUpdate", {
    method: "POST",
    cookie,
    body: { ticketNo, plateNumber: "DD 4321 XY" },
  });
  check(plate.status === 200, "nomor plat diperbarui");

  const override = await request("/api/parking/override", {
    method: "POST",
    cookie,
    body: {
      overrideType: "fee_override",
      ticketNo,
      amount: 7500,
      reason: "Smoke test override tarif",
    },
  });
  check(override.status === 200, "override tarif supervisor dicatat");
  const overriddenQuote = await request("/api/parking/exit", {
    method: "POST",
    cookie,
    body: { ticketNo },
  });
  check(
    overriddenQuote.status === 200 && Number(overriddenQuote.body?.fee) === 7500,
    "tagihan mengikuti override (Rp7.500)",
  );

  const pay = await request("/api/parking/pay", {
    method: "POST",
    cookie,
    body: {
      ticketNo,
      paymentMethod: "cash",
      paymentReference: "SMOKE-REF-001",
      exitDeviceCode: GATE_OUT_CODE,
      receiptPrinterDeviceCode: "PRINTER-OUT-001",
    },
  });
  check(
    pay.status === 200 &&
      Boolean(pay.body?.receiptNo) &&
      Number(pay.body?.fee) === 7500 &&
      pay.body?.paymentReference === "SMOKE-REF-001",
    `pembayaran berhasil (${pay.body?.receiptNo})`,
  );

  const commands = await request(
    `/api/parking/commandStatus?ticketNo=${encodeURIComponent(ticketNo)}`,
    { cookie },
  );
  check(
    commands.status === 200 && commands.body?.commands?.length >= 1,
    "command Gate Out masuk antrean",
  );

  console.log("\n5. Simulator perangkat (ack command)");
  const deviceCreds = [
    [GATE_OUT_CODE, GATE_OUT_SECRET],
    ["PRINTER-OUT-001", "printer-out-demo-secret"],
    ["CAM-OUT-001", "cam-out-demo-secret"],
  ];
  for (const [code, secret] of deviceCreds) {
    const queue = await request("/_api/parking/deviceCommands?limit=10", {
      headers: { "x-device-code": code, "x-device-secret": secret },
    });
    check(queue.status === 200, `queue ${code} dapat dibaca`);
    for (const command of queue.body?.commands || []) {
      const ack = await request("/_api/parking/deviceCommandAck", {
        method: "POST",
        headers: { "x-device-code": code, "x-device-secret": secret },
        body: { commandId: command.id, status: "acknowledged" },
      });
      const done = await request("/_api/parking/deviceCommandAck", {
        method: "POST",
        headers: { "x-device-code": code, "x-device-secret": secret },
        body: { commandId: command.id, status: "completed" },
      });
      check(
        ack.status === 200 && done.status === 200,
        `command ${command.commandType} (${code}) selesai`,
      );
    }
  }

  const afterAck = await request(
    `/api/parking/commandStatus?ticketNo=${encodeURIComponent(ticketNo)}`,
    { cookie },
  );
  check(
    afterAck.body?.operation?.status === "completed",
    "operasi Gate Out selesai",
  );
  const attention = await request("/api/parking/exitAttention", { cookie });
  check(
    attention.status === 200 && Array.isArray(attention.body?.operations),
    "daftar perhatian Gate Out dapat dibaca",
  );

  console.log("\n6. Laporan, membership, backup");
  const report = await request("/api/parking/advancedReport", { cookie });
  check(
    report.status === 200 && report.body?.summary?.transactions >= 1,
    "laporan periode berjalan",
  );
  check(
    report.body?.reconciliation?.difference === 0,
    "rekonsiliasi pembayaran seimbang",
  );

  const members = await request("/api/parking/members", { cookie });
  check(
    members.status === 200 && Array.isArray(members.body),
    "daftar membership dapat dibaca",
  );

  const settings = await request("/api/parking/settings", { cookie });
  check(
    settings.status === 200 && Boolean(settings.body?.tariffs),
    "pengaturan tarif dapat dibaca",
  );

  const slots = await request("/api/parking/slots", { cookie });
  check(
    slots.status === 200 &&
      Array.isArray(slots.body?.slots) &&
      slots.body.slots.length >= 80,
    "peta slot dapat dibaca",
  );

  const backup = await request("/api/parking/backup", {
    method: "POST",
    cookie,
    body: { action: "create", label: "Smoke test backup" },
  });
  check(backup.status === 201 && Boolean(backup.body?.backup?.id), "backup dibuat");

  const audit = await request("/api/parking/auditLogs?limit=20", { cookie });
  check(
    audit.status === 200 &&
      Array.isArray(audit.body) &&
      audit.body.some((entry) => entry.action === "backup.create"),
    "audit log mencatat backup",
  );
  const backupId = backup.body?.backup?.id;
  if (backupId) {
    const download = await request(
      `/api/parking/backup?id=${encodeURIComponent(backupId)}`,
      { cookie },
    );
    check(
      download.status === 200 && download.body?.app === "parkline",
      "backup dapat diunduh",
    );
  }

  if (openedHere) {
    console.log("\n7. Tutup shift");
    const current = await request("/api/parking/cashierShift", { cookie });
    const expected = current.body?.current?.expectedCash ?? 0;
    const closed = await request("/api/parking/cashierShiftClose", {
      method: "POST",
      cookie,
      body: { closingCash: expected, notes: "Smoke test otomatis" },
    });
    check(
      closed.status === 200 && closed.body?.difference === 0,
      "shift ditutup dan kas seimbang",
    );
  }

  const logout = await request("/api/auth/logout_POST", {
    method: "POST",
    cookie,
    body: {},
  });
  check(logout.status === 200, "logout");
  const signedOut = await request("/api/auth/session_GET", { cookie });
  check(signedOut.status === 401, "sesi dicabut setelah logout");

  console.log("");
  if (failures.length) {
    console.error(`${failures.length} pemeriksaan gagal.`);
    process.exit(1);
  }
  console.log("Semua pemeriksaan smoke test lulus.");
}

main().catch((error) => {
  console.error("\nSmoke test gagal:", error?.message || error);
  process.exit(1);
});
