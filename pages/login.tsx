import { ParkingSquare, ShieldCheck } from "lucide-react";
import { PasswordLoginForm } from "../components/PasswordLoginForm";
import styles from "./login.module.css";

export default function LoginPage() {
  return (
    <main className={styles.page}>
      <section className={styles.brandPanel}>
        <div className={styles.mark}><ParkingSquare size={28} /></div>
        <span className={styles.kicker}>PARKLINE / OPERATIONS</span>
        <h1>Kontrol parkir, tanpa kehilangan jejak.</h1>
        <p>Satu dashboard untuk kendaraan masuk, slot, transaksi, tarif, dan laporan operasional.</p>
        <div className={styles.meta}><ShieldCheck size={16} /> Akses aman berbasis akun petugas</div>
      </section>
      <section className={styles.formPanel}>
        <div className={styles.formInner}>
          <div><div className={styles.formKicker}>WELCOME BACK</div><h2>Masuk ke Parkline</h2><p>Gunakan akun petugas atau admin Anda.</p></div>
          <PasswordLoginForm />
        </div>
      </section>
    </main>
  );
}
