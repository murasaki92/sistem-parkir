import { useEffect } from "react";
import { useRouter } from "next/router";
import { ParkingSquare, ShieldCheck } from "lucide-react";
import { PasswordLoginForm } from "../components/PasswordLoginForm";
import { useAuth } from "../helpers/useAuth";
import { homePathForRole } from "../helpers/home";
import styles from "./login.module.css";

export default function LoginPage() {
  const router = useRouter();
  const { authState } = useAuth();

  useEffect(() => {
    if (authState.type === "authenticated") {
      router.replace(homePathForRole(authState.user.role));
    }
  }, [authState.type, router]);

  return (
    <main className={styles.page}>
      <section className={styles.brandPanel}>
        <div className={styles.mark}>
          <ParkingSquare size={28} />
        </div>
        <span className={styles.kicker}>PARKLINE / OPERATIONS</span>
        <h1>Kontrol parkir, tanpa kehilangan jejak.</h1>
        <p>
          Satu dashboard untuk kendaraan masuk, slot, transaksi, tarif, dan
          laporan operasional.
        </p>
        <div className={styles.meta}>
          <ShieldCheck size={16} /> Akses aman berbasis akun petugas
        </div>
      </section>
      <section className={styles.formPanel}>
        <div className={styles.formInner}>
          <div>
            <div className={styles.formKicker}>WELCOME BACK</div>
            <h2>Masuk ke Parkline</h2>
            <p>Gunakan akun petugas atau admin Anda.</p>
          </div>
          <PasswordLoginForm />
          <div className={styles.demo}>
            <div className={styles.demoTitle}>AKUN DEMO</div>
            <div className={styles.demoGrid}>
              <span>
                <strong>Admin</strong>
                admin@parkline.id · admin123
              </span>
              <span>
                <strong>Supervisor</strong>
                supervisor@parkline.id · supervisor123
              </span>
              <span>
                <strong>Kasir</strong>
                kasir@parkline.id · kasir123
              </span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
