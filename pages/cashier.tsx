import { CashierTerminal } from "../components/CashierTerminal";
import { CashierRoute } from "../components/ProtectedRoute";
import styles from "./cashier.module.css";

export default function CashierPage() {
  return (
    <CashierRoute>
      <main className={styles.page}>
        <CashierTerminal />
      </main>
    </CashierRoute>
  );
}
