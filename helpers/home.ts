import type { User } from "./User";

/**
 * Landing page after login. Admin/supervisor go to the control center, cashiers
 * to the terminal, and read-only roles to the operations overview.
 */
export function homePathForRole(role: User["role"]): string {
  if (role === "admin" || role === "supervisor") return "/admin";
  if (role === "cashier") return "/cashier";
  return "/operations";
}
