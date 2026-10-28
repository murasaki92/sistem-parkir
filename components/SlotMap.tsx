"use client";

import { useEffect, useState } from "react";
import { CarFront, RefreshCw } from "lucide-react";
import { Badge } from "./Badge";
import { Button } from "./Button";
import styles from "./SlotMap.module.css";

type Slot = {
  id: number;
  code: string;
  vehicleType: string;
  zone: string | null;
  occupied: boolean;
  ticketNo: string | null;
  plateNumber: string | null;
  entryAt: string | null;
};

type Summary = {
  total: number;
  occupied: number;
  available: number;
  byType: Record<
    string,
    { total: number; occupied: number; available: number }
  >;
};

export function SlotMap() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/parking/slots");
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Gagal memuat slot");
      setSlots(Array.isArray(body.slots) ? body.slots : []);
      setSummary(body.summary || null);
      setUpdatedAt(
        new Date().toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat slot");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 15000);
    return () => window.clearInterval(timer);
  }, []);

  const types = Array.from(new Set(slots.map((slot) => slot.vehicleType)));
  const typeLabel: Record<string, string> = {
    Mobil: "Zona Mobil",
    Motor: "Zona Motor",
  };

  return (
    <section className={styles.wrap}>
      <div className={styles.head}>
        <div>
          <h2>Peta slot parkir</h2>
          <p>
            Posisi slot terisi dan kosong. Slot terisi menampilkan tiket dan
            nomor plat kendaraan.
          </p>
        </div>
        <div className={styles.headActions}>
          {updatedAt && <span className={styles.updated}>Data {updatedAt}</span>}
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw size={14} /> Muat ulang
          </Button>
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.stats}>
        <div className={styles.stat}>
          <span>Total slot</span>
          <strong>{summary?.total ?? slots.length}</strong>
        </div>
        <div className={styles.stat}>
          <span>Terisi</span>
          <strong>{summary?.occupied ?? 0}</strong>
        </div>
        <div className={styles.stat}>
          <span>Tersedia</span>
          <strong>{summary?.available ?? 0}</strong>
        </div>
        {Object.entries(summary?.byType || {}).map(([type, value]) => (
          <div className={styles.stat} key={type}>
            <span>{type}</span>
            <strong>
              {value.occupied}/{value.total}
            </strong>
          </div>
        ))}
      </div>

      {types.map((type) => {
        const group = slots.filter((slot) => slot.vehicleType === type);
        return (
          <section className={styles.zone} key={type}>
            <div className={styles.zoneHead}>
              <div>
                <h3>{typeLabel[type] || type}</h3>
                <p>
                  {summary?.byType?.[type]?.occupied ?? 0} terisi ·{" "}
                  {summary?.byType?.[type]?.available ?? 0} tersedia
                </p>
              </div>
              <Badge variant="secondary">{group.length} slot</Badge>
            </div>
            <div className={styles.grid}>
              {group.map((slot) => (
                <div
                  key={slot.id}
                  className={`${styles.slot} ${
                    slot.occupied ? styles.occupied : ""
                  }`}
                  title={
                    slot.occupied
                      ? `${slot.ticketNo || ""} · ${slot.plateNumber || "tanpa plat"}`
                      : "Slot tersedia"
                  }
                >
                  <div className={styles.slotTop}>
                    <code>{slot.code}</code>
                    <CarFront size={13} />
                  </div>
                  {slot.occupied ? (
                    <>
                      <strong>{slot.plateNumber || "Tanpa plat"}</strong>
                      <small>{slot.ticketNo}</small>
                    </>
                  ) : (
                    <span className={styles.free}>Tersedia</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </section>
  );
}
