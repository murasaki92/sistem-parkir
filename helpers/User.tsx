export interface User {
  id: number;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  role: "supervisor" | "admin" | "cashier" | "operator" | "viewer";
}
