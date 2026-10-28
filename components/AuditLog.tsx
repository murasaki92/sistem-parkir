"use client";

import { useEffect, useState } from "react";
import { History, Search } from "lucide-react";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Input } from "./Input";
import styles from "./AuditLog.module.css";

type AuditEntry = {
  id: number;
  actorName: string;
  actorId: number | null;
  action: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown> | null;
  ip: string;
  createdAt: string;
};

const actionLabel: Record<string, string> = {
  "employee.create": "Tambah karyawan",
  "employee.update": "Ubah karyawan",
  "employee.set_status": "Status karyawan",
  "employee.reset_password": "Reset password",
  "device.create": "Tambah perangkat",
  "device.update": "Ubah perangkat",
  "device.set_status": "Status perangkat",
  "device.provision": "Kredensial perangkat",
  "plan.create": "Tambah paket",
  "plan.update": "Ubah paket",
  "plan.toggle": "Status paket",
  "member.create": "Tambah member",
  "member.update": "Ubah member",
  "member.add_vehicle": "Tambah kendaraan",
  "member.toggle_vehicle": "Status kendaraan",
  "member.renew": "Perpanjang member",
  "member.cancel": "Batalkan member",
  "shift.open": "Buka shift",
  "shift.close": "Tutup shift",
  "settings.update": "Ubah pengaturan",
  "backup.create": "Buat backup",
  "backup.restore": "Restore backup",
  "backup.restore_file": "Restore file",
  "auth.change_password": "Ubah password",
};

function badgeVariant(action: string) {
  if (
    action.includes("create") ||
    action.includes("open") ||
    action.includes("renew")
  ) {
    return "success" as const;
  }
  if (
    action.includes("delete") ||
    action.includes("cancel") ||
    action.includes("reset") ||
    action.includes("restore")
  ) {
    return "warning" as const;
  }
  return "secondary" as const;
}

function detailsText(details: Record<string, unknown> | null): string {
  if (!details) return "—";
  return Object.entries(details)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" · ");
}

export function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async (search = query) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/parking/auditLogs?limit=250&q=${encodeURIComponent(search)}`,
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Gagal memuat audit");
      setEntries(Array.isArray(body) ? body : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat audit");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load("");
  }, []);

  return (
    <section className={styles.wrap}>
      <div className={styles.head}>
        <div>
          <h2>Audit log</h2>
          <p>
            Jejak perubahan karyawan, perangkat, membership, tarif, shift, dan
            backup. Maksimal 250 entri terakhir.
          </p>
        </div>
        <form
          className={styles.search}
          onSubmit={(event) => {
            event.preventDefault();
            load(query);
          }}
        >
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari aktor, aksi, entitas…"
            aria-label="Cari audit"
          />
          <Button type="submit" variant="outline" disabled={loading}>
            <Search size={14} /> Cari
          </Button>
        </form>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>WAKTU</th>
              <th>AKTOR</th>
              <th>AKSI</th>
              <th>ENTITAS</th>
              <th>DETAIL</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td className={styles.time}>
                  {new Date(entry.createdAt).toLocaleString("id-ID")}
                </td>
                <td>{entry.actorName}</td>
                <td>
                  <Badge variant={badgeVariant(entry.action)}>
                    {actionLabel[entry.action] || entry.action}
                  </Badge>
                </td>
                <td>
                  <code>{entry.entityType}</code>
                  {entry.entityId && (
                    <small className={styles.entityId}>#{entry.entityId}</small>
                  )}
                </td>
                <td className={styles.details}>{detailsText(entry.details)}</td>
                <td className={styles.ip}>{entry.ip}</td>
              </tr>
            ))}
            {!entries.length && (
              <tr>
                <td colSpan={6} className={styles.empty}>
                  {loading ? "Memuat audit…" : "Belum ada aktivitas tercatat."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className={styles.footer}>
        <History size={14} />
        <span>
          Audit hanya dapat dilihat Admin dan Supervisor. Perubahan password
          tidak mencatat nilai password.
        </span>
      </div>
    </section>
  );
}
