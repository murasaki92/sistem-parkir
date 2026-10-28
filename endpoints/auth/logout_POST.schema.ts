export async function postLogout(): Promise<{ ok: true }> {
  try {
    await fetch("/api/auth/logout_POST", {
      method: "POST",
      credentials: "same-origin",
    });
  } catch {
    /* Clearing the client cache still logs the user out locally. */
  }
  return { ok: true };
}
