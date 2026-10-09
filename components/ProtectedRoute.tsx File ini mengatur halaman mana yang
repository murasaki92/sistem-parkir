import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../helpers/useAuth";
import { User } from "../helpers/User";
import { AuthErrorPage } from "./AuthErrorPage";
import { ShieldOff } from "lucide-react";
import { AuthLoadingState } from "./AuthLoadingState";
import styles from "./ProtectedRoute.module.css";

const MakeProtectedRoute: (roles: User["role"][]) => React.FC<{ children: React.ReactNode }> =
  (roles) =>
  ({ children }) => {
    const { authState } = useAuth();
    if (authState.type === "loading") return <AuthLoadingState title="Authenticating" />;
    if (authState.type === "unauthenticated") return <Navigate to="/login" replace />;
    if (!roles.includes(authState.user.role)) {
      return <AuthErrorPage title="Access Denied" message={`Access denied. Your role (${authState.user.role}) lacks required permissions.`} icon={<ShieldOff className={styles.accessDeniedIcon} size={64} />} />;
    }
    return <>{children}</>;
  };

export const AdminRoute = MakeProtectedRoute(["admin", "supervisor"]);
export const UserRoute = MakeProtectedRoute(["supervisor", "admin", "cashier", "operator", "viewer"]);
export const CashierRoute = MakeProtectedRoute(["supervisor", "admin", "cashier"]);
