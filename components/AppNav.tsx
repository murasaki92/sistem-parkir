"use client";

import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import {
  KeyRound,
  LogOut,
  ParkingSquare,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useAuth } from "../helpers/useAuth";
import { homePathForRole } from "../helpers/home";
import { Badge } from "./Badge";
import { Button } from "./Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./Dialog";
import { Input } from "./Input";
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
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

  if (authState.type !== "authenticated") return null;
  const user = authState.user;
  const canAdmin = user.role === "admin" || user.role === "supervisor";
  const canCashier =
    user.role === "admin" || user.role === "supervisor" || user.role === "cashier";
  const homePath = homePathForRole(user.role);
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

  const openPassword = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordError("");
    setPasswordSuccess("");
    setPasswordOpen(true);
  };

  const submitPassword = async () => {
    setPasswordError("");
    setPasswordSuccess("");
    if (newPassword.length < 8) {
      setPasswordError("Password baru minimal 8 karakter.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Konfirmasi password tidak sama.");
      return;
    }
    setPasswordBusy(true);
    try {
      const response = await fetch("/api/auth/change_password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || "Gagal mengubah password.");
      }
      setPasswordSuccess("Password berhasil diubah.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      setPasswordError(
        error instanceof Error ? error.message : "Gagal mengubah password.",
      );
    } finally {
      setPasswordBusy(false);
    }
  };

  return (
    <>
      <nav className={styles.nav} data-print-hidden>
        <div className={styles.inner}>
          <Link href={homePath} className={styles.brand}>
            <span className={styles.mark}>
              <ParkingSquare size={19} />
            </span>
            <span>
              <strong>PARKLINE</strong>
              <small>parking operations</small>
            </span>
          </Link>

          <div className={styles.links}>
            {canCashier && (
              <Link
                href="/cashier"
                className={`${styles.link} ${
                  router.pathname === "/cashier" ? styles.active : ""
                }`}
              >
                Kasir
              </Link>
            )}
            {!canAdmin && !canCashier && (
              <Link
                href="/operations"
                className={`${styles.link} ${
                  router.pathname === "/operations" ? styles.active : ""
                }`}
              >
                Operasional
              </Link>
            )}
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
            <span className={styles.avatar}>
              {initials || <UserRound size={15} />}
            </span>
            <span className={styles.identity}>
              <strong>{user.displayName}</strong>
              <small>{roleLabels[user.role] || user.role}</small>
            </span>
            <Badge
              variant={canAdmin ? "success" : "secondary"}
              className={styles.session}
            >
              <ShieldCheck size={11} />{" "}
              {user.role === "cashier"
                ? "PETUGAS"
                : roleLabels[user.role]?.toUpperCase() || user.role.toUpperCase()}
            </Badge>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={openPassword}
              title="Ubah password"
              aria-label="Ubah password"
            >
              <KeyRound size={14} />
            </Button>
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

      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ubah password</DialogTitle>
            <DialogDescription>
              Gunakan minimal 8 karakter. Setelah berhasil, sesi lain milik akun
              ini akan dicabut.
            </DialogDescription>
          </DialogHeader>
          <div className={styles.passwordForm}>
            <label>
              Password saat ini
              <Input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
                autoFocus
              />
            </label>
            <label>
              Password baru
              <Input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                placeholder="Minimal 8 karakter"
              />
            </label>
            <label>
              Konfirmasi password baru
              <Input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
              />
            </label>
          </div>
          {passwordError && (
            <div className={styles.formError}>{passwordError}</div>
          )}
          {passwordSuccess && (
            <div className={styles.formSuccess}>{passwordSuccess}</div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordOpen(false)}>
              Tutup
            </Button>
            <Button
              onClick={submitPassword}
              disabled={
                passwordBusy ||
                !currentPassword ||
                newPassword.length < 8 ||
                !confirmPassword
              }
            >
              {passwordBusy ? "Menyimpan…" : "Simpan password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
