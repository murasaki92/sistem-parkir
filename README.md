# Parkline

Sistem manajemen parkir untuk satu lokasi: terminal kasir, gate masuk/keluar,
perangkat dan command queue, membership, laporan operasional, audit override,
backup/restore, serta manajemen akun karyawan.

**Demo:** <https://202-10-34-141.nip.io>

Repo ini sebelumnya hanya berisi potongan frontend. Sekarang sudah menjadi
aplikasi Next.js lengkap dengan database SQLite lokal.

## Fitur

- Login berbasis role: Admin, Supervisor, Kasir, Operator, Viewer.
- Terminal kasir: cari tiket/QR, hitung tarif, update plat, bayar, cetak struk.
- Shift kasir: saldo awal, expected cash, selisih saat tutup shift.
- Gate masuk idempotent per `eventId`, alokasi slot otomatis, tiket + QR.
- Command queue perangkat: barrier, kamera, printer, heartbeat, retry.
- Gate Out Attention: pembayaran tercatat tetapi perangkat gagal.
- Membership: paket, kendaraan, perpanjangan, pembatalan, manfaat otomatis.
- Laporan: pendapatan, rekonsiliasi, metode bayar, aktivitas per jam, CSV.
- Override supervisor: bebas biaya, ubah tarif, tiket hilang, buka barrier.
- Peta slot parkir: 80 slot demo, status terisi/kosong dan tiket aktif.
- Pengaturan tarif dan zona waktu dari UI (Admin).
- Audit log perubahan karyawan, perangkat, membership, tarif, shift, backup.
- Backup operasional JSON + backup penuh database SQLite.
- Manajemen karyawan: tambah, edit role, reset password, aktif/nonaktif.

## Stack

- **Next.js 16** (Pages Router) + React 19 + TypeScript
- **Radix UI** + CSS Modules
- **TanStack Query** untuk sesi login
- **SQLite** via modul bawaan Node 22 (`node:sqlite`) — tanpa compiler native
- **scrypt** untuk password/secret, cookie sesi HMAC + session table
- **PM2 + nginx** pada deployment demo

## Menjalankan

Prasyarat: **Node.js >= 22.5** (karena memakai `node:sqlite`).

```bash
npm install
npm run dev
```

Buka <http://localhost:3000>. Database dibuat otomatis di `data/parkline.db`
saat request pertama, lengkap dengan data demo.

Untuk mengulang dari nol, hentikan server lalu jalankan:

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
| Viewer | `viewer@parkline.id` | `viewer123` |

> Ganti password dan set `PARKLINE_SECRET` sebelum dipakai produksi.

Halaman awal setelah login mengikuti role:

- Admin/Supervisor → `/admin`
- Kasir → `/cashier`
- Operator/Viewer → `/operations` (read-only)

### Menambah karyawan

1. Login sebagai **Admin**.
2. Buka **Admin → Karyawan → Tambah karyawan**.
3. Isi nama, email login, role, dan password awal (minimal 8 karakter).
4. Simpan. Karyawan bisa langsung login.

Catatan:

- **Admin** dapat mengelola karyawan, perangkat, membership, laporan, override,
  pengaturan, dan backup.
- **Supervisor** memiliki akses operasional tetapi tidak dapat mengelola
  karyawan atau mengubah pengaturan.
- **Kasir** hanya dapat membuka terminal kasir dan shift.
- **Operator/Viewer** mendapat dashboard operasional read-only.
- Menonaktifkan karyawan langsung mencabut semua sesi login-nya.
- Reset password juga mencabut sesi login karyawan tersebut.
- Sistem mencegah menonaktifkan/menurunkan role satu-satunya Admin aktif, serta
  menonaktifkan akun sendiri.
- Setiap akun dapat mengganti password sendiri lewat ikon kunci di navigasi.

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
4. Untuk memproses barrier keluar, hentikan simulator lalu ganti Device Code ke
   `GATE-OUT-001` dengan secret `gate-out-demo-secret`, dan mulai lagi.
5. Cek **Admin → Laporan**, **Slot**, **Membership**, **Audit**, **Backup**, dan
   **Gate Out**.

## Tarif dan membership

- Mobil: Rp5.000 jam pertama, Rp3.000 jam berikutnya.
- Motor: Rp2.000 jam pertama, Rp1.500 jam berikutnya.
- Grace 10 menit; minimal 1 jam tagihan.
- Tarif, grace, tiket hilang, dan zona waktu dapat diubah di
  **Admin → Pengaturan**.
- Membership: gratis, diskon persen, atau tarif flat.
- Tarif lama pada transaksi yang sudah dibayar tidak berubah.

## Script

| Command | Fungsi |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Build produksi |
| `npm start` | Jalankan hasil build |
| `npm run typecheck` | TypeScript tanpa emit |
| `npm test` | Unit test (Node test runner) |
| `npm run smoke` | Uji alur API end-to-end (server harus berjalan) |
| `npm run db:reset` | Hapus database lokal (hentikan server dulu) |
| `npm run backup:db` | Backup penuh SQLite ke `data/full-backups` |

Smoke test memakai `BASE_URL` (default `http://localhost:3000`) dan akun demo:

```bash
BASE_URL=http://localhost:3100 npm run smoke
```

## Arsitektur

```
pages/
  login.tsx, cashier.tsx, admin.tsx, operations.tsx
  api/auth/*                 login, session, logout, change password
  api/parking/*              kasir, tarif, shift, membership, laporan, backup
  api/device/parking/*       protokol perangkat (rewrite dari /_api/parking/*)
lib/
  db.ts                      schema SQLite, migrasi ringan, seed
  auth.ts                    cookie sesi, user
  password.ts                scrypt hash/verify
  parking.ts                 tarif, tiket, slot, command queue, shift
  backup.ts                  snapshot operasional + scheduler
  audit.ts                   audit log
  rate-limit.ts              pembatasan percobaan login
  api.ts                     guard role + helper response
components/                  UI + modul admin/kasir/operasional
endpoints/                   wrapper fetch login & perangkat
scripts/smoke.js             smoke test API
scripts/backup-db.js         backup penuh SQLite
tests/                       unit test
instrumentation.ts           scheduler backup saat server start
```

### Model data utama

`users`, `sessions`, `login_attempts`, `devices`, `parking_slots`, `tickets`,
`shifts`, `members`, `member_vehicles`, `membership_plans`, `payments`,
`device_commands`, `exit_operations`, `overrides`, `entry_events`, `backups`,
`settings`, `audit_logs`.

### Gate & perangkat

Firmware/simulator memakai header `x-device-code` dan `x-device-secret`.
Secret disimpan sebagai hash scrypt dan hanya ditampilkan sekali saat
provisioning.

- `POST /_api/parking/deviceHeartbeat`
- `GET /_api/parking/deviceCommands?limit=10`
- `POST /_api/parking/deviceCommandAck`
- `POST /_api/parking/gateSelfService` (idempotent per `eventId`)

Perintah barrier adalah perintah kritis untuk kendaraan keluar. Kamera/printer
bersifat pendukung; jika gagal akan muncul sebagai peringatan, tetapi tidak
menahan kendaraan.

## Backup

Ada dua lapis backup:

1. **Backup operasional** di **Admin → Backup**:
   - Snapshot JSON tabel operasional, checksum SHA-256.
   - Tanpa password user, secret perangkat, atau sesi.
   - Restore mempertahankan secret perangkat yang sedang aktif.
   - Backup otomatis dicek setiap jam oleh server dan dibuat setelah pukul
     02.00 zona waktu operasional. Backup terjadwal lebih dari 30 hari
     dibersihkan otomatis.
2. **Backup penuh database**:
   ```bash
   npm run backup:db
   ```
   Membuat salinan konsisten SQLite dengan `VACUUM INTO` di
   `data/full-backups`, menyimpan 14 file terakhir. Gunakan cron untuk
   menjalankannya setiap hari, misalnya:
   ```cron
   0 18 * * * cd /root/sistem-parkir && /usr/bin/node scripts/backup-db.js >> data/backup.log 2>&1
   ```
   Simpan hasil backup di luar server (offsite).

## Keamanan

- Password dan secret perangkat memakai scrypt + salt acak.
- Cookie sesi `HttpOnly`, `SameSite=Lax`, `Secure` di HTTPS, ditandatangani HMAC.
- Sesi disimpan di database sehingga logout/deaktivasi mencabut akses.
- Login dibatasi 5 percobaan per IP+email dalam 15 menit.
- Security headers + CSP aktif pada build produksi.
- Semua endpoint manajemen dicek role di server.
- Audit log mencatat perubahan administratif.
- `npm audit` saat ini 0 vulnerability.

## Deployment produksi

```bash
npm ci
npm run build
PARKLINE_SECRET="string-acak-panjang" \
PARKLINE_SECURE_COOKIE=1 \
PARKLINE_ADMIN_PASSWORD="password-admin-kuat" \
PARKLINE_SEED_DEMO=false \
npm start
```

- `PARKLINE_SEED_DEMO=false` hanya membuat akun admin, pengaturan, dan slot
  kosong — tanpa user/perangkat/tiket demo.
- `PARKLINE_ADMIN_PASSWORD` dipakai saat database pertama kali dibuat.
- `PARKLINE_DATA_DIR` dapat diarahkan ke volume persisten.
- Jalankan di belakang reverse proxy HTTPS (nginx/Caddy).
- SQLite cocok untuk satu instance. Untuk multi-instance, pindahkan `lib/db.ts`
  ke PostgreSQL/MySQL dan ganti session/rate-limit store.

## Batasan yang masih ada

- Pembayaran QRIS/kartu hanya dicatat (metode + nomor referensi), belum
  terhubung ke payment gateway.
- Barrier, kamera, dan printer memakai command queue; integrasi firmware/ESP32
  dan format ESC/POS berada di luar repo ini.
- Satu lokasi/satu tenant. Belum ada multi-cabang.
- Belum ada booking/pembayaran mandiri untuk pengendara.
- Belum ada payroll/absensi; modul Karyawan hanya mengelola akun aplikasi.
- Laporan belum memiliki chart tren multi-hari.
- Slot map belum bisa drag/assign manual.
- Unit test berfokus pada utilitas inti; integration test utama ada di smoke
  test dan CI.
