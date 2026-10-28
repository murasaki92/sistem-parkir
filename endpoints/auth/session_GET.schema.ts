import type { User } from "../../helpers/User";

export type SessionResponse = { user: User } | { error: string };

/**
 * Reads the current session. Returns { error } instead of throwing so the
 * auth provider can render an unauthenticated state.
 */
export async function getSession(): Promise<SessionResponse> {
  if (typeof window === "undefined") {
    return { error: "Session belum tersedia di server." };
  }
  try {
    const response = await fetch("/api/auth/session_GET", {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    const data = (await response.json()) as { user?: User; error?: string };
    if (!response.ok || !data.user) {
      return { error: data.error || "Sesi login tidak valid." };
    }
    return { user: data.user };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Gagal memeriksa sesi.",
    };
  }
}
