import { CashierTerminal } from "../components/CashierTerminal";
import { CashierRoute } from "../components/ProtectedRoute";
import { AppNav } from "../components/AppNav";
import styles from "./cashier.module.css";

export default function CashierPage() {
  return (
    <CashierRoute>
      <AppNav />
      <main className={styles.page}>
        <CashierTerminal />
      </main>
    </CashierRoute>
  );
}
