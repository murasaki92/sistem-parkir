"use client";

import { useEffect, useState } from "react";
import { Save, Settings2 } from "lucide-react";
import { Button } from "./Button";
import { Input } from "./Input";
import styles from "./SettingsManagement.module.css";

type TariffKey =
  | "carFirstHour"
  | "carNextHour"
  | "motorFirstHour"
  | "motorNextHour"
  | "graceMinutes"
  | "lostTicketFee";

const tariffFields: Array<{
  key: TariffKey;
  label: string;
  hint: string;
}> = [
  {
    key: "carFirstHour",
    label: "Mobil — jam pertama",
    hint: "Tarif minimum satu jam pertama.",
  },
  {
    key: "carNextHour",
    label: "Mobil — jam berikutnya",
    hint: "Ditambahkan untuk setiap jam setelah jam pertama.",
  },
  {
    key: "motorFirstHour",
    label: "Motor — jam pertama",
    hint: "Tarif minimum satu jam pertama.",
  },
  {
    key: "motorNextHour",
    label: "Motor — jam berikutnya",
    hint: "Ditambahkan untuk setiap jam setelah jam pertama.",
  },
  {
    key: "graceMinutes",
    label: "Grace period (menit)",
    hint: "Waktu toleransi sebelum pembulatan jam berikutnya.",
  },
  {
    key: "lostTicketFee",
    label: "Tiket hilang",
    hint: "Tarif flat saat tiket fisik/QR tidak ditemukan.",
  },
];

const rupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);

export function SettingsManagement() {
  const [tariffs, setTariffs] = useState<Record<TariffKey, string>>({
    carFirstHour: "5000",
    carNextHour: "3000",
    motorFirstHour: "2000",
    motorNextHour: "1500",
    graceMinutes: "10",
    lostTicketFee: "50000",
  });
  const [timezoneOffset, setTimezoneOffset] = useState("8");
  const [timezoneLabel, setTimezoneLabel] = useState("WITA");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/parking/settings");
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Gagal memuat pengaturan");
      const next: Record<string, string> = {};
      for (const field of tariffFields) {
        next[field.key] = String(body.tariffs?.[field.key] ?? 0);
      }
      setTariffs(next as Record<TariffKey, string>);
      setTimezoneOffset(String(body.site?.timezoneOffsetHours ?? 8));
      setTimezoneLabel(body.site?.timezoneLabel || "WITA");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat pengaturan");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const payload = {
        tariffs: Object.fromEntries(
          tariffFields.map((field) => [
            field.key,
            Number(tariffs[field.key] || 0),
          ]),
        ),
        site: {
          timezoneOffsetHours: Number(timezoneOffset),
          timezoneLabel,
        },
      };
      const response = await fetch("/api/parking/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Gagal menyimpan");
      setMessage("Pengaturan tarif dan zona waktu berhasil disimpan.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setBusy(false);
    }
  };

  const carTwoHours =
    Number(tariffs.carFirstHour || 0) + Number(tariffs.carNextHour || 0);
  const motorTwoHours =
    Number(tariffs.motorFirstHour || 0) + Number(tariffs.motorNextHour || 0);

  return (
    <section className={styles.wrap}>
      <div className={styles.head}>
        <div>
          <h2>Pengaturan tarif & laporan</h2>
          <p>
            Tarif berlaku untuk perhitungan berikutnya. Transaksi yang sudah
            dibayar tidak berubah.
          </p>
        </div>
        <Button onClick={save} disabled={busy || loading}>
          <Save size={16} />
          {busy ? "Menyimpan…" : "Simpan pengaturan"}
        </Button>
      </div>

      {message && <div className={styles.success}>{message}</div>}
      {error && <div className={styles.error}>{error}</div>}

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <Settings2 size={16} />
          <div>
            <h3>Tarif parkir</h3>
            <p>Nilai dalam Rupiah. Grace period dalam menit.</p>
          </div>
        </div>
        <div className={styles.grid}>
          {tariffFields.map((field) => (
            <label key={field.key}>
              {field.label}
              <Input
                inputMode="numeric"
                value={tariffs[field.key]}
                onChange={(event) =>
                  setTariffs({
                    ...tariffs,
                    [field.key]: event.target.value.replace(/[^0-9]/g, ""),
                  })
                }
                disabled={loading}
              />
              <small>{field.hint}</small>
            </label>
          ))}
        </div>
        <div className={styles.preview}>
          <span>
            Contoh 2 jam mobil: <strong>{rupiah(carTwoHours)}</strong>
          </span>
          <span>
            Contoh 2 jam motor: <strong>{rupiah(motorTwoHours)}</strong>
          </span>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <Settings2 size={16} />
          <div>
            <h3>Zona waktu operasional</h3>
            <p>
              Dipakai untuk batas hari laporan dan jadwal backup otomatis.
            </p>
          </div>
        </div>
        <div className={styles.timezone}>
          <label>
            Zona waktu
            <select
              value={timezoneOffset}
              onChange={(event) => {
                const value = event.target.value;
                setTimezoneOffset(value);
                setTimezoneLabel(
                  value === "7" ? "WIB" : value === "9" ? "WIT" : "WITA",
                );
              }}
              disabled={loading}
            >
              <option value="7">WIB (UTC+7)</option>
              <option value="8">WITA (UTC+8)</option>
              <option value="9">WIT (UTC+9)</option>
            </select>
          </label>
          <div className={styles.timezoneInfo}>
            <strong>{timezoneLabel || "WITA"}</strong>
            <span>
              UTC{Number(timezoneOffset) >= 0 ? "+" : ""}
              {timezoneOffset}
            </span>
          </div>
        </div>
      </section>

      <p className={styles.note}>
        Perubahan tarif dicatat di audit log. Pastikan supervisor dan kasir
        mengetahui tarif baru sebelum diterapkan.
      </p>
    </section>
  );
}
