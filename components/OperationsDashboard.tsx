"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  CarFront,
  CircleDollarSign,
  Radio,
  RefreshCw,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Badge } from "./Badge";
import { Button } from "./Button";
import styles from "./OperationsDashboard.module.css";

type Ticket = {
  id: number;
  ticketNo: string;
  plateNumber: string;
  vehicleType: string;
  entryAt: string;
  minutes: number;
  currentFee: number;
  membership: { memberName: string; planName: string } | null;
};

type Device = {
  id: number;
  deviceCode: string;
  name: string;
  deviceType: string;
  status: string;
  area: string | null;
  gateDirection: string | null;
  lastSeenAt: string | null;
};

type Report = {
  summary: {
    revenue: number;
    transactions: number;
    averagePaid: number;
    parked: number;
  };
  paymentMethods: Record<string, number>;
};

const rupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);

const typeLabel: Record<string, string> = {
  gate: "Gate",
  cashier: "Kasir",
  controller: "Controller",
  camera: "Kamera",
  printer: "Printer",
  sensor: "Sensor",
};

export function OperationsDashboard() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const [ticketsRes, devicesRes, reportRes] = await Promise.all([
        fetch("/api/parking/activeTickets"),
        fetch("/api/parking/devices"),
        fetch("/api/parking/advancedReport"),
      ]);
      const [ticketsBody, devicesBody, reportBody] = await Promise.all([
        ticketsRes.json(),
        devicesRes.json(),
        reportRes.json(),
      ]);
      if (!ticketsRes.ok) {
        throw new Error(ticketsBody.error || "Gagal memuat kendaraan aktif");
      }
      if (!devicesRes.ok) {
        throw new Error(devicesBody.error || "Gagal memuat perangkat");
      }
      if (!reportRes.ok) {
        throw new Error(reportBody.error || "Gagal memuat ringkasan");
      }
      setTickets(Array.isArray(ticketsBody) ? ticketsBody : []);
      setDevices(Array.isArray(devicesBody) ? devicesBody : []);
      setReport(reportBody);
      setUpdatedAt(
        new Date().toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const timer = window.setInterval(() => load(true), 15000);
    return () => window.clearInterval(timer);
  }, []);

  const online = (device: Device) => {
    if (device.status !== "active" || !device.lastSeenAt) return false;
    return Date.now() - new Date(device.lastSeenAt).getTime() <= 45000;
  };
  const onlineCount = devices.filter(online).length;
  const potential = tickets.reduce(
    (total, ticket) => total + Number(ticket.currentFee),
    0,
  );
  const gatesIn = devices.filter(
    (device) => device.deviceType === "gate" && device.gateDirection === "in",
  );
  const gatesOut = devices.filter(
    (device) => device.deviceType === "gate" && device.gateDirection === "out",
  );

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div>
          <div className={styles.kicker}>PARKLINE / OPERATIONS</div>
          <h1>Operasional parkir</h1>
          <p>
            Ringkasan kendaraan, perangkat, dan transaksi hari ini. Halaman ini
            bersifat baca-saja.
          </p>
        </div>
        <div className={styles.headActions}>
          {updatedAt && <span className={styles.updated}>Data {updatedAt}</span>}
          <Button variant="outline" size="sm" onClick={() => load()}>
            <RefreshCw size={14} /> Muat ulang
          </Button>
        </div>
      </header>

      {error && <div className={styles.error}>{error}</div>}

      <section className={styles.stats}>
        <div className={styles.stat}>
          <CarFront size={18} />
          <div>
            <span>Kendaraan di dalam</span>
            <strong>{tickets.length}</strong>
          </div>
        </div>
        <div className={styles.stat}>
          <CircleDollarSign size={18} />
          <div>
            <span>Potensi biaya</span>
            <strong>{rupiah(potential)}</strong>
          </div>
        </div>
        <div className={styles.stat}>
          <Activity size={18} />
          <div>
            <span>Transaksi hari ini</span>
            <strong>{report?.summary.transactions ?? "—"}</strong>
          </div>
        </div>
        <div className={styles.stat}>
          <Radio size={18} />
          <div>
            <span>Perangkat online</span>
            <strong>
              {onlineCount}/{devices.length}
            </strong>
          </div>
        </div>
      </section>

      <div className={styles.grid}>
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2>Kendaraan aktif</h2>
              <p>Kendaraan yang belum menyelesaikan pembayaran.</p>
            </div>
            <Badge variant={tickets.length ? "success" : "outline"}>
              {tickets.length} kendaraan
            </Badge>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>TIKET</th>
                  <th>PLAT</th>
                  <th>MASUK</th>
                  <th>DURASI</th>
                  <th>BIAYA</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr key={ticket.id}>
                    <td>
                      <strong className={styles.mono}>{ticket.ticketNo}</strong>
                      {ticket.membership && (
                        <small className={styles.member}>
                          {ticket.membership.planName}
                        </small>
                      )}
                    </td>
                    <td>
                      {ticket.plateNumber || "—"} · {ticket.vehicleType}
                    </td>
                    <td>{new Date(ticket.entryAt).toLocaleTimeString("id-ID")}</td>
                    <td>{ticket.minutes} menit</td>
                    <td>{rupiah(ticket.currentFee)}</td>
                  </tr>
                ))}
                {!tickets.length && !loading && (
                  <tr>
                    <td colSpan={5} className={styles.empty}>
                      Tidak ada kendaraan yang sedang parkir.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2>Gate & perangkat</h2>
              <p>Status heartbeat perangkat terdaftar.</p>
            </div>
            <Badge variant={onlineCount === devices.length ? "success" : "warning"}>
              {onlineCount} online
            </Badge>
          </div>
          <div className={styles.deviceGrid}>
            {devices.map((device) => {
              const isOnline = online(device);
              return (
                <div key={device.id} className={styles.deviceCard}>
                  <div className={styles.deviceTop}>
                    <strong>{device.name}</strong>
                    {isOnline ? (
                      <span className={styles.online}>
                        <Wifi size={12} /> ONLINE
                      </span>
                    ) : (
                      <span className={styles.offline}>
                        <WifiOff size={12} /> OFFLINE
                      </span>
                    )}
                  </div>
                  <div className={styles.deviceMeta}>
                    <code>{device.deviceCode}</code>
                    <span>{typeLabel[device.deviceType] || device.deviceType}</span>
                    {device.gateDirection && (
                      <span>
                        {device.gateDirection === "in" ? "Masuk" : "Keluar"}
                      </span>
                    )}
                  </div>
                  <small>
                    {device.area || "Tanpa area"}
                    {device.lastSeenAt
                      ? ` · heartbeat ${Math.max(
                          0,
                          Math.round(
                            (Date.now() - new Date(device.lastSeenAt).getTime()) /
                              1000,
                          ),
                        )} dtk lalu`
                      : " · belum ada heartbeat"}
                  </small>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <section className={styles.summary}>
        <div>
          <h2>Ringkasan hari ini</h2>
          <p>Data pembayaran dan gate yang tercatat sejak 00.00 waktu lokal.</p>
        </div>
        <div className={styles.summaryGrid}>
          <div>
            <span>Pendapatan</span>
            <strong>{rupiah(report?.summary.revenue ?? 0)}</strong>
          </div>
          <div>
            <span>Rata-rata tiket</span>
            <strong>{rupiah(report?.summary.averagePaid ?? 0)}</strong>
          </div>
          <div>
            <span>Gate masuk</span>
            <strong>{gatesIn.length}</strong>
          </div>
          <div>
            <span>Gate keluar</span>
            <strong>{gatesOut.length}</strong>
          </div>
          <div>
            <span>Kas</span>
            <strong>{rupiah(report?.paymentMethods?.cash ?? 0)}</strong>
          </div>
          <div>
            <span>QRIS</span>
            <strong>{rupiah(report?.paymentMethods?.qris ?? 0)}</strong>
          </div>
          <div>
            <span>Kartu</span>
            <strong>{rupiah(report?.paymentMethods?.card ?? 0)}</strong>
          </div>
          <div>
            <span>Parkir aktif</span>
            <strong>{report?.summary.parked ?? tickets.length}</strong>
          </div>
        </div>
      </section>
    </div>
  );
}
