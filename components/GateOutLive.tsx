"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Camera,
  ExternalLink,
  Radio,
  ScanLine,
} from "lucide-react";
import { Badge } from "./Badge";
import styles from "./GateOutLive.module.css";

type LiveCommand = {
  id: string;
  correlationId: string;
  commandType: string;
  status: string;
  errorMessage: string | null;
  createdAt: string;
};

type LiveExit = {
  ticketNo: string;
  plateNumber: string;
  vehicleType: string;
  fee: number;
  paymentMethod: string | null;
  paymentReference: string | null;
  paidAt: string;
  receiptNo: string | null;
  exitDeviceCode: string | null;
};

type LiveData = {
  serverTime: string;
  device: {
    deviceCode: string;
    name: string;
    status: string;
    area: string | null;
    cameraUrl: string | null;
    cameraSnapshotUrl: string | null;
    capabilities: {
      health?: Record<string, string>;
      cameraDeviceCode?: string;
      printerDeviceCode?: string;
    };
  };
  online: boolean;
  lastHeartbeatSeconds: number | null;
  activeTickets: number;
  barrier: LiveCommand | null;
  commands: LiveCommand[];
  recentExits: LiveExit[];
};

const rupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);

const commandLabel: Record<string, string> = {
  barrier_open: "Barrier",
  camera_snapshot: "Kamera",
  printer_print: "Printer",
};

const statusLabel: Record<string, string> = {
  pending: "MENUNGGU",
  acknowledged: "DIPROSES",
  completed: "SELESAI",
  failed: "GAGAL",
};

const methodLabel: Record<string, string> = {
  cash: "Tunai",
  qris: "QRIS",
  card: "Kartu",
  member: "Member",
  override: "Override",
};

export function GateOutLive({ deviceCode }: { deviceCode: string }) {
  const [data, setData] = useState<LiveData | null>(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(Date.now());
  const [imageError, setImageError] = useState(false);

  const load = async () => {
    if (!deviceCode) {
      setData(null);
      return;
    }
    try {
      const response = await fetch(
        `/api/parking/gateOutLive?deviceCode=${encodeURIComponent(deviceCode)}`,
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Gagal memuat gate");
      setData(body);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat gate");
    }
  };

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 3000);
    return () => window.clearInterval(timer);
  }, [deviceCode]);

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 2000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setImageError(false);
  }, [deviceCode, data?.device.cameraSnapshotUrl, data?.device.cameraUrl]);

  const imageUrl = useMemo(() => {
    if (!data) return "";
    if (data.device.cameraSnapshotUrl) return data.device.cameraSnapshotUrl;
    const url = data.device.cameraUrl || "";
    if (
      /^https?:\/\//i.test(url) &&
      /(\.jpe?g|\.png|\.webp|\.gif|\.mjpe?g|snapshot)/i.test(url)
    ) {
      return url;
    }
    return "";
  }, [data]);

  const cameraSrc = imageUrl
    ? `${imageUrl}${imageUrl.includes("?") ? "&" : "?"}t=${tick}`
    : "";
  const opening = ["pending", "acknowledged"].includes(
    data?.barrier?.status || "",
  );
  const lastExit = data?.recentExits?.[0] || null;
  const latestCommands = useMemo(() => {
    const seen = new Set<string>();
    const rows: LiveCommand[] = [];
    for (const command of data?.commands || []) {
      if (seen.has(command.commandType)) continue;
      seen.add(command.commandType);
      rows.push(command);
    }
    return rows.slice(0, 3);
  }, [data]);

  if (!deviceCode) {
    return (
      <section className={styles.panel}>
        <div className={styles.empty}>
          <Camera size={20} />
          <span>Pilih gate keluar untuk menampilkan live view.</span>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <div>
          <div className={styles.kicker}>LIVE GATE OUT</div>
          <h3>{data?.device.name || deviceCode}</h3>
          <span className={styles.codeLine}>
            <code>{deviceCode}</code>
            {data?.device.area && <span>{data.device.area}</span>}
            {data?.device.capabilities?.cameraDeviceCode && (
              <span>Kamera {data.device.capabilities.cameraDeviceCode}</span>
            )}
          </span>
        </div>
        <div className={styles.statusBlock}>
          <Badge variant={data?.online ? "success" : "outline"}>
            <span className={data?.online ? styles.liveDot : styles.offlineDot} />
            {data?.online ? "ONLINE" : "OFFLINE"}
          </Badge>
          <span className={styles.heartbeat}>
            {data?.lastHeartbeatSeconds === null ||
            data?.lastHeartbeatSeconds === undefined
              ? "Belum heartbeat"
              : `Heartbeat ${data.lastHeartbeatSeconds} dtk lalu`}
          </span>
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.grid}>
        <div className={`${styles.camera} ${opening ? styles.opening : ""}`}>
          {imageUrl && !imageError ? (
            <img
              src={cameraSrc}
              alt={`Live view ${deviceCode}`}
              onError={() => setImageError(true)}
            />
          ) : (
            <div className={styles.gateVisual}>
              <div className={styles.scanLine} />
              <div className={styles.gateLabel}>
                <ScanLine size={14} /> GATE OUT
              </div>
              <div className={styles.lane}>
                <div className={styles.barrier}>
                  <div className={styles.barrierBase} />
                  <div className={styles.barrierArm} />
                </div>
                <div className={styles.road} />
              </div>
              <div className={styles.visualFooter}>
                {data?.device.cameraUrl ? (
                  <a
                    href={data.device.cameraUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink size={12} /> Buka feed kamera
                  </a>
                ) : (
                  <span>Kamera gate keluar belum dikonfigurasi</span>
                )}
              </div>
            </div>
          )}
          <div className={styles.cameraTop}>
            <span
              className={`${styles.liveBadge} ${
                data?.online ? "" : styles.offlineBadge
              }`}
            >
              <i /> {data?.online ? "LIVE" : "OFFLINE"}
            </span>
            <span>{new Date(tick).toLocaleTimeString("id-ID")}</span>
          </div>
          <div className={styles.cameraBottom}>
            {data?.online ? "Terhubung ke gate" : "Gate tidak mengirim heartbeat"}
          </div>
        </div>

        <div className={styles.side}>
          <div className={styles.lastExit}>
            <div className={styles.sideLabel}>KENDARAAN TERAKHIR KELUAR</div>
            {lastExit ? (
              <>
                <strong>{lastExit.plateNumber || "Tanpa plat"}</strong>
                <span>
                  {lastExit.ticketNo} · {lastExit.vehicleType}
                </span>
                <div className={styles.lastExitBottom}>
                  <em>{rupiah(lastExit.fee)}</em>
                  <small>
                    {new Date(lastExit.paidAt).toLocaleTimeString("id-ID")} ·{" "}
                    {methodLabel[lastExit.paymentMethod || ""] ||
                      lastExit.paymentMethod ||
                      "—"}
                  </small>
                </div>
              </>
            ) : (
              <span className={styles.muted}>
                Belum ada kendaraan keluar yang tercatat.
              </span>
            )}
          </div>

          <div className={styles.statsRow}>
            <div>
              <CarInside />
              <span>Di dalam</span>
              <strong>{data?.activeTickets ?? "—"}</strong>
            </div>
            <div>
              <Activity size={13} />
              <span>Barrier</span>
              <strong>{statusLabel[data?.barrier?.status || ""] || "SIAP"}</strong>
            </div>
            <div>
              <Camera size={13} />
              <span>Kamera</span>
              <strong>
                {data?.device.capabilities?.health?.camera?.toUpperCase() || "—"}
              </strong>
            </div>
          </div>

          <div className={styles.commands}>
            <div className={styles.sideLabel}>COMMAND TERAKHIR</div>
            {latestCommands.length ? (
              latestCommands.map((command) => (
                <div key={command.id} className={styles.commandRow}>
                  <span>{commandLabel[command.commandType] || command.commandType}</span>
                  <Badge
                    variant={
                      command.status === "completed"
                        ? "success"
                        : command.status === "failed"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {statusLabel[command.status] || command.status.toUpperCase()}
                  </Badge>
                </div>
              ))
            ) : (
              <span className={styles.muted}>Belum ada command.</span>
            )}
          </div>
        </div>
      </div>

      <div className={styles.recent}>
        <div className={styles.sideLabel}>RIWAYAT KELUAR TERAKHIR</div>
        <div className={styles.recentGrid}>
          {data?.recentExits?.slice(0, 4).map((exit) => (
            <div key={exit.ticketNo} className={styles.recentItem}>
              <strong>{exit.plateNumber || "Tanpa plat"}</strong>
              <span>
                {exit.ticketNo} · {rupiah(exit.fee)}
              </span>
              <small>
                {new Date(exit.paidAt).toLocaleTimeString("id-ID")}
                {exit.exitDeviceCode ? ` · ${exit.exitDeviceCode}` : " · manual"}
              </small>
            </div>
          ))}
          {!data?.recentExits?.length && (
            <span className={styles.muted}>Belum ada transaksi keluar.</span>
          )}
        </div>
      </div>

      <div className={styles.footer}>
        <Radio size={12} />
        <span>
          Live view diperbarui setiap 3 detik dari command queue gate keluar.
        </span>
      </div>
    </section>
  );
}

function CarInside() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 17H3v-5l2-5h14l2 5v5h-2" />
      <circle cx="7.5" cy="17.5" r="1.5" />
      <circle cx="16.5" cy="17.5" r="1.5" />
    </svg>
  );
}
