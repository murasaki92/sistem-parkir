"use client";

import Link from "next/link";
import { useRouter } from "next/router";
import { LogOut, ParkingSquare, ShieldCheck, UserRound } from "lucide-react";
import { useAuth } from "../helpers/useAuth";
import { Badge } from "./Badge";
import { Button } from "./Button";
import styles from "./AppNav.module.css";

const roleLabels: Record<string, string> = {
  admin: "Admin",
  supervisor: "Supervisor",
  cashier: "Kasir",
  operator: "Operator",
  viewer: "Viewer",
};

export function AppNav() {
  const router = useRouter();
  const { authState, logout } = useAuth();

  if (authState.type !== "authenticated") return null;
  const user = authState.user;
  const canAdmin = user.role === "admin" || user.role === "supervisor";
  const initials = user.displayName
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <nav className={styles.nav} data-print-hidden>
      <div className={styles.inner}>
        <Link href="/cashier" className={styles.brand}>
          <span className={styles.mark}>
            <ParkingSquare size={19} />
          </span>
          <span>
            <strong>PARKLINE</strong>
            <small>parking operations</small>
          </span>
        </Link>

        <div className={styles.links}>
          <Link
            href="/cashier"
            className={`${styles.link} ${
              router.pathname === "/cashier" ? styles.active : ""
            }`}
          >
            Kasir
          </Link>
          {canAdmin && (
            <Link
              href="/admin"
              className={`${styles.link} ${
                router.pathname === "/admin" ? styles.active : ""
              }`}
            >
              Admin
            </Link>
          )}
        </div>

        <div className={styles.account}>
          <span className={styles.avatar}>{initials || <UserRound size={15} />}</span>
          <span className={styles.identity}>
            <strong>{user.displayName}</strong>
            <small>{roleLabels[user.role] || user.role}</small>
          </span>
          <Badge variant={canAdmin ? "success" : "secondary"} className={styles.session}>
            <ShieldCheck size={11} />{" "}
            {user.role === "cashier" ? "PETUGAS" : roleLabels[user.role]?.toUpperCase() || user.role.toUpperCase()}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            title="Keluar dari akun"
          >
            <LogOut size={14} />
            <span className={styles.logoutLabel}>Keluar</span>
          </Button>
        </div>
      </div>
    </nav>
  );
}
