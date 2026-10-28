"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { KeyRound, Pencil, Plus, Power, UserCog } from "lucide-react";
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
import { useAuth } from "../helpers/useAuth";
import styles from "./EmployeeManagement.module.css";

type Employee = {
  id: number;
  email: string;
  displayName: string;
  role: string;
  status: string;
  createdAt: string;
  isSelf: boolean;
};

const roleLabels: Record<string, string> = {
  admin: "Admin",
  supervisor: "Supervisor",
  cashier: "Kasir",
  operator: "Operator",
  viewer: "Viewer",
};

const roleDescriptions: Record<string, string> = {
  admin: "Akses penuh, termasuk karyawan dan backup.",
  supervisor: "Operasional, override, laporan, membership.",
  cashier: "Terminal kasir dan shift.",
  operator: "Akses operasional terbatas.",
  viewer: "Hanya melihat data.",
};

const emptyForm = {
  displayName: "",
  email: "",
  role: "cashier",
  password: "",
};

export function EmployeeManagement() {
  const { authState } = useAuth();
  const router = useRouter();
  const currentUser = authState.type === "authenticated" ? authState.user : null;
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<"create" | "edit" | "password" | null>(
    null,
  );
  const [selected, setSelected] = useState<Employee | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [password, setPassword] = useState("");
  const [search, setSearch] = useState("");

  const load = async () => {
    try {
      const response = await fetch("/api/parking/employees");
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Gagal memuat karyawan");
      setEmployees(Array.isArray(body) ? body : []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat karyawan");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const post = async (body: Record<string, unknown>) => {
    const response = await fetch("/api/parking/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Operasi karyawan gagal");
    return data;
  };

  const openCreate = () => {
    setForm(emptyForm);
    setError("");
    setMessage("");
    setDialog("create");
  };

  const openEdit = (employee: Employee) => {
    setSelected(employee);
    setForm({
      displayName: employee.displayName,
      email: employee.email,
      role: employee.role,
      password: "",
    });
    setError("");
    setMessage("");
    setDialog("edit");
  };

  const openPassword = (employee: Employee) => {
    setSelected(employee);
    setPassword("");
    setError("");
    setMessage("");
    setDialog("password");
  };

  const create = async () => {
    setBusy(true);
    setError("");
    try {
      await post({ action: "create", ...form });
      setMessage(`Karyawan ${form.displayName} berhasil ditambahkan.`);
      setDialog(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menambah karyawan");
    } finally {
      setBusy(false);
    }
  };

  const update = async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await post({
        action: "update",
        userId: selected.id,
        displayName: form.displayName,
        email: form.email,
        role: form.role,
      });
      setMessage(`Data ${form.displayName} diperbarui.`);
      setDialog(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memperbarui karyawan");
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const result = await post({
        action: "resetPassword",
        userId: selected.id,
        password,
      });
      setDialog(null);
      if (result.signedOut) {
        setMessage("Password Anda diubah. Silakan login ulang.");
        router.replace("/login");
        return;
      }
      setMessage(`Password ${selected.displayName} berhasil direset.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal reset password");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (employee: Employee) => {
    const nextStatus = employee.status === "active" ? "inactive" : "active";
    if (
      nextStatus === "inactive" &&
      !window.confirm(
        `Nonaktifkan ${employee.displayName}? Semua sesi login karyawan ini akan dicabut.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await post({
        action: "setStatus",
        userId: employee.id,
        status: nextStatus,
      });
      setMessage(
        `${employee.displayName} ${
          nextStatus === "active" ? "diaktifkan" : "dinonaktifkan"
        }.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengubah status");
    } finally {
      setBusy(false);
    }
  };

  const activeCount = employees.filter((e) => e.status === "active").length;
  const visible = employees.filter((employee) =>
    `${employee.displayName} ${employee.email} ${employee.role}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );

  return (
    <section className={styles.wrap}>
      <div className={styles.head}>
        <div>
          <h2>Karyawan & Akses</h2>
          <p>
            Tambahkan akun petugas, atur role, reset password, atau cabut akses
            tanpa menghapus riwayat transaksi.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus size={16} /> Tambah karyawan
        </Button>
      </div>

      {message && <div className={styles.success}>{message}</div>}
      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.summary}>
        <span>
          <UserCog size={14} /> <strong>{employees.length}</strong> akun
        </span>
        <span>
          <i className={styles.live} /> <strong>{activeCount}</strong> aktif
        </span>
        <span className={styles.hint}>Password minimal 8 karakter</span>
        <Input
          className={styles.searchInput}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Cari nama, email, role…"
          aria-label="Cari karyawan"
        />
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>KARYAWAN</th>
              <th>ROLE</th>
              <th>STATUS</th>
              <th>DIBUAT</th>
              <th>AKSI</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((employee) => (
              <tr key={employee.id}>
                <td>
                  <strong>{employee.displayName}</strong>
                  <span className={styles.email}>{employee.email}</span>
                </td>
                <td>
                  <Badge variant={employee.role === "admin" ? "success" : "secondary"}>
                    {roleLabels[employee.role] || employee.role}
                  </Badge>
                  {employee.isSelf && <small className={styles.self}>Akun Anda</small>}
                </td>
                <td>
                  <Badge variant={employee.status === "active" ? "success" : "outline"}>
                    {employee.status === "active" ? "AKTIF" : "NONAKTIF"}
                  </Badge>
                </td>
                <td className={styles.date}>
                  {new Date(employee.createdAt).toLocaleDateString("id-ID")}
                </td>
                <td>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      title="Edit karyawan"
                      onClick={() => openEdit(employee)}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      title="Reset password"
                      onClick={() => openPassword(employee)}
                    >
                      <KeyRound size={14} />
                    </button>
                    <button
                      type="button"
                      title={
                        employee.isSelf
                          ? "Tidak dapat menonaktifkan akun sendiri"
                          : employee.status === "active"
                            ? "Nonaktifkan"
                            : "Aktifkan"
                      }
                      onClick={() => toggle(employee)}
                      disabled={employee.isSelf || busy}
                    >
                      <Power size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!visible.length && (
              <tr>
                <td colSpan={5} className={styles.empty}>
                  {search ? "Tidak ada karyawan yang cocok." : "Belum ada karyawan."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className={styles.note}>
        Role menentukan halaman yang bisa dibuka. Admin dapat mengelola
        karyawan, perangkat, membership, laporan, override, dan backup.
        Supervisor tidak dapat mengelola karyawan.
      </p>

      <Dialog
        open={dialog === "create"}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tambah karyawan</DialogTitle>
            <DialogDescription>
              Karyawan dapat langsung login dengan email dan password yang Anda
              buat.
            </DialogDescription>
          </DialogHeader>
          <div className={styles.form}>
            <label>
              Nama lengkap
              <Input
                value={form.displayName}
                onChange={(event) =>
                  setForm({ ...form, displayName: event.target.value })
                }
                placeholder="Contoh: Siti Rahma"
                autoFocus
              />
            </label>
            <label>
              Email login
              <Input
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm({ ...form, email: event.target.value })
                }
                placeholder="siti@parkline.id"
              />
            </label>
            <label>
              Role
              <select
                value={form.role}
                onChange={(event) =>
                  setForm({ ...form, role: event.target.value })
                }
              >
                {Object.entries(roleLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label} — {roleDescriptions[value]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Password awal
              <Input
                type="password"
                value={form.password}
                onChange={(event) =>
                  setForm({ ...form, password: event.target.value })
                }
                placeholder="Minimal 8 karakter"
                autoComplete="new-password"
              />
            </label>
          </div>
          <p className={styles.formHint}>
            Role Kasir hanya dapat membuka terminal kasir. Role Admin memiliki
            akses penuh.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Batal
            </Button>
            <Button
              onClick={create}
              disabled={
                busy ||
                form.displayName.trim().length < 2 ||
                !form.email.includes("@") ||
                form.password.length < 8
              }
            >
              {busy ? "Menyimpan…" : "Simpan karyawan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialog === "edit"}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {selected?.displayName}</DialogTitle>
            <DialogDescription>
              Perubahan role berlaku pada pengecekan akses berikutnya.
            </DialogDescription>
          </DialogHeader>
          <div className={styles.form}>
            <label>
              Nama lengkap
              <Input
                value={form.displayName}
                onChange={(event) =>
                  setForm({ ...form, displayName: event.target.value })
                }
              />
            </label>
            <label>
              Email login
              <Input
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm({ ...form, email: event.target.value })
                }
              />
            </label>
            <label className={styles.full}>
              Role
              <select
                value={form.role}
                onChange={(event) =>
                  setForm({ ...form, role: event.target.value })
                }
                disabled={selected?.isSelf}
              >
                {Object.entries(roleLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label} — {roleDescriptions[value]}
                  </option>
                ))}
              </select>
              {selected?.isSelf && (
                <small className={styles.formHint}>
                  Role akun sendiri tidak dapat diubah.
                </small>
              )}
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Batal
            </Button>
            <Button
              onClick={update}
              disabled={
                busy ||
                form.displayName.trim().length < 2 ||
                !form.email.includes("@")
              }
            >
              {busy ? "Menyimpan…" : "Simpan perubahan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialog === "password"}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password {selected?.displayName}</DialogTitle>
            <DialogDescription>
              Semua sesi login karyawan ini akan dicabut dan harus login ulang.
            </DialogDescription>
          </DialogHeader>
          <label className={styles.field}>
            Password baru
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Minimal 8 karakter"
              autoComplete="new-password"
              autoFocus
            />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Batal
            </Button>
            <Button
              onClick={resetPassword}
              disabled={busy || password.length < 8}
            >
              {busy ? "Menyimpan…" : "Reset password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
