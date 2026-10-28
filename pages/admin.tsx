import { useEffect, useState } from "react";
import { Activity, CarFront, CircleDollarSign, KeyRound, ParkingSquare } from "lucide-react";
import { AdminRoute } from "../components/ProtectedRoute";
import { AppNav } from "../components/AppNav";
import { AdvancedReports } from "../components/AdvancedReports";
import { BackupManagement } from "../components/BackupManagement";
import { DeviceManagement } from "../components/DeviceManagement";
import { EmployeeManagement } from "../components/EmployeeManagement";
import { GateOutAttention } from "../components/GateOutAttention";
import { GateSimulator } from "../components/GateSimulator";
import { MembershipManagement } from "../components/MembershipManagement";
import { ParkingOverride } from "../components/ParkingOverride";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/Tabs";
import { useAuth } from "../helpers/useAuth";
import styles from "./admin.module.css";

type ActiveTicket = {
  id: number;
  ticketNo: string;
  plateNumber: string;
  vehicleType: string;
  entryAt: string;
  minutes: number;
  currentFee: number;
  membership: { memberName: string; planName: string } | null;
};

const rupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);

function ActiveTickets() {
  const [tickets, setTickets] = useState<ActiveTicket[]>([]);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const response = await fetch("/api/parking/activeTickets");
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Gagal memuat tiket aktif");
      setTickets(Array.isArray(body) ? body : []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat tiket aktif");
    }
  };

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 15000);
    return () => window.clearInterval(timer);
  }, []);

  const potential = tickets.reduce((total, ticket) => total + Number(ticket.currentFee), 0);

  return (
    <div className={styles.overview}>
      <div className={styles.stats}>
        <div className={styles.statCard}>
          <CarFront size={18} />
          <div>
            <span>Kendaraan masih parkir</span>
            <strong>{tickets.length}</strong>
          </div>
        </div>
        <div className={styles.statCard}>
          <CircleDollarSign size={18} />
          <div>
            <span>Potensi biaya saat ini</span>
            <strong>{rupiah(potential)}</strong>
          </div>
        </div>
        <div className={styles.statCard}>
          <Activity size={18} />
          <div>
            <span>Status operasional</span>
            <strong className={styles.live}>ONLINE</strong>
          </div>
        </div>
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <h2>Tiket aktif</h2>
            <p>Gunakan nomor tiket ini di terminal kasir untuk menguji alur keluar.</p>
          </div>
          <Button variant="outline" size="sm" onClick={load}>
            Muat ulang
          </Button>
        </div>
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>TIKET</th>
                <th>KENDARAAN</th>
                <th>MASUK</th>
                <th>DURASI</th>
                <th>BIAYA</th>
                <th>MEMBER</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <tr key={ticket.id}>
                  <td>
                    <strong className={styles.mono}>{ticket.ticketNo}</strong>
                  </td>
                  <td>
                    {ticket.plateNumber || "—"} · {ticket.vehicleType}
                  </td>
                  <td>{new Date(ticket.entryAt).toLocaleString("id-ID")}</td>
                  <td>{ticket.minutes} menit</td>
                  <td>{rupiah(ticket.currentFee)}</td>
                  <td>
                    {ticket.membership ? (
                      <Badge variant="success">{ticket.membership.planName}</Badge>
                    ) : (
                      <span className={styles.muted}>—</span>
                    )}
                  </td>
                </tr>
              ))}
              {!tickets.length && (
                <tr>
                  <td colSpan={6} className={styles.empty}>
                    Tidak ada kendaraan yang sedang parkir.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.demo}>
        <div className={styles.demoHead}>
          <ParkingSquare size={18} />
          <div>
            <h3>Alur demo cepat</h3>
            <p>Semua fitur di bawah berjalan dengan database SQLite lokal.</p>
          </div>
        </div>
        <ol className={styles.steps}>
          <li>
            Buka tab <strong>Simulator</strong>, kredensial demo sudah terisi.
            Klik <em>Mulai simulator</em>, lalu <em>Simulasikan kendaraan</em> dan{" "}
            <em>Ambil Tiket</em>.
          </li>
          <li>
            Buka <strong>Kasir</strong>, masukkan nomor tiket hasil simulator
            (atau tiket demo di atas), lalu proses pembayaran.
          </li>
          <li>
            Kembali ke <strong>Simulator</strong> untuk melihat command barrier,
            kamera, dan printer diproses. Statusnya juga muncul di terminal
            kasir.
          </li>
        </ol>
        <div className={styles.credentials}>
          <KeyRound size={15} />
          <span>
            Kredensial simulator: <code>GATE-IN-001</code> /{" "}
            <code>gate-in-demo-secret</code>
          </span>
        </div>
      </section>
    </div>
  );
}

export default function AdminPage() {
  const { authState } = useAuth();
  const user = authState.type === "authenticated" ? authState.user : null;

  return (
    <AdminRoute>
      <AppNav />
      <main className={styles.page}>
        <header className={styles.header}>
          <div>
            <div className={styles.kicker}>PARKLINE / OPERATIONS CONTROL</div>
            <h1>Pusat kendali parkir</h1>
            <p>
              Perangkat, membership, tarif, laporan, audit override, dan backup
              dalam satu tempat.
            </p>
          </div>
          {user && <Badge variant="secondary">{user.displayName}</Badge>}
        </header>

        <Tabs defaultValue="ringkasan" className={styles.tabs}>
          <TabsList>
            <TabsTrigger value="ringkasan">Ringkasan</TabsTrigger>
            <TabsTrigger value="perhatian">Gate Out</TabsTrigger>
            <TabsTrigger value="perangkat">Perangkat</TabsTrigger>
            <TabsTrigger value="membership">Membership</TabsTrigger>
            <TabsTrigger value="karyawan">Karyawan</TabsTrigger>
            <TabsTrigger value="laporan">Laporan</TabsTrigger>
            <TabsTrigger value="override">Override</TabsTrigger>
            <TabsTrigger value="backup">Backup</TabsTrigger>
            <TabsTrigger value="simulator">Simulator</TabsTrigger>
          </TabsList>

          <TabsContent value="ringkasan" className={styles.panelContent}>
            <ActiveTickets />
          </TabsContent>
          <TabsContent value="perhatian" className={styles.panelContent}>
            <GateOutAttention />
          </TabsContent>
          <TabsContent value="perangkat" className={styles.panelContent}>
            <DeviceManagement />
          </TabsContent>
          <TabsContent value="membership" className={styles.panelContent}>
            <MembershipManagement />
          </TabsContent>
          <TabsContent value="karyawan" className={styles.panelContent}>
            <EmployeeManagement />
          </TabsContent>
          <TabsContent value="laporan" className={styles.panelContent}>
            <AdvancedReports />
          </TabsContent>
          <TabsContent value="override" className={styles.panelContent}>
            <ParkingOverride />
          </TabsContent>
          <TabsContent value="backup" className={styles.panelContent}>
            <BackupManagement />
          </TabsContent>
          <TabsContent value="simulator" className={styles.panelContent}>
            <GateSimulator defaultDeviceSecret="gate-in-demo-secret" />
          </TabsContent>
        </Tabs>
      </main>
    </AdminRoute>
  );
}
