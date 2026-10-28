import React, { useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../helpers/useAuth";
import { User } from "../helpers/User";
import { AuthErrorPage } from "./AuthErrorPage";
import { ShieldOff } from "lucide-react";
import { AuthLoadingState } from "./AuthLoadingState";
import styles from "./ProtectedRoute.module.css";

type ProtectedRouteProps = {
  roles: User["role"][];
  children: React.ReactNode;
};

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ roles, children }) => {
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

type RouteProps = { children: React.ReactNode };

export const AdminRoute: React.FC<RouteProps> = ({ children }) => (
  <ProtectedRoute roles={["admin", "supervisor"]}>{children}</ProtectedRoute>
);

export const UserRoute: React.FC<RouteProps> = ({ children }) => (
  <ProtectedRoute
    roles={["supervisor", "admin", "cashier", "operator", "viewer"]}
  >
    {children}
  </ProtectedRoute>
);

export const CashierRoute: React.FC<RouteProps> = ({ children }) => (
  <ProtectedRoute roles={["supervisor", "admin", "cashier"]}>
    {children}
  </ProtectedRoute>
);
