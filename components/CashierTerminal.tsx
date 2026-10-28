"use client";

import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Banknote,
  Bike,
  Camera,
  Car,
  CheckCircle2,
  CreditCard,
  LogOut,
  ParkingSquare,
  Printer,
  QrCode,
  ScanLine,
  Truck,
  WalletCards,
  XCircle,
  ZoomIn,
} from "lucide-react";
import { useAuth } from "../helpers/useAuth";
import { Badge } from "./Badge";
import { Button } from "./Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./Dialog";
import { Input } from "./Input";
import styles from "./CashierTerminal.module.css";

const rupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);

const VEHICLE_CLASSES = [
  { value: "Motor", label: "Motor", shortcut: "F1", icon: Bike },
  { value: "Mobil", label: "Mobil", shortcut: "F2", icon: Car },
  { value: "Bus/Truk", label: "Bus/Truk", shortcut: "F3", icon: Truck },
] as const;

const PAYMENT_METHODS = [
  { value: "cash", label: "Tunai", hint: "T", icon: Banknote },
  { value: "qris", label: "QRIS", hint: "Q", icon: QrCode },
  { value: "card", label: "Kartu", hint: "K", icon: CreditCard },
] as const;

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

const vehicleLabel = (value: string) => {
  if (value === "Bus/Truk") return "Bus/Truk";
  return value;
};

export function CashierTerminal() {
  const router = useRouter();
  const { authState, logout } = useAuth();
  const user = authState.type === "authenticated" ? authState.user : null;
  const canAdmin = user?.role === "admin" || user?.role === "supervisor";

  const [ticketNo, setTicketNo] = useState("");
  const [quote, setQuote] = useState<any>(null);
  const [scanKind, setScanKind] = useState<"ticket" | "qr" | null>(null);
  const [plateInput, setPlateInput] = useState("");
  const [plateSaving, setPlateSaving] = useState(false);
  const [classBusy, setClassBusy] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentReference, setPaymentReference] = useState("");
  const [cashReceived, setCashReceived] = useState("");
  const [exitDeviceCode, setExitDeviceCode] = useState("__manual");
  const [receiptPrinterDeviceCode, setReceiptPrinterDeviceCode] =
    useState("__none");
  const [devices, setDevices] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<any>(null);
  const [commandStatus, setCommandStatus] = useState<any[]>([]);
  const [retryingCommand, setRetryingCommand] = useState<string | null>(null);
  const [shift, setShift] = useState<any>(null);
  const [shiftLoaded, setShiftLoaded] = useState(false);
  const [shiftError, setShiftError] = useState("");
  const [shiftOpenDialog, setShiftOpenDialog] = useState(false);
  const [shiftCloseDialog, setShiftCloseDialog] = useState(false);
  const [commandDialog, setCommandDialog] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [openingCash, setOpeningCash] = useState("");
  const [closingCash, setClosingCash] = useState("");
  const [closingNotes, setClosingNotes] = useState("");
  const [clock, setClock] = useState("");
  const [dateLabel, setDateLabel] = useState("");
  const [gateLive, setGateLive] = useState<any>(null);
  const [snapshotTick, setSnapshotTick] = useState(Date.now());
  const [liveImageError, setLiveImageError] = useState(false);
  const [entryImageError, setEntryImageError] = useState(false);
  const monitorTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadShift = async () => {
    setShiftError("");
    try {
      const r = await fetch("/api/parking/cashierShift");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Gagal memuat shift");
      setShift(j.current);
    } catch (e) {
      setShiftError(
        e instanceof Error ? e.message : "Gagal memuat shift kasir",
      );
    } finally {
      setShiftLoaded(true);
    }
  };

  useEffect(() => {
    fetch("/api/parking/devices")
      .then((r) => r.json())
      .then((j) => {
        const list = Array.isArray(j) ? j : [];
        setDevices(list);
        const firstGate = list.find(
          (device: any) =>
            device.status === "active" &&
            device.deviceType === "gate" &&
            device.gateDirection === "out",
        );
        const linkedPrinterCode = firstGate?.capabilities?.printerDeviceCode;
        const firstPrinter =
          list.find(
            (device: any) =>
              device.status === "active" &&
              device.deviceType === "printer" &&
              device.deviceCode === linkedPrinterCode,
          ) ||
          list.find(
            (device: any) =>
              device.status === "active" &&
              device.deviceType === "printer" &&
              /OUT/i.test(device.deviceCode),
          ) ||
          list.find(
            (device: any) =>
              device.status === "active" && device.deviceType === "printer",
          );
        if (firstGate) {
          setExitDeviceCode((current) =>
            current === "__manual" ? firstGate.deviceCode : current,
          );
        }
        if (firstPrinter) {
          setReceiptPrinterDeviceCode((current) =>
            current === "__none" ? firstPrinter.deviceCode : current,
          );
        }
      })
      .catch(() => setDevices([]));
    loadShift();

    const tick = () => {
      const now = new Date();
      setClock(
        now.toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      );
      setDateLabel(
        now.toLocaleDateString("id-ID", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }),
      );
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const gates = devices.filter(
    (d) =>
      d.status === "active" &&
      d.deviceType === "gate" &&
      d.gateDirection === "out",
  );
  const printers = devices.filter(
    (d) => d.status === "active" && d.deviceType === "printer",
  );
  const selectedGate = gates.find((d) => d.deviceCode === exitDeviceCode);
  const liveGateCode = selectedGate?.deviceCode || gates[0]?.deviceCode || "";

  useEffect(() => {
    if (!liveGateCode) {
      setGateLive(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(
          `/api/parking/gateOutLive?deviceCode=${encodeURIComponent(
            liveGateCode,
          )}`,
        );
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Gagal memuat gate");
        if (!cancelled) setGateLive(j);
      } catch {
        if (!cancelled) setGateLive(null);
      }
    };
    load();
    const timer = window.setInterval(load, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [liveGateCode]);

  useEffect(() => {
    const timer = window.setInterval(
      () => setSnapshotTick(Date.now()),
      2000,
    );
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setLiveImageError(false);
  }, [gateLive?.device?.cameraSnapshotUrl, gateLive?.device?.cameraUrl]);

  useEffect(() => {
    setEntryImageError(false);
  }, [quote?.entryCameraSnapshotUrl, quote?.entryCameraUrl]);

  const openShift = async () => {
    try {
      setShiftError("");
      const amount = Math.floor(Number(openingCash));
      const r = await fetch("/api/parking/cashierShiftOpen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openingCash: amount }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Gagal membuka shift");
      setOpeningCash("");
      setShift(j);
      setShiftOpenDialog(false);
    } catch (e) {
      setShiftError(e instanceof Error ? e.message : "Gagal membuka shift");
    }
  };

  const closeShift = async () => {
    try {
      setShiftError("");
      const amount = Math.floor(Number(closingCash));
      const r = await fetch("/api/parking/cashierShiftClose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ closingCash: amount, notes: closingNotes }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Gagal menutup shift");
      setClosingCash("");
      setClosingNotes("");
      setShift(null);
      setShiftCloseDialog(false);
    } catch (e) {
      setShiftError(e instanceof Error ? e.message : "Gagal menutup shift");
    }
  };

  const normalizeScan = (value: string) => value.trim().toUpperCase();

  const lookup = async (code?: string) => {
    const normalized = normalizeScan(code ?? ticketNo);
    if (!normalized) return;
    setBusy(true);
    setError("");
    setReceipt(null);
    try {
      const r = await fetch("/api/parking/exit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketNo: normalized }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Tiket tidak ditemukan");
      setQuote(j);
      setPlateInput(String(j.plateNumber || ""));
      setCashReceived(String(Number(j.fee || 0)));
      setScanKind(normalized.startsWith("PKR1.") ? "qr" : "ticket");
    } catch (e) {
      setQuote(null);
      setError(e instanceof Error ? e.message : "Gagal menghitung tagihan");
    } finally {
      setBusy(false);
    }
  };

  const savePlate = async () => {
    if (!quote || !plateInput.trim()) return;
    setPlateSaving(true);
    setError("");
    try {
      const r = await fetch("/api/parking/plateUpdate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketNo: quote.ticketNo,
          plateNumber: plateInput,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Gagal menyimpan plat");
      const q = await fetch("/api/parking/exit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketNo: quote.ticketNo }),
      });
      const next = await q.json();
      if (!q.ok) throw new Error(next.error || "Gagal menghitung ulang tagihan");
      setQuote(next);
      setPlateInput(String(next.plateNumber || ""));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan plat");
    } finally {
      setPlateSaving(false);
    }
  };

  const changeVehicleClass = async (vehicleType: string) => {
    if (!quote || classBusy || quote.vehicleType === vehicleType) return;
    setClassBusy(true);
    setError("");
    try {
      const r = await fetch("/api/parking/vehicleClass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketNo: quote.ticketNo, vehicleType }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Gagal mengubah kelas kendaraan");
      setQuote({ ...quote, ...j });
      setCashReceived((current) =>
        !current || Number(current) === Number(quote.fee)
          ? String(Number(j.fee || 0))
          : current,
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Gagal mengubah kelas kendaraan",
      );
    } finally {
      setClassBusy(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "F4") {
        event.preventDefault();
        setZoomOpen(true);
        return;
      }
      if (!quote || classBusy || shiftOpenDialog || shiftCloseDialog) return;
      const activeElement = document.activeElement as HTMLElement | null;
      const tag = (activeElement?.tagName || "").toUpperCase();
      const numericInput =
        activeElement instanceof HTMLInputElement &&
        activeElement.inputMode === "numeric";
      const typing =
        !numericInput &&
        (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT");
      const next: Record<string, string> = {
        F1: "Motor",
        F2: "Mobil",
        F3: "Bus/Truk",
      };
      const vehicleType = next[event.key];
      if (vehicleType) {
        event.preventDefault();
        changeVehicleClass(vehicleType);
        return;
      }
      if (!typing) {
        const method = { t: "cash", q: "qris", k: "card" }[
          event.key.toLowerCase()
        ];
        if (method) {
          event.preventDefault();
          setPaymentMethod(method);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [quote, classBusy, shiftOpenDialog, shiftCloseDialog]);

  const pay = async () => {
    if (!quote) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/parking/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketNo: quote.ticketNo,
          paymentMethod,
          paymentReference: paymentReference.trim() || undefined,
          exitDeviceCode:
            exitDeviceCode === "__manual" ? undefined : exitDeviceCode,
          receiptPrinterDeviceCode:
            receiptPrinterDeviceCode === "__none"
              ? undefined
              : receiptPrinterDeviceCode,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Pembayaran gagal");
      setReceipt(j);
      setQuote(null);
      setTicketNo("");
      setPaymentReference("");
      setCashReceived("");
      await loadShift();
      if (
        exitDeviceCode !== "__manual" ||
        receiptPrinterDeviceCode !== "__none"
      ) {
        const monitorTicket = String(j.ticketNo || "").toUpperCase();
        const loadStatus = async () => {
          try {
            const s = await fetch(
              `/api/parking/commandStatus?ticketNo=${encodeURIComponent(
                monitorTicket,
              )}`,
            );
            const d = await s.json();
            if (s.ok) setCommandStatus(d.commands || []);
          } catch {
            /* keep the previous status */
          }
        };
        await loadStatus();
        if (monitorTimer.current) clearInterval(monitorTimer.current);
        monitorTimer.current = setInterval(loadStatus, 1500);
        window.setTimeout(() => {
          if (monitorTimer.current) {
            clearInterval(monitorTimer.current);
            monitorTimer.current = null;
          }
        }, 30000);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pembayaran gagal");
    } finally {
      setBusy(false);
    }
  };

  const retryCommand = async (correlationId: string) => {
    setRetryingCommand(correlationId);
    setError("");
    try {
      const r = await fetch("/api/parking/commandRetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correlationId }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Retry perangkat gagal");
      setCommandStatus((prev) =>
        prev.map((c) =>
          c.correlationId === correlationId
            ? { ...c, status: "pending", errorMessage: null }
            : c,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Retry perangkat gagal");
    } finally {
      setRetryingCommand(null);
    }
  };

  useEffect(
    () => () => {
      if (monitorTimer.current) clearInterval(monitorTimer.current);
    },
    [],
  );

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  const entryImageUrl = useMemo(() => {
    if (!quote) return "";
    if (quote.entryCameraSnapshotUrl) return quote.entryCameraSnapshotUrl;
    const url = quote.entryCameraUrl || "";
    return /^https?:\/\//i.test(url) &&
      /(\.jpe?g|\.png|\.webp|\.gif|\.mjpe?g|snapshot)/i.test(url)
      ? url
      : "";
  }, [quote]);

  const liveImageUrl = useMemo(() => {
    if (!gateLive) return "";
    if (gateLive.device?.cameraSnapshotUrl) {
      return gateLive.device.cameraSnapshotUrl;
    }
    const url = gateLive.device?.cameraUrl || "";
    return /^https?:\/\//i.test(url) &&
      /(\.jpe?g|\.png|\.webp|\.gif|\.mjpe?g|snapshot)/i.test(url)
      ? url
      : "";
  }, [gateLive]);

  const entrySrc = entryImageUrl
    ? `${entryImageUrl}${entryImageUrl.includes("?") ? "&" : "?"}t=${snapshotTick}`
    : "";
  const liveSrc = liveImageUrl
    ? `${liveImageUrl}${liveImageUrl.includes("?") ? "&" : "?"}t=${snapshotTick}`
    : "";

  const fee = Number(quote?.fee || 0);
  const cashPaid = Number(String(cashReceived).replace(/[^0-9]/g, "")) || 0;
  const change = cashPaid - fee;
  const methodLabel =
    PAYMENT_METHODS.find((method) => method.value === paymentMethod)?.label ||
    "Tunai";
  const canPay =
    Boolean(quote) &&
    Boolean(shift) &&
    !busy &&
    (paymentMethod !== "cash" || cashPaid >= fee);
  const recentExits = gateLive?.recentExits || [];
  const barrierLabel =
    statusLabel[gateLive?.barrier?.status || ""] || "SIAP";
  const VehicleIcon =
    quote?.vehicleType === "Motor"
      ? Bike
      : quote?.vehicleType === "Bus/Truk"
        ? Truck
        : Car;
  const commandRows = ["barrier_open", "camera_snapshot", "printer_print"]
    .map((type) => commandStatus.find((command) => command.commandType === type))
    .filter(Boolean);

  return (
    <div className={styles.terminal}>
      <header className={styles.topbar}>
        <Link href="/cashier" className={styles.brand}>
          <span className={styles.brandIcon}>
            <ParkingSquare size={21} />
          </span>
          <span>
            <strong>PARKLINE</strong>
            <small>SMART PARKING POS</small>
          </span>
        </Link>

        <div className={styles.headTitle}>
          <span>POS KASIR PARKIR</span>
          <select
            className={styles.gateSelect}
            value={exitDeviceCode}
            onChange={(event) => setExitDeviceCode(event.target.value)}
            aria-label="Pilih gate keluar"
          >
            {gates.map((gate) => (
              <option key={gate.deviceCode} value={gate.deviceCode}>
                {gate.name}
              </option>
            ))}
            {!gates.length && <option value="__manual">Tidak ada gate</option>}
          </select>
        </div>

        <div className={styles.operator}>
          <span>
            {dateLabel} | <b>{clock}</b> | Operator:{" "}
            <b>{user?.displayName || "—"}</b>
          </span>
          <div className={styles.operatorActions}>
            {canAdmin && (
              <Link href="/admin" className={styles.adminLink}>
                Admin
              </Link>
            )}
            <button
              type="button"
              className={styles.logoutButton}
              onClick={handleLogout}
              title="Keluar"
              aria-label="Keluar"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </header>

      <div className={styles.shiftStrip}>
        <Badge variant={shift ? "success" : "outline"}>
          {shift
            ? "SHIFT AKTIF"
            : shiftLoaded
              ? "SHIFT BELUM DIBUKA"
              : "MEMUAT SHIFT…"}
        </Badge>
        <span className={styles.shiftInfo}>
          {shift
            ? `Kas awal ${rupiah(
                Number(shift.openingCash || 0),
              )} · Kas diharapkan ${rupiah(
                Number(shift.expectedCash || 0),
              )} · Dibuka ${new Date(shift.openedAt).toLocaleTimeString(
                "id-ID",
                { hour: "2-digit", minute: "2-digit" },
              )}`
            : shiftLoaded
              ? "Buka shift sebelum menerima pembayaran."
              : "Menghubungi server…"}
        </span>
        {shiftError && <span className={styles.shiftError}>{shiftError}</span>}
        {shift ? (
          <button
            type="button"
            className={styles.shiftButton}
            onClick={() => setShiftCloseDialog(true)}
          >
            Tutup shift
          </button>
        ) : (
          <button
            type="button"
            className={styles.shiftButton}
            onClick={() => setShiftOpenDialog(true)}
            disabled={!shiftLoaded}
          >
            <WalletCards size={13} /> Buka shift
          </button>
        )}
      </div>

      <div className={styles.main}>
        <div className={styles.left}>
          <section className={styles.section}>
            <div className={styles.sectionTitle}>
              <span>INPUT TRANSAKSI</span>
              <small>Scan / plat / kelas</small>
            </div>
            <div className={styles.card}>
              <div className={styles.inputs}>
                <label>
                  Scan Tiket / Barcode (Automatic)
                  <div className={styles.inputWithButton}>
                    <Input
                      autoFocus
                      value={ticketNo}
                      onChange={(event) => setTicketNo(event.target.value)}
                      onKeyDown={(event) =>
                        event.key === "Enter" && lookup()
                      }
                      placeholder="PKR-YYYYMMDD-XXXX atau PKR1.…"
                      aria-label="Nomor atau token tiket"
                    />
                    <button
                      type="button"
                      className={styles.lookupButton}
                      onClick={() => lookup()}
                      disabled={busy || !ticketNo.trim()}
                    >
                      <ArrowRight size={16} />
                      Hitung
                    </button>
                  </div>
                </label>
                <label>
                  Plat Nomor (Manual)
                  <div className={styles.inputWithButton}>
                    <Input
                      value={plateInput}
                      onChange={(event) =>
                        setPlateInput(event.target.value.toUpperCase())
                      }
                      placeholder="DD 1234 XX"
                      aria-label="Nomor plat"
                    />
                    <button
                      type="button"
                      className={styles.savePlateButton}
                      onClick={savePlate}
                      disabled={!quote || plateSaving || !plateInput.trim()}
                      title="Simpan nomor plat"
                    >
                      <CheckCircle2 size={15} />
                      {plateSaving ? "…" : "Simpan"}
                    </button>
                  </div>
                </label>
              </div>

              <div className={styles.classCards}>
                {VEHICLE_CLASSES.map((vehicle) => {
                  const Icon = vehicle.icon;
                  return (
                    <button
                      key={vehicle.value}
                      type="button"
                      className={`${styles.classCard} ${
                        quote?.vehicleType === vehicle.value
                          ? styles.classActive
                          : ""
                      }`}
                      onClick={() => changeVehicleClass(vehicle.value)}
                      disabled={!quote || classBusy}
                      aria-pressed={quote?.vehicleType === vehicle.value}
                    >
                      <Icon size={22} />
                      <strong>{vehicle.label}</strong>
                      <kbd>{vehicle.shortcut}</kbd>
                    </button>
                  );
                })}
              </div>

              <div className={styles.inputFeedback}>
                {scanKind && quote ? (
                  <span className={styles.verified}>
                    <CheckCircle2 size={13} />
                    {scanKind === "qr"
                      ? "QR tiket berhasil dipindai."
                      : "Tiket berhasil diverifikasi."}
                  </span>
                ) : (
                  <span className={styles.muted}>
                    Scan barcode atau ketik nomor tiket, lalu tekan Enter.
                  </span>
                )}
                {quote?.membership && (
                  <span className={styles.memberPill}>
                    MEMBER · {quote.membership.planName}
                  </span>
                )}
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionTitle}>
              <span>VERIFIKASI VISUAL</span>
              <small>{selectedGate?.name || "Gate keluar"}</small>
            </div>
            <div className={styles.visualGrid}>
              <div className={styles.visualCard}>
                <div className={styles.visualTitle}>FOTO KEDATANGAN</div>
                <div className={styles.photo}>
                  {entryImageUrl && !entryImageError ? (
                    <img
                      src={entrySrc}
                      alt="Foto kendaraan masuk"
                      onError={() => setEntryImageError(true)}
                    />
                  ) : (
                    <div className={styles.photoFallback}>
                      <VehicleIcon size={46} />
                      <strong>{quote?.plateNumber || "Belum ada tiket"}</strong>
                      <span>Foto masuk belum tersedia</span>
                    </div>
                  )}
                </div>
                <div className={styles.visualStatus}>
                  {quote?.entryAt
                    ? `◷ ${new Date(quote.entryAt).toLocaleTimeString("id-ID")}`
                    : "◷ —"}
                </div>
              </div>

              <div className={styles.visualCard}>
                <div className={styles.visualTitle}>KAMERA KELUAR (LIVE)</div>
                <div className={styles.photo}>
                  {liveImageUrl && !liveImageError ? (
                    <img
                      src={liveSrc}
                      alt="Kamera gate keluar"
                      onError={() => setLiveImageError(true)}
                    />
                  ) : (
                    <div className={styles.photoFallback}>
                      <ScanLine size={46} />
                      <strong>{liveGateCode || "Gate keluar"}</strong>
                      <span>Kamera belum tersedia</span>
                    </div>
                  )}
                  <span
                    className={`${styles.liveBadge} ${
                      gateLive?.online ? "" : styles.offlineBadge
                    }`}
                  >
                    ● {gateLive?.online ? "LIVE" : "OFFLINE"}
                  </span>
                </div>
                <div
                  className={`${styles.visualStatus} ${
                    gateLive?.online ? styles.onlineStatus : ""
                  }`}
                >
                  ●{" "}
                  {gateLive?.online
                    ? "Kamera terhubung"
                    : "Gate belum mengirim heartbeat"}
                </div>
              </div>
            </div>
            <button
              type="button"
              className={styles.zoomButton}
              onClick={() => setZoomOpen(true)}
            >
              <ZoomIn size={15} /> PERBESAR FOTO <kbd>F4</kbd>
            </button>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionTitle}>
              <span>TRANSAKSI TERAKHIR</span>
              <small>
                {Math.min(3, recentExits.length)} dari {recentExits.length}{" "}
                transaksi
              </small>
            </div>
            <div className={`${styles.card} ${styles.historyCard}`}>
              {recentExits.slice(0, 3).map((exit: any) => (
                <div className={styles.historyRow} key={exit.ticketNo}>
                  <span>
                    {new Date(exit.paidAt).toLocaleTimeString("id-ID", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <b>
                    {exit.plateNumber || "Tanpa plat"} ·{" "}
                    {vehicleLabel(exit.vehicleType)}
                  </b>
                  <b>{rupiah(Number(exit.fee))}</b>
                </div>
              ))}
              {!recentExits.length && (
                <div className={styles.historyEmpty}>
                  Belum ada transaksi keluar.
                </div>
              )}
            </div>
          </section>
        </div>

        <div className={styles.right}>
          <div className={styles.sectionTitle}>
            <span>RINCIAN PEMBAYARAN</span>
            <small>Verifikasi tagihan</small>
          </div>
          <div className={`${styles.card} ${styles.paymentCard}`}>
            <div className={styles.detailRows}>
              <div>
                <span>Plat Nomor</span>
                <b>{quote?.plateNumber || "—"}</b>
              </div>
              <div>
                <span>Jenis</span>
                <b>{quote?.vehicleType || "—"}</b>
              </div>
              <div>
                <span>Waktu Masuk</span>
                <b>
                  {quote?.entryAt
                    ? new Date(quote.entryAt).toLocaleTimeString("id-ID")
                    : "—"}
                </b>
              </div>
              <div>
                <span>Waktu Keluar</span>
                <b>{quote ? clock : "—"}</b>
              </div>
              <div>
                <span>Durasi</span>
                <b>{quote ? `${quote.hours} Jam` : "—"}</b>
              </div>
              {quote?.membership && (
                <div>
                  <span>Member</span>
                  <b>{quote.membership.planName}</b>
                </div>
              )}
            </div>

            <div className={styles.totalBox}>
              TOTAL TARIF: <strong>{quote ? rupiah(fee) : "—"}</strong>
            </div>

            <div className={styles.methodTitle}>METODE BAYAR</div>
            <div className={styles.methodCards}>
              {PAYMENT_METHODS.map((method) => {
                const Icon = method.icon;
                return (
                  <button
                    key={method.value}
                    type="button"
                    className={`${styles.methodCard} ${
                      paymentMethod === method.value
                        ? styles.methodActive
                        : ""
                    }`}
                    onClick={() => setPaymentMethod(method.value)}
                    disabled={!quote}
                  >
                    <Icon size={22} />
                    <strong>{method.label}</strong>
                    <kbd>{method.hint}</kbd>
                  </button>
                );
              })}
            </div>

            {paymentMethod !== "cash" && (
              <label className={styles.referenceField}>
                No. referensi {methodLabel} (opsional)
                <Input
                  value={paymentReference}
                  onChange={(event) =>
                    setPaymentReference(event.target.value)
                  }
                  placeholder="Contoh: TRX-2026-000123"
                  maxLength={120}
                />
              </label>
            )}

            {paymentMethod === "cash" && (
              <div className={styles.cashRow}>
                <label>
                  Bayar: Rp
                  <input
                    inputMode="numeric"
                    value={
                      cashReceived
                        ? Number(cashReceived).toLocaleString("id-ID")
                        : ""
                    }
                    onChange={(event) =>
                      setCashReceived(
                        event.target.value.replace(/[^0-9]/g, ""),
                      )
                    }
                    onFocus={(event) => event.currentTarget.select()}
                    placeholder="0"
                  />
                </label>
                <span>
                  Kembali:{" "}
                  <b className={change < 0 ? styles.changeNegative : ""}>
                    {quote
                      ? change >= 0
                        ? rupiah(change)
                        : `Kurang ${rupiah(Math.abs(change))}`
                      : "—"}
                  </b>
                </span>
              </div>
            )}

            <div className={styles.selectRow}>
              <label>
                Gate Out
                <select
                  value={exitDeviceCode}
                  onChange={(event) =>
                    setExitDeviceCode(event.target.value)
                  }
                >
                  <option value="__manual">Manual — tanpa barrier</option>
                  {gates.map((gate) => (
                    <option key={gate.deviceCode} value={gate.deviceCode}>
                      {gate.deviceCode} · {gate.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Printer struk
                <select
                  value={receiptPrinterDeviceCode}
                  onChange={(event) =>
                    setReceiptPrinterDeviceCode(event.target.value)
                  }
                >
                  <option value="__none">Tidak mencetak</option>
                  {printers.map((printer) => (
                    <option key={printer.deviceCode} value={printer.deviceCode}>
                      {printer.deviceCode} · {printer.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button
              type="button"
              className={styles.payButton}
              onClick={pay}
              disabled={!canPay}
            >
              <Printer size={19} />
              {busy ? "MEMPROSES…" : "CETAK STRUK & BUKA GERBANG"}
            </button>

            <div className={styles.statusLine}>
              {error ? (
                <span className={styles.statusError}>
                  <XCircle size={13} /> {error}
                </span>
              ) : (
                <span>
                  {quote
                    ? paymentMethod === "cash" && cashPaid < fee
                      ? `Uang tunai kurang ${rupiah(fee - cashPaid)}`
                      : `Siap diproses · Metode: ${methodLabel}`
                    : "Scan tiket untuk memulai transaksi"}
                </span>
              )}
            </div>

            {commandRows.length > 0 && (
              <div className={styles.deviceStrip}>
                {commandRows.map((command: any) => (
                  <span key={command.commandType}>
                    <i
                      className={
                        command.status === "completed"
                          ? styles.dotOk
                          : command.status === "failed"
                            ? styles.dotFail
                            : styles.dotPending
                      }
                    />
                    {commandLabel[command.commandType] || command.commandType}:{" "}
                    {statusLabel[command.status] || command.status}
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => setCommandDialog(true)}
                >
                  Detail
                </button>
              </div>
            )}

            <div className={styles.shortcuts}>
              <button type="button" onClick={() => changeVehicleClass("Motor")}>
                F1 · Motor
              </button>
              <button type="button" onClick={() => changeVehicleClass("Mobil")}>
                F2 · Mobil
              </button>
              <button
                type="button"
                onClick={() => changeVehicleClass("Bus/Truk")}
              >
                F3 · Bus/Truk
              </button>
              <button type="button" onClick={() => lookup()}>
                ENTER · Cari
              </button>
            </div>
          </div>

          <div className={styles.footer}>
            <span>
              <i
                className={
                  gateLive?.online ? styles.dotOk : styles.dotPending
                }
              />
              Sistem {gateLive?.online ? "Online" : "Offline"}
            </span>
            <span>{liveGateCode || "GATE OUT"}</span>
            <span>Barrier {barrierLabel}</span>
          </div>
        </div>
      </div>

      <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verifikasi visual</DialogTitle>
            <DialogDescription>
              Foto kendaraan masuk dan kamera gate keluar.
            </DialogDescription>
          </DialogHeader>
          <div className={styles.zoomGrid}>
            <div className={styles.zoomCard}>
              <strong>FOTO KEDATANGAN</strong>
              {entryImageUrl && !entryImageError ? (
                <img src={entrySrc} alt="Foto kendaraan masuk" />
              ) : (
                <div className={styles.zoomFallback}>
                  <VehicleIcon size={46} />
                  <span>{quote?.plateNumber || "Belum ada tiket"}</span>
                </div>
              )}
            </div>
            <div className={styles.zoomCard}>
              <strong>KAMERA KELUAR (LIVE)</strong>
              {liveImageUrl && !liveImageError ? (
                <img src={liveSrc} alt="Kamera gate keluar" />
              ) : (
                <div className={styles.zoomFallback}>
                  <Camera size={46} />
                  <span>Kamera belum tersedia</span>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setZoomOpen(false)}>
              Tutup
            </Button>
            {gateLive?.device?.cameraUrl && (
              <Button
                onClick={() =>
                  window.open(gateLive.device.cameraUrl, "_blank", "noopener")
                }
              >
                Buka feed
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!receipt} onOpenChange={(open) => !open && setReceipt(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pembayaran berhasil</DialogTitle>
            <DialogDescription>
              Kendaraan dapat keluar. Periksa status perangkat jika barrier
              tidak terbuka.
            </DialogDescription>
          </DialogHeader>
          {receipt && (
            <div className={styles.receiptSummary}>
              <div>
                <span>Tiket</span>
                <strong>{receipt.ticketNo}</strong>
              </div>
              <div>
                <span>Receipt</span>
                <strong>{receipt.receiptNo}</strong>
              </div>
              {receipt.paymentReference && (
                <div>
                  <span>Referensi</span>
                  <strong>{receipt.paymentReference}</strong>
                </div>
              )}
              <div className={styles.receiptTotal}>
                <span>Total dibayar</span>
                <strong>{rupiah(Number(receipt.fee || 0))}</strong>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceipt(null)}>
              Tutup
            </Button>
            <Button onClick={() => window.print()}>
              <Printer size={16} /> Cetak struk
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={commandDialog} onOpenChange={setCommandDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Status perangkat</DialogTitle>
            <DialogDescription>
              Perintah gate keluar untuk transaksi terakhir.
            </DialogDescription>
          </DialogHeader>
          <div className={styles.commandList}>
            {commandStatus.map((command: any) => (
              <div className={styles.commandRow} key={command.correlationId}>
                <strong>
                  {commandLabel[command.commandType] || command.commandType}
                </strong>
                <span
                  className={
                    command.status === "completed"
                      ? styles.commandOk
                      : command.status === "failed"
                        ? styles.commandFail
                        : styles.commandPending
                  }
                >
                  {statusLabel[command.status] || command.status}
                </span>
                {command.status === "failed" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => retryCommand(command.correlationId)}
                    disabled={retryingCommand === command.correlationId}
                  >
                    {retryingCommand === command.correlationId
                      ? "Mengulang…"
                      : "Ulangi"}
                  </Button>
                )}
                {command.errorMessage && <small>{command.errorMessage}</small>}
              </div>
            ))}
            {!commandStatus.length && (
              <span className={styles.muted}>Belum ada command.</span>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCommandDialog(false)}>
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={shiftOpenDialog} onOpenChange={setShiftOpenDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Buka shift kasir</DialogTitle>
            <DialogDescription>
              Masukkan uang tunai awal yang benar-benar ada di laci kasir.
            </DialogDescription>
          </DialogHeader>
          <label className={styles.dialogField}>
            Saldo awal (Rp)
            <Input
              inputMode="numeric"
              value={openingCash}
              onChange={(event) =>
                setOpeningCash(event.target.value.replace(/[^0-9]/g, ""))
              }
              placeholder="0"
            />
          </label>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShiftOpenDialog(false)}
            >
              Batal
            </Button>
            <Button onClick={openShift} disabled={!openingCash.trim()}>
              Mulai shift
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={shiftCloseDialog} onOpenChange={setShiftCloseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tutup shift kasir</DialogTitle>
            <DialogDescription>
              Expected cash saat ini{" "}
              {rupiah(Number(shift?.expectedCash || 0))}. Masukkan uang tunai
              hasil hitung fisik.
            </DialogDescription>
          </DialogHeader>
          <label className={styles.dialogField}>
            Saldo akhir fisik (Rp)
            <Input
              inputMode="numeric"
              value={closingCash}
              onChange={(event) =>
                setClosingCash(event.target.value.replace(/[^0-9]/g, ""))
              }
              placeholder="0"
            />
          </label>
          <label className={styles.dialogField}>
            Catatan selisih (opsional)
            <Input
              value={closingNotes}
              onChange={(event) => setClosingNotes(event.target.value)}
              placeholder="Contoh: selisih karena pengembalian tunai"
            />
          </label>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShiftCloseDialog(false)}
            >
              Batal
            </Button>
            <Button onClick={closeShift} disabled={!closingCash.trim()}>
              Tutup shift
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
