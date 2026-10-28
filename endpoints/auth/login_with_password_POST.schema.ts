import { z } from "zod";
import type { User } from "../../helpers/User";

export const schema = z.object({
  email: z.string().email("Format email tidak valid"),
  password: z.string().min(1, "Password wajib diisi"),
});

export type LoginInput = z.infer<typeof schema>;

export async function postLogin(data: LoginInput): Promise<{ user: User }> {
  const response = await fetch("/api/auth/login_with_password_POST", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const body = (await response.json()) as { user?: User; error?: string };
  if (!response.ok || !body.user) {
    throw new Error(body.error || "Login gagal. Silakan coba lagi.");
  }
  return { user: body.user };
}
