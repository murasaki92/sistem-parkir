import React, { useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../helpers/useAuth";
import { User } from "../helpers/User";
import { AuthErrorPage } from "./AuthErrorPage";
import { ShieldOff } from "lucide-react";
import { AuthLoadingState } from "./AuthLoadingState";
import styles from "./ProtectedRoute.module.css";

const MakeProtectedRoute: (
  roles: User["role"][],
) => React.FC<{ children: React.ReactNode }> =
  (roles) =>
  ({ children }) => {
    const { authState } = useAuth();
    const router = useRouter();

    useEffect(() => {
      if (authState.type === "unauthenticated") {
        router.replace("/login");
      }
    }, [authState.type, router]);

    if (authState.type === "loading") {
      return <AuthLoadingState title="Memeriksa sesi..." />;
    }

    if (authState.type === "unauthenticated") {
      return <AuthLoadingState title="Mengalihkan ke halaman login..." />;
    }

    if (!roles.includes(authState.user.role)) {
      return (
        <AuthErrorPage
          title="Akses ditolak"
          message={`Akun Anda (${authState.user.role}) tidak memiliki izin untuk halaman ini.`}
          icon={<ShieldOff className={styles.accessDeniedIcon} size={64} />}
        />
      );
    }

    return <>{children}</>;
  };

export const AdminRoute = MakeProtectedRoute(["admin", "supervisor"]);
export const UserRoute = MakeProtectedRoute([
  "supervisor",
  "admin",
  "cashier",
  "operator",
  "viewer",
]);
export const CashierRoute = MakeProtectedRoute([
  "supervisor",
  "admin",
  "cashier",
]);
