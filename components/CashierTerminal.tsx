"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Banknote, CheckCircle2, CreditCard, Printer, QrCode, ScanLine, XCircle, WalletCards } from "lucide-react";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./Dialog";
import { Input } from "./Input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./Select";
import { GateOutLive } from "./GateOutLive";
import styles from "./CashierTerminal.module.css";

const rupiah = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);

export function CashierTerminal() {
  const [ticketNo, setTicketNo] = useState("");
  const [quote, setQuote] = useState<any>(null);
  const [scanKind, setScanKind] = useState<"ticket" | "qr" | null>(null);
  const [plateInput, setPlateInput] = useState("");
  const [plateSaving, setPlateSaving] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentReference, setPaymentReference] = useState("");
  const [exitDeviceCode, setExitDeviceCode] = useState("__manual");
  const [receiptPrinterDeviceCode, setReceiptPrinterDeviceCode] = useState("__none");
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
  const [openingCash, setOpeningCash] = useState("");
  const [closingCash, setClosingCash] = useState("");
  const [closingNotes, setClosingNotes] = useState("");
  const monitorTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadShift = async () => {
    setShiftError("");
    try { const r=await fetch("/api/parking/cashierShift"); const j=await r.json(); if(!r.ok) throw new Error(j.error||"Gagal memuat shift"); setShift(j.current); }
    catch(e){setShiftError(e instanceof Error?e.message:"Gagal memuat shift kasir");}
    finally{setShiftLoaded(true);}
  };

  useEffect(() => {
    fetch("/api/parking/devices").then(r => r.json()).then(j => setDevices(Array.isArray(j) ? j : [])).catch(() => setDevices([]));
    loadShift();
  }, []);

  const openShift = async () => {
    try { setShiftError(""); const amount=Math.floor(Number(openingCash)); const r=await fetch("/api/parking/cashierShiftOpen",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({openingCash:amount})}); const j=await r.json(); if(!r.ok) throw new Error(j.error||"Gagal membuka shift"); setOpeningCash(""); setShift(j); setShiftOpenDialog(false); }
    catch(e){setShiftError(e instanceof Error?e.message:"Gagal membuka shift");}
  };

  const closeShift = async () => {
    try { setShiftError(""); const amount=Math.floor(Number(closingCash)); const r=await fetch("/api/parking/cashierShiftClose",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({closingCash:amount,notes:closingNotes})}); const j=await r.json(); if(!r.ok) throw new Error(j.error||"Gagal menutup shift"); setClosingCash(""); setClosingNotes(""); setShift(null); setShiftCloseDialog(false); }
    catch(e){setShiftError(e instanceof Error?e.message:"Gagal menutup shift");}
  };

  const normalizeScan = (value: string) => value.trim().toUpperCase();

  const lookup = async () => {
    const normalized = normalizeScan(ticketNo);
    if (!normalized) return;
    setBusy(true); setError(""); setQuote(null); setReceipt(null);
    try {
      const r = await fetch("/api/parking/exit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticketNo: normalized }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Tiket tidak ditemukan");
      setQuote(j); setPlateInput(String(j.plateNumber || ""));
      setScanKind(normalized.startsWith("PKR1.") ? "qr" : "ticket");
    } catch (e) { setError(e instanceof Error ? e.message : "Gagal menghitung tagihan"); }
    finally { setBusy(false); }
  };

  const savePlate = async () => {
    if (!quote || !plateInput.trim()) return;
    setPlateSaving(true); setError("");
    try {
      const r=await fetch("/api/parking/plateUpdate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ticketNo:quote.ticketNo,plateNumber:plateInput})});
      const j=await r.json(); if(!r.ok) throw new Error(j.error||"Gagal menyimpan plat");
      const q=await fetch("/api/parking/exit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ticketNo:quote.ticketNo})});
      const next=await q.json(); if(!q.ok) throw new Error(next.error||"Gagal menghitung ulang tagihan");
      setQuote(next); setPlateInput(String(next.plateNumber||""));
    } catch(e){setError(e instanceof Error?e.message:"Gagal menyimpan plat");} finally{setPlateSaving(false);}
  };

  const pay = async () => {
    if (!quote) return;
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/parking/pay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticketNo: quote.ticketNo, paymentMethod, paymentReference: paymentReference.trim() || undefined, exitDeviceCode: exitDeviceCode === "__manual" ? undefined : exitDeviceCode, receiptPrinterDeviceCode: receiptPrinterDeviceCode === "__none" ? undefined : receiptPrinterDeviceCode }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Pembayaran gagal");
      setReceipt(j); setQuote(null); setTicketNo(""); setPaymentReference("");
      await loadShift();
      if (exitDeviceCode !== "__manual" || receiptPrinterDeviceCode !== "__none") {
        const monitorTicket = String(j.ticketNo || "").toUpperCase();
        const loadStatus = async () => { try { const s = await fetch(`/api/parking/commandStatus?ticketNo=${encodeURIComponent(monitorTicket)}`); const d = await s.json(); if (s.ok) setCommandStatus(d.commands || []); } catch {} };
        await loadStatus();
        if (monitorTimer.current) clearInterval(monitorTimer.current);
        monitorTimer.current = setInterval(loadStatus, 1500);
        window.setTimeout(() => { if (monitorTimer.current) { clearInterval(monitorTimer.current); monitorTimer.current = null; } }, 30000);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Pembayaran gagal"); }
    finally { setBusy(false); }
  };

  const retryCommand = async (correlationId:string) => {
    setRetryingCommand(correlationId); setError("");
    try { const r=await fetch("/api/parking/commandRetry",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({correlationId})}); const j=await r.json(); if(!r.ok) throw new Error(j.error||"Retry perangkat gagal"); setCommandStatus(prev=>prev.map(c=>c.correlationId===correlationId?{...c,status:"pending",errorMessage:null}:c)); } catch(e){setError(e instanceof Error?e.message:"Retry perangkat gagal");} finally{setRetryingCommand(null);}
  };

  useEffect(() => () => { if (monitorTimer.current) clearInterval(monitorTimer.current); }, []);

  const gates = devices.filter(d => d.status === "active" && d.deviceType === "gate" && d.gateDirection === "out");
  const printers = devices.filter(d => d.status === "active" && d.deviceType === "printer");
  const selectedGate = gates.find(d => d.deviceCode === exitDeviceCode);
  const liveGateCode = selectedGate?.deviceCode || gates[0]?.deviceCode || "";

  return <div className={styles.terminal}>
    <div className={styles.header}>
      <div><div className={styles.kicker}>CASHIER WORKSTATION</div><h2>Terminal kasir</h2><p>Scan atau masukkan nomor tiket untuk menyelesaikan kendaraan keluar.</p></div>
      <Badge variant={shift ? "success" : "outline"}>{shift ? "SHIFT AKTIF" : shiftLoaded ? "SHIFT BELUM DIBUKA" : "MEMUAT SHIFT…"}</Badge>
    </div>
    <section className={styles.shiftBar}>
      <div className={styles.shiftMain}><WalletCards size={19}/><div><strong>{shift ? "Shift kasir aktif" : shiftLoaded ? "Belum ada shift kasir" : "Memuat shift kasir…"}</strong><span>{shift ? `Buka ${new Date(shift.openedAt).toLocaleString("id-ID")} · Kas diharapkan ${rupiah(Number(shift.expectedCash||0))}` : shiftLoaded ? "Buka shift dan masukkan saldo awal sebelum menerima pembayaran." : "Menghubungi server untuk memeriksa shift aktif."}</span></div></div>
      <div className={styles.shiftActions}>{shift ? <Button variant="outline" onClick={()=>setShiftCloseDialog(true)}>Tutup shift</Button> : <Button onClick={()=>setShiftOpenDialog(true)} disabled={!shiftLoaded}>Buka shift</Button>}</div>
    </section>
    {shiftError && <div className={styles.error}><XCircle size={16}/>{shiftError}</div>}
    <GateOutLive deviceCode={liveGateCode} />
    <div className={styles.workflow}>
      <section className={styles.step}>
        <div className={styles.stepTitle}><span>01</span><div><strong>Identifikasi tiket</strong><small>Scan QR / barcode; nomor tiket atau token QR sama-sama diterima.</small></div></div>
        <div className={styles.ticketInput}><ScanLine size={19}/><Input autoFocus value={ticketNo} onChange={e => setTicketNo(e.target.value)} onKeyDown={e => e.key === "Enter" && lookup()} placeholder="PKR-YYYYMMDD-XXXX atau PKR1.…" aria-label="Nomor atau token tiket"/><Button onClick={lookup} disabled={busy || !ticketNo.trim()}><ArrowRight size={16}/> Hitung</Button></div>
        {scanKind && quote && <div className={styles.verified}><CheckCircle2 size={15}/>{scanKind === "qr" ? "QR tiket berhasil dipindai dan diverifikasi." : "Nomor tiket berhasil diverifikasi."}</div>}
        {error && <div className={styles.error}><XCircle size={16}/>{error}</div>}
      </section>
      <section className={styles.step}>
        <div className={styles.stepTitle}><span>02</span><div><strong>Verifikasi tagihan</strong><small>Biaya dihitung dari waktu masuk dan tarif aktif</small></div></div>
        {quote ? <div className={styles.quote}><div><span>Tiket</span><strong>{quote.ticketNo}</strong></div><label className={styles.plateField}><span>Nomor plat kendaraan</span><div><Input value={plateInput} onChange={e=>setPlateInput(e.target.value.toUpperCase())} placeholder="DD 1234 XX"/><Button size="sm" variant="outline" onClick={savePlate} disabled={plateSaving || !plateInput.trim()}>{plateSaving?"Menyimpan…":"Simpan plat"}</Button></div></label>{quote.membership && <div className={styles.memberBox}><strong>✓ MEMBER AKTIF · {quote.membership.memberName}</strong><span>{quote.membership.planName} · berlaku sampai {new Date(quote.membership.expiresAt).toLocaleDateString("id-ID")}</span></div>}<div><span>Kendaraan</span><strong>{quote.vehicleType || "—"}</strong></div><div><span>Durasi</span><strong>{quote.minutes} menit · {quote.hours} jam tagihan</strong></div>{quote.baseFee!==undefined && quote.membership && <div><span>Tarif normal</span><strong>{rupiah(Number(quote.baseFee||0))}</strong></div>}<div className={styles.total}><span>Total</span><strong>{rupiah(Number(quote.fee || 0))}</strong></div></div> : <div className={styles.empty}>Belum ada tiket yang diverifikasi.</div>}
      </section>
      <section className={styles.step}>
        <div className={styles.stepTitle}><span>03</span><div><strong>Pembayaran & Gate Out</strong><small>Slot baru dibebaskan setelah pembayaran berhasil</small></div></div>
        <div className={styles.methods}>{[["cash","Tunai",Banknote],["qris","QRIS",QrCode],["card","Kartu",CreditCard]].map(([v,label,Icon]:any) => <Button key={v} variant={paymentMethod===v ? "secondary" : "outline"} onClick={() => setPaymentMethod(v)} disabled={!quote}><Icon size={16}/>{label}</Button>)}</div>
        {paymentMethod !== "cash" && <label className={styles.field}>No. referensi {paymentMethod === "qris" ? "QRIS" : "kartu"} (opsional)<Input value={paymentReference} onChange={e=>setPaymentReference(e.target.value)} placeholder="Contoh: TRX-2026-000123" maxLength={120}/></label>}
        <label className={styles.field}>Gate Out<Select value={exitDeviceCode} onValueChange={setExitDeviceCode}><SelectTrigger><SelectValue placeholder="Pilih Gate Out"/></SelectTrigger><SelectContent><SelectItem value="__manual">Manual — tanpa barrier</SelectItem>{gates.map(d => <SelectItem key={d.deviceCode} value={d.deviceCode}>{d.deviceCode} · {d.name}</SelectItem>)}</SelectContent></Select></label>
        {selectedGate && <div className={styles.cameraBox}><div className={styles.cameraHead}><span>KAMERA GATE OUT</span><small>{selectedGate.deviceCode}</small></div>{selectedGate.cameraSnapshotUrl ? <img src={selectedGate.cameraSnapshotUrl} alt="Snapshot kamera Gate Out"/> : selectedGate.cameraUrl && /^https?:\/\//i.test(selectedGate.cameraUrl) ? <div className={styles.cameraLink}>Live camera terkonfigurasi. <a href={selectedGate.cameraUrl} target="_blank" rel="noreferrer">Buka feed</a></div> : <div className={styles.cameraEmpty}>Belum ada URL kamera Gate Out.</div>}</div>}
        <label className={styles.field}>Printer struk<Select value={receiptPrinterDeviceCode} onValueChange={setReceiptPrinterDeviceCode}><SelectTrigger><SelectValue placeholder="Pilih printer struk"/></SelectTrigger><SelectContent><SelectItem value="__none">Tidak mencetak otomatis</SelectItem>{printers.map(d => <SelectItem key={d.deviceCode} value={d.deviceCode}>{d.deviceCode} · {d.name}</SelectItem>)}</SelectContent></Select></label>
        <Button size="lg" onClick={pay} disabled={busy || !quote || !shift} className={styles.pay}><CheckCircle2 size={18}/> {busy ? "Memproses…" : "Terima pembayaran & buka Gate"}</Button>
      </section>
    </div>
    {receipt && <section className={styles.receipt}><div className={styles.receiptIcon}><CheckCircle2 size={25}/></div><div><div className={styles.kicker}>PAYMENT COMPLETED</div><h3>Pembayaran berhasil</h3><p>{receipt.ticketNo} · {receipt.receiptNo}{receipt.paymentReference ? ` · Ref ${receipt.paymentReference}` : ""}</p></div><strong>{rupiah(Number(receipt.fee || 0))}</strong><Button variant="outline" onClick={() => window.print()}><Printer size={16}/> Cetak struk</Button></section>}
    {receipt && commandStatus.length > 0 && <section className={styles.commandPanel}><div className={styles.commandTitle}><div><div className={styles.kicker}>GATE OUT COMMANDS</div><h3>Status perangkat</h3></div><span>PEMANTAUAN AKTIF</span></div>{commandStatus.map((c,i)=><div className={styles.commandRow} key={c.correlationId || i}><strong>{c.commandType === "barrier_open" ? "Barrier" : c.commandType === "camera_snapshot" ? "Kamera" : c.commandType === "printer_print" ? "Printer" : c.commandType}</strong><span className={c.status === "completed" ? styles.commandOk : c.status === "failed" ? styles.commandFail : styles.commandPending}>{c.status === "completed" ? "SELESAI" : c.status === "failed" ? "GAGAL" : c.status.toUpperCase()}</span>{c.status === "failed" && c.correlationId && <Button size="sm" variant="outline" onClick={()=>retryCommand(c.correlationId)} disabled={retryingCommand===c.correlationId}>{retryingCommand===c.correlationId ? "Mengulang…" : "Ulangi perintah"}</Button>}{c.errorMessage && <small>{c.errorMessage}</small>}</div>)}</section>}
    <Dialog open={shiftOpenDialog} onOpenChange={setShiftOpenDialog}><DialogContent><DialogHeader><DialogTitle>Buka shift kasir</DialogTitle><DialogDescription>Masukkan uang tunai awal yang benar-benar ada di laci kasir.</DialogDescription></DialogHeader><label className={styles.field}>Saldo awal (Rp)<Input inputMode="numeric" value={openingCash} onChange={e=>setOpeningCash(e.target.value.replace(/[^0-9]/g,""))} placeholder="0"/></label><DialogFooter><Button variant="outline" onClick={()=>setShiftOpenDialog(false)}>Batal</Button><Button onClick={openShift} disabled={!openingCash.trim()}>Mulai shift</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={shiftCloseDialog} onOpenChange={setShiftCloseDialog}><DialogContent><DialogHeader><DialogTitle>Tutup shift kasir</DialogTitle><DialogDescription>Expected cash saat ini {rupiah(Number(shift?.expectedCash||0))}. Masukkan uang tunai hasil hitung fisik.</DialogDescription></DialogHeader><label className={styles.field}>Saldo akhir fisik (Rp)<Input inputMode="numeric" value={closingCash} onChange={e=>setClosingCash(e.target.value.replace(/[^0-9]/g,""))} placeholder="0"/></label><label className={styles.field}>Catatan selisih (opsional)<Input value={closingNotes} onChange={e=>setClosingNotes(e.target.value)} placeholder="Contoh: selisih karena pengembalian tunai"/></label><DialogFooter><Button variant="outline" onClick={()=>setShiftCloseDialog(false)}>Batal</Button><Button onClick={closeShift} disabled={!closingCash.trim()}>Tutup shift</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
