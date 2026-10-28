import { AppNav } from "../components/AppNav";
import { OperationsDashboard } from "../components/OperationsDashboard";
import { UserRoute } from "../components/ProtectedRoute";
import styles from "./operations.module.css";

export default function OperationsPage() {
  return (
    <UserRoute>
      <AppNav />
      <main className={styles.page}>
        <OperationsDashboard />
      </main>
    </UserRoute>
  );
}
