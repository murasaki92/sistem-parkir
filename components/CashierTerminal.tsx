"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Banknote,
  CheckCircle2,
  CreditCard,
  Printer,
  QrCode,
  ScanLine,
  XCircle,
  WalletCards,
} from "lucide-react";
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
import { GateOutLive } from "./GateOutLive";
import { Input } from "./Input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./Select";
import styles from "./CashierTerminal.module.css";

const rupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);

const VEHICLE_CLASSES = [
  { value: "Motor", label: "Motor", shortcut: "F1" },
  { value: "Mobil", label: "Mobil", shortcut: "F2" },
  { value: "Bus/Truk", label: "Bus/Truk", shortcut: "F3" },
] as const;

const commandLabel: Record<string, string> = {
  barrier_open: "Barrier",
  camera_snapshot: "Kamera",
  printer_print: "Printer",
};

export function CashierTerminal() {
  const [ticketNo, setTicketNo] = useState("");
  const [quote, setQuote] = useState<any>(null);
  const [scanKind, setScanKind] = useState<"ticket" | "qr" | null>(null);
  const [plateInput, setPlateInput] = useState("");
  const [plateSaving, setPlateSaving] = useState(false);
  const [classBusy, setClassBusy] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentReference, setPaymentReference] = useState("");
  const [exitDeviceCode, setExitDeviceCode] = useState("__manual");
  const [receiptPrinterDeviceCode, setReceiptPrinterDeviceCode] =
    useState("__none");
  const [devices, setDevices] = useState<any[]>([]);
  const [activeTickets, setActiveTickets] = useState<any[]>([]);
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
  const [openingCash, setOpeningCash] = useState("");
  const [closingCash, setClosingCash] = useState("");
  const [closingNotes, setClosingNotes] = useState("");
  const [clock, setClock] = useState("");
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
        if (firstGate) {
          setExitDeviceCode((current) =>
            current === "__manual" ? firstGate.deviceCode : current,
          );
        }
      })
      .catch(() => setDevices([]));
    loadShift();
    const loadActiveTickets = () => {
      fetch("/api/parking/activeTickets")
        .then((r) => r.json())
        .then((j) => setActiveTickets(Array.isArray(j) ? j.slice(0, 5) : []))
        .catch(() => setActiveTickets([]));
    };
    loadActiveTickets();
    const activeTimer = window.setInterval(loadActiveTickets, 20000);
    const timer = window.setInterval(
      () =>
        setClock(
          new Date().toLocaleTimeString("id-ID", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
        ),
      1000,
    );
    setClock(
      new Date().toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
    );
    return () => {
      window.clearInterval(activeTimer);
      window.clearInterval(timer);
    };
  }, []);

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
    setQuote(null);
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
      setScanKind(normalized.startsWith("PKR1.") ? "qr" : "ticket");
    } catch (e) {
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
      setQuote(j);
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
      if (!quote || classBusy || shiftOpenDialog || shiftCloseDialog) return;
      const next: Record<string, string> = {
        F1: "Motor",
        F2: "Mobil",
        F3: "Bus/Truk",
      };
      const vehicleType = next[event.key];
      if (!vehicleType) return;
      event.preventDefault();
      changeVehicleClass(vehicleType);
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

  return (
    <div className={styles.terminal}>
      <header className={styles.topbar}>
        <div className={styles.titleBlock}>
          <div className={styles.kicker}>CASHIER WORKSTATION</div>
          <h2>Terminal kasir</h2>
        </div>

        <div className={styles.shiftBlock}>
          <Badge variant={shift ? "success" : "outline"}>
            {shift
              ? "SHIFT AKTIF"
              : shiftLoaded
                ? "SHIFT BELUM DIBUKA"
                : "MEMUAT SHIFT…"}
          </Badge>
          <div className={styles.shiftText}>
            <strong>
              {shift
                ? "Shift kasir aktif"
                : shiftLoaded
                  ? "Belum ada shift kasir"
                  : "Memuat shift kasir…"}
            </strong>
            <span>
              {shift
                ? `Buka ${new Date(shift.openedAt).toLocaleTimeString(
                    "id-ID",
                    { hour: "2-digit", minute: "2-digit" },
                  )} · Kas ${rupiah(Number(shift.expectedCash || 0))}`
                : shiftLoaded
                  ? "Buka shift sebelum menerima pembayaran."
                  : "Menghubungi server…"}
            </span>
          </div>
          {shift ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShiftCloseDialog(true)}
            >
              Tutup shift
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => setShiftOpenDialog(true)}
              disabled={!shiftLoaded}
            >
              <WalletCards size={14} /> Buka shift
            </Button>
          )}
        </div>

        <div className={styles.clockBlock}>
          <strong>{clock}</strong>
          <span>F1 Motor · F2 Mobil · F3 Bus/Truk</span>
        </div>
      </header>

      {shiftError && (
        <div className={styles.bannerError}>
          <XCircle size={14} /> {shiftError}
        </div>
      )}
      {error && (
        <div className={styles.bannerError}>
          <XCircle size={14} /> {error}
        </div>
      )}

      <div className={styles.grid}>
        <aside className={styles.gateColumn}>
          <GateOutLive
            deviceCode={liveGateCode}
            gates={gates.map((gate) => ({
              deviceCode: gate.deviceCode,
              name: gate.name,
            }))}
            onDeviceChange={setExitDeviceCode}
            compact
          />
        </aside>

        <section className={styles.ticketColumn}>
          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <span className={styles.stepNo}>01</span>
              <div>
                <strong>{quote ? "Verifikasi tagihan" : "Identifikasi tiket"}</strong>
                <small>
                  {quote
                    ? "Periksa kelas, plat, dan total sebelum pembayaran"
                    : "Scan QR / masukkan nomor tiket"}
                </small>
              </div>
            </div>

            <div className={styles.lookupRow}>
              <ScanLine size={18} />
              <Input
                autoFocus
                value={ticketNo}
                onChange={(e) => setTicketNo(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && lookup()}
                placeholder="PKR-YYYYMMDD-XXXX atau PKR1.…"
                aria-label="Nomor atau token tiket"
              />
              <Button onClick={() => lookup()} disabled={busy || !ticketNo.trim()}>
                <ArrowRight size={16} /> Hitung
              </Button>
            </div>

            {scanKind && quote && (
              <div className={styles.verified}>
                <CheckCircle2 size={14} />
                {scanKind === "qr"
                  ? "QR tiket berhasil dipindai dan diverifikasi."
                  : "Nomor tiket berhasil diverifikasi."}
              </div>
            )}

            <div className={styles.quoteArea}>
              {quote ? (
                <>
                  <div className={styles.quoteHead}>
                    <div>
                      <span>Tiket</span>
                      <strong className={styles.mono}>{quote.ticketNo}</strong>
                    </div>
                    <div>
                      <span>Kendaraan</span>
                      <strong>{quote.vehicleType}</strong>
                    </div>
                    {quote.membership && (
                      <Badge variant="success">
                        MEMBER · {quote.membership.planName}
                      </Badge>
                    )}
                  </div>

                  {quote.membership && (
                    <div className={styles.memberBox}>
                      <strong>✓ {quote.membership.memberName}</strong>
                      <span>
                        {quote.membership.planName} · berlaku sampai{" "}
                        {new Date(
                          quote.membership.expiresAt,
                        ).toLocaleDateString("id-ID")}
                      </span>
                    </div>
                  )}

                  <label className={styles.plateField}>
                    <span>Nomor plat kendaraan</span>
                    <div>
                      <Input
                        value={plateInput}
                        onChange={(e) =>
                          setPlateInput(e.target.value.toUpperCase())
                        }
                        placeholder="DD 1234 XX"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={savePlate}
                        disabled={plateSaving || !plateInput.trim()}
                      >
                        {plateSaving ? "Menyimpan…" : "Simpan plat"}
                      </Button>
                    </div>
                  </label>

                  <div className={styles.classPicker}>
                    <div className={styles.classHead}>
                      <strong>Kelas kendaraan</strong>
                      <small>
                        {classBusy
                          ? "Menyimpan…"
                          : "F1 Motor · F2 Mobil · F3 Bus/Truk"}
                      </small>
                    </div>
                    <div className={styles.classButtons}>
                      {VEHICLE_CLASSES.map((vehicle) => (
                        <Button
                          key={vehicle.value}
                          size="sm"
                          variant={
                            quote.vehicleType === vehicle.value
                              ? "secondary"
                              : "outline"
                          }
                          onClick={() => changeVehicleClass(vehicle.value)}
                          disabled={classBusy}
                          aria-pressed={quote.vehicleType === vehicle.value}
                        >
                          <kbd>{vehicle.shortcut}</kbd>
                          {vehicle.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className={styles.quoteRows}>
                    {quote.entryAt && (
                      <div>
                        <span>Masuk</span>
                        <strong>
                          {new Date(quote.entryAt).toLocaleString("id-ID")}
                        </strong>
                      </div>
                    )}
                    <div>
                      <span>Durasi</span>
                      <strong>
                        {quote.minutes} menit · {quote.hours} jam tagihan
                      </strong>
                    </div>
                    {quote.membership && (
                      <div>
                        <span>Tarif normal</span>
                        <strong>{rupiah(Number(quote.baseFee || 0))}</strong>
                      </div>
                    )}
                    <div className={styles.total}>
                      <span>Total</span>
                      <strong>{rupiah(Number(quote.fee || 0))}</strong>
                    </div>
                  </div>
                </>
              ) : (
                <div className={styles.empty}>
                  Scan atau masukkan nomor tiket untuk menampilkan tagihan.
                </div>
              )}
            </div>

            {activeTickets.length > 0 && (
              <div className={styles.activeList}>
                <div className={styles.activeHead}>
                  <span>KENDARAAN DI DALAM</span>
                  <small>{activeTickets.length} tiket terbaru</small>
                </div>
                <div className={styles.activeRows}>
                  {activeTickets.map((ticket) => (
                    <button
                      key={ticket.id}
                      type="button"
                      className={styles.activeRow}
                      onClick={() => {
                        setTicketNo(ticket.ticketNo);
                        lookup(ticket.ticketNo);
                      }}
                    >
                      <strong>{ticket.plateNumber || "Tanpa plat"}</strong>
                      <span>{ticket.ticketNo}</span>
                      <em>{ticket.minutes} mnt</em>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        <aside className={styles.paymentColumn}>
          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <span className={styles.stepNo}>03</span>
              <div>
                <strong>Pembayaran & Gate Out</strong>
                <small>Slot dibebaskan setelah pembayaran berhasil</small>
              </div>
            </div>

            <div className={styles.payTotal}>
              <span>Total tagihan</span>
              <strong>{quote ? rupiah(Number(quote.fee || 0)) : "—"}</strong>
            </div>

            <div className={styles.methods}>
              {[
                ["cash", "Tunai", Banknote],
                ["qris", "QRIS", QrCode],
                ["card", "Kartu", CreditCard],
              ].map(([value, label, Icon]: any) => (
                <Button
                  key={value}
                  variant={paymentMethod === value ? "secondary" : "outline"}
                  onClick={() => setPaymentMethod(value)}
                  disabled={!quote}
                >
                  <Icon size={15} />
                  {label}
                </Button>
              ))}
            </div>

            {paymentMethod !== "cash" && (
              <label className={styles.field}>
                No. referensi {paymentMethod === "qris" ? "QRIS" : "kartu"}{" "}
                (opsional)
                <Input
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="Contoh: TRX-2026-000123"
                  maxLength={120}
                />
              </label>
            )}

            <div className={styles.selectGrid}>
              <label className={styles.field}>
                Gate Out
                <Select
                  value={exitDeviceCode}
                  onValueChange={setExitDeviceCode}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih Gate Out" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__manual">
                      Manual — tanpa barrier
                    </SelectItem>
                    {gates.map((gate) => (
                      <SelectItem
                        key={gate.deviceCode}
                        value={gate.deviceCode}
                      >
                        {gate.deviceCode} · {gate.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>

              <label className={styles.field}>
                Printer struk
                <Select
                  value={receiptPrinterDeviceCode}
                  onValueChange={setReceiptPrinterDeviceCode}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih printer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">
                      Tidak mencetak otomatis
                    </SelectItem>
                    {printers.map((device) => (
                      <SelectItem
                        key={device.deviceCode}
                        value={device.deviceCode}
                      >
                        {device.deviceCode} · {device.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>

            <Button
              size="lg"
              onClick={pay}
              disabled={busy || !quote || !shift}
              className={styles.payButton}
            >
              <CheckCircle2 size={18} />
              {busy ? "Memproses…" : "Terima pembayaran & buka Gate"}
            </Button>

            {!shift && shiftLoaded && (
              <p className={styles.payHint}>
                Buka shift terlebih dahulu untuk menerima pembayaran.
              </p>
            )}
          </div>

          {commandStatus.length === 0 && (
            <div className={styles.shiftSummary}>
              <div className={styles.shiftSummaryHead}>
                <span>RINGKASAN SHIFT</span>
                <strong>{shift ? "AKTIF" : "BELUM DIBUKA"}</strong>
              </div>
              <div>
                <span>Kas awal</span>
                <strong>
                  {shift ? rupiah(Number(shift.openingCash || 0)) : "—"}
                </strong>
              </div>
              <div>
                <span>Kas diharapkan</span>
                <strong>
                  {shift ? rupiah(Number(shift.expectedCash || 0)) : "—"}
                </strong>
              </div>
              <div>
                <span>Dibuka</span>
                <strong>
                  {shift
                    ? new Date(shift.openedAt).toLocaleTimeString("id-ID", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—"}
                </strong>
              </div>
            </div>
          )}

          {commandStatus.length > 0 && (
            <div className={styles.commandPanel}>
              <div className={styles.commandHead}>
                <div>
                  <span className={styles.kicker}>GATE OUT COMMANDS</span>
                  <strong>Status perangkat</strong>
                </div>
                <span className={styles.monitorBadge}>PEMANTAUAN</span>
              </div>
              <div className={styles.commandList}>
                {commandStatus.map((command, index) => (
                  <div
                    className={styles.commandRow}
                    key={command.correlationId || index}
                  >
                    <strong>
                      {commandLabel[command.commandType] ||
                        command.commandType}
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
                      {command.status === "completed"
                        ? "SELESAI"
                        : command.status === "failed"
                          ? "GAGAL"
                          : command.status.toUpperCase()}
                    </span>
                    {command.status === "failed" &&
                      command.correlationId && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => retryCommand(command.correlationId)}
                          disabled={
                            retryingCommand === command.correlationId
                          }
                        >
                          {retryingCommand === command.correlationId
                            ? "Mengulang…"
                            : "Ulangi"}
                        </Button>
                      )}
                    {command.errorMessage && (
                      <small>{command.errorMessage}</small>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      <Dialog
        open={!!receipt}
        onOpenChange={(open) => {
          if (!open) setReceipt(null);
        }}
      >
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

      <Dialog open={shiftOpenDialog} onOpenChange={setShiftOpenDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Buka shift kasir</DialogTitle>
            <DialogDescription>
              Masukkan uang tunai awal yang benar-benar ada di laci kasir.
            </DialogDescription>
          </DialogHeader>
          <label className={styles.field}>
            Saldo awal (Rp)
            <Input
              inputMode="numeric"
              value={openingCash}
              onChange={(e) =>
                setOpeningCash(e.target.value.replace(/[^0-9]/g, ""))
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
          <label className={styles.field}>
            Saldo akhir fisik (Rp)
            <Input
              inputMode="numeric"
              value={closingCash}
              onChange={(e) =>
                setClosingCash(e.target.value.replace(/[^0-9]/g, ""))
              }
              placeholder="0"
            />
          </label>
          <label className={styles.field}>
            Catatan selisih (opsional)
            <Input
              value={closingNotes}
              onChange={(e) => setClosingNotes(e.target.value)}
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
