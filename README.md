# Parkline

Sistem manajemen parkir: terminal kasir, gate masuk/keluar, perangkat & command
queue, membership, laporan operasional, audit override, dan backup/restore.

Repo ini sebelumnya hanya berisi potongan frontend (tanpa `package.json`,
backend, atau komponen UI dasar). Sekarang sudah menjadi aplikasi Next.js yang
bisa dijalankan lengkap dengan database SQLite lokal.

## Stack

- **Next.js 14** (pages router) + React 18 + TypeScript
- **Radix UI** + CSS Modules (design system bawaan repo)
- **TanStack Query** untuk sesi login
- **SQLite** lewat modul bawaan Node 22 (`node:sqlite`) — tanpa server DB dan
  tanpa compiler native
- **scrypt** untuk password, cookie sesi HMAC-SHA256

## Menjalankan

Prasyarat: **Node.js >= 22.5** (karena memakai `node:sqlite`).

```bash
npm install
npm run dev
```

Buka <http://localhost:3000>.

Database dibuat otomatis di `data/parkline.db` saat request pertama, lengkap
dengan data demo. Untuk mengulang dari nol, hentikan server lalu jalankan:

```bash
npm run db:reset
```

### Akun demo

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@parkline.id` | `admin123` |
| Supervisor | `supervisor@parkline.id` | `supervisor123` |
| Kasir | `kasir@parkline.id` | `kasir123` |
| Operator | `operator@parkline.id` | `operator123` |

> Ganti password dan set `PARKLINE_SECRET` sebelum dipakai produksi.

### Data demo

- 8 perangkat: `GATE-IN-001`, `GATE-OUT-001`, `KASIR-001`, kamera, printer,
  sensor.
- Kredensial simulator: `GATE-IN-001` / `gate-in-demo-secret`.
- 4 tiket aktif: `PKR-DEMO-0001` s/d `PKR-DEMO-0004`.
  `PKR-DEMO-0004` memakai plat member `DD 1234 AB` (gratis).
- Member aktif: **Budi Santoso** (`MBR-0001`, paket Bulanan, plat `DD 1234 AB`).
- Riwayat transaksi 7 hari terakhir untuk mengisi laporan.

### Alur demo

1. Login sebagai admin, buka **Admin → Simulator**.
2. Klik **Mulai simulator**, lalu **Simulasikan kendaraan** → **Ambil Tiket**.
3. Buka **Kasir**, masukkan nomor tiket, simpan plat bila perlu, lalu bayar.
4. Kembali ke simulator untuk melihat command barrier/kamera/printer diproses.
5. Cek **Admin → Laporan**, **Membership**, **Backup**, dan **Gate Out**.

## Script

| Command | Fungsi |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Build produksi |
| `npm start` | Jalankan hasil build |
| `npm run db:reset` | Hapus database lokal (dibuat ulang saat request berikutnya) |
| `npm run smoke` | Uji alur API end-to-end (server harus berjalan) |

Smoke test memakai `BASE_URL` (default `http://localhost:3000`) dan akun demo.
Contoh:

```bash
BASE_URL=http://localhost:3100 npm run smoke
```

## Arsitektur

```
pages/
  login.tsx, cashier.tsx, admin.tsx
  api/auth/*                 login, session, logout
  api/parking/*              kasir, tarif, shift, membership, laporan, backup
  api/device/parking/*       protokol perangkat (rewrite dari /_api/parking/*)
lib/
  db.ts                      schema SQLite + seed
  auth.ts                    cookie sesi, user
  password.ts                scrypt hash/verify
  parking.ts                 tarif, tiket, slot, command queue, shift
  api.ts                     guard role + helper response
components/                  UI + komponen yang sebelumnya hilang
endpoints/                   wrapper fetch untuk form login & perangkat
scripts/smoke.js             smoke test API
legacy/                      pageLayout lama dari generator (tidak dipakai)
```

### Model data utama

`users`, `devices`, `parking_slots`, `tickets`, `shifts`, `members`,
`member_vehicles`, `membership_plans`, `payments`, `device_commands`,
`exit_operations`, `overrides`, `entry_events`, `backups`, `settings`.

### Perhitungan tarif

- Mobil: Rp5.000 jam pertama, Rp3.000 jam berikutnya.
- Motor: Rp2.000 jam pertama, Rp1.500 jam berikutnya.
- Grace 10 menit; minimal 1 jam tagihan.
- Membership: gratis, diskon persen, atau tarif flat.
- Tarif dapat diubah di tabel `settings` (key `tariffs`).

### Gate & perangkat

Firmware/simulator memakai header `x-device-code` dan `x-device-secret`.
Secret disimpan sebagai hash scrypt dan hanya ditampilkan sekali saat
provisioning.

- `POST /_api/parking/deviceHeartbeat`
- `GET /_api/parking/deviceCommands?limit=10`
- `POST /_api/parking/deviceCommandAck`
- `POST /_api/parking/gateSelfService` (idempotent per `eventId`)

### Backup

Backup berisi snapshot JSON tabel operasional dengan checksum SHA-256.
Password user, secret perangkat, dan sesi login tidak disertakan. Saat restore,
secret perangkat yang sedang aktif dipertahankan berdasarkan `deviceCode`.
Backup otomatis harian dibuat malas (lazy) saat tab Backup dibuka setelah pukul
02.00 dan belum ada backup terjadwal hari itu.

## Deployment

```bash
npm ci
npm run build
PARKLINE_SECRET="ganti-dengan-string-panjang-acak" \
PARKLINE_SECURE_COOKIE=1 \
npm start
```

Letakkan di belakang reverse proxy HTTPS (Nginx/Caddy). Beberapa catatan:

- SQLite cocok untuk satu instance. Untuk multi-instance, pindahkan `lib/db.ts`
  ke Postgres/MySQL.
- `data/` harus writable dan dipersistensikan (volume).
- Set `PARKLINE_DATA_DIR` bila ingin menyimpan database di luar folder aplikasi.
- Set `PARKLINE_SECURE_COOKIE=1` hanya jika sudah HTTPS.
- Backup otomatis bergantung pada request yang masuk (lazy); untuk jadwal ketat
  gunakan cron yang memanggil endpoint backup atau salin file SQLite.

## Keamanan

- Semua endpoint `/api/parking/*` memerlukan sesi; endpoint manajemen dibatasi
  role Admin/Supervisor.
- Endpoint perangkat memakai kredensial per-perangkat, bukan sesi user.
- Password dan secret perangkat memakai scrypt dengan salt acak.
- Cookie sesi `HttpOnly`, `SameSite=Lax`, ditandatangani HMAC.
- Belum ada rate limiting/CSRF token; tambahkan di depan aplikasi bila
  diekspos ke internet publik.
